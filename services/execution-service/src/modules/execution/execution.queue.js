class ExecutionQueue {
  constructor() {
    this.queue = []
    this.isProcessing = false
  }

  enqueue(jobId) {
    this.queue.push(jobId)
  }

  dequeue() {
    return this.queue.shift()
  }

  size() {
    return this.queue.length
  }
}

export const executionQueue = new ExecutionQueue()