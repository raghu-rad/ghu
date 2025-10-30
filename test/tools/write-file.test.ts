import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ToolDisplayPreviewLine } from '../../src/tools/index.js';
import { WriteFileTool } from '../../src/tools/write-file.js';

let tempDir: string;

const createTempDir = async (): Promise<string> => {
  const prefix = path.join(tmpdir(), 'write-file-tool-');
  return mkdtemp(prefix);
};

beforeEach(async () => {
  tempDir = await createTempDir();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('WriteFileTool', () => {
  it('applies ordered insert and delete operations', async () => {
    const filePath = path.join(tempDir, 'notes.txt');
    await writeFile(filePath, 'line1\nline2\nline3\n', 'utf8');

    const tool = new WriteFileTool();
    const result = await tool.run({
      path: filePath,
      operations: [
        { type: 'delete', line: 2 },
        { type: 'insert', line: 2, content: 'between' },
        { type: 'insert', line: 4, content: 'append line' },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.display?.tone).toBe('success');

    const updated = await readFile(filePath, 'utf8');
    expect(updated).toBe('line1\nbetween\nline3\nappend line\n');
    expect(result.output).toBe(updated);

    const preview = result.display?.preview;
    expect(preview).toBeDefined();
    expect(preview?.truncated).toBe(false);
    expect(preview?.lines).toHaveLength(3);

    const first = preview?.lines?.[0] as ToolDisplayPreviewLine;
    const second = preview?.lines?.[1] as ToolDisplayPreviewLine;
    const third = preview?.lines?.[2] as ToolDisplayPreviewLine;

    expect(first.tone).toBe('deletion');
    expect(first.text).toContain('-  2 | line2');
    expect(second.tone).toBe('addition');
    expect(second.text).toContain('+  2 | between');
    expect(third.tone).toBe('addition');
    expect(third.text).toContain('+  4 | append line');
  });

  it('creates a new file when the target does not exist', async () => {
    const filePath = path.join(tempDir, 'new-file.txt');

    const tool = new WriteFileTool();
    const result = await tool.run({
      path: filePath,
      operations: [
        { type: 'insert', content: 'alpha' },
        { type: 'insert', content: 'beta' },
      ],
    });

    expect(result.error).toBeUndefined();
    const content = await readFile(filePath, 'utf8');
    expect(content).toBe('alpha\nbeta\n');

    const preview = result.display?.preview;
    expect(preview).toBeDefined();
    const previewLines = preview?.lines ?? [];
    expect(previewLines.length).toBe(2);
    const [first, second] = previewLines as ToolDisplayPreviewLine[];
    expect(first.tone).toBe('addition');
    expect(first.text).toContain('+  1 | alpha');
    expect(second.text).toContain('+  2 | beta');
  });

  it('compresses the preview when many changes are applied', async () => {
    const filePath = path.join(tempDir, 'bulk.txt');

    const lines = Array.from({ length: 20 }, (_, index) => `item-${index + 1}`).join('\n');
    const tool = new WriteFileTool();
    const result = await tool.run({
      path: filePath,
      operations: [{ type: 'insert', content: lines }],
    });

    expect(result.error).toBeUndefined();
    const preview = result.display?.preview;
    expect(preview?.truncated).toBe(true);

    const summaryLine = preview?.lines?.find(
      (line) => typeof line !== 'string' && line.text.includes('more change'),
    ) as ToolDisplayPreviewLine | undefined;
    expect(summaryLine?.tone).toBe('info');
    expect(summaryLine?.text).toContain('10 more change');

    const firstLine = preview?.lines?.[0] as ToolDisplayPreviewLine;
    const lastLine = preview?.lines?.[preview.lines.length - 1] as ToolDisplayPreviewLine;
    expect(firstLine.text).toContain('+  1 | item-1');
    expect(lastLine.text).toContain('+ 20 | item-20');
  });

  it('returns an error when attempting to delete outside the file bounds', async () => {
    const filePath = path.join(tempDir, 'bounds.txt');
    await writeFile(filePath, 'only\n', 'utf8');

    const tool = new WriteFileTool();
    const result = await tool.run({
      path: filePath,
      operations: [{ type: 'delete', line: 5 }],
    });

    expect(result.error).toContain('targets line 5');
    expect(result.display?.tone).toBe('error');
  });
});
