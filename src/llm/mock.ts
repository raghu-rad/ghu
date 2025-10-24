import type { GenerateOptions, LLMClient, LLMMessage } from './index.js';

export class MockLLMClient implements LLMClient {
  constructor(private readonly model: string) {}

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMMessage> {
    void options;

    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');

    const content =
      lastUserMessage?.content.trim() ??
      'I did not receive any input. Feel free to ask me something!';

    return {
      role: 'assistant',
      content: `[mock:${this.model}] ${content}`,
    };
  }
}
