import mongoose from "mongoose";
import { getConnection } from "../../shared/db/mongo.js";

const roomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      minlength: 6,
      maxlength: 6,
    },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    language: {
      type: String,
      enum: ["javascript", "python", "cpp" , "java"],
      default: "javascript",
    },
    currentVersion: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ["active", "expired"],
      default: "active",
      index: true,
    },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// Lazy expiry lookup: find expired rooms fast
roomSchema.index({ status: 1, lastActivityAt: 1 });

export function Room() {
  return getConnection("room").model("Room", roomSchema);
}
