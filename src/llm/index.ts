import { DeepSeekLLMClient } from './deepseek.js';
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

export interface CreateLLMClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export function createLLMClient(
  provider: string,
  model: string,
  options: CreateLLMClientOptions = {},
): LLMClient {
  switch (provider) {
    case 'mock':
      return new MockLLMClient(model);
    case 'deepseek':
      return new DeepSeekLLMClient({
        model,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
      });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
