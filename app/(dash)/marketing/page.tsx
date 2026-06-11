"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { ListRow } from "@/components/ui/ListRow";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MarketingData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtBHD } from "@/lib/format/bhd";
import { TITLES } from "@/config/titles";

/* Marketing (spec 02 section 8.4): four tiles, the channels table, and this
   week's moves. Tiles without a wired source (the Meta connector is still
   pending) come back null and render the muted not-connected treatment with
   a mut dot, never a zero pretending to be data. The channels footer note
   comes from the authored meta_connector_pending reason on meta. */

type ChannelRow = MarketingData["channels"][number];

const CHANNEL_COLUMNS: DataTableColumn<ChannelRow>[] = [
  {
    key: "channel",
    label: "Channel",
    render: (row) => {
      const [head, ...rest] = row.channel.split(" · ");
      return (
        <span>
          <b className="font-semibold text-title">{head}</b>
          {rest.length > 0 ? <span className="text-ink-2"> · {rest.join(" · ")}</span> : null}
        </span>
      );
    },
  },
  { key: "leads", label: "Leads", numeric: true },
  {
    key: "spend_bhd",
    label: "Spend",
    numeric: true,
    render: (row) =>
      row.spend_bhd === null ? (
        <span className="font-sans text-xs text-ink-3">Not tracked yet</span>
      ) : (
        fmtBHD(row.spend_bhd)
      ),
  },
  { key: "cpl_display", label: "Cost per lead", numeric: true },
  {
    key: "read",
    label: "Read",
    numeric: true,
    render: (row) => <span className="font-sans text-xs text-ink-2">{row.read}</span>,
  },
];

function monthName(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "this month";
  return d.toLocaleDateString("en-US", { month: "long" });
}

const PAGE_SKELETON = (
  <Grid>
    {Array.from({ length: 4 }, (_, i) => (
      <Card key={i} className={`${spans.c3} flex min-h-[122px] flex-col gap-2 px-[17px] py-[15px]`}>
        <Skeleton height={12} width={110} />
        <Skeleton height={28} width={80} />
        <Skeleton height={12} />
      </Card>
    ))}
    <Card className={`${spans.c7} px-[18px] py-[15px]`}>
      <Skeleton height={14} width={170} className="mb-3" />
      <div className="flex flex-col gap-[10px]">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={16} />
        ))}
      </div>
    </Card>
    <Card className={`${spans.c5} px-[18px] py-[15px]`}>
      <Skeleton height={14} width={140} className="mb-3" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={38} />
        ))}
      </div>
    </Card>
  </Grid>
);

function MarketingContent() {
  useFocusFlash();
  const title = TITLES.marketing;
  const query = useQuery({
    queryKey: qk.marketing(),
    queryFn: () => fetchEnvelope<MarketingData>("marketing", "/marketing"),
  });

  return (
    <>
      <div className="mb-4 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
        <p className="text-[13.5px] text-ink-2">{title.sub}</p>
      </div>
      <QueryPanel query={query} skeleton={PAGE_SKELETON}>
        {(data, meta) => {
          const month = monthName(meta.updated_at);
          const connector = meta.reasons.find((r) => r.key === "meta_connector_pending");
          const connectorNote =
            connector?.text ?? "Spend detail connects with the Meta connector.";
          const connectorTitle = connector?.title ?? "Waits on the Meta connector";
          const { leads, cpl, whatsapp_reply_pct: whatsapp, ig_reach: ig } = data.tiles;
          return (
            <Grid>
              <KpiCard
                className={spans.c3}
                label={`Leads, ${month}`}
                value={leads.value.toLocaleString()}
                suffix={leads.target !== null ? `of ${leads.target.toLocaleString()}` : undefined}
                bar={
                  leads.target !== null && leads.target > 0
                    ? { value: (leads.value / leads.target) * 100 }
                    : undefined
                }
                note={
                  leads.target !== null
                    ? "Logged in the CRM. Clicks are not leads."
                    : "No target set for this month."
                }
                dot={leads.target !== null ? "good" : "mut"}
              />
              {cpl === null ? (
                <KpiCard
                  className={spans.c3}
                  label="Cost per lead"
                  value={<PendingValue>Not connected yet</PendingValue>}
                  note={connectorTitle}
                  dot="mut"
                />
              ) : (
                <KpiCard
                  className={spans.c3}
                  label="Cost per lead"
                  value={`BHD ${cpl.value_bhd.toFixed(1)}`}
                  note={
                    cpl.value_bhd <= cpl.cap_bhd
                      ? `Under the ${cpl.cap_bhd.toFixed(1)} cap`
                      : `Over the ${cpl.cap_bhd.toFixed(1)} cap`
                  }
                  dot={cpl.value_bhd <= cpl.cap_bhd ? "good" : "warn"}
                />
              )}
              {whatsapp === null ? (
                <KpiCard
                  className={spans.c3}
                  label="WhatsApp reply rate"
                  value={<PendingValue>Not connected yet</PendingValue>}
                  note={connectorTitle}
                  dot="mut"
                />
              ) : (
                <KpiCard
                  className={spans.c3}
                  label="WhatsApp reply rate"
                  value={`${whatsapp.value}%`}
                  note={`Target ${whatsapp.target}%, opted-in only`}
                  dot={whatsapp.value >= whatsapp.target ? "good" : "warn"}
                />
              )}
              {ig === null ? (
                <KpiCard
                  className={spans.c3}
                  label="Instagram reach"
                  value={<PendingValue>Not connected yet</PendingValue>}
                  note={connectorTitle}
                  dot="mut"
                />
              ) : (
                <KpiCard
                  className={spans.c3}
                  label="Instagram reach"
                  value={ig.value.toLocaleString()}
                  spark={ig.spark}
                  note="From the connected account"
                  dot="good"
                />
              )}

              <div className={spans.c7} data-focus-id="marketing-channels">
                <Card>
                  <CardHeader
                    title={`Channels, ${month}`}
                    subtitle="Leads are people logged in the CRM. Clicks are not leads."
                  />
                  <div className="px-[18px] pb-2 pt-2">
                    {data.channels.length === 0 ? (
                      <p className="py-2 pb-4 text-[13px] text-ink-2">
                        No channel leads logged yet this month.
                      </p>
                    ) : (
                      <DataTable
                        columns={CHANNEL_COLUMNS}
                        rows={data.channels}
                        rowKey={(row) => row.channel}
                      />
                    )}
                  </div>
                  <CardFooter note={connectorNote} />
                </Card>
              </div>

              <div className={spans.c5} data-focus-id="marketing-moves">
                <Card>
                  <CardHeader title="This week's moves" />
                  <div className="px-[18px] pb-4 pt-2">
                    {data.moves.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">
                        Moves land here once a source exists.
                      </p>
                    ) : (
                      <div>
                        {data.moves.map((move) => (
                          <ListRow
                            key={move.title}
                            icon={Megaphone}
                            title={move.title}
                            subtitle={move.text}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </Grid>
          );
        }}
      </QueryPanel>
    </>
  );
}

export default function MarketingPage() {
  return (
    <Suspense fallback={null}>
      <MarketingContent />
    </Suspense>
  );
}
