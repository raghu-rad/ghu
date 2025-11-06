import { AnthropicsLLMClient } from './clients/anthropic.js';
import { OpenAICompatibleLLMClient } from './clients/openai-compatible.js';
import { MockLLMClient } from './clients/mock.js';
import type { LLMClient } from './types.js';

export type {
  GenerateOptions,
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMResponseUsage,
  LLMRole,
  LLMToolCall,
  ToolSpecification,
} from './types.js';

export interface CreateLLMClientOptions {
  apiKey?: string;
  baseUrl?: string;
  providerName?: string;
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
      return new OpenAICompatibleLLMClient({
        model,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        providerName: options.providerName ?? 'DeepSeek',
      });
    case 'anthropic':
      return new AnthropicsLLMClient({
        model,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        providerName: options.providerName ?? 'Anthropic',
      });
    case 'openai':
      return new OpenAICompatibleLLMClient({
        model,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        providerName: options.providerName ?? 'OpenAI',
      });
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
