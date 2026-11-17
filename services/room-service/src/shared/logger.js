import pino from 'pino'
import { config } from './config/index.js'

export const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  ...(config.nodeEnv !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
  base: {
    service: 'collabcode-backend',
    env: config.nodeEnv,
  },
})