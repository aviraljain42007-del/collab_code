import mongoose from 'mongoose'
import { getConnection } from '../../shared/db/mongo.js'

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: null },
    ipAddress: { type: String, default: null },
  },
  { timestamps: true }
)

// TTL index — Mongo automatically deletes expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export function RefreshToken() {
  return getConnection('auth').model('RefreshToken', refreshTokenSchema)
}