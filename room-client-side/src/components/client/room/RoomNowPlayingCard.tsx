"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import {
  compactNumber,
  getVideoMeta,
  relativeFromIso,
  type YouTubeVideoMeta,
} from "@/lib/youtube-api";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import { DurationBadge } from "./DurationBadge";

type RoomNowPlayingCardProps = {
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
 *   `h-[88px] sm:h-[100px]`
 *
 * That height is also tuned to stay clear of the viewport bottom on
 * common desktop sizes — the player above flexes into the remaining
 * space.
 *
 * **Populated**: thumbnail rendered twice — once as a heavily blurred
 * backdrop covering the whole card, once crisply on the left. A
 * left-to-right dark gradient overlays the backdrop so text on the
 * right stays readable. The card visually inherits the colour of
 * whatever's playing — same idiom as Spotify / Apple Music.
 *
 * **Empty**: clean theme-respecting strip with a generic TV icon and
 * an "add a video" prompt.
 */
const CARD_HEIGHT = "h-[148px] sm:h-[148px]";

export function RoomNowPlayingCard({
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
    <PlayingCard videoId={videoId} addedByName={addedByName} meta={meta} />
  );
}

// ───────── Populated state ─────────

function PlayingCard({
  videoId,
  addedByName,
  meta,
}: {
  videoId: string;
  addedByName: string | null;
  meta: YouTubeVideoMeta | null;
}) {
  const thumb = youtubeThumbnailUrl(videoId, "mqdefault");
  const title = meta?.title ?? null;
  const channel = meta?.channelTitle;
  const uploaded = meta?.publishedAt ? relativeFromIso(meta.publishedAt) : null;

  const hasViews = meta?.viewCount != null;
  const hasLikes = meta?.likeCount != null;
  const showStats = hasViews || hasLikes;

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
      {/* Theme-sensitive overlay graded left→right. Light surface in
          light mode, dark in dark mode — text below switches colour to
          stay readable in either. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-white/92 via-white/82 to-white/55 dark:from-black/90 dark:via-black/82 dark:to-black/60"
      />

      {/* Diagonal-drift dot haze from the bottom-right corner; mask
          fades it toward the top-left so density concentrates there. */}
      <div
        aria-hidden
        className="room-corner-ripple pointer-events-none absolute inset-0 opacity-50 dark:opacity-45"
      />

      {/* Content. `items-stretch` lets the right column fill the full
          card height so `justify-between` distributes properly. */}
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
          {/* Top group: eyebrow + title stacked tightly. */}
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

          {/* Bottom: badges (channel · time · added-by) on the left,
              engagement stats on the right. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {/* {channel ? <MetaBadge>{channel}</MetaBadge> : null} */}
              {/* {uploaded ? <MetaBadge>{uploaded}</MetaBadge> : null} */}
              {addedByName ? (
                <MetaBadge>Added by {addedByName}</MetaBadge>
              ) : null}
            </div>
            {showStats ? (
              <div className="inline-flex shrink-0 items-center divide-x divide-zinc-900/15 rounded-full border border-zinc-900/15 bg-zinc-900/10 text-xs font-medium tabular-nums text-zinc-800 backdrop-blur-sm sm:text-sm dark:divide-white/15 dark:border-white/15 dark:bg-white/10 dark:text-zinc-100">
                {hasViews ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3">
                    <AppIcon
                      icon="lucide:eye"
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                      aria-hidden
                    />
                    {compactNumber(meta!.viewCount)}
                  </span>
                ) : null}
                {hasLikes ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3">
                    <AppIcon
                      icon="lucide:thumbs-up"
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                      aria-hidden
                    />
                    {compactNumber(meta!.likeCount!)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pill-shaped meta badge — translucent surface with subtle border,
 * theme-sensitive colours so it reads against both the light and dark
 * versions of the card backdrop.
 */
function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-900/15 bg-zinc-900/10 px-2 py-0.5 text-[11px] font-medium text-zinc-800 backdrop-blur-sm sm:text-xs dark:border-white/15 dark:bg-white/10 dark:text-zinc-100">
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
