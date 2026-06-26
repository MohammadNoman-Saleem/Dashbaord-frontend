"use client";

import { useState } from "react";
import { AlertCircle, Building2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  ProviderCard,
  type ProviderCardData,
} from "@/components/provider-board/ProviderCard";
import { AddReferralModal } from "@/components/provider-board/AddReferralModal";
import { AddHospitalModal } from "@/components/provider-board/AddHospitalModal";

/* The provider board. Country tabs (Bahrain first, then alphabetical, with
   "Other" for hospitals that have no country set in Zoho); under the selected
   country, one column per hospital in that country, every hospital shown even
   when it holds no patients, each with an Add button. Add/remove only; a patient
   can sit under several hospitals. Membership and the waiting clock come from
   Supabase; the hospital list, country, and patient identity/status are live
   from Zoho, gated to name-seers server-side. */

type Hospital = { id: string; name: string; country: string };
type BoardData = {
  countries: string[];
  hospitals: Hospital[];
  cardsByHospital: Record<string, ProviderCardData[]>;
};

const REMOVE_FAILURE =
  "Couldn't remove the card. Try again, or tell Al Saeed if it repeats.";

export function ProviderBoard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [presetHospitalId, setPresetHospitalId] = useState<string | null>(null);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [addHospitalOpen, setAddHospitalOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.providerBoard(),
    queryFn: () =>
      fetchEnvelope<BoardData>("provider_board", "/provider-board"),
    staleTime: 60_000,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      mutateEnvelope<{ id: string }>(
        "provider_board",
        "DELETE",
        `/provider-board/${id}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.providerBoard() });
    },
    onError: (error) =>
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : REMOVE_FAILURE,
        AlertCircle,
      ),
  });

  function openAdd(hospitalId: string | null) {
    setPresetHospitalId(hospitalId);
    setAddOpen(true);
  }

  const hospitals = query.data?.data?.hospitals ?? [];
  const removingId = removeMutation.isPending
    ? (removeMutation.variables ?? null)
    : null;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Provider board"
        subtitle="Each hospital is a column under its country. Add a patient to track how long that hospital has had the case."
      />
      <div className="flex items-center gap-2 px-[18px] pb-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setAddHospitalOpen(true)}
          disabled={query.isError}
        >
          <Building2 strokeWidth={1.8} aria-hidden="true" />
          Add hospital
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openAdd(null)}
          disabled={query.isError}
        >
          <Plus strokeWidth={1.8} aria-hidden="true" />
          Add patient
        </Button>
      </div>

      <div className="px-[18px] pb-[16px]">
        <QueryPanel query={query} skeleton={<BoardSkeleton />}>
          {(data) => (
            <BoardBody
              data={data}
              activeCountry={activeCountry}
              onSelectCountry={setActiveCountry}
              onAdd={openAdd}
              onRemove={(id) => removeMutation.mutate(id)}
              removingId={removingId}
            />
          )}
        </QueryPanel>
      </div>

      {addOpen ? (
        <AddReferralModal
          key={presetHospitalId ?? "any"}
          open
          hospitals={hospitals}
          presetHospitalId={presetHospitalId}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {addHospitalOpen ? (
        <AddHospitalModal
          open
          defaultCountry={
            activeCountry && activeCountry !== "Other" ? activeCountry : ""
          }
          onClose={() => setAddHospitalOpen(false)}
        />
      ) : null}
    </Card>
  );
}

type BoardBodyProps = {
  data: BoardData;
  activeCountry: string | null;
  onSelectCountry: (country: string) => void;
  onAdd: (hospitalId: string | null) => void;
  onRemove: (id: string) => void;
  removingId: string | null;
};

function BoardBody({
  data,
  activeCountry,
  onSelectCountry,
  onAdd,
  onRemove,
  removingId,
}: BoardBodyProps) {
  if (data.hospitals.length === 0) {
    return (
      <p className="py-3 text-[13px] text-ink-2">
        No hospitals on the board yet. Add one with the button above.
      </p>
    );
  }

  // The active tab falls back to the first country when none is chosen or the
  // chosen one is no longer present.
  const current =
    activeCountry && data.countries.includes(activeCountry)
      ? activeCountry
      : data.countries[0];

  const cardCountFor = (country: string) =>
    data.hospitals
      .filter((h) => h.country === country)
      .reduce((n, h) => n + (data.cardsByHospital[h.id]?.length ?? 0), 0);

  const columns = data.hospitals.filter((h) => h.country === current);

  return (
    <>
      <div
        role="tablist"
        aria-label="Country"
        className="flex flex-wrap gap-1 border-b border-line-soft pb-2"
      >
        {data.countries.map((country) => {
          const active = country === current;
          const count = cardCountFor(country);
          return (
            <button
              key={country}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectCountry(country)}
              className={`cursor-pointer rounded-[8px] px-[11px] py-[6px] text-[12.5px] font-medium ${
                active
                  ? "bg-accent text-on-accent"
                  : "text-ink-2 hover:bg-accessible-soft hover:text-title"
              }`}
            >
              {country}
              {count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-start gap-[14px] overflow-x-auto pb-2">
        {columns.map((h) => {
          const cards = data.cardsByHospital[h.id] ?? [];
          return (
            <section
              key={h.id}
              aria-label={`${h.name}, ${cards.length} patient${cards.length === 1 ? "" : "s"}`}
              className="flex w-[272px] shrink-0 flex-col rounded-card border border-line-soft bg-surface-2"
            >
              <header className="flex items-center justify-between gap-2 px-[14px] pb-[6px] pt-[11px]">
                <span className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3">
                  {h.name}
                </span>
                <span className="num shrink-0 rounded-full border border-line bg-surface px-[8px] py-px text-[11px] font-bold text-ink-2">
                  {cards.length}
                </span>
              </header>
              <div className="flex flex-col gap-[9px] px-[10px] pb-[10px]">
                {cards.map((card) => (
                  <ProviderCard
                    key={card.id}
                    card={card}
                    removing={removingId === card.id}
                    onRemove={() => onRemove(card.id)}
                  />
                ))}
                <Button variant="ghost" size="sm" onClick={() => onAdd(h.id)}>
                  <Plus strokeWidth={1.8} aria-hidden="true" />
                  Add patient
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton width={220} height={28} />
      <div className="flex gap-[14px] overflow-hidden pb-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex w-[272px] shrink-0 flex-col gap-[9px]">
            <Skeleton width={140} height={12} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        ))}
      </div>
    </div>
  );
}
