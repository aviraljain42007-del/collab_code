import { z } from 'zod'

// ── Request schemas ──
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(3).max(100),
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(100),
})

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(50),
})

// ── Response mappers ──
export const toUserDto = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
})