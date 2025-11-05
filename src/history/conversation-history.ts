import type { LLMMessage, LLMResponse, LLMToolCall } from '../llm/index.js';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ConversationHistoryState {
  entries: LLMMessage[];
  tokenUsage: TokenUsage;
}

const DEFAULT_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

export class ConversationHistory {
  private readonly entries: LLMMessage[];
  private tokenUsage: TokenUsage;

  constructor(initialEntries: LLMMessage[] = [], tokenUsage: TokenUsage = DEFAULT_USAGE) {
    this.entries = initialEntries.map((entry) => ConversationHistory.cloneMessage(entry));
    this.tokenUsage = { ...tokenUsage };
  }

  clear(): void {
    this.entries.length = 0;
    this.tokenUsage = { ...DEFAULT_USAGE };
  }

  appendUser(content: string): LLMMessage {
    return this.appendMessage({ role: 'user', content });
  }

  appendAssistant(content: string, toolCalls?: LLMToolCall[]): LLMMessage {
    const message: LLMMessage = {
      role: 'assistant',
      content,
      ...(toolCalls ? { toolCalls } : {}),
    };
    return this.appendMessage(message);
  }

  appendToolMessage(message: Omit<LLMMessage, 'role'> & { role?: 'tool' }): LLMMessage {
    const toolMessage: LLMMessage = {
      role: 'tool',
      ...message,
    };
    return this.appendMessage(toolMessage);
  }

  appendMessage(message: LLMMessage): LLMMessage {
    const stored = ConversationHistory.cloneMessage(message);
    this.entries.push(stored);
    return stored;
  }

  registerLLMResponse(response: LLMResponse): LLMMessage {
    const toolCalls = response.toolCalls ?? response.message.toolCalls;

    const assistantMessage: LLMMessage = {
      ...response.message,
      role: 'assistant',
      ...(toolCalls ? { toolCalls } : {}),
    };

    const storedMessage = this.appendMessage(assistantMessage);
    if (response.usage) {
      this.tokenUsage = {
        promptTokens: response.usage.promptTokens ?? DEFAULT_USAGE.promptTokens,
        completionTokens: response.usage.completionTokens ?? DEFAULT_USAGE.completionTokens,
        totalTokens:
          response.usage.totalTokens ??
          (response.usage.promptTokens ?? 0) + (response.usage.completionTokens ?? 0),
      };
    }

    return storedMessage;
  }

  getMessages(): LLMMessage[] {
    return this.entries.map((entry) => ConversationHistory.cloneMessage(entry));
  }

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  getContextTokenCount(): number {
    return this.tokenUsage.promptTokens;
  }

  serialize(): ConversationHistoryState {
    return {
      entries: this.getMessages(),
      tokenUsage: this.getTokenUsage(),
    };
  }

  static deserialize(state: ConversationHistoryState): ConversationHistory {
    return new ConversationHistory(state.entries, state.tokenUsage);
  }

  private static cloneMessage(message: LLMMessage): LLMMessage {
    const cloned: LLMMessage = {
      role: message.role,
      content: message.content,
    };

    if (message.name) {
      cloned.name = message.name;
    }

    if (message.toolCallId) {
      cloned.toolCallId = message.toolCallId;
    }

    if (message.toolCalls) {
      cloned.toolCalls = message.toolCalls.map((toolCall) => ({ ...toolCall }));
    }

    return cloned;
  }
}
