import mongoose from 'mongoose'
import { getConnection } from '../../shared/db/mongo.js'

const participantSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['online', 'offline', 'left'],
      default: 'online',
    },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// One participant row per (roomId, userId) — Q5 decision
participantSchema.index({ roomId: 1, userId: 1 }, { unique: true })

export function Participant() {
  return getConnection('room').model('Participant', participantSchema)
}