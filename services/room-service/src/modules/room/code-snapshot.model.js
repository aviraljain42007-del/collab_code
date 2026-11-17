import mongoose from "mongoose";
import { getConnection } from "../../shared/db/mongo.js";

const codeSnapshotSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    code: { type: String, default: "" },
    language: {
      type: String,
      enum: ["javascript", "python", "cpp"],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Monotonic version per room — no duplicate versions
codeSnapshotSchema.index({ roomId: 1, version: 1 }, { unique: true });

export function CodeSnapshot() {
  return getConnection("room").model("CodeSnapshot", codeSnapshotSchema);
}
