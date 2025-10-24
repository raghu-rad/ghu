import { DeepSeekLLMClient } from './deepseek.js';
import { MockLLMClient } from './mock.js';

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: LLMRole;
  content: string;
  name?: string;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

export interface ToolSpecification {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolSpecification[];
}

export interface LLMResponse {
  message: LLMMessage;
  toolCalls?: LLMToolCall[];
}

export interface LLMClient {
  generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse>;
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
