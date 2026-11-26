import mongoose from "mongoose";
import { Room } from "./room.model.js";
import { Participant } from "./participant.model.js";
import { CodeSnapshot } from "./code-snapshot.model.js";
import { generateRoomCode } from "./room-code.generator.js";
import { RoomCodeGenerationError } from "./room.errors.js";
import { ChatMessage } from "./chat-message.model.js";

// ── Plain object converters (Mongoose → domain) ──
const toRoomPlain = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: o._id.toString(),
    roomCode: o.roomCode,
    name: o.name,
    hostId: o.hostId?.toString() ?? null,
    language: o.language,
    currentVersion: o.currentVersion,
    status: o.status,
    lastActivityAt: o.lastActivityAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
};

const toParticipantPlain = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: o._id.toString(),
    roomId: o.roomId?.toString() ?? null,
    userId: o.userId?.toString() ?? null,
    status: o.status,
    joinedAt: o.joinedAt,
    lastSeenAt: o.lastSeenAt,
  };
};

const toSnapshotPlain = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: o._id.toString(),
    roomId: o.roomId?.toString() ?? null,
    version: o.version,
    code: o.code,
    language: o.language,
    createdAt: o.createdAt,
  };
};
// Ise change karke ye karo:
const isValidId = (id) => typeof id === "string" && id.length > 0;

export class MongoRoomRepository {
  // ══════════════════════════════════════════════════════
  // ROOM
  // ══════════════════════════════════════════════════════

  async create({ name, hostId, language }) {
    const MAX_RETRIES = 3;
    let roomDoc = null;

    // Q4 decision: retry loop on duplicate roomCode
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const roomCode = generateRoomCode();
      try {
        roomDoc = await Room().create({
          roomCode,
          name,
          hostId,
          language,
          currentVersion: 1,
          lastActivityAt: new Date(),
        });
        break;
      } catch (err) {
        if (err.code === 11000) {
          // Duplicate roomCode — retry with new code
          if (attempt < MAX_RETRIES - 1) continue;
          throw new RoomCodeGenerationError();
        }
        throw err;
      }
    }

    // Compensating action: if snapshot creation fails, delete the room
    // (Production could use a transaction — Atlas supports it. MVP keeps it simple.)
    try {
      await CodeSnapshot().create({
        roomId: roomDoc._id,
        version: 1,
        code: "",
        language,
      });
    } catch (snapshotErr) {
      await Room().deleteOne({ _id: roomDoc._id });
      throw snapshotErr;
    }

    return toRoomPlain(roomDoc);
  }

  async findByCode(roomCode) {
    if (!roomCode) return null;
    const doc = await Room().findOne({ roomCode }).lean();
    return toRoomPlain(doc);
  }

  async findById(id) {
    if (!isValidId(id)) return null;
    const doc = await Room().findById(id).lean();
    return toRoomPlain(doc);
  }

  async touchRoom(roomId) {
    if (!isValidId(roomId)) return;
    await Room().updateOne(
      { _id: roomId },
      { $set: { lastActivityAt: new Date() } },
    );
  }

  async updateRoomVersion(roomId, version) {
    if (!isValidId(roomId)) return null;
    const doc = await Room()
      .findByIdAndUpdate(
        roomId,
        { $set: { currentVersion: version } },
        { returnDocument: "after" },
      )
      .lean();
    return toRoomPlain(doc);
  }

  async updateRoomLanguage(roomId, language) {
    if (!isValidId(roomId)) return null;
    const doc = await Room()
      .findByIdAndUpdate(
        roomId,
        { $set: { language, lastActivityAt: new Date() } },
        { returnDocument: "after" },
      )
      .lean();
    return toRoomPlain(doc);
  }

  async markExpired(roomId) {
    if (!isValidId(roomId)) return;
    const result = await Room().updateOne(
      { _id: roomId, status: "active" }, // ← guard
      { $set: { status: "expired" } },
    );
    if (result.modifiedCount > 0) {
      await Participant().updateMany({ roomId }, { $set: { status: "left" } });
    }
  }

  async reviveRoom(roomId) {
    if (!isValidId(roomId)) return null;
    // Atomic conditional: only revive if currently expired
    const doc = await Room()
      .findOneAndUpdate(
        { _id: roomId, status: "expired" },
        { $set: { status: "active", lastActivityAt: new Date() } },
        { returnDocument: "after" },
      )
      .lean();
    return toRoomPlain(doc);
  }

  // ══════════════════════════════════════════════════════
  // PARTICIPANT
  // ══════════════════════════════════════════════════════

  async upsertParticipant({ roomId, userId, status = "online" }) {
    const filter = { roomId, userId };
    const update = {
      $set: { status, lastSeenAt: new Date() },
      $setOnInsert: { joinedAt: new Date() },
    };

    try {
      const doc = await Participant().findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
        lean: true,
      });
      return toParticipantPlain(doc);
    } catch (err) {
      if (err.code === 11000) {
        // Race: concurrent upsert won. Retry as pure update.
        const doc = await Participant().findOneAndUpdate(
          filter,
          { $set: { status, lastSeenAt: new Date() } },
          { new: true, lean: true },
        );
        return toParticipantPlain(doc);
      }
      throw err;
    }
  }

  async findParticipant(roomId, userId) {
    if (!isValidId(roomId) || !isValidId(userId)) return null;
    const doc = await Participant().findOne({ roomId, userId }).lean();
    return toParticipantPlain(doc);
  }

  async findParticipants(roomId) {
    if (!isValidId(roomId)) return [];
    const docs = await Participant()
      .find({ roomId, status: { $ne: "left" } })
      .lean();
    return docs.map(toParticipantPlain);
  }

  async updateParticipantStatus(roomId, userId, status) {
    if (!isValidId(roomId) || !isValidId(userId)) return;
    await Participant().updateOne(
      { roomId, userId },
      { $set: { status, lastSeenAt: new Date() } },
    );
  }

  async countUserActiveParticipantships(userId) {
    if (!isValidId(userId)) return 0;
    // Cross-collection within SAME DB — allowed. auth_db untouched.
    const result = await Participant().aggregate([
      {
        $match: {
          userId: userId, // Direct UUID (String) hi rakho
          status: { $ne: "left" },
        },
      },
      {
        $lookup: {
          from: "rooms", // Mongoose pluralized collection name
          localField: "roomId",
          foreignField: "_id",
          as: "room",
        },
      },
      { $unwind: "$room" },
      { $match: { "room.status": "active" } },
      { $count: "count" },
    ]);
    return result[0]?.count ?? 0;
  }

  // ══════════════════════════════════════════════════════
  // SNAPSHOT
  // ══════════════════════════════════════════════════════

  async createSnapshot({ roomId, version, code, language }) {
    try {
      const doc = await CodeSnapshot().create({
        roomId,
        version,
        code,
        language,
      });
      return toSnapshotPlain(doc);
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate version — sweeper already wrote. Return existing.
        const existing = await CodeSnapshot()
          .findOne({ roomId, version })
          .lean();
        return toSnapshotPlain(existing);
      }
      throw err;
    }
  }

  async getLatestSnapshot(roomId) {
    if (!isValidId(roomId)) return null;
    const doc = await CodeSnapshot()
      .findOne({ roomId })
      .sort({ version: -1 })
      .lean();
    return toSnapshotPlain(doc);
  }

  // ══════════════════════════════════════════════════════
  // CHAT
  // ══════════════════════════════════════════════════════

  async saveChatMessage({ roomId, senderId, text }) {
    const doc = await ChatMessage().create({ roomId, senderId, text });
    return {
      id: doc._id.toString(),
      roomId: doc.roomId.toString(),
      senderId: doc.senderId.toString(),
      text: doc.text,
      createdAt: doc.createdAt,
    };
  }

  async getChatMessages(roomId, limit = 50) {
    if (!isValidId(roomId)) return [];
    const docs = await ChatMessage()
      .find({ roomId })
      .sort({ createdAt: -1 }) // Latest first
      .limit(limit)
      .lean();

    // Reverse taaki chronological order mein dikhe (purana pehle, naya baad mein)
    return docs.reverse().map((doc) => ({
      id: doc._id.toString(),
      senderId: doc.senderId.toString(),
      text: doc.text,
      createdAt: doc.createdAt,
    }));
  }
}
