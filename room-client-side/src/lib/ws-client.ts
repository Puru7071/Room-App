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
let socketAuthToken = "";

export function getSocket(): Socket {
  const token = getAuthToken();
  const nextAuthToken = token ?? "";
  if (socket) {
    // If auth identity changed (new login/user in same tab), keep the
    // same Socket instance (so existing listeners stay wired) but rotate
    // handshake auth and force a reconnect under the new token.
    if (socketAuthToken !== nextAuthToken) {
      socketAuthToken = nextAuthToken;
      socket.auth = { ...(socket.auth ?? {}), token: nextAuthToken };
      if (socket.connected) {
        socket.disconnect().connect();
      }
    }
    return socket; // connected or still connecting/reconnecting
  }
  if (!token) {
    console.warn("[ws] no auth token — socket will likely fail handshake");
  }
  socketAuthToken = nextAuthToken;
  socket = io(WS_URL, {
    auth: { token: nextAuthToken },
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
  socketAuthToken = "";
}
