import { exec, type ExecException } from 'node:child_process';
import { promisify } from 'node:util';

import type { Tool, ToolDisplayPreview, ToolExecutionResult, ToolInput } from './index.js';

const execAsync = promisify(exec);

export interface ShellToolOptions {
  timeoutMs?: number;
  cwd?: string;
}

const PREVIEW_HEAD_LINES = 2;
const PREVIEW_TAIL_LINES = 1;
const PREVIEW_MAX_LINE_LENGTH = 120;

function createOutputPreview(output: string | undefined): ToolDisplayPreview | undefined {
  if (typeof output !== 'string') {
    return undefined;
  }

  const normalized = output.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map((line) => line.replace(/\r$/u, ''));

  const meaningfulLines = lines.filter((line) => line.trim().length > 0);

  if (meaningfulLines.length === 0) {
    return undefined;
  }

  const trimLine = (line: string): string => {
    const trimmedLine = line.trimEnd();
    if (trimmedLine.length <= PREVIEW_MAX_LINE_LENGTH) {
      return trimmedLine;
    }

    return `${trimmedLine.slice(0, PREVIEW_MAX_LINE_LENGTH - 1)}…`;
  };

  const limit = PREVIEW_HEAD_LINES + PREVIEW_TAIL_LINES;

  if (meaningfulLines.length <= limit) {
    return {
      lines: meaningfulLines.map(trimLine),
      truncated: false,
    };
  }

  const headLines = meaningfulLines.slice(0, PREVIEW_HEAD_LINES).map(trimLine);
  const tailLines = meaningfulLines.slice(-PREVIEW_TAIL_LINES).map(trimLine);

  const previewLines = [
    ...headLines,
    '…',
    ...tailLines,
  ];

  return {
    lines: previewLines,
    truncated: true,
  };
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
      const errorMessage = 'Shell tool requires a non-empty string "command" property.';
      return {
        output: '',
        error: errorMessage,
        display: {
          message: 'Shell command aborted: missing input.',
          tone: 'error',
          details: errorMessage,
          metadata: {
            command: rawCommand,
          },
        },
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
        display: {
          message: '',
          tone: 'info',
          metadata: {
            command: rawCommand,
          },
          preview: createOutputPreview(combined),
        },
      };
    } catch (error) {
      const execError = error as ExecException & { stdout?: string; stderr?: string };
      const stderrOutput = typeof execError?.stderr === 'string' ? execError.stderr : undefined;
      const stdoutOutput = typeof execError?.stdout === 'string' ? execError.stdout : undefined;
      const errorPreviewSource =
        stderrOutput && stderrOutput.trim().length > 0
          ? stderrOutput
          : stdoutOutput && stdoutOutput.trim().length > 0
            ? stdoutOutput
            : error instanceof Error
              ? error.message
              : undefined;

      return {
        output: '',
        error: error instanceof Error ? error.message : 'Unknown shell execution error',
        display: {
          message: '',
          tone: 'error',
          details: error instanceof Error ? error.message : undefined,
          metadata: {
            command: rawCommand,
          },
          preview: createOutputPreview(errorPreviewSource),
        },
      };
    }
  }
}
