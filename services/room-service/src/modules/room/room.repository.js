/**
 * RoomRepository interface
 * Implementations MUST return plain objects (never Mongoose docs).
 */
export class RoomRepository {
  // ── Room ──
  /** @returns {Promise<{id, roomCode, name, hostId, language, currentVersion, status, lastActivityAt, createdAt, updatedAt}>} */
  async create({ name, hostId, language }) { throw new Error('Not implemented') }

  /** @returns {Promise<Room | null>} */
  async findByCode(roomCode) { throw new Error('Not implemented') }

  /** @returns {Promise<Room | null>} */
  async findById(id) { throw new Error('Not implemented') }

  /** @returns {Promise<void>} Updates lastActivityAt */
  async touchRoom(roomId) { throw new Error('Not implemented') }

  /** @returns {Promise<Room | null>} Sets currentVersion */
  async updateRoomVersion(roomId, version) { throw new Error('Not implemented') }

  /** @returns {Promise<Room | null>} Sets language */
  async updateRoomLanguage(roomId, language) { throw new Error('Not implemented') }

  /** @returns {Promise<void>} Sets status=expired, marks participants left */
  async markExpired(roomId) { throw new Error('Not implemented') }

  /** @returns {Promise<Room | null>} Only revives if status was expired */
  async reviveRoom(roomId) { throw new Error('Not implemented') }

  // ── Participant ──
  /** @returns {Promise<Participant>} Upsert on (roomId, userId) */
  async upsertParticipant({ roomId, userId, status }) { throw new Error('Not implemented') }

  /** @returns {Promise<Participant | null>} */
  async findParticipant(roomId, userId) { throw new Error('Not implemented') }

  /** @returns {Promise<Participant[]>} */
  async findParticipants(roomId) { throw new Error('Not implemented') }

  /** @returns {Promise<void>} */
  async updateParticipantStatus(roomId, userId, status) { throw new Error('Not implemented') }

  /** @returns {Promise<number>} Counts participants in ACTIVE rooms only */
  async countUserActiveParticipantships(userId) { throw new Error('Not implemented') }

  // ── Snapshot ──
  /** @returns {Promise<Snapshot>} */
  async createSnapshot({ roomId, version, code, language }) { throw new Error('Not implemented') }

  /** @returns {Promise<Snapshot | null>} Latest by version desc */
  async getLatestSnapshot(roomId) { throw new Error('Not implemented') }
}