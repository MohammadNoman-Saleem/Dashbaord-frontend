"use client";

/* Component gallery. Renders every primitive in every state, duplicated in a
   light and a dark wrapper, with fake data only. No fetches; query states are
   mocked as plain envelope objects cast to the query result shape. */

import { useState, type ReactNode } from "react";
import { notFound } from "next/navigation";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  Pencil,
  Plus,
  RotateCw,
} from "lucide-react";

import { FunnelBars, type FunnelRow } from "@/components/charts/FunnelBars";
import { MiniBars, type MiniBarRow } from "@/components/charts/MiniBars";
import { Spark } from "@/components/charts/Spark";
import { Banner } from "@/components/ui/Banner";
import { Bar } from "@/components/ui/Bar";
import { BeatIcon } from "@/components/ui/BeatIcon";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { KpiCard } from "@/components/ui/KpiCard";
import { ListRow } from "@/components/ui/ListRow";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { PatientRef, type PatientRefData } from "@/components/ui/PatientRef";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tabs } from "@/components/ui/Tabs";
import { ThemeTabs } from "@/components/ui/ThemeTabs";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { Envelope, Meta } from "@/lib/api/envelope";
import { Providers } from "@/lib/api/queryClient";

/* ============ Theme pair scaffolding ============ */

type ThemeName = "light" | "dark";
const THEMES: ThemeName[] = ["light", "dark"];

function Section({
  title,
  children,
}: {
  title: string;
  children: (theme: ThemeName) => ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 text-[17px]">{title}</h2>
      <div className="grid gap-[14px] min-[1181px]:grid-cols-2">
        {THEMES.map((theme) => (
          <div key={theme} data-theme={theme} className="rounded-card bg-bg p-6 text-ink">
            <p className="mb-4 text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3">
              {theme} theme
            </p>
            {children(theme)}
          </div>
        ))}
      </div>
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-4 text-xs text-ink-3 first:mt-0">{children}</p>;
}

/* ============ Fake data ============ */

const CONSULT_FUNNEL: FunnelRow[] = [
  { label: "Consult page", value: 3940 },
  { label: "Doctor chosen", value: 1212 },
  { label: "Payment started", value: 402 },
  { label: "Paid", value: 268 },
];

const NOVO_FUNNEL: FunnelRow[] = [
  { label: "Landing", value: 4120 },
  { label: "Path chosen", value: 71 },
  { label: "Booked", value: 3 },
  { label: "Paid", value: 0 },
];

const SPARK_VALUES = [3, 4, 3.4, 5, 4.6, 6, 5.4, 7, 6.5, 8.2];

const MINI_BEHIND: MiniBarRow[] = [
  { label: "Consults", value: 118, pct: 84 },
  { label: "Bookings", value: 36, pct: 52, status: "behind" },
  { label: "First replies", value: 64, pct: 47, status: "behind" },
];

const MINI_AHEAD: MiniBarRow[] = [
  { label: "Revenue", value: "4,180", pct: 96, status: "ahead" },
  { label: "Referrals", value: 21, pct: 88, status: "ahead" },
  { label: "Site visits", value: "5,210", pct: 72 },
];

type CaseRow = {
  id: string;
  patient: PatientRefData;
  reason: string;
  reasonVariant: "warn" | "good";
  waitingDays: number;
  next: string;
};

const CASE_ROWS: CaseRow[] = [
  {
    id: "c1",
    patient: { zoho_id: "ZD-104128", initials: "S.A." },
    reason: "Quiet 4 days",
    reasonVariant: "warn",
    waitingDays: 4,
    next: "Nudge with the revised treatment quote",
  },
  {
    id: "c2",
    patient: { zoho_id: "ZD-104201", initials: "M.K." },
    reason: "Quiet 3 days",
    reasonVariant: "warn",
    waitingDays: 3,
    next: "Payment link reminder, the link expires tonight",
  },
  {
    id: "c3",
    patient: { zoho_id: "ZD-104233", initials: "H.R." },
    reason: "Check-in due",
    reasonVariant: "good",
    waitingDays: 0,
    next: "72 hour call after treatment, she asked for after 4 PM",
  },
];

const CASE_COLUMNS: DataTableColumn<CaseRow>[] = [
  {
    key: "who",
    label: "Who",
    lockNote: "restricted",
    render: (row) => <PatientRef patient={row.patient} />,
  },
  {
    key: "reason",
    label: "Why now",
    render: (row) => <Chip variant={row.reasonVariant}>{row.reason}</Chip>,
  },
  { key: "waitingDays", label: "Waiting days", numeric: true },
  { key: "next", label: "Next step" },
];

/* ============ Mock query envelopes ============ */

const FRESH_META: Meta = {
  updated_at: "2026-06-11T12:40:00+03:00",
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
};

const STALE_META: Meta = {
  ...FRESH_META,
  updated_at: "2026-06-11T09:05:00+03:00",
  cached: true,
  stale: true,
};

const UNRELIABLE_META: Meta = {
  ...FRESH_META,
  reliable: false,
  reasons: [
    {
      key: "novo_funnel_definition",
      title: "These funnel numbers do not match reality.",
      text: "The landing page took 4,120 visits this month but the funnel below reads near zero. The funnel definition is wrong and the fix is in review.",
      owner: "Noman",
      due: "2026-06-12",
    },
  ],
};

const ERROR_META: Meta = {
  ...FRESH_META,
  error: { message_plain: "Zoho did not answer after two tries." },
};

/* Plain object cast to the query result shape. QueryPanel only reads
   isPending, isError, data, and refetch, so this stays simpler than wiring a
   real never-resolving query per state. */
function asQuery<T>(value: {
  isPending?: boolean;
  isError?: boolean;
  data?: Envelope<T>;
}): UseQueryResult<Envelope<T>> {
  return {
    isPending: value.isPending ?? false,
    isError: value.isError ?? false,
    data: value.data,
    refetch: () => Promise.resolve(undefined),
  } as unknown as UseQueryResult<Envelope<T>>;
}

const PENDING_QUERY = asQuery<FunnelRow[]>({ isPending: true });
const ERROR_QUERY = asQuery<FunnelRow[]>({ data: { data: null, meta: ERROR_META } });
const EMPTY_QUERY = asQuery<FunnelRow[]>({ data: { data: [], meta: FRESH_META } });
const STALE_QUERY = asQuery<FunnelRow[]>({ data: { data: CONSULT_FUNNEL, meta: STALE_META } });
const UNRELIABLE_QUERY = asQuery<FunnelRow[]>({
  data: { data: NOVO_FUNNEL, meta: UNRELIABLE_META },
});
const LOADED_QUERY = asQuery<FunnelRow[]>({ data: { data: CONSULT_FUNNEL, meta: FRESH_META } });

/* ============ Stateful demos ============ */

function TabsDemo({ theme }: { theme: ThemeName }) {
  const [tab, setTab] = useState("general");
  return (
    <div data-testid={`tabs-${theme}`}>
      <Tabs
        aria-label="Funnel views"
        items={[
          { key: "general", label: "General" },
          { key: "direct", label: "Direct appointment" },
          { key: "scheduled", label: "Scheduled" },
          { key: "novo", label: "Novo" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <p className="text-xs text-ink-2">Active tab: {tab}</p>
    </div>
  );
}

function PillsDemo({ theme }: { theme: ThemeName }) {
  const [pill, setPill] = useState("full");
  return (
    <div data-testid={`pills-${theme}`}>
      <Pills
        aria-label="Direct funnel variant"
        items={[
          { key: "full", label: "Full booking" },
          { key: "instant", label: "Instant" },
        ]}
        value={pill}
        onChange={setPill}
      />
      <p className="mt-2 text-xs text-ink-2">Active segment: {pill}</p>
    </div>
  );
}

function ModalDemo({ theme }: { theme: ThemeName }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={`modal-${theme}`}>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Open the delete confirm
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} aria-label="Delete KPI target">
        <ModalTitle>Delete this KPI target?</ModalTitle>
        <ModalText>
          Referral partners signed, owned by Afaf, leaves the June board. History stays in the
          log.
        </ModalText>
        <ModalRow>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="navy" onClick={() => setOpen(false)}>
            Delete permanently
          </Button>
        </ModalRow>
      </Modal>
    </div>
  );
}

/* Each theme wrapper gets its own ToastProvider so the toast stack inherits
   that wrapper's data-theme and both treatments can be seen. */
function ToastDemo({ theme }: { theme: ThemeName }) {
  return (
    <ToastProvider>
      <ToastTrigger theme={theme} />
    </ToastProvider>
  );
}

function ToastTrigger({ theme }: { theme: ThemeName }) {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2" data-testid={`toast-trigger-${theme}`}>
      <Button onClick={() => toast("Saved. The team sees it instantly.")}>Show a toast</Button>
      <Button
        variant="ghost"
        onClick={() => toast("Added to the urgent board.", Clock)}
      >
        Toast with a clock icon
      </Button>
    </div>
  );
}

/* ============ QueryPanel six states ============ */

function QueryStateCard({
  theme,
  state,
  title,
  sub,
  children,
}: {
  theme: ThemeName;
  state: string;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={`querypanel-${state}-${theme}`}>
      <Card>
        <CardHeader title={title} subtitle={sub} />
        <div className="px-[18px] pb-4 pt-3">{children}</div>
      </Card>
    </div>
  );
}

function FunnelSkeleton() {
  return (
    <div className="flex flex-col gap-[9px]">
      <Skeleton height={22} />
      <Skeleton height={22} width="72%" />
      <Skeleton height={22} width="48%" />
      <Skeleton height={22} width="30%" />
    </div>
  );
}

function QueryPanelDemos({ theme }: { theme: ThemeName }) {
  return (
    <div className="flex flex-col gap-[14px]">
      <QueryStateCard
        theme={theme}
        state="pending"
        title="Loading"
        sub="Skeleton blocks matching the layout. No spinners."
      >
        <QueryPanel query={PENDING_QUERY} skeleton={<FunnelSkeleton />}>
          {(rows) => <FunnelBars rows={rows} />}
        </QueryPanel>
      </QueryStateCard>

      <QueryStateCard
        theme={theme}
        state="error"
        title="Hard load failure"
        sub="Short message, plain reason, Retry."
      >
        <QueryPanel query={ERROR_QUERY} skeleton={<FunnelSkeleton />}>
          {(rows) => <FunnelBars rows={rows} />}
        </QueryPanel>
      </QueryStateCard>

      <QueryStateCard
        theme={theme}
        state="empty"
        title="Empty"
        sub="One warm plain sentence, never a bare dash."
      >
        <QueryPanel
          query={EMPTY_QUERY}
          skeleton={<FunnelSkeleton />}
          isEmpty={(rows) => rows.length === 0}
          emptyCopy="No appointments today."
        >
          {(rows) => <FunnelBars rows={rows} />}
        </QueryPanel>
      </QueryStateCard>

      <QueryStateCard
        theme={theme}
        state="stale"
        title="Stale, cached"
        sub="Saved numbers render with the cached time."
      >
        <QueryPanel query={STALE_QUERY} skeleton={<FunnelSkeleton />}>
          {(rows, meta) => (
            <>
              <div className="mb-2 flex items-center gap-2">
                <Chip variant="mut">Cached</Chip>
                <span className="text-xs text-ink-3">{meta.cached ? "From cache" : "Live"}</span>
              </div>
              <FunnelBars rows={rows} />
              <p className="mt-3 text-xs text-ink-3">
                Mixpanel is busy right now. Showing saved numbers from 9:05 AM. It refreshes
                again within the hour.
              </p>
            </>
          )}
        </QueryPanel>
      </QueryStateCard>

      <QueryStateCard
        theme={theme}
        state="unreliable"
        title="Unreliable"
        sub="Optimism banner, dimmed chart, severity in words."
      >
        <QueryPanel query={UNRELIABLE_QUERY} skeleton={<FunnelSkeleton />}>
          {(rows, _meta, flags) => (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-ink-3">Novo funnels, instant and scheduled</span>
                {flags.unreliable ? <Chip variant="warn">Do not trust yet</Chip> : null}
              </div>
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <FunnelBars rows={rows} />
              </div>
            </>
          )}
        </QueryPanel>
      </QueryStateCard>

      <QueryStateCard
        theme={theme}
        state="loaded"
        title="Loaded"
        sub="Reliable data, fresh meta, full opacity."
      >
        <QueryPanel query={LOADED_QUERY} skeleton={<FunnelSkeleton />}>
          {(rows, meta, flags) => (
            <>
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <FunnelBars rows={rows} />
              </div>
              <p className="mt-3 text-xs text-ink-3">
                {meta.reliable ? "Verified against the admin panel." : "Pending verification."}
              </p>
            </>
          )}
        </QueryPanel>
      </QueryStateCard>
    </div>
  );
}

/* ============ Page ============ */

export default function GalleryPage() {
  /* Dev tool only. The route guard proxy intentionally excludes this path, so
     it would otherwise ship unauthenticated. Hide it entirely in production. */
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <Providers>
      <main className="mx-auto w-full max-w-[1460px] px-5 py-8">
        <header className="mb-8">
          <h1 className="text-[21px]">Component gallery</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Every primitive in every state, light and dark side by side. Fake data only, nothing
            here fetches.
          </p>
        </header>

        <Section title="Chip">
          {(theme) => (
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid={`chip-good-${theme}`}>
                <Chip variant="good">Verified</Chip>
              </span>
              <span data-testid={`chip-warn-${theme}`}>
                <Chip variant="warn">Quiet 4 days</Chip>
              </span>
              <span data-testid={`chip-info-${theme}`}>
                <Chip variant="info">In review</Chip>
              </span>
              <span data-testid={`chip-mut-${theme}`}>
                <Chip variant="mut">Paused</Chip>
              </span>
              <span data-testid={`chip-num-${theme}`}>
                <Chip variant="good" className="num">
                  6.8% paid
                </Chip>
              </span>
            </div>
          )}
        </Section>

        <Section title="StatusDot">
          {(theme) => (
            <div className="flex flex-wrap items-center gap-5 text-xs text-ink-2">
              <span className="flex items-center gap-1.5" data-testid={`dot-good-${theme}`}>
                <StatusDot variant="good" /> On track
              </span>
              <span className="flex items-center gap-1.5" data-testid={`dot-warn-${theme}`}>
                <StatusDot variant="warn" /> Needs attention
              </span>
              <span className="flex items-center gap-1.5" data-testid={`dot-mut-${theme}`}>
                <StatusDot variant="mut" /> Idle
              </span>
            </div>
          )}
        </Section>

        <Section title="Button">
          {(theme) => (
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid={`btn-primary-${theme}`}>
                <Button>
                  <Check strokeWidth={1.8} aria-hidden="true" />
                  Save changes
                </Button>
              </span>
              <span data-testid={`btn-navy-${theme}`}>
                <Button variant="navy">Delete permanently</Button>
              </span>
              <span data-testid={`btn-ghost-${theme}`}>
                <Button variant="ghost">
                  <RotateCw strokeWidth={1.8} aria-hidden="true" />
                  Refresh
                </Button>
              </span>
              <span data-testid={`btn-sm-${theme}`}>
                <Button size="sm">
                  <Plus strokeWidth={1.8} aria-hidden="true" />
                  Add target
                </Button>
              </span>
              <span data-testid={`btn-ghost-sm-${theme}`}>
                <Button variant="ghost" size="sm">
                  Open
                  <ArrowRight strokeWidth={1.8} aria-hidden="true" />
                </Button>
              </span>
              <span data-testid={`btn-icon-${theme}`}>
                <IconButton aria-label="Edit target">
                  <Pencil strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
              </span>
            </div>
          )}
        </Section>

        <Section title="Bar">
          {(theme) => (
            <div className="flex max-w-[420px] flex-col">
              <Caption>Accent fill, 64%</Caption>
              <div data-testid={`bar-accent-${theme}`}>
                <Bar value={64} />
              </div>
              <Caption>Good fill, 82%</Caption>
              <div data-testid={`bar-good-${theme}`}>
                <Bar value={82} fill="good" />
              </div>
              <Caption>Warn fill, 38%</Caption>
              <div data-testid={`bar-warn-${theme}`}>
                <Bar value={38} fill="warn" />
              </div>
              <Caption>9px track, accent, 52%</Caption>
              <div data-testid={`bar-tall-${theme}`}>
                <Bar value={52} height={9} />
              </div>
            </div>
          )}
        </Section>

        <Section title="Skeleton">
          {(theme) => (
            <div className="flex max-w-[420px] flex-col gap-2">
              <span data-testid={`skeleton-label-${theme}`}>
                <Skeleton width={120} height={10} />
              </span>
              <span data-testid={`skeleton-text-${theme}`}>
                <Skeleton height={14} />
              </span>
              <span data-testid={`skeleton-value-${theme}`}>
                <Skeleton width={90} height={27} />
              </span>
              <span data-testid={`skeleton-block-${theme}`}>
                <Skeleton height={44} />
              </span>
            </div>
          )}
        </Section>

        <Section title="Spark">
          {(theme) => (
            <div className="flex max-w-[520px] flex-col">
              <Caption>Line only</Caption>
              <div data-testid={`spark-line-${theme}`}>
                <Spark values={SPARK_VALUES} />
              </div>
              <Caption>With area fill</Caption>
              <div data-testid={`spark-fill-${theme}`}>
                <Spark values={SPARK_VALUES} fill />
              </div>
            </div>
          )}
        </Section>

        <Section title="FunnelBars">
          {(theme) => (
            <div data-testid={`funnel-${theme}`}>
              <FunnelBars rows={CONSULT_FUNNEL} />
            </div>
          )}
        </Section>

        <Section title="MiniBars">
          {(theme) => (
            <div className="flex max-w-[480px] flex-col">
              <Caption>Behind pace</Caption>
              <div data-testid={`minibars-behind-${theme}`}>
                <MiniBars rows={MINI_BEHIND} />
              </div>
              <Caption>Ahead of pace</Caption>
              <div data-testid={`minibars-ahead-${theme}`}>
                <MiniBars rows={MINI_AHEAD} />
              </div>
            </div>
          )}
        </Section>

        <Section title="KpiCard">
          {(theme) => (
            <div className="grid gap-[14px] min-[881px]:grid-cols-3">
              <div data-testid={`kpi-bar-${theme}`}>
                <KpiCard
                  label="Cases closed"
                  value="14"
                  suffix="of 20"
                  bar={{ value: 70 }}
                  note="On pace for June"
                  dot="good"
                />
              </div>
              <div data-testid={`kpi-spark-${theme}`}>
                <KpiCard
                  label="Platform revenue"
                  labelRight={<Chip variant="good">Verified</Chip>}
                  value="BHD 4,180"
                  suffix="+22% vs May"
                  spark={SPARK_VALUES}
                  note="Checked against the admin panel"
                  dot="good"
                />
              </div>
              <div data-testid={`kpi-plain-${theme}`}>
                <KpiCard
                  label="Leads waiting"
                  value="3"
                  note="Quiet 3 days or more"
                  dot="warn"
                />
              </div>
            </div>
          )}
        </Section>

        <Section title="DataTable">
          {(theme) => (
            <div data-testid={`table-${theme}`}>
              <Card className="px-2 py-1">
                <DataTable columns={CASE_COLUMNS} rows={CASE_ROWS} rowKey={(row) => row.id} />
              </Card>
            </div>
          )}
        </Section>

        <Section title="ListRow">
          {(theme) => (
            <Card className="px-4 py-1">
              <div data-testid={`listrow-info-${theme}`}>
                <ListRow
                  icon={Calendar}
                  title="10:30, family medicine consult"
                  subtitle="Novo track, BHD 5.0 paid"
                  right={<Chip variant="good">Paid</Chip>}
                />
              </div>
              <div data-testid={`listrow-warn-${theme}`}>
                <ListRow
                  icon={Clock}
                  variant="warn"
                  title="BHD 3,750 outstanding, Novo invoice"
                  subtitle="Due Jun 20. Confirm receipt."
                  right={<Chip variant="warn">Owed to us</Chip>}
                />
              </div>
              <div data-testid={`listrow-good-${theme}`}>
                <ListRow
                  icon={Check}
                  variant="good"
                  title="June investor update sent"
                  subtitle="Done Jun 5"
                  right={<Chip variant="good">Done</Chip>}
                />
              </div>
            </Card>
          )}
        </Section>

        <Section title="Tabs">{(theme) => <TabsDemo theme={theme} />}</Section>

        <Section title="Pills">{(theme) => <PillsDemo theme={theme} />}</Section>

        <Section title="Field">
          {(theme) => (
            <div className="max-w-[420px]">
              <div data-testid={`field-input-${theme}`}>
                <Field
                  label="Target name"
                  htmlFor={`kpi-name-${theme}`}
                  hint="Shown on the KPI board."
                >
                  <FieldInput id={`kpi-name-${theme}`} defaultValue="Referral partners signed" />
                </Field>
              </div>
              <div data-testid={`field-select-${theme}`}>
                <Field label="Owner" htmlFor={`kpi-owner-${theme}`}>
                  <FieldSelect id={`kpi-owner-${theme}`} defaultValue="afaf">
                    <option value="afaf">Afaf</option>
                    <option value="fatima">Fatima</option>
                    <option value="razan">Razan</option>
                  </FieldSelect>
                </Field>
              </div>
            </div>
          )}
        </Section>

        <Section title="Banner">
          {(theme) => (
            <div data-testid={`banner-${theme}`}>
              <Banner title="These funnel numbers do not match reality.">
                The landing page took 4,120 visits this month but the funnel reads near zero.
                The definition fix is in review, due Jun 12. Trust the verified number instead.
              </Banner>
            </div>
          )}
        </Section>

        <Section title="Modal">{(theme) => <ModalDemo theme={theme} />}</Section>

        <Section title="Toast">{(theme) => <ToastDemo theme={theme} />}</Section>

        <Section title="ThemeTabs">
          {(theme) => (
            <div className="flex flex-col items-start gap-2" data-testid={`themetabs-${theme}`}>
              <ThemeTabs />
              <p className="text-xs text-ink-3">
                Switches the page theme globally. The pressed side follows the live setting, not
                this wrapper.
              </p>
            </div>
          )}
        </Section>

        <Section title="BeatIcon">
          {(theme) => (
            <div className="flex flex-wrap items-center gap-6">
              <span className="text-title" data-testid={`beaticon-title-${theme}`}>
                <BeatIcon size={24} />
              </span>
              <span className="text-accent" data-testid={`beaticon-accent-${theme}`}>
                <BeatIcon size={40} />
              </span>
              <span className="text-recovery" data-testid={`beaticon-recovery-${theme}`}>
                <BeatIcon size={56} />
              </span>
            </div>
          )}
        </Section>

        <Section title="QueryPanel">{(theme) => <QueryPanelDemos theme={theme} />}</Section>
      </main>
    </Providers>
  );
}
