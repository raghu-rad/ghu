import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/tools/shell-sandbox.js', () => {
  const runSandboxedCommand = vi.fn();

  class ShellSandboxError extends Error {
    result?: { stdout: string; stderr: string };

    constructor(message: string, result?: { stdout: string; stderr: string }) {
      super(message);
      this.name = 'ShellSandboxError';
      this.result = result;
    }
  }

  return {
    runSandboxedCommand,
    ShellSandboxError,
  };
});

import { runSandboxedCommand } from '../../src/tools/shell-sandbox.js';
import { ShellTool } from '../../src/tools/shell.js';

const mockedRunSandboxedCommand = runSandboxedCommand as unknown as vi.Mock;

describe('ShellTool', () => {
  beforeEach(() => {
    mockedRunSandboxedCommand.mockReset();
  });

  it('runs low-risk commands without approval', async () => {
    mockedRunSandboxedCommand.mockResolvedValueOnce({
      stdout: 'hello\n',
      stderr: '',
      exitCode: 0,
      signal: null,
    });

    const tool = new ShellTool();
    const result = await tool.run({ command: 'echo hello' });

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('hello');
    expect(mockedRunSandboxedCommand).toHaveBeenCalledWith('echo hello', expect.any(Object));
  });

  it('requires approval for external commands when no provider is configured', async () => {
    const tool = new ShellTool();
    const result = await tool.run({ command: 'curl https://example.com' });

    expect(result.error).toContain('requires approval');
    expect(mockedRunSandboxedCommand).not.toHaveBeenCalled();
  });

  it('runs external commands after approval', async () => {
    mockedRunSandboxedCommand.mockResolvedValueOnce({
      stdout: 'ok\n',
      stderr: '',
      exitCode: 0,
      signal: null,
    });

    const approvalProvider = {
      requestApproval: vi.fn(async () => ({
        decision: 'allow' as const,
        scope: 'once' as const,
      })),
    };

    const tool = new ShellTool({ approvalProvider });
    const result = await tool.run({ command: 'curl https://example.com' });

    expect(approvalProvider.requestApproval).toHaveBeenCalled();
    expect(result.output).toBe('ok');
    expect(mockedRunSandboxedCommand).toHaveBeenCalledWith(
      'curl https://example.com',
      expect.any(Object),
    );
  });

  it('propagates denial errors from approval provider', async () => {
    const approvalProvider = {
      requestApproval: vi.fn(async () => ({
        decision: 'deny' as const,
        reason: 'Denied in test',
      })),
    };

    const tool = new ShellTool({ approvalProvider });
    const result = await tool.run({ command: 'curl https://example.com' });

    expect(approvalProvider.requestApproval).toHaveBeenCalled();
    expect(result.error).toBe('Denied in test');
    expect(mockedRunSandboxedCommand).not.toHaveBeenCalled();
  });
});
