"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_ROOM_YOUTUBE_VIDEO_ID } from "@/lib/app-constants";
import { buildYouTubeEmbedSrc } from "@/lib/youtube";

const YouTube = dynamic(() => import("react-youtube"), { ssr: false });

type PlaylistEntry = { clipId: string; videoId: string };

type RoomYouTubePlayerProps = {
  phase: "default" | "playing" | "stopped";
  defaultVideoId?: string;
  playlist: PlaylistEntry[];
  currentIndex: number;
  onAdvance: (absoluteIndex: number) => void;
};

type YTPlayer = {
  loadPlaylist: (
    playlist: string[] | string,
    index?: number,
    startSeconds?: number,
    suggestedQuality?: string,
  ) => void;
  playVideoAt: (index: number) => void;
  /** Returns the index of the video currently playing within the iframe's
   *  internal playlist, or -1 when not playing a playlist. We use it as a
   *  defensive sync point on state=1 so React state can't drift behind the
   *  iframe even if state=0 events get dropped. */
  getPlaylistIndex: () => number;
};

type YTStateEvent = { data: number; target: YTPlayer };

export function RoomYouTubePlayer({
  phase,
  defaultVideoId = DEFAULT_ROOM_YOUTUBE_VIDEO_ID,
  playlist,
  currentIndex,
  onAdvance,
}: RoomYouTubePlayerProps) {
  const playerRef = useRef<YTPlayer | null>(null);
  /** Ids currently loaded in the YouTube player. */
  const ytIdsRef = useRef<string[]>([]);
  /** Our tracked index of the currently-playing entry. Source of truth — we do not rely on getPlaylistIndex() or indexOf() because duplicates break both. */
  const ytCurrentIndexRef = useRef<number>(-1);
  /** Set before a programmatic player action. The next PLAYING state event is a consequence of our call, not a natural advance — so it should be ignored. */
  const suppressNextPlayEventRef = useRef<boolean>(false);
  /** Queued playlist update deferred to the next natural video transition. */
  const pendingPlaylistUpdate = useRef<{
    ids: string[];
    targetIndex: number;
  } | null>(null);
  const currentIndexRef = useRef<number>(currentIndex);
  const playlistRef = useRef<PlaylistEntry[]>(playlist);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  /**
   * Playlist the iframe was mounted with. Held stable for the whole playing session so
   * react-youtube sees unchanging `videoId`/`opts` and doesn't rebuild the player.
   */
  const sessionSnapshotRef = useRef<{
    firstVideoId: string;
    playlistParam: string;
    ids: string[];
  } | null>(null);
  if (phase === "playing" && sessionSnapshotRef.current === null) {
    const ids = playlist.map((p) => p.videoId);
    sessionSnapshotRef.current = {
      firstVideoId: ids[0] ?? "",
      playlistParam: ids.slice(1).join(","),
      ids,
    };
  } else if (phase !== "playing" && sessionSnapshotRef.current !== null) {
    // Session ended (queue exhausted → "stopped", or back to "default"). Reset
    // every ref the next session would otherwise inherit — onReady will re-init
    // ytIdsRef/ytCurrentIndexRef from the new snapshot, but pending updates and
    // the suppress flag would otherwise leak across sessions.
    sessionSnapshotRef.current = null;
    pendingPlaylistUpdate.current = null;
    suppressNextPlayEventRef.current = false;
    ytIdsRef.current = [];
    ytCurrentIndexRef.current = -1;
  }

  const sessionFirstVideoId = sessionSnapshotRef.current?.firstVideoId ?? "";
  const sessionPlaylistParam = sessionSnapshotRef.current?.playlistParam ?? "";

  const playerOpts = useMemo(
    () => ({
      height: "100%",
      width: "100%",
      playerVars: {
        autoplay: 1,
        mute: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        ...(sessionPlaylistParam ? { playlist: sessionPlaylistParam } : {}),
      },
    }),
    [sessionPlaylistParam],
  );

  /** Reconcile React's desired playlist/index into the live player. */
  useEffect(() => {
    if (phase !== "playing") return;
    const player = playerRef.current;
    if (!player || currentIndex < 0) return;

    const newIds = playlist.map((p) => p.videoId);
    const ytIds = ytIdsRef.current;
    const ytCurrentIdx = ytCurrentIndexRef.current;
    const idsMatch =
      newIds.length === ytIds.length &&
      newIds.every((id, i) => id === ytIds[i]);
    const indexMatch = currentIndex === ytCurrentIdx;

    if (idsMatch && indexMatch) return;

    if (!idsMatch && indexMatch) {
      // Pure add (user added to the queue; current slot unchanged). Defer to
      // the next natural transition so the current video keeps playing
      // uninterrupted.
      pendingPlaylistUpdate.current = {
        ids: newIds,
        targetIndex: currentIndex,
      };
      return;
    }

    // Anything else (jump within known playlist, jump with adds, first sync
    // after onReady) — always regenerate YT's playlist from the React queue.
    // Per the architecture decision: jumps uniformly regenerate even when YT
    // already has the right list, trading a brief reload for predictable
    // behavior across all jump cases.
    try {
      player.loadPlaylist(newIds, currentIndex, 0);
    } catch {
      /* iframe may be detaching */
    }
    ytIdsRef.current = newIds;
    ytCurrentIndexRef.current = currentIndex;
    suppressNextPlayEventRef.current = true;
    pendingPlaylistUpdate.current = null;
  }, [playlist, currentIndex, phase]);

  const defaultSrc = useMemo(
    () =>
      buildYouTubeEmbedSrc(defaultVideoId, {
        autoplay: true,
        mute: false,
        loop: true,
      }),
    [defaultVideoId],
  );

  if (phase === "default") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-sm">
        <iframe
          title="Welcome video"
          src={defaultSrc}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  if (phase === "stopped") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted">
        <p className="font-medium text-foreground">Nothing playing</p>
        <p>Add another YouTube link from the bar above.</p>
      </div>
    );
  }

  if (!sessionFirstVideoId) return null;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-sm [&>div]:h-full [&>div]:w-full">
      <YouTube
        videoId={sessionFirstVideoId}
        title="Now playing"
        opts={playerOpts}
        className="h-full w-full"
        iframeClassName="h-full w-full rounded-none"
        onReady={(event: YTStateEvent) => {
          playerRef.current = event.target;
          const snapshot = sessionSnapshotRef.current;
          ytIdsRef.current = snapshot ? [...snapshot.ids] : [];
          ytCurrentIndexRef.current = 0;
          const desiredIdx = currentIndexRef.current;
          if (desiredIdx > 0 && desiredIdx < ytIdsRef.current.length) {
            try {
              event.target.playVideoAt(desiredIdx);
              ytCurrentIndexRef.current = desiredIdx;
              suppressNextPlayEventRef.current = true;
            } catch {
              /* noop */
            }
          }
        }}
        onStateChange={(event: YTStateEvent) => {
          const state = event.data;
          const player = event.target;

          if (state === 1 /* PLAYING */) {
            // State 1 fires for initial play, resumes after pause, and after every
            // programmatic loadPlaylist/playVideoAt call.
            if (suppressNextPlayEventRef.current) {
              // Our own command triggered this; refs are already authoritative.
              suppressNextPlayEventRef.current = false;
              return;
            }
            // Natural transition (YT's playlist hint auto-advanced inside the
            // iframe). Sync React state to whatever YT is *actually* playing.
            // We can't rely on state=0 alone — after a manual playVideoAt jump,
            // the follow-up state=0 events for naturally-advancing videos can
            // be dropped or interleaved oddly with state=1, leaving the queue
            // panel frozen on the manually-jumped video while the iframe
            // sails ahead. getPlaylistIndex() returns YT's true position, so
            // this branch keeps us honest. Idempotent: if state=0 already
            // moved our refs forward, the index here matches and we no-op.
            let ytIdx: number;
            try {
              ytIdx = player.getPlaylistIndex();
            } catch {
              return;
            }
            if (ytIdx >= 0 && ytIdx !== ytCurrentIndexRef.current) {
              ytCurrentIndexRef.current = ytIdx;
              onAdvance(ytIdx);
            }
            return;
          }

          if (state === 0 /* ENDED */) {
            const endedIdx = ytCurrentIndexRef.current;

            // Flush a deferred playlist update (user added videos while this one was playing).
            if (pendingPlaylistUpdate.current) {
              const { ids: newIds } = pendingPlaylistUpdate.current;
              const nextIdx = endedIdx + 1;
              if (nextIdx < newIds.length) {
                try {
                  player.loadPlaylist(newIds, nextIdx, 0);
                } catch {
                  /* noop */
                }
                ytIdsRef.current = newIds;
                ytCurrentIndexRef.current = nextIdx;
                suppressNextPlayEventRef.current = true;
                pendingPlaylistUpdate.current = null;
                onAdvance(nextIdx);
                return;
              }
            }

            // Drive advancement ourselves rather than relying on YouTube's built-in
            // playlist auto-advance — it gets confused by duplicate video ids, skipping
            // or looping unpredictably. Calling playVideoAt on every end works uniformly
            // whether the next entry is a duplicate or a new video.
            const nextIdx = endedIdx + 1;
            if (nextIdx < ytIdsRef.current.length) {
              try {
                player.playVideoAt(nextIdx);
              } catch {
                /* noop */
              }
              ytCurrentIndexRef.current = nextIdx;
              suppressNextPlayEventRef.current = true;
              onAdvance(nextIdx);
            } else {
              onAdvance(ytIdsRef.current.length);
            }
          }
        }}
      />
    </div>
  );
}
