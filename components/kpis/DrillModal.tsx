"use client";

// The record list behind an auto metric's number (spec 02 section 8.6).
// Opens from a drillable targets row, fetches GET /api/kpi/drill, and shows
// the underlying records in a DataTable. Rows are reference-only for every
// viewer: who appears as initials, never a name, so the "Who" column carries
// the lock note. The footer states the honest count: the rows may be a
// capped slice, so it names the full total behind the number.

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { KpiDrillData, KpiTargetRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

type DrillRow = Record<string, string | number | null>;

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const SKELETON = (
  <div className="flex flex-col gap-[10px] py-2">
    {Array.from({ length: 6 }, (_, i) => (
      <Skeleton key={i} height={18} />
    ))}
  </div>
);

/* Count footer that stays honest: when the row list is capped below the
   full total, it says how many records the number counts and that the table
   shows the most recent slice. */
function countNote(data: KpiDrillData): string {
  const shown = data.rows.length;
  if (data.total === 0) return "No records sit behind this number for the month.";
  if (shown < data.total) {
    return `Showing the ${shown} most recent of ${data.total.toLocaleString("en-US")} records behind this number.`;
  }
  return `${data.total.toLocaleString("en-US")} ${data.total === 1 ? "record" : "records"} behind this number.`;
}

export function DrillModal({
  row,
  month,
  onClose,
}: {
  row: KpiTargetRow;
  month: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: qk.kpiDrill(row.metric_key, month),
    queryFn: () =>
      fetchEnvelope<KpiDrillData>("kpi_drill", "/kpi/drill", {
        metric_key: row.metric_key,
        month,
      }),
  });

  return (
    <Modal open onClose={onClose} aria-label={`Records behind ${row.label}`} className="w-[640px]">
      <ModalTitle>{row.label}</ModalTitle>
      <ModalText>
        The records behind this number for {monthLabel(month)}. People show as initials only.
      </ModalText>
      <QueryPanel
        query={query}
        skeleton={SKELETON}
        isEmpty={(data) => data.rows.length === 0}
        emptyCopy="No records sit behind this number for the month."
      >
        {(data) => {
          const columns: DataTableColumn<DrillRow>[] = data.columns.map((col) => ({
            key: col.key,
            label: col.label,
            numeric: col.numeric,
            lockNote: col.key === "who" ? "initials only" : undefined,
            render: (record) => {
              const value = record[col.key];
              if (value == null) return "·";
              if (col.numeric && typeof value === "number") {
                return value.toLocaleString("en-US");
              }
              return value;
            },
          }));
          return (
            <>
              <div className="max-h-[52vh] overflow-y-auto">
                <DataTable columns={columns} rows={data.rows} rowKey={(_r, i) => i} />
              </div>
              <p className="mt-[10px] text-xs text-ink-3">
                {countNote(data)}
                {data.summary ? ` ${data.summary}` : ""}
              </p>
            </>
          );
        }}
      </QueryPanel>
      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </ModalRow>
    </Modal>
  );
}
