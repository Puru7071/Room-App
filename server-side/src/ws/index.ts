/**
 * Socket.IO server setup. Attaches to the existing HTTP server so the
 * same port serves both REST and WebSocket traffic.
 *
 * Auth is enforced once per connection in the namespace middleware: the
 * client passes its JWT via `socket.handshake.auth.token`, the same
 * secret used by HTTP middleware verifies it, and the parsed payload is
 * stashed on `socket.data` (typed as `SocketData`). Failures bubble out
 * via `next(err)` and Socket.IO closes the connection.
 *
 * After auth succeeds, `registerRoomChannelHandlers` wires up the
 * room.subscribe / approve / reject events for that socket.
 */

import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server as IOServer } from "socket.io";
import { registerRoomChannelHandlers } from "./roomChannel";
import { startSweeper } from "./joinRequests";
import { startAddRequestSweeper } from "./addRequests";
import type { SocketData } from "./types";

let ioRef: IOServer | null = null;

/**
 * Lazy accessor for handlers that live outside the WS module (e.g. the
 * HTTP `joinRoom` handler) so they can broadcast without importing the
 * boot order. Returns `null` if the WS server isn't attached yet —
 * callers should treat that as "real-time off, just persist".
 */
export function getIo(): IOServer | null {
  return ioRef;
}

export function attachWsServer(httpServer: HttpServer, corsOrigin: RegExp | string) {
  const io = new IOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });
  ioRef = io;

  // Auth handshake. Same JWT shape the HTTP `requireAuth` middleware
  // accepts. Mismatched / expired / missing tokens drop the socket.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length === 0) {
      return next(new Error("unauthorized"));
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("[ws] JWT_SECRET is not set");
      return next(new Error("server misconfigured"));
    }
    try {
      const payload = jwt.verify(token, secret) as {
        userId?: unknown;
        username?: unknown;
      };
      if (
        typeof payload.userId !== "string" ||
        typeof payload.username !== "string"
      ) {
        return next(new Error("unauthorized"));
      }
      const data: SocketData = {
        userId: payload.userId,
        username: payload.username,
      };
      socket.data = data;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    console.log(
      `[ws] connection: socket=${socket.id} userId=${data.userId} username=${data.username}`,
    );
    registerRoomChannelHandlers(io, socket);
    socket.on("disconnect", (reason) => {
      console.log(
        `[ws] disconnect: socket=${socket.id} userId=${data.userId} reason=${reason}`,
      );
    });
  });

  startSweeper(io);
  startAddRequestSweeper(io);

  console.log("[ws] socket.io attached");
}
