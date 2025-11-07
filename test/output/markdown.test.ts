import { describe, expect, it } from 'vitest';

import { formatMarkdown, formatUserMessage } from '../../src/output/markdown.js';

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '');

describe('formatMarkdown', () => {
  it('formats emphasis and code spans', () => {
    const output = formatMarkdown('**bold** *italic* `code`');
    expect(stripAnsi(output)).toContain('bold italic code');
    expect(output).toContain('\x1b[1mbold\x1b[22m');
    expect(output).toContain('\x1b[3mitalic\x1b[23m');
    expect(output).toContain('\x1b[38;5;208mcode\x1b[39m');
  });

  it('renders headings and lists', () => {
    const output = formatMarkdown('# Title\n\n- First\n- Second');
    const plain = stripAnsi(output);
    expect(plain).toContain('Title');
    expect(plain).toContain('• First');
    expect(plain).toContain('• Second');
  });

  it('wraps fenced code blocks in a box', () => {
    const output = formatMarkdown('```ts\nconsole.log("hi");\n```');
    expect(output).toContain('┌─ code (ts)');
    expect(output).toContain('└────────────');
    expect(output).toContain('console.log("hi");');
  });
});

describe('formatUserMessage', () => {
  it('pads user messages to the provided width', () => {
    const output = formatUserMessage('Hello', 12);
    const lines = output.split('\n').map(stripAnsi);
    expect(lines[0]).toHaveLength(12);
    expect(lines[1]).toHaveLength(12);
  });

  it('wraps long lines so backgrounds remain consistent', () => {
    const output = formatUserMessage(
      'This is a very long line that should wrap across multiple rows',
      20,
    );
    const lines = output.split('\n').map(stripAnsi);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    lines.forEach((line) => {
      expect(line).toHaveLength(20);
    });
  });
});
