import { toRoomDto, toParticipantDto, toSnapshotDto } from "./room.dto.js";

export class RoomController {
  constructor(roomService) {
    this.service = roomService;
  }

  create = async (req, res, next) => {
    try {
      const { name, language } = req.body;
      const { room, snapshot } = await this.service.createRoom(req.userId, {
        name,
        language,
      });
      res.status(201).json({
        room: toRoomDto(room),
        snapshot: toSnapshotDto(snapshot),
      });
    } catch (err) {
      next(err);
    }
  };

  get = async (req, res, next) => {
    try {
      const { roomCode } = req.params;
      const { room, participants, snapshot } =
        await this.service.getRoom(roomCode);
      res.status(200).json({
        room: toRoomDto(room),
        participants: participants.map(toParticipantDto),
        snapshot: toSnapshotDto(snapshot),
      });
    } catch (err) {
      next(err);
    }
  };

  join = async (req, res, next) => {
    try {
      const { roomCode } = req.params;
      const { room, participants, snapshot } = await this.service.joinRoom(
        roomCode,
        req.userId,
      );
      res.status(200).json({
        room: toRoomDto(room),
        participants: participants.map(toParticipantDto),
        snapshot: toSnapshotDto(snapshot),
      });
    } catch (err) {
      next(err);
    }
  };

  leave = async (req, res, next) => {
    try {
      const { roomCode } = req.params;
      await this.service.leaveRoom(roomCode, req.userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getMessages = async (req, res, next) => {
    try {
      const { roomCode } = req.params
      const limit = parseInt(req.query.limit, 10) || 50
      const messages = await this.service.getChatMessages(roomCode, limit)
      res.status(200).json({ messages })
    } catch (err) {
      next(err)
    }
  }

  // ── NEW INTERNAL ENDPOINTS (For Microservices) ──

  internalGetRoom = async (req, res, next) => {
    try {
      const { roomId } = req.params;
      // Hum roomId se dhundhenge, roomCode se nahi
      const room = await this.service.getRoomById(roomId);
      res.status(200).json({ room });
    } catch (err) {
      next(err);
    }
  };

  internalEmit = async (req, res, next) => {
    try {
      const { roomId, event, payload } = req.body;
      
      if (!req.io) {
        throw new Error('Socket.IO not initialized');
      }
      
      // req.io app.js se aayega (jo humne middleware mein attach kiya tha)
      req.io.to(roomId).emit(event, payload);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  };
}