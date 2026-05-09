/**
 * Giphy search for the in-room GIF picker. Uses the public beta API;
 * key must be restricted by host in the Giphy dashboard.
 *
 * @see https://developers.giphy.com/docs/api/endpoint#search
 */

export type GiphySearchHit = {
  id: string;
  /** Low-res / small height preview for the grid (Tenor-style thumbnails). */
  previewUrl: string;
  /** Reasonable quality for inline chat (not full original). */
  displayUrl: string;
};

type GiphyImageBlock = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyApiItem = {
  id: string;
  images?: {
    fixed_height_small?: GiphyImageBlock;
    preview_gif?: GiphyImageBlock;
    downsized?: GiphyImageBlock;
    downsized_medium?: GiphyImageBlock;
    original?: GiphyImageBlock;
  };
};

type GiphySearchResponse = {
  data?: GiphyApiItem[];
};

/**
 * @param query Search string (caller should trim; empty returns []).
 * @param limit Clamped to 10–20 per product preference.
 */
export async function searchGiphyGifs(
  query: string,
  limit: number,
): Promise<GiphySearchHit[]> {
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if (!key || query.length < 2) return [];

  const lim = Math.min(20, Math.max(10, Math.floor(limit)));
  const url = new URL("https://api.giphy.com/v1/gifs/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(lim));
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("lang", "en");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Giphy HTTP ${res.status}`);
  }

  const json = (await res.json()) as GiphySearchResponse;
  const items = json.data ?? [];

  const out: GiphySearchHit[] = [];
  for (const item of items) {
    const previewUrl =
      item.images?.fixed_height_small?.url ??
      item.images?.preview_gif?.url ??
      "";
    const displayUrl =
      item.images?.downsized?.url ??
      item.images?.downsized_medium?.url ??
      item.images?.original?.url ??
      "";
    if (!previewUrl || !displayUrl) continue;
    out.push({ id: item.id, previewUrl, displayUrl });
  }
  return out;
}
