import { MockLLMClient } from './mock.js';

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  name?: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClient {
  generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMMessage>;
}

export function createLLMClient(provider: string, model: string): LLMClient {
  switch (provider) {
    case 'mock':
      return new MockLLMClient(model);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
