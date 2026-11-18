import { DockerExecutor } from './DockerExecutor.js'

export class ExecutorFactory {
  static getExecutor(language) {
    // Ab asli Docker executor use karenge
    return new DockerExecutor()
  }
}