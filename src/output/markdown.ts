import { marked } from 'marked';
import type { Tokens, TokensList } from 'marked';

const enum Ansi {
  reset = '\x1b[0m',
  bold = '\x1b[1m',
  boldOff = '\x1b[22m',
  dim = '\x1b[2m',
  dimOff = boldOff,
  italic = '\x1b[3m',
  italicOff = '\x1b[23m',
  underline = '\x1b[4m',
  underlineOff = '\x1b[24m',
  inverse = '\x1b[7m',
  inverseOff = '\x1b[27m',
  strikethrough = '\x1b[9m',
  strikethroughOff = '\x1b[29m',
  foregroundDefault = '\x1b[39m',
  backgroundDefault = '\x1b[49m',
  foregroundMuted = '\x1b[38;5;245m',
  foregroundAccent = '\x1b[38;5;208m',
  foregroundHeading = '\x1b[38;5;39m',
  backgroundUser = '\x1b[48;5;236m',
  backgroundUserLabel = '\x1b[48;5;238m',
  foregroundUser = '\x1b[38;5;252m',
  foregroundUserLabel = '\x1b[38;5;249m',
}

const bullet = `${Ansi.dim}\u2022${Ansi.dimOff}`;

export function formatMarkdown(markdown: string): string {
  const clean = markdown.replace(/\r\n/g, '\n');
  const tokens = marked.lexer(clean, {
    gfm: true,
    breaks: false,
    smartLists: true,
    smartypants: false,
  });

  return renderTokens(tokens).trimEnd();
}

const unicodeLength = (value: string): number => Array.from(value).length;

export function formatUserMessage(message: string, width?: number): string {
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  const trimmedLines = lines.map((line) => line.replace(/\s+$/, ''));
  const label = 'YOU';
  const contentLengths = trimmedLines.map((line) => (line.length === 0 ? 1 : unicodeLength(line)));
  const baseWidth = Math.max(label.length, ...contentLengths);

  let effectiveInnerWidth = baseWidth;
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    const desiredInnerWidth = Math.max(Math.floor(width) - 2, 1);
    effectiveInnerWidth = Math.max(baseWidth, desiredInnerWidth);
  }

  const totalWidth = effectiveInnerWidth + 2;

  const padToWidth = (value: string): string => {
    const visible = unicodeLength(value);
    if (visible >= totalWidth) {
      return value;
    }
    return `${value}${' '.repeat(totalWidth - visible)}`;
  };

  const labelContent = padToWidth(` ${label} `);
  const labelLine = `${Ansi.backgroundUserLabel}${Ansi.foregroundUserLabel}${Ansi.bold}${labelContent}${Ansi.boldOff}${Ansi.reset}`;

  const contentLines = trimmedLines.map((line) => {
    const safeLine = line.length === 0 ? '' : line;
    const padded = padToWidth(` ${safeLine} `);
    return `${Ansi.backgroundUser}${Ansi.foregroundUser}${padded}${Ansi.reset}`;
  });

  return [labelLine, ...contentLines].join('\n');
}

function renderTokens(tokens: TokensList, indent = 0): string {
  let output = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        output += '\n';
        break;
      case 'paragraph':
        output += `${renderInline(token.tokens ?? [])}\n\n`;
        break;
      case 'heading':
        output += renderHeading(token);
        break;
      case 'code':
        output += renderCode(token);
        break;
      case 'blockquote':
        output += renderBlockquote(token);
        break;
      case 'list':
        output += renderList(token, indent);
        break;
      case 'html':
        output += `${token.text}\n`;
        break;
      case 'text':
        output += `${renderInline(token.tokens ?? [])}\n`;
        break;
      case 'hr':
        output += `${Ansi.dim}─`.repeat(20) + `${Ansi.dimOff}\n`;
        break;
      case 'table':
        output += renderTable(token);
        break;
      default:
        break;
    }
  }

  return output;
}

function renderHeading(token: Tokens.Heading): string {
  const content = renderInline(token.tokens ?? []).trim();
  const color = token.depth <= 2 ? Ansi.foregroundHeading : Ansi.foregroundAccent;
  const headingText = `${Ansi.bold}${color}${content}${Ansi.boldOff}${Ansi.foregroundDefault}`;

  let underline = '';
  if (token.depth === 1) {
    underline = `${color}${'='.repeat(content.length)}${Ansi.foregroundDefault}`;
  } else if (token.depth === 2) {
    underline = `${Ansi.dim}${'-'.repeat(content.length)}${Ansi.dimOff}`;
  }

  const suffix = underline.length > 0 ? `\n${underline}` : '';
  return `${headingText}${suffix}\n\n`;
}

function renderCode(token: Tokens.Code): string {
  const languageLabel = token.lang ? ` (${token.lang})` : '';
  const header = `${Ansi.dim}┌─ code${languageLabel}${Ansi.dimOff}`;
  const footer = `${Ansi.dim}└────────────${Ansi.dimOff}`;
  const lines = token.text.replace(/\t/g, '  ').split('\n').map((line) => `  ${Ansi.foregroundAccent}${line}${Ansi.foregroundDefault}`);

  return [header, ...lines, footer, ''].join('\n');
}

function renderBlockquote(token: Tokens.Blockquote): string {
  const inner = renderTokens(token.tokens ?? []).trimEnd().split('\n');
  const quoted = inner.map((line) => `${Ansi.dim}│ ${line}${Ansi.dimOff}`);
  return `${quoted.join('\n')}\n\n`;
}

function renderList(token: Tokens.List, indent: number): string {
  const lines: string[] = [];

  token.items.forEach((item, index) => {
    const lineIndent = ' '.repeat(indent);
    let marker: string;
    let continuationIndent: string;

    if (item.task) {
      const box = item.checked ? '[x]' : '[ ]';
      marker = `${lineIndent}${Ansi.dim}${box}${Ansi.dimOff} `;
      continuationIndent = `${lineIndent}    `;
    } else if (token.ordered) {
      const number = (token.start ?? 1) + index;
      marker = `${lineIndent}${Ansi.dim}${number}.${Ansi.dimOff} `;
      continuationIndent = `${lineIndent}${' '.repeat(String(number).length + 2)}`;
    } else {
      marker = `${lineIndent}${bullet} `;
      continuationIndent = `${lineIndent}  `;
    }

    const content = item.tokens ? renderTokens(item.tokens, indent + 2).trimEnd() : renderInline(marked.lexer.inlineTokens(item.text ?? ''));
    const contentLines = content.split('\n');

    const firstLine = `${marker}${contentLines[0] ?? ''}`;
    const rest = contentLines.slice(1).map((line) => `${continuationIndent}${line}`);
    lines.push(firstLine, ...rest);
  });

  return `${lines.join('\n')}\n\n`;
}

function renderTable(token: Tokens.Table): string {
  const headers = token.header.map((cell) => renderInline(cell.tokens ?? [])).join(` ${Ansi.dim}|${Ansi.dimOff} `);
  const separator = token.align
    ?.map(() => `${Ansi.dim}${'-'.repeat(5)}${Ansi.dimOff}`)
    .join(` ${Ansi.dim}+${Ansi.dimOff} `);
  const rows = token.rows.map((row) => row.map((cell) => renderInline(cell.tokens ?? [])).join(` ${Ansi.dim}|${Ansi.dimOff} `));

  const tableLines = [`${Ansi.bold}${headers}${Ansi.boldOff}`];
  if (separator) {
    tableLines.push(separator);
  }
  tableLines.push(...rows);

  return `${tableLines.join('\n')}\n\n`;
}

function renderInline(tokens: TokensList): string {
  let result = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        result += token.text ?? '';
        if (token.tokens) {
          result += renderInline(token.tokens);
        }
        break;
      case 'strong':
        result += `${Ansi.bold}${renderInline(token.tokens ?? [])}${Ansi.boldOff}`;
        break;
      case 'em':
        result += `${Ansi.italic}${renderInline(token.tokens ?? [])}${Ansi.italicOff}`;
        break;
      case 'del':
        result += `${Ansi.strikethrough}${renderInline(token.tokens ?? [])}${Ansi.strikethroughOff}`;
        break;
      case 'codespan':
        result += `${Ansi.foregroundAccent}${token.text ?? ''}${Ansi.foregroundDefault}`;
        break;
      case 'link':
        result += `${Ansi.underline}${renderInline(token.tokens ?? [])}${Ansi.underlineOff} ${Ansi.dim}(${token.href})${Ansi.dimOff}`;
        break;
      case 'escape':
        result += token.text ?? '';
        break;
      case 'br':
        result += '\n';
        break;
      case 'image':
        result += token.text ?? `[image: ${token.href}]`;
        break;
      default:
        break;
    }
  }

  return result;
}
