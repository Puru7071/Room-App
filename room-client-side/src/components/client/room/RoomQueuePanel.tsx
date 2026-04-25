"use client";

import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoomQueueEntry } from "@/lib/room-types";
import {
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "@/lib/youtube";

type QueueJumpPayload =
  | { zone: "past"; index: number }
  | { zone: "next"; index: number };

type RoomQueuePanelProps = {
  past: RoomQueueEntry[];
  nowPlaying: RoomQueueEntry | null;
  cues: RoomQueueEntry[];
  sessionStarted: boolean;
  phase: "default" | "playing" | "stopped";
  onJump?: (payload: QueueJumpPayload) => void;
  className?: string;
};

type RowKind = "past" | "now" | "next";

type RowModel = {
  kind: RowKind;
  entry: RoomQueueEntry;
  key: string;
  pastIndex?: number;
  cueIndex?: number;
};

function useYouTubeOEmbedTitle(videoId: string) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    setTitle(null);
    let cancelled = false;
    const watch = youtubeWatchUrl(videoId);
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("oembed"))))
      .then((data: { title?: string }) => {
        if (!cancelled && data.title) setTitle(data.title);
      })
      .catch(() => {
        if (!cancelled) setTitle("YouTube video");
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return title;
}

function QueueListRow({
  entry,
  kind,
  onActivate,
}: {
  entry: RoomQueueEntry;
  kind: RowKind;
  onActivate?: () => void;
}) {
  const title = useYouTubeOEmbedTitle(entry.videoId);

  const rowClass =
    kind === "now"
      ? "bg-amber-500/[0.12] hover:bg-amber-500/[0.16] dark:bg-[#1f1b12] dark:hover:bg-[#252016]"
      : kind === "past"
        ? "bg-card opacity-[0.92] hover:opacity-100 dark:bg-[#0f0f0f] dark:opacity-[0.72] dark:hover:opacity-90"
        : "bg-card hover:bg-zinc-50/90 dark:bg-[#0f0f0f] dark:hover:bg-zinc-900/90";

  /** Fixed width so “now” play glyph lines up with past/upcoming thumbnails. */
  const playColumnClass = "flex w-5 shrink-0 items-center justify-center self-center";

  const inner = (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className={playColumnClass}>
          {kind === "now" ? (
            <AppIcon
              icon="ri:play-fill"
              className="h-4 w-4 text-foreground dark:text-white"
              aria-hidden
            />
          ) : null}
        </div>
        <div className="relative h-18 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-900 sm:h-[3.9rem] sm:w-27">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={youtubeThumbnailUrl(entry.videoId, "mqdefault")}
            alt=""
            className={`h-full w-full object-cover ${
              kind === "past" ? "grayscale contrast-[0.92]" : ""
            }`}
            loading="lazy"
          />
        </div>
      </div>

      <div className="min-w-0 flex-1 self-center">
        <p
          className={`line-clamp-2 text-sm font-semibold leading-snug ${
            kind === "past"
              ? "text-foreground/80 dark:text-zinc-400"
              : "text-foreground dark:text-white"
          }`}
        >
          {title ?? "\u00a0"}
        </p>
        <p className="mt-1 truncate text-xs text-muted dark:text-[#aaaaaa]">
          Added by {entry.addedByName}
        </p>
      </div>
    </>
  );

  if (kind === "now" || !onActivate) {
    return (
      <div
        className={`flex min-h-0 w-full items-stretch gap-2 py-2 pl-1 pr-0 ${rowClass}`}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={`flex min-h-0 w-full cursor-pointer items-stretch gap-2 py-2 pl-1 pr-0 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 focus-visible:ring-offset-0 dark:focus-visible:ring-zinc-500 ${rowClass}`}
    >
      {inner}
    </button>
  );
}

export function RoomQueuePanel({
  past,
  nowPlaying,
  cues,
  sessionStarted,
  phase,
  onJump,
  className = "",
}: RoomQueuePanelProps) {
  const rows = useMemo((): RowModel[] => {
    const out: RowModel[] = [];
    past.forEach((entry, i) => {
      out.push({ kind: "past", entry, key: entry.clipId, pastIndex: i });
    });
    if (sessionStarted && phase === "playing" && nowPlaying) {
      out.push({ kind: "now", entry: nowPlaying, key: nowPlaying.clipId });
    }
    cues.forEach((entry, i) => {
      out.push({ kind: "next", entry, key: entry.clipId, cueIndex: i });
    });
    return out;
  }, [past, nowPlaying, cues, sessionStarted, phase]);

  return (
    <div
      className={`flex h-full rounded-md min-h-0 flex-col overflow-hidden border border-border bg-zinc-100 text-foreground shadow-sm dark:border-zinc-800 dark:bg-[#0f0f0f] dark:text-zinc-100 ${className}`}
    >
      <div className="flex shrink-0 items-center justify-start gap-2 py-2.5 pl-2.5 pr-0 sm:pl-3">
        <AppIcon
          icon="lucide:list-video"
          className="h-5 w-5 shrink-0 text-muted dark:text-zinc-400"
          aria-hidden
        />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-zinc-500">
          Queue
        </p>
      </div>

      <div className="room-queue-scroll rounded-md min-h-0 flex-1 overflow-y-auto">
        {!sessionStarted ? (
          <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted sm:text-sm dark:text-zinc-500">
            Add a YouTube link above.
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted sm:text-sm dark:text-zinc-500">
            {phase === "stopped"
              ? "Nothing playing. Add a link to start again."
              : "Queue is empty—add links from the bar above."}
          </p>
        ) : (
          <ul className="list-none space-y-0 py-1.5 pl-0 pr-0 sm:py-2">
            {rows.map(({ kind, entry, key, pastIndex, cueIndex }) => (
              <li key={key} className="min-w-0">
                <QueueListRow
                  entry={entry}
                  kind={kind}
                  onActivate={
                    onJump && kind === "past" && pastIndex !== undefined
                      ? () => onJump({ zone: "past", index: pastIndex })
                      : onJump && kind === "next" && cueIndex !== undefined
                        ? () => onJump({ zone: "next", index: cueIndex })
                        : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
