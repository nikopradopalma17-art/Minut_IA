export interface InlineRun {
  text: string;
  bold?: boolean;
}

export type MarkdownNode =
  | {
      type: 'heading';
      level: 1 | 2 | 3;
      runs: InlineRun[];
    }
  | {
      type: 'paragraph';
      runs: InlineRun[];
    }
  | {
      type: 'list';
      ordered: boolean;
      items: InlineRun[][];
    }
  | {
      type: 'table';
      header: InlineRun[][];
      rows: InlineRun[][][];
    };

function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let buffer = '';
  let bold = false;

  const flush = () => {
    if (buffer) {
      runs.push({ text: buffer, bold: bold || undefined });
      buffer = '';
    }
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '*' && next === '*') {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }

    if (char === '_' && next === '_') {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }

    buffer += char;
  }

  flush();
  return runs.length > 0 ? runs : [{ text }];
}

function isTableSeparator(line: string): boolean {
  const normalized = line.replace(/^\|/, '').replace(/\|$/, '');
  return /^\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*$/.test(normalized);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseMarkdown(markdown: string): MarkdownNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const nodes: MarkdownNode[] = [];

  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }

    const text = paragraphBuffer.join(' ').trim();
    if (text) {
      nodes.push({ type: 'paragraph', runs: parseInline(text) });
    }
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) {
      return;
    }

    nodes.push({
      type: 'list',
      ordered: listOrdered,
      items: listBuffer.map((item) => parseInline(item)),
    });
    listBuffer = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushBlocks();
      nodes.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        runs: parseInline(headingMatch[2].trim()),
      });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      listOrdered = false;
      listBuffer.push(line.replace(/^\s*[-*+]\s+/, '').trim());
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      listOrdered = true;
      listBuffer.push(line.replace(/^\s*\d+\.\s+/, '').trim());
      continue;
    }

    if (line.includes('|')) {
      const nextLine = lines[index + 1]?.trim() ?? '';
      if (nextLine && isTableSeparator(nextLine)) {
        flushBlocks();

        const headerCells = splitTableRow(line);
        const rows: InlineRun[][][] = [];
        index += 2;

        for (; index < lines.length; index += 1) {
          const rowLine = lines[index].trim();
          if (!rowLine) {
            index -= 1;
            break;
          }

          if (!rowLine.includes('|')) {
            index -= 1;
            break;
          }

          if (isTableSeparator(rowLine)) {
            continue;
          }

          rows.push(splitTableRow(rowLine).map((cell) => parseInline(cell)));
        }

        nodes.push({
          type: 'table',
          header: headerCells.map((cell) => parseInline(cell)),
          rows,
        });
        continue;
      }
    }

    flushList();
    paragraphBuffer.push(trimmed);
  }

  flushBlocks();
  return nodes;
}
