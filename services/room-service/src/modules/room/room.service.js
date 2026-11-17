import { MongoRoomRepository } from "./mongo-room.repository.js";
import { roomStateManager } from "./room-state.manager.js";
import {
  RoomNotFoundError,
  RoomExpiredError,
  RoomLimitExceededError,
} from "./room.errors.js";

const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const REVIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ACTIVE_ROOMS = 3;

export class RoomService {
  constructor(repository) {
    this.repo = repository;
  }

  async createRoom(hostId, { name, language }) {
    const finalName = name || `Room ${Math.floor(Math.random() * 1000)}`;
    const room = await this.repo.create({ name: finalName, hostId, language });

    // Host auto-joins
    await this.repo.upsertParticipant({
      roomId: room.id,
      userId: hostId,
      status: "online",
    });

    const snapshot = await this.repo.getLatestSnapshot(room.id);
    roomStateManager.getOrHydrate(room, snapshot);
    return { room, snapshot };
  }
    async getRoomById(roomId) {
    const room = await this.repo.findById(roomId);
    if (!room) throw new RoomNotFoundError();
    return room;
  }
  async joinRoom(roomCode, userId) {
    let room = await this.repo.findByCode(roomCode);
    if (!room) throw new RoomNotFoundError();

    // ── Lazy Expiry Check (Q6 decision) ──
    if (
      room.status === "active" &&
      room.lastActivityAt < new Date(Date.now() - ROOM_EXPIRY_MS)
    ) {
      await this.repo.markExpired(room.id);
      room.status = "expired";
    }

    // ── Revive if Expired ──
    if (room.status === "expired") {
      const latestSnapshot = await this.repo.getLatestSnapshot(room.id);
      if (!latestSnapshot) {
        throw new RoomNotFoundError(); // Hard gone
      }
      // Check 7-day revive window (simplified: assume snapshot exists)
      // In production, check snapshot.createdAt < 7 days.

      room = await this.repo.reviveRoom(room.id);
      if (!room) throw new RoomExpiredError(); // Race: someone else deleted it
    }

    // ── Max 3 Rooms Check ──
    const existingMember = await this.repo.findParticipant(room.id, userId);
    if (!existingMember) {
      const activeCount =
        await this.repo.countUserActiveParticipantships(userId);
      if (activeCount >= MAX_ACTIVE_ROOMS) {
        throw new RoomLimitExceededError();
      }
    }

    // ── Upsert Participant + Touch Room ──
    await this.repo.upsertParticipant({
      roomId: room.id,
      userId,
      status: "online",
    });
    await this.repo.touchRoom(room.id);

    // ── Hydrate + Return ──
    const latestSnapshot = await this.repo.getLatestSnapshot(room.id);
    roomStateManager.getOrHydrate(room, latestSnapshot);

    const participants = await this.repo.findParticipants(room.id);

    return { room, snapshot: latestSnapshot, participants };
  }
  async leaveRoom(roomCode, userId) {
    const room = await this.repo.findByCode(roomCode); // ← findByCode instead of findById
    if (!room) throw new RoomNotFoundError();

    const participant = await this.repo.findParticipant(room.id, userId);
    if (!participant) throw new NotRoomMemberError();

    await this.repo.updateParticipantStatus(room.id, userId, "left");
  }

  // room.service.js ke andar
  async leaveRoomById(roomId, userId) {
    const participant = await this.repo.findParticipant(roomId, userId);
    if (participant && participant.status !== "left") {
      await this.repo.updateParticipantStatus(roomId, userId, "left");
    }
  }

  async getRoom(roomCode) {
    const room = await this.repo.findByCode(roomCode);
    if (!room) throw new RoomNotFoundError();

    const participants = await this.repo.findParticipants(room.id);
    const latestSnapshot = await this.repo.getLatestSnapshot(room.id);

    return { room, participants, snapshot: latestSnapshot };
  }

    async getChatMessages(roomCode, limit) {
    const room = await this.repo.findByCode(roomCode)
    if (!room) throw new RoomNotFoundError()
    return this.repo.getChatMessages(room.id, limit)
  }

  async saveChatMessage({ roomId, senderId, text }) {
    return this.repo.saveChatMessage({ roomId, senderId, text })
  }
}
