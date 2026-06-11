"use client";

/* The heartbeat strip, the signature element (spec 02 section 7). One SVG
   line spans the strip, flat at the vertical center, with an ECG pulse drawn
   at each active blip. Data comes from GET /api/pulse on a 5 minute refetch
   interval. Popover title and text render verbatim from the API; the backend
   owns the plain phrasing so the MCP and the web app say the same thing. */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import type { PulseBlip, PulseData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";
import { fmtTime } from "@/lib/format/datetime";
import { blipPositions, pulsePath } from "@/lib/pulse";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";

/* The strip never shows more than 4 blips (spec section 7). */
const MAX_BLIPS = 4;

/* Halo keyframes live with the component so it stays portable. Colors come
   from tokens only. The global prefers-reduced-motion rule in globals.css
   (animation: none !important) removes the halo entirely. */
const HALO_CSS = `
@keyframes pulse-halo {
  0% { box-shadow: 0 0 0 0 var(--optimism-soft); }
  70% { box-shadow: 0 0 0 12px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.pulse-halo { animation: pulse-halo 2.4s ease-out infinite; }
`;

type PopoverState = {
  /* Index into the sliced blip list. */
  index: number;
  /* Pixel offsets inside the strip container. */
  left: number;
  top: number;
};

function StripSkeleton() {
  return (
    <>
      <div className="relative h-9 min-w-0 flex-1">
        <Skeleton height={2} className="absolute top-1/2 -translate-y-1/2" />
      </div>
      <Skeleton width={150} height={12} />
    </>
  );
}

/* 22px round button sitting on the line at its blip position: Optimism fill,
   2px Trust border (the title token, matching the mockup in both themes),
   soft 2.4s halo. */
function BlipButton({
  blip,
  leftPct,
  onOpen,
}: {
  blip: PulseBlip;
  leftPct: number;
  onOpen: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      aria-label={blip.title}
      className="pulse-halo absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 border-title bg-optimism hover:scale-[1.12]"
      style={{ left: `${leftPct}%` }}
      onClick={(event) => onOpen(event.currentTarget)}
    />
  );
}

export function PulseStrip() {
  const router = useRouter();
  const stripRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /* The blip button that opened the popover, so focus can restore on close. */
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const query = useQuery({
    queryKey: qk.pulse(),
    queryFn: () => fetchEnvelope<PulseData>("pulse", "/pulse"),
    refetchInterval: 5 * 60 * 1000,
  });

  /* Anchor the popover under the clicked blip, clamped inside the strip:
     left = clamp(8, blipLeft - 140, width - 310), top = blip bottom + 10. */
  const openBlip = (index: number, button: HTMLButtonElement) => {
    const strip = stripRef.current;
    if (!strip) return;
    const stripRect = strip.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(buttonRect.left - stripRect.left - 140, stripRect.width - 310));
    const top = buttonRect.bottom - stripRect.top + 10;
    triggerRef.current = button;
    setPopover({ index, left, top });
  };

  const closeAndRestore = () => {
    setPopover(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  };

  /* View navigates route plus tab plus focus. The "view as" person carries
     through so admins stay in the viewed person's context. Read at click time
     from the URL (?as= per 03 section 3) so this leaf component needs no
     Suspense boundary for useSearchParams. */
  const handleView = (blip: PulseBlip) => {
    setPopover(null);
    triggerRef.current = null;
    const currentAs = new URLSearchParams(window.location.search).get("as") ?? undefined;
    router.push(buildDeepLink(blip.link, currentAs));
  };

  /* While open: focus moves into the dialog, Escape closes and restores
     focus, a pointer press outside closes without stealing focus. */
  useEffect(() => {
    if (popover === null) return;
    dialogRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const dialog = dialogRef.current;
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) {
        setPopover(null);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopover(null);
        triggerRef.current?.focus();
        triggerRef.current = null;
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [popover]);

  /* Keep Tab cycling between Dismiss and View while the popover is open. */
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const buttons = dialog.querySelectorAll<HTMLButtonElement>("button");
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={stripRef}
      className="relative flex items-center gap-[14px] rounded-[14px] border border-line-soft bg-surface px-4 py-2 shadow-card max-[880px]:flex-wrap"
    >
      <style>{HALO_CSS}</style>
      <span className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[.1em] text-ink-3 max-[880px]:hidden">
        System pulse
      </span>
      <QueryPanel query={query} skeleton={<StripSkeleton />}>
        {(data) => {
          const blips = data.blips.slice(0, MAX_BLIPS);
          const positions = blipPositions(blips.length);
          const active = popover === null ? undefined : blips[popover.index];
          return (
            <>
              <div className="relative h-9 min-w-0 flex-1">
                <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true" className="h-full w-full">
                  <path
                    d={pulsePath(positions)}
                    fill="none"
                    stroke="var(--pulse-line)"
                    strokeWidth={1.6}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {blips.map((blip, i) => (
                  <BlipButton key={blip.key} blip={blip} leftPct={positions[i]} onOpen={(button) => openBlip(i, button)} />
                ))}
              </div>
              <div className="flex items-center gap-[10px] whitespace-nowrap text-xs text-ink-2">
                {blips.length === 0 ? (
                  <span>All steady · Updated {fmtTime(data.updated_at)}</span>
                ) : (
                  <>
                    <Chip variant="warn">{data.blips.length} need attention</Chip>
                    <span className="num">Everything else steady</span>
                  </>
                )}
              </div>
              {popover !== null && active ? (
                <div
                  ref={dialogRef}
                  role="dialog"
                  aria-label="Attention detail"
                  tabIndex={-1}
                  onKeyDown={onDialogKeyDown}
                  className="absolute z-[60] w-[300px] max-w-[calc(100vw-32px)] rounded-[14px] border border-line bg-surface p-[14px] shadow-pop"
                  style={{ left: popover.left, top: popover.top }}
                >
                  <h4 className="mb-1 text-[13px] font-bold text-title">{active.title}</h4>
                  <p className="mb-[10px] text-[12.5px] text-ink-2">{active.text}</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={closeAndRestore}>
                      Dismiss
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => handleView(active)}>
                      View
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          );
        }}
      </QueryPanel>
    </div>
  );
}
