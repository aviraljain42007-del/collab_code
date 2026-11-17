import { Server } from "socket.io";
import { logger } from "./logger.js";
import { registerRoomHandlers } from "../modules/room/room.ws-handler.js";

export function initSocket(httpServer, dependencies) {
  const { tokenService, roomService } = dependencies; // roomService add kiya

  const io = new Server(httpServer, {
    cors: { origin: "http://localhost:5173", credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("UNAUTHORIZED: Missing token"));
    const payload = tokenService.verifyAccessToken(token);
    if (!payload || !payload.userId)
      return next(new Error("UNAUTHORIZED: Invalid token"));
    socket.userId = payload.userId;
    next();
  });

  io.on("connection", (socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.userId },
      "socket connected",
    );

    // Register room events
    registerRoomHandlers(io, socket, dependencies);
  });

  return io;
}
