import 'dotenv/config';

import { DEFAULT_SYSTEM_PROMPT } from './prompts.js';

export interface AgentConfig {
  provider: string;
  model: string;
  systemPrompt: string;
  apiKey?: string;
  baseUrl?: string;
}

export function loadConfig(): AgentConfig {
  const envProvider = process.env.RAGENT_PROVIDER;
  const provider = envProvider ? 'deepseek' : 'mock';
  const model = process.env.RAGENT_MODEL ?? (provider === 'deepseek' ? 'deepseek-chat' : 'mock-alpha');
  const systemPrompt = process.env.RAGENT_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;
  const apiKey = provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : undefined;
  const baseUrl = provider === 'deepseek' ? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com' : undefined;

  return {
    provider,
    model,
    systemPrompt,
    apiKey,
    baseUrl,
  };
}
