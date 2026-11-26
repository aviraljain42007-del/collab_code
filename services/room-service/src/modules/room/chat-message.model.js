import mongoose from 'mongoose'
import { getConnection } from '../../shared/db/mongo.js'

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    senderId: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // Chat is immutable
)

// Compound index for fast pagination (latest messages first)
chatMessageSchema.index({ roomId: 1, createdAt: -1 })

export function ChatMessage() {
  return getConnection('room').model('ChatMessage', chatMessageSchema)
}