"use client";

import { useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
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

/* The provider board: one column per hospital that currently holds a patient,
   cards waiting for that hospital's response. Add/remove only (a patient can sit
   under several hospitals); no dragging, since a card is not "moved" between
   hospitals. The waiting clock and the membership come from Supabase; the patient
   identity and status are live from Zoho, gated to name-seers server-side. */

type Column = {
  hospital_id: string;
  hospital_name: string;
  cards: ProviderCardData[];
};
type HospitalOption = { id: string; name: string };
type BoardData = { columns: Column[]; hospitals: HospitalOption[] };

const REMOVE_FAILURE =
  "Couldn't remove the card. Try again, or tell Al Saeed if it repeats.";

export function ProviderBoard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [presetHospitalId, setPresetHospitalId] = useState<string | null>(null);

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

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Provider board"
        subtitle="Which hospital has which patient, and how long they have been waiting for a response."
      />
      <div className="flex items-center px-[18px] pb-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => openAdd(null)}
          disabled={query.isError}
        >
          <Plus strokeWidth={1.8} aria-hidden="true" />
          Add patient
        </Button>
      </div>

      <div className="px-[18px] pb-[16px]">
        <QueryPanel query={query} skeleton={<BoardSkeleton />}>
          {(data) =>
            data.columns.length === 0 ? (
              <p className="py-3 text-[13px] text-ink-2">
                No patients on the board yet. Use Add patient to put a lead or
                deal under a hospital.
              </p>
            ) : (
              <div className="flex items-start gap-[14px] overflow-x-auto pb-2">
                {data.columns.map((col) => (
                  <section
                    key={col.hospital_id}
                    aria-label={`${col.hospital_name}, ${col.cards.length} patient${col.cards.length === 1 ? "" : "s"}`}
                    className="flex w-[272px] shrink-0 flex-col rounded-card border border-line-soft bg-surface-2"
                  >
                    <header className="flex items-center justify-between gap-2 px-[14px] pb-[6px] pt-[11px]">
                      <span className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3">
                        {col.hospital_name}
                      </span>
                      <span className="num shrink-0 rounded-full border border-line bg-surface px-[8px] py-px text-[11px] font-bold text-ink-2">
                        {col.cards.length}
                      </span>
                    </header>
                    <div className="flex flex-col gap-[9px] px-[10px] pb-[10px]">
                      {col.cards.map((card) => (
                        <ProviderCard
                          key={card.id}
                          card={card}
                          removing={
                            removeMutation.isPending &&
                            removeMutation.variables === card.id
                          }
                          onRemove={() => removeMutation.mutate(card.id)}
                        />
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAdd(col.hospital_id)}
                      >
                        <Plus strokeWidth={1.8} aria-hidden="true" />
                        Add patient
                      </Button>
                    </div>
                  </section>
                ))}
              </div>
            )
          }
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
    </Card>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-[14px] overflow-hidden pb-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex w-[272px] shrink-0 flex-col gap-[9px]">
          <Skeleton width={140} height={12} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      ))}
    </div>
  );
}
