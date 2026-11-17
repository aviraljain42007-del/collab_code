import mongoose from 'mongoose'
import { config } from '../config/index.js'
import { logger } from '../logger.js'

const connections = {}

export async function connectMongo(name, uri, dbName) {
  if (!uri) throw new Error(`Mongo URI for "${name}" is not configured`)
  if (!dbName) throw new Error(`Mongo dbName for "${name}" is not configured`)

  const conn = mongoose.createConnection(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000,
  })

  await new Promise((resolve, reject) => {
    conn.once('connected', resolve)
    conn.once('error', reject)
  })

  connections[name] = conn
  logger.info({ name, dbName }, 'mongo connected')
  return conn
}

export function getConnection(name) {
  const conn = connections[name]
  if (!conn) throw new Error(`Mongo connection "${name}" not initialized`)
  return conn
}

export async function connectAll() {
  await connectMongo('execution', config.mongo.uri, config.mongo.dbNames.execution)
}

export async function disconnectAll() {
  await Promise.all(Object.values(connections).map((c) => c.close()))
  logger.info('all mongo connections closed')
}