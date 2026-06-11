import type { ComponentType, ReactNode } from "react";

/* List row. Mirrors .list .li and .li-ico from the approved mockup: a 30px
   icon tile with 9px radius, bold 13px first line in the title color, muted
   12px second line, and an optional right slot for a chip or an Open link.

   Tile fills follow the build contract: accessible-soft by default,
   optimism-soft for the warn variant (the only attention state, severity
   carried by the words), recovery-soft for good. Icon color rides
   currentColor, so lucide icons and the BeatIcon both work. */

export type ListRowVariant = "info" | "warn" | "good";

/* Accepts a lucide icon component or BeatIcon. */
type ListRowIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

const TILE_CLASSES: Record<ListRowVariant, string> = {
  info: "bg-accessible-soft text-title",
  warn: "bg-optimism-soft text-trust-ink [[data-theme=dark]_&]:text-optimism",
  good: "bg-recovery-soft text-recovery",
};

type ListRowProps = {
  icon: ListRowIcon;
  variant?: ListRowVariant;
  title: ReactNode;
  subtitle?: ReactNode;
  /* Optional right action, e.g. a Chip or a small link. */
  right?: ReactNode;
  className?: string;
};

export function ListRow({
  icon: Icon,
  variant = "info",
  title,
  subtitle,
  right,
  className,
}: ListRowProps) {
  return (
    <div
      className={`flex items-start gap-[11px] border-b border-line-soft px-0.5 py-2.5 last:border-b-0 ${className ?? ""}`}
    >
      <span
        aria-hidden="true"
        className={`mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] ${TILE_CLASSES[variant]}`}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-[13px] font-semibold text-title">{title}</b>
        {subtitle != null ? <span className="block text-xs text-ink-2">{subtitle}</span> : null}
      </div>
      {right != null ? <span className="shrink-0 self-center">{right}</span> : null}
    </div>
  );
}
