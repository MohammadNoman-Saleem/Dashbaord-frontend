"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";

/* Theme switch. Mirrors .theme-tabs from the approved mockup: a pill-shaped
   segmented control on the surface with Light and Dark buttons, Sun and
   Moon icons, and aria-pressed on the active side. The pressed segment
   fills with accent and on-accent text in both themes. */

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeTabs({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className={`flex gap-[2px] rounded-full border border-line bg-surface p-[3px] ${className ?? ""}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className="flex cursor-pointer items-center gap-[6px] rounded-full px-[11px] py-[5px] text-xs font-semibold text-ink-3 aria-pressed:bg-accent aria-pressed:text-on-accent"
        >
          <Icon strokeWidth={1.8} className="h-[13px] w-[13px]" />
          {label}
        </button>
      ))}
    </div>
  );
}
