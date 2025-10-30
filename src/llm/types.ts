export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: LLMRole;
  content: string;
  name?: string;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

export interface ToolSpecification {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolSpecification[];
}

export interface LLMResponse {
  message: LLMMessage;
  toolCalls?: LLMToolCall[];
}

export interface LLMClient {
  generate(messages: LLMMessage[], options?: GenerateOptions): Promise<LLMResponse>;
}
