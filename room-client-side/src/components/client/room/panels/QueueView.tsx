"use client";

import { useEffect, useMemo, useRef } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoomQueueEntry } from "@/lib/room-types";
import { useYouTubeOEmbedTitle } from "@/lib/use-youtube-oembed-title";
import { youtubeThumbnailUrl } from "@/lib/youtube";

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

  // Auto-scroll the now-playing row into view ONCE per mount. The user
  // can freely scroll afterwards — we don't yank them back. Because
  // `RoomSidePanel` conditionally renders this component per active
  // tab, switching away and back to the Queue tab counts as a fresh
  // mount and re-fires this effect, which is exactly the "whenever
  // the panel opens" behaviour the user wants.
  const nowRowRef = useRef<HTMLLIElement | null>(null);
  const scrollDoneRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (scrollDoneRef.current) return;
    const node = nowRowRef.current;
    if (!node) return;
    // `block: "center"` puts the now-playing row in the middle of the
    // scroll viewport when there's enough content above and below;
    // when there isn't, the browser clamps to a valid scroll position
    // (e.g., row stays at the top if there are no past items).
    node.scrollIntoView({ block: "center", behavior: "auto" });
    scrollDoneRef.current = true;
  }, [loading]);

  return (
    // The shared particle canvas lives in `RoomSidePanel` so it stays
    // mounted across tab switches; this view only renders the scroll
    // area on top.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              <li
                key={key}
                ref={kind === "now" ? nowRowRef : undefined}
                className="min-w-0"
              >
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
                  disabled={
                    !canControlPlayback && (kind === "past" || kind === "next")
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
