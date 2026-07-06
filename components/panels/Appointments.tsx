"use client";

import { useQuery } from "@tanstack/react-query";
import { Calendar, Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AppointmentsData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { appointmentStatusVariant } from "@/lib/appointmentStatus";
import { buildDeepLink } from "@/lib/deepLink";

/* Home panel p-appointments (spec 02 section 8.1). Today's consultations
   plus the most recent completed one. The chip shows the live Zoho booking
   status, styled by appointmentStatusVariant to match the appointments page. */

/* Consult fees keep one decimal ("BHD 9.9"), matching the mockup list rows.
   Whole-dinar totals elsewhere go through fmtBHD. */
function fmtFee(n: number): string {
  return `BHD ${n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

function AppointmentsSkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} height={38} />
      ))}
    </div>
  );
}

export function AppointmentsPanel({
  variant = "home",
}: {
  person?: string;
  variant?: "home" | "cases";
}) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;

  const query = useQuery({
    queryKey: qk.appointments(),
    queryFn: () => fetchEnvelope<AppointmentsData>("appointments", "/appointments"),
  });

  const data = query.data?.data;
  const booked = data?.today.length;

  return (
    <Card>
      <CardHeader
        title={variant === "cases" ? "Appointments" : "Today's consultations"}
        subtitle={
          variant === "cases"
            ? "Upcoming and just finished."
            : booked != null
              ? `${booked} booked today.`
              : "Today's bookings."
        }
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<AppointmentsSkeleton />}
          isEmpty={(d) => d.today.length === 0 && d.recent_done.length === 0}
          emptyCopy="No appointments today."
        >
          {(d, _meta, flags) => {
            const rows =
              variant === "cases"
                ? [...d.today, ...d.recent_done]
                : [...d.today, ...d.recent_done.slice(0, 1)];
            return (
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                {rows.map((row) => (
                  <ListRow
                    key={row.id}
                    icon={row.status === "Done" ? Check : Calendar}
                    variant={row.status === "Done" ? "good" : "info"}
                    title={`${row.time} · ${row.doctor}`}
                    subtitle={`${row.product} · ${fmtFee(row.fee_bhd)}`}
                    right={
                      <Chip variant={appointmentStatusVariant(row.status)}>
                        {row.status}
                      </Chip>
                    }
                  />
                ))}
              </div>
            );
          }}
        </QueryPanel>
      </div>
      {data ? (
        variant === "cases" ? (
          <CardFooter note="If the doctor is 2 minutes late on instant consults, the patient can claim a full refund." />
        ) : (
          <CardFooter
            note="Showing today and the most recent completed consult."
            right={<Link href={buildDeepLink({ view: "cases" }, viewAs)}>All appointments</Link>}
          />
        )
      ) : null}
    </Card>
  );
}
