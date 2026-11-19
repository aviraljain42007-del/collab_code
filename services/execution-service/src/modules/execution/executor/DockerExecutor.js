import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { CodeExecutor } from './CodeExecutor.js'

function runDocker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.on('error', (err) => reject(err))
  })
}

export class DockerExecutor extends CodeExecutor {
  async execute(code, language) {
    const tempDir = path.join(os.tmpdir(), `exec-${crypto.randomUUID()}`)
    await fs.mkdir(tempDir, { recursive: true })
    
    const containerName = `exec-${crypto.randomUUID()}`
    let fileName, image, cmdArgs

    switch (language) {
      case 'javascript':
        fileName = 'index.js'; image = 'node:18-alpine'
        cmdArgs = ['node', `/${fileName}`] // Root me run karenge
        break
      case 'python':
        fileName = 'index.py'; image = 'python:3.9-alpine'
        cmdArgs = ['python', `/${fileName}`]
        break
      case 'cpp':
        fileName = 'main.cpp'; image = 'gcc:12'
        cmdArgs = ['sh', '-c', `g++ /${fileName} -o /main && /main`]
        break
      case 'java':
        fileName = 'Main.java'; image = 'eclipse-temurin:17-jdk-alpine'
        cmdArgs = ['sh', '-c', `javac /${fileName} && java -cp / Main`]
        break
      default:
        throw new Error(`Language ${language} not supported`)
    }

    const filePath = path.join(tempDir, fileName)
    await fs.writeFile(filePath, code)

    try {
      // 1. Container Create karo
      const createRes = await runDocker([
        'create', '--name', containerName,
        '--network', 'none', '--memory', '256m', '--cpus', '0.5',
        image, ...cmdArgs
      ])
      if (createRes.code !== 0) throw new Error(`Docker create failed: ${createRes.stderr}`)

      // 2. File ko container ke root (/) mein copy karo
      const cpRes = await runDocker(['cp', filePath, `${containerName}:/${fileName}`])
      if (cpRes.code !== 0) throw new Error(`Docker cp failed: ${cpRes.stderr}`)

      // 3. Container Start karo
      const result = await new Promise((resolve) => {
        const child = spawn('docker', ['start', '-a', containerName])
        let stdout = ''
        let stderr = ''
        
        const timeout = setTimeout(async () => {
          child.kill('SIGKILL')
          resolve({ stdout, stderr: 'Execution timed out (15s limit)', exitCode: 124 })
        }, 15000)

        child.stdout.on('data', (d) => { stdout += d.toString() })
        child.stderr.on('data', (d) => { stderr += d.toString() })

        child.on('close', (exitCode) => {
          clearTimeout(timeout)
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode })
        })
      })

      return result
    } finally {
      // Cleanup: Chahe success ho ya error, container aur temp folder delete karo
      await runDocker(['rm', '-f', containerName])
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  }
}