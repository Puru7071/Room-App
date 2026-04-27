"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { DEFAULT_ROOM_YOUTUBE_VIDEO_ID } from "@/lib/app-constants";
import { buildYouTubeEmbedSrc } from "@/lib/youtube";

const YouTube = dynamic(() => import("react-youtube"), { ssr: false });

type PlaylistEntry = { clipId: string; videoId: string };

export type RoomYouTubePlayerHandle = {
  play(): void;
  pause(): void;
  seekTo(time: number): void;
  getCurrentTime(): number;
  /** Raw YT player state (1 PLAYING, 2 PAUSED, 3 BUFFERING, etc.). */
  getYTState(): number;
  isReady(): boolean;
};

type RoomYouTubePlayerProps = {
  phase: "default" | "playing" | "stopped";
  defaultVideoId?: string;
  playlist: PlaylistEntry[];
  currentIndex: number;
  onAdvance: (absoluteIndex: number) => void;
  /**
   * When `false`, the iframe hides native controls + disables keyboard
   * shortcuts, and an absolute click-blocker overlay covers it. Used
   * for non-leader members in private rooms (spectator mode). Default
   * true.
   */
  interactive?: boolean;
  /**
   * Fires on user-initiated play/pause transitions. Page.tsx decides
   * whether to broadcast based on its `lastSyncRef` gate.
   */
  onPlayStateChange?: (state: "playing" | "paused") => void;
  /**
   * Fires when a real seek (user scrub) is detected via the
   * BUFFERING → PLAYING delta heuristic. The argument is the new
   * `currentTime` after the seek lands.
   */
  onSeek?: (time: number) => void;
  /**
   * Fires when the player just exited a sustained buffering window
   * (≥3s of wall-clock elapsed with no YT playhead progress and no
   * scrub). Argument is the lost-seconds estimate. Page.tsx uses this
   * to trigger `requestFreshSnapshot`.
   */
  onBufferLag?: (lostSeconds: number) => void;
  /** Fires once the YT iframe is ready. */
  onReady?: () => void;
};

type YTPlayer = {
  loadPlaylist: (
    playlist: string[] | string,
    index?: number,
    startSeconds?: number,
    suggestedQuality?: string,
  ) => void;
  playVideoAt: (index: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  /** Returns the index of the video currently playing within the iframe's
   *  internal playlist, or -1 when not playing a playlist. We use it as a
   *  defensive sync point on state=1 so React state can't drift behind the
   *  iframe even if state=0 events get dropped. */
  getPlaylistIndex: () => number;
};

type YTStateEvent = { data: number; target: YTPlayer };

export const RoomYouTubePlayer = forwardRef<
  RoomYouTubePlayerHandle,
  RoomYouTubePlayerProps
>(function RoomYouTubePlayer(
  {
    phase,
    defaultVideoId = DEFAULT_ROOM_YOUTUBE_VIDEO_ID,
    playlist,
    currentIndex,
    onAdvance,
    interactive = true,
    onPlayStateChange,
    onSeek,
    onBufferLag,
    onReady,
  },
  ref,
) {
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
  /** Wall-clock timestamp on entering BUFFERING; consumed on the next PLAYING. */
  const bufferStartWallClockRef = useRef<number | null>(null);
  /** YT currentTime on entering BUFFERING; consumed on the next PLAYING. */
  const bufferStartYTTimeRef = useRef<number | null>(null);
  /** Set on PAUSED, consumed on the next PLAYING — distinguishes resume-from-pause from auto-advance state=1. */
  const wasPausedRef = useRef<boolean>(false);
  /** True once onReady has fired so callers can gate imperative calls. */
  const isReadyRef = useRef<boolean>(false);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  // Stable refs for the optional callbacks so the polling effect below
  // doesn't tear-down/rebuild its interval every render.
  const onSeekRef = useRef(onSeek);
  const onBufferLagRef = useRef(onBufferLag);
  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);
  useEffect(() => {
    onBufferLagRef.current = onBufferLag;
  }, [onBufferLag]);

  // Time-discontinuity polling — the reliable seek detector. Every
  // 500ms while phase=playing, read the YT player's currentTime and
  // compare to the expected time (last known + elapsed wall-clock).
  // A delta > 1.5s means the playhead jumped — either the user
  // scrubbed locally OR our own imperative seekTo (driven by an
  // incoming sync) just ran. Both routes fire onSeek; page.tsx's
  // lastSyncRef gate suppresses echoes from the second case.
  useEffect(() => {
    if (phase !== "playing") return;
    let lastTime: number | null = null;
    let lastAt: number | null = null;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      let ytState: number;
      try {
        ytState = player.getPlayerState();
      } catch {
        return;
      }
      // Track only during PLAYING. During PAUSED/BUFFERING/etc., we
      // don't reset — when PLAYING resumes, the next tick compares
      // against the last-known PLAYING baseline so a scrub that took
      // the player through BUFFERING is still detected.
      if (ytState !== 1) return;
      let nowTime: number;
      try {
        nowTime = player.getCurrentTime();
      } catch {
        return;
      }
      if (lastTime == null || lastAt == null) {
        lastTime = nowTime;
        lastAt = Date.now();
        return;
      }
      const elapsed = (Date.now() - lastAt) / 1000;
      const expected = lastTime + elapsed;
      const delta = nowTime - expected;
      if (Math.abs(delta) > 1.5) {
        onSeekRef.current?.(nowTime);
      }
      lastTime = nowTime;
      lastAt = Date.now();
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

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
      playlistParam: ids.join(","),
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
    bufferStartWallClockRef.current = null;
    bufferStartYTTimeRef.current = null;
    wasPausedRef.current = false;
    ytIdsRef.current = [];
    ytCurrentIndexRef.current = -1;
    isReadyRef.current = false;
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
        // Hide native controls + kill keyboard shortcuts when the user
        // doesn't have control authority. The click-blocker overlay
        // below catches any clicks that would have reached the iframe.
        ...(interactive ? {} : { controls: 0, disablekb: 1 }),
        ...(sessionPlaylistParam ? { playlist: sessionPlaylistParam } : {}),
      },
    }),
    [sessionPlaylistParam, interactive],
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

  // Imperative handle exposed to page.tsx so it can apply incoming syncs
  // (play/pause/seek) without round-tripping through props.
  useImperativeHandle(ref, () => ({
    play() {
      try {
        playerRef.current?.playVideo();
      } catch {
        /* noop */
      }
    },
    pause() {
      try {
        playerRef.current?.pauseVideo();
      } catch {
        /* noop */
      }
    },
    seekTo(time: number) {
      try {
        playerRef.current?.seekTo(time, true);
      } catch {
        /* noop */
      }
    },
    getCurrentTime() {
      try {
        return playerRef.current?.getCurrentTime() ?? 0;
      } catch {
        return 0;
      }
    },
    getYTState() {
      try {
        return playerRef.current?.getPlayerState() ?? -1;
      } catch {
        return -1;
      }
    },
    isReady() {
      return isReadyRef.current;
    },
  }), []);

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
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-sm [&>div]:h-full [&>div]:w-full">
      <YouTube
        videoId={sessionFirstVideoId}
        title="Now playing"
        opts={playerOpts}
        className="h-full w-full"
        iframeClassName="h-full w-full rounded-none"
        onReady={(event: YTStateEvent) => {
          playerRef.current = event.target;
          isReadyRef.current = true;
          const snapshot = sessionSnapshotRef.current;
          ytIdsRef.current = snapshot ? [...snapshot.ids] : [];
          ytCurrentIndexRef.current = 0;
          // The autoplay-triggered first PLAYING event is *our* doing; the
          // refs above are already authoritative. Suppress unconditionally
          // so onStateChange's getPlaylistIndex() sync path can't fire a
          // false advance — when the iframe is created with videoId + a
          // multi-item playerVars.playlist, getPlaylistIndex() can report
          // an index that disagrees with our model and ADVANCE_TO past v1.
          suppressNextPlayEventRef.current = true;
          const desiredIdx = currentIndexRef.current;
          if (desiredIdx > 0 && desiredIdx < ytIdsRef.current.length) {
            try {
              event.target.playVideoAt(desiredIdx);
              ytCurrentIndexRef.current = desiredIdx;
            } catch {
              /* noop */
            }
          }
          onReady?.();
        }}
        onStateChange={(event: YTStateEvent) => {
          const state = event.data;
          const player = event.target;

          if (state === 3 /* BUFFERING */) {
            // Capture both YT time and wall-clock time so the next
            // PLAYING transition can decide between "user scrubbed",
            // "network buffer caused real-time lag", and "brief blip".
            try {
              bufferStartWallClockRef.current = Date.now();
              bufferStartYTTimeRef.current = player.getCurrentTime();
            } catch {
              bufferStartWallClockRef.current = null;
              bufferStartYTTimeRef.current = null;
            }
            return;
          }

          if (state === 2 /* PAUSED */) {
            wasPausedRef.current = true;
            // User-initiated pause flows up; page.tsx's lastSyncRef
            // gate decides whether to broadcast. Self-driven pauses
            // (from imperative handle.pause() applying a remote sync)
            // are filtered there too.
            onPlayStateChange?.("paused");
            return;
          }

          if (state === 1 /* PLAYING */) {
            // Buffer-lag detection only. Seeks aren't caught here —
            // by the time YT fires BUFFERING after a user scrub,
            // getCurrentTime() already returns the new (post-scrub)
            // value, so before/after look identical. Seeks are
            // detected via the time-discontinuity polling effect
            // below, which handles both scrubs that DO fire BUFFERING
            // and ones that don't (e.g., to already-buffered ranges).
            if (bufferStartWallClockRef.current != null) {
              const beforeWall = bufferStartWallClockRef.current;
              const beforeYT = bufferStartYTTimeRef.current ?? 0;
              bufferStartWallClockRef.current = null;
              bufferStartYTTimeRef.current = null;
              try {
                const after = player.getCurrentTime();
                const ytDelta = after - beforeYT;
                const wallDelta = (Date.now() - beforeWall) / 1000;
                const lostSeconds = wallDelta - ytDelta;
                if (Math.abs(ytDelta) <= 1.5 && lostSeconds > 3) {
                  // Sustained network lag — we're behind everyone.
                  onBufferLag?.(lostSeconds);
                }
                // else: brief blip OR seek-driven buffer (caught by polling).
              } catch {
                /* noop */
              }
            }

            // State 1 fires for initial play, resumes after pause, and after every
            // programmatic loadPlaylist/playVideoAt call.
            if (suppressNextPlayEventRef.current) {
              // Our own command triggered this; refs are already authoritative.
              suppressNextPlayEventRef.current = false;
              wasPausedRef.current = false;
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
              wasPausedRef.current = false;
              onAdvance(ytIdx);
              return;
            }
            // Same index, no advance. If we're transitioning out of a
            // pause, surface that as a "playing" event for sync.
            if (wasPausedRef.current) {
              wasPausedRef.current = false;
              onPlayStateChange?.("playing");
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
      {/* Click-blocker overlay for non-interactive (spectator) mode.
          Sits above the iframe so any tap or click lands here instead
          of reaching native YT controls. The iframe itself still
          accepts JS API calls (play, pause, seekTo) since those don't
          require pointer events. */}
      {!interactive ? (
        <div
          className="absolute inset-0 z-10 cursor-not-allowed"
          aria-hidden
          // Defensive: even if a stray bubble made it up to a parent,
          // stop it here.
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        />
      ) : null}
    </div>
  );
});
