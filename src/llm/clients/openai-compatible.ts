import OpenAI from 'openai';

import type {
  GenerateOptions,
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMToolCall,
  ToolSpecification,
} from '../types.js';

export interface OpenAICompatibleClientOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  providerName: string;
}

export class OpenAICompatibleLLMClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly providerName: string;

  constructor(options: OpenAICompatibleClientOptions) {
    if (!options.apiKey) {
      throw new Error(
        `${options.providerName.toUpperCase()}_API_KEY environment variable is required for ${options.providerName} provider.`,
      );
    }

    const baseURL = options.baseUrl?.replace(/\/$/, '') ?? undefined;

    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL,
    });
    this.model = options.model;
    this.providerName = options.providerName;
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: messages.map((message) => this.mapMessage(message)),
        tools: options?.tools?.map((tool) => this.mapTool(tool)),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      });

      const choice = completion.choices?.[0];

      if (!choice || !choice.message) {
        throw new Error(`${this.providerName} API returned no completion choices.`);
      }

      const toolCalls = choice.message.tool_calls?.map((call) => this.parseToolCall(call));

      const message: LLMMessage = {
        role: (choice.message.role as LLMMessage['role']) ?? 'assistant',
        content: choice.message.content ?? '',
        toolCalls,
      };

      const usage = completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens ?? undefined,
            completionTokens: completion.usage.completion_tokens ?? undefined,
            totalTokens: completion.usage.total_tokens ?? undefined,
          }
        : undefined;

      return {
        message,
        toolCalls,
        ...(usage ? { usage } : {}),
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const status = error.status ?? 'unknown';
        throw new Error(`${this.providerName} API error (${status}): ${error.message}`);
      }

      if (error instanceof Error) {
        throw new Error(`${this.providerName} API error: ${error.message}`);
      }

      throw new Error(`${this.providerName} API error: Unknown error`);
    }
  }

  private mapMessage(message: LLMMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId ?? 'tool-call-response',
      };
    }

    if (message.role === 'assistant') {
      const assistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: message.content,
      };

      if (message.name) {
        assistantMessage.name = message.name;
      }

      if (message.toolCalls && message.toolCalls.length > 0) {
        assistantMessage.tool_calls = message.toolCalls.map((toolCall, index) => ({
          id: toolCall.id ?? `generated-tool-call-${index}`,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments ?? {}),
          },
        }));
      }

      return assistantMessage;
    }

    return {
      role: message.role,
      content: message.content,
    };
  }

  private mapTool(tool: ToolSpecification): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private parseToolCall(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  ): LLMToolCall {
    if (toolCall.type !== 'function' || !toolCall.function) {
      return {
        id: toolCall.id ?? `tool-call-${toolCall.type}`,
        name: toolCall.type,
        arguments: {},
      };
    }

    let parsedArguments: Record<string, unknown> = {};
    try {
      parsedArguments = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error';
      parsedArguments = {
        __parse_error: message,
        raw: toolCall.function.arguments,
      };
    }

    return {
      id: toolCall.id ?? `tool-call-${toolCall.type}`,
      name: toolCall.function.name ?? 'unknown',
      arguments: parsedArguments,
    };
  }
}
