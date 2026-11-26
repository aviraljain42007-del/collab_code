import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import jwt from 'jsonwebtoken'
import { logger } from './logger.js'
import { registerRoomHandlers } from '../modules/room/room.ws-handler.js'

export async function initSocket(httpServer, dependencies) {
  const { config } = dependencies

  const io = new Server(httpServer, {
    cors: {
      origin: 'http://localhost:5173',
      credentials: true,
    },
    transports: ['polling', 'websocket'] 
  })

  // ── 1. Redis Adapter Setup ──
  const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
  const subClient = pubClient.duplicate()

  pubClient.on('error', (err) => logger.error({ err }, 'Redis PubClient Error'))
  subClient.on('error', (err) => logger.error({ err }, 'Redis SubClient Error'))

  await Promise.all([pubClient.connect(), subClient.connect()])
  
  io.adapter(createAdapter(pubClient, subClient))
  logger.info('Socket.IO Redis Adapter active')

  // ── 2. Authentication Middleware ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    const userName = socket.handshake.auth?.name // <-- FRONTEND SE NAME AAYEGA

    if (!token) return next(new Error('UNAUTHORIZED: Missing access token'))

    try {
      const payload = jwt.verify(token, config.jwt.accessSecret)
      if (!payload || typeof payload !== 'object' || !payload.userId) {
        return next(new Error('UNAUTHORIZED: Invalid or expired access token'))
      }

      socket.userId = payload.userId
      socket.userName = userName || 'Anonymous User' // <-- NAME SAVE HO GAYA
      next()
    } catch {
      next(new Error('UNAUTHORIZED: Invalid or expired access token'))
    }
  })

  // ── 3. Connection Handler ──
  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.userId }, 'socket connected')
    registerRoomHandlers(io, socket, dependencies)
  })

  return io
}