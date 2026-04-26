/**
 * Browser-side Socket.IO client. One connection per browser tab,
 * shared across components via the `getSocket()` accessor.
 *
 * Auth: the JWT is read from `localStorage` (via `getAuthToken`) and
 * passed in the handshake `auth.token` field. The server's WS auth
 * middleware verifies it with the same secret as the HTTP `requireAuth`
 * middleware, so a token that works for REST works for sockets too.
 *
 * On logout, `disconnectSocket()` tears the connection down so the
 * server cleans up its end.
 *
 * Lifecycle events are logged to the console with the `[ws]` prefix so
 * connection / auth / disconnect issues surface during development.
 */

import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "@/lib/auth-storage";

const WS_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:9900";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) return socket; // connecting/reconnecting; let it run
  const token = getAuthToken();
  if (!token) {
    console.warn("[ws] no auth token — socket will likely fail handshake");
  }
  socket = io(WS_URL, {
    auth: { token: token ?? "" },
    autoConnect: true,
    // Allow Socket.IO's default transport upgrade path (long-poll → ws).
    // Forcing websocket-only here would break against proxies that don't
    // support upgrades.
  });
  socket.on("connect", () => {
    console.log("[ws] connected:", socket?.id);
  });
  socket.on("connect_error", (err) => {
    console.error("[ws] connect_error:", err.message);
  });
  socket.on("disconnect", (reason) => {
    console.log("[ws] disconnected:", reason);
  });
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
