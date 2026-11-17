import express from 'express'
import cors from 'cors'
import { createProxyMiddleware } from 'http-proxy-middleware'
import dotenv from 'dotenv'
import { logger } from './logger.js'

dotenv.config()

const app = express()

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))

const proxyOptions = {
  changeOrigin: true,
  onError: (err, req, res) => {
    logger.error(err)
    res.status(502).json({ error: { code: 'BAD_GATEWAY', message: 'Service unavailable' } })
  }
}

app.use(
  '/api/v1/auth',
  createProxyMiddleware({
    ...proxyOptions,
    target: process.env.AUTH_SERVICE_URL,
    // 👇 YEH HAI FINAL FIX (Function based rewrite)
    pathRewrite: (path) => `/api/v1/auth${path}`,
  })
)

app.use(
  '/api/v1/rooms',
  createProxyMiddleware({
    ...proxyOptions,
    target: process.env.ROOM_SERVICE_URL,
    pathRewrite: (path) => `/api/v1/rooms${path}`,
  })
)

app.use(
  '/api/v1/executions',
  createProxyMiddleware({
    ...proxyOptions,
    target: process.env.EXECUTION_SERVICE_URL,
    pathRewrite: (path) => `/api/v1/executions${path}`,
  })
)

app.get('/health', (req, res) => res.json({ status: 'gateway-ok' }))

app.listen(process.env.PORT, () => {
  logger.info(`API Gateway running on port ${process.env.PORT}`)
})