// execution.controller.js
import { z } from 'zod'

export const submitJobSchema = z.object({
  roomId: z.string().min(1),
  language: z.enum(['javascript', 'python', 'cpp']),
  code: z.string().min(1),
  clientRequestId: z.string().uuid(), // Must be UUID from frontend
})

export class ExecutionController {
  constructor(executionService) {
    this.service = executionService
  }

  submit = async (req, res, next) => {
    try {
      const job = await this.service.submitJob(req.userId, req.body)
      // 202 Accepted: Processing started, result will be pushed via WS
      res.status(202).json({ jobId: job.id, status: job.status })
    } catch (err) {
      next(err)
    }
  }

  getStatus = async (req, res, next) => {
    try {
      const job = await this.service.getJobStatus(req.params.jobId, req.userId)
      res.status(200).json({ job })
    } catch (err) {
      next(err)
    }
  }
}