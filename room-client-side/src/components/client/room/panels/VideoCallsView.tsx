"use client";

import { AppIcon } from "@/components/icons/AppIcon";

/**
 * Dummy / placeholder for the future video-calls view inside the side
 * panel. Renders a 2×2 grid of card placeholders so the tab has visible
 * content; real WebRTC + SFU wiring lands in a later plan.
 */
export function VideoCallsView() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <PlaceholderCallCard key={i} />
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted dark:text-zinc-500">
        Video calls are coming soon.
      </p>
    </div>
  );
}

function PlaceholderCallCard() {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-card shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600">
          <AppIcon icon="lucide:user" className="h-5 w-5" aria-hidden />
        </div>
        <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <AppIcon
            icon="lucide:mic-off"
            className="h-2.5 w-2.5"
            aria-hidden
          />
          <span>—</span>
        </div>
      </div>
    </div>
  );
}
