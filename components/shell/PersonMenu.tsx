"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import { useViewer } from "@/lib/viewer";

/* Sidebar footer viewer block, doubling as the view-as menu trigger.
   Mirrors .viewer and .avatar from the approved mockup. The dropdown lists
   me.people with avatar, name, and role; it renders only when the server
   says capabilities.can_view_as. Picking a person routes to /?as=<key>;
   picking yourself routes to / with the param cleared. Escape and outside
   clicks close the menu. */

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accessible text-xs font-bold text-trust-ink"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

type PersonMenuProps = {
  /* Icon-rail mode: only the avatar shows. */
  collapsed?: boolean;
};

export function PersonMenu({ collapsed = false }: PersonMenuProps) {
  const { me } = useViewer();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  if (!me) {
    return (
      <div className="flex items-center gap-[10px] p-2">
        <Skeleton width={32} height={32} className="rounded-full" />
        {collapsed ? null : <Skeleton width={92} height={12} />}
      </div>
    );
  }

  const people = me.people ?? [];
  const canSwitch = Boolean(me.capabilities?.can_view_as) && people.length > 0;
  const viewedKey = me.viewed_person ?? me.person;
  const selfKey = me.person;

  function pick(key: string) {
    setOpen(false);
    router.push(key === selfKey ? "/" : `/?as=${encodeURIComponent(key)}`);
  }

  const inner = (
    <>
      <Avatar name={me.name} size={32} />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 text-left leading-[1.2]">
            <b className="block truncate text-[13px] font-semibold text-title">{me.name}</b>
            <span className="text-[11px] text-ink-3">{me.role_label}</span>
          </span>
          {canSwitch ? (
            <ChevronDown
              strokeWidth={1.8}
              className="h-[15px] w-[15px] shrink-0 text-ink-3"
              aria-hidden="true"
            />
          ) : null}
        </>
      )}
    </>
  );

  if (!canSwitch) {
    return (
      <div className={`flex items-center gap-[10px] rounded-xl p-2 ${collapsed ? "justify-center" : ""}`}>
        {inner}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div
          role="menu"
          aria-label="View the dashboard as"
          className="absolute bottom-full left-0 z-[60] mb-2 w-[226px] rounded-card border border-line bg-surface p-[6px] shadow-pop"
        >
          {people.map((person: { key: string; name: string; role_label: string }) => (
            <button
              key={person.key}
              type="button"
              role="menuitem"
              onClick={() => pick(person.key)}
              className="flex w-full cursor-pointer items-center gap-[10px] rounded-[10px] px-2 py-[7px] text-left hover:bg-accessible-soft"
            >
              <Avatar name={person.name} size={26} />
              <span className="min-w-0 flex-1 leading-[1.2]">
                <b className="block truncate text-[13px] font-semibold text-title">{person.name}</b>
                <span className="text-[11px] text-ink-3">{person.role_label}</span>
              </span>
              {person.key === viewedKey ? (
                <Check strokeWidth={1.8} className="h-[14px] w-[14px] shrink-0 text-accent-text" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full cursor-pointer items-center gap-[10px] rounded-xl p-2 hover:bg-accessible-soft ${
          collapsed ? "justify-center" : ""
        }`}
      >
        {inner}
      </button>
    </div>
  );
}
