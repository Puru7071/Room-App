"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/ws-client";
import type {
  JoinRequestWire,
  MemberJoinedPayload,
  PlaybackPollPayload,
  PlaybackSyncPayload,
  QueueAddedPayload,
  RequestApprovedPayload,
  RequestCreatedPayload,
  RequestExpiredPayload,
  RequestListPayload,
  RequestRejectedPayload,
  RequestRemovedPayload,
} from "@/lib/ws-events";

type Handlers = {
  /** Initial set of pending requests, sent only to the room leader on subscribe. */
  onRequestList?: (requests: JoinRequestWire[]) => void;
  /** A new pending request just arrived (leader-only). */
  onRequestCreated?: (request: JoinRequestWire) => void;
  /** TTL sweep evicted a request OR a leader resolved one in another tab. */
  onRequestExpired?: (requestId: string) => void;
  /**
   * Broadcast to the room channel when a request is resolved
   * (approved OR rejected). The leader's panel filters the card
   * out of state from this signal — independent of the requester-
   * targeted `approved` / `rejected` events.
   */
  onRequestRemoved?: (requestId: string) => void;
  /** Sent to the requester when the leader approves their request. */
  onRequestApproved?: (payload: RequestApprovedPayload) => void;
  /** Sent to the requester when the leader rejects their request. */
  onRequestRejected?: (requestId: string) => void;
  /** Anyone (incl. self) joined the room channel. */
  onMemberJoined?: (member: MemberJoinedPayload) => void;
  /**
   * A new queue item was persisted on the server and is being
   * broadcast to all room members (including the sender). The
   * receiving page dispatches the existing `ADD_VIDEO` reducer
   * action so the client-side queue stays in sync without an
   * optimistic local dispatch.
   */
  onQueueAdded?: (payload: QueueAddedPayload) => void;
  /**
   * Authoritative playback state broadcast from the server — fires
   * on every accepted update AND as the response to a poll
   * triggered by a fresh subscribe. Receivers apply via the page's
   * `applySync` (drift-compensated seek + play/pause + queue jump).
   */
  onPlaybackSync?: (payload: PlaybackSyncPayload) => void;
  /**
   * Server is asking us to report our current playback state so a
   * just-subscribed peer can be brought up to date. Handler reads
   * the local YT player + reducer index and emits
   * `room.playback.report-state`.
   */
  onPlaybackPollState?: (payload: PlaybackPollPayload) => void;
};

/**
 * Subscribes the current socket to a room's channel and wires the
 * given event handlers. Cleans up listeners on unmount and on roomId
 * change. The socket itself is shared (singleton), so unmounting one
 * subscriber doesn't disconnect.
 *
 * **Idempotent** in two senses:
 *   - Multiple components can call this for the same roomId; all of
 *     them receive events.
 *   - Re-subscribing (e.g. on reconnect) is safe; the server filters
 *     by membership before joining a channel, and Socket.IO de-dupes
 *     `socket.join` on the room name.
 */
export function useRoomSocket(roomId: string, handlers: Handlers) {
  // Stash the latest handlers in a ref so the effect doesn't need to
  // re-subscribe every render when callers pass a fresh `handlers`
  // object. Listeners read from `ref.current` each fire.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    const onList = (p: RequestListPayload) => {
      if (p.roomId !== roomId) return;
      handlersRef.current.onRequestList?.(p.requests);
    };
    const onCreated = (p: RequestCreatedPayload) => {
      if (p.request.roomId !== roomId) return;
      handlersRef.current.onRequestCreated?.(p.request);
    };
    const onExpired = (p: RequestExpiredPayload) => {
      if (p.roomId !== roomId) return;
      handlersRef.current.onRequestExpired?.(p.requestId);
    };
    const onRemoved = (p: RequestRemovedPayload) => {
      if (p.roomId !== roomId) return;
      handlersRef.current.onRequestRemoved?.(p.requestId);
    };
    const onApproved = (p: RequestApprovedPayload) => {
      if (p.room.roomId !== roomId) return;
      handlersRef.current.onRequestApproved?.(p);
    };
    const onRejected = (p: RequestRejectedPayload) => {
      if (p.roomId !== roomId) return;
      handlersRef.current.onRequestRejected?.(p.requestId);
    };
    const onJoined = (p: MemberJoinedPayload) => {
      if (p.roomId !== roomId) return;
      handlersRef.current.onMemberJoined?.(p);
    };
    const onQueueAdded = (p: QueueAddedPayload) => {
      handlersRef.current.onQueueAdded?.(p);
    };
    const onPlaybackSync = (p: PlaybackSyncPayload) => {
      if (p.roomId !== roomId) return;
      handlersRef.current.onPlaybackSync?.(p);
    };
    const onPlaybackPollState = (p: PlaybackPollPayload) => {
      if (p.roomId !== roomId) return;
      handlersRef.current.onPlaybackPollState?.(p);
    };

    socket.on("room.request.list", onList);
    socket.on("room.request.created", onCreated);
    socket.on("room.request.expired", onExpired);
    socket.on("room.request.removed", onRemoved);
    socket.on("room.request.approved", onApproved);
    socket.on("room.request.rejected", onRejected);
    socket.on("room.member.joined", onJoined);
    socket.on("room.queue.added", onQueueAdded);
    socket.on("room.playback.sync", onPlaybackSync);
    socket.on("room.playback.poll-state", onPlaybackPollState);

    // Subscribe both on initial mount AND on every reconnect — Socket.IO
    // forgets which channels the client was in across a disconnect.
    const subscribe = () => socket.emit("room.subscribe", { roomId });
    subscribe();
    socket.on("connect", subscribe);

    return () => {
      socket.off("room.request.list", onList);
      socket.off("room.request.created", onCreated);
      socket.off("room.request.expired", onExpired);
      socket.off("room.request.removed", onRemoved);
      socket.off("room.request.approved", onApproved);
      socket.off("room.request.rejected", onRejected);
      socket.off("room.member.joined", onJoined);
      socket.off("room.queue.added", onQueueAdded);
      socket.off("room.playback.sync", onPlaybackSync);
      socket.off("room.playback.poll-state", onPlaybackPollState);
      socket.off("connect", subscribe);
    };
  }, [roomId]);
}

/** Re-export the wire type so callers don't need a second import. */
export type { JoinRequestWire } from "@/lib/ws-events";
