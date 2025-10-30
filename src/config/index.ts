import 'dotenv/config';

import { DEFAULT_SYSTEM_PROMPT } from './prompts.js';
import { inferDefaultModel, resolveModel } from '../llm/routing/model-routing.js';

export interface AgentConfig {
  provider: string;
  model: string;
  providerLabel: string;
  systemPrompt: string;
  apiKey?: string;
  baseUrl?: string;
}

export function loadConfig(): AgentConfig {
  const requestedModel = process.env.GHU_MODEL ?? inferDefaultModel();
  const resolved = resolveModel(requestedModel, { requireCredentials: false });
  const systemPrompt = process.env.GHU_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

  return {
    provider: resolved.provider,
    model: resolved.model,
    providerLabel: resolved.providerLabel,
    systemPrompt,
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl,
  };
}
