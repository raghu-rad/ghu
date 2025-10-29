import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Tool, ToolDisplayPreview, ToolExecutionResult, ToolInput } from './index.js';

export interface ReadFileToolOptions {
  cwd?: string;
  defaultEncoding?: BufferEncoding;
  hashMaxBytes?: number;
  previewHeadLines?: number;
  previewTailLines?: number;
  previewMaxLineLength?: number;
}

interface ReadFileInput extends ToolInput {
  path?: unknown;
  encoding?: unknown;
  maxBytes?: unknown;
  withMetadata?: unknown;
  baseDir?: unknown;
}

const DEFAULT_ENCODING: BufferEncoding = 'utf8';
const DEFAULT_HASH_MAX_BYTES = 1024 * 1024 * 5; // 5 MiB safety cap for hashing
const DEFAULT_PREVIEW_HEAD_LINES = 5;
const DEFAULT_PREVIEW_TAIL_LINES = 2;
const DEFAULT_PREVIEW_MAX_LINE_LENGTH = 160;

const normalizeEncoding = (value: unknown): BufferEncoding | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed as BufferEncoding;
};

const normalizeBaseDir = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  return value;
};

const normalizeMaxBytes = (value: unknown): number | undefined => {
  if (typeof value !== 'number') {
    return undefined;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.floor(value);
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
};

const createOutputPreview = (
  content: string,
  headLines: number,
  tailLines: number,
  maxLineLength: number,
): ToolDisplayPreview | undefined => {
  if (content.trim().length === 0) {
    return undefined;
  }

  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\r$/u, ''))
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return undefined;
  }

  const trimLine = (line: string): string => {
    const trimmed = line.trimEnd();
    if (trimmed.length <= maxLineLength) {
      return trimmed;
    }
    return `${trimmed.slice(0, Math.max(0, maxLineLength - 1))}…`;
  };

  const limit = headLines + tailLines;
  if (lines.length <= limit) {
    return {
      lines: lines.map(trimLine),
      truncated: false,
    };
  }

  const head = lines.slice(0, headLines).map(trimLine);
  const tail = lines.slice(-tailLines).map(trimLine);

  return {
    lines: [...head, '…', ...tail],
    truncated: true,
  };
};

export class ReadFileTool implements Tool {
  readonly name = 'read-file';
  readonly description = 'Read file contents from the local filesystem.';

  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to read.' },
      encoding: {
        type: 'string',
        description: 'Optional file encoding (defaults to utf8).',
      },
      maxBytes: {
        type: 'number',
        description: 'Optional maximum size (in bytes) permitted for the file.',
      },
      withMetadata: {
        type: 'boolean',
        description: 'Include file metadata such as size, mtime, and hash when true.',
      },
      baseDir: {
        type: 'string',
        description: 'Optional base directory to resolve the path against.',
      },
    },
    required: ['path'],
  } as const;

  private readonly cwd: string;
  private readonly defaultEncoding: BufferEncoding;
  private readonly hashMaxBytes: number;
  private readonly previewHeadLines: number;
  private readonly previewTailLines: number;
  private readonly previewMaxLineLength: number;

  constructor(options: ReadFileToolOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.defaultEncoding = options.defaultEncoding ?? DEFAULT_ENCODING;
    this.hashMaxBytes = options.hashMaxBytes ?? DEFAULT_HASH_MAX_BYTES;
    this.previewHeadLines = options.previewHeadLines ?? DEFAULT_PREVIEW_HEAD_LINES;
    this.previewTailLines = options.previewTailLines ?? DEFAULT_PREVIEW_TAIL_LINES;
    this.previewMaxLineLength = options.previewMaxLineLength ?? DEFAULT_PREVIEW_MAX_LINE_LENGTH;
  }

  async run(input: ReadFileInput): Promise<ToolExecutionResult> {
    const rawPath = input.path;
    if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
      return this.createErrorResult('Read-file tool requires a non-empty "path" string.', {
        path: rawPath,
      });
    }

    const encoding = normalizeEncoding(input.encoding) ?? this.defaultEncoding;
    const baseDir = normalizeBaseDir(input.baseDir, this.cwd);
    const maxBytes = normalizeMaxBytes(input.maxBytes);
    const withMetadata = normalizeBoolean(input.withMetadata) ?? false;

    const resolvedPath = path.resolve(baseDir, rawPath);

    let stats;
    try {
      stats = await fs.stat(resolvedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown filesystem error.';
      return this.createErrorResult(`Unable to access file: ${message}`, {
        path: rawPath,
        resolvedPath,
      });
    }

    if (!stats.isFile()) {
      return this.createErrorResult('Requested path does not point to a regular file.', {
        path: rawPath,
        resolvedPath,
      });
    }

    if (typeof maxBytes === 'number' && stats.size > maxBytes) {
      return this.createErrorResult(
        `File exceeds the permitted size limit (${stats.size} bytes > ${maxBytes} bytes).`,
        {
          path: rawPath,
          resolvedPath,
          size: stats.size,
          maxBytes,
        },
      );
    }

    let content: string;
    try {
      content = await fs.readFile(resolvedPath, { encoding });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown file read error.';
      return this.createErrorResult(`Failed to read file: ${message}`, {
        path: rawPath,
        resolvedPath,
      });
    }

    const displayMetadata: Record<string, unknown> = {
      path: resolvedPath,
      encoding,
      size: stats.size,
    };

    if (withMetadata) {
      displayMetadata.modifiedAt = stats.mtime.toISOString();

      if (stats.size <= this.hashMaxBytes) {
        try {
          const buffer = await fs.readFile(resolvedPath);
          const hash = createHash('sha256').update(buffer).digest('hex');
          displayMetadata.sha256 = hash;
        } catch {
          displayMetadata.sha256 = 'unavailable';
        }
      } else {
        displayMetadata.sha256 = 'skipped (file too large)';
      }
    }

    const preview = createOutputPreview(
      content,
      this.previewHeadLines,
      this.previewTailLines,
      this.previewMaxLineLength,
    );

    return {
      output: content,
      display: {
        message: 'File read successfully.',
        tone: 'success',
        metadata: displayMetadata,
        preview,
      },
    };
  }

  private createErrorResult(
    message: string,
    metadata?: Record<string, unknown>,
  ): ToolExecutionResult {
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
