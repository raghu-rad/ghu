import OpenAI from 'openai';

import type { GenerateOptions, LLMClient, LLMMessage } from './index.js';

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

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMMessage> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          name: message.name,
        })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      });

      const choice = completion.choices?.[0];

      if (!choice || !choice.message) {
        throw new Error('DeepSeek API returned no completion choices.');
      }

      return {
        role: (choice.message.role as LLMMessage['role']) ?? 'assistant',
        content: choice.message.content ?? '',
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
}
