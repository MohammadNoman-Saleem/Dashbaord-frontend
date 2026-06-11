import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

/* Attention banner. Mirrors .banner from the approved mockup: optimism-soft
   surface, gold border, AlertCircle icon (trust ink in light, optimism in
   dark), a bold first line, and a plain explanation. This is the single
   unreliable or needs-attention surface. Severity lives in the words, never
   in an escalating color. There is no red banner by design. */

type BannerProps = {
  /* Bold first line, e.g. "These funnel numbers do not match reality." */
  title: ReactNode;
  /* Plain explanation under the title. */
  children?: ReactNode;
  className?: string;
};

export function Banner({ title, children, className }: BannerProps) {
  return (
    <div
      className={`mb-4 flex items-start gap-[11px] rounded-[13px] border border-optimism bg-optimism-soft px-[15px] py-3 [[data-theme=dark]_&]:border-optimism/30 ${className ?? ""}`}
    >
      <AlertCircle
        strokeWidth={1.8}
        aria-hidden="true"
        className="mt-px h-[17px] w-[17px] shrink-0 text-trust-ink [[data-theme=dark]_&]:text-optimism"
      />
      <div className="min-w-0">
        <b className="text-[13px] text-title">{title}</b>
        {children != null ? <p className="mt-[2px] text-[12.5px] text-ink-2">{children}</p> : null}
      </div>
    </div>
  );
}
