import type { LLMMessage } from '../llm/index.js';

export interface PromptContext {
  systemPrompt: string;
  history: LLMMessage[];
}

export class PromptBuilder {
  build({ systemPrompt, history }: PromptContext): LLMMessage[] {
    return [{ role: 'system', content: systemPrompt }, ...history];
  }
}
