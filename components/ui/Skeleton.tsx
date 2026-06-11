/* Loading skeleton block. Per the spec, loading states are plain skeleton
   blocks matching the card layout. No shimmer, no spinners. Spinners do not
   exist in this design system. */

type SkeletonProps = {
  /* CSS width. Numbers are px. Defaults to full width. */
  width?: number | string;
  /* CSS height. Numbers are px. */
  height?: number | string;
  className?: string;
};

export function Skeleton({ width = "100%", height = 14, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-inner bg-surface-2 ${className ?? ""}`}
      style={{ width, height }}
    />
  );
}
