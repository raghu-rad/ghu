import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Tool, ToolDisplayPreview, ToolExecutionResult, ToolInput } from './index.js';

export interface ReadManyFilesToolOptions {
  cwd?: string;
  defaultEncoding?: BufferEncoding;
  hashMaxBytes?: number;
  maxTotalBytes?: number;
  previewHeadFiles?: number;
  previewTailFiles?: number;
  previewMaxLabelLength?: number;
}

interface ReadManyFilesInput extends ToolInput {
  paths?: unknown;
  encoding?: unknown;
  maxBytes?: unknown;
  maxTotalBytes?: unknown;
  withMetadata?: unknown;
  baseDir?: unknown;
}

interface FileDescriptor {
  requestedPath: string;
  resolvedPath: string;
  size: number;
  modifiedAt: Date;
}

interface ReadFileResult {
  requestedPath: string;
  resolvedPath: string;
  encoding: BufferEncoding;
  size: number;
  content: string;
  modifiedAt?: string;
  sha256?: string;
}

const DEFAULT_ENCODING: BufferEncoding = 'utf8';
const DEFAULT_HASH_MAX_BYTES = 1024 * 1024 * 5; // 5 MiB cap for hashing safety
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 20; // 20 MiB aggregate safety cap
const DEFAULT_PREVIEW_HEAD_FILES = 3;
const DEFAULT_PREVIEW_TAIL_FILES = 1;
const DEFAULT_PREVIEW_MAX_LABEL_LENGTH = 80;

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

const normalizePaths = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      return undefined;
    }

    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    result.push(trimmed);
  }

  if (result.length === 0) {
    return undefined;
  }

  return result;
};

const createPreview = (
  files: ReadFileResult[],
  head: number,
  tail: number,
  maxLabelLength: number,
): ToolDisplayPreview | undefined => {
  if (files.length === 0) {
    return undefined;
  }

  const formatLabel = (file: ReadFileResult): string => {
    const label = `${file.requestedPath} (${file.size} bytes)`;
    if (label.length <= maxLabelLength) {
      return label;
    }

    return `${label.slice(0, Math.max(0, maxLabelLength - 1))}…`;
  };

  if (files.length <= head + tail) {
    return {
      lines: files.map(formatLabel),
      truncated: false,
    };
  }

  const headItems = files.slice(0, head).map(formatLabel);
  const tailItems = files.slice(-tail).map(formatLabel);

  return {
    lines: [...headItems, '…', ...tailItems],
    truncated: true,
  };
};

export class ReadManyFilesTool implements Tool {
  readonly name = 'read-many-files';
  readonly description = 'Read multiple file contents from the local filesystem.';

  readonly parameters = {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of file paths to read.',
      },
      encoding: {
        type: 'string',
        description: 'Optional file encoding (defaults to utf8).',
      },
      maxBytes: {
        type: 'number',
        description: 'Optional maximum size (in bytes) permitted per file.',
      },
      maxTotalBytes: {
        type: 'number',
        description: 'Optional maximum aggregate size (in bytes) permitted across all files.',
      },
      withMetadata: {
        type: 'boolean',
        description: 'Include file metadata such as size, mtime, and hash when true.',
      },
      baseDir: {
        type: 'string',
        description: 'Optional base directory to resolve the paths against.',
      },
    },
    required: ['paths'],
  } as const;

  private readonly cwd: string;
  private readonly defaultEncoding: BufferEncoding;
  private readonly hashMaxBytes: number;
  private readonly maxTotalBytes: number;
  private readonly previewHeadFiles: number;
  private readonly previewTailFiles: number;
  private readonly previewMaxLabelLength: number;

  constructor(options: ReadManyFilesToolOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.defaultEncoding = options.defaultEncoding ?? DEFAULT_ENCODING;
    this.hashMaxBytes = options.hashMaxBytes ?? DEFAULT_HASH_MAX_BYTES;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.previewHeadFiles = options.previewHeadFiles ?? DEFAULT_PREVIEW_HEAD_FILES;
    this.previewTailFiles = options.previewTailFiles ?? DEFAULT_PREVIEW_TAIL_FILES;
    this.previewMaxLabelLength = options.previewMaxLabelLength ?? DEFAULT_PREVIEW_MAX_LABEL_LENGTH;
  }

  async run(input: ReadManyFilesInput): Promise<ToolExecutionResult> {
    const normalizedPaths = normalizePaths(input.paths);
    if (!normalizedPaths) {
      return this.createErrorResult('Read-many-files tool requires a non-empty "paths" array of strings.', {
        paths: input.paths,
      });
    }

    const encoding = normalizeEncoding(input.encoding) ?? this.defaultEncoding;
    const baseDir = normalizeBaseDir(input.baseDir, this.cwd);
    const maxBytes = normalizeMaxBytes(input.maxBytes);
    const maxTotalBytes =
      normalizeMaxBytes(input.maxTotalBytes) ??
      (this.maxTotalBytes > 0 ? this.maxTotalBytes : undefined);
    const withMetadata = normalizeBoolean(input.withMetadata) ?? false;

    const descriptors: FileDescriptor[] = [];

    for (const requestedPath of normalizedPaths) {
      const resolvedPath = path.resolve(baseDir, requestedPath);

      let stats;
      try {
        stats = await fs.stat(resolvedPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown filesystem error.';
        return this.createErrorResult(`Unable to access file: ${message}`, {
          requestedPath,
          resolvedPath,
        });
      }

      if (!stats.isFile()) {
        return this.createErrorResult('Requested path does not point to a regular file.', {
          requestedPath,
          resolvedPath,
        });
      }

      if (typeof maxBytes === 'number' && stats.size > maxBytes) {
        return this.createErrorResult(
          `File exceeds the permitted size limit (${stats.size} bytes > ${maxBytes} bytes).`,
          {
            requestedPath,
            resolvedPath,
            size: stats.size,
            maxBytes,
          },
        );
      }

      descriptors.push({
        requestedPath,
        resolvedPath,
        size: stats.size,
        modifiedAt: stats.mtime,
      });
    }

    const totalBytes = descriptors.reduce((sum, descriptor) => sum + descriptor.size, 0);
    if (typeof maxTotalBytes === 'number' && totalBytes > maxTotalBytes) {
      return this.createErrorResult(
        `Requested files exceed the aggregate size limit (${totalBytes} bytes > ${maxTotalBytes} bytes).`,
        {
          paths: normalizedPaths,
          totalBytes,
          maxTotalBytes,
        },
      );
    }

    const files: ReadFileResult[] = [];

    for (const descriptor of descriptors) {
      let buffer: Buffer;
      try {
        buffer = await fs.readFile(descriptor.resolvedPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown file read error.';
        return this.createErrorResult(`Failed to read file: ${message}`, {
          requestedPath: descriptor.requestedPath,
          resolvedPath: descriptor.resolvedPath,
        });
      }

      const content = buffer.toString(encoding);

      const fileResult: ReadFileResult = {
        requestedPath: descriptor.requestedPath,
        resolvedPath: descriptor.resolvedPath,
        encoding,
        size: descriptor.size,
        content,
      };

      if (withMetadata) {
        fileResult.modifiedAt = descriptor.modifiedAt.toISOString();

        if (descriptor.size <= this.hashMaxBytes) {
          try {
            fileResult.sha256 = createHash('sha256').update(buffer).digest('hex');
          } catch {
            fileResult.sha256 = 'unavailable';
          }
        } else {
          fileResult.sha256 = 'skipped (file too large)';
        }
      }

      files.push(fileResult);
    }

    const outputPayload = {
      files: files.map(({ content, ...rest }) => ({
        ...rest,
        content,
      })),
      summary: {
        fileCount: files.length,
        totalBytes,
        encoding,
      },
    };

    return {
      output: JSON.stringify(outputPayload),
      display: {
        message: `Read ${files.length} file${files.length === 1 ? '' : 's'} successfully.`,
        tone: 'success',
        metadata: {
          fileCount: files.length,
          totalBytes,
          encoding,
        },
        preview: createPreview(files, this.previewHeadFiles, this.previewTailFiles, this.previewMaxLabelLength),
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
