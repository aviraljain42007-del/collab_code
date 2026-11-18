import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { CodeExecutor } from './CodeExecutor.js'

export class DockerExecutor extends CodeExecutor {
  async execute(code, language) {
    const tempDir = path.join(os.tmpdir(), `exec-${crypto.randomUUID()}`)
    await fs.mkdir(tempDir, { recursive: true })
    
    let fileName, image, cmdArgs

    switch (language) {
      case 'javascript':
        fileName = 'index.js'
        image = 'node:18-alpine'
        cmdArgs = ['node', '/app/index.js']
        break
      case 'python':
        fileName = 'index.py'
        image = 'python:3.9-alpine'
        cmdArgs = ['python', '/app/index.py']
        break
      case 'cpp':
        fileName = 'main.cpp'
        image = 'gcc:12' // Official Debian based image
        cmdArgs = ['sh', '-c', 'g++ /app/main.cpp -o /app/main && /app/main']
        break
      case 'java':
        fileName = 'Main.java'
        image = 'eclipse-temurin:17-jdk-alpine'
        cmdArgs = ['sh', '-c', 'javac /app/Main.java && java -cp /app Main']
        break
      default:
        throw new Error(`Language ${language} not supported`)
    }

    const filePath = path.join(tempDir, fileName)
    await fs.writeFile(filePath, code)

    const dockerArgs = [
      'run', '--rm',
      '-v', `${tempDir}:/app`, // Node.js isko array ki tarah safely pass karega
      '--network', 'none',
      '--memory', '256m',
      '--cpus', '0.5',
      image,
      ...cmdArgs
    ]

    return new Promise((resolve, reject) => {
      // YAHAN SE `{ shell: true }` HATA DIYA HAI
      const child = spawn('docker', dockerArgs)
      
      let stdout = ''
      let stderr = ''
      
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
        resolve({ stdout, stderr: 'Execution timed out (20s limit)', exitCode: 124 })
      }, 20000)

      child.stdout.on('data', (data) => { stdout += data.toString() })
      child.stderr.on('data', (data) => { stderr += data.toString() })

      child.on('close', async (code) => {
        clearTimeout(timeout)
        await fs.rm(tempDir, { recursive: true, force: true })
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code
        })
      })

      child.on('error', async (err) => {
        clearTimeout(timeout)
        await fs.rm(tempDir, { recursive: true, force: true })
        reject(err)
      })
    })
  }
}