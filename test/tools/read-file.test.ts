import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReadFileTool } from '../../src/tools/read-file.js';

let tempDir: string;

const createTempDir = async (): Promise<string> => {
  const prefix = path.join(tmpdir(), 'read-file-tool-');
  return mkdtemp(prefix);
};

beforeEach(async () => {
  tempDir = await createTempDir();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('ReadFileTool', () => {
  it('reads a UTF-8 file and returns its contents', async () => {
    const filePath = path.join(tempDir, 'note.txt');
    await writeFile(filePath, 'hello world', 'utf8');

    const tool = new ReadFileTool();
    const result = await tool.run({ path: filePath });

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('hello world');
    expect(result.display?.tone).toBe('success');

    const metadata = result.display?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.path).toBe(filePath);
    expect(metadata?.size).toBe(11);
  });

  it('resolves relative paths using the provided base directory', async () => {
    const nestedDir = path.join(tempDir, 'nested');
    await mkdir(nestedDir);
    await writeFile(path.join(nestedDir, 'message.txt'), 'hi there');

    const tool = new ReadFileTool();
    const result = await tool.run({ path: 'message.txt', baseDir: nestedDir });

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('hi there');

    const metadata = result.display?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.path).toBe(path.join(nestedDir, 'message.txt'));
  });

  it('returns an error when the file exceeds the provided size limit', async () => {
    const filePath = path.join(tempDir, 'big.txt');
    await writeFile(filePath, 'too large', 'utf8');

    const tool = new ReadFileTool();
    const result = await tool.run({ path: filePath, maxBytes: 4 });

    expect(result.error).toContain('exceeds the permitted size limit');
    expect(result.display?.tone).toBe('error');
  });

  it('returns metadata including SHA-256 hash when requested', async () => {
    const content = 'hash me';
    const filePath = path.join(tempDir, 'hash.txt');
    await writeFile(filePath, content, 'utf8');

    const tool = new ReadFileTool();
    const result = await tool.run({ path: filePath, withMetadata: true });

    expect(result.error).toBeUndefined();
    const metadata = result.display?.metadata as Record<string, unknown> | undefined;
    const expectedHash = createHash('sha256').update(content).digest('hex');
    expect(metadata?.sha256).toBe(expectedHash);
  });

  it('skips hashing when the file exceeds the hash size cap', async () => {
    const filePath = path.join(tempDir, 'large.txt');
    await writeFile(filePath, '1234567890', 'utf8');

    const tool = new ReadFileTool({ hashMaxBytes: 5 });
    const result = await tool.run({ path: filePath, withMetadata: true });

    const metadata = result.display?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.sha256).toBe('skipped (file too large)');
  });

  it('returns an error when the path does not exist', async () => {
    const missing = path.join(tempDir, `${randomUUID()}.txt`);
    const tool = new ReadFileTool();

    const result = await tool.run({ path: missing });
    expect(result.error).toContain('Unable to access file');
    expect(result.display?.tone).toBe('error');
  });

  it('rejects directory paths', async () => {
    const dirPath = path.join(tempDir, 'folder');
    await mkdir(dirPath);

    const tool = new ReadFileTool();
    const result = await tool.run({ path: dirPath });

    expect(result.error).toContain('does not point to a regular file');
    expect(result.display?.tone).toBe('error');
  });
});
