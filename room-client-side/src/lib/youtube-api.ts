/**
 * Direct YouTube Data API v3 calls from the browser.
 *
 * No backend proxy — the API keys live in `NEXT_PUBLIC_YOUTUBE_API_KEY_*`
 * env vars and ship in the client bundle. This is the explicit
 * trade-off: simpler than a server proxy at the cost of a per-user
 * cache + rate limit. Keys must be restricted to the app's HTTP
 * referrers in Google Cloud Console so other origins can't use them.
 *
 * **Key rotation.** The module loads every `NEXT_PUBLIC_YOUTUBE_API_KEY_<n>`
 * found at build time, sorted by `<n>`. Normal traffic uses key #1.
 * If a request comes back with HTTP 403 + `quotaExceeded`, the active
 * index advances and the request is retried once. When all keys are
 * exhausted the helpers return a `reason: "quota"` discriminator the
 * caller can surface to the user.
 *
 * **LRU cache.** A Map of up to 200 entries keyed by the request URL
 * *without* the `key=` segment. 5-minute TTL. Lives only for the tab
 * session — on refresh it's empty. Spares re-fetches for the same
 * search query / video ID without sharing across users.
 */

// Next.js inlines `NEXT_PUBLIC_*` env vars into the client bundle by
// rewriting *literal* references at build time — `Object.entries(process.env)`
// isn't a real object in the browser, so we must list the slots
// explicitly. Add a new line here to expand capacity; missing/blank
// slots get filtered out so unused entries are free.
const RAW_KEYS: Array<string | undefined> = [
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_1,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_2,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_3,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_4,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_5,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_6,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_7,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_8,
];

const KEYS: string[] = RAW_KEYS.filter(
  (v): v is string => typeof v === "string" && v.length > 0,
);

let activeKeyIndex = 0;

const YT_BASE = "https://www.googleapis.com/youtube/v3";

// ───────── Cache ─────────

type CacheEntry = { value: unknown; expiresAt: number };
const TTL_MS = 5 * 60 * 1000;
const CACHE_CAPACITY = 200;
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Refresh LRU order — re-insert moves the key to the end.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value as T;
}

function cacheSet(key: string, value: unknown) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  if (cache.size > CACHE_CAPACITY) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

// ───────── Result types ─────────

export type YouTubeApiResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; reason?: "config" | "quota" | "network" };

export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  thumbnailUrl: string;
  /** Pre-formatted duration like `"4:39"` or `"1:02:14"`. `null` if the
   *  follow-up `videos.list` call didn't return one (or failed). */
  duration: string | null;
};

export type YouTubeVideoMeta = {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  viewCount: number;
  /** YouTube returns null when likes are hidden by the uploader. */
  likeCount: number | null;
  commentCount: number | null;
  /** Pre-formatted duration; `null` if missing/unparsable. */
  duration: string | null;
  publishedAt: string;
  thumbnailUrl: string;
  description: string;
};

// ───────── Core call helper ─────────

type RawResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; reason: "config" | "quota" | "network" };

/**
 * Issues a GET against `https://www.googleapis.com/youtube/v3/<path>?<params>`
 * with the active key appended. On `quotaExceeded` 403, transparently
 * advances `activeKeyIndex` and retries once. The `cacheKey` is the
 * URL *without* the `&key=` segment, so cache hits work regardless of
 * which key was used.
 */
async function callYouTubeAPI(
  path: string,
  params: Record<string, string>,
): Promise<RawResponse> {
  if (KEYS.length === 0) {
    return {
      ok: false,
      error: "Search is not configured.",
      reason: "config",
    };
  }

  const search = new URLSearchParams(params);
  const cacheKey = `${path}?${search.toString()}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached !== undefined) return { ok: true, data: cached };

  // Try keys starting at the current active index. We do at most one
  // round-trip per remaining key — `quotaExceeded` advances the index
  // and we try the next one.
  const startIndex = activeKeyIndex;
  for (let attempt = 0; attempt < KEYS.length; attempt++) {
    const idx = (startIndex + attempt) % KEYS.length;
    const key = KEYS[idx];
    const url = `${YT_BASE}/${path}?${search.toString()}&key=${encodeURIComponent(key)}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      return {
        ok: false,
        error: "Couldn't reach YouTube. Check your connection.",
        reason: "network",
      };
    }

    if (response.ok) {
      const data: unknown = await response.json().catch(() => null);
      if (data == null) {
        return {
          ok: false,
          error: "Unexpected YouTube response.",
          reason: "network",
        };
      }
      cacheSet(cacheKey, data);
      // Lock in the working key for future calls.
      activeKeyIndex = idx;
      return { ok: true, data };
    }

    // Inspect the body for quota signal before deciding to retry.
    const errorBody: { error?: { errors?: Array<{ reason?: string }> } } =
      await response.json().catch(() => ({}));
    const reason = errorBody?.error?.errors?.[0]?.reason;
    if (response.status === 403 && reason === "quotaExceeded") {
      // Try the next key on the next loop iteration.
      continue;
    }
    // Any non-quota failure: don't burn other keys on it.
    return {
      ok: false,
      error: "Couldn't reach YouTube. Try again.",
      reason: "network",
    };
  }

  // All keys exhausted on quota.
  return {
    ok: false,
    error: "Search quota exceeded for today. Try again tomorrow.",
    reason: "quota",
  };
}

// ───────── Public API ─────────

type RawSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

type RawSearchResponse = { items?: RawSearchItem[] };

type RawDurationsResponse = {
  items?: Array<{ id?: string; contentDetails?: { duration?: string } }>;
};

export async function searchYouTube(
  query: string,
  limit = 6,
): Promise<YouTubeApiResult<{ results: YouTubeSearchResult[] }>> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, results: [] };

  const raw = await callYouTubeAPI("search", {
    part: "snippet",
    type: "video",
    q: trimmed,
    maxResults: String(limit),
  });
  if (!raw.ok) return { ok: false, error: raw.error, reason: raw.reason };

  const data = raw.data as RawSearchResponse;
  const results: YouTubeSearchResult[] = (data.items ?? [])
    .map((item) => {
      const videoId = item.id?.videoId;
      const snip = item.snippet;
      if (!videoId || !snip) return null;
      return {
        videoId,
        title: snip.title ?? "",
        channelTitle: snip.channelTitle ?? "",
        channelId: snip.channelId ?? "",
        thumbnailUrl:
          snip.thumbnails?.medium?.url ?? snip.thumbnails?.default?.url ?? "",
        duration: null as string | null,
      };
    })
    .filter((r): r is YouTubeSearchResult => r !== null);

  // Enrich with durations via a follow-up `videos.list` call (1 unit
  // total regardless of how many IDs we batch). If this fails for any
  // reason we still return the search results — duration just stays
  // null on each row.
  if (results.length > 0) {
    const ids = results.map((r) => r.videoId).join(",");
    const durRaw = await callYouTubeAPI("videos", {
      part: "contentDetails",
      id: ids,
    });
    if (durRaw.ok) {
      const durData = durRaw.data as RawDurationsResponse;
      const durMap = new Map<string, string>();
      for (const item of durData.items ?? []) {
        const formatted = item.contentDetails?.duration
          ? formatDuration(item.contentDetails.duration)
          : null;
        if (item.id && formatted) durMap.set(item.id, formatted);
      }
      for (const r of results) {
        r.duration = durMap.get(r.videoId) ?? null;
      }
    }
  }

  return { ok: true, results };
}

type RawVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    description?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
};

type RawVideoResponse = { items?: RawVideoItem[] };

export async function getVideoMeta(
  videoId: string,
): Promise<YouTubeApiResult<{ video: YouTubeVideoMeta }>> {
  const raw = await callYouTubeAPI("videos", {
    part: "snippet,statistics,contentDetails",
    id: videoId,
  });
  if (!raw.ok) return { ok: false, error: raw.error, reason: raw.reason };

  const data = raw.data as RawVideoResponse;
  const item = data.items?.[0];
  if (!item || !item.id || !item.snippet) {
    return { ok: false, error: "Video not found.", reason: "network" };
  }
  const snip = item.snippet;
  const stats = item.statistics;
  const cd = item.contentDetails;
  return {
    ok: true,
    video: {
      videoId: item.id,
      title: snip.title ?? "",
      channelTitle: snip.channelTitle ?? "",
      channelId: snip.channelId ?? "",
      viewCount: Number(stats?.viewCount ?? "0"),
      likeCount: stats?.likeCount != null ? Number(stats.likeCount) : null,
      commentCount:
        stats?.commentCount != null ? Number(stats.commentCount) : null,
      duration: cd?.duration ? formatDuration(cd.duration) : null,
      publishedAt: snip.publishedAt ?? "",
      thumbnailUrl:
        snip.thumbnails?.medium?.url ?? snip.thumbnails?.default?.url ?? "",
      description: snip.description ?? "",
    },
  };
}

// ───────── Tiny helpers (used by RoomNowPlayingCard) ─────────

/**
 * ISO-8601 duration like `"PT4M39S"` or `"PT1H2M14S"` → `"4:39"` or
 * `"1:02:14"`. Returns `null` if the input doesn't parse.
 */
export function formatDuration(iso: string): string | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const h = Number(match[1] ?? "0");
  const m = Number(match[2] ?? "0");
  const s = Number(match[3] ?? "0");
  if (h === 0 && m === 0 && s === 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * `1234567` → `1.2M`. Three-significant-figure-ish, K/M/B suffixes.
 */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1_000_000_000)
    return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  return `${(n / 1_000_000_000).toFixed(n < 10_000_000_000 ? 1 : 0)}B`;
}

/**
 * `2026-04-23T10:00:00Z` → `3 days ago` / `2 hours ago`. Falls back
 * to the raw date string if parsing fails.
 */
export function relativeFromIso(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
