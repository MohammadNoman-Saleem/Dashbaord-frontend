"use client";

import { AlertTriangle, ArrowRight, Check, Lock } from "lucide-react";

import { MiniBars, type MiniBarRow } from "@/components/charts/MiniBars";
import { spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ListRow } from "@/components/ui/ListRow";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { GrpLabel, Stat, StatRow } from "@/components/ui/Stat";
import type { MedicalTravelLeadsData, MtlActionRow } from "@/lib/api/contract";
import { fmtDate } from "@/lib/format/datetime";
import {
  bhdValue,
  corridorSentence,
  originsCaption,
  pendingPhrase,
  periodLabel,
  readTone,
  specialtiesCaption,
  specialtyLabel,
  statusesCaption,
  STATUS_BAR_LABELS,
  useMedicalTravelLeads,
  usdSuffix,
} from "@/components/mtl/shared";

/* The full medical travel leads card on the Cases view (06 group D1),
   deep-link target mtl-card for the reconciliation pulse blip. Every number
   comes from GET /api/leads/medical-travel; lead references only, never
   names, for any viewer. Null Meta-derived fields render the PendingValue
   treatment with the served reason. */

const READ_ICONS = { warn: AlertTriangle, good: Check, info: ArrowRight } as const;

const ACTION_COLUMNS: DataTableColumn<MtlActionRow>[] = [
  {
    key: "ref",
    label: "Lead",
    render: (row) => <b className="num font-semibold text-title">{row.zoho_ref}</b>,
  },
  { key: "from", label: "From" },
  { key: "destination", label: "Wants to go" },
  { key: "treatment", label: "Treatment sought" },
  {
    key: "status",
    label: "Status",
    numeric: true,
    render: (row) =>
      row.status === "converted" ? (
        <Chip variant="good">
          Converted{row.deal_stage ? `, ${row.deal_stage}` : ""}
        </Chip>
      ) : row.status === "waiting" ? (
        <Chip variant="mut">Waiting their reply</Chip>
      ) : (
        <Chip variant="info">New</Chip>
      ),
  },
];

function bars(
  rows: Array<{ label: string; n: number; status?: MiniBarRow["status"] }>,
): MiniBarRow[] {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return rows.map((r) => ({
    label: r.label,
    value: r.n,
    pct: (r.n / max) * 100,
    status: r.status,
  }));
}

const CAPTION_CLASSES = "mt-[10px] text-xs leading-relaxed text-ink-2";

const SKELETON = (
  <div className="flex flex-col gap-3 py-1">
    <Skeleton height={34} width="70%" />
    <div className="grid grid-cols-3 gap-4 max-[880px]:grid-cols-1">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} height={110} />
      ))}
    </div>
    <Skeleton height={120} />
  </div>
);

function footerNote(data: MedicalTravelLeadsData): string {
  const parts = [
    `Showing the ${data.action_rows.length} that need a move. ${data.statuses.intro_done} more are warm after intro calls, ${data.statuses.not_qualified} set aside as not qualified.`,
  ];
  if (data.origins.some((o) => o.inferred_n > 0)) {
    parts.push("Origins inferred from dialing codes.");
  }
  if (data.reconciliation && data.reconciliation.gap !== 0) {
    parts.push(
      `Meta reports ${data.reconciliation.meta} vs ${data.reconciliation.zoho} in Zoho, gap with Aziz.`,
    );
  }
  return parts.join(" ");
}

export function MtlCard() {
  const query = useMedicalTravelLeads();
  const data = query.data?.data;

  return (
    <Card id="mtl-card">
      <CardHeader
        title={
          data
            ? `Medical travel leads, ${periodLabel(data.period.from, data.period.to)}`
            : "Medical travel leads"
        }
        subtitle={
          data?.period.partial_day
            ? `From the Meta lead campaign, every row matched to a Zoho record. ${fmtDate(data.period.to)} is a partial day.`
            : "From the Meta lead campaign, every row matched to a Zoho record."
        }
        right={
          data ? (
            <Chip variant={data.totals.converted >= 1 ? "good" : "info"}>
              {data.totals.converted} converted to deals
            </Chip>
          ) : undefined
        }
      />
      <div className="px-[18px] pb-4 pt-3">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(d) => d.totals.zoho_leads === 0 && d.action_rows.length === 0}
          emptyCopy="No medical travel leads in this period yet. The card fills as the campaign delivers."
        >
          {(d, meta) => {
            const topSpecialty = d.specialties[0];
            return (
              <>
                <StatRow>
                  <Stat value={d.totals.zoho_leads} label="leads in Zoho" />
                  {d.cpl ? (
                    <Stat
                      value={bhdValue(d.cpl.blended_bhd)}
                      small={usdSuffix(d.cpl.blended_usd)}
                      label="per lead, blended"
                    />
                  ) : (
                    <Stat
                      value={<PendingValue>{pendingPhrase(meta)}</PendingValue>}
                      label="per lead, blended"
                    />
                  )}
                  <Stat value={`${d.totals.outside_bahrain_pct}%`} label="from outside Bahrain" />
                  {topSpecialty ? (
                    <Stat
                      value={topSpecialty.n}
                      small={`of ${d.totals.zoho_leads}`}
                      label={specialtyLabel(topSpecialty.group).toLowerCase()}
                    />
                  ) : null}
                  <Stat value={d.totals.gcc_countries} label="GCC countries" />
                </StatRow>

                <div className="mb-4 grid grid-cols-12 gap-[18px]">
                  <div className={spans.c4}>
                    <GrpLabel>Where they are</GrpLabel>
                    <MiniBars
                      rows={bars(d.origins.map((o) => ({ label: o.country, n: o.n })))}
                    />
                    <p className={CAPTION_CLASSES}>{originsCaption(d)}</p>
                  </div>
                  <div className={spans.c4}>
                    <GrpLabel>Where they want to go</GrpLabel>
                    <MiniBars
                      rows={bars(
                        d.destinations.map((dest) => ({
                          label: dest.group,
                          n: dest.n,
                          status:
                            dest.corridor_status === "live"
                              ? "ahead"
                              : dest.group === "Other"
                                ? "aside"
                                : undefined,
                        })),
                      )}
                    />
                    <p className={CAPTION_CLASSES}>
                      {corridorSentence(d.destinations)} Demand is ahead of corridors.
                    </p>
                  </div>
                  <div className={spans.c4}>
                    <GrpLabel>Treatment sought</GrpLabel>
                    <MiniBars
                      rows={bars(
                        d.specialties.map((s) => ({
                          label: specialtyLabel(s.group),
                          n: s.n,
                          status: s.group === "other" ? "aside" : undefined,
                        })),
                      )}
                    />
                    <p className={CAPTION_CLASSES}>{specialtiesCaption(d)}</p>
                  </div>
                </div>

                <div className="mb-2 grid grid-cols-12 gap-[18px]">
                  <div className={spans.c6}>
                    <GrpLabel>Where each lead stands</GrpLabel>
                    <MiniBars
                      rows={bars(
                        STATUS_BAR_LABELS.map((s) => ({
                          label: s.label,
                          n: d.statuses[s.key],
                          status: s.status,
                        })),
                      )}
                    />
                    <p className={CAPTION_CLASSES}>{statusesCaption(d)}</p>
                  </div>
                  <div className={spans.c6}>
                    <GrpLabel>The read</GrpLabel>
                    {d.reads.length === 0 ? (
                      <p className="py-1 text-[13px] text-ink-2">
                        Nothing needs a call this week.
                      </p>
                    ) : (
                      <div>
                        {d.reads.map((read) => {
                          const tone = readTone(read);
                          return (
                            <ListRow
                              key={read.key}
                              icon={READ_ICONS[tone]}
                              variant={tone}
                              title={read.title}
                              subtitle={read.body}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {d.action_rows.length > 0 ? (
                  <>
                    <GrpLabel className="mt-1">
                      The {d.action_rows.length} that need a move
                    </GrpLabel>
                    <DataTable
                      columns={ACTION_COLUMNS}
                      rows={d.action_rows}
                      rowKey={(row) => row.ref}
                    />
                  </>
                ) : null}
              </>
            );
          }}
        </QueryPanel>
      </div>
      {data && (data.totals.zoho_leads > 0 || data.action_rows.length > 0) ? (
        <CardFooter
          note={footerNote(data)}
          right={
            <span className="flex items-center gap-1.5 text-ink-3">
              <Lock size={11} strokeWidth={1.8} />
              Names held back. Zoho refs only.
            </span>
          }
        />
      ) : null}
    </Card>
  );
}
