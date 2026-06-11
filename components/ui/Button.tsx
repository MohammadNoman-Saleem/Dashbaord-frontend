import type { ButtonHTMLAttributes } from "react";

/* Buttons. Mirror .btn and .icon-btn from the approved mockup.
   primary: accent fill, used for ordinary positive actions.
   navy: solid trust ink, used ONLY for destructive confirms with explicit
   wording. In dark it inverts to near white with trust ink text. The dark
   background uses the title token, which resolves to the mockup value there.
   ghost: outline on surface.
   There is no red button in this design system. */

export type ButtonVariant = "primary" | "navy" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-accent text-on-accent hover:brightness-[1.06]",
  navy: "border-transparent bg-trust-ink text-on-accent [[data-theme=dark]_&]:bg-title [[data-theme=dark]_&]:text-trust-ink",
  ghost: "border-line bg-surface text-title hover:border-accent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "rounded-inner px-[14px] py-2 text-[13px]",
  sm: "rounded-[9px] px-[11px] py-[5.5px] text-xs",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center gap-[7px] border font-semibold ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} [&_svg]:h-[15px] [&_svg]:w-[15px] ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* 34px square icon button. Mirrors .icon-btn. An accessible label is
   required because the only content is an icon. */

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  "aria-label": string;
};

export function IconButton({ className, type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-inner border border-transparent text-ink-2 hover:border-line hover:bg-surface hover:text-title [&_svg]:h-[17px] [&_svg]:w-[17px] ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
