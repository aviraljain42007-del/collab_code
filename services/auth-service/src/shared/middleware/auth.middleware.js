import { UnauthorizedError } from '../errors/AppError.js'

export function requireAuth(tokenService) {
  return (req, res, next) => {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Missing access token'))
    }

    const token = header.slice(7)
    const payload = tokenService.verifyAccessToken(token)

    if (!payload || !payload.userId) {
      return next(new UnauthorizedError('Invalid or expired access token'))
    }

    req.userId = payload.userId
    next()
  }
}