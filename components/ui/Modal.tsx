"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

/* Centered modal. Mirrors .modal-scrim and .modal from the approved mockup:
   trust-ink scrim at half opacity, 430px surface panel with 18px radius and
   the pop shadow. Escape and a scrim click close it. Focus moves to the
   first focusable element on open, stays trapped inside, and returns to the
   opener on close. */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /* Required: the dialog has no implicit name. */
  "aria-label": string;
  className?: string;
  children: ReactNode;
};

export function Modal({ open, onClose, className, children, ...rest }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => {
      restoreRef.current?.focus();
      restoreRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleScrimMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-trust-ink/50 p-[18px]"
      onMouseDown={handleScrimMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`w-[430px] max-w-full rounded-[18px] border border-line bg-surface p-5 shadow-pop ${className ?? ""}`}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}

/* Helpers matching the mockup's modal anatomy: serif 17px title, 13px muted
   intro line, and a right-aligned button row. */

export function ModalTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-[5px] text-[17px]">{children}</h3>;
}

export function ModalText({ children }: { children: ReactNode }) {
  return <p className="mb-[15px] text-[13px] text-ink-2">{children}</p>;
}

export function ModalRow({ children }: { children: ReactNode }) {
  return <div className="mt-[6px] flex justify-end gap-2">{children}</div>;
}
