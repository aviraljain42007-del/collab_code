import mongoose from 'mongoose'
import { getConnection } from '../../shared/db/mongo.js'

const executionJobSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    clientRequestId: { type: String, required: true, index: true }, // Deduplication
    language: {
      type: String,
      enum: ['javascript', 'python', 'cpp' , 'java'],
      required: true,
    },
    code: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    stdout: { type: String, default: null },
    stderr: { type: String, default: null },
    exitCode: { type: Number, default: null },
  },
  { timestamps: true }
)

// Compound unique index for deduplication
executionJobSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true })

export function ExecutionJob() {
  return getConnection('execution').model('ExecutionJob', executionJobSchema)
}