"use client";

/**
 * Loading placeholder for the "My rooms" popover. Renders three rows of
 * grey rectangles approximating title + last-active + trash-icon, with
 * Tailwind's `animate-pulse` for a subtle shimmer. The number of rows
 * matches the typical loaded state so the popover height doesn't jump
 * when data lands.
 */
export function MyRoomsSkeleton() {
  return (
    <ul className="flex flex-col gap-1" aria-label="Loading your rooms">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-lg px-2 py-2"
          aria-hidden
        >
          <div className="min-w-0 flex-1">
            <div className="h-4 w-40 rounded bg-muted/40 dark:bg-zinc-800/60" />
            <div className="mt-1.5 h-3 w-24 rounded bg-muted/30 dark:bg-zinc-800/50" />
          </div>
          <div className="h-7 w-7 shrink-0 rounded bg-muted/30 dark:bg-zinc-800/50" />
        </li>
      ))}
    </ul>
  );
}
