import { HttpExecutor } from './HttpExecutor.js'

export class ExecutorFactory {
  static getExecutor(language) {
    // Ab hum HttpExecutor use karenge jo runner-service ko call karega
    return new HttpExecutor()
  }
}