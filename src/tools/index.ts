export interface ToolInput {
  [key: string]: unknown;
}

export type ToolDisplayTone = 'info' | 'success' | 'warning' | 'error';

export type ToolDisplayPreviewLineTone = 'addition' | 'deletion' | 'info';

export interface ToolDisplayPreviewLine {
  text: string;
  tone?: ToolDisplayPreviewLineTone;
}

export interface ToolDisplayPreview {
  lines: Array<string | ToolDisplayPreviewLine>;
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

import { ReadFileTool, type ReadFileToolOptions } from './read-file.js';
import { ReadFilesTool, type ReadFilesToolOptions } from './read-files.js';
import { WriteFileTool, type WriteFileToolOptions } from './write-file.js';
import { ShellTool, type ShellToolOptions } from './shell/index.js';

export { ReadFileTool } from './read-file.js';
export type { ReadFileToolOptions } from './read-file.js';
export { ReadFilesTool } from './read-files.js';
export type { ReadFilesToolOptions } from './read-files.js';
export { WriteFileTool } from './write-file.js';
export type { WriteFileToolOptions } from './write-file.js';
export { ShellTool } from './shell/index.js';
export type { ShellToolOptions } from './shell/index.js';

export interface ToolRegistryOptions {
  includeShell?: boolean;
  shell?: ShellToolOptions;
  includeReadFile?: boolean;
  readFile?: ReadFileToolOptions;
  includeReadFiles?: boolean;
  readFiles?: ReadFilesToolOptions;
  includeWriteFile?: boolean;
  writeFile?: WriteFileToolOptions;
}

export function createDefaultToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();

  if (options.includeReadFile ?? true) {
    registry.register(new ReadFileTool(options.readFile));
  }

  if (options.includeReadFiles ?? true) {
    registry.register(new ReadFilesTool(options.readFiles));
  }

  if (options.includeWriteFile ?? true) {
    registry.register(new WriteFileTool(options.writeFile));
  }

  if (options.includeShell ?? true) {
    registry.register(new ShellTool(options.shell));
  }

  return registry;
}
