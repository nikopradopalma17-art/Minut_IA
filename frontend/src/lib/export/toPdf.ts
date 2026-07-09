import type { ExportMetadata } from './types';
import { parseMarkdown, type InlineRun } from './markdown-ast';

function runsToPdfText(runs: InlineRun[]): Array<Record<string, unknown>> {
  return runs.map((run) => ({
    text: run.text,
    bold: run.bold || undefined,
    color: run.bold ? '#003e7e' : '#1f2937',
  }));
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch('/logo.png');
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Unable to convert logo to data URL'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read logo'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Unable to load logo for PDF export:', error);
    return null;
  }
}

export async function buildPdfBlob(markdown: string, metadata: ExportMetadata): Promise<Blob> {
  const nodes = parseMarkdown(markdown);
  const logoDataUrl = await loadLogoDataUrl();

  const content: any[] = [];

  if (logoDataUrl) {
    content.push({
      columns: [
        { image: logoDataUrl, width: 48, margin: [0, 0, 12, 0] },
        {
          stack: [
            { text: metadata.meetingTitle, style: 'title' },
            { text: metadata.meetingDate, style: 'subtitle' },
            { text: `Meeting ID: ${metadata.meetingId}`, style: 'meta' },
            { text: `Exported on ${metadata.exportedAt}`, style: 'meta' },
          ],
          width: '*',
        },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 12],
    });
  } else {
    content.push(
      { text: metadata.meetingTitle, style: 'title' },
      { text: metadata.meetingDate, style: 'subtitle', margin: [0, 0, 0, 2] },
      { text: `Meeting ID: ${metadata.meetingId}`, style: 'meta' },
      { text: `Exported on ${metadata.exportedAt}`, style: 'meta', margin: [0, 0, 0, 12] }
    );
  }

  content.push({
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth: 1.5,
        lineColor: '#fdb813',
      },
    ],
    margin: [0, 0, 0, 16],
  });

  for (const node of nodes) {
    if (node.type === 'heading') {
      content.push({
        text: runsToPdfText(node.runs),
        style: `heading${node.level}`,
        margin: [0, 10, 0, 4],
      });
      continue;
    }

    if (node.type === 'paragraph') {
      content.push({
        text: runsToPdfText(node.runs),
        margin: [0, 0, 0, 8],
      });
      continue;
    }

    if (node.type === 'list') {
      const items = node.items.map((item) => runsToPdfText(item));
      content.push(
        node.ordered
          ? { ol: items, margin: [0, 0, 0, 8] }
          : { ul: items, margin: [0, 0, 0, 8] }
      );
      continue;
    }

    if (node.type === 'table') {
      const headerRow = node.header.map((cell) => ({
        text: runsToPdfText(cell),
        bold: true,
        color: '#003e7e',
        fillColor: '#fdb813',
      }));
      const bodyRows = node.rows.map((row) =>
        row.map((cell) => ({
          text: runsToPdfText(cell),
        }))
      );

      content.push({
        table: {
          headerRows: 1,
          widths: Array.from({ length: node.header.length }, () => '*'),
          body: [headerRow, ...bodyRows],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 6, 0, 12],
      });
    }
  }

  const pdfMakeModule: any = await import('pdfmake/build/pdfmake.js');
  const pdfFontsModule: any = await import('pdfmake/build/vfs_fonts.js');
  const pdfMake = pdfMakeModule.default ?? pdfMakeModule;
  const vfs = pdfFontsModule.default ?? pdfFontsModule;
  pdfMake.vfs = vfs;

  const documentDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    content,
    styles: {
      title: {
        fontSize: 22,
        bold: true,
        color: '#003e7e',
      },
      subtitle: {
        fontSize: 11,
        italics: true,
        color: '#6b7280',
      },
      meta: {
        fontSize: 9,
        color: '#6b7280',
      },
      heading1: {
        fontSize: 18,
        bold: true,
        color: '#003e7e',
      },
      heading2: {
        fontSize: 15,
        bold: true,
        color: '#003e7e',
      },
      heading3: {
        fontSize: 13,
        bold: true,
        color: '#003e7e',
      },
    },
    defaultStyle: {
      fontSize: 10,
    },
  };

  return await new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(documentDefinition).getBlob((blob: Blob) => resolve(blob));
    } catch (error) {
      reject(error);
    }
  });
}
