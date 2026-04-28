/**
 * In-memory ring buffer of recent chat messages, capped at
 * `MAX_MESSAGES_PER_ROOM` per room. **No DB persistence** — server
 * restart wipes chat by design, matching the same trade-off
 * `joinRequests` / `addRequests` make.
 *
 * Public surface:
 *   appendMessage({ roomId, senderId, senderName, body })
 *     — assigns a server-side UUID + timestamp, pushes to the room's
 *       buffer, evicts the oldest if the cap is exceeded, returns the
 *       fully-formed wire shape.
 *   listMessages(roomId)
 *     — current buffer for one room (oldest → newest). Empty array for
 *       unknown rooms. Sent in one `room.chat.history` emit when an
 *       active member subscribes.
 */

import { randomUUID } from "node:crypto";
import type { ChatMessageWire } from "./types";

/**
 * Hard cap per room. ~100 KB at typical message size — cheap, and
 * "enough scrollback to read on join" for casual rooms. The client
 * also windows what it renders in the DOM via react-virtuoso, so this
 * cap is purely about server memory + the size of the one
 * `room.chat.history` emit on subscribe.
 */
const MAX_MESSAGES_PER_ROOM = 1000;

const messagesByRoom = new Map<string, ChatMessageWire[]>();

export function appendMessage(args: {
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
}): ChatMessageWire {
  const msg: ChatMessageWire = {
    id: randomUUID(),
    roomId: args.roomId,
    senderId: args.senderId,
    senderName: args.senderName,
    body: args.body,
    createdAt: Date.now(),
  };
  const list = messagesByRoom.get(args.roomId) ?? [];
  list.push(msg);
  // splice mutates in place so existing references stay valid.
  if (list.length > MAX_MESSAGES_PER_ROOM) {
    list.splice(0, list.length - MAX_MESSAGES_PER_ROOM);
  }
  messagesByRoom.set(args.roomId, list);
  return msg;
}

export function listMessages(roomId: string): ChatMessageWire[] {
  return messagesByRoom.get(roomId) ?? [];
}
