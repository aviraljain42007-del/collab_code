import axios from 'axios'
import { CodeExecutor } from './CodeExecutor.js'

export class HttpExecutor extends CodeExecutor {
  async execute(code, language) {
    try {
      const runnerUrl = process.env.RUNNER_SERVICE_URL || 'http://runner-service:3004'
      
      const response = await axios.post(`${runnerUrl}/execute`, {
        code,
        language
      }, { timeout: 15000 }) // 15s timeout taaki Render cold start handle ho sake

      return response.data
    } catch (err) {
      return {
        stdout: '',
        stderr: err.message || 'Runner service failed',
        exitCode: 1
      }
    }
  }
}