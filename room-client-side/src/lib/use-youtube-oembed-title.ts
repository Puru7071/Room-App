"use client";

import { useEffect, useState } from "react";
import { youtubeWatchUrl } from "@/lib/youtube";

/**
 * Process-wide cache of YouTube oEmbed titles. Persisted across
 * component unmounts (e.g. switching between tabs, re-rendering the
 * broadcaster panel as cards arrive and leave) so titles don't
 * blink-and-refetch on every re-mount. Keyed by videoId.
 *
 * Shared between `QueueView` and the broadcaster panel's video-add
 * card so both surfaces benefit from a single fetch + cache.
 */
const titleCache = new Map<string, string>();

/**
 * Fetch (and cache) the YouTube title for a videoId via oEmbed. While
 * loading the first time, returns `null` — callers should render a
 * skeleton or a non-breaking placeholder. After resolution (success or
 * fallback), the title persists in the module-level cache.
 */
export function useYouTubeOEmbedTitle(videoId: string): string | null {
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
