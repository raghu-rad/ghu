import type { LLMMessage } from '../llm/index.js';

export interface PromptContext {
  systemPrompt: string;
  history: LLMMessage[];
  userInput: string;
}

export class PromptBuilder {
  build({ systemPrompt, history, userInput }: PromptContext): LLMMessage[] {
    const conversation: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userInput },
    ];

    return conversation;
  }
}
