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

interface AnthropicContentTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicContentToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicContentToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | AnthropicContentTextBlock[];
  is_error?: boolean;
}

type AnthropicContentBlock =
  | AnthropicContentTextBlock
  | AnthropicContentToolUseBlock
  | AnthropicContentToolResultBlock;

interface AnthropicUserMessage {
  role: 'user';
  content: string | AnthropicContentBlock[];
}

interface AnthropicAssistantMessage {
  role: 'assistant';
  content: AnthropicContentBlock[];
}

type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage;

interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicUsageResponse {
  input_tokens?: number;
  output_tokens?: number;
}

interface AnthropicResponseBody {
  id: string;
  type: string;
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage?: AnthropicUsageResponse;
}

interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

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
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    const { systemPrompt, conversation } = this.mapMessages(messages);
    const tools = this.mapTools(options?.tools ?? []);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      messages: conversation,
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

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.version,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as AnthropicResponseBody;
    return this.mapResponse(data);
  }

  private mapMessages(messages: LLMMessage[]): {
    systemPrompt?: string;
    conversation: AnthropicMessage[];
  } {
    const systemParts: string[] = [];
    const conversation: AnthropicMessage[] = [];

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
          const contentBlocks: AnthropicContentBlock[] = [];

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
              });
            });
          }

          conversation.push({
            role: 'assistant',
            content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: '' }],
          });
          break;
        }
        case 'tool': {
          const toolUseId = message.toolCallId ?? this.createToolUseId();
          const isError = message.content.trim().toUpperCase().startsWith('ERROR:');
          const content: AnthropicContentToolResultBlock = {
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

  private mapTools(tools: ToolSpecification[]): AnthropicToolDefinition[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters ?? { type: 'object' },
    }));
  }

  private mapResponse(response: AnthropicResponseBody): LLMResponse {
    const textParts: string[] = [];
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
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

  private mapUsage(usage?: AnthropicUsageResponse): LLMResponseUsage | undefined {
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

  private async handleErrorResponse(response: Response): Promise<never> {
    let message = `${this.providerName} API error (${response.status})`;

    try {
      const data = (await response.json()) as AnthropicErrorResponse;
      if (data?.error?.message) {
        message += `: ${data.error.message}`;
      }
    } catch {
      // Ignore JSON parse errors and fall back to status text.
    }

    throw new Error(message);
  }

  private createToolUseId(seed?: number): string {
    if (typeof seed === 'number') {
      return `toolu_${seed}_${randomUUID()}`;
    }

    return `toolu_${randomUUID()}`;
  }
}
