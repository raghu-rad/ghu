import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { AgentConfig } from '../config/index.js';
import type { LLMClient, LLMMessage } from '../llm/index.js';
import { PromptBuilder } from '../prompt/builder.js';

export interface AgentOptions {
  config: AgentConfig;
  llmClient: LLMClient;
  promptBuilder?: PromptBuilder;
}

export class Agent {
  private readonly promptBuilder: PromptBuilder;
  private readonly history: LLMMessage[] = [];

  constructor(private readonly options: AgentOptions) {
    this.promptBuilder = options.promptBuilder ?? new PromptBuilder();
  }

  async run(): Promise<void> {
    const rl = readline.createInterface({
      input,
      output,
    });

    console.log('ragent ready. Type /exit to quit, /reset to clear the conversation.');

    try {
      for (;;) {
        const userInput = await rl.question('> ');
        const trimmed = userInput.trim();

        if (trimmed.length === 0) {
          continue;
        }

        if (trimmed === '/exit') {
          break;
        }

        if (trimmed === '/reset') {
          this.history.length = 0;
          console.log('Conversation history cleared.');
          continue;
        }

        await this.handleUserInput(trimmed);
      }
    } finally {
      rl.close();
    }

    console.log('Goodbye!');
  }

  private async handleUserInput(userInput: string): Promise<void> {
    const messages = this.promptBuilder.build({
      systemPrompt: this.options.config.systemPrompt,
      history: this.history,
      userInput,
    });

    let response: LLMMessage;
    try {
      response = await this.options.llmClient.generate(messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`LLM call failed: ${message}`);
      return;
    }

    this.history.push({ role: 'user', content: userInput });
    this.history.push(response);

    console.log(response.content);
  }
}
