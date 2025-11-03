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
      id: 'mock-alpha',
      label: 'Mock Alpha',
      provider: 'mock',
      description: 'Internal mock model used for testing.',
    },
  ],
};
