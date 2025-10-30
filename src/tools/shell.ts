import type { Tool, ToolDisplayPreview, ToolExecutionResult, ToolInput } from './index.js';
import {
  type ShellCommandAnalysis,
  type ShellToolApprovalProvider,
  type ShellToolApprovalResult,
} from './shell-approvals.js';
import {
  runSandboxedCommand,
  ShellSandboxError,
  type ShellSandboxOptions,
  type ShellSandboxResult,
} from './shell-sandbox.js';
import { analyzeShellCommand } from './shell-risk.js';

export interface ShellToolOptions {
  timeoutMs?: number;
  cwd?: string;
  sandbox?: ShellSandboxOptions;
  approvalProvider?: ShellToolApprovalProvider;
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

    let analysis: ShellCommandAnalysis | undefined;
    try {
      analysis = analyzeShellCommand(rawCommand);
      await this.ensureApproval(analysis, rawCommand);
      const result = await this.executeCommand(rawCommand);
      const combined = formatSandboxResult(result);

      return {
        output: combined,
        display: {
          message: result.exitCode === 0 ? '' : `Command exited with code ${result.exitCode}`,
          tone: 'info',
          metadata: {
            command: rawCommand,
            exitCode: result.exitCode,
            signal: result.signal ?? undefined,
            risk: analysis.risk.level,
            riskReasons: analysis.risk.reasons,
          },
          preview: createOutputPreview(combined),
        },
      };
    } catch (error) {
      if (error instanceof ShellSandboxError) {
        const previewSource = extractSandboxPreview(error.result);
        return {
          output: '',
          error: error.message,
          display: {
            message: '',
            tone: 'error',
            details: error.message,
            metadata: {
              command: rawCommand,
              risk: analysis?.risk.level,
              riskReasons: analysis?.risk.reasons,
            },
            preview: createOutputPreview(previewSource),
          },
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown shell execution error';
      return {
        output: '',
        error: message,
        display: {
          message: '',
          tone: 'error',
          details: message,
          metadata: {
            command: rawCommand,
          },
        },
      };
    }
  }

  private resolveSandboxOptions(): ShellSandboxOptions {
    const baseOptions: ShellSandboxOptions = {
      cwd: this.options.cwd,
      timeoutMs: this.options.timeoutMs ?? this.options.sandbox?.timeoutMs,
      env: this.options.sandbox?.env,
      maxBuffer: this.options.sandbox?.maxBuffer,
      shellPath: this.options.sandbox?.shellPath,
    };

    if (!baseOptions.timeoutMs) {
      baseOptions.timeoutMs = 5000;
    }

    if (!baseOptions.maxBuffer) {
      baseOptions.maxBuffer = 1024 * 1024;
    }

    return baseOptions;
  }

  private async ensureApproval(analysis: ShellCommandAnalysis, rawCommand: string): Promise<void> {
    if (analysis.risk.level !== 'external') {
      return;
    }

    const provider = this.options.approvalProvider;
    if (!provider) {
      throw new ShellSandboxError(
        `Command "${rawCommand}" requires approval but no approval provider is configured.`,
      );
    }

    const result: ShellToolApprovalResult = await provider.requestApproval({
      command: rawCommand,
      analysis,
      sandbox: this.resolveSandboxOptions(),
    });

    if (result.decision !== 'allow') {
      throw new ShellSandboxError(
        result.reason ?? `Command "${rawCommand}" was denied by the approval provider.`,
      );
    }
  }

  private async executeCommand(command: string): Promise<ShellSandboxResult> {
    const sandboxOptions = this.resolveSandboxOptions();
    return runSandboxedCommand(command, sandboxOptions);
  }
}

function extractSandboxPreview(result: ShellSandboxResult | undefined): string | undefined {
  if (!result) {
    return undefined;
  }

  const combined = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  return combined.length > 0 ? combined : undefined;
}

function formatSandboxResult(result: ShellSandboxResult): string {
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return combined;
}
