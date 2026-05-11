"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { MomentReactionRail } from "@/components/client/room/MomentReactionRail";
import { getVideoMeta, type YouTubeVideoMeta } from "@/lib/youtube-api";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import { DurationBadge } from "./DurationBadge";

type RoomNowPlayingCardProps = {
  roomId: string;
  /** The currently playing video. `null` when nothing is playing yet. */
  videoId: string | null;
  /** Display name attached to the queue entry that started this play. */
  addedByName: string | null;
};

/**
 * Now-playing card under the player. **Same fixed height in both
 * empty and populated states** so the page never reflows when a video
 * starts or ends:
 *
 *   `h-[148px] sm:h-[148px]`
 *
 * **Populated**: thumbnail rendered twice — once as a heavily blurred
 * backdrop covering the whole card, once crisply on the left. A
 * left-to-right dark gradient overlays the backdrop so text on the
 * right stays readable.
 *
 * **Moment reactions** replace legacy view/like counts — quick emoji
 * strip on the bottom-right of the card text column (dispatches to
 * room store for future WS sync).
 */
const CARD_HEIGHT = "h-[148px] sm:h-[148px]";

export function RoomNowPlayingCard({
  roomId,
  videoId,
  addedByName,
}: RoomNowPlayingCardProps) {
  const [meta, setMeta] = useState<YouTubeVideoMeta | null>(null);

  useEffect(() => {
    setMeta(null);
    if (!videoId) return;
    let cancelled = false;
    (async () => {
      const result = await getVideoMeta(videoId);
      if (cancelled || !result.ok) return;
      setMeta(result.video);
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (!videoId) return <EmptyCard />;

  return (
    <PlayingCard
      roomId={roomId}
      videoId={videoId}
      addedByName={addedByName}
      meta={meta}
    />
  );
}

// ───────── Populated state ─────────

function PlayingCard({
  roomId,
  videoId,
  addedByName,
  meta,
}: {
  roomId: string;
  videoId: string;
  addedByName: string | null;
  meta: YouTubeVideoMeta | null;
}) {
  const thumb = youtubeThumbnailUrl(videoId, "mqdefault");
  const title = meta?.title ?? null;

  return (
    <div
      className={`relative ${CARD_HEIGHT} shrink-0 overflow-hidden rounded-xl shadow-lg ring-1 ring-zinc-900/10 dark:ring-white/10`}
    >
      {/* Backdrop: blurred + desaturated thumbnail covering the whole card. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${thumb})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(40px) saturate(0.7) brightness(0.95)",
          transform: "scale(1.2)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-r from-white/92 via-white/82 to-white/55 dark:from-black/90 dark:via-black/82 dark:to-black/60"
      />

      <div
        aria-hidden
        className="room-corner-ripple pointer-events-none absolute inset-0 opacity-50 dark:opacity-45"
      />

      <div className="relative z-10 flex h-full items-stretch gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="relative aspect-video h-full shrink-0 overflow-hidden rounded-md shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)] ring-1 ring-zinc-900/15 dark:ring-white/15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {meta?.duration ? <DurationBadge duration={meta.duration} /> : null}
        </div>

        <div className="flex h-full min-w-0 flex-1 flex-col justify-between py-0.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300/95">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] sm:text-sm">
                Now playing
              </span>
              <span aria-hidden className="room-eq-bars">
                <span />
                <span />
                <span />
              </span>
            </div>
            <p className="line-clamp-2 text-base font-semibold leading-tight tracking-tight text-zinc-900 drop-shadow-sm dark:text-white sm:text-lg">
              {title ?? " "}
            </p>
          </div>

          {/* Bottom: meta (left) · reactions (right) */}
          <div className="flex min-h-[32px] flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center">
              {addedByName ? (
                <MetaBadge>Added by {addedByName}</MetaBadge>
              ) : null}
            </div>
            <MomentReactionRail roomId={roomId} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full bg-zinc-900/11 px-2.5 py-1 text-[11px] font-medium text-zinc-800 backdrop-blur-sm sm:text-xs dark:bg-white/12 dark:text-zinc-100">
      {children}
    </span>
  );
}

// ───────── Empty state ─────────

function EmptyCard() {
  return (
    <div
      className={`relative flex ${CARD_HEIGHT} shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-zinc-100 px-4 text-center shadow-sm dark:border-zinc-800 dark:bg-[#0f0f0f]`}
    >
      <div
        aria-hidden
        className="room-corner-ripple pointer-events-none absolute inset-0 opacity-60 dark:opacity-40"
      />
      <div className="relative z-10 flex items-center gap-2">
        <AppIcon
          icon="lucide:tv"
          className="h-4 w-4 shrink-0 text-muted dark:text-zinc-500"
          aria-hidden
        />
        <p className="text-sm text-muted dark:text-zinc-500">
          Add a video to get started.
        </p>
      </div>
    </div>
  );
}
