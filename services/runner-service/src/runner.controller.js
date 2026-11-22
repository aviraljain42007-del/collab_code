import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export async function executeCode(req, res) {
  const { code, language } = req.body
  if (!code || !language) return res.status(400).json({ error: 'Code and language required' })

  const tempDir = path.join(os.tmpdir(), `run-${crypto.randomUUID()}`)
  await fs.mkdir(tempDir, { recursive: true })

  let fileName, cmd, args

  switch (language) {
    case 'javascript':
      fileName = 'index.js'; cmd = 'node'; args = [fileName]; break
    case 'python':
      fileName = 'index.py'; cmd = 'python3'; args = [fileName]; break
    case 'cpp':
      fileName = 'main.cpp'; cmd = 'sh'; args = ['-c', 'g++ main.cpp -o main && ./main']; break
    case 'java':
      fileName = 'Main.java'; cmd = 'sh'; args = ['-c', 'javac Main.java && java Main']; break
    default:
      return res.status(400).json({ error: 'Language not supported' })
  }

  const filePath = path.join(tempDir, fileName)
  await fs.writeFile(filePath, code)

  const child = spawn(cmd, args, { cwd: tempDir })
  let stdout = ''
  let stderr = ''

  const timeout = setTimeout(() => {
    child.kill('SIGKILL')
    stdout += '\nExecution timed out (10s limit)'
  }, 10000)

  child.stdout.on('data', (data) => { stdout += data.toString() })
  child.stderr.on('data', (data) => { stderr += data.toString() })

  child.on('close', async (exitCode) => {
    clearTimeout(timeout)
    await fs.rm(tempDir, { recursive: true, force: true })
    res.json({
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: exitCode || 0
    })
  })
}