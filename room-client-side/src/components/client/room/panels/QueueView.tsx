"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoomQueueEntry } from "@/lib/room-types";
import { useYouTubeOEmbedTitle } from "@/lib/use-youtube-oembed-title";
import { youtubeThumbnailUrl } from "@/lib/youtube";

/**
 * The queue body — virtualized scroller of past / now / next rows.
 * Uses `react-virtuoso` for real DOM virtualization (only the
 * visible rows mount, regardless of how many entries exist).
 *
 * On scroll-down past the visible cues, a brief skeleton flashes via
 * Virtuoso's `Footer` slot (~300 ms) before the next chunk reveals
 * from the local state. Cosmetic — no network or DB hit; the data is
 * already on the client. Mirrors the chat panel's top-skeleton
 * vocabulary so both panels read as one design system.
 *
 * On mount (every Queue-tab activation; `RoomSidePanel`
 * unmounts/remounts the active tab), Virtuoso anchors the now-playing
 * row centered in the viewport via `scrollToIndex({ align: "center" })`.
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
   * Whether the requester is allowed to drive playback. When false the
   * past/next rows are non-interactive AND visually marked with a
   * not-allowed cursor on hover. Drives the disabled affordance even
   * though `onJump` is independently undefined in the same case.
   */
  canControlPlayback?: boolean;
  /**
   * `true` while the queue is being fetched from the server on page
   * mount. Renders skeleton placeholder rows instead of the empty
   * "Add a YouTube link above." copy so the user sees a real loading
   * affordance during the initial load.
   */
  loading?: boolean;
};

type RowKind = "past" | "now" | "next";

type RowModel = {
  kind: RowKind;
  entry: RoomQueueEntry;
  key: string;
  pastIndex?: number;
  cueIndex?: number;
};

/** Initial windowed slice handed to Virtuoso. */
const INITIAL_RENDER_COUNT = 20;
/** How many more rows to reveal per scroll-down "load". */
const RENDER_CHUNK = 20;
/** Cosmetic skeleton-flash duration (ms) before the next chunk reveals. */
const SKELETON_MS = 300;

function QueueListRow({
  entry,
  kind,
  onActivate,
  disabled = false,
}: {
  entry: RoomQueueEntry;
  kind: RowKind;
  onActivate?: () => void;
  /**
   * Marks past/next rows that *would* be clickable but the requester
   * lacks playback authority. Renders a non-interactive `<div>` with a
   * `cursor-not-allowed` hint instead of the regular pointer.
   */
  disabled?: boolean;
}) {
  const title = useYouTubeOEmbedTitle(entry.videoId);

  // Rows are intentionally TRANSPARENT so the panel's particle
  // background drifts visibly behind them. The "now" row keeps a thin
  // translucent amber wash for differentiation; past/next rows reveal
  // their state via the play-glyph + grayscale-thumbnail (past) and
  // a subtle hover-only tint, never a solid fill.
  const rowClass =
    kind === "now"
      ? "bg-amber-500/[0.10] hover:bg-amber-500/[0.16] dark:bg-amber-500/[0.10] dark:hover:bg-amber-500/[0.16]"
      : kind === "past"
        ? "bg-transparent opacity-[0.85] hover:bg-foreground/[0.04] hover:opacity-100 dark:opacity-[0.70] dark:hover:bg-zinc-100/[0.04] dark:hover:opacity-90"
        : "bg-transparent hover:bg-foreground/[0.04] dark:hover:bg-zinc-100/[0.04]";

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
    // Non-interactive row. For past/next rows that are disabled because
    // the requester lacks playback authority, surface a `cursor-not-allowed`
    // hint so hovering over the row reads as "you can't act on this".
    const cursorClass = disabled ? "cursor-not-allowed" : "";
    return (
      <div
        className={`flex min-h-0 w-full items-stretch gap-2 py-2 pl-1 pr-0 ${rowClass} ${cursorClass}`}
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
  canControlPlayback = true,
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

  // Index of the "now" row inside `rows`. -1 if there's nothing
  // playing. Used as Virtuoso's anchor on mount.
  const nowPlayingRowIndex = useMemo(
    () => rows.findIndex((r) => r.kind === "now"),
    [rows],
  );

  // Soft cap on what we hand Virtuoso so the bottom-skeleton
  // flourish has something to reveal as the user scrolls down. The
  // initial cap covers past + now + a buffer of upcoming cues; we
  // expand by `RENDER_CHUNK` per `endReached`.
  const [renderedCount, setRenderedCount] = useState(() =>
    Math.max(INITIAL_RENDER_COUNT, (nowPlayingRowIndex >= 0 ? nowPlayingRowIndex + 1 : 0) + 10),
  );
  const [skeletonActive, setSkeletonActive] = useState(false);

  const view = useMemo(
    () => rows.slice(0, Math.min(renderedCount, rows.length)),
    [rows, renderedCount],
  );

  // Imperative scroll-to-now on mount. `initialTopMostItemIndex`
  // pins the now row to the TOP of the viewport, so we follow up
  // with a centered scroll for the "now in the middle" effect.
  // Fires once per mount; tab toggle remounts QueueView, so the
  // "scroll to current whenever the panel opens" behavior is preserved.
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollDoneRef = useRef(false);
  useLayoutEffect(() => {
    if (loading) return;
    if (scrollDoneRef.current) return;
    if (nowPlayingRowIndex < 0) return;
    virtuosoRef.current?.scrollToIndex({
      index: nowPlayingRowIndex,
      align: "center",
      behavior: "auto",
    });
    scrollDoneRef.current = true;
  }, [loading, nowPlayingRowIndex]);

  const handleScrolledToBottom = useCallback(() => {
    if (renderedCount >= rows.length) return;
    if (skeletonActive) return;
    setSkeletonActive(true);
    window.setTimeout(() => {
      setRenderedCount((c) => Math.min(c + RENDER_CHUNK, rows.length));
      setSkeletonActive(false);
    }, SKELETON_MS);
  }, [renderedCount, rows.length, skeletonActive]);

  return (
    // The shared particle canvas lives in `RoomSidePanel` so it stays
    // mounted across tab switches; this view only renders the scroll
    // area on top.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="room-queue-scroll min-h-0 flex-1 rounded-md">
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
          <Virtuoso
            ref={virtuosoRef}
            data={view}
            endReached={handleScrolledToBottom}
            initialTopMostItemIndex={Math.max(0, nowPlayingRowIndex)}
            components={{
              Footer: () =>
                skeletonActive ? <QueueRowSkeletons count={3} /> : null,
            }}
            itemContent={(_index, row) => (
              <div className="min-w-0">
                <QueueListRow
                  entry={row.entry}
                  kind={row.kind}
                  onActivate={
                    onJump && row.kind === "past" && row.pastIndex !== undefined
                      ? () => onJump({ zone: "past", index: row.pastIndex! })
                      : onJump && row.kind === "next" && row.cueIndex !== undefined
                        ? () => onJump({ zone: "next", index: row.cueIndex! })
                        : undefined
                  }
                  disabled={
                    !canControlPlayback &&
                    (row.kind === "past" || row.kind === "next")
                  }
                />
              </div>
            )}
          />
        )}
      </div>
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
          <SkeletonRowMarkup />
        </li>
      ))}
    </ul>
  );
}

/**
 * Bottom-skeleton flourish shown briefly during scroll-down via
 * Virtuoso's `Footer` slot. Cosmetic — the data is already on the
 * client; the flash makes scroll-down feel intentional.
 */
function QueueRowSkeletons({ count }: { count: number }) {
  return (
    <ul className="list-none space-y-0 py-1.5 pl-0 pr-0 sm:py-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="min-w-0">
          <SkeletonRowMarkup />
        </li>
      ))}
    </ul>
  );
}

/** Shared row markup used by both the initial-fetch skeleton and the
 *  scroll-down flourish so the two skeletons read identically. */
function SkeletonRowMarkup() {
  return (
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
  );
}
