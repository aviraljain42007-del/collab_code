import axios from "axios";
import { publishExecutionJob } from "../../shared/kafka.js";
import { AppError } from "../../shared/errors/AppError.js";
import { checkExecutionRateLimit } from "../../shared/rate-limiter.js"; // <-- YEH IMPORT MISSING THA

export class ExecutionService {
  constructor(executionRepository) {
    this.execRepo = executionRepository;
    this.roomServiceUrl =
      process.env.ROOM_SERVICE_URL || "http://localhost:3002";
  }

  // Sirf EK HI submitJob hoga ab
  async submitJob(userId, { roomId, language, code, clientRequestId }) {
    // 1. Rate Limit Check (Sabse pehle)
    await checkExecutionRateLimit(userId);

    // 2. Validate room (Cross-service communication via Axios)
    try {
      await axios.get(
        `${this.roomServiceUrl}/api/v1/rooms/internal/${roomId}`,
        {
          headers: {
            "x-internal-secret": process.env.INTERNAL_SECRET || "dev-secret",
          },
        },
      );
    } catch (err) {
      if (err.response && err.response.status === 404) {
        throw new AppError("Room not found", {
          code: "NOT_FOUND",
          status: 404,
        });
      }
      throw new AppError("Room service unavailable", {
        code: "SERVICE_UNAVAILABLE",
        status: 503,
      });
    }

    // 3. Create Job in DB
    const job = await this.execRepo.createJob({
      roomId,
      userId,
      clientRequestId,
      language,
      code,
    });

    // 4. Publish to Kafka
    if (job.status === "queued") {
      await publishExecutionJob(job);
    }
    return job;
  }

  async getJobStatus(jobId, userId) {
    const job = await this.execRepo.findById(jobId);
    if (!job) {
      throw new AppError("Job not found", { code: "NOT_FOUND", status: 404 });
    }
    if (job.userId !== userId) {
      throw new AppError("Unauthorized access to job", {
        code: "FORBIDDEN",
        status: 403,
      });
    }
    return job;
  }
}
