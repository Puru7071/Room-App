"use client";

import { youtubeThumbnailUrl } from "@/lib/youtube";

type RoomAmbientBackdropProps = {
  videoId: string | null;
};

/** Dense at top-left, diagonal falloff toward bottom-right (YouTube-style). */
const AMBIENT_MASK =
  "linear-gradient(to bottom right, #000 0%, #000 5%, rgba(0,0,0,0.92) 14%, rgba(0,0,0,0.48) 32%, rgba(0,0,0,0.14) 52%, transparent 70%)";

/**
 * Full-room wash from the active or last clip thumbnail. Sits behind the
 * header and main so the glow is not cut off at the header fold.
 */
export function RoomAmbientBackdrop({ videoId }: RoomAmbientBackdropProps) {
  const thumbUrl = videoId ? youtubeThumbnailUrl(videoId, "hqdefault") : null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div
        className={[
          "absolute -inset-[14%] bg-cover bg-top-left opacity-[0.48] blur-[68px] saturate-125 will-change-transform sm:blur-[80px]",
          "dark:opacity-[0.38] dark:saturate-110",
          thumbUrl
            ? ""
            : "bg-linear-to-br from-amber-800/55 via-violet-950/45 to-sky-950/50 dark:from-amber-700/40 dark:via-zinc-950/65 dark:to-sky-950/55",
        ].join(" ")}
        style={{
          ...(thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : {}),
          WebkitMaskImage: AMBIENT_MASK,
          maskImage: AMBIENT_MASK,
        }}
      />
    </div>
  );
}
