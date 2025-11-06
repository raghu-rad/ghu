import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnthropicsLLMClient } from '../../src/llm/clients/anthropic.js';
import type { LLMMessage, ToolSpecification } from '../../src/llm/types.js';

const { createSpy, anthropicCtor, SDKApiError } = vi.hoisted(() => {
  const createSpy = vi.fn();
  const anthropicCtor = vi.fn();

  class SDKApiError extends Error {
    status?: number;
    error?: { message?: string };

    constructor(status?: number, error?: { message?: string }, message?: string) {
      super(message ?? error?.message ?? 'Anthropic error');
      this.status = status;
      this.error = error;
    }
  }

  return {
    createSpy,
    anthropicCtor,
    SDKApiError,
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: anthropicCtor,
  APIError: SDKApiError,
}));

let capturedOptions: Record<string, unknown> | undefined;

describe('AnthropicsLLMClient', () => {
  beforeEach(() => {
    capturedOptions = undefined;
    createSpy.mockReset();
    anthropicCtor.mockReset();
    anthropicCtor.mockImplementation(function MockAnthropic(
      this: unknown,
      options: Record<string, unknown>,
    ) {
      capturedOptions = options;
      return {
        messages: {
          create: createSpy,
        },
      };
    });
  });

  it('sends mapped messages and parses tool calls from the response', async () => {
    const client = new AnthropicsLLMClient({
      model: 'claude-sonnet-4.5',
      apiKey: 'test-key',
      providerName: 'Anthropic',
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Run the tool.' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'toolu_existing', name: 'test-tool', arguments: { delta: 5 } }],
      },
      {
        role: 'tool',
        name: 'test-tool',
        content: 'tool output',
        toolCallId: 'toolu_existing',
      },
    ];

    const tools: ToolSpecification[] = [
      {
        name: 'test-tool',
        description: 'Test tool',
        parameters: { type: 'object', properties: {} },
      },
    ];

    createSpy.mockResolvedValue({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4.5',
      stop_reason: 'tool_use',
      stop_sequence: null,
      content: [
        { type: 'text', text: 'Calling tool with new input.' },
        { type: 'tool_use', id: 'toolu_new', name: 'test-tool', input: { delta: 10 } },
      ],
      usage: { input_tokens: 120, output_tokens: 30 },
    });

    const result = await client.generate(messages, { tools, maxTokens: 2048 });

    expect(anthropicCtor).toHaveBeenCalledTimes(1);
    expect(capturedOptions).toEqual({
      apiKey: 'test-key',
      baseURL: 'https://api.anthropic.com',
      defaultHeaders: { 'anthropic-version': '2023-06-01' },
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.model).toBe('claude-sonnet-4.5');
    expect(payload.stream).toBe(false);
    expect(payload.max_tokens).toBe(2048);
    expect(payload.system).toBe('Be concise.');
    expect(payload.messages).toHaveLength(3);
    expect(payload.tools).toHaveLength(1);

    expect(result.message.content).toBe('Calling tool with new input.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]?.id).toBe('toolu_new');
    expect(result.toolCalls?.[0]?.name).toBe('test-tool');
    expect(result.usage?.promptTokens).toBe(120);
    expect(result.usage?.completionTokens).toBe(30);
    expect(result.usage?.totalTokens).toBe(150);
  });

  it('wraps SDK API errors with provider context', async () => {
    const client = new AnthropicsLLMClient({
      model: 'claude-haiku-4.5',
      apiKey: 'secret',
      providerName: 'Anthropic',
    });

    const error = new SDKApiError(400, { message: 'bad request' }, 'bad request');
    createSpy.mockRejectedValue(error);

    await expect(client.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'Anthropic API error (400): bad request',
    );
  });
});
