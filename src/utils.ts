import { execSync, exec, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Run a command synchronously and return the result.
 */
export function runCommand(command: string, cwd?: string, timeoutMs: number = 30000): CommandResult {
  try {
    const stdout = execSync(command, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      shell: 'powershell.exe',
      windowsHide: true,
    });
    return { success: true, stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      success: false,
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || err.message || '').toString().trim(),
      exitCode: err.status ?? 1,
    };
  }
}

/**
 * Track running Go service processes.
 */
const runningProcesses: Map<string, { process: ChildProcess; name: string; logBuffer: string[] }> = new Map();

export function startProcess(name: string, command: string, cwd: string, env?: Record<string, string>): string {
  const id = `${name}-${Date.now()}`;
  const mergedEnv = { ...process.env, ...env };

  const child = exec(command, {
    cwd,
    env: mergedEnv,
    shell: 'powershell.exe',
    windowsHide: true,
  });

  const logBuffer: string[] = [];

  child.stdout?.on('data', (data: string) => {
    const lines = data.toString().split('\n');
    logBuffer.push(...lines);
    // Keep only last 500 lines
    if (logBuffer.length > 500) {
      logBuffer.splice(0, logBuffer.length - 500);
    }
  });

  child.stderr?.on('data', (data: string) => {
    const lines = data.toString().split('\n');
    logBuffer.push(...lines.map(l => `[STDERR] ${l}`));
    if (logBuffer.length > 500) {
      logBuffer.splice(0, logBuffer.length - 500);
    }
  });

  child.on('exit', (code) => {
    logBuffer.push(`\n--- Process exited with code ${code} ---`);
  });

  runningProcesses.set(id, { process: child, name, logBuffer });
  return id;
}

export function stopProcess(id: string): boolean {
  const entry = runningProcesses.get(id);
  if (!entry) return false;

  try {
    // On Windows, we need to kill the process tree
    if (entry.process.pid) {
      execSync(`taskkill /PID ${entry.process.pid} /T /F`, {
        shell: 'powershell.exe',
        windowsHide: true,
      });
    }
  } catch {
    entry.process.kill('SIGKILL');
  }
  runningProcesses.delete(id);
  return true;
}

export function getProcessLogs(id: string, lines: number = 50): string[] | null {
  const entry = runningProcesses.get(id);
  if (!entry) return null;
  return entry.logBuffer.slice(-lines);
}

export function listProcesses(): Array<{ id: string; name: string; running: boolean }> {
  const result: Array<{ id: string; name: string; running: boolean }> = [];
  for (const [id, entry] of runningProcesses) {
    result.push({
      id,
      name: entry.name,
      running: entry.process.exitCode === null,
    });
  }
  return result;
}

export function stopAllProcesses(): number {
  let count = 0;
  for (const id of runningProcesses.keys()) {
    if (stopProcess(id)) count++;
  }
  return count;
}

/**
 * Check if a file/directory exists.
 */
export function pathExists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the docker-compose file path bundled with this MCP server.
 */
export function getDockerComposeFilePath(): string {
  return path.resolve(__dirname, '..', 'docker-compose.kafka.yml');
}
