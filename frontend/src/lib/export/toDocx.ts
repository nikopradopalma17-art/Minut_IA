import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ExportMetadata } from './types';
import { parseMarkdown, type InlineRun } from './markdown-ast';

function runsToTextRuns(runs: InlineRun[], options?: { size?: number; color?: string }): TextRun[] {
  return runs.map(
    (run) =>
      new TextRun({
        text: run.text,
        bold: run.bold,
        size: options?.size,
        color: options?.color,
      })
  );
}

function renderHeading(level: 1 | 2 | 3, runs: InlineRun[]): Paragraph {
  const headingLevel =
    level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  const size = level === 1 ? 26 : level === 2 ? 20 : 16;

  return new Paragraph({
    heading: headingLevel,
    spacing: { before: 180, after: 90 },
    children: runsToTextRuns(runs, { size, color: '003e7e' }),
  });
}

function renderParagraph(runs: InlineRun[]): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: runsToTextRuns(runs, { size: 22, color: '1f2937' }),
  });
}

function renderListItem(item: InlineRun[], index: number, ordered: boolean): Paragraph {
  const prefix = ordered ? `${index + 1}. ` : '• ';
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({
        text: prefix,
        bold: true,
        size: 22,
        color: '003e7e',
      }),
      ...runsToTextRuns(item, { size: 22, color: '1f2937' }),
    ],
  });
}

function renderTableCell(runs: InlineRun[], header = false): TableCell {
  return new TableCell({
    shading: header
      ? ({
          fill: 'FDB813',
          color: 'auto',
          type: ShadingType.CLEAR,
        } as any)
      : undefined,
    children: [
      new Paragraph({
        children: runsToTextRuns(runs, {
          size: 20,
          color: header ? '003e7e' : '1f2937',
        }),
      }),
    ],
  });
}

export async function buildDocxBlob(markdown: string, metadata: ExportMetadata): Promise<Blob> {
  const nodes = parseMarkdown(markdown);
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: metadata.meetingTitle,
          bold: true,
          size: 34,
          color: '003e7e',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: metadata.meetingDate,
          italics: true,
          size: 20,
          color: '6b7280',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `Meeting ID: ${metadata.meetingId}`,
          size: 18,
          color: '6b7280',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `Exported on ${metadata.exportedAt}`,
          size: 18,
          color: '6b7280',
        }),
      ],
    }),
  ];

  for (const node of nodes) {
    if (node.type === 'heading') {
      children.push(renderHeading(node.level, node.runs));
      continue;
    }

    if (node.type === 'paragraph') {
      children.push(renderParagraph(node.runs));
      continue;
    }

    if (node.type === 'list') {
      node.items.forEach((item, index) => {
        children.push(renderListItem(item, index, node.ordered));
      });
      continue;
    }

    if (node.type === 'table') {
      const rows = [
        new TableRow({
          children: node.header.map((cell) => renderTableCell(cell, true)),
        }),
        ...node.rows.map(
          (row) =>
            new TableRow({
              children: row.map((cell) => renderTableCell(cell, false)),
            })
        ),
      ];

      children.push(
        new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          rows,
        })
      );
    }
  }

  const document = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
    styles: {
      paragraphStyles: [
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: 34,
            bold: true,
            color: '003e7e',
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
          },
        },
      ],
    },
  });

  return Packer.toBlob(document);
}
