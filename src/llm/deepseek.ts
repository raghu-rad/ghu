import OpenAI from 'openai';

import type {
  GenerateOptions,
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMToolCall,
  ToolSpecification,
} from './index.js';

export interface DeepSeekClientOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export class DeepSeekLLMClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: DeepSeekClientOptions) {
    if (!options.apiKey) {
      throw new Error('DEEPSEEK_API_KEY environment variable is required for DeepSeek provider.');
    }

    const baseURL = options.baseUrl?.replace(/\/$/, '') ?? 'https://api.deepseek.com';

    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL,
    });
    this.model = options.model;
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
        throw new Error('DeepSeek API returned no completion choices.');
      }

      const toolCalls = choice.message.tool_calls?.map((call) => this.parseToolCall(call));

      const message: LLMMessage = {
        role: (choice.message.role as LLMMessage['role']) ?? 'assistant',
        content: choice.message.content ?? '',
        toolCalls,
      };

      return {
        message,
        toolCalls,
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const status = error.status ?? 'unknown';
        throw new Error(`DeepSeek API error (${status}): ${error.message}`);
      }

      if (error instanceof Error) {
        throw new Error(`DeepSeek API error: ${error.message}`);
      }

      throw new Error('DeepSeek API error: Unknown error');
    }
  }

  private mapMessage(message: LLMMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }

    const base: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: message.role,
      content: message.content,
    };

    if (message.name) {
      base.name = message.name;
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      base.tool_calls = message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function' as const,
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments ?? {}),
        },
      }));
    }

    return base;
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

  private parseToolCall(toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall): LLMToolCall {
    let parsedArguments: Record<string, unknown> = {};
    try {
      parsedArguments = toolCall.function.arguments
        ? JSON.parse(toolCall.function.arguments)
        : {};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error';
      parsedArguments = {
        __parse_error: message,
        raw: toolCall.function.arguments,
      };
    }

    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: parsedArguments,
    };
  }
}
