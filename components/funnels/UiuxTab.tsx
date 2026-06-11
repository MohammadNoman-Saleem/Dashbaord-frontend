"use client";

// Funnels, UI/UX tab (spec 02 section 8.3): dead clicks by component with a
// Call column (Fix queued, Leave, Watch) and the frustration signals list.
// Neither feed is instrumented in Mixpanel yet, so both panels usually show
// the warm empty sentence carrying the authored reason from meta.

import type { UseQueryResult } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";

import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ListRow } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FunnelUiuxData } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";

type DeadClickRow = FunnelUiuxData["dead_clicks"][number];

const CALL_VARIANT: Record<DeadClickRow["call"], ChipVariant> = {
  "Fix queued": "warn",
  Watch: "info",
  Leave: "mut",
};

const COLUMNS: DataTableColumn<DeadClickRow>[] = [
  {
    key: "component",
    label: "Component",
    render: (row) => <b className="font-semibold text-title">{row.component}</b>,
  },
  { key: "count", label: "Clicks, 14d", numeric: true },
  {
    key: "call",
    label: "Call",
    numeric: true,
    render: (row) => <Chip variant={CALL_VARIANT[row.call]}>{row.call}</Chip>,
  },
];

const TABLE_SKELETON = (
  <div className="flex flex-col gap-[10px] py-2">
    {Array.from({ length: 4 }, (_, i) => (
      <Skeleton key={i} height={16} />
    ))}
  </div>
);

const LIST_SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    {Array.from({ length: 2 }, (_, i) => (
      <Skeleton key={i} height={38} />
    ))}
  </div>
);

export function UiuxTab({ query }: { query: UseQueryResult<Envelope<FunnelUiuxData>> }) {
  const meta = query.data?.meta;
  const deadClicksReason =
    meta?.reasons.find((r) => r.key === "dead_clicks_not_instrumented" || r.key === "no_component_breakdown")
      ?.text ?? "Dead clicks land here once the event is instrumented in Mixpanel.";

  return (
    <Grid>
      <div className={spans.c7} data-focus-id="funnels-dead-clicks">
        <Card>
          <CardHeader title="Dead clicks by component" subtitle="Places people click and nothing happens." />
          <div className="px-[18px] pb-2 pt-2">
            <QueryPanel
              query={query}
              skeleton={TABLE_SKELETON}
              isEmpty={(d) => d.dead_clicks.length === 0}
              emptyCopy={deadClicksReason}
            >
              {(d) => <DataTable columns={COLUMNS} rows={d.dead_clicks} rowKey={(row) => row.component} />}
            </QueryPanel>
          </div>
          <CardFooter note="This tab exists to answer one question: does the component need fixing." />
        </Card>
      </div>

      <div className={spans.c5} data-focus-id="funnels-frustration">
        <Card>
          <CardHeader title="Frustration signals" subtitle="Rapid repeat clicks on one element." />
          <div className="px-[18px] pb-4 pt-2">
            <QueryPanel
              query={query}
              skeleton={LIST_SKELETON}
              isEmpty={(d) => d.frustration.length === 0}
              emptyCopy={
                meta?.reasons[0]?.text ??
                "Frustration signals land here once rage clicks are instrumented in Mixpanel."
              }
            >
              {(d) => (
                <div>
                  {d.frustration.map((row) => (
                    <ListRow
                      key={row.signal}
                      icon={CircleAlert}
                      variant="warn"
                      title={row.signal}
                      subtitle={row.detail}
                    />
                  ))}
                </div>
              )}
            </QueryPanel>
          </div>
        </Card>
      </div>
    </Grid>
  );
}
