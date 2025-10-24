import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { AgentConfig } from '../config/index.js';
import type { LLMClient, LLMMessage, LLMResponse, LLMToolCall } from '../llm/index.js';
import { PromptBuilder } from '../prompt/builder.js';
import { ToolRegistry } from '../tools/index.js';

export interface AgentOptions {
  config: AgentConfig;
  llmClient: LLMClient;
  promptBuilder?: PromptBuilder;
  toolRegistry: ToolRegistry;
  maxIterations?: number;
}

export class Agent {
  private readonly promptBuilder: PromptBuilder;
  private readonly history: LLMMessage[] = [];
  private readonly toolRegistry: ToolRegistry;
  private readonly maxIterations: number;

  constructor(private readonly options: AgentOptions) {
    this.promptBuilder = options.promptBuilder ?? new PromptBuilder();
    this.toolRegistry = options.toolRegistry;
    this.maxIterations = options.maxIterations ?? 5;
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
    this.history.push({ role: 'user', content: userInput });

    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      const messages = this.promptBuilder.build({
        systemPrompt: this.options.config.systemPrompt,
        history: this.history,
      });

      const toolSpecs = this.toolRegistry.list().map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));

      let response: LLMResponse;
      try {
        response = await this.options.llmClient.generate(messages, {
          tools: toolSpecs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`LLM call failed: ${message}`);
        return;
      }

      const assistantMessage: LLMMessage = {
        ...response.message,
        toolCalls: response.toolCalls ?? response.message.toolCalls,
      };

      this.history.push(assistantMessage);

      const toolCalls = assistantMessage.toolCalls ?? [];

      if (toolCalls.length === 0) {
        if (assistantMessage.content.trim().length > 0) {
          console.log(assistantMessage.content);
        }
        return;
      }

      for (const toolCall of toolCalls) {
        await this.executeTool(toolCall);
      }
    }

    console.warn('Reached maximum tool iterations without a final response.');
  }

  private async executeTool(toolCall: LLMToolCall): Promise<void> {
    const tool = this.toolRegistry.get(toolCall.name);

    if (!tool) {
      const errorContent = `Requested tool "${toolCall.name}" is not available.`;
      console.error(errorContent);
      this.history.push({
        role: 'tool',
        name: toolCall.name,
        content: errorContent,
        toolCallId: toolCall.id,
      });
      return;
    }

    try {
      const result = await tool.run(toolCall.arguments ?? {});
      const content = result.error ? `ERROR: ${result.error}` : result.output;

      this.history.push({
        role: 'tool',
        name: tool.name,
        content,
        toolCallId: toolCall.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool execution error';
      console.error(`Tool execution failed: ${message}`);
      this.history.push({
        role: 'tool',
        name: tool.name,
        content: `ERROR: ${message}`,
        toolCallId: toolCall.id,
      });
    }
  }
}
