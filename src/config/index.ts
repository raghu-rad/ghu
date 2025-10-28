import 'dotenv/config';

import { DEFAULT_SYSTEM_PROMPT } from './prompts.js';

export interface AgentConfig {
  provider: string;
  model: string;
  systemPrompt: string;
  apiKey?: string;
  baseUrl?: string;
}

const normalizeProvider = (value: string | undefined): 'deepseek' | 'mock' => {
  if (!value) {
    return 'mock';
  }
  const normalized = value.toLowerCase();
  return normalized === 'deepseek' ? 'deepseek' : 'mock';
};

export function loadConfig(): AgentConfig {
  const provider = normalizeProvider(process.env.GHU_PROVIDER);

  const model = process.env.GHU_MODEL ?? (provider === 'deepseek' ? 'deepseek-chat' : 'mock-alpha');
  const systemPrompt = process.env.GHU_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;
  const apiKey = provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : undefined;
  const baseUrl =
    provider === 'deepseek'
      ? (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com')
      : undefined;

  return {
    provider,
    model,
    systemPrompt,
    apiKey,
    baseUrl,
  };
}
