"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/* Small inline copy control. Renders a copy icon; on click it writes `value`
   to the clipboard and briefly swaps to a check. An accessible label is
   required since the only content is an icon. Self-contained: no toast or
   context dependency, so it can sit beside any value (a phone number, an id).
   On a browser without clipboard access (permissions or an insecure context)
   the click is a no-op rather than a false "copied". */

type CopyButtonProps = {
  /** The exact text written to the clipboard. */
  value: string;
  /** Accessible label and tooltip, e.g. "Copy phone number". */
  label?: string;
  className?: string;
};

export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; leave the icon unchanged.
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={`inline-grid h-[22px] w-[22px] shrink-0 cursor-pointer place-items-center rounded-[7px] border border-transparent text-ink-3 hover:border-line hover:bg-surface hover:text-title [&_svg]:h-[13px] [&_svg]:w-[13px] ${className ?? ""}`}
    >
      {copied ? (
        <Check strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Copy strokeWidth={1.8} aria-hidden="true" />
      )}
    </button>
  );
}
