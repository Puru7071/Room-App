"use client";

import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoomQueueEntry } from "@/lib/room-types";
import {
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "@/lib/youtube";

/**
 * The queue body — scrollable list of past / now / next rows. The outer
 * chrome and heading row live one level up in `RoomSidePanel`; this view
 * is just the scroll area.
 */

type QueueJumpPayload =
  | { zone: "past"; index: number }
  | { zone: "next"; index: number };

export type QueueViewProps = {
  past: RoomQueueEntry[];
  nowPlaying: RoomQueueEntry | null;
  cues: RoomQueueEntry[];
  sessionStarted: boolean;
  phase: "default" | "playing" | "stopped";
  onJump?: (payload: QueueJumpPayload) => void;
  /**
   * `true` while the queue is being fetched from the server on page
   * mount. Renders skeleton placeholder rows instead of the empty
   * "Add a YouTube link above." copy so the user sees a real loading
   * affordance during the initial load.
   */
  loading?: boolean;
};

/**
 * Process-wide cache of YouTube oEmbed titles. Persisted across
 * unmounts (e.g. switching between Chat/Queue tabs) so titles don't
 * blink-and-refetch on every re-mount. Keyed by videoId.
 */
const titleCache = new Map<string, string>();

type RowKind = "past" | "now" | "next";

type RowModel = {
  kind: RowKind;
  entry: RoomQueueEntry;
  key: string;
  pastIndex?: number;
  cueIndex?: number;
};

function useYouTubeOEmbedTitle(videoId: string) {
  // Seed from the module cache so a row that re-mounts (e.g. tab
  // toggle) reads the title synchronously and never flashes "loading".
  const [title, setTitle] = useState<string | null>(
    () => titleCache.get(videoId) ?? null,
  );

  useEffect(() => {
    const cached = titleCache.get(videoId);
    if (cached) {
      setTitle(cached);
      return;
    }
    setTitle(null);
    let cancelled = false;
    const watch = youtubeWatchUrl(videoId);
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("oembed"))))
      .then((data: { title?: string }) => {
        if (cancelled) return;
        const t = data.title ?? "YouTube video";
        titleCache.set(videoId, t);
        setTitle(t);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = "YouTube video";
        titleCache.set(videoId, fallback);
        setTitle(fallback);
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
          {title === null ? (
            <span className="inline-flex w-full flex-col gap-1.5 py-0.5 align-middle" aria-hidden>
              <span className="block h-3 w-11/12 animate-pulse rounded bg-muted/40 dark:bg-zinc-800/60" />
              <span className="block h-3 w-7/12 animate-pulse rounded bg-muted/40 dark:bg-zinc-800/60" />
            </span>
          ) : (
            title
          )}
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

export function QueueView({
  past,
  nowPlaying,
  cues,
  sessionStarted,
  phase,
  onJump,
  loading = false,
}: QueueViewProps) {
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
    <div className="room-queue-scroll rounded-md min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <QueueListSkeleton />
      ) : !sessionStarted ? (
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
  );
}

/**
 * Three placeholder rows shown while the queue is being fetched from
 * the server on page load. Sized to match the real `QueueListRow`
 * footprint so the panel doesn't jump when the data lands.
 */
function QueueListSkeleton() {
  return (
    <ul className="list-none space-y-0 py-1.5 pl-0 pr-0 sm:py-2" aria-label="Loading queue">
      {[0, 1, 2].map((i) => (
        <li key={i} className="min-w-0">
          <div
            className="flex min-h-0 w-full animate-pulse items-stretch gap-2 py-2 pl-1 pr-0"
            aria-hidden
          >
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex w-5 shrink-0 items-center justify-center self-center" />
              <div className="h-18 w-20 shrink-0 rounded-md bg-muted/40 dark:bg-zinc-800/60 sm:h-[3.9rem] sm:w-27" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <div className="h-3 w-11/12 rounded bg-muted/40 dark:bg-zinc-800/60" />
              <div className="h-3 w-7/12 rounded bg-muted/40 dark:bg-zinc-800/60" />
              <div className="mt-1 h-2.5 w-5/12 rounded bg-muted/30 dark:bg-zinc-800/50" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
