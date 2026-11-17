import { AppError } from '../errors/AppError.js'
import { logger } from '../logger.js'

export function errorHandler(err, req, res, next) {
  // 1. Headers already sent? Delegate to default handler
  if (res.headersSent) return next(err)

  const requestId = req.id || 'unknown'
  const log = req.log || logger

  // 2. Operational error (expected) — safe to expose
  if (err instanceof AppError && err.isOperational) {
    log.warn(
      { err: { code: err.code, message: err.message, status: err.status } },
      'operational error'
    )
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
        requestId,
      },
    })
  }

  // 3. Programmer error (bug) — hide details, log full
  log.error({ err }, 'unhandled error')
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId,
    },
  })
}