import { randomUUID } from 'node:crypto'
import { logger } from '../logger.js'

export function requestId(req, res, next) {
  const incoming = req.headers['x-request-id']
  req.id = incoming || randomUUID()
  res.setHeader('X-Request-Id', req.id)
  req.log = logger.child({ requestId: req.id })
  next()
}