import { logger } from '../../shared/logger.js'
import { roomStateManager } from './room-state.manager.js'
import { MongoRoomRepository } from './mongo-room.repository.js'

const repo = new MongoRoomRepository()
const SWEEP_INTERVAL_MS = 10_000
const TIME_THRESHOLD_MS = 30_000
const VERSION_THRESHOLD = 20

let intervalId = null

export function startSnapshotSweeper() {
  if (intervalId) return // already running

  intervalId = setInterval(async () => {
    const dirtyRooms = roomStateManager.getDirtyRooms()
    if (dirtyRooms.length === 0) return

    for (const state of dirtyRooms) {
      const versionDiff = state.version - state.lastSnapshotVersion
      const timeDiff = Date.now() - state.lastSnapshotAt

      // Condition: 20 versions OR 30 seconds since last snapshot
      if (versionDiff >= VERSION_THRESHOLD || timeDiff >= TIME_THRESHOLD_MS) {
        try {
          await repo.createSnapshot({
            roomId: state.roomId,
            version: state.version,
            code: state.code,
            language: state.language,
          })
          
          // Update Room DB's currentVersion
          await repo.updateRoomVersion(state.roomId, state.version)
          
          roomStateManager.markSnapshotTaken(state.roomId)
          
          logger.debug(
            { roomId: state.roomId, version: state.version, versionDiff },
            'snapshot written'
          )
        } catch (err) {
          logger.error({ err, roomId: state.roomId }, 'snapshot failed')
          // Don't mark taken — retry next sweep
        }
      }
    }
  }, SWEEP_INTERVAL_MS)

  logger.info('snapshot sweeper started')
}

export function stopSnapshotSweeper() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info('snapshot sweeper stopped')
  }
}