import dotenv from 'dotenv'
dotenv.config()

const required = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`)
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongo: {
    uri: process.env.MONGO_URI,
    dbNames: {
      auth: process.env.AUTH_DB_NAME || 'auth_db',
      room: process.env.ROOM_DB_NAME || 'room_db',
      execution: process.env.EXECUTION_DB_NAME || 'execution_db',
    },
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS || '7', 10),
  },
  cookie: {
    refreshName: 'refreshToken',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
}