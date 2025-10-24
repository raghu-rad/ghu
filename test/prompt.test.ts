import { describe, expect, it } from 'vitest';

import { PromptBuilder } from '../src/prompt/builder.js';

describe('PromptBuilder', () => {
  it('builds a conversation with system, history, and user messages', () => {
    const builder = new PromptBuilder();
    const messages = builder.build({
      systemPrompt: 'system',
      history: [{ role: 'assistant', content: 'previous' }],
      userInput: 'hello',
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'system', content: 'system' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'previous' });
    expect(messages[2]).toEqual({ role: 'user', content: 'hello' });
  });
});
