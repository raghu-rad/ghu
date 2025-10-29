import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReadManyFilesTool } from '../../src/tools/read-many-files.js';

let tempDir: string;

const createTempDir = async (): Promise<string> => {
  const prefix = path.join(tmpdir(), 'read-many-files-tool-');
  return mkdtemp(prefix);
};

beforeEach(async () => {
  tempDir = await createTempDir();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('ReadManyFilesTool', () => {
  it('reads multiple files and returns their contents', async () => {
    const firstPath = path.join(tempDir, 'one.txt');
    const secondPath = path.join(tempDir, 'two.txt');
    await writeFile(firstPath, 'first file', 'utf8');
    await writeFile(secondPath, 'second file', 'utf8');

    const tool = new ReadManyFilesTool();
    const result = await tool.run({ paths: [firstPath, secondPath] });

    expect(result.error).toBeUndefined();

    const payload = JSON.parse(result.output) as {
      files: Array<Record<string, unknown>>;
      summary: Record<string, unknown>;
    };
    expect(payload.files).toHaveLength(2);

    const contents = payload.files.map((file) => file.content);
    expect(contents).toContain('first file');
    expect(contents).toContain('second file');

    expect(payload.summary?.fileCount).toBe(2);

    const metadata = result.display?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.fileCount).toBe(2);
  });

  it('resolves relative paths using the provided base directory', async () => {
    const nestedDir = path.join(tempDir, 'nested');
    await mkdir(nestedDir);
    await writeFile(path.join(nestedDir, 'a.txt'), 'alpha', 'utf8');
    await writeFile(path.join(nestedDir, 'b.txt'), 'beta', 'utf8');

    const tool = new ReadManyFilesTool();
    const result = await tool.run({ paths: ['a.txt', 'b.txt'], baseDir: nestedDir });

    expect(result.error).toBeUndefined();
    const payload = JSON.parse(result.output) as { files: Array<Record<string, unknown>> };
    const resolvedPaths = payload.files.map((file) => file.resolvedPath);
    expect(resolvedPaths).toContain(path.join(nestedDir, 'a.txt'));
    expect(resolvedPaths).toContain(path.join(nestedDir, 'b.txt'));
  });

  it('enforces per-file size limits when provided', async () => {
    const filePath = path.join(tempDir, 'big.txt');
    await writeFile(filePath, '1234567890', 'utf8');

    const tool = new ReadManyFilesTool();
    const result = await tool.run({ paths: [filePath], maxBytes: 4 });

    expect(result.error).toContain('exceeds the permitted size limit');
    expect(result.display?.tone).toBe('error');
  });

  it('enforces aggregate size limits when provided', async () => {
    const firstPath = path.join(tempDir, 'small.txt');
    const secondPath = path.join(tempDir, 'small-2.txt');
    await writeFile(firstPath, 'abc', 'utf8');
    await writeFile(secondPath, 'def', 'utf8');

    const tool = new ReadManyFilesTool();
    const result = await tool.run({ paths: [firstPath, secondPath], maxTotalBytes: 5 });

    expect(result.error).toContain('aggregate size limit');
    expect(result.display?.tone).toBe('error');
  });

  it('returns metadata including SHA-256 hashes when requested', async () => {
    const filePath = path.join(tempDir, 'hash.txt');
    const content = 'hash me';
    await writeFile(filePath, content, 'utf8');

    const tool = new ReadManyFilesTool();
    const result = await tool.run({ paths: [filePath], withMetadata: true });

    expect(result.error).toBeUndefined();

    const payload = JSON.parse(result.output) as { files: Array<Record<string, unknown>> };
    const [fileEntry] = payload.files;
    expect(fileEntry.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect(typeof fileEntry.modifiedAt).toBe('string');
  });

  it('returns an error when any path does not exist', async () => {
    const missingPath = path.join(tempDir, 'missing.txt');

    const tool = new ReadManyFilesTool();
    const result = await tool.run({ paths: [missingPath] });

    expect(result.error).toContain('Unable to access file');
    expect(result.display?.tone).toBe('error');
  });

  it('returns an error when the input paths array is invalid', async () => {
    const tool = new ReadManyFilesTool();
    const result = await tool.run({ paths: ['  ', 123] as unknown as string[] });

    expect(result.error).toContain('requires a non-empty "paths" array of strings');
    expect(result.display?.tone).toBe('error');
  });
});
