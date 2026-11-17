/**
 * CodeExecutor interface
 * All executors (Fake, Docker) must implement this.
 */
export class CodeExecutor {
  /**
   * @param {string} code - The code to execute
   * @param {string} language - javascript | python | cpp
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
   */
  async execute(code, language) {
    throw new Error('Method execute() must be implemented')
  }
}