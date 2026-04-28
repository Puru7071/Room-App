"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useParams } from "next/navigation";
import { useAuthToken } from "@/components/client/auth/useAuthToken";
import { AmbientPageBackground } from "@/components/layout/AmbientPageBackground";
import { RoomAmbientBackdrop } from "@/components/client/room/RoomAmbientBackdrop";
import { RoomNowPlayingCard } from "@/components/client/room/RoomNowPlayingCard";
import { RoomPageHeader } from "@/components/client/room/RoomPageHeader";
import { RoomPendingState } from "@/components/client/room/RoomPendingState";
import { RoomBroadcasterPanel } from "@/components/client/room/RoomBroadcasterPanel";
import { RoomSidePanel } from "@/components/client/room/RoomSidePanel";
import { GlobalLoader } from "@/components/layout/GlobalLoader";
import { RoomWatchLayout } from "@/components/client/room/RoomWatchLayout";
import {
  RoomYouTubePlayer,
  type RoomYouTubePlayerHandle,
} from "@/components/client/room/RoomYouTubePlayer";
import { useRoomSocket } from "@/components/client/room/useRoomSocket";
import {
  addToRoomQueue,
  getRoom,
  getRoomQueue,
  joinRoom,
  updateRoomSettings,
  type RoomDetail,
  type RoomSettingsDetail,
} from "@/lib/api";
import type {
  ChatMessageWire,
  ChatSendAck,
  JoinRequestWire,
  PlaybackSyncPayload,
  VideoAddRequestWire,
} from "@/lib/ws-events";
import { getSocket } from "@/lib/ws-client";
import { DEFAULT_ROOM_YOUTUBE_VIDEO_ID } from "@/lib/app-constants";
import type { RoomQueueEntry } from "@/lib/room-types";
import { extractYouTubeVideoId } from "@/lib/youtube";
import type { YouTubeSearchResult } from "@/lib/youtube-api";

type RoomState = {
  sessionStarted: boolean;
  past: RoomQueueEntry[];
  nowPlaying: RoomQueueEntry | null;
  cues: RoomQueueEntry[];
  videoUrl: string;
};

const initialState: RoomState = {
  sessionStarted: false,
  past: [],
  nowPlaying: null,
  cues: [],
  videoUrl: "",
};

type RoomAction =
  | { type: "SET_VIDEO_URL"; value: string }
  | { type: "ADD_VIDEO"; entry: RoomQueueEntry }
  | { type: "ADVANCE_TO"; absoluteIndex: number; loop?: boolean };

function combinedQueue(state: RoomState): RoomQueueEntry[] {
  return [
    ...state.past,
    ...(state.nowPlaying ? [state.nowPlaying] : []),
    ...state.cues,
  ];
}

function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "SET_VIDEO_URL":
      return { ...state, videoUrl: action.value };
    case "ADD_VIDEO": {
      const { entry } = action;
      if (!state.sessionStarted) {
        return {
          ...state,
          sessionStarted: true,
          nowPlaying: entry,
          videoUrl: "",
        };
      }
      if (state.nowPlaying) {
        return { ...state, cues: [...state.cues, entry], videoUrl: "" };
      }
      return { ...state, nowPlaying: entry, videoUrl: "" };
    }
    case "ADVANCE_TO": {
      const combined = combinedQueue(state);
      const idx = action.absoluteIndex;
      if (idx < 0) return state;
      if (idx >= combined.length) {
        // Loop wrap: when the queue ends and the room's loop flag is on,
        // restart from the first item instead of clearing the queue.
        if (action.loop && combined.length > 0) {
          return {
            ...state,
            past: [],
            nowPlaying: combined[0],
            cues: combined.slice(1),
          };
        }
        return { ...state, past: combined, nowPlaying: null, cues: [] };
      }
      return {
        ...state,
        past: combined.slice(0, idx),
        nowPlaying: combined[idx],
        cues: combined.slice(idx + 1),
      };
    }
  }
}

/**
 * Local membership status, derived from the `POST /rooms/:id/join` call:
 *
 *  - `joining`         — call in flight; render nothing yet (no flash)
 *  - `joined`          — full room UI is allowed to render
 *  - `pending`         — render the "waiting for the host" overlay until
 *                        a WS approve/reject event arrives
 *  - `rejected`        — leader said no; bounce to home (handled in effect)
 */
type JoinStatus = "joining" | "joined" | "pending" | "rejected";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();

  const { user } = useAuthToken();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [settings, setSettings] = useState<RoomSettingsDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("joining");
  /** Pending join requests visible to the leader. Populated by WS events. */
  const [requests, setRequests] = useState<JoinRequestWire[]>([]);
  /** Pending video-add requests (leader-only). Populated by WS events. */
  const [addRequests, setAddRequests] = useState<VideoAddRequestWire[]>([]);
  /**
   * Local chat list. Wraps `ChatMessageWire` with delivery state so
   * the UI can render single-tick (pending) vs double-tick
   * (delivered) for the sender's own messages. The page uses
   * optimistic insert: send → unshift with status="pending" + a
   * client-generated `clientNonce` → server's emit-with-ack callback
   * upgrades to status="delivered" with the canonical server `id`.
   */
  type LocalChatMessage = ChatMessageWire & {
    status: "pending" | "delivered";
    clientNonce?: string;
  };
  const [chatMessages, setChatMessages] = useState<LocalChatMessage[]>([]);
  /**
   * Map of currently-typing peers. Receiver tracks via TTL safety
   * (5 s) — if a peer's `typing.stop` is lost, we still drop them.
   */
  const [typers, setTypers] = useState<Record<string, { name: string }>>({});
  const typerTimeoutsRef = useRef<Record<string, number>>({});
  /**
   * `true` while the persisted queue is being fetched from the server
   * after the user joins. Drives the queue-tab skeleton.
   */
  const [queueLoading, setQueueLoading] = useState(false);
  /**
   * Mirrors the YT iframe's `onReady`. State (not just a ref) so the
   * snapshot-request effect can react when both the queue lands AND
   * the player becomes ready. Reset when the playback session ends so
   * a fresh session re-arms the request.
   */
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getRoom(roomId);
      if (cancelled) return;
      if (!result.ok) {
        // 401 already handled inside getJsonAuth (token cleared);
        // any other failure (404 / 500 / network) lands here.
        setNotFound(true);
        return;
      }
      setRoom(result.room);
      setSettings(result.room.settings);

      // Now actually try to JOIN. Public rooms or the leader come back
      // `joined`/`already-member` instantly; private rooms come back
      // `pending` and we render the waiting overlay until WS flips it
      // via `room.request.approved`.
      const joinResult = await joinRoom(roomId);
      if (cancelled) return;
      if (!joinResult.ok) {
        toast.error(joinResult.error);
        setJoinStatus("rejected");
        return;
      }
      setJoinStatus(joinResult.status === "pending" ? "pending" : "joined");
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Queue load. Lives in its own effect keyed on `joinStatus` so that
  // pending-then-approved users (private rooms) actually load the queue
  // when their status flips to "joined" via WS — the previous one-shot
  // `[roomId]` mount effect skipped them entirely.
  useEffect(() => {
    if (joinStatus !== "joined") return;
    let cancelled = false;
    (async () => {
      setQueueLoading(true);
      const queueResult = await getRoomQueue(roomId);
      if (cancelled) return;
      if (queueResult.ok) {
        for (const item of queueResult.items) {
          dispatch({
            type: "ADD_VIDEO",
            entry: {
              clipId: item.id,
              videoId: item.videoId,
              addedByName: item.addedByName,
            },
          });
        }
      } else {
        toast.error(queueResult.error);
      }
      setQueueLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, joinStatus]);

  const isOwner = Boolean(user && room && room.createdBy === user.userId);
  // Authority is governed by `editAccess`, NOT `nature`:
  //   ALL     → everyone can pause/play/scrub/jump and add directly.
  //   LIMITED → only the owner can; non-owners' top-bar adds become
  //             video-add requests (handled server-side in addToQueue).
  // `nature` only governs join admission, not playback authority.
  const canControlPlayback = isOwner || settings?.editAccess === "ALL";
  // Chat send authority. `chatRights: LIMITED` → owner-only chat.
  const canSendChat = isOwner || settings?.chatRights === "ALL";

  /* --------------- playback sync state (refs only) --------------- */

  const playerHandleRef = useRef<RoomYouTubePlayerHandle>(null);
  /**
   * Last authoritative state we know of (from a sync we received OR an
   * emit we just sent). The emit gate compares to this so YT events
   * caused by our own imperative play()/pause()/seekTo() (driven by an
   * incoming sync) don't get re-broadcast.
   */
  const lastSyncRef = useRef<{
    videoId: string;
    position: number;
    state: "playing" | "paused";
    time: number;
  } | null>(null);
  /** Sync that arrived before player or queue were ready — apply later. */
  const pendingSyncRef = useRef<PlaybackSyncPayload | null>(null);
  /** Set on `offline` event; consumed on the next `online` to trigger resync. */
  const wasOfflineRef = useRef<boolean>(false);
  /** Debounce stamp so multiple resync triggers within 1s collapse to one. */
  const lastResyncAtRef = useRef<number>(0);

  /**
   * Emit `room.playback.request-snapshot` so the server polls a peer
   * and routes their report back to us. Shared by four triggers:
   *   - first-time arm when queue + player are both ready
   *   - navigator.onLine flip (offline → online recovery)
   *   - player buffer-lag (stalled iframe)
   *   - Socket.IO `connect` reconnect
   * The 1s debounce collapses near-simultaneous triggers into one emit.
   */
  const requestFreshSnapshot = useCallback(() => {
    if (Date.now() - lastResyncAtRef.current < 1000) return;
    lastResyncAtRef.current = Date.now();
    getSocket().emit("room.playback.request-snapshot", { roomId });
  }, [roomId]);

  // WebSocket subscription. Mounted as soon as we have a roomId so the
  // leader's panel reflects requests created via REST (the same socket
  // singleton is used for read+write). For requesters waiting on
  // approval, the same hook delivers `room.request.approved/rejected`.
  useRoomSocket(roomId, {
    onRequestList: (rs) => setRequests(rs),
    onRequestCreated: (r) =>
      setRequests((prev) => (prev.some((p) => p.id === r.id) ? prev : [...prev, r])),
    onRequestExpired: (id) =>
      setRequests((prev) => prev.filter((r) => r.id !== id)),
    onRequestRemoved: (id) => {
      // Single source of truth for "this request is gone" — fired on
      // the room channel for both approve and reject. Filters the
      // card out of the leader's panel state. Requesters receive this
      // event too (they're in the room channel because of their own
      // pending request) but it's harmless: their request id is
      // already not in `requests` for them.
      setRequests((prev) => prev.filter((r) => r.id !== id));
    },
    onRequestApproved: (payload) => {
      // I'm the requester: my request was approved. Slide into the
      // full room UI with the freshly-included payload. The
      // corresponding `removed` event filters the leader's panel —
      // no need to duplicate that here.
      setRoom(payload.room);
      setSettings(payload.room.settings);
      setJoinStatus("joined");
    },
    onRequestRejected: () => {
      // I'm the requester: my request was rejected. Bounce home.
      // Filtering the leader's panel is handled by the `removed`
      // event, not here.
      if (joinStatus === "pending") {
        toast.error("The host declined your request.");
        router.replace("/");
      }
    },
    onMemberJoined: () => {
      // Future: small "X joined" toast. Not in v1.
    },
    onQueueAdded: ({ item }) => {
      // The server broadcasts this for every successful add — both
      // for our own adds (we POSTed; we don't dispatch locally) and
      // for other members' adds. Dispatching `ADD_VIDEO` here is the
      // single source of truth for keeping our reducer in sync.
      dispatch({
        type: "ADD_VIDEO",
        entry: {
          clipId: item.id,
          videoId: item.videoId,
          addedByName: item.addedByName,
        },
      });
    },
    onPlaybackSync: (payload) => {
      // Buffer if we can't apply yet — applied on player ready / queue
      // load via the deferred-apply effect below.
      if (queueLoading || !playerHandleRef.current?.isReady()) {
        pendingSyncRef.current = payload;
        return;
      }
      applySync(payload);
    },
    onPlaybackPollState: (p) => {
      // Server is asking us to report our current state for a peer
      // who emitted `room.playback.request-snapshot`. Read the YT
      // player + reducer's currentIndex; stamp `capturedAt` right
      // next to the `getCurrentTime()` call so the requester's drift
      // compensation can include the peer→server hop. Echo
      // `requesterUserId` so the server can route the targeted reply.
      const handle = playerHandleRef.current;
      if (!handle?.isReady() || !state.nowPlaying) return;
      const ytState = handle.getYTState();
      const playState: "playing" | "paused" =
        ytState === 1 || ytState === 3 ? "playing" : "paused";
      const time = handle.getCurrentTime();
      const capturedAt = Date.now();
      getSocket().emit("room.playback.report-state", {
        roomId,
        videoId: state.nowPlaying.videoId,
        position: currentIndex,
        time,
        state: playState,
        capturedAt,
        requesterUserId: p.requesterUserId,
      });
    },
    /* ---- video-add requests (broadcaster panel) ---- */
    onAddRequestList: (rs) => setAddRequests(rs),
    onAddRequestCreated: (r) =>
      setAddRequests((prev) => (prev.some((p) => p.id === r.id) ? prev : [...prev, r])),
    onAddRequestExpired: (id) =>
      setAddRequests((prev) => prev.filter((r) => r.id !== id)),
    onAddRequestRemoved: (id) => {
      // Single source of truth for "this video-add request is gone" —
      // fired on the room channel for both approve and reject. Filters
      // the card out of the leader's panel state. The requester also
      // receives this broadcast (they're in the room channel) but
      // there's no listener wiring it to UI on their side — toasts
      // come via the user-targeted approved/rejected events below.
      setAddRequests((prev) => prev.filter((r) => r.id !== id));
    },
    onAddRequestApproved: () => {
      // I'm the requester: my add was approved. Server already
      // broadcast `room.queue.added` so the new video lands in my
      // queue via the existing onQueueAdded handler — we just toast.
      toast.success("Your video was added.");
    },
    onAddRequestRejected: () => {
      // I'm the requester: my add was rejected. Soft toast, no redirect.
      toast.error("Host declined your video.");
    },
    /* ---- chat ---- */
    onChatHistory: (msgs) =>
      setChatMessages(msgs.map((m) => ({ ...m, status: "delivered" }))),
    onChatMessage: (m) =>
      // Dedupe by id — guards against the rare case the same broadcast
      // arrives twice (reconnect replay, etc.).
      setChatMessages((prev) =>
        prev.some((x) => x.id === m.id)
          ? prev
          : [...prev, { ...m, status: "delivered" }],
      ),
    onChatTypingStart: ({ userId, userName }) => {
      setTypers((prev) => ({ ...prev, [userId]: { name: userName } }));
      // 5 s safety TTL — peer's `typing.stop` may be lost on
      // reconnect, server's disconnect synth-stop covers most cases
      // but this is the final belt-and-suspenders.
      window.clearTimeout(typerTimeoutsRef.current[userId]);
      typerTimeoutsRef.current[userId] = window.setTimeout(() => {
        setTypers((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        delete typerTimeoutsRef.current[userId];
      }, 5000);
    },
    onChatTypingStop: ({ userId }) => {
      window.clearTimeout(typerTimeoutsRef.current[userId]);
      delete typerTimeoutsRef.current[userId];
      setTypers((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    },
  });

  const handleApproveJoin = useCallback((requestId: string) => {
    getSocket().emit("room.request.approve", { requestId });
  }, []);
  const handleRejectJoin = useCallback((requestId: string) => {
    getSocket().emit("room.request.reject", { requestId });
  }, []);
  /**
   * Send a chat message. Optimistic insert with `status="pending"`
   * (single tick); server's emit-with-ack callback upgrades it to
   * `status="delivered"` (double tick) using the canonical server id.
   * On failure, the optimistic insert is rolled back and a toast
   * surfaces the reason.
   */
  const handleSendChat = useCallback(
    (body: string) => {
      if (!user) return;
      const trimmed = body.trim();
      if (trimmed.length === 0 || trimmed.length > 2000) return;
      const clientNonce = crypto.randomUUID();
      const optimistic: LocalChatMessage = {
        id: clientNonce, // temp; server-assigned id replaces on ack
        roomId,
        senderId: user.userId,
        senderName: user.username,
        body: trimmed,
        createdAt: Date.now(),
        status: "pending",
        clientNonce,
      };
      setChatMessages((prev) => [...prev, optimistic]);
      getSocket().emit(
        "room.chat.send",
        { roomId, body: trimmed, clientNonce },
        (ack: ChatSendAck) => {
          if (ack.ok) {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.clientNonce === clientNonce
                  ? {
                      ...m,
                      id: ack.id,
                      createdAt: ack.createdAt,
                      status: "delivered",
                      clientNonce: undefined,
                    }
                  : m,
              ),
            );
          } else {
            toast.error(`Couldn't send: ${ack.reason}`);
            setChatMessages((prev) =>
              prev.filter((m) => m.clientNonce !== clientNonce),
            );
          }
        },
      );
    },
    [roomId, user],
  );

  /**
   * Emits `room.chat.typing.start` once the user has typed ≥ 4 chars
   * (debounced to one emit per 2 s) and `room.chat.typing.stop` after
   * 3 s of no typing OR when the input drops below the threshold.
   * The composer calls this on every input change.
   */
  const lastTypingEmitRef = useRef(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const handleTypingChange = useCallback(
    (value: string) => {
      const socket = getSocket();
      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (value.trim().length >= 4) {
        const now = Date.now();
        if (now - lastTypingEmitRef.current > 2000) {
          lastTypingEmitRef.current = now;
          socket.emit("room.chat.typing.start", { roomId });
        }
        // 3 s of no further input → auto-stop. Re-set on every keypress.
        typingStopTimerRef.current = window.setTimeout(() => {
          lastTypingEmitRef.current = 0;
          socket.emit("room.chat.typing.stop", { roomId });
          typingStopTimerRef.current = null;
        }, 3000);
      } else if (lastTypingEmitRef.current !== 0) {
        // Dropped below threshold — emit stop if we'd previously started.
        lastTypingEmitRef.current = 0;
        socket.emit("room.chat.typing.stop", { roomId });
      }
    },
    [roomId],
  );

  const handleApproveAdd = useCallback((requestId: string) => {
    getSocket().emit("room.add-request.approve", { requestId });
  }, []);
  const handleRejectAdd = useCallback((requestId: string) => {
    getSocket().emit("room.add-request.reject", { requestId });
  }, []);

  // Set the browser tab title from the canonical server name. Restored
  // on unmount so navigating back to home (or anywhere else) doesn't
  // leak the room name into the next page's title.
  useEffect(() => {
    if (!room?.name) return;
    const previous = document.title;
    document.title = room.name;
    return () => {
      document.title = previous;
    };
  }, [room?.name]);

  const handleLoopToggle = useCallback(async () => {
    if (!isOwner || !settings) return;
    const prev = settings;
    const next: RoomSettingsDetail = { ...settings, loop: !settings.loop };
    setSettings(next);
    const result = await updateRoomSettings(roomId, { loop: next.loop });
    if (!result.ok) {
      setSettings(prev);
      toast.error(result.error);
      return;
    }
    setSettings(result.settings);
  }, [isOwner, settings, roomId]);

  const [state, dispatch] = useReducer(roomReducer, initialState);

  const playlist = useMemo(() => combinedQueue(state), [state]);
  const currentIndex = state.nowPlaying ? state.past.length : -1;

  const phase: "default" | "playing" | "stopped" = !state.sessionStarted
    ? "default"
    : state.nowPlaying
      ? "playing"
      : "stopped";

  /* --------------- playback emit + receive helpers --------------- */

  /**
   * Idempotent emit. The lastSyncRef gate suppresses no-op emits
   * triggered by our own imperative play/pause/seekTo (which fire
   * YT state events that look just like user input). Time uses a
   * 1.5s tolerance — same threshold the player's seek detector
   * uses, so a drift-compensated remote seek doesn't bounce back.
   */
  const emitPlayback = useCallback(
    (opts: { state: "playing" | "paused"; time: number }) => {
      if (!canControlPlayback) return;
      if (!state.nowPlaying) return;
      const next = {
        videoId: state.nowPlaying.videoId,
        position: currentIndex,
        state: opts.state,
        time: opts.time,
      };
      const last = lastSyncRef.current;
      if (
        last &&
        last.videoId === next.videoId &&
        last.position === next.position &&
        last.state === next.state &&
        Math.abs(last.time - next.time) < 1.5
      ) {
        return;
      }
      lastSyncRef.current = next;
      getSocket().emit("room.playback.update", { roomId, ...next });
    },
    [canControlPlayback, roomId, state.nowPlaying, currentIndex],
  );

  /**
   * For position changes (queue jumps, auto-advance) where the new
   * videoId/position can be computed without waiting for the reducer
   * render. Bypasses the time-tolerance comparison since position is
   * an integer match.
   */
  const emitForJump = useCallback(
    (newIndex: number, newVideoId: string) => {
      if (!canControlPlayback) return;
      const next = {
        videoId: newVideoId,
        position: newIndex,
        state: "playing" as const,
        time: 0,
      };
      lastSyncRef.current = next;
      getSocket().emit("room.playback.update", { roomId, ...next });
    },
    [canControlPlayback, roomId],
  );

  /**
   * Receiver pipeline. Stamps lastSyncRef BEFORE applying so the
   * cascade of YT state events triggered by the imperative calls
   * sees a state matching the new sync — emitPlayback's gate then
   * suppresses any echo emits.
   */
  const applySync = useCallback(
    (p: PlaybackSyncPayload) => {
      const handle = playerHandleRef.current;
      if (!handle) return;
      const combined = combinedQueue(state);
      // Position out of range — drop. The leader's next sync will
      // re-correct (or our queue will catch up via room.queue.added).
      if (p.position >= combined.length) return;
      // Queue-mismatch safety: videoId at that position must agree.
      if (combined[p.position]?.videoId !== p.videoId) return;

      lastSyncRef.current = {
        videoId: p.videoId,
        position: p.position,
        state: p.state,
        time: p.time,
      };

      // Drift compensation: what the source clocked at `time` at
      // `capturedAt` is now at `time + driftMs/1000`. We use
      // `capturedAt` (not `updatedAt`) so the peer→server hop is
      // included for snapshot replies — for control-event broadcasts
      // the server stamps capturedAt to its own clock, so the formula
      // collapses to "server→receiver" identically to the prior
      // single-timestamp behavior. Capped at 5s to bound damage from
      // a clock that drifted.
      const driftMs = Date.now() - p.capturedAt;
      const targetTime =
        p.state === "playing" && driftMs > 0 && driftMs < 5000
          ? p.time + driftMs / 1000
          : p.time;

      if (p.position !== currentIndex) {
        // Jump-and-seek atomically. If we did `dispatch + seekTo`, the
        // prop-driven `loadPlaylist(..., 0)` effect would fire on the
        // next render and clobber our seek — that was the new-joiner
        // "lands at 0:00 instead of host's time" bug. `loadAndSeek`
        // bumps the player's internal index ref so the same effect
        // sees `indexMatch=true` and no-ops. Then dispatch updates the
        // queue panel.
        handle.loadAndSeek(p.position, targetTime, p.state === "playing");
        dispatch({ type: "ADVANCE_TO", absoluteIndex: p.position });
        return;
      }

      handle.seekTo(targetTime);
      if (p.state === "playing") handle.play();
      else handle.pause();
    },
    [state, currentIndex],
  );

  // Deferred-apply: a sync may have arrived before the queue finished
  // loading or the player became ready. This effect fires whenever
  // either changes; if a pending sync is waiting and both prerequisites
  // are met, we apply it now.
  useEffect(() => {
    if (queueLoading) return;
    const pending = pendingSyncRef.current;
    if (!pending) return;
    if (!playerHandleRef.current?.isReady()) return;
    applySync(pending);
    pendingSyncRef.current = null;
  }, [queueLoading, applySync]);

  // Offline → online recovery. Only fires `requestFreshSnapshot` on a
  // real offline-to-online transition (the wasOfflineRef guard prevents
  // misfiring on first-load 'online' events).
  useEffect(() => {
    const handleOffline = () => {
      wasOfflineRef.current = true;
    };
    const handleOnline = () => {
      if (!wasOfflineRef.current) return;
      wasOfflineRef.current = false;
      requestFreshSnapshot();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [requestFreshSnapshot]);

  /**
   * Initial snapshot request — fired exactly once per playback session,
   * after we're "ready": joined, queue loaded, player onReady fired,
   * and the session actually has a now-playing video to sync to. Refs
   * (not state) for the gate so the effect doesn't loop on its own
   * re-fire.
   */
  const initialSnapshotRequestedRef = useRef(false);
  useEffect(() => {
    if (joinStatus !== "joined") return;
    if (queueLoading) return;
    if (!playerReady) return;
    if (!state.sessionStarted) return;
    if (initialSnapshotRequestedRef.current) return;
    initialSnapshotRequestedRef.current = true;
    requestFreshSnapshot();
  }, [
    joinStatus,
    queueLoading,
    playerReady,
    state.sessionStarted,
    requestFreshSnapshot,
  ]);

  // Re-arm the snapshot request when the playback session ends — a
  // fresh session (e.g., the queue was emptied and a new video was
  // added) needs its own snapshot poll. Clearing `playerReady` mirrors
  // the player's internal `isReadyRef` reset on phase exit.
  const phaseRef = useRef(phase);
  useEffect(() => {
    if (phaseRef.current === "playing" && phase !== "playing") {
      setPlayerReady(false);
      initialSnapshotRequestedRef.current = false;
    }
    phaseRef.current = phase;
  }, [phase]);

  // Re-fire on socket reconnect — only if we're already in the
  // "ready" steady-state. Otherwise the first-time effect above
  // handles the post-reconnect snapshot once the player rebinds.
  useEffect(() => {
    const socket = getSocket();
    const handleConnect = () => {
      if (joinStatus !== "joined") return;
      if (queueLoading) return;
      if (!playerReady) return;
      requestFreshSnapshot();
    };
    socket.on("connect", handleConnect);
    return () => {
      socket.off("connect", handleConnect);
    };
  }, [joinStatus, queueLoading, playerReady, requestFreshSnapshot]);

  // Helper: POST a videoId to the server. Two outcomes:
  //   - `status: "added"`           direct add. Server broadcasts
  //                                  `room.queue.added`, our
  //                                  `onQueueAdded` handler dispatches
  //                                  the reducer. No local optimism.
  //   - `status: "request-pending"` LIMITED edit-access room and we're
  //                                  not the leader. Server enqueued
  //                                  a video-add request for the
  //                                  leader to approve via the
  //                                  broadcaster panel.
  // Either way: clear the input.
  const postAddVideo = useCallback(
    async (videoId: string) => {
      const result = await addToRoomQueue(roomId, videoId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.status === "request-pending") {
        toast.success("Sent to the host for approval.");
      }
      dispatch({ type: "SET_VIDEO_URL", value: "" });
    },
    [roomId],
  );

  const handleAddVideo = useCallback(() => {
    const videoId = extractYouTubeVideoId(state.videoUrl);
    if (!videoId) return;
    void postAddVideo(videoId);
  }, [state.videoUrl, postAddVideo]);

  const handleSearchPick = useCallback(
    (result: YouTubeSearchResult) => {
      void postAddVideo(result.videoId);
    },
    [postAddVideo],
  );

  // Loop is read inside the dispatch (not at callback creation) so the
  // newest setting is honoured when a video naturally ends — no
  // re-creation of the callback when `loop` changes.
  const loopRef = useRef<boolean>(false);
  loopRef.current = settings?.loop ?? false;

  const handleAdvance = useCallback(
    (absoluteIndex: number) => {
      dispatch({
        type: "ADVANCE_TO",
        absoluteIndex,
        loop: loopRef.current,
      });
      // Emit the advance so other room members follow. Auto-advance
      // (state=0 ENDED → next index) is a "playing at t=0" emit. If
      // the index landed past the end (queue exhausted, no loop), the
      // combined lookup will be undefined and we skip.
      const combined = combinedQueue(state);
      const target = combined[absoluteIndex];
      if (target) emitForJump(absoluteIndex, target.videoId);
    },
    [state, emitForJump],
  );

  const handleQueueJump = useCallback(
    (
      payload:
        | { zone: "past"; index: number }
        | { zone: "next"; index: number },
    ) => {
      const combined = combinedQueue(state);
      const absIndex =
        payload.zone === "past"
          ? payload.index
          : state.past.length + (state.nowPlaying ? 1 : 0) + payload.index;
      const target = combined[absIndex];
      if (!target) return;
      dispatch({ type: "ADVANCE_TO", absoluteIndex: absIndex });
      emitForJump(absIndex, target.videoId);
    },
    [state, emitForJump],
  );

  const ambientVideoId =
    state.nowPlaying?.videoId ??
    state.past[state.past.length - 1]?.videoId ??
    DEFAULT_ROOM_YOUTUBE_VIDEO_ID;

  if (notFound) {
    return (
      <div className="fixed inset-0 z-0 flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <h1 className="text-lg font-semibold">Room not found</h1>
        <Link
          href="/"
          className="text-sm text-accent-blue hover:underline"
        >
          Go back home
        </Link>
      </div>
    );
  }

  // While the join HTTP call is in flight, show the same global loader
  // that the route-level `loading.tsx` uses, so the navigation from the
  // home page → room page is one continuous loading screen instead of
  // a black flash between transitions.
  if (joinStatus === "joining") {
    return <GlobalLoader />;
  }

  if (joinStatus === "pending") {
    return <RoomPendingState roomName={room?.name ?? null} />;
  }

  if (joinStatus === "rejected") {
    // Brief hold while `router.replace("/")` runs from the WS handler.
    // Same loader so we don't flash a blank screen during the bounce.
    return <GlobalLoader />;
  }

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background text-foreground">
      <AmbientPageBackground />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
        <RoomAmbientBackdrop videoId={ambientVideoId} />

        <RoomPageHeader
          roomId={roomId}
          videoUrl={state.videoUrl}
          onVideoUrlChange={(value) =>
            dispatch({ type: "SET_VIDEO_URL", value })
          }
          onAddVideo={handleAddVideo}
          onSearchPick={handleSearchPick}
          roomMembers={[]}
          isOwner={isOwner}
          settings={settings}
          onSettingsUpdated={setSettings}
        />

        <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <RoomWatchLayout
            player={
              <RoomYouTubePlayer
                ref={playerHandleRef}
                phase={phase}
                playlist={playlist}
                currentIndex={currentIndex}
                onAdvance={handleAdvance}
                interactive={canControlPlayback}
                onPlayStateChange={(s) =>
                  emitPlayback({
                    state: s,
                    time: playerHandleRef.current?.getCurrentTime() ?? 0,
                  })
                }
                onSeek={(t) =>
                  emitPlayback({ state: "playing", time: t })
                }
                onBufferLag={() => requestFreshSnapshot()}
                onReady={() => {
                  // Drain any cross-user `playback.update` that arrived
                  // mid-load (different user scrubbed while we were
                  // mounting). The new snapshot path uses onFirstPlay
                  // (below) instead, but real updates can still land
                  // here.
                  if (
                    pendingSyncRef.current &&
                    !queueLoading &&
                    playerHandleRef.current?.isReady()
                  ) {
                    applySync(pendingSyncRef.current);
                    pendingSyncRef.current = null;
                  }
                }}
                onFirstPlay={() => {
                  // Gate the snapshot request on "video is actually
                  // playing" — NOT just "iframe is ready". seekTo /
                  // loadPlaylist applied during YT's autoplay startup
                  // (the window between onReady and first PLAYING) are
                  // race-prone; PLAYING means YT is past that and
                  // commands land deterministically.
                  setPlayerReady(true);
                }}
              />
            }
            nowPlaying={
              <RoomNowPlayingCard
                videoId={state.nowPlaying?.videoId ?? null}
                addedByName={state.nowPlaying?.addedByName ?? null}
              />
            }
            queue={
              <RoomSidePanel
                past={state.past}
                nowPlaying={state.nowPlaying}
                cues={state.cues}
                sessionStarted={state.sessionStarted}
                phase={phase}
                onJump={handleQueueJump}
                loop={settings?.loop ?? false}
                canEdit={isOwner}
                canControlPlayback={canControlPlayback}
                onLoopToggle={handleLoopToggle}
                queueLoading={queueLoading}
                chatMessages={chatMessages}
                currentUserId={user?.userId ?? null}
                canSendChat={canSendChat}
                typers={typers}
                onSendChat={handleSendChat}
                onTypingChange={handleTypingChange}
                className="min-h-0"
              />
            }
            bottomPanel={
              <RoomBroadcasterPanel
                isOwner={isOwner}
                joinRequests={requests}
                addRequests={addRequests}
                onApproveJoin={handleApproveJoin}
                onRejectJoin={handleRejectJoin}
                onApproveAdd={handleApproveAdd}
                onRejectAdd={handleRejectAdd}
              />
            }
          />
        </main>
      </div>
    </div>
  );
}
