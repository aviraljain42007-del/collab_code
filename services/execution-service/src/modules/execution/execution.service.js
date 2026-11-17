// import { executionQueue } from './execution.queue.js'
// import { RoomNotFoundError } from '../room/room.errors.js'

// export class ExecutionService {
//   constructor(executionRepository, roomRepository) {
//     this.execRepo = executionRepository
//     this.roomRepo = roomRepository
//   }

//   async submitJob(userId, { roomId, language, code, clientRequestId }) {
//     // 1. Validate room exists
//     const room = await this.roomRepo.findById(roomId)
//     if (!room) throw new RoomNotFoundError()

//     // 2. Create job in DB (handles idempotency via clientRequestId)
//     const job = await this.execRepo.createJob({
//       roomId, userId, clientRequestId, language, code
//     })

//     // 3. Enqueue if it's newly created (status = 'queued')
//     if (job.status === 'queued') {
//       executionQueue.enqueue(job.id)
//     }

//     return job
//   }

//   async getJobStatus(jobId, userId) {
//     const job = await this.execRepo.findById(jobId)
//     if (!job) throw new Error('Job not found')
//     if (job.userId !== userId) throw new Error('Unauthorized access to job')
//     return job
//   }
// }

import axios from 'axios'
import { executionQueue } from './execution.queue.js'
// RoomNotFoundError ki jagah generic error use karenge ya phir shared folder se import karenge
import { AppError } from '../../shared/errors/AppError.js' 

export class ExecutionService {
  constructor(executionRepository) {
    this.execRepo = executionRepository
    // Room service URL env se aayega
    this.roomServiceUrl = process.env.ROOM_SERVICE_URL || 'http://localhost:3002'
  }

    async getJobStatus(jobId, userId) {
    const job = await this.execRepo.findById(jobId);
    if (!job) {
      throw new AppError('Job not found', { code: 'NOT_FOUND', status: 404 });
    }
    if (job.userId !== userId) {
      throw new AppError('Unauthorized access to job', { code: 'FORBIDDEN', status: 403 });
    }
    return job;
  }

  async submitJob(userId, { roomId, language, code, clientRequestId }) {
    // 1. Internal API call to validate room (Cross-service communication)
    try {
      await axios.get(`${this.roomServiceUrl}/api/v1/rooms/internal/${roomId}`, {
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || 'dev-secret' }
      })
    } catch (err) {
      if (err.response && err.response.status === 404) {
        throw new AppError('Room not found', { code: 'NOT_FOUND', status: 404 })
      }
      throw new AppError('Room service unavailable', { code: 'SERVICE_UNAVAILABLE', status: 503 })
    }

    // 2. Create Job
    const job = await this.execRepo.createJob({
      roomId, userId, clientRequestId, language, code
    })

    // 3. Enqueue
    if (job.status === 'queued') {
      executionQueue.enqueue(job.id)
    }

    return job
  }
  // ... baaki methods same
}