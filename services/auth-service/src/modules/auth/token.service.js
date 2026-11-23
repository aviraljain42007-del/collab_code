import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../../shared/config/index.js'
import { InvalidRefreshTokenError } from './auth.errors.js'

const hashToken = (raw) =>
  crypto.createHash('sha256').update(raw).digest('hex')

export class TokenService {
  constructor(authRepository) {
    this.repo = authRepository
  }

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
    
    // Postgres Repo ka method
    await this.repo.createRefreshToken({
      userId,
      tokenHash: hashToken(raw),
      expiresAt
    })
    
    return raw
  }

  async rotateRefreshToken(oldRaw, meta = {}) {
    const tokenHash = hashToken(oldRaw)
    
    // Postgres Repo ka method (Atomic Delete)
    const stored = await this.repo.findAndDeleteRefreshToken(tokenHash)
    
    if (!stored) throw new InvalidRefreshTokenError()
    
    // DHYAAN DE: Postgres mein column names snake_case hote hain (expires_at)
    if (new Date(stored.expires_at) < new Date()) {
      throw new InvalidRefreshTokenError()
    }

    // Postgres se user_id aayega, userId nahi
    const userId = stored.user_id 
    const refreshToken = await this.issueRefreshToken(userId, meta)
    
    return { userId, refreshToken }
  }

  async revokeRefreshToken(raw) {
    if (!raw) return
    // Postgres Repo ka method
    await this.repo.deleteRefreshToken(hashToken(raw))
  }
}