/**
 * Ephemeral moment-reaction bursts — **outside** the main room Zustand store.
 *
 * Includes a **pending queue**: WS events can arrive in the same tick before
 * `MomentReactionOverlay` runs its subscribe effect; without buffering those
 * payloads were dropped while local optimistic UI still worked.
 */

export type MomentReactionBurstPayload = {
  emoji: string;
  burstId: string;
};

type Listener = (payload: MomentReactionBurstPayload) => void;

const listeners = new Map<string, Set<Listener>>();
/** Bursts received before any subscriber mounted (race) or tab wake edge cases. */
const pending = new Map<string, MomentReactionBurstPayload[]>();

const MAX_PENDING = 32;

/** Align URL params, encoding, and server `roomId` so Map keys match every client. */
export function normalizeRoomId(
  roomId: string | string[] | undefined,
): string {
  const raw = Array.isArray(roomId) ? roomId[0] : roomId;
  if (!raw || typeof raw !== "string") return "";
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

function key(roomId: string): string {
  return normalizeRoomId(roomId);
}

export function subscribeMomentReactionBursts(
  roomId: string,
  fn: Listener,
): () => void {
  const k = key(roomId);
  if (!k) return () => {};

  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(fn);

  const backlog = pending.get(k);
  if (backlog?.length) {
    pending.delete(k);
    const toFlush = [...backlog];
    queueMicrotask(() => {
      for (const payload of toFlush) {
        fn(payload);
      }
    });
  }

  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(k);
  };
}

/** Rail (optimistic) + page WS handler (remote). */
export function publishMomentReactionBurst(
  roomId: string,
  payload: MomentReactionBurstPayload,
): void {
  const k = key(roomId);
  if (!k) return;

  const set = listeners.get(k);
  if (!set || set.size === 0) {
    const arr = pending.get(k) ?? [];
    arr.push(payload);
    while (arr.length > MAX_PENDING) arr.shift();
    pending.set(k, arr);
    return;
  }
  for (const fn of set) fn(payload);
}
