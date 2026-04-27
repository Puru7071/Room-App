"use client";

import { AppIcon } from "@/components/icons/AppIcon";

/**
 * Dummy / placeholder for the future group-chat view inside the side
 * panel. Real chat (rendering, send box, message ordering, server
 * subscription) lands in a later plan; today this is a visual stand-in
 * so the tab is reachable.
 *
 * The shared particle backdrop lives in `RoomSidePanel`; this view
 * only renders foreground content.
 */
export function ChatView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <AppIcon
            icon="lucide:message-square"
            className="h-6 w-6 text-muted dark:text-zinc-500"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-muted sm:text-sm dark:text-zinc-500">
            Group chat is coming soon.
          </p>
        </div>
      </div>
      <div className="shrink-0 p-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <input
            type="text"
            placeholder="Send a message…"
            disabled
            className="min-w-0 flex-1 cursor-not-allowed border-0 bg-transparent text-sm text-foreground/70 outline-none placeholder:text-muted disabled:cursor-not-allowed dark:text-zinc-500"
          />
          <AppIcon
            icon="lucide:send"
            className="h-4 w-4 shrink-0 text-muted dark:text-zinc-500"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
