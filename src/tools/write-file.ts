import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  Tool,
  ToolDisplayPreview,
  ToolDisplayPreviewLine,
  ToolExecutionResult,
  ToolInput,
} from './index.js';

export interface WriteFileToolOptions {
  cwd?: string;
  defaultEncoding?: BufferEncoding;
  previewHeadLines?: number;
  previewTailLines?: number;
  previewMaxContentLength?: number;
  ensureTrailingNewline?: boolean;
}

interface WriteFileInput extends ToolInput {
  path?: unknown;
  baseDir?: unknown;
  encoding?: unknown;
  ensureTrailingNewline?: unknown;
  operations?: unknown;
}

type NormalizedOperation = NormalizedInsertOperation | NormalizedDeleteOperation;

interface NormalizedInsertOperation {
  kind: 'insert';
  line: number | null;
  lines: string[];
}

interface NormalizedDeleteOperation {
  kind: 'delete';
  line: number;
  count: number;
}

interface RecordedChange {
  kind: 'addition' | 'deletion';
  lineNumber: number;
  content: string;
}

interface ErrorResultDetails {
  message: string;
  details?: Record<string, unknown>;
}

const DEFAULT_ENCODING: BufferEncoding = 'utf8';
const DEFAULT_PREVIEW_HEAD_LINES = 6;
const DEFAULT_PREVIEW_TAIL_LINES = 4;
const DEFAULT_PREVIEW_MAX_CONTENT_LENGTH = 120;
const DEFAULT_ENSURE_TRAILING_NEWLINE = true;

export class WriteFileTool implements Tool {
  readonly name = 'write-file';
  readonly description = 'Modify a local file by inserting or deleting specific lines.';

  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to update.' },
      baseDir: {
        type: 'string',
        description: 'Optional base directory used to resolve the provided path.',
      },
      encoding: {
        type: 'string',
        description: 'Optional file encoding used for reading and writing (defaults to utf8).',
      },
      ensureTrailingNewline: {
        type: 'boolean',
        description: 'Ensure the file ends with a newline when true (defaults to true).',
      },
      operations: {
        type: 'array',
        description: 'Ordered list of operations to apply to the file.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['insert', 'delete'],
              description: 'Operation type: insert or delete.',
            },
            line: {
              type: 'number',
              description:
                '1-based line number. Required for delete operations and optional for inserts (appends when omitted).',
            },
            count: {
              type: 'number',
              description: 'Number of lines to delete (defaults to 1 for delete operations).',
            },
            content: {
              type: 'string',
              description: 'Text content to insert. Required for insert operations.',
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['path', 'operations'],
  } as const;

  private readonly cwd: string;
  private readonly defaultEncoding: BufferEncoding;
  private readonly previewHeadLines: number;
  private readonly previewTailLines: number;
  private readonly previewMaxContentLength: number;
  private readonly ensureTrailingNewline: boolean;

  constructor(options: WriteFileToolOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.defaultEncoding = options.defaultEncoding ?? DEFAULT_ENCODING;
    this.previewHeadLines = options.previewHeadLines ?? DEFAULT_PREVIEW_HEAD_LINES;
    this.previewTailLines = options.previewTailLines ?? DEFAULT_PREVIEW_TAIL_LINES;
    this.previewMaxContentLength =
      options.previewMaxContentLength ?? DEFAULT_PREVIEW_MAX_CONTENT_LENGTH;
    this.ensureTrailingNewline = options.ensureTrailingNewline ?? DEFAULT_ENSURE_TRAILING_NEWLINE;
  }

  async run(input: WriteFileInput): Promise<ToolExecutionResult> {
    const rawPath = input.path;
    if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
      return this.createErrorResult('Write-file tool requires a non-empty "path" string.', {
        path: rawPath,
      });
    }

    const baseDir = typeof input.baseDir === 'string' && input.baseDir.trim().length > 0
      ? input.baseDir
      : this.cwd;
    const resolvedPath = path.resolve(baseDir, rawPath);

    const encoding = this.normalizeEncoding(input.encoding) ?? this.defaultEncoding;
    let operations: NormalizedOperation[];
    try {
      operations = this.normalizeOperations(input.operations);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid operations input.';
      return this.createErrorResult(message, { operations: input.operations });
    }

    if (!operations.length) {
      return this.createErrorResult('Write-file tool requires at least one operation to execute.', {
        operations: input.operations,
      });
    }

    const ensureTrailingNewline =
      this.normalizeBoolean(input.ensureTrailingNewline) ?? this.ensureTrailingNewline;

    let fileContent = '';
    let fileExists = true;
    try {
      fileContent = await fs.readFile(resolvedPath, { encoding });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        fileExists = false;
        fileContent = '';
      } else {
        const message = error instanceof Error ? error.message : 'Unknown filesystem error.';
        return this.createErrorResult(`Unable to read target file: ${message}`, {
          path: rawPath,
          resolvedPath,
        });
      }
    }

    const { lines, hadTrailingNewline } = this.splitIntoLines(fileContent);
    const changes: RecordedChange[] = [];

    for (const operation of operations) {
      if (operation.kind === 'delete') {
        const deleteResult = this.applyDeleteOperation(operation, lines, changes);
        if (!deleteResult.ok) {
          return this.createErrorResult(deleteResult.message, {
            path: rawPath,
            resolvedPath,
            line: operation.line,
            count: operation.count,
          });
        }
        continue;
      }

      this.applyInsertOperation(operation, lines, changes);
    }

    if (!changes.length) {
      return this.createErrorResult('No changes were applied to the file.', {
        path: rawPath,
        resolvedPath,
      });
    }

    const additions = changes.filter((change) => change.kind === 'addition').length;
    const deletions = changes.filter((change) => change.kind === 'deletion').length;

    const targetDir = path.dirname(resolvedPath);
    try {
      await fs.mkdir(targetDir, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown filesystem error.';
      return this.createErrorResult(`Unable to prepare target directory: ${message}`, {
        path: rawPath,
        resolvedPath,
      });
    }

    const finalContent = this.combineLines(
      lines,
      ensureTrailingNewline ? true : hadTrailingNewline,
    );

    try {
      await fs.writeFile(resolvedPath, finalContent, { encoding });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown filesystem error.';
      return this.createErrorResult(`Unable to write file: ${message}`, {
        path: rawPath,
        resolvedPath,
      });
    }

    const message = this.createSuccessMessage(fileExists, additions, deletions);
    const preview = this.createPreview(changes);

    return {
      output: finalContent,
      display: {
        message,
        tone: 'success',
        metadata: {
          path: resolvedPath,
          additions,
          deletions,
          created: fileExists ? undefined : true,
        },
        preview,
      },
    };
  }

  private normalizeEncoding(value: unknown): BufferEncoding | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed as BufferEncoding;
  }

  private normalizeBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  private normalizeOperations(raw: unknown): NormalizedOperation[] {
    if (!Array.isArray(raw)) {
      throw new Error('Write-file tool requires an "operations" array.');
    }

    const operations: NormalizedOperation[] = [];

    raw.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Operation at index ${index} must be an object.`);
      }

      const candidate = entry as Record<string, unknown>;
      const type = typeof candidate.type === 'string' ? candidate.type.trim().toLowerCase() : '';

      if (type !== 'insert' && type !== 'delete') {
        throw new Error(`Operation at index ${index} must specify type "insert" or "delete".`);
      }

      if (type === 'insert') {
        const content = candidate.content;
        if (typeof content !== 'string') {
          throw new Error(`Insert operation at index ${index} requires a string "content" value.`);
        }

        const normalizedLine = this.normalizePositiveInteger(candidate.line);
        const lines = this.splitInsertContent(content);

        if (!lines.length) {
          throw new Error(`Insert operation at index ${index} produced no lines to add.`);
        }

        operations.push({
          kind: 'insert',
          line: normalizedLine ?? null,
          lines,
        });
        return;
      }

      const line = this.normalizePositiveInteger(candidate.line);
      if (!line) {
        throw new Error(`Delete operation at index ${index} requires a positive integer "line".`);
      }

      const count = this.normalizePositiveInteger(candidate.count) ?? 1;
      operations.push({
        kind: 'delete',
        line,
        count,
      });
    });

    return operations;
  }

  private normalizePositiveInteger(value: unknown): number | undefined {
    if (typeof value !== 'number') {
      return undefined;
    }
    if (!Number.isInteger(value) || value <= 0) {
      return undefined;
    }
    return value;
  }

  private splitInsertContent(content: string): string[] {
    const normalized = content.replace(/\r\n/g, '\n');
    if (normalized.length === 0) {
      return [''];
    }

    const segments = normalized.split('\n');
    if (normalized.endsWith('\n')) {
      segments.pop();
    }

    return segments.length ? segments : [''];
  }

  private splitIntoLines(content: string): { lines: string[]; hadTrailingNewline: boolean } {
    if (!content) {
      return { lines: [], hadTrailingNewline: false };
    }

    const normalized = content.replace(/\r\n/g, '\n');
    const hadTrailingNewline = normalized.endsWith('\n');
    const segments = normalized.split('\n');

    if (hadTrailingNewline) {
      segments.pop();
    }

    if (segments.length === 1 && segments[0] === '') {
      return { lines: [], hadTrailingNewline };
    }

    return {
      lines: segments,
      hadTrailingNewline,
    };
  }

  private applyDeleteOperation(
    operation: NormalizedDeleteOperation,
    lines: string[],
    changes: RecordedChange[],
  ): ErrorResultDetails | { ok: true } {
    const { line, count } = operation;
    const startIndex = line - 1;

    if (startIndex < 0 || startIndex >= lines.length) {
      return {
        message: `Delete operation targets line ${line}, but the file only has ${lines.length} line(s).`,
      };
    }

    if (count > lines.length - startIndex) {
      return {
        message: `Delete operation removes ${count} line(s) from ${line}, but only ${lines.length - startIndex} line(s) are available.`,
      };
    }

    for (let i = 0; i < count; i += 1) {
      const removed = lines.splice(startIndex, 1)[0] ?? '';
      changes.push({
        kind: 'deletion',
        lineNumber: line + i,
        content: removed,
      });
    }

    return { ok: true };
  }

  private applyInsertOperation(
    operation: NormalizedInsertOperation,
    lines: string[],
    changes: RecordedChange[],
  ): void {
    const { line, lines: contentLines } = operation;
    let insertionIndex = typeof line === 'number' ? Math.max(0, line - 1) : lines.length;
    insertionIndex = Math.min(insertionIndex, lines.length);

    for (const content of contentLines) {
      lines.splice(insertionIndex, 0, content);
      changes.push({
        kind: 'addition',
        lineNumber: insertionIndex + 1,
        content,
      });
      insertionIndex += 1;
    }
  }

  private combineLines(lines: string[], ensureTrailingNewline: boolean): string {
    if (!lines.length) {
      return '';
    }

    const combined = lines.join('\n');
    if (ensureTrailingNewline) {
      return `${combined}\n`;
    }
    return combined;
  }

  private createSuccessMessage(fileExists: boolean, additions: number, deletions: number): string {
    const changeParts: string[] = [];
    if (additions) {
      changeParts.push(`${additions} addition${additions === 1 ? '' : 's'}`);
    }
    if (deletions) {
      changeParts.push(`${deletions} deletion${deletions === 1 ? '' : 's'}`);
    }

    const summary = changeParts.length ? ` (${changeParts.join(', ')})` : '';
    return fileExists ? `Updated file${summary}.` : `Created file${summary}.`;
  }

  private createPreview(changes: RecordedChange[]): ToolDisplayPreview | undefined {
    if (!changes.length) {
      return undefined;
    }

    const maxLineNumber = Math.max(...changes.map((change) => change.lineNumber));
    const lineNumberWidth = Math.max(2, maxLineNumber.toString().length);

    const formatted = changes.map<ToolDisplayPreviewLine>((change) => {
      const prefix = change.kind === 'addition' ? '+' : '-';
      const tone = change.kind === 'addition' ? 'addition' : 'deletion';
      const paddedLine = change.lineNumber.toString().padStart(lineNumberWidth, ' ');
      const content = this.formatPreviewContent(change.content);

      return {
        text: `${prefix} ${paddedLine} | ${content}`,
        tone,
      };
    });

    const headCount = Math.min(this.previewHeadLines, formatted.length);
    const tailCount = Math.min(this.previewTailLines, Math.max(0, formatted.length - headCount));

    if (headCount + tailCount >= formatted.length) {
      return {
        lines: formatted,
        truncated: false,
      };
    }

    const omitted = formatted.length - headCount - tailCount;
    const summary: ToolDisplayPreviewLine = {
      text: `… ${omitted} more change${omitted === 1 ? '' : 's'} …`,
      tone: 'info',
    };

    return {
      lines: [...formatted.slice(0, headCount), summary, ...formatted.slice(-tailCount)],
      truncated: true,
    };
  }

  private formatPreviewContent(content: string): string {
    if (content.length === 0) {
      return '[blank]';
    }

    const sanitized = content.replace(/\t/g, '\\t');
    if (sanitized.length <= this.previewMaxContentLength) {
      return sanitized;
    }

    return `${sanitized.slice(0, Math.max(0, this.previewMaxContentLength - 1))}…`;
  }

  private createErrorResult(message: string, metadata?: Record<string, unknown>): ToolExecutionResult {
    return {
      output: '',
      error: message,
      display: {
        message,
        tone: 'error',
        metadata,
      },
    };
  }
}
