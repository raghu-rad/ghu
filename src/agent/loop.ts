import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { AgentConfig } from '../config/index.js';
import type { LLMClient, LLMMessage } from '../llm/index.js';
import { PromptBuilder } from '../prompt/builder.js';
import type { ToolCall } from '../tools/index.js';
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
        tools: this.toolRegistry.list(),
      });

      let response: LLMMessage;
      try {
        response = await this.options.llmClient.generate(messages);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`LLM call failed: ${message}`);
        return;
      }

      this.history.push(response);

      const toolCall = this.parseToolCall(response.content);

      if (!toolCall) {
        console.log(response.content);
        return;
      }

      const tool = this.toolRegistry.get(toolCall.tool);

      if (!tool) {
        const errorContent = `Requested tool "${toolCall.tool}" is not available.`;
        console.error(errorContent);
        this.history.push({ role: 'tool', name: toolCall.tool, content: errorContent });
        continue;
      }

      console.log(`→ Executing tool: ${tool.name}`);

      let toolResult: LLMMessage;
      try {
        const result = await tool.run(toolCall.input);
        const content = result.error ? `ERROR: ${result.error}` : result.output;

        if (content) {
          console.log(content);
        }

        toolResult = {
          role: 'tool',
          name: tool.name,
          content,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown tool execution error';
        console.error(`Tool execution failed: ${message}`);
        toolResult = {
          role: 'tool',
          name: tool.name,
          content: `ERROR: ${message}`,
        };
      }

      this.history.push(toolResult);
    }

    console.warn('Reached maximum tool iterations without a final response.');
  }

  private parseToolCall(content: string): ToolCall | null {
    const candidates = this.extractJsonCandidates(content);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);

        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.tool === 'string' &&
          parsed.tool.length > 0 &&
          parsed.input &&
          typeof parsed.input === 'object'
        ) {
          return {
            tool: parsed.tool,
            input: parsed.input,
          };
        }
      } catch (error) {
        void error;
      }
    }

    return null;
  }

  private extractJsonCandidates(content: string): string[] {
    const trimmed = content.trim();
    const candidates: string[] = [];

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      candidates.push(trimmed);
    }

    const codeBlockPattern = /```json\s*([\s\S]+?)```/gi;
    let match: RegExpExecArray | null;

    while ((match = codeBlockPattern.exec(content)) !== null) {
      candidates.push(match[1].trim());
    }

    return candidates;
  }
}
