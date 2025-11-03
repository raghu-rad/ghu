import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ShellSandboxOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  shellPath?: string | boolean;
}

export interface ShellSandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export class ShellSandboxError extends Error {
  constructor(message: string, public readonly result?: ShellSandboxResult) {
    super(message);
    this.name = 'ShellSandboxError';
  }
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;
const UNIX_FALLBACK_PATH = '/usr/bin:/bin:/usr/local/bin';

export async function runSandboxedCommand(
  command: string,
  options: ShellSandboxOptions = {},
): Promise<ShellSandboxResult> {
  const homeDirectory = await createTemporaryHomeDirectory();
  const sandboxEnv = createSandboxEnvironment(homeDirectory, options.env);

  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const shell =
    options.shellPath ??
    (process.platform === 'win32' ? true : process.env.SHELL ?? '/bin/bash');

  try {
    return await new Promise<ShellSandboxResult>((resolve, reject) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutSize = 0;
      let stderrSize = 0;
      let completed = false;

      const child = spawn(command, {
        cwd,
        env: sandboxEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell,
        windowsHide: true,
        detached: false,
      });

      const finish = (result: ShellSandboxResult): void => {
        if (completed) {
          return;
        }
        completed = true;
        resolve(result);
      };

      const abort = (message: string, result?: ShellSandboxResult): void => {
        if (completed) {
          return;
        }
        completed = true;
        if (!child.killed) {
          child.kill();
        }
        reject(new ShellSandboxError(message, result));
      };

      const timeoutHandle = setTimeout(() => {
        abort(`Command timed out after ${timeoutMs}ms`);
      }, timeoutMs);

      child.once('error', (error) => {
        clearTimeout(timeoutHandle);
        abort(error.message);
      });

      const onData =
        (
          chunks: Buffer[],
          getSize: () => number,
          setSize: (value: number) => void,
          stream: 'stdout' | 'stderr',
        ) =>
        (chunk: Buffer) => {
          const currentSize = getSize();
          const nextSize = currentSize + chunk.length;
          if (nextSize > maxBuffer) {
            clearTimeout(timeoutHandle);
            const partialResult: ShellSandboxResult = {
              stdout: Buffer.concat(stdoutChunks).toString('utf8'),
              stderr: Buffer.concat(stderrChunks).toString('utf8'),
              exitCode: null,
              signal: null,
            };
            abort(`Sandbox ${stream} exceeded ${maxBuffer} bytes`, partialResult);
            return;
          }

          chunks.push(chunk);
          setSize(nextSize);
        };

      child.stdout?.on(
        'data',
        onData(
          stdoutChunks,
          () => stdoutSize,
          (value) => {
            stdoutSize = value;
          },
          'stdout',
        ),
      );

      child.stderr?.on(
        'data',
        onData(
          stderrChunks,
          () => stderrSize,
          (value) => {
            stderrSize = value;
          },
          'stderr',
        ),
      );

      child.once('close', (code, signal) => {
        clearTimeout(timeoutHandle);
        finish({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          exitCode: code,
          signal,
        });
      });
    });
  } finally {
    await cleanupTemporaryDirectory(homeDirectory);
  }
}

async function createTemporaryHomeDirectory(): Promise<string> {
  const base = path.join(os.tmpdir(), 'ghu-shell-home-');
  const suffix = randomBytes(6).toString('hex');
  const directoryPath = `${base}${suffix}`;
  await fs.mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

async function cleanupTemporaryDirectory(directoryPath: string): Promise<void> {
  try {
    await fs.rm(directoryPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors to avoid masking sandbox results.
  }
}

function createSandboxEnvironment(
  homeDirectory: string,
  overrides: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.platform === 'win32' ? process.env.PATH ?? '' : UNIX_FALLBACK_PATH,
    HOME: homeDirectory,
    USER: 'sandbox',
    LOGNAME: 'sandbox',
    LANG: process.env.LANG ?? 'C.UTF-8',
    TERM: process.env.TERM ?? 'xterm-256color',
  };

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }
  }

  return env;
}
