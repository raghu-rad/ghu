import type { AgentConfig } from '../config/index.js';
import type { LLMClient, LLMMessage, LLMResponse, LLMToolCall } from '../llm/index.js';
import { PromptBuilder } from '../prompt/builder.js';
import { ToolRegistry, type ToolDisplay } from '../tools/index.js';

export interface AgentOptions {
  config: AgentConfig;
  llmClient: LLMClient;
  promptBuilder?: PromptBuilder;
  toolRegistry: ToolRegistry;
  maxIterations?: number;
}

export interface AgentTurnResult {
  assistant?: LLMMessage;
  toolMessages?: AgentToolMessage[];
  error?: string;
  exhaustedIterations?: boolean;
}

export interface AgentToolMessage {
  message: LLMMessage;
  display?: ToolDisplay;
}

export interface ProcessUserMessageOptions {
  onToolMessage?: (message: AgentToolMessage) => void;
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

  reset(): void {
    this.history.length = 0;
  }

  getConfig(): AgentConfig {
    return this.options.config;
  }

  updateLLM(
    config: Pick<AgentConfig, 'provider' | 'providerLabel' | 'model' | 'apiKey' | 'baseUrl'>,
    llm: LLMClient,
  ): void {
    this.options.config.provider = config.provider;
    this.options.config.model = config.model;
    this.options.config.providerLabel = config.providerLabel;
    this.options.config.apiKey = config.apiKey;
    this.options.config.baseUrl = config.baseUrl;
    this.options.llmClient = llm;
  }

  getHistory(): readonly LLMMessage[] {
    return this.history;
  }

  async processUserMessage(
    userInput: string,
    options?: ProcessUserMessageOptions,
  ): Promise<AgentTurnResult> {
    this.history.push({ role: 'user', content: userInput });

    const toolMessages: AgentToolMessage[] = [];

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
        return { error: `LLM call failed: ${message}` };
      }

      const assistantMessage: LLMMessage = {
        ...response.message,
        toolCalls: response.toolCalls ?? response.message.toolCalls,
      };

      this.history.push(assistantMessage);

      const toolCalls = assistantMessage.toolCalls ?? [];

      if (toolCalls.length === 0) {
        return { assistant: assistantMessage, toolMessages };
      }

      for (const toolCall of toolCalls) {
        const toolMessage = await this.executeTool(toolCall);
        toolMessages.push(toolMessage);
        options?.onToolMessage?.(toolMessage);
      }
    }

    return {
      error: 'Reached maximum tool iterations without a final response.',
      toolMessages,
      exhaustedIterations: true,
    };
  }

  private async executeTool(toolCall: LLMToolCall): Promise<AgentToolMessage> {
    const tool = this.toolRegistry.get(toolCall.name);

    if (!tool) {
      const missingToolMessage: LLMMessage = {
        role: 'tool',
        name: toolCall.name,
        content: `ERROR: Requested tool "${toolCall.name}" is not available.`,
        toolCallId: toolCall.id,
      };
      this.history.push(missingToolMessage);
      return { message: missingToolMessage };
    }

    try {
      const result = await tool.run(toolCall.arguments ?? {});
      const content = result.error ? `ERROR: ${result.error}` : result.output;

      const message: LLMMessage = {
        role: 'tool',
        name: tool.name,
        content,
        toolCallId: toolCall.id,
      };

      this.history.push(message);
      return {
        message,
        display: result.display,
      };
    } catch (error) {
      const messageContent =
        error instanceof Error ? error.message : 'Unknown tool execution error';
      const message: LLMMessage = {
        role: 'tool',
        name: tool.name,
        content: `ERROR: ${messageContent}`,
        toolCallId: toolCall.id,
      };
      this.history.push(message);
      return {
        message,
        display: {
          message: `Tool execution failed: ${tool.name}`,
          tone: 'error',
          details: messageContent,
        },
      };
    }
  }
}
