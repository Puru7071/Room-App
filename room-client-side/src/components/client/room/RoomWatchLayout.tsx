"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

type RoomWatchLayoutProps = {
  player: ReactNode;
  queue: ReactNode;
};

/**
 * Desktop: queue column height is locked to the player (16:9) box; overflow scrolls inside the queue.
 * Mobile: stacked column, natural heights.
 */
export function RoomWatchLayout({ player, queue }: RoomWatchLayoutProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const [queueHeightPx, setQueueHeightPx] = useState<number | null>(null);

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
      <div ref={playerRef} className="min-h-0 min-w-0 flex-1 overflow-visible">
        {player}
      </div>
      <div
        className="flex min-h-0 w-full min-w-0 shrink-0 flex-col lg:w-[min(100%,402px)] lg:overflow-hidden"
        style={
          queueHeightPx != null
            ? { height: queueHeightPx, maxHeight: queueHeightPx }
            : undefined
        }
      >
        {queue}
      </div>
    </div>
  );
}
