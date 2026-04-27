"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AppIcon } from "@/components/icons/AppIcon";
import {
  searchYouTube,
  type YouTubeSearchResult,
} from "@/lib/youtube-api";
import { DurationBadge } from "./DurationBadge";

type RoomYouTubeSearchInputProps = {
  /** Called when a result is picked. Parent enqueues the video. */
  onPick: (result: YouTubeSearchResult) => void;
  /** Tailwind sizing class — owner of the input controls width. */
  sizingClass?: string;
};

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 6;

/**
 * Debounced YouTube search input + dropdown of up to 6 results. Lives
 * beside the paste-link in the room header.
 *
 * Closes on click-outside or Escape — **not** on pick, so the user
 * can rapidly queue several results in a row. Picked rows show an
 * "Added" tick and become non-clickable until the query changes.
 * Re-opens when the input is focused if there are still recent results.
 *
 * Surfaces YouTube quota exhaustion as an error toast (so the user
 * knows it's not a code bug). Other errors are silent — empty results.
 */
export function RoomYouTubeSearchInput({
  onPick,
  sizingClass = "",
}: RoomYouTubeSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Video IDs the user has already enqueued from the *current* result
  // set. Reset whenever the query changes so a fresh search starts
  // with everything pickable again.
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Avoid spamming the same toast across keystrokes — surface each
  // reason at most once per mount.
  const toastedReasonsRef = useRef<Set<string>>(new Set());

  // Debounced fetch. Also clears the per-query picked set so each new
  // search starts with all rows enabled.
  useEffect(() => {
    setPickedIds(new Set());
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      const result = await searchYouTube(trimmed, RESULT_LIMIT);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        const reason = result.reason ?? "unknown";
        if (!toastedReasonsRef.current.has(reason)) {
          toast.error(result.error);
          toastedReasonsRef.current.add(reason);
        }
        setResults([]);
        return;
      }
      setResults(result.results);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  // Close on click-outside / Escape.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handlePick(item: YouTubeSearchResult) {
    if (pickedIds.has(item.videoId)) return;
    onPick(item);
    setPickedIds((prev) => {
      const next = new Set(prev);
      next.add(item.videoId);
      return next;
    });
  }

  const showDropdown = open && (loading || results.length > 0 || query.trim());

  return (
    <div
      ref={wrapperRef}
      className={`relative ${sizingClass}`}
    >
      <div className="flex h-9 min-h-0 items-stretch overflow-hidden rounded-lg border border-border bg-muted/25 shadow-sm transition hover:border-border sm:h-10">
        <span
          className="inline-flex min-w-8 shrink-0 items-center justify-center self-stretch bg-slate-200 px-2 text-black dark:bg-zinc-600 dark:text-zinc-100 sm:min-w-9 sm:px-2.5"
          title="Search YouTube"
          aria-hidden
        >
          <AppIcon
            icon="lucide:search"
            className="h-3.5 w-3.5 sm:h-4 sm:w-4"
          />
        </span>
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim() || results.length > 0) setOpen(true);
          }}
          placeholder="Search YouTube…"
          autoComplete="off"
          spellCheck={false}
          tabIndex={-1}
          className="min-w-0 flex-1 border-0 bg-input-bg/70 py-2 pl-2 pr-2 text-xs font-medium text-foreground outline-none ring-0 placeholder:text-muted focus:ring-0 sm:py-2.5 sm:pl-2.5 sm:text-sm"
        />
      </div>

      {showDropdown ? (
        <div
          role="listbox"
          aria-label="YouTube search results"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-card shadow-[0_10px_40px_-15px_rgba(15,23,42,0.18)] dark:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)]"
        >
          {loading && results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">No results.</p>
          ) : (
            <ul className="py-1">
              {results.map((item) => {
                const added = pickedIds.has(item.videoId);
                return (
                  <li key={item.videoId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      aria-disabled={added}
                      disabled={added}
                      onClick={() => handlePick(item)}
                      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition focus:outline-none ${
                        added
                          ? "cursor-default opacity-60"
                          : "cursor-pointer hover:bg-muted/30 focus:bg-muted/40 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      {item.thumbnailUrl ? (
                        <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          {item.duration ? (
                            <DurationBadge duration={item.duration} size="xs" />
                          ) : null}
                        </div>
                      ) : (
                        <div className="h-10 w-16 shrink-0 rounded bg-muted/40" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-medium text-foreground">
                          {item.title}
                        </p>
                        <p className="truncate text-[11px] text-muted">
                          {item.channelTitle}
                        </p>
                      </div>
                      {added ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <AppIcon
                            icon="lucide:check"
                            className="h-3 w-3"
                            aria-hidden
                          />
                          Added
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
