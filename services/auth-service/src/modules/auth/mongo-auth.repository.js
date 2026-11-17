import mongoose from "mongoose";
import { User } from "./user.model.js";
import { EmailAlreadyExistsError } from "./auth.errors.js";

const toPlain = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: obj._id.toString(),
    name: obj.name,
    email: obj.email,
    passwordHash: obj.passwordHash,
    role: obj.role,
    lastLoginAt: obj.lastLoginAt ?? null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

export class MongoAuthRepository {
  async findByEmail(email) {
    const doc = await User().findOne({ email: email.toLowerCase() }).lean();
    return toPlain(doc);
  }

  async findByEmailWithPassword(email) {
    const doc = await User()
      .findOne({ email: email.toLowerCase() })
      .select("+passwordHash")
      .lean();
    return toPlain(doc);
  }

  async create({ name, email, passwordHash, role = "user" }) {
    try {
      const doc = await User().create({
        name,
        email: email.toLowerCase(),
        passwordHash,
        role,
      });
      return toPlain(doc);
    } catch (err) {
      if (err.code === 11000) throw new EmailAlreadyExistsError();
      throw err;
    }
  }

  async findById(id) {
    // 1. Validate ObjectId format — invalid id crash nahi karega
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    // 2. Extra check: isValid() 12-char strings ko bhi true bolta hai (quirk)
    if (String(new mongoose.Types.ObjectId(id)) !== id) return null;

    const doc = await User().findById(id).lean();
    return toPlain(doc);
  }
  async updateLastLogin(userId) {
    await User().updateOne(
      { _id: userId },
      { $set: { lastLoginAt: new Date() } },
    );
  }

  async updateName(userId, name) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null
  if (String(new mongoose.Types.ObjectId(userId)) !== userId) return null

  const doc = await User()
    .findByIdAndUpdate(userId, { $set: { name } }, { returnDocument: 'after' })
    .lean()
  return toPlain(doc)
}
}


