import Anthropic, { APIError } from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
  Message,
  MessageCreateParams,
  MessageCreateParamsNonStreaming,
  Tool,
  ToolResultBlockParam,
  Usage,
} from '@anthropic-ai/sdk/resources/messages.mjs';
import { randomUUID } from 'node:crypto';

import type {
  GenerateOptions,
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMResponseUsage,
  LLMToolCall,
  ToolSpecification,
} from '../types.js';

export interface AnthropicClientOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  version?: string;
  providerName: string;
  defaultMaxTokens?: number;
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicsLLMClient implements LLMClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly providerName: string;
  private readonly version: string;
  private readonly defaultMaxTokens: number;

  constructor(options: AnthropicClientOptions) {
    if (!options.apiKey) {
      throw new Error(
        `${options.providerName.toUpperCase()}_API_KEY environment variable is required for ${options.providerName} provider.`,
      );
    }

    this.apiKey = options.apiKey;
    this.model = options.model;
    this.version = options.version ?? DEFAULT_VERSION;
    this.providerName = options.providerName;
    this.defaultMaxTokens = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

    this.client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      defaultHeaders: {
        'anthropic-version': this.version,
      },
    });
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    const { systemPrompt, conversation } = this.mapMessages(messages);
    const tools = this.mapTools(options?.tools ?? []);

    const body: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      messages: conversation,
      stream: false,
    };

    if ((systemPrompt ?? '').trim().length > 0) {
      body.system = systemPrompt;
    }

    if (typeof options?.temperature === 'number') {
      body.temperature = options.temperature;
    }

    if (tools.length > 0) {
      body.tools = tools;
    }

    try {
      const response = await this.client.messages.create(body);
      return this.mapResponse(response);
    } catch (error) {
      this.handleError(error);
    }
  }

  private mapMessages(messages: LLMMessage[]): {
    systemPrompt?: string;
    conversation: MessageCreateParams['messages'];
  } {
    const systemParts: string[] = [];
    const conversation: MessageCreateParams['messages'] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system': {
          if (message.content && message.content.trim().length > 0) {
            systemParts.push(message.content);
          }
          break;
        }
        case 'user': {
          conversation.push({
            role: 'user',
            content: message.content,
          });
          break;
        }
        case 'assistant': {
          const contentBlocks: ContentBlockParam[] = [];

          if (message.content && message.content.trim().length > 0) {
            contentBlocks.push({
              type: 'text',
              text: message.content,
            });
          }

          if (message.toolCalls && message.toolCalls.length > 0) {
            message.toolCalls.forEach((toolCall, index) => {
              const id = toolCall.id ?? this.createToolUseId(index);
              contentBlocks.push({
                type: 'tool_use',
                id,
                name: toolCall.name,
                input: toolCall.arguments ?? {},
              } as ContentBlockParam);
            });
          }

          conversation.push({
            role: 'assistant',
            content:
              contentBlocks.length > 0
                ? contentBlocks
                : ([{ type: 'text', text: '' }] as ContentBlockParam[]),
          });
          break;
        }
        case 'tool': {
          const toolUseId = message.toolCallId ?? this.createToolUseId();
          const isError = message.content.trim().toUpperCase().startsWith('ERROR:');
          const content: ToolResultBlockParam = {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: message.content,
          };
          if (isError) {
            content.is_error = true;
          }

          conversation.push({
            role: 'user',
            content: [content],
          });
          break;
        }
        default:
          break;
      }
    }

    return {
      systemPrompt: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      conversation,
    };
  }

  private mapTools(tools: ToolSpecification[]): Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: (tool.parameters as Tool['input_schema']) ?? { type: 'object' },
      type: 'custom',
    }));
  }

  private mapResponse(response: Message): LLMResponse {
    const textParts: string[] = [];
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    const usage = this.mapUsage(response.usage);

    const message: LLMMessage = {
      role: 'assistant',
      content: textParts.join('\n\n'),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };

    return {
      message,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  private mapUsage(usage?: Usage | null): LLMResponseUsage | undefined {
    if (!usage) {
      return undefined;
    }

    const promptTokens = usage.input_tokens ?? 0;
    const completionTokens = usage.output_tokens ?? 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  private handleError(error: unknown): never {
    if (error instanceof APIError) {
      const status = typeof error.status === 'number' ? ` (${error.status})` : '';
      const message =
        (typeof error.error === 'object' &&
        error.error !== null &&
        'message' in error.error
          ? (error.error as { message?: string }).message
          : undefined) ?? error.message;

      throw new Error(`${this.providerName} API error${status}: ${message}`);
    }

    if (error instanceof Error) {
      throw new Error(`${this.providerName} unexpected error: ${error.message}`);
    }

    throw new Error(`${this.providerName} unexpected error`);
  }

  private createToolUseId(seed?: number): string {
    if (typeof seed === 'number') {
      return `toolu_${seed}_${randomUUID()}`;
    }

    return `toolu_${randomUUID()}`;
  }
}
