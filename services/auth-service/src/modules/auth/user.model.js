import mongoose from 'mongoose'
import { getConnection } from '../../shared/db/mongo.js'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export function User() {
  return getConnection('auth').model('User', userSchema)
}