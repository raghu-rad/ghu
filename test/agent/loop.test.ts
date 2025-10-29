import { describe, expect, it, vi } from 'vitest';

import { Agent } from '../../src/agent/index.js';
import type { AgentConfig } from '../../src/config/index.js';
import type { LLMClient, LLMResponse } from '../../src/llm/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('Agent tool streaming', () => {
  it('invokes the onToolMessage callback for each executed tool', async () => {
    const config: AgentConfig = {
      provider: 'mock',
      model: 'mock-model',
      systemPrompt: 'System prompt',
    };

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: 'test-tool',
      description: 'A tool for testing',
      parameters: {},
      async run() {
        return { output: 'tool result' };
      },
    });

    const llmResponses: LLMResponse[] = [
      {
        message: {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'test-tool',
              arguments: {},
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Final response',
        },
      },
    ];

    const llmClient: LLMClient = {
      async generate() {
        const response = llmResponses.shift();
        if (!response) {
          throw new Error('No more mock responses available.');
        }
        return response;
      },
    };

    const agent = new Agent({
      config,
      llmClient,
      toolRegistry,
      maxIterations: 2,
    });

    const onToolMessage = vi.fn();

    const result = await agent.processUserMessage('hello', { onToolMessage });

    expect(onToolMessage).toHaveBeenCalledTimes(1);
    const [toolMessage] = onToolMessage.mock.calls[0];
    expect(toolMessage.message.role).toBe('tool');
    expect(toolMessage.message.name).toBe('test-tool');
    expect(toolMessage.message.content).toBe('tool result');

    expect(result.assistant?.content).toBe('Final response');
    expect(result.toolMessages?.length).toBe(1);
  });
});
