import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import { logger } from './logger.js'
import { registerRoomHandlers } from '../modules/room/room.ws-handler.js'

// initSocket ab async ho gaya hai kyunki Redis connect karna hai
export async function initSocket(httpServer, dependencies) {
  const { config } = dependencies

  const io = new Server(httpServer, {
    cors: {
      origin: 'http://localhost:5173',
      credentials: true,
    },
  })

  // ── 1. Redis Adapter Setup ──
  const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
  const subClient = pubClient.duplicate()

  pubClient.on('error', (err) => logger.error({ err }, 'Redis PubClient Error'))
  subClient.on('error', (err) => logger.error({ err }, 'Redis SubClient Error'))

  await Promise.all([pubClient.connect(), subClient.connect()])
  
  // Socket.IO ko batao ki events Redis ke through bhejne hain
  io.adapter(createAdapter(pubClient, subClient))
  logger.info('Socket.IO Redis Adapter active')

  // ── 2. Authentication Middleware ──
  // (Tera existing auth middleware code yahan aayega, bina changes ke)
  io.use((socket, next) => {
    // ... existing JWT verify logic ...
  })

  // ── 3. Connection Handler ──
  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.userId }, 'socket connected')
    registerRoomHandlers(io, socket, dependencies)
  })

  return io
}