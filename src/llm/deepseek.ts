import type { GenerateOptions, LLMClient, LLMMessage } from './index.js';

export interface DeepSeekClientOptions {
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

interface DeepSeekChatCompletionChoice {
  index: number;
  message: {
    role: LLMMessage['role'];
    content: string;
  };
  finish_reason: string;
}

interface DeepSeekChatCompletionResponse {
  choices: DeepSeekChatCompletionChoice[];
}

export class DeepSeekLLMClient implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(options: DeepSeekClientOptions) {
    if (!options.apiKey) {
      throw new Error('DEEPSEEK_API_KEY environment variable is required for DeepSeek provider.');
    }

    this.apiKey = options.apiKey;
    this.model = options.model;
    const baseUrl = options.baseUrl?.replace(/\/$/, '') ?? 'https://api.deepseek.com';
    this.endpoint = `${baseUrl}/chat/completions`;
  }

  async generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMMessage> {
    const payload = {
      model: this.model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: false,
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as DeepSeekChatCompletionResponse;
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('DeepSeek API returned no completion choices.');
    }

    return {
      role: choice.message.role,
      content: choice.message.content,
    };
  }
}
