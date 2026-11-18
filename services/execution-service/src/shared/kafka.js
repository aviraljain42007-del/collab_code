import { Kafka } from 'kafkajs'
import { logger } from './logger.js'

const kafka = new Kafka({
  clientId: 'execution-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
})

const producer = kafka.producer()

export async function connectKafka() {
  await producer.connect()
  logger.info('Kafka Producer connected')
}

export async function publishExecutionJob(job) {
  await producer.send({
    topic: 'execution.requested',
    messages: [
      { 
        key: job.id, 
        value: JSON.stringify(job) 
      }
    ],
  })
  logger.info({ jobId: job.id }, 'Job published to Kafka')
}