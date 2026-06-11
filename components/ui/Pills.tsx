import type { ReactNode } from "react";

/* Segmented control. Mirrors .pills from the approved mockup: surface-2
   track with a soft hairline, pill radius, 12px Inter 600 segments. The
   active segment gets a surface background plus a small shadow in light,
   and an accent fill with on-accent text in dark (mockup .pills button
   .active under [data-theme=dark]). Controlled, stateless. */

export type PillItem = {
  key: string;
  label: ReactNode;
};

type PillsProps = {
  items: PillItem[];
  /* Key of the active segment. */
  value: string;
  onChange: (key: string) => void;
  "aria-label"?: string;
  className?: string;
};

export function Pills({ items, value, onChange, className, ...rest }: PillsProps) {
  return (
    <div
      role="group"
      className={`inline-flex gap-[2px] rounded-full border border-line-soft bg-surface-2 p-[3px] ${className ?? ""}`}
      {...rest}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.key)}
            className={`cursor-pointer rounded-full px-[13px] py-[5px] text-xs font-semibold ${
              active
                ? "bg-surface text-title shadow-[0_1px_3px_var(--pulse-line)] [[data-theme=dark]_&]:bg-accent [[data-theme=dark]_&]:text-on-accent"
                : "text-ink-3"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
