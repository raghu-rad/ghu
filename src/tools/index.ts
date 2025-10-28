export interface ToolInput {
  [key: string]: unknown;
}

export type ToolDisplayTone = 'info' | 'success' | 'warning' | 'error';

export interface ToolDisplayPreview {
  lines: string[];
  truncated?: boolean;
  label?: string;
}

export interface ToolDisplay {
  message: string;
  tone?: ToolDisplayTone;
  details?: string;
  metadata?: Record<string, unknown>;
  preview?: ToolDisplayPreview;
}

export interface ToolExecutionResult {
  output: string;
  error?: string;
  display?: ToolDisplay;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  run(input: ToolInput): Promise<ToolExecutionResult>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}

import { ShellTool, type ShellToolOptions } from './shell.js';

export interface ToolRegistryOptions {
  includeShell?: boolean;
  shell?: ShellToolOptions;
}

export function createDefaultToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();

  if (options.includeShell ?? true) {
    registry.register(new ShellTool(options.shell));
  }

  return registry;
}
