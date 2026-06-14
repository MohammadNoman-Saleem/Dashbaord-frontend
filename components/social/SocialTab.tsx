"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Image as ImageIcon, MessageSquare, Send } from "lucide-react";

import { Grid, spans } from "@/components/shell/Grid";
import { MiniBars } from "@/components/charts/MiniBars";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { ListRow, type ListRowVariant } from "@/components/ui/ListRow";
import { PendingValue } from "@/components/ui/PendingValue";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { GrpLabel, Stat, StatRow } from "@/components/ui/Stat";
import type { SocialGa4Data, SocialPlatformsData } from "@/lib/api/contract";
import type { Meta, Reason } from "@/lib/api/envelope";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* Social tab content (the GA4 section plus the per-platform cards), moved
   wholesale from the standalone /social view into the Marketing view's
   Social tab. The page header and the Suspense boundary now live in the
   Marketing page shell; this component owns only the two sections and the
   GA4 period state.

   It is the legacy /social page (GA4 sessions, channels, devices, top
   pages, plus LinkedIn, TikTok, Instagram, and Zoho Social account
   metrics) ported into the new design system, and flagged for Khalid's
   review per the parking-list rule.

   Honesty rules: a platform block the API serves as null renders the muted
   not-connected treatment with the authored reason from meta.reasons (keyed
   by platform prefix), never a zero pretending to be data. */

type Period = SocialGa4Data["period"];

const PERIOD_ITEMS = [
  { key: "7d", label: "7d" },
  { key: "28d", label: "28d" },
  { key: "90d", label: "90d" },
  { key: "mtd", label: "Month" },
];

function changeLabel(change: number | null): string | undefined {
  if (change === null) return undefined;
  return `${change > 0 ? "+" : ""}${change}% vs prev`;
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function findReason(meta: Meta, prefix: string): Reason | undefined {
  return meta.reasons.find((r) => r.key.startsWith(prefix));
}

type PageRow = SocialGa4Data["top_pages"][number];

const PAGE_COLUMNS: DataTableColumn<PageRow>[] = [
  {
    key: "path",
    label: "Page",
    render: (row) => (
      <span>
        <b className="font-semibold text-title">{row.path}</b>
        {row.title ? <span className="text-ink-3"> · {row.title}</span> : null}
      </span>
    ),
  },
  { key: "sessions", label: "Sessions", numeric: true, render: (row) => row.sessions.toLocaleString() },
  { key: "pageviews", label: "Views", numeric: true, render: (row) => row.pageviews.toLocaleString() },
  { key: "avg_duration", label: "Avg time", numeric: true, render: (row) => fmtDuration(row.avg_duration) },
];

const GA4_SKELETON = (
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
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={14} className="mb-2" />
      ))}
    </Card>
    <Card className={`${spans.c5} px-[18px] py-[15px]`}>
      <Skeleton height={14} width={140} className="mb-3" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} height={14} className="mb-2" />
      ))}
    </Card>
  </Grid>
);

const PLATFORMS_SKELETON = (
  <Grid>
    {Array.from({ length: 4 }, (_, i) => (
      <Card key={i} className={`${spans.c6} px-[18px] py-[15px]`}>
        <Skeleton height={14} width={120} className="mb-3" />
        <Skeleton height={26} width={170} className="mb-3" />
        {Array.from({ length: 3 }, (_, j) => (
          <Skeleton key={j} height={14} className="mb-2" />
        ))}
      </Card>
    ))}
  </Grid>
);

/* One sentence of engagement under a post row. */
function engagementLine(parts: Array<[string, number | null]>): string {
  return parts
    .filter(([, v]) => v !== null)
    .map(([label, v]) => `${(v as number).toLocaleString()} ${label}`)
    .join(" · ");
}

function NotConnectedBody({ reason, fallback }: { reason?: Reason; fallback: string }) {
  return (
    <div className="px-[18px] pb-4 pt-2">
      <PendingValue>{reason?.title ?? "Not connected yet"}</PendingValue>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{reason?.text ?? fallback}</p>
    </div>
  );
}

function PostList({
  rows,
}: {
  rows: Array<{ key: string; icon: typeof MessageSquare; variant?: ListRowVariant; title: string; subtitle: string }>;
}) {
  if (rows.length === 0) {
    return <p className="py-2 text-[13px] text-ink-2">No recent posts came back from the API.</p>;
  }
  return (
    <div>
      {rows.map((row) => (
        <ListRow key={row.key} icon={row.icon} variant={row.variant} title={row.title} subtitle={row.subtitle} />
      ))}
    </div>
  );
}

function PlatformCard({
  title,
  subtitle,
  connected,
  children,
}: {
  title: string;
  subtitle: string;
  connected: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={spans.c6}>
      <Card className="h-full">
        <CardHeader
          title={title}
          subtitle={subtitle}
          right={<Chip variant={connected ? "good" : "mut"}>{connected ? "Connected" : "Not connected"}</Chip>}
        />
        {children}
      </Card>
    </div>
  );
}

function Ga4Section({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  const query = useQuery({
    queryKey: qk.socialGa4(period),
    queryFn: () => fetchEnvelope<SocialGa4Data>("social_ga4", "/social/ga4", { period }),
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <GrpLabel className="mb-0">Website · Google Analytics</GrpLabel>
        <Pills
          aria-label="GA4 period"
          items={PERIOD_ITEMS}
          value={period}
          onChange={(key) => setPeriod(key as Period)}
        />
      </div>
      <QueryPanel query={query} skeleton={GA4_SKELETON}>
        {(data) => {
          const { kpi } = data;
          const maxChannel = Math.max(1, ...data.by_channel.map((c) => c.sessions));
          const deviceTotal = Math.max(
            1,
            data.by_device.reduce((sum, d) => sum + d.sessions, 0),
          );
          return (
            <Grid>
              <KpiCard
                className={spans.c3}
                label="Sessions"
                value={kpi.sessions.toLocaleString()}
                suffix={changeLabel(kpi.sessions_change)}
                spark={data.sessions_over_time.map((d) => d.sessions)}
                note="Visits in the selected period"
                dot="good"
              />
              <KpiCard
                className={spans.c3}
                label="Users"
                value={kpi.users.toLocaleString()}
                suffix={changeLabel(kpi.users_change)}
                note={`${kpi.new_users.toLocaleString()} new this period`}
                dot="good"
              />
              <KpiCard
                className={spans.c3}
                label="Page views"
                value={kpi.pageviews.toLocaleString()}
                suffix={changeLabel(kpi.pageviews_change)}
                note="Across all pages"
                dot="good"
              />
              <KpiCard
                className={spans.c3}
                label="Avg session"
                value={fmtDuration(kpi.avg_session_duration)}
                note={`Bounce rate ${kpi.bounce_rate}%${kpi.bounce_change !== null ? `, ${changeLabel(kpi.bounce_change)}` : ""}`}
                dot="mut"
              />

              <div className={spans.c7} data-focus-id="social-channels">
                <Card className="h-full">
                  <CardHeader title="Traffic by channel" subtitle="Sessions per GA4 default channel group" />
                  <div className="px-[18px] pb-4 pt-3">
                    {data.by_channel.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No channel data for this period.</p>
                    ) : (
                      <MiniBars
                        rows={data.by_channel.map((c) => ({
                          label: c.channel,
                          value: c.sessions.toLocaleString(),
                          pct: (c.sessions / maxChannel) * 100,
                        }))}
                      />
                    )}
                  </div>
                </Card>
              </div>

              <div className={spans.c5} data-focus-id="social-devices">
                <Card className="h-full">
                  <CardHeader title="Devices" subtitle="Share of sessions" />
                  <div className="px-[18px] pb-4 pt-3">
                    {data.by_device.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No device data for this period.</p>
                    ) : (
                      <MiniBars
                        rows={data.by_device.map((d) => ({
                          label: d.device,
                          value: `${Math.round((d.sessions / deviceTotal) * 100)}%`,
                          pct: (d.sessions / deviceTotal) * 100,
                        }))}
                      />
                    )}
                  </div>
                </Card>
              </div>

              <div className={spans.c12} data-focus-id="social-top-pages">
                <Card>
                  <CardHeader title="Top pages" subtitle="By sessions in the selected period" />
                  <div className="px-[18px] pb-2 pt-2">
                    {data.top_pages.length === 0 ? (
                      <p className="py-2 pb-4 text-[13px] text-ink-2">No page data for this period.</p>
                    ) : (
                      <DataTable columns={PAGE_COLUMNS} rows={data.top_pages} rowKey={(row) => row.path} />
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

function PlatformsSection() {
  const query = useQuery({
    queryKey: qk.socialPlatforms(),
    queryFn: () => fetchEnvelope<SocialPlatformsData>("social_platforms", "/social/platforms"),
  });

  return (
    <>
      <GrpLabel className="mb-3 mt-6">Social platforms</GrpLabel>
      <QueryPanel query={query} skeleton={PLATFORMS_SKELETON}>
        {(data, meta) => (
          <Grid>
            <PlatformCard
              title="LinkedIn"
              subtitle="Company page, from the LinkedIn API"
              connected={data.linkedin !== null}
            >
              {data.linkedin === null ? (
                <NotConnectedBody
                  reason={findReason(meta, "linkedin")}
                  fallback="LinkedIn is not wired up on saleem-api yet."
                />
              ) : (
                <div className="px-[18px] pb-4 pt-2">
                  <StatRow className="mb-2">
                    <Stat value={data.linkedin.followers.toLocaleString()} label="Followers" />
                    <Stat value={data.linkedin.page_views_30d.toLocaleString()} label="Page views, 30d" />
                    <Stat value={data.linkedin.posts.length} label="Recent posts" />
                  </StatRow>
                  <PostList
                    rows={data.linkedin.posts.slice(0, 3).map((p) => ({
                      key: p.id,
                      icon: MessageSquare,
                      title: p.text || "Post",
                      subtitle: `${fmtDate(p.published_at)} · ${engagementLine([
                        ["impressions", p.impressions],
                        ["likes", p.likes],
                        ["comments", p.comments],
                        ["clicks", p.clicks],
                      ])}`,
                    }))}
                  />
                </div>
              )}
            </PlatformCard>

            <PlatformCard
              title="TikTok"
              subtitle="Account stats, token from the shared store"
              connected={data.tiktok !== null}
            >
              {data.tiktok === null ? (
                <NotConnectedBody
                  reason={findReason(meta, "tiktok")}
                  fallback="TikTok is not connected. The old dashboard owns the connect flow."
                />
              ) : (
                <div className="px-[18px] pb-4 pt-2">
                  <StatRow className="mb-2">
                    <Stat value={data.tiktok.followers.toLocaleString()} label="Followers" />
                    <Stat value={data.tiktok.video_count.toLocaleString()} label="Videos" />
                    <Stat value={data.tiktok.display_name || "Account"} label="Account" />
                  </StatRow>
                  <PostList
                    rows={data.tiktok.videos.slice(0, 3).map((v) => ({
                      key: v.id,
                      icon: Clapperboard,
                      title: v.title || "Video",
                      subtitle: `${fmtDate(v.published_at)} · ${engagementLine([
                        ["views", v.views],
                        ["likes", v.likes],
                        ["comments", v.comments],
                        ["shares", v.shares],
                      ])}`,
                    }))}
                  />
                </div>
              )}
            </PlatformCard>

            <PlatformCard
              title="Instagram"
              subtitle="Business account, from the Meta Graph API"
              connected={data.instagram !== null}
            >
              {data.instagram === null ? (
                <NotConnectedBody
                  reason={findReason(meta, "instagram")}
                  fallback="Instagram is not wired up on saleem-api yet."
                />
              ) : (
                <div className="px-[18px] pb-4 pt-2">
                  <StatRow className="mb-2">
                    <Stat value={data.instagram.followers.toLocaleString()} label="Followers" />
                    <Stat value={data.instagram.media_count.toLocaleString()} label="Posts total" />
                  </StatRow>
                  <PostList
                    rows={data.instagram.posts.slice(0, 3).map((p) => ({
                      key: p.id,
                      icon: ImageIcon,
                      title: p.caption || p.media_type,
                      subtitle: `${fmtDate(p.published_at)} · ${engagementLine([
                        ["likes", p.likes],
                        ["comments", p.comments],
                        ["reach", p.reach],
                        ["saves", p.saves],
                      ])}`,
                    }))}
                  />
                </div>
              )}
            </PlatformCard>

            <PlatformCard
              title="Zoho Social"
              subtitle="Published posts across connected networks"
              connected={data.zoho_social !== null}
            >
              {data.zoho_social === null ? (
                <NotConnectedBody
                  reason={findReason(meta, "zoho_social")}
                  fallback="Zoho Social is not wired up on saleem-api yet."
                />
              ) : (
                <div className="px-[18px] pb-4 pt-2">
                  <StatRow className="mb-2">
                    <Stat value={`${data.zoho_social.engagement_rate}%`} label="Engagement rate" />
                    <Stat value={data.zoho_social.total_reach.toLocaleString()} label="Reach" />
                    <Stat value={data.zoho_social.total_interactions.toLocaleString()} label="Interactions" />
                  </StatRow>
                  <PostList
                    rows={data.zoho_social.posts.slice(0, 3).map((p) => ({
                      key: p.id,
                      icon: Send,
                      title: p.content_preview || p.platform,
                      subtitle: `${p.platform}${p.published_at ? ` · ${fmtDate(p.published_at)}` : ""} · ${engagementLine([
                        ["reach", p.reach],
                        ["likes", p.likes],
                        ["comments", p.comments],
                        ["shares", p.shares],
                      ])}`,
                    }))}
                  />
                </div>
              )}
            </PlatformCard>

            <div className={spans.c12}>
              <Card>
                <CardFooter
                  className="border-t-0 pt-[12px]"
                  note="Numbers refresh hourly from each platform. A card reading not connected explains exactly what is missing; nothing here is estimated."
                />
              </Card>
            </div>
          </Grid>
        )}
      </QueryPanel>
    </>
  );
}

export function SocialTab() {
  const [period, setPeriod] = useState<Period>("28d");

  return (
    <>
      <Ga4Section period={period} setPeriod={setPeriod} />
      <PlatformsSection />
    </>
  );
}
