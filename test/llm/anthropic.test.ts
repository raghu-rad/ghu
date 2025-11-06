import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnthropicsLLMClient } from '../../src/llm/clients/anthropic.js';
import type { LLMMessage, ToolSpecification } from '../../src/llm/types.js';

const ORIGINAL_FETCH = globalThis.fetch;

describe('AnthropicsLLMClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = ORIGINAL_FETCH;
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

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
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
      }),
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await client.generate(messages, { tools });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
    });

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('claude-sonnet-4.5');
    expect(body.system).toBe('Be concise.');
    expect(body.tools).toHaveLength(1);
    expect(body.messages).toHaveLength(3); // user, assistant, user(tool result)

    expect(result.message.content).toBe('Calling tool with new input.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]?.id).toBe('toolu_new');
    expect(result.toolCalls?.[0]?.name).toBe('test-tool');
    expect(result.usage?.promptTokens).toBe(120);
    expect(result.usage?.completionTokens).toBe(30);
    expect(result.usage?.totalTokens).toBe(150);
  });
});
