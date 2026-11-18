import { z } from 'zod'

// ── Request schemas ──
export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  language: z.enum(['javascript', 'python', 'cpp' , 'java']).default('javascript'),
})

// ── Response mappers (explicit — no accidental leaks) ──
export const toRoomDto = (room) => ({
  id: room.id,
  roomCode: room.roomCode,
  name: room.name,
  hostId: room.hostId,
  language: room.language,
  currentVersion: room.currentVersion,
  status: room.status,
  createdAt: room.createdAt,
})

export const toParticipantDto = (p) => ({
  userId: p.userId,
  status: p.status,
  joinedAt: p.joinedAt,
})

export const toSnapshotDto = (s) => ({
  version: s.version,
  code: s.code,
  language: s.language,
  createdAt: s.createdAt,
})