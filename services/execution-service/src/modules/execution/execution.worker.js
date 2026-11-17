import { executionQueue } from './execution.queue.js'
import { MongoExecutionRepository } from './mongo-execution.repository.js'
import { ExecutorFactory } from './executor/ExecutorFactory.js'
import { logger } from '../../shared/logger.js'

const repo = new MongoExecutionRepository()

// io instance pass karna padega taaki worker result broadcast kar sake
export function startExecutionWorker(io) {
  logger.info('Execution Worker started')
  
  // Continuous processing loop
  setInterval(async () => {
    if (executionQueue.size() === 0) return
    
    const jobId = executionQueue.dequeue()
    if (!jobId) return

    try {
      // 1. Get job details from DB
      const job = await repo.findById(jobId)
      if (!job || job.status !== 'queued') return

      // 2. Mark as running
      await repo.updateStatus(jobId, 'running')

      // 3. Execute
      const executor = ExecutorFactory.getExecutor(job.language)
      const result = await executor.execute(job.code, job.language)

      // 4. Update DB with result
      const finalStatus = result.exitCode === 0 ? 'completed' : 'failed'
      await repo.updateStatus(jobId, finalStatus, result)

      // 5. Notify WebSocket clients in the room
      const payload = {
        jobId: job.id,
        roomId: job.roomId,
        status: finalStatus,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      }
      
      // 'execution:completed' event bhejte hain room ke sabko
      if (io) io.to(job.roomId).emit('execution:completed', payload)
      
      logger.info({ jobId, status: finalStatus }, 'job executed')

    } catch (err) {
      logger.error({ err, jobId }, 'worker failed to execute job')
      await repo.updateStatus(jobId, 'failed', { stderr: 'Internal worker error', exitCode: 1 })
    }
  }, 500) // Har 500ms mein queue check karega
}