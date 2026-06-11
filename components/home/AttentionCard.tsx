"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Cpu,
  Filter,
  Flag,
  Layers,
  Megaphone,
  Split,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardHeader } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AttentionItem } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";

/* "Needs your attention" card (02 section 8.1): full width, 2 to 3 ListRows
   from GET /api/attention?person=, each with an Open link that deep-links to
   route plus tab plus focus via buildDeepLink, carrying the ?as= override. */

/* The API names icons with the mockup's short keys; this maps them onto the
   lucide set from spec section 4. Unknown keys fall back to AlertCircle, the
   attention icon. */
const ICONS: Record<string, LucideIcon> = {
  alert: AlertCircle,
  flag: Flag,
  clock: Clock,
  cal: Calendar,
  mega: Megaphone,
  user: User,
  check: Check,
  cases: Layers,
  funnel: Filter,
  cpu: Cpu,
  wallet: Wallet,
  split: Split,
};

function AttentionSkeleton() {
  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-start gap-[11px] border-b border-line-soft px-0.5 py-2.5 last:border-b-0"
        >
          <Skeleton width={30} height={30} />
          <div className="min-w-0 flex-1">
            <Skeleton width="62%" height={13} />
            <Skeleton className="mt-1.5" width="44%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AttentionCard({ person }: { person: string }) {
  const query = useQuery({
    queryKey: qk.attention(person),
    queryFn: () => fetchEnvelope<AttentionItem[]>("attention", "/attention", { person }),
  });
  const searchParams = useSearchParams();
  const asParam = searchParams.get("as") ?? undefined;

  return (
    <Card>
      <CardHeader
        title="Needs your attention"
        subtitle="Plain answers first. Tap through for the detail."
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={<AttentionSkeleton />}
          isEmpty={(items) => items.length === 0}
          emptyCopy="Nothing needs your attention right now."
        >
          {(items) => (
            <div>
              {items.map((item) => (
                <ListRow
                  key={item.title}
                  icon={ICONS[item.icon] ?? AlertCircle}
                  variant={item.warn ? "warn" : "info"}
                  title={item.title}
                  subtitle={item.text}
                  right={
                    <Link
                      href={buildDeepLink(item.link, asParam)}
                      className="whitespace-nowrap text-xs font-semibold"
                    >
                      Open
                    </Link>
                  }
                />
              ))}
            </div>
          )}
        </QueryPanel>
      </div>
    </Card>
  );
}
