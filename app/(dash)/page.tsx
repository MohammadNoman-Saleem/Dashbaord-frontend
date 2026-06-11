"use client";

import { HomeEngine } from "@/components/home/HomeEngine";
import { Skeleton } from "@/components/ui/Skeleton";
import { isPersonKey } from "@/config/people";
import { useViewer } from "@/lib/viewer";

/* The role-aware Command Center. The viewer context resolves who is signed
   in and any ?as= override (admins and co-founders only); this page maps
   that to a configured person and hands off to the engine. An unknown ?as=
   value falls back to the signed-in person rather than erroring, so a stale
   or mistyped link still lands somewhere sensible. */

function GreetingSkeleton() {
  return (
    <div className="mb-4 mt-[10px]">
      <Skeleton width={280} height={26} />
      <Skeleton className="mt-2" width={360} height={13} />
    </div>
  );
}

export default function HomePage() {
  const { me, effectivePerson } = useViewer();

  if (!me || !effectivePerson) {
    return <GreetingSkeleton />;
  }

  const person = isPersonKey(effectivePerson)
    ? effectivePerson
    : isPersonKey(me.person)
      ? me.person
      : null;

  if (!person) {
    return (
      <p className="mt-[10px] text-[13px] text-ink-2">
        Couldn&apos;t work out whose home to show. Sign in again, or tell Al Saeed if it keeps
        happening.
      </p>
    );
  }

  return <HomeEngine person={person} />;
}
