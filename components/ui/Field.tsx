import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/* Form field block: tracked uppercase label, a styled input or select, and
   an optional muted hint line. Layout mirrors .field from the approved
   mockup (5px gap column, 13px bottom margin). Controls sit on surface-2
   with a line border and the inner radius; focus swaps the border for the
   2px accent outline, as in the mockup. */

type FieldProps = {
  label: ReactNode;
  /* id of the control inside, so the label is associated with it. */
  htmlFor: string;
  /* Optional muted helper line under the control. */
  hint?: ReactNode;
  className?: string;
  /* The control, normally a FieldInput or FieldSelect. */
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, className, children }: FieldProps) {
  return (
    <div className={`mb-[13px] flex flex-col gap-[5px] ${className ?? ""}`}>
      <label
        htmlFor={htmlFor}
        className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3"
      >
        {label}
      </label>
      {children}
      {hint != null ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </div>
  );
}

const CONTROL_CLASSES =
  "w-full rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0";

export function FieldInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL_CLASSES} ${className ?? ""}`} {...rest} />;
}

export function FieldSelect({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL_CLASSES} ${className ?? ""}`} {...rest} />;
}
