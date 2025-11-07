import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LLMMessage, ToolSpecification } from '../../src/llm/types.js';
import { OpenAICompatibleLLMClient } from '../../src/llm/clients/openai-compatible.js';

const createSpy = vi.fn();
let capturedOptions: Record<string, unknown> | undefined;

vi.mock('openai', () => {
  class APIError extends Error {
    status?: number;
    headers?: Headers;
    error?: unknown;

    constructor(status?: number, error?: unknown, message?: string, headers?: Headers) {
      super(message ?? 'API error');
      this.status = status;
      this.error = error;
      this.headers = headers;
    }
  }

  class MockOpenAI {
    chat = {
      completions: {
        create: createSpy,
      },
    };

    constructor(options: Record<string, unknown>) {
      capturedOptions = options;
    }

    static APIError = APIError;
  }

  return {
    default: MockOpenAI,
    APIError,
  };
});

describe('OpenAICompatibleLLMClient', () => {
  beforeEach(() => {
    createSpy.mockReset();
    capturedOptions = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps messages, tools, and parses tool calls from the response', async () => {
    const client = new OpenAICompatibleLLMClient({
      model: 'gpt-5',
      apiKey: 'test-key',
      baseUrl: 'https://example.com/',
      providerName: 'OpenAI',
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: 'Stay concise.' },
      { role: 'user', content: 'Compute something.' },
      {
        role: 'assistant',
        content: 'Working...',
        toolCalls: [
          {
            id: 'call-1',
            name: 'compute',
            arguments: { value: 21 },
          },
        ],
      },
      {
        role: 'tool',
        name: 'compute',
        content: '42',
        toolCallId: 'call-1',
      },
    ];

    const tools: ToolSpecification[] = [
      {
        name: 'compute',
        description: 'Performs a computation',
        parameters: { type: 'object', properties: { value: { type: 'number' } } },
      },
    ];

    createSpy.mockResolvedValue({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Answer is 42.',
            tool_calls: [
              {
                id: 'call-2',
                type: 'function',
                function: {
                  name: 'compute',
                  arguments: '{"value":84}',
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 111,
        completion_tokens: 7,
        total_tokens: 118,
      },
    });

    const result = await client.generate(messages, {
      tools,
      temperature: 0.2,
      maxTokens: 512,
    });

    expect(capturedOptions).toEqual({
      apiKey: 'test-key',
      baseURL: 'https://example.com',
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.model).toBe('gpt-5');
    expect(payload.temperature).toBe(0.2);
    expect(payload.max_tokens).toBe(512);

    const payloadMessages = payload.messages as unknown[];
    expect(payloadMessages).toHaveLength(4);
    expect(payloadMessages?.[2]).toMatchObject({
      role: 'assistant',
      content: 'Working...',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'compute',
            arguments: JSON.stringify({ value: 21 }),
          },
        },
      ],
    });
    expect(payloadMessages?.[3]).toMatchObject({
      role: 'tool',
      content: '42',
      tool_call_id: 'call-1',
    });

    const payloadTools = payload.tools as unknown[];
    expect(payloadTools).toEqual([
      {
        type: 'function',
        function: {
          name: 'compute',
          description: 'Performs a computation',
          parameters: { type: 'object', properties: { value: { type: 'number' } } },
        },
      },
    ]);

    expect(result.message.content).toBe('Answer is 42.');
    expect(result.toolCalls).toEqual([
      { id: 'call-2', name: 'compute', arguments: { value: 84 } },
    ]);
    expect(result.usage).toEqual({
      promptTokens: 111,
      completionTokens: 7,
      totalTokens: 118,
    });
  });

  it('wraps OpenAI API errors with provider context', async () => {
    const client = new OpenAICompatibleLLMClient({
      model: 'gpt-5',
      apiKey: 'secret',
      providerName: 'OpenAI',
    });

    const { APIError } = await import('openai');
    const apiError = new APIError(400, { message: 'bad request' }, 'bad request', undefined);
    createSpy.mockRejectedValue(apiError);

    await expect(client.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'OpenAI API error (400): bad request',
    );
  });
});
