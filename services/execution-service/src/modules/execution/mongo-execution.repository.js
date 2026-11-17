import mongoose from 'mongoose'
import { ExecutionJob } from './execution-job.model.js'

const toJobDto = (doc) => {
  if (!doc) return null
  return {
    id: doc._id.toString(),
    roomId: doc.roomId.toString(),
    userId: doc.userId.toString(),
    clientRequestId: doc.clientRequestId,
    language: doc.language,
    code: doc.code,
    status: doc.status,
    stdout: doc.stdout,
    stderr: doc.stderr,
    exitCode: doc.exitCode,
    createdAt: doc.createdAt,
    completedAt: doc.updatedAt, // updatedAt as completedAt for now
  }
}

export class MongoExecutionRepository {
  async createJob({ roomId, userId, clientRequestId, language, code }) {
    try {
      const doc = await ExecutionJob().create({
        roomId, userId, clientRequestId, language, code, status: 'queued'
      })
      return toJobDto(doc)
    } catch (err) {
      if (err.code === 11000) {
        // Idempotency: Job already exists for this request
        const existing = await ExecutionJob().findOne({ userId, clientRequestId }).lean()
        return toJobDto(existing)
      }
      throw err
    }
  }

  async findById(jobId) {
    if (!mongoose.Types.ObjectId.isValid(jobId)) return null
    const doc = await ExecutionJob().findById(jobId).lean()
    return toJobDto(doc)
  }

  async updateStatus(jobId, status, result = {}) {
    const update = { status }
    if (status === 'completed' || status === 'failed') {
      update.stdout = result.stdout || null
      update.stderr = result.stderr || null
      update.exitCode = result.exitCode ?? null
    }
    await ExecutionJob().updateOne({ _id: jobId }, { $set: update })
  }
}