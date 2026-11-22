import { Kafka } from 'kafkajs'
import { logger } from './logger.js'
import fs from 'node:fs'
import path from 'node:path'

const caPath = path.resolve(process.env.KAFKA_CA_CERT || './certs/ca.pem')

const kafka = new Kafka({
  clientId: 'execution-service',
  brokers: [process.env.KAFKA_BROKER],
  ssl: {
    rejectUnauthorized: true,
    ca: [fs.readFileSync(caPath, 'utf-8')],
  },
  sasl: {
    mechanism: 'scram-sha-256',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  },
})

const producer = kafka.producer()
const admin = kafka.admin()

export async function connectKafka() {
  await producer.connect()
  await admin.connect()
  logger.info('Kafka Producer connected (Aiven)')

  // 👇 YEH NAYA BLOCK: Topic check aur create karne ke liye
  try {
    const topics = await admin.listTopics()
    if (!topics.includes('execution.requested')) {
      await admin.createTopics({
        topics: [
          {
            topic: 'execution.requested',
            numPartitions: 1,
            replicationFactor: 1,
          },
        ],
      })
      logger.info('Topic "execution.requested" created automatically')
    }
  } catch (err) {
    logger.warn('Topic auto-creation skipped (Aiven might restrict this)')
  }
  // 👆 BLOCK END

}

export async function publishExecutionJob(job) {
  await producer.send({
    topic: 'execution.requested',
    messages: [{ key: job.id, value: JSON.stringify(job) }],
  })
  logger.info({ jobId: job.id }, 'Job published to Kafka')
}