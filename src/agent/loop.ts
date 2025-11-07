import type { AgentConfig } from '../config/index.js';
import { ConversationHistory } from '../history/conversation-history.js';
import type { TokenUsage } from '../history/conversation-history.js';
import type { LLMClient, LLMMessage, LLMResponse, LLMToolCall } from '../llm/index.js';
import { PromptBuilder } from '../prompt/builder.js';
import { ToolRegistry, type ToolDisplay } from '../tools/index.js';

export interface AgentOptions {
  config: AgentConfig;
  llmClient: LLMClient;
  promptBuilder?: PromptBuilder;
  toolRegistry: ToolRegistry;
  maxIterations?: number;
  history?: ConversationHistory;
  yoloMode?: boolean;
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
  onUsageUpdated?: (usage: TokenUsage) => void;
}

export class Agent {
  private readonly promptBuilder: PromptBuilder;
  private readonly history: ConversationHistory;
  private readonly toolRegistry: ToolRegistry;
  private readonly maxIterations: number;
  private yoloMode: boolean;

  constructor(private readonly options: AgentOptions) {
    this.promptBuilder = options.promptBuilder ?? new PromptBuilder();
    this.history = options.history ?? new ConversationHistory();
    this.toolRegistry = options.toolRegistry;
    this.maxIterations = options.maxIterations ?? 5;
    this.yoloMode = options.yoloMode ?? false;
  }

  reset(): void {
    this.history.clear();
  }

  isYoloMode(): boolean {
    return this.yoloMode;
  }

  setYoloMode(enabled: boolean): void {
    this.yoloMode = enabled;
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
    return this.history.getMessages();
  }

  getTokenUsage(): TokenUsage {
    return this.history.getTokenUsage();
  }

  async processUserMessage(
    userInput: string,
    options?: ProcessUserMessageOptions,
  ): Promise<AgentTurnResult> {
    this.history.appendUser(userInput);

    const toolMessages: AgentToolMessage[] = [];

    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      const messages = this.promptBuilder.build({
        systemPrompt: this.options.config.systemPrompt,
        history: this.history.getMessages(),
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

      const assistantMessage = this.history.registerLLMResponse(response);
      options?.onUsageUpdated?.(this.history.getTokenUsage());

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
      const message = this.history.appendToolMessage({
        name: toolCall.name,
        content: `ERROR: Requested tool "${toolCall.name}" is not available.`,
        toolCallId: toolCall.id,
      });
      return { message };
    }

    try {
      const result = await tool.run(toolCall.arguments ?? {});
      const content = result.error ? `ERROR: ${result.error}` : result.output;

      const message = this.history.appendToolMessage({
        name: tool.name,
        content,
        toolCallId: toolCall.id,
      });
      return {
        message,
        display: result.display,
      };
    } catch (error) {
      const messageContent =
        error instanceof Error ? error.message : 'Unknown tool execution error';
      const message = this.history.appendToolMessage({
        name: tool.name,
        content: `ERROR: ${messageContent}`,
        toolCallId: toolCall.id,
      });
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
