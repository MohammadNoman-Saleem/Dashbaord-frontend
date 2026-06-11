import type { HTMLAttributes, ReactNode } from "react";

/* Card surface, header, and footer. Mirrors .card, .card-h, and .card .foot
   from the approved mockup. Body padding is left to the consumer because the
   mockup varies it per panel (.card-b is 13px 18px 16px, tight is 8px top). */

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-card border border-line-soft bg-surface shadow-card ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function CardHeader({ title, subtitle, right, className }: CardHeaderProps) {
  return (
    <div
      className={`flex items-start justify-between gap-[10px] px-[18px] pt-[15px] ${className ?? ""}`}
    >
      <div className="min-w-0">
        <h3 className="serif text-[15.5px] leading-[1.3] text-title">{title}</h3>
        {subtitle != null ? (
          <p className="mt-[2px] font-sans text-xs text-ink-3">{subtitle}</p>
        ) : null}
      </div>
      {right != null ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

type CardFooterProps = {
  /* Muted note on the left. Children are used when note is not given. */
  note?: ReactNode;
  /* Optional link or control on the right. */
  right?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function CardFooter({ note, right, className, children }: CardFooterProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-[18px] pt-[10px] pb-[14px] text-xs text-ink-3 ${className ?? ""}`}
    >
      <span className="min-w-0">{note ?? children}</span>
      {right != null ? <span className="shrink-0">{right}</span> : null}
    </div>
  );
}
