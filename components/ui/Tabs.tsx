import type { ReactNode } from "react";

/* Bottom-border indicator tabs. Mirror .tabs from the approved mockup:
   13px Inter 600, ink-3 at rest, title on hover, and the active tab gets
   title color plus a 2px accent bottom border that overlaps the 1px track
   line. Controlled component, no internal state, so consumers (client
   components) own the selection. */

export type TabItem = {
  key: string;
  label: ReactNode;
};

type TabsProps = {
  items: TabItem[];
  /* Key of the active tab. */
  value: string;
  onChange: (key: string) => void;
  "aria-label"?: string;
  className?: string;
};

export function Tabs({ items, value, onChange, className, ...rest }: TabsProps) {
  return (
    <div
      role="tablist"
      className={`mb-4 flex gap-1 overflow-x-auto border-b border-line ${className ?? ""}`}
      {...rest}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-[14px] py-[9px] text-[13px] font-semibold ${
              active ? "border-accent text-title" : "border-transparent text-ink-3 hover:text-title"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
