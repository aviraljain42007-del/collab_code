import { FakeExecutor } from './FakeExecutor.js'

export class ExecutorFactory {
  static getExecutor(language) {
    // Phase 11 mein yahan language-wise Docker executors aayenge
    // switch(language) {
    //   case 'javascript': return new JsDockerExecutor()
    //   ...
    // }
    
    return new FakeExecutor()
  }
}