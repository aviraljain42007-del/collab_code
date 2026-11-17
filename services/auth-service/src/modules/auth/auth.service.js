import argon2 from 'argon2'
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  UserNotFoundError,
} from './auth.errors.js'

export class AuthService {
  constructor(authRepository, tokenService) {
    this.repo = authRepository
    this.tokens = tokenService
  }

  async register({ name, email, password }, meta = {}) {
    const existing = await this.repo.findByEmail(email)
    if (existing) throw new EmailAlreadyExistsError()

    const passwordHash = await argon2.hash(password)
    const user = await this.repo.create({ name, email, passwordHash, role: 'user' })

    const accessToken = this.tokens.signAccessToken(user.id)
    const refreshToken = await this.tokens.issueRefreshToken(user.id, meta)

    return { user, accessToken, refreshToken }
  }

  async login({ email, password }, meta = {}) {
    const user = await this.repo.findByEmailWithPassword(email)

    if (!user) {
      // Timing-safe: uniform time on user-not-found vs wrong-password
      await argon2.hash(password)
      throw new InvalidCredentialsError()
    }

    const valid = await argon2.verify(user.passwordHash, password)
    if (!valid) throw new InvalidCredentialsError()

    await this.repo.updateLastLogin(user.id)

    const accessToken = this.tokens.signAccessToken(user.id)
    const refreshToken = await this.tokens.issueRefreshToken(user.id, meta)

    return { user, accessToken, refreshToken }
  }

  async refresh(oldRefreshToken, meta = {}) {
    const { userId, refreshToken } = await this.tokens.rotateRefreshToken(
      oldRefreshToken,
      meta
    )
    const user = await this.repo.findById(userId)
    if (!user) throw new UserNotFoundError()

    const accessToken = this.tokens.signAccessToken(user.id)
    return { user, accessToken, refreshToken }
  }

  async logout(refreshToken) {
    await this.tokens.revokeRefreshToken(refreshToken)
  }

  async getProfile(userId) {
    const user = await this.repo.findById(userId)
    if (!user) throw new UserNotFoundError()
    return user
  }

  async updateProfile(userId, { name }) {
    const user = await this.repo.updateName(userId, name)
    if (!user) throw new UserNotFoundError()
    return user
  }
}