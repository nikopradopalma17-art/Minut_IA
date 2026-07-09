import type { RefObject } from 'react';
import type { BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import type { Summary } from '@/types';
import { buildDocxBlob } from './toDocx';
import { buildPdfBlob } from './toPdf';
import { saveBinaryFile, saveTextFile, sanitizeFileName } from './saveFile';
import type { ExportMetadata } from './types';

export type SummaryExportFormat = 'pdf' | 'docx' | 'markdown';

export interface SummaryExportContext {
  meeting: {
    id: string;
    title: string;
    created_at: string;
  };
  summaryRef: RefObject<BlockNoteSummaryViewRef>;
  aiSummary: Summary | null;
  meetingTitle?: string;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatMetadata(context: SummaryExportContext): ExportMetadata {
  const meetingTitle = context.meetingTitle?.trim() || context.meeting.title || 'Meeting Summary';
  return {
    meetingTitle,
    meetingId: context.meeting.id,
    meetingDate: formatDateTime(context.meeting.created_at),
    exportedAt: new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date()),
  };
}

function buildMetadataMarkdown(metadata: ExportMetadata): string {
  return [
    `# Meeting Summary: ${metadata.meetingTitle}`,
    '',
    `**Meeting ID:** ${metadata.meetingId}`,
    `**Meeting Date:** ${metadata.meetingDate}`,
    `**Exported on:** ${metadata.exportedAt}`,
    '',
    '---',
    '',
  ].join('\n');
}

async function resolveSummaryMarkdown(context: SummaryExportContext): Promise<string> {
  try {
    if (context.summaryRef.current?.getMarkdown) {
      const markdown = await context.summaryRef.current.getMarkdown();
      if (markdown.trim()) {
        return markdown;
      }
    }
  } catch (error) {
    console.warn('Failed to read markdown from BlockNote summary ref:', error);
  }

  if (!context.aiSummary) {
    return '';
  }

  if ('markdown' in context.aiSummary && typeof context.aiSummary.markdown === 'string') {
    return context.aiSummary.markdown;
  }

  // Legacy fallback: convert sectioned summary objects to markdown.
  const sections = Object.entries(context.aiSummary)
    .filter(([key]) => key !== 'MeetingName' && key !== 'markdown' && key !== 'summary_json' && key !== '_section_order')
    .map(([, section]) => {
      if (section && typeof section === 'object' && 'title' in section && 'blocks' in section) {
        const title = String((section as any).title || '').trim();
        const blocks = Array.isArray((section as any).blocks) ? (section as any).blocks : [];
        const lines = blocks
          .map((block: any) => (block?.content ? `- ${block.content}` : ''))
          .filter(Boolean)
          .join('\n');
        return title ? `## ${title}\n\n${lines}` : lines;
      }
      return '';
    })
    .filter((section) => section.trim())
    .join('\n\n');

  return sections;
}

export async function exportSummary(
  context: SummaryExportContext,
  format: SummaryExportFormat
): Promise<string | null> {
  const summaryMarkdown = await resolveSummaryMarkdown(context);
  if (!summaryMarkdown.trim()) {
    throw new Error('No summary content available to export');
  }

  const metadata = formatMetadata(context);
  const safeTitle = sanitizeFileName(metadata.meetingTitle);

  if (format === 'markdown') {
    const path = await saveTextFile({
      defaultPath: `${safeTitle}.md`,
      text: buildMetadataMarkdown(metadata) + summaryMarkdown,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });
    return path;
  }

  if (format === 'docx') {
    const blob = await buildDocxBlob(summaryMarkdown, metadata);
    const path = await saveBinaryFile({
      defaultPath: `${safeTitle}.docx`,
      data: new Uint8Array(await blob.arrayBuffer()),
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    });
    return path;
  }

  const blob = await buildPdfBlob(summaryMarkdown, metadata);
  const path = await saveBinaryFile({
    defaultPath: `${safeTitle}.pdf`,
    data: new Uint8Array(await blob.arrayBuffer()),
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });
  return path;
}

