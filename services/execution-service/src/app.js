import express from 'express'
import cors from 'cors'
import pinoHttp from 'pino-http'
import { config } from './shared/config/index.js'
import { logger } from './shared/logger.js'
import { connectAll } from './shared/db/mongo.js'
import { requestId } from './shared/middleware/requestId.js'
import { errorHandler } from './shared/middleware/error.middleware.js'

import { MongoExecutionRepository } from './modules/execution/mongo-execution.repository.js'
import { ExecutionService } from './modules/execution/execution.service.js'
import { ExecutionController } from './modules/execution/execution.controller.js'
import { executionRouter } from './modules/execution/execution.routes.js'
import { startExecutionWorker } from './modules/execution/execution.worker.js'
import { connectRedis } from './shared/redis.js'

async function bootstrap() {
  await connectAll()
  await connectRedis()

  const executionRepository = new MongoExecutionRepository()
  const executionService = new ExecutionService(executionRepository) // roomRepo nahi chahiye ab
  const executionController = new ExecutionController(executionService)

  const app = express()
  app.use(requestId)
  app.use(pinoHttp({ logger }))
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
  app.use(express.json())

  app.get('/health', (_req, res) => res.json({ status: 'execution-service-ok' }))

  // executionRouter mein bhi tokenService nahi jayega
  app.use('/api/v1/executions', executionRouter({ executionController }))

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))
  app.use(errorHandler)

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Execution Service listening')
  })

  // Worker start karo (ab isme io pass nahi hoga, kyunki results HTTP se Room Service jayenge)
  startExecutionWorker()

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down execution-service')
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