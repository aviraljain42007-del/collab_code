import express from 'express'
import cors from 'cors'
import { executeCode } from './runner.controller.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/health', (req, res) => res.json({ status: 'runner-ok' }))
app.post('/execute', executeCode)

const PORT = process.env.PORT || 3004
app.listen(PORT, () => console.log(`Runner Service listening on port ${PORT}`))