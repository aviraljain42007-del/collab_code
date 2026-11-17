import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../../shared/config/index.js'
import { RefreshToken } from './refresh-token.model.js'
import { InvalidRefreshTokenError } from './auth.errors.js'

const hashToken = (raw) =>
  crypto.createHash('sha256').update(raw).digest('hex')

export class TokenService {
  signAccessToken(userId) {
    return jwt.sign({ userId }, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessTtl,
    })
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, config.jwt.accessSecret)
    } catch {
      return null
    }
  }

  async issueRefreshToken(userId, meta = {}) {
    const raw = crypto.randomBytes(48).toString('base64url')
    const expiresAt = new Date(
      Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000
    )
    await RefreshToken().create({
      userId,
      tokenHash: hashToken(raw),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    })
    return raw
  }

  async rotateRefreshToken(oldRaw, meta = {}) {
    const tokenHash = hashToken(oldRaw)
    // findOneAndDelete = atomic. Concurrent refresh attempts: only one wins.
    const stored = await RefreshToken().findOneAndDelete({ tokenHash }).lean()
    if (!stored) throw new InvalidRefreshTokenError()
    if (stored.expiresAt < new Date()) throw new InvalidRefreshTokenError()

    const userId = stored.userId.toString()
    const refreshToken = await this.issueRefreshToken(userId, meta)
    return { userId, refreshToken }
  }

  async revokeRefreshToken(raw) {
    if (!raw) return
    await RefreshToken().deleteOne({ tokenHash: hashToken(raw) })
  }
}