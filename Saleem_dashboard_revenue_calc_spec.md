# Saleem Dashboard: Consultation Gross and Net Revenue

Calculation method and Claude Code task. This document explains how to get to the numbers. The real monthly figures and the verified targets are deliberately not in here; they are held separately and used to check the result.

## Context and goal

The dashboard computes gross and net consultation revenue from Zoho CRM Appointment_Bookings. The current output is wrong in two independent ways:

1. Gross is too low. The completed-status filter is wrong, so some completed consults are left out.
2. Net is too high. Novo consults are being scored as standard, because the Type field is free text and the match is incomplete.

Fix both, and add tests so the numbers cannot silently drift again.

How to validate: this document has a self-contained worked example and a unit-test fixture with illustrative numbers. Once the logic passes those, run it on the live data and check the monthly totals against the known-good figures held separately. Do not put those figures in code or in this document.

## Data source

- Module: Appointment_Bookings (Zoho CRM).
- Fields used: Status (picklist), Rate (number, BHD, the fee the patient paid), Doctor (lookup id), Type (identifies the product track; free text and inconsistent).
- Reserved words: in COQL, `From` and `Type` are reserved and fail inside a SELECT. Read Type through the Records API (GET records with a fields list), or resolve the exact field API name via getFields first. Do not assume `SELECT Type` works in COQL.
- Query hygiene: filter by Created_Time within the month, ISO 8601 with the +03:00 Bahrain offset. Do not put a Status condition in the COQL WHERE (it throws a parse error); fetch the month and filter Status in code. Paginate at 200 rows and follow the more_records flag.

## Completed basis (this drives gross)

A consult is completed when the call happened and the fee was deducted:

- Completed if Status is `Awaiting Review` or `Done`.
- `Awaiting Review` means the call finished and the doctor is still filing notes and the prescription. The fee is already deducted, so it counts.
- Exclude everything else: `Pending Payment`, `Pending`, `Confirmed` (fee only on hold), `Session Ended`, `Cancelled`.

If the filter is narrower than this, gross comes out low. The diagnostic shows exactly which statuses are being dropped.

## Gross

`gross = sum(Rate)` over completed rows. Novo consults count in gross at their full Rate, like any other consult. The track affects net only, never gross.

## Net (Saleem's cut)

Per completed consult, apply one rule, then sum:

- Novo (obesity) track: flat amount to Saleem (config: `novo_flat_net_bhd`), whatever the Rate.
- Standard consult: `net = service_charge + commission_rate * (Rate - service_charge)`.
  - `service_charge` is a constant (config). Service_Charge is hidden in Zoho and cannot be read, so it is not taken from the row.
  - `commission_rate` is the per-doctor negotiated rate (config), around 15% but not uniform; some doctors are lower, for example 10%.

Round each consult's net to 2 decimals, then sum.

If some Novo consults are not matched as Novo, they get scored as standard, and a standard consult nets more than the flat Novo amount, so net comes out high. The classification below is the fix.

### Novo classification from Type

- Normalize Type first: trim, collapse internal spaces, lowercase.
- A consult is Novo if its normalized Type is in the Novo set (config). Everything else is standard.
- The diagnostic prints the actual distinct Type values so the set can be completed. Do not hardcode a single spelling; the field has several.

## Worked example (illustrative numbers, not a real month)

A fixture month with these rows:

| Doctor | Rate | Type (normalized) | Status |
| --- | --- | --- | --- |
| A | 30 | standard | Done |
| A | 30 | standard | Awaiting Review |
| B | 20 | standard | Done |
| C | 40 | obesity | Done |
| C | 40 | obesity | Awaiting Review |
| A | 30 | standard | Cancelled |
| B | 20 | standard | Confirmed |

Config for this example: service_charge 5, novo_flat_net 3, default commission 0.15, doctor B commission 0.10, Novo set includes "obesity".

- Completed rows: the five with Status Done or Awaiting Review. The Cancelled and Confirmed rows are excluded.
- Gross = 30 + 30 + 20 + 40 + 40 = 160. The two Novo consults count at their full Rate.
- Net, per consult:
  - A, 30, standard, 0.15: 5 + 0.15 x (30 - 5) = 8.75
  - A, 30, standard, 0.15: 8.75
  - B, 20, standard, 0.10: 5 + 0.10 x (20 - 5) = 6.5
  - C, 40, Novo: 3
  - C, 40, Novo: 3
- Net = 8.75 + 8.75 + 6.5 + 3 + 3 = 30.0

So this fixture returns gross 160 and net 30. These are illustrative. Use them as the unit test, not as any real month.

## Config (example; replace ids and rates with the real values)

```json
{
  "completed_statuses": ["Awaiting Review", "Done"],
  "service_charge_bhd": 5.0,
  "novo_flat_net_bhd": 3.0,
  "default_commission_rate": 0.15,
  "commission_rate_by_doctor": {
    "<doctor_id_example_1>": 0.15,
    "<doctor_id_example_2>": 0.10
  },
  "novo_type_values": ["novo", "novo nordisk", "obesity", "obesity awareness"]
}
```

A doctor can have both Novo and standard consults, so classify per consult from Type, never per doctor. Add a commission rate for every doctor who takes standard consults; a doctor who only ever does Novo does not need one, since Novo is the flat amount.

## Step 1: reconciliation diagnostic (run before writing the module)

For each recent month, pull Appointment_Bookings and print:

1. Every Status value present, with row count and sum(Rate).
2. Every distinct Type value (raw and normalized), with row count.
3. For completed rows only: a table of Doctor, Rate, Type (raw and normalized), classified track, commission used, per-row net.
4. Totals: completed count, gross, net.

Print these so they can be checked against the known-good figures held separately. The per-status Rate sums explain any gross gap; the per-row track and net explain any net gap. Do not change the rules to force a match; if a month will not reconcile, surface the rows that differ.

## Step 2: implement

- TypeScript, server side, in the Next.js 14 dashboard, replacing the current gross and net computation on the get_financials path.
- Split fetch from compute. Pure function: `computeRevenue(rows, config, range) -> { gross, net, byDoctor, byTrack, rows }`, unit-testable without hitting Zoho.
- Money to 2 decimals. BHD internally; show USD in brackets only on large roll-ups.
- No patient identifiers in logs or output. Doctor id and name are fine.

## Step 3: tests

- Unit test on the illustrative fixture above: assert gross 160 and net 30 exactly.
- Add a second fixture that includes an excluded status and a doctor on the default rate, to lock the status filter and the default-commission path.
- Reconciliation: after the unit tests pass, run computeRevenue on live data for recent months and compare the totals to the verified figures held separately. Those figures are kept out of the code by design. Decide a tolerance (exact is the goal) and a rounding rule (see open items).

## Open items to confirm

1. Per-doctor commission rates for every doctor who takes standard consults.
2. The full set of Type values that mean Novo (from the diagnostic).
3. Whether Session Ended should ever count as completed (default: no).
4. Rounding rule for standard net: round to 2 decimals, or to the nearest 0.5. It can shift a month by a fraction.

Once Type and Service_Charge are exposed to the integration profile (the Q3 recommendation), the Novo value set and the service charge can be read per booking instead of held in config, and the classification stops being a manual call.
