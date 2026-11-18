import { createClient } from 'redis'
import { logger } from './logger.js'

let redisClient = null

export async function connectRedis() {
  if (redisClient) return redisClient

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  })

  redisClient.on('error', (err) => logger.error({ err }, 'Redis Client Error'))
  
  await redisClient.connect()
  logger.info('Execution Service connected to Redis')
  
  return redisClient
}

export function getRedisClient() {
  if (!redisClient) throw new Error('Redis not initialized')
  return redisClient
}