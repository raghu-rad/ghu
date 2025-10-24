import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { Tool, ToolExecutionResult, ToolInput } from './index.js';

const execAsync = promisify(exec);

export interface ShellToolOptions {
  timeoutMs?: number;
  cwd?: string;
}

export class ShellTool implements Tool {
  readonly name = 'shell';
  readonly description = 'Execute a shell command and return stdout/stderr.';
  readonly parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command string to execute' },
    },
    required: ['command'],
  };

  constructor(private readonly options: ShellToolOptions = {}) {}

  async run(input: ToolInput): Promise<ToolExecutionResult> {
    const rawCommand = input.command;
    if (typeof rawCommand !== 'string' || rawCommand.trim().length === 0) {
      return {
        output: '',
        error: 'Shell tool requires a non-empty string "command" property.',
      };
    }

    try {
      const { stdout, stderr } = await execAsync(rawCommand, {
        cwd: this.options.cwd,
        timeout: this.options.timeoutMs ?? 5000,
        maxBuffer: 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
      return {
        output: combined,
      };
    } catch (error) {
      return {
        output: '',
        error: error instanceof Error ? error.message : 'Unknown shell execution error',
      };
    }
  }
}
