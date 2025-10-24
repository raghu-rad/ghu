import { describe, expect, it } from 'vitest';

import { PromptBuilder } from '../src/prompt/builder.js';
import type { Tool } from '../src/tools/index.js';

describe('PromptBuilder', () => {
  it('builds a conversation with system prompt and history', () => {
    const builder = new PromptBuilder();
    const messages = builder.build({
      systemPrompt: 'system',
      history: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'response' },
      ],
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'system', content: 'system' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hello' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'response' });
  });

  it('includes tool instructions when tools are provided', () => {
    const builder = new PromptBuilder();
    const tools: Tool[] = [
      {
        name: 'shell',
        description: 'Run shell commands',
        parameters: { type: 'object' },
        async run() {
          return { output: '' };
        },
      },
    ];

    const messages = builder.build({
      systemPrompt: 'system',
      history: [],
      tools,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'system', content: 'system' });
    expect(messages[1].role).toBe('system');
    expect(messages[1].content).toContain('Available tools');
  });
});
