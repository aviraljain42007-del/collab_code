import { logger } from "../../shared/logger.js";
import { roomStateManager } from "./room-state.manager.js";

export function registerRoomHandlers(io, socket, { roomService }) {
  const log = logger.child({ socketId: socket.id, userId: socket.userId });

  socket.on("room:join", async ({ roomCode } = {}, callback) => {
    try {
      const { room } = await roomService.joinRoom(roomCode, socket.userId);
      const roomId = room.id;

      await socket.join(roomId);
      roomStateManager.addSocket(
        roomId,
        socket.userId,
        socket.id,
        socket.userName,
      );

      socket.to(roomId).emit("room:user-joined", {
        userId: socket.userId,
        name: socket.userName,
        roomId,
      });

      const presence = roomStateManager.getPresence(roomId);
      const state = roomStateManager.get(roomId);
      socket.emit("presence:sync", { roomId, presence });
      log.info({ roomId }, "socket joined room");

      callback?.({
        success: true,
        room,
        snapshot: state
          ? {
              code: state.code,
              language: state.language,
              version: state.version,
            }
          : null,
        participants: presence,
      });
    } catch (err) {
      log.warn({ err, roomCode }, "socket join failed");
      callback?.({ success: false, error: err.message, code: err.code });
    }
  });

  socket.on("room:leave", async ({ roomId } = {}, callback) => {
    if (!roomId || !socket.rooms.has(roomId)) {
      callback?.({ success: false, error: "Not in room" });
      return;
    }

    await handleLeave(socket, roomId, { roomService, io });
    callback?.({ success: true });
  });

  socket.on("code:update", ({ roomId, newCode } = {}, callback) => {
    if (!roomId || !socket.rooms.has(roomId)) {
      callback?.({ success: false, error: "Not in room" });
      return;
    }
    if (typeof newCode !== "string") {
      callback?.({ success: false, error: "Code must be a string" });
      return;
    }

    try {
      const state = roomStateManager.get(roomId);
      if (!state) {
        callback?.({ success: false, error: "Room state is unavailable" });
        return;
      }

      const result = roomStateManager.applyCodeUpdate(
        roomId,
        state.version,
        newCode,
      );
      socket.to(roomId).emit("code:update", {
        roomId,
        newCode: result.code,
        version: result.currentVersion,
        senderId: socket.userId,
      });
      callback?.({ success: true, version: result.currentVersion });
    } catch (err) {
      log.error({ err, roomId }, "code:update failed");
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on("language:change", ({ roomId, language } = {}, callback) => {
    if (!roomId || !socket.rooms.has(roomId)) {
      callback?.({ success: false, error: "Not in room" });
      return;
    }
    if (!["javascript", "python", "cpp", "java"].includes(language)) {
      callback?.({ success: false, error: "Unsupported language" });
      return;
    }

    const version = roomStateManager.updateLanguage(roomId, language);
    if (version === null) {
      callback?.({ success: false, error: "Room state is unavailable" });
      return;
    }

    socket.to(roomId).emit("language:change", {
      roomId,
      language,
      version,
      senderId: socket.userId,
    });
    callback?.({ success: true, version });
  });

  socket.on("chat:send", async ({ roomId, text } = {}, callback) => {
    if (!roomId || !socket.rooms.has(roomId)) {
      callback?.({ success: false, error: "Not in room" });
      return;
    }

    const messageText = typeof text === "string" ? text.trim() : "";
    if (!messageText) {
      callback?.({ success: false, error: "Message cannot be empty" });
      return;
    }
    if (messageText.length > 1000) {
      callback?.({
        success: false,
        error: "Message cannot exceed 1000 characters",
      });
      return;
    }

    try {
      const message = await roomService.saveChatMessage({
        roomId,
        senderId: socket.userId,
        text: messageText,
      });
      io.to(roomId).emit("chat:message", message);
      callback?.({ success: true, messageId: message.id });
    } catch (err) {
      log.error({ err, roomId }, "chat:send failed");
      callback?.({ success: false, error: "Failed to send message" });
    }
  });

  socket.on("disconnect", async () => {
    log.info("socket disconnected");
    const rooms = Array.from(socket.rooms).filter((roomId) => roomId !== socket.id);
    for (const roomId of rooms) {
      await handleLeave(socket, roomId, {
        roomService,
        io,
        isDisconnect: true,
      });
    }
  });
}

async function handleLeave(
  socket,
  roomId,
  { roomService, io, isDisconnect = false },
) {
  if (!isDisconnect) socket.leave(roomId);

  const { fullyOffline } = roomStateManager.removeSocket(
    roomId,
    socket.userId,
    socket.id,
  );
  if (!fullyOffline) return;

  try {
    if (isDisconnect) {
      const { MongoRoomRepository } = await import("./mongo-room.repository.js");
      const repo = new MongoRoomRepository();
      await repo.updateParticipantStatus(roomId, socket.userId, "offline");
    } else {
      await roomService.leaveRoomById(roomId, socket.userId);
    }

    io.to(roomId).emit("room:user-left", { userId: socket.userId, roomId });
    io.to(roomId).emit("presence:sync", {
      roomId,
      presence: roomStateManager.getPresence(roomId),
    });
  } catch (err) {
    logger.error(
      { err, roomId, userId: socket.userId },
      "leave handling failed",
    );
  }
}
