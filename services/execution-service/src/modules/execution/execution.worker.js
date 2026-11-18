import { Kafka } from 'kafkajs'
import { MongoExecutionRepository } from './mongo-execution.repository.js'
import { ExecutorFactory } from './executor/ExecutorFactory.js'
import { logger } from '../../shared/logger.js'
import axios from 'axios'

const repo = new MongoExecutionRepository()

const kafka = new Kafka({
  clientId: 'execution-worker',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
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