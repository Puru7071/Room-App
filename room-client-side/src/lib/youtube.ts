const ID_RE = /^[\w-]{11}$/;

function isLikelyVideoId(id: string): boolean {
  return ID_RE.test(id);
}

/**
 * Extracts an 11-character YouTube video id from a URL or raw id string.
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isLikelyVideoId(trimmed)) return trimmed;

  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0] ?? "";
      return isLikelyVideoId(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && isLikelyVideoId(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1] && isLikelyVideoId(parts[1])) {
        return parts[1];
      }
      if (parts[0] === "shorts" && parts[1] && isLikelyVideoId(parts[1])) {
        return parts[1];
      }
    }
  } catch {
    /* ignore */
  }

  const fromWatch = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/,
  );
  if (fromWatch?.[1] && isLikelyVideoId(fromWatch[1])) return fromWatch[1];

  return null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Builds embed URL for a plain iframe. Use `loop: true` with same `videoId`
 * in `playlist` for infinite single-video loop (YouTube requirement).
 */
export function buildYouTubeEmbedSrc(
  videoId: string,
  opts: { autoplay?: boolean; mute?: boolean; loop?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (opts.autoplay) params.set("autoplay", "1");
  if (opts.mute) params.set("mute", "1");
  params.set("rel", "0");
  params.set("modestbranding", "1");
  params.set("playsinline", "1");
  params.set("enablejsapi", "1");
  if (opts.loop) {
    params.set("loop", "1");
    params.set("playlist", videoId);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function youtubeThumbnailUrl(
  videoId: string,
  quality: "default" | "mqdefault" | "hqdefault" = "mqdefault",
): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Formats seconds like YouTube playlist badges: `3:18`, or `1:02:03` when over an hour.
 */
export function formatYouTubeDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}
