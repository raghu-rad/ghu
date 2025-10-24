export interface AgentConfig {
  provider: string;
  model: string;
  systemPrompt: string;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are ragent, a helpful terminal assistant. Respond concisely and request clarification when needed.';

export function loadConfig(): AgentConfig {
  const provider = process.env.RAGENT_PROVIDER ?? 'mock';
  const model = process.env.RAGENT_MODEL ?? 'mock-alpha';
  const systemPrompt = process.env.RAGENT_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

  return {
    provider,
    model,
    systemPrompt,
  };
}
