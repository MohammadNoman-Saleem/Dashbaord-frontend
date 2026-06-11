"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";

/* Toast stack. Mirrors .toasts and .toast from the approved mockup: bottom
   right, trust-ink surface with light text, inverted in dark (near-white
   surface, trust-ink text), icon plus message, pop shadow. Auto-dismisses
   after 4.2 seconds with a short fade. The stack is aria-live polite. On
   mobile (under 880px) toasts go full width above 16px side margins. */

type ToastIcon = ComponentType<{ className?: string; strokeWidth?: number | string }>;

type ToastEntry = {
  id: number;
  message: string;
  icon: ToastIcon;
};

type ToastFn = (message: string, icon?: ToastIcon) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside a ToastProvider");
  return toast;
}

const SHOW_MS = 4200;
const FADE_MS = 300;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const toast = useCallback<ToastFn>((message, icon) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, icon: icon ?? Check }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-[18px] right-[18px] z-[120] flex flex-col gap-2 max-[880px]:left-4 max-[880px]:right-4"
      >
        {toasts.map((entry) => (
          <ToastItem key={entry.id} entry={entry} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ entry, onDone }: { entry: ToastEntry; onDone: (id: number) => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const hide = setTimeout(() => setShown(false), SHOW_MS);
    const drop = setTimeout(() => onDone(entry.id), SHOW_MS + FADE_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
      clearTimeout(drop);
    };
  }, [entry.id, onDone]);

  const Icon = entry.icon;
  return (
    <div
      className={`flex max-w-[340px] items-start gap-[9px] rounded-xl bg-trust-ink px-[15px] py-[11px] text-[13px] text-bg shadow-pop transition-opacity duration-300 max-[880px]:max-w-none [[data-theme=dark]_&]:bg-title [[data-theme=dark]_&]:text-trust-ink ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <Icon strokeWidth={1.8} className="mt-[2px] h-[15px] w-[15px] shrink-0" />
      <span>{entry.message}</span>
    </div>
  );
}
