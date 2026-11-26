export class RoomStateManager {
  constructor() {
    // Map<roomId, RoomState>
    // RoomState = {
    //   roomId, roomCode, hostId, language, version,
    //   code: string, dirty: boolean, lastSnapshotAt: number,
    //   participants: Map<userId, { socketIds: Set<string>, status: string }>
    // }
    this.rooms = new Map()
  }

  /**
   * Q2: Lazy hydration. Agar memory mein nahi hai, snapshot se banao.
   */
  getOrHydrate(room, latestSnapshot) {
    const roomId = room.id
    if (this.rooms.has(roomId)) return this.rooms.get(roomId)

    const state = {
      roomId,
      roomCode: room.roomCode,
      hostId: room.hostId,
      language: room.language,
      version: latestSnapshot ? latestSnapshot.version : 1,
      code: latestSnapshot ? latestSnapshot.code : '',
      dirty: false,
      lastSnapshotAt: Date.now(),
      participants: new Map(), // Will be populated via addSocket
    }
    this.rooms.set(roomId, state)
    return state
  }

  get(roomId) {
    return this.rooms.get(roomId) || null
  }

  /**
   * Q1: Code update with version check
   * Returns { success: boolean, currentVersion: number, code: string }
   */
  applyCodeUpdate(roomId, expectedVersion, newCode) {
    const state = this.rooms.get(roomId)
    if (!state) throw new Error('Room not in memory')

    // Version mismatch: reject (client must refetch)
    if (state.version !== expectedVersion) {
      return { success: false, currentVersion: state.version, code: state.code }
    }

    state.code = newCode
    state.version++
    state.dirty = true
    return { success: true, currentVersion: state.version, code: state.code }
  }

    updateLanguage(roomId, language) {
    const state = this.rooms.get(roomId)
    if (state) {
      state.language = language
      state.version += 1 // Version badhao taaki clients ko pata chale
      state.dirty = true
      return state.version
    }
    return null
  }

  /**
   * Q5: Ephemeral socket tracking (Multiple tabs)
   */
  addSocket(roomId, userId, socketId, name) {
    const state = this.rooms.get(roomId)
    if (!state) return

    if (!state.participants.has(userId)) {
      state.participants.set(userId, { socketIds: new Set(), status: 'online', name })
    }
    const p = state.participants.get(userId)
    p.socketIds.add(socketId)
    p.status = 'online'
    if (name) p.name = name
  }

  removeSocket(roomId, userId, socketId) {
    const state = this.rooms.get(roomId)
    if (!state || !state.participants.has(userId)) return { fullyOffline: false }

    const p = state.participants.get(userId)
    p.socketIds.delete(socketId)

    if (p.socketIds.size === 0) {
      p.status = 'offline'
      return { fullyOffline: true }
    }
    return { fullyOffline: false }
  }

  getPresence(roomId) {
    const state = this.rooms.get(roomId)
    if (!state) return []
    return Array.from(state.participants.entries()).map(([userId, p]) => ({
      userId,
      name: p.name,
      status: p.status,
    }))
  }

  /**
   * Sweeper calls this after a successful snapshot write
   */
  markSnapshotTaken(roomId) {
    const state = this.rooms.get(roomId)
    if (state) {
      state.dirty = false
      state.lastSnapshotAt = Date.now()
    }
  }

  /**
   * Sweeper iterates dirty rooms
   */
  getDirtyRooms() {
    return Array.from(this.rooms.values()).filter((r) => r.dirty)
  }

  /**
   * Q6: Expiry + cleanup
   */
  evict(roomId) {
    this.rooms.delete(roomId)
  }
}

export const roomStateManager = new RoomStateManager()