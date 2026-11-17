import { logger } from "../../shared/logger.js";
import { roomStateManager } from "./room-state.manager.js";
import { RoomNotFoundError } from "./room.errors.js";

export function registerRoomHandlers(io, socket, { roomService }) {
  const log = logger.child({ socketId: socket.id, userId: socket.userId });

  // ── Event: room:join ──
  socket.on("room:join", async ({ roomCode }, callback) => {
    try {
      // 1. Service ke through DB mein join karo (limit check, expiry check, etc.)
      const { room, participants } = await roomService.joinRoom(
        roomCode,
        socket.userId,
      );
      const roomId = room.id;

      // 2. Socket.IO ke logical room mein add karo
      socket.join(roomId);

      // 3. In-memory state manager mein socket add karo (multi-tab tracking)
      roomStateManager.addSocket(roomId, socket.userId, socket.id);

      // 4. Baaki sabko notify karo ki naya user aaya hai
      socket.to(roomId).emit("room:user-joined", {
        userId: socket.userId,
        roomId,
      });

      // 5. Naye user ko current presence list bhejo
      const presence = roomStateManager.getPresence(roomId);
      socket.emit("presence:sync", { roomId, presence });

      log.info({ roomId }, "socket joined room");

      if (callback) callback({ success: true, room, participants });
    } catch (err) {
      log.warn({ err, roomCode }, "socket join failed");
      if (callback)
        callback({ success: false, error: err.message, code: err.code });
    }
  });

  // ── Event: room:leave (Explicit leave) ──
  socket.on("room:leave", async ({ roomId }, callback) => {
    try {
      await handleLeave(socket, roomId, { roomService, io });
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ── Event: code:update (Live Code Sync) ──
  socket.on(
    "code:update",
    async ({ roomId, expectedVersion, newCode }, callback) => {
      // 1. Check: user is actually in this room?
      if (!socket.rooms.has(roomId)) {
        return callback && callback({ success: false, error: "Not in room" });
      }

      try {
        // 2. In-memory state update (with version check)
        const result = roomStateManager.applyCodeUpdate(
          roomId,
          expectedVersion,
          newCode,
        );

        // 3. Conflict? (Client had old version)
        if (!result.success) {
          socket.emit("code:conflict", {
            roomId,
            currentVersion: result.currentVersion,
            code: result.code,
          });
          return (
            callback && callback({ success: false, error: "Version mismatch" })
          );
        }

        // 4. Broadcast to others (except sender)
        socket.to(roomId).emit("code:update", {
          roomId,
          newCode: result.code,
          version: result.currentVersion,
          senderId: socket.userId,
        });

        // 5. Touch Room (update lastActivityAt in DB - fire and forget)
        const { MongoRoomRepository } =
          await import("./mongo-room.repository.js");
        const repo = new MongoRoomRepository();
        repo
          .touchRoom(roomId)
          .catch((err) => log.error({ err, roomId }, "touchRoom failed"));

        if (callback)
          callback({ success: true, version: result.currentVersion });
      } catch (err) {
        log.error({ err, roomId }, "code:update failed");
        if (callback) callback({ success: false, error: err.message });
      }
    },
  );

  // ── Event: language:change ──
  socket.on("language:change", async ({ roomId, language }, callback) => {
    if (!socket.rooms.has(roomId)) {
      return callback && callback({ success: false, error: "Not in room" });
    }

    try {
      const newVersion = roomStateManager.updateLanguage(roomId, language);

      // Broadcast to others
      socket.to(roomId).emit("language:change", {
        roomId,
        language,
        version: newVersion,
        senderId: socket.userId,
      });

      // Update DB
      const { MongoRoomRepository } =
        await import("./mongo-room.repository.js");
      const repo = new MongoRoomRepository();
      repo
        .updateRoomLanguage(roomId, language)
        .catch((err) =>
          log.error({ err, roomId }, "updateRoomLanguage failed"),
        );

      if (callback) callback({ success: true, version: newVersion });
    } catch (err) {
      log.error({ err, roomId }, "language:change failed");
      if (callback) callback({ success: false, error: err.message });
    }
  });
  // ── Event: chat:send ──
  socket.on('chat:send', async ({ roomId, text }, callback) => {
    if (!socket.rooms.has(roomId)) {
      return callback && callback({ success: false, error: 'Not in room' })
    }

    if (!text || text.trim().length === 0) {
      return callback && callback({ success: false, error: 'Message cannot be empty' })
    }

    try {
      // 1. DB mein save karo (Q4 decision: DB pehle, phir broadcast)
      const message = await roomService.saveChatMessage({
        roomId,
        senderId: socket.userId,
        text: text.trim(),
      })

      // 2. Room ke sabko broadcast karo (including sender)
      io.to(roomId).emit('chat:message', message)

      if (callback) callback({ success: true, messageId: message.id })
    } catch (err) {
      log.error({ err, roomId }, 'chat:send failed')
      if (callback) callback({ success: false, error: 'Failed to send message' })
    }
  })
  // ── Event: disconnect (Network drop / Tab close) ──
  socket.on("disconnect", async () => {
    log.info("socket disconnected");

    // User multiple rooms mein ho sakta hai, sabko handle karo
    // socket.rooms ek Set hota hai jisme socket.id aur joined roomIds hote hain
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);

    for (const roomId of rooms) {
      await handleLeave(socket, roomId, {
        roomService,
        io,
        isDisconnect: true,
      });
    }
  });
}

// ── Shared Leave Logic ──
async function handleLeave(
  socket,
  roomId,
  { roomService, io, isDisconnect = false },
) {
  // 1. Socket.IO room se nikaalo (disconnect pe automatic hota hai, but explicit pe manual)
  if (!isDisconnect) {
    socket.leave(roomId);
  }

  // 2. State manager se socket remove karo
  const { fullyOffline } = roomStateManager.removeSocket(
    roomId,
    socket.userId,
    socket.id,
  );

  // 3. Agar user ke saare tabs band ho gaye hain, tabhi DB update karo
  if (fullyOffline) {
    try {
      if (isDisconnect) {
        // Disconnect pe 'offline' mark karo (grace period Phase 5 part 3 mein aayega)
        // Abhi ke liye hum offline mark kar rahe hain
        const { MongoRoomRepository } =
          await import("./mongo-room.repository.js");
        const repo = new MongoRoomRepository();
        await repo.updateParticipantStatus(roomId, socket.userId, "offline");
      } else {
        // Explicit leave
        await roomService.leaveRoomById(roomId, socket.userId);
      }

      // 4. Baaki sabko notify karo
      io.to(roomId).emit("room:user-left", { userId: socket.userId, roomId });

      // 5. Updated presence broadcast karo
      const presence = roomStateManager.getPresence(roomId);
      io.to(roomId).emit("presence:sync", { roomId, presence });
    } catch (err) {
      logger.error(
        { err, roomId, userId: socket.userId },
        "leave handling failed",
      );
    }
  }
}
