import { toUserDto } from './auth.dto.js'
import { config } from '../../shared/config/index.js'

const setRefreshCookie = (res, token) => {
  res.cookie(config.cookie.refreshName, token, {
    httpOnly: config.cookie.httpOnly,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    maxAge: config.cookie.maxAgeMs,
    path: '/api/v1/auth',  // only sent to /auth/* endpoints
  })
}

export class AuthController {
  constructor(authService) {
    this.service = authService
  }

  register = async (req, res, next) => {
    try {
      const meta = {
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
      }
      const { user, accessToken, refreshToken } = await this.service.register(
        req.body,
        meta
      )
      setRefreshCookie(res, refreshToken)
      res.status(201).json({
        user: toUserDto(user),
        accessToken,
      })
    } catch (err) {
      next(err)
    }
  }

  login = async (req, res, next) => {
    try {
      const meta = {
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
      }
      const { user, accessToken, refreshToken } = await this.service.login(
        req.body,
        meta
      )
      setRefreshCookie(res, refreshToken)
      res.status(200).json({
        user: toUserDto(user),
        accessToken,
      })
    } catch (err) {
      next(err)
    }
  }

  refresh = async (req, res, next) => {
    try {
      const token = req.cookies?.[config.cookie.refreshName]
      const meta = {
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
      }
      const { user, accessToken, refreshToken } = await this.service.refresh(
        token,
        meta
      )
      setRefreshCookie(res, refreshToken)
      res.status(200).json({
        user: toUserDto(user),
        accessToken,
      })
    } catch (err) {
      next(err)
    }
  }

  logout = async (req, res, next) => {
    try {
      const token = req.cookies?.[config.cookie.refreshName]
      await this.service.logout(token)
      res.clearCookie(config.cookie.refreshName, { path: '/api/v1/auth' })
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  }

  getMe = async (req, res, next) => {
    try {
      const user = await this.service.getProfile(req.userId)
      res.status(200).json({ user: toUserDto(user) })
    } catch (err) {
      next(err)
    }
  }

  updateMe = async (req, res, next) => {
    try {
      const user = await this.service.updateProfile(req.userId, req.body)
      res.status(200).json({ user: toUserDto(user) })
    } catch (err) {
      next(err)
    }
  }
}