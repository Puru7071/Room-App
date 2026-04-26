"use client";

type DurationBadgeProps = {
  /** Pre-formatted duration string, e.g. `"4:39"` or `"1:02:14"`. */
  duration: string;
  /** Visual size — `xs` for the search-result thumbnails, `sm`
   *  (default) for the populated now-playing thumbnail. */
  size?: "sm" | "xs";
};

/**
 * Standard YouTube-style duration pill anchored to the bottom-right
 * of a thumbnail. The parent must be `position: relative`.
 */
export function DurationBadge({ duration, size = "sm" }: DurationBadgeProps) {
  const sizeClass =
    size === "xs"
      ? "bottom-0.5 right-0.5 px-1 py-0 text-[9px]"
      : "bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`pointer-events-none absolute inline-flex items-center rounded bg-black/80 font-semibold tabular-nums text-white ${sizeClass}`}
    >
      {duration}
    </span>
  );
}
