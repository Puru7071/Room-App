"use client";

import { useCallback } from "react";
import { publishMomentReactionBurst } from "@/components/client/room/momentReactionBus";
import { getSocket } from "@/lib/ws-client";

/** Quick reactions for the current moment — same vocabulary as live streams. */
const REACTIONS = ["🔥", "❤️", "😂", "👏", "😮", "🎉"] as const;

type MomentReactionRailProps = {
  roomId: string;
};

/**
 * Compact emoji strip on the now-playing card. Emits **optimistic**
 * bursts via `momentReactionBus` (instant overlay) then
 * `room.moment.reaction.send` so peers receive the same `burstId`
 * (deduped on echo). Does **not** subscribe to Zustand — avoids
 * unrelated re-renders across the room UI.
 */
export function MomentReactionRail({ roomId }: MomentReactionRailProps) {
  const onPick = useCallback(
    (emoji: string) => {
      const burstId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      publishMomentReactionBurst(roomId, { emoji, burstId });
      getSocket().emit("room.moment.reaction.send", {
        roomId,
        emoji,
        burstId,
      });
    },
    [roomId],
  );

  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-end gap-px sm:gap-0.5"
      role="toolbar"
      aria-label="React to this moment"
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className={[
            "inline-flex h-8 w-8 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full sm:h-9 sm:w-9",
            "border-0 bg-transparent text-[1.15rem] leading-none select-none transition duration-150 sm:text-[1.35rem]",
            /* Discord / live-chat pattern: no chrome until hover — soft circular wash */
            "hover:bg-zinc-900/10 active:bg-zinc-900/15 active:scale-95 dark:hover:bg-white/12 dark:active:bg-white/18",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50 focus-visible:ring-offset-0",
          ].join(" ")}
          aria-label={`Send ${emoji} reaction`}
        >
          <span aria-hidden className="relative top-[0.5px]">
            {emoji}
          </span>
        </button>
      ))}
    </div>
  );
}
