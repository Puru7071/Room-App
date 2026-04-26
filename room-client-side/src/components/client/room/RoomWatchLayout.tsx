"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

type RoomWatchLayoutProps = {
  player: ReactNode;
  /** Now-playing card. Sits under the player only — never under the queue. */
  nowPlaying: ReactNode;
  queue: ReactNode;
  /**
   * Optional second panel rendered beneath the queue in the right
   * column. When present it gets a fixed band; when absent the queue
   * keeps its previous behaviour (filling the column alone).
   */
  bottomPanel?: ReactNode;
};

/**
 * Desktop (lg+):
 *   - Left column: player on top, now-playing card directly below it.
 *   - Right column: queue (height-locked to the player's bounding box,
 *     same as before) + optional bottomPanel BELOW that, sitting in
 *     the area parallel to the now-playing card on the left. The
 *     column itself is **not** height-locked — only the queue is — so
 *     the bottomPanel extends down naturally to fill the empty space.
 *
 * Mobile: stacked column — player → now-playing → queue → bottomPanel.
 *
 * **No page scroll.** The wrappers use `min-h-0`, the now-playing card
 * sets a fixed height, and the player flexes into the remaining space.
 */
export function RoomWatchLayout({
  player,
  nowPlaying,
  queue,
  bottomPanel,
}: RoomWatchLayoutProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const [queueHeightPx, setQueueHeightPx] = useState<number | null>(null);

  // Mirror the original height-syncing behaviour: lock the queue's
  // visual height to the player's actual rendered height on lg+. ResizeObserver
  // keeps it in step as the viewport changes.
  useLayoutEffect(() => {
    const el = playerRef.current;
    if (!el || typeof window === "undefined") return;

    const lg = window.matchMedia("(min-width: 1024px)");

    const measure = () => {
      if (!lg.matches) {
        setQueueHeightPx(null);
        return;
      }
      setQueueHeightPx(el.getBoundingClientRect().height);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    lg.addEventListener("change", measure);
    measure();

    return () => {
      ro.disconnect();
      lg.removeEventListener("change", measure);
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-4 sm:px-8 lg:flex-row lg:items-start lg:gap-x-6">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-2.5">
        <div ref={playerRef} className="min-h-0 min-w-0 flex-1 overflow-visible">
          {player}
        </div>
        <div className="min-w-0 shrink-0">{nowPlaying}</div>
      </div>
      <div className="flex min-h-0 w-full min-w-0 shrink-0 flex-col gap-2 sm:gap-2.5 lg:w-[min(100%,402px)]">
        {/* Queue: height-locked to the player on lg+ so it visually
            mirrors the player's height like before. The lock lives on
            this inner div now (not the column), letting the column
            itself extend below to host the bottom panel. */}
        <div
          className="min-h-0 lg:overflow-hidden"
          style={
            queueHeightPx != null
              ? { height: queueHeightPx, maxHeight: queueHeightPx }
              : undefined
          }
        >
          {queue}
        </div>
        {/* Bottom panel: sits in the right-column area parallel to the
            now-playing card on the left. `shrink-0` so it sizes to its
            content; pages can pad it via the panel's own classes. */}
        {bottomPanel ? (
          <div className="min-w-0 shrink-0">{bottomPanel}</div>
        ) : null}
      </div>
    </div>
  );
}
