import type { ProviderId } from './providers.js';

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  apiKeyEnv?: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
}

export interface ModelPreset {
  id: string;
  label: string;
  provider: ProviderId;
  description?: string;
}

export interface ModelRegistryDefinition {
  providers: ProviderConfig[];
  models: ModelPreset[];
}

export const MODEL_REGISTRY: ModelRegistryDefinition = {
  providers: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      baseUrlEnv: 'DEEPSEEK_BASE_URL',
      defaultBaseUrl: 'https://api.deepseek.com',
      requiresApiKey: true,
    },
    {
      id: 'openai',
      label: 'OpenAI',
      apiKeyEnv: 'OPENAI_API_KEY',
      baseUrlEnv: 'OPENAI_BASE_URL',
      defaultBaseUrl: 'https://api.openai.com/v1',
      requiresApiKey: true,
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      baseUrlEnv: 'ANTHROPIC_BASE_URL',
      defaultBaseUrl: 'https://api.anthropic.com',
      requiresApiKey: true,
    },
    {
      id: 'mock',
      label: 'Mock',
      requiresApiKey: false,
    },
  ],
  models: [
    {
      id: 'deepseek-chat',
      label: 'DeepSeek Chat',
      provider: 'deepseek',
      description: 'General-purpose DeepSeek chat model.',
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      provider: 'deepseek',
      description: 'DeepSeek model with enhanced reasoning.',
    },
    {
      id: 'gpt-5',
      label: 'GPT-5',
      provider: 'openai',
      description: 'Flagship GPT-5 model optimized for complex, agentic tasks.',
    },
    {
      id: 'gpt-5-mini',
      label: 'GPT-5 mini',
      provider: 'openai',
      description: 'Faster, cost-efficient GPT-5 variant for well-defined work.',
    },
    {
      id: 'gpt-5-nano',
      label: 'GPT-5 nano',
      provider: 'openai',
      description: 'Lowest-latency GPT-5 option for rapid iterations.',
    },
    {
      id: 'claude-sonnet-4-5',
      label: 'Claude 4.5 Sonnet',
      provider: 'anthropic',
      description: 'Balanced Claude model suitable for general-purpose tasks.',
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Claude 4.5 Haiku',
      provider: 'anthropic',
      description: 'Fast Claude model optimized for lightweight interactions.',
    },
    {
      id: 'claude-opus-4-1',
      label: 'Claude 4.1 Opus',
      provider: 'anthropic',
      description: 'Highest capability Claude model for complex workflows.',
    },
    {
      id: 'mock-alpha',
      label: 'Mock Alpha',
      provider: 'mock',
      description: 'Internal mock model used for testing.',
    },
  ],
};
