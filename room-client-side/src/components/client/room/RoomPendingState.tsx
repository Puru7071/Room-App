"use client";

import { AppIcon } from "@/components/icons/AppIcon";

type RoomPendingStateProps = {
  /** The room name, if known from the URL hint or a previous fetch. */
  roomName: string | null;
};

/**
 * Full-screen "waiting for the host to let you in" view shown while a
 * private-room join request is pending. Replaced by the live room view
 * the moment the leader's WS approve event arrives.
 *
 * Keep this view light — it's the user's first impression of the
 * private-room experience. A subtle pulsing icon + a friendly line is
 * enough; no progress bar (the leader's approval is the trigger, not a
 * timer the user controls).
 */
export function RoomPendingState({ roomName }: RoomPendingStateProps) {
  return (
    <div className="fixed inset-0 z-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card shadow-sm">
        <AppIcon
          icon="line-md:loading-twotone-loop"
          className="h-7 w-7 text-accent-blue"
          aria-hidden
        />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <h1 className="text-base font-semibold tracking-tight sm:text-lg">
          Waiting for the host to let you in…
        </h1>
        <p className="text-sm text-muted">
          {roomName
            ? `Your request to join "${roomName}" is on the host's screen.`
            : "Your request is on the host's screen."}
          {" "}You'll join automatically when they approve.
        </p>
      </div>
    </div>
  );
}
