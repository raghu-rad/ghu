import { describe, expect, it } from 'vitest';

import { PromptBuilder } from '../src/prompt/builder.js';

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
});
