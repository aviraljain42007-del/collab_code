import express from 'express'
import cors from 'cors'
import pinoHttp from 'pino-http'
import { config } from './shared/config/index.js'
import { logger } from './shared/logger.js'
import { connectAll } from './shared/db/mongo.js'
import { requestId } from './shared/middleware/requestId.js'
import { errorHandler } from './shared/middleware/error.middleware.js'
import { initSocket } from './shared/socket.js'

import { MongoRoomRepository } from './modules/room/mongo-room.repository.js'
import { RoomService } from './modules/room/room.service.js'
import { RoomController } from './modules/room/room.controller.js'
import { roomRouter } from './modules/room/room.routes.js'
import { startSnapshotSweeper, stopSnapshotSweeper } from './modules/room/snapshot.sweeper.js'

async function bootstrap() {
  await connectAll()

  const roomRepository = new MongoRoomRepository()
  const roomService = new RoomService(roomRepository)
  const roomController = new RoomController(roomService)

  const app = express()
  app.use(requestId)
  app.use(pinoHttp({ logger }))
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
  app.use(express.json())

  app.get('/health', (_req, res) => res.json({ status: 'room-service-ok' }))

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Room Service listening')
  })

  const io = await initSocket(server, { config, roomService })

  // io ko req mein attach karo (internal emit ke liye)
  app.use((req, res, next) => {
    req.io = io
    next()
  })

  // roomRouter ko ab tokenService ki zaroorat nahi hai kyunki humne auth.middleware.js update kar diya hai
  app.use('/api/v1/rooms', roomRouter({ roomController }))

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))
  app.use(errorHandler)

  startSnapshotSweeper()

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down room-service')
    stopSnapshotSweeper()
    io.close()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

bootstrap().catch((err) => {
  logger.error({ err }, 'bootstrap failed')
  process.exit(1)
})