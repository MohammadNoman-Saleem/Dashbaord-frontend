# Provider board: open viewing and adding to everyone - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every signed-in person view the provider board and add a patient to a hospital column by Zoho reference, while patient names and the name/phone search stay name-seer gated.

**Architecture:** Reopen the board (page, GET route, delete/hospital routes, nav) to all, reproducing the provider-board half of commit 59f2ca9. Then open the add-referral write to all: drop the name-seer gate on the POST, make `record_kind` optional, and resolve the entered reference to a record and kind server-side. Non-name-seers get a new add-by-reference modal; name-seers keep the search modal.

**Tech Stack:** Next.js App Router, TypeScript, React, TanStack Query, zod, Postgres (pg), cached Zoho reads.

## Global Constraints

- No em dashes and no en dashes anywhere, including comments and commit messages (CI enforced).
- No red hex or red-dominant rgb; color literals only in `styles/tokens.css` (CI enforced).
- No hype words (CI enforced).
- UI copy: sentence case, plain verbs, severity in words not color.
- `patient_name` may be referenced only by `components/ui/PatientRef.tsx` (CI enforced).
- Response types hand-written in `lib/api/contract.ts` must match the routes (review enforced).
- Run `npm run ci` before committing. This repo has no unit-test runner; CI is the check scripts plus tsc plus eslint.

---

### Task 1: Reopen the board and nav to every signed-in viewer

**Files:**
- Modify: `app/(dash)/provider-board/page.tsx`
- Modify: `app/api/provider-board/route.ts` (GET only in this task)
- Modify: `app/api/provider-board/[id]/route.ts`
- Modify: `app/api/provider-board/hospital/route.ts`
- Modify: `components/shell/Sidebar.tsx`

**Interfaces:**
- Consumes: `useViewer` from `@/lib/viewer` (already used by the page and sidebar).
- Produces: the board page, GET, delete, and custom-hospital routes readable/writable by any signed-in person; the "Provider board" nav item visible to all.

- [ ] **Step 1: page.tsx renders the board for everyone**

Replace the whole file with:

```tsx
"use client";

import { Grid, spans } from "@/components/shell/Grid";
import { ProviderBoard } from "@/components/provider-board/ProviderBoard";

/* The provider board page: a hospital-by-hospital view of which patients have
   been sent to which hospitals and how long each has been waiting. Open to every
   signed-in viewer; patient names are gated per-field server-side, so
   non-name-seers see anonymized references (initials plus the Zoho id). Adding a
   patient by the name search stays with name-seers; everyone else adds by the
   Zoho reference shown on a card or in the case file. */

export default function ProviderBoardPage() {
  return (
    <Grid>
      <div className={spans.c12}>
        <ProviderBoard />
      </div>
    </Grid>
  );
}
```

- [ ] **Step 2: GET route drops the name-seer gate**

In `app/api/provider-board/route.ts`, change the GET so it no longer calls `assertNameSeer`. (The POST and the `assertNameSeer` helper are handled in Task 2; leave them for now.)

```ts
export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  // Reading the board is open to every signed-in viewer; patient names are gated
  // per-field in the service and the global sweep strips them as a backstop.
  return withMeta(await getProviderBoardService().getBoard(viewer));
});
```

- [ ] **Step 3: delete route drops the name-seer gate**

Replace `app/api/provider-board/[id]/route.ts` header comment and remove the `viewerMustNotSeePii` import, the `assertNameSeer` helper, and its call:

```ts
// DELETE /api/provider-board/:id -> remove a patient card from a hospital column
// (a soft delete; the same patient can be re-added later). Person-only and open
// to every signed-in viewer, since removing a card by its id touches no patient
// identity; the id is validated as a UUID and the removal is audited (id only,
// no patient data).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getProviderBoardService } from '@/lib/server/services/provider-board';
import type { RequestViewer } from '@/lib/server/auth/viewer';
```

Keep `assertPerson` (it still uses `ForbiddenError`). Remove the `assertNameSeer(viewer)` call in DELETE.

- [ ] **Step 4: custom-hospital route drops the name-seer gate**

Apply the same edit to `app/api/provider-board/hospital/route.ts`: header comment says "Person-only and open to every signed-in viewer, since a hospital name and country carry no patient identity", remove the `viewerMustNotSeePii` import, the `assertNameSeer` helper, and its call in POST. Keep `assertPerson`.

- [ ] **Step 5: Sidebar shows the provider-board nav to all**

In `components/shell/Sidebar.tsx`, remove the now-unused `seesNames` variable (its comment and the `const seesNames = ...` line), and render the provider-board nav item unconditionally:

```tsx
        {WORKSPACE_NAV.map((entry) => (
          <NavItem key={entry.href} {...entry} collapsed={rail} onNavigate={onCloseMobile} />
        ))}
        <NavItem
          href="/provider-board"
          label="Provider board"
          icon={Building2}
          collapsed={rail}
          onNavigate={onCloseMobile}
        />
        {navLabel("Manage")}
```

Leave the `/financials` nav item exactly as it is (out of scope).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run ci`
Expected: passes (no unused-var error for `viewerMustNotSeePii` or `seesNames`).

- [ ] **Step 7: Commit**

```bash
git add "app/(dash)/provider-board/page.tsx" app/api/provider-board/route.ts "app/api/provider-board/[id]/route.ts" app/api/provider-board/hospital/route.ts components/shell/Sidebar.tsx
git commit -m "Open the provider board to every signed-in viewer"
```

---

### Task 2: Resolve the referral by reference and open the write to all

**Files:**
- Modify: `lib/server/services/provider-board.ts` (`AddReferralInput`, `addReferral`, new `resolveRecord`)
- Modify: `app/api/provider-board/route.ts` (POST, schema, `assertNameSeer` removal)

**Interfaces:**
- Consumes: `getCrmRead().deals()` and `.leads()`, whose records carry `id` and `Zoho_ID` (see `toCard`).
- Produces: `addReferral(viewer, { hospital_id, zoho_id, record_kind? })` returning `{ id: string; record_kind: 'lead' | 'deal'; zoho_id: string }`. The POST accepts `{ hospital_id, zoho_id, record_kind? }`.

- [ ] **Step 1: Make `record_kind` optional on the input type**

In `lib/server/services/provider-board.ts`:

```ts
export interface AddReferralInput {
  hospital_id: string;
  /** Optional. When omitted (add-by-reference), the kind is auto-detected. */
  record_kind?: 'lead' | 'deal';
  /** Either the internal record id or the human Zoho_ID reference. */
  zoho_id: string;
}
```

- [ ] **Step 2: Add the resolver and rework `addReferral`**

Replace the `addReferral` method body so it resolves the reference first, then validates the hospital, dedups, and inserts using the resolved id and kind. Add a private `resolveRecord` helper below it.

```ts
  /** Add a patient to a hospital column. Resolves the entered reference (an
   *  internal record id or a Zoho_ID) to a record and kind, validates the
   *  hospital, then inserts. A patient can be on many hospitals, but only once
   *  per hospital (the active unique index, plus a pre-check for a friendly
   *  message). Returns the new row id and the resolved kind and id so the route
   *  audits the resolved values, never the raw input. */
  async addReferral(
    viewer: RequestViewer,
    input: AddReferralInput,
  ): Promise<{ id: string; record_kind: 'lead' | 'deal'; zoho_id: string }> {
    const { record_kind, recordId } = await this.resolveRecord(
      input.zoho_id,
      input.record_kind,
    );

    const crm = getCrmRead();
    const hospitalsRead = await crm.hospitals();
    const zohoHospital = hospitalsRead.data.find(
      (h) => h.id === input.hospital_id,
    );
    // The hospital is either a Zoho directory record or a board-only custom one.
    let hospitalName: string;
    if (zohoHospital) {
      hospitalName = (zohoHospital.Name ?? '').trim() || input.hospital_id;
    } else {
      const custom = await this.getActiveCustomHospital(input.hospital_id);
      if (!custom) {
        throw new BadRequestError('That hospital is not in the system.');
      }
      hospitalName = custom.name;
    }

    const existing = await this.pool.query<{ id: string }>(
      `select id from provider_referrals
       where hospital_id = $1 and zoho_id = $2 and removed_at is null`,
      [input.hospital_id, recordId],
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('That patient is already on this hospital column.');
    }

    try {
      const { rows } = await this.pool.query<{ id: string }>(
        `insert into provider_referrals
           (hospital_id, hospital_name, record_kind, zoho_id, added_by)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [input.hospital_id, hospitalName, record_kind, recordId, viewer.key],
      );
      return { id: rows[0].id, record_kind, zoho_id: recordId };
    } catch (err) {
      // The active unique index is the backstop against a concurrent double-add.
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          'That patient is already on this hospital column.',
        );
      }
      throw err;
    }
  }

  /** Resolve a reference (an internal record id or a Zoho_ID) to a record and
   *  kind. With a kind given (the name-seer search flow) it matches inside that
   *  collection. Without a kind (add-by-reference) it auto-detects: an
   *  internal-id match first (deals then leads), then a Zoho_ID match (deals
   *  then leads). Zoho ids are unique across modules, so a reference resolves to
   *  at most one record. */
  private async resolveRecord(
    reference: string,
    kind?: 'lead' | 'deal',
  ): Promise<{ record_kind: 'lead' | 'deal'; recordId: string }> {
    const crm = getCrmRead();
    const ref = reference.trim();

    if (kind === 'deal') {
      const dealsRead = await crm.deals();
      const d = dealsRead.data.find(
        (r) => r.id === ref || (r.Zoho_ID ?? '').trim() === ref,
      );
      if (!d) throw new BadRequestError('That deal was not found in Zoho.');
      return { record_kind: 'deal', recordId: d.id };
    }
    if (kind === 'lead') {
      const leadsRead = await crm.leads();
      const l = leadsRead.data.find(
        (r) => r.id === ref || (r.Zoho_ID ?? '').trim() === ref,
      );
      if (!l) throw new BadRequestError('That lead was not found in Zoho.');
      return { record_kind: 'lead', recordId: l.id };
    }

    const [dealsRead, leadsRead] = await Promise.all([
      crm.deals(),
      crm.leads(),
    ]);
    const dealById = dealsRead.data.find((r) => r.id === ref);
    if (dealById) return { record_kind: 'deal', recordId: dealById.id };
    const leadById = leadsRead.data.find((r) => r.id === ref);
    if (leadById) return { record_kind: 'lead', recordId: leadById.id };
    const dealByRef = dealsRead.data.find(
      (r) => (r.Zoho_ID ?? '').trim() === ref,
    );
    if (dealByRef) return { record_kind: 'deal', recordId: dealByRef.id };
    const leadByRef = leadsRead.data.find(
      (r) => (r.Zoho_ID ?? '').trim() === ref,
    );
    if (leadByRef) return { record_kind: 'lead', recordId: leadByRef.id };
    throw new BadRequestError(
      'That Zoho reference was not found in leads or deals.',
    );
  }
```

- [ ] **Step 3: POST route opens to all and audits resolved values**

In `app/api/provider-board/route.ts`: remove the `assertNameSeer` helper and the `viewerMustNotSeePii` import (GET no longer uses it after Task 1, and POST drops it here). Update the header comment. Make `record_kind` optional in `addSchema`. Keep `assertPerson`. Audit the resolved kind and id.

Header comment:

```ts
// Access: reading and adding are open to every signed-in viewer. Patient names
// are gated per-field in the service (non-name-seers see anonymized references)
// and the global sweep is the backstop. Adding is by a Zoho reference (an
// internal id or a Zoho_ID); the name/phone patient search stays name-seer only.
// Writes are person-only (the MCP service viewer is rejected) and audited with
// ids and kind only, never a patient name.
```

Schema and POST:

```ts
const addSchema = z.object({
  hospital_id: z.string().min(1),
  record_kind: z.enum(['lead', 'deal']).optional(),
  zoho_id: z.string().min(1),
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Pick a hospital and a patient to add.');
  }

  const result = await getProviderBoardService().addReferral(
    viewer,
    parsed.data,
  );
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'provider_board.add',
    entity_type: 'provider_referrals',
    entity_id: result.id,
    after: {
      hospital_id: parsed.data.hospital_id,
      record_kind: result.record_kind,
      zoho_id: result.zoho_id,
    },
  });
  return withMeta(result);
});
```

Also remove the now-unused `viewerMustNotSeePii` import line at the top of the file.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run ci`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add lib/server/services/provider-board.ts app/api/provider-board/route.ts
git commit -m "Add a provider referral by Zoho reference, open to every viewer"
```

---

### Task 3: Add-by-reference modal and board wiring

**Files:**
- Create: `components/provider-board/AddByReferenceModal.tsx`
- Modify: `components/provider-board/ProviderBoard.tsx`

**Interfaces:**
- Consumes: `mutateEnvelope("provider_board", "POST", "/provider-board", { hospital_id, zoho_id })`; `qk.providerBoard()`; `useViewer`.
- Produces: "Add patient" visible to everyone; name-seers open `AddReferralModal`, others open `AddByReferenceModal`.

- [ ] **Step 1: Create the add-by-reference modal**

```tsx
"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/* Add a patient to a hospital column by the Zoho reference shown on a card or in
   the case file, for viewers who do not see patient names (so the name search is
   not available to them). The board finds the matching lead or deal server-side
   and infers the kind. No patient name is ever shown or sent here. */

type HospitalOption = { id: string; name: string };

const ADD_FAILURE =
  "Couldn't add to the board. Try again, or tell Al Saeed if it repeats.";

type AddByReferenceModalProps = {
  open: boolean;
  hospitals: HospitalOption[];
  presetHospitalId: string | null;
  onClose: () => void;
};

export function AddByReferenceModal({
  open,
  hospitals,
  presetHospitalId,
  onClose,
}: AddByReferenceModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [hospitalId, setHospitalId] = useState(presetHospitalId ?? "");
  const [reference, setReference] = useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<{ id: string }>("provider_board", "POST", "/provider-board", {
        hospital_id: hospitalId,
        zoho_id: reference.trim(),
      }),
    onSuccess: () => {
      toast("Added to the hospital.");
      void queryClient.invalidateQueries({ queryKey: qk.providerBoard() });
      onClose();
    },
    onError: (error) =>
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : ADD_FAILURE,
        AlertCircle,
      ),
  });

  const canAdd =
    Boolean(hospitalId) && reference.trim().length > 0 && !addMutation.isPending;

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      aria-label="Add a patient by Zoho reference"
      className="w-[520px]"
    >
      <ModalTitle>Add a patient to a hospital</ModalTitle>
      <ModalText>
        Pick the hospital you sent the patient to, then enter the Zoho reference
        shown on a patient card or in the case file. The board finds the matching
        lead or deal.
      </ModalText>

      <Field label="Hospital" htmlFor="add-ref-hospital">
        <FieldSelect
          id="add-ref-hospital"
          value={hospitalId}
          onChange={(event) => setHospitalId(event.target.value)}
        >
          <option value="">Select a hospital</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field label="Zoho reference" htmlFor="add-ref-reference">
        <FieldInput
          id="add-ref-reference"
          type="text"
          autoComplete="off"
          placeholder="The reference shown on a card"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>

      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => addMutation.mutate()} disabled={!canAdd}>
          Add to board
        </Button>
      </ModalRow>
    </Modal>
  );
}
```

- [ ] **Step 2: Wire the board to show "Add patient" to everyone and branch the modal**

In `components/provider-board/ProviderBoard.tsx`:

1. Add imports:

```tsx
import { AddByReferenceModal } from "@/components/provider-board/AddByReferenceModal";
import { useViewer } from "@/lib/viewer";
```

2. Inside `ProviderBoard`, compute `seesNames`:

```tsx
  const { me } = useViewer();
  const seesNames = me ? Boolean(me.capabilities.sees_patient_names) : false;
```

3. Show the top "Add patient" button unconditionally (no `seesNames` wrapper) and the per-column button unconditionally (remove `canAddPatient` gating; delete the `canAddPatient` prop from `BoardBody` and its usages).

4. Branch the modal on `seesNames`:

```tsx
      {addOpen ? (
        seesNames ? (
          <AddReferralModal
            key={presetHospitalId ?? "any"}
            open
            hospitals={hospitals}
            presetHospitalId={presetHospitalId}
            onClose={() => setAddOpen(false)}
          />
        ) : (
          <AddByReferenceModal
            key={presetHospitalId ?? "any"}
            open
            hospitals={hospitals}
            presetHospitalId={presetHospitalId}
            onClose={() => setAddOpen(false)}
          />
        )
      ) : null}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run ci`
Expected: passes (no unused `canAddPatient`).

- [ ] **Step 4: Commit**

```bash
git add components/provider-board/AddByReferenceModal.tsx components/provider-board/ProviderBoard.tsx
git commit -m "Add the add-by-reference patient flow for non-name-seers"
```

---

### Task 4: Comment refresh, full CI, and end-to-end verification

**Files:**
- Modify: `config/endpoints.ts` (the `provider_board` comment only)

- [ ] **Step 1: Refresh the endpoints comment**

Update the `provider_board` comment block to say the board and its writes are open to every signed-in viewer, patient names are gated per-field, and the name/phone search stays name-seer only.

- [ ] **Step 2: Full CI**

Run: `npm run ci`
Expected: passes.

- [ ] **Step 3: Drive the flow**

Run the app (`npm run dev`) and confirm:
- As a non-name-seer: the board renders (anonymized refs), "Add patient" opens the add-by-reference modal, a valid internal id and a valid Zoho_ID both add a card, a bad reference shows "That Zoho reference was not found in leads or deals.".
- As a name-seer: the search-based add still works.
- `/api/cockpit/search` still returns 403 for a non-name-seer.

- [ ] **Step 4: Commit**

```bash
git add config/endpoints.ts
git commit -m "Refresh the provider_board endpoint comment"
```

## Self-Review

- Spec coverage: reopen (page, GET, delete, hospital, nav) -> Task 1; open write plus reference resolution -> Task 2; add-by-reference modal and board wiring -> Task 3; comment refresh and verification -> Task 4. All spec sections covered.
- Placeholder scan: none; every code step shows the full code.
- Type consistency: `addReferral` returns `{ id, record_kind, zoho_id }` (Task 2) and the route reads `result.record_kind` / `result.zoho_id` (Task 2); the client posts `{ hospital_id, zoho_id }` (Task 3), which the optional-`record_kind` schema accepts.
