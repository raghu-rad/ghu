import { Lexer, marked } from 'marked';
import type { Token, Tokens, TokensList } from 'marked';

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

type TokenSequence = TokensList | Token[];

export function formatMarkdown(markdown: string): string {
  const clean = markdown.replace(/\r\n/g, '\n');
  const tokens = marked.lexer(clean, {
    gfm: true,
    breaks: false,
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

function renderTokens(tokens: TokenSequence, indent = 0): string {
  let output = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        output += '\n';
        break;
      case 'paragraph': {
        const paragraphToken = token as Tokens.Paragraph;
        output += `${renderInline(paragraphToken.tokens ?? [])}\n\n`;
        break;
      }
      case 'heading': {
        const headingToken = token as Tokens.Heading;
        output += renderHeading(headingToken);
        break;
      }
      case 'code': {
        const codeToken = token as Tokens.Code;
        output += renderCode(codeToken);
        break;
      }
      case 'blockquote': {
        const blockquoteToken = token as Tokens.Blockquote;
        output += renderBlockquote(blockquoteToken);
        break;
      }
      case 'list': {
        const listToken = token as Tokens.List;
        output += renderList(listToken, indent);
        break;
      }
      case 'html': {
        const htmlToken = token as Tokens.HTML | Tokens.Tag;
        output += `${htmlToken.text}\n`;
        break;
      }
      case 'text': {
        const textToken = token as Tokens.Text;
        output += `${renderInline(textToken.tokens ?? [])}\n`;
        break;
      }
      case 'hr':
        output += `${Ansi.dim}─`.repeat(20) + `${Ansi.dimOff}\n`;
        break;
      case 'table': {
        const tableToken = token as Tokens.Table;
        output += renderTable(tableToken);
        break;
      }
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
  const lines = token.text
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => `  ${Ansi.foregroundAccent}${line}${Ansi.foregroundDefault}`);

  return [header, ...lines, footer, ''].join('\n');
}

function renderBlockquote(token: Tokens.Blockquote): string {
  const inner = renderTokens(token.tokens ?? [])
    .trimEnd()
    .split('\n');
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
      const start = typeof token.start === 'number' ? token.start : 1;
      const number = start + index;
      marker = `${lineIndent}${Ansi.dim}${number}.${Ansi.dimOff} `;
      continuationIndent = `${lineIndent}${' '.repeat(String(number).length + 2)}`;
    } else {
      marker = `${lineIndent}${bullet} `;
      continuationIndent = `${lineIndent}  `;
    }

    const content = item.tokens
      ? renderTokens(item.tokens, indent + 2).trimEnd()
      : renderInline(Lexer.lexInline(item.text ?? ''));
    const contentLines = content.split('\n');

    const firstLine = `${marker}${contentLines[0] ?? ''}`;
    const rest = contentLines.slice(1).map((line) => `${continuationIndent}${line}`);
    lines.push(firstLine, ...rest);
  });

  return `${lines.join('\n')}\n\n`;
}

function renderTable(token: Tokens.Table): string {
  const headers = token.header
    .map((cell) => renderInline(cell.tokens ?? []))
    .join(` ${Ansi.dim}|${Ansi.dimOff} `);
  const separator = token.align
    ?.map(() => `${Ansi.dim}${'-'.repeat(5)}${Ansi.dimOff}`)
    .join(` ${Ansi.dim}+${Ansi.dimOff} `);
  const rows = token.rows.map((row) =>
    row.map((cell) => renderInline(cell.tokens ?? [])).join(` ${Ansi.dim}|${Ansi.dimOff} `),
  );

  const tableLines = [`${Ansi.bold}${headers}${Ansi.boldOff}`];
  if (separator) {
    tableLines.push(separator);
  }
  tableLines.push(...rows);

  return `${tableLines.join('\n')}\n\n`;
}

function renderInline(tokens: TokenSequence): string {
  let result = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const textToken = token as Tokens.Text;
        result += textToken.text ?? '';
        if (textToken.tokens) {
          result += renderInline(textToken.tokens);
        }
        break;
      }
      case 'strong': {
        const strongToken = token as Tokens.Strong;
        result += `${Ansi.bold}${renderInline(strongToken.tokens ?? [])}${Ansi.boldOff}`;
        break;
      }
      case 'em': {
        const emToken = token as Tokens.Em;
        result += `${Ansi.italic}${renderInline(emToken.tokens ?? [])}${Ansi.italicOff}`;
        break;
      }
      case 'del': {
        const delToken = token as Tokens.Del;
        result += `${Ansi.strikethrough}${renderInline(delToken.tokens ?? [])}${Ansi.strikethroughOff}`;
        break;
      }
      case 'codespan':
        result += `${Ansi.foregroundAccent}${(token as Tokens.Codespan).text ?? ''}${Ansi.foregroundDefault}`;
        break;
      case 'link': {
        const linkToken = token as Tokens.Link;
        result += `${Ansi.underline}${renderInline(linkToken.tokens ?? [])}${Ansi.underlineOff} ${Ansi.dim}(${linkToken.href})${Ansi.dimOff}`;
        break;
      }
      case 'escape':
        result += (token as Tokens.Escape).text ?? '';
        break;
      case 'br':
        result += '\n';
        break;
      case 'image': {
        const imageToken = token as Tokens.Image;
        result += imageToken.text ?? `[image: ${imageToken.href}]`;
        break;
      }
      default:
        break;
    }
  }

  return result;
}
