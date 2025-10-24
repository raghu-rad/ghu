import type { LLMMessage } from '../llm/index.js';
import type { Tool } from '../tools/index.js';

export interface PromptContext {
  systemPrompt: string;
  history: LLMMessage[];
  tools?: Tool[];
}

export class PromptBuilder {
  build({ systemPrompt, history, tools }: PromptContext): LLMMessage[] {
    const conversation: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    if (tools && tools.length > 0) {
      conversation.push({ role: 'system', content: this.composeToolInstructions(tools) });
    }

    conversation.push(...history);

    return conversation;
  }

  private composeToolInstructions(tools: Tool[]): string {
    const header =
      'You can choose to call tools when helpful. To call a tool, respond with JSON: {"tool":"name","input":{...}} and no other text. After receiving tool output, reply to the user.';

    const toolDetails = tools
      .map((tool) => {
        const parameters = JSON.stringify(tool.parameters, null, 2);
        return `Tool: ${tool.name}\nDescription: ${tool.description}\nParameters: ${parameters}`;
      })
      .join('\n\n');

    return `${header}\n\nAvailable tools:\n${toolDetails}`;
  }
}
