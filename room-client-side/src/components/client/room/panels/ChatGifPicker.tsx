"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { searchGiphyGifs, type GiphySearchHit } from "@/lib/giphy-search";

type ChatGifPickerProps = {
  onSelect: (displayUrl: string) => void;
  onClose: () => void;
};

/** Match `EmojiPicker` in ChatView: width={300} height={360} (before scale). */
const PANEL_W = 300;
const PANEL_H = 360;

const SEARCH_DEBOUNCE_MS = 350;
const GRID_LIMIT = 15;
const QUICK_TERMS = ["laugh", "cry", "love", "angry", "party"] as const;

/**
 * GIF search popover — footprint matches the emoji picker; spacing separates
 * regions (no inner section borders). Typography uses the app `font-sans`
 * stack like the rest of the room UI.
 */
export function ChatGifPicker({ onSelect, onClose }: ChatGifPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphySearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GIPHY_API_KEY) {
      setNoKey(true);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const hits = await searchGiphyGifs(q, GRID_LIMIT);
          if (requestIdRef.current !== id) return;
          setResults(hits);
        } catch {
          if (requestIdRef.current !== id) return;
          setError("Couldn't load GIFs. Try again.");
          setResults([]);
        } finally {
          if (requestIdRef.current === id) setLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(t);
  }, [query]);

  const handlePick = useCallback(
    (hit: GiphySearchHit) => {
      onSelect(hit.displayUrl);
      onClose();
    },
    [onSelect, onClose],
  );

  const applyQuickTerm = useCallback((term: string) => {
    setQuery(term);
  }, []);

  const qTrim = query.trim();
  const showEmptyGrid =
    !noKey && qTrim.length >= 2 && !loading && !error && results.length === 0;

  return (
    <div
      className="font-sans flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg dark:border-zinc-600/60 dark:bg-[#1f1f1f]"
      style={{ width: PANEL_W, height: PANEL_H }}
      role="dialog"
      aria-label="Search GIFs"
    >
      {/* Search — single outlined field; no divider strip below */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-zinc-400/55 bg-transparent px-2.5 py-2 dark:border-zinc-500/90 dark:bg-zinc-950/30">
          <AppIcon
            icon="lucide:search"
            className="h-[15px] w-[15px] shrink-0 text-zinc-500 dark:text-zinc-400"
            aria-hidden
          />
          <input
            type="search"
            autoFocus
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm leading-normal text-foreground outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close GIF search"
            className="inline-flex shrink-0 rounded p-0.5 text-zinc-500 transition hover:text-zinc-200 dark:text-zinc-400"
          >
            <AppIcon icon="lucide:x" className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Quick terms — whitespace only; pill styling without outline borders */}
      <div className="shrink-0 px-3 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TERMS.map((term) => {
            const active = qTrim === term;
            return (
              <button
                key={term}
                type="button"
                onClick={() => applyQuickTerm(term)}
                className={[
                  "rounded-full px-2.5 py-1 text-[13px] font-medium leading-none outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-accent-blue/40",
                  active
                    ? "bg-accent-blue/20 text-accent-blue shadow-[0_0_0_1px_rgba(96,165,250,0.35)] dark:text-accent-blue"
                    : [
                        "bg-zinc-800/55 text-zinc-300 dark:text-zinc-400",
                        "hover:bg-zinc-600/85 hover:text-white hover:shadow-md dark:hover:bg-zinc-600/90 dark:hover:text-zinc-50",
                        "active:scale-[0.97]",
                      ].join(" "),
                ].join(" ")}
              >
                {term}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results — fixed slot; only inner content swaps */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {noKey ? (
          <div className="flex min-h-full items-center px-1 py-4">
            <p className="w-full text-center text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-500">
              Set{" "}
              <code className="rounded bg-zinc-800/80 px-1 py-0.5 font-mono text-[12px] text-zinc-300">
                NEXT_PUBLIC_GIPHY_API_KEY
              </code>{" "}
              to enable GIF search.
            </p>
          </div>
        ) : qTrim.length < 2 ? (
          <div className="flex min-h-full items-center justify-center px-1 py-4">
            <p className="text-center text-[13px] leading-snug text-zinc-500 dark:text-zinc-500">
              Choose a tag or type to search.
            </p>
          </div>
        ) : loading ? (
          <ul className="grid grid-cols-3 gap-1" aria-busy>
            {Array.from({ length: GRID_LIMIT }).map((_, i) => (
              <li
                key={i}
                className="aspect-square animate-pulse rounded-md bg-zinc-800/75 dark:bg-zinc-800/80"
              />
            ))}
          </ul>
        ) : error ? (
          <div className="flex min-h-full items-center justify-center px-1 py-4">
            <p className="text-center text-[13px] text-destructive">{error}</p>
          </div>
        ) : showEmptyGrid ? (
          <div className="flex min-h-full items-center justify-center px-1 py-4">
            <p className="text-center text-[13px] text-zinc-500 dark:text-zinc-500">
              No GIFs found.
            </p>
          </div>
        ) : results.length > 0 ? (
          <ul className="grid grid-cols-3 gap-1">
            {results.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => handlePick(hit)}
                  className="relative aspect-square w-full overflow-hidden rounded-md bg-zinc-800/40 outline-none transition hover:ring-2 hover:ring-accent-blue/35 focus-visible:ring-2 focus-visible:ring-accent-blue/45 dark:bg-zinc-800/55"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={hit.previewUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
