import { CodeExecutor } from './CodeExecutor.js'

export class FakeExecutor extends CodeExecutor {
  async execute(code, language) {
    // Simulate network/compile delay (2 seconds)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Fake logic
    if (code.includes('error')) {
      return {
        stdout: '',
        stderr: `SyntaxError: Fake error triggered in ${language}`,
        exitCode: 1,
      }
    }

    return {
      stdout: `[${language.toUpperCase()}] Output for code of length ${code.length}\nHello, World!`,
      stderr: '',
      exitCode: 0,
    }
  }
}