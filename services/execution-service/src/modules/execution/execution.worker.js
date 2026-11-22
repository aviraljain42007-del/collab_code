import { Kafka } from 'kafkajs'
import { MongoExecutionRepository } from './mongo-execution.repository.js'
import { ExecutorFactory } from './executor/ExecutorFactory.js'
import { logger } from '../../shared/logger.js'
import axios from 'axios'
import fs from 'node:fs'
import path from 'node:path'

const repo = new MongoExecutionRepository()

const caPath = path.resolve(process.env.KAFKA_CA_CERT || './certs/ca.pem')

const kafka = new Kafka({
  clientId: 'execution-service',
  brokers: [process.env.KAFKA_BROKER],
  ssl: {
    rejectUnauthorized: true,
    // File ko read karke buffer mein bhejo
    ca: [fs.readFileSync(caPath, 'utf-8')],
  },
  sasl: {
    mechanism: 'scram-sha-256',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  },
})

const consumer = kafka.consumer({ groupId: 'execution-group' })

export async function startExecutionWorker() {
  await consumer.connect()
  await consumer.subscribe({ topic: 'execution.requested', fromBeginning: true })
  
  logger.info('Execution Worker (Kafka Consumer) started')

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const job = JSON.parse(message.value.toString())
      logger.info({ jobId: job.id }, 'Worker picked up job from Kafka')

      try {
        await repo.updateStatus(job.id, 'running')

        const executor = ExecutorFactory.getExecutor(job.language)
        const result = await executor.execute(job.code, job.language)

        const finalStatus = result.exitCode === 0 ? 'completed' : 'failed'
        await repo.updateStatus(job.id, finalStatus, result)

        const payload = {
          jobId: job.id,
          roomId: job.roomId,
          status: finalStatus,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        }
        
        // Notify Room Service
        await axios.post(`${process.env.ROOM_SERVICE_URL}/api/v1/rooms/internal/emit`, {
          roomId: job.roomId,
          event: 'execution:completed',
          payload
        })

        logger.info({ jobId: job.id, status: finalStatus }, 'Job executed successfully')

      } catch (err) {
        logger.error({ err, jobId: job.id }, 'Worker failed to execute job')
        await repo.updateStatus(job.id, 'failed', { stderr: 'Internal worker error', exitCode: 1 })
      }
    },
  })
}