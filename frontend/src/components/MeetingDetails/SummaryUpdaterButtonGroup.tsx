"use client";

import { useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, Save, Loader2, FileDown, FolderOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Analytics from '@/lib/analytics';
import { toast } from 'sonner';
import { useTranslation } from '@/contexts/TranslationContext';
import { exportSummary } from '@/lib/export/summary-export';
import type { BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import type { Summary } from '@/types';

interface SummaryUpdaterButtonGroupProps {
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => Promise<void>;
  onCopy: () => Promise<void>;
  onFind?: () => void;
  onOpenFolder: () => Promise<void>;
  hasSummary: boolean;
  meetingTitle: string;
  meeting: {
    id: string;
    title: string;
    created_at: string;
  };
  summaryRef: RefObject<BlockNoteSummaryViewRef>;
  aiSummary: Summary | null;
}

export function SummaryUpdaterButtonGroup({
  isSaving,
  isDirty,
  onSave,
  onCopy,
  onFind,
  onOpenFolder,
  hasSummary,
  meetingTitle,
  meeting,
  summaryRef,
  aiSummary,
}: SummaryUpdaterButtonGroupProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: 'pdf' | 'docx' | 'markdown') => {
    if (!hasSummary || isExporting) {
      return;
    }

    setIsExporting(true);
    const toastId = `summary-export-${format}`;
    toast.loading(t('export.exporting'), {
      id: toastId,
      duration: 0,
    });

    try {
      const path = await exportSummary(
          {
            meeting,
            summaryRef,
            aiSummary,
            meetingTitle,
          },
          format
        );

      if (!path) {
        toast.dismiss(toastId);
        return;
      }

      const label =
        format === 'pdf'
          ? t('export.pdf')
          : format === 'docx'
            ? t('export.word')
            : t('export.markdown');

      toast.success(t('export.success').replace('{format}', label), {
        id: toastId,
        description: path,
      });
    } catch (error) {
      console.error('Failed to export summary:', error);
      toast.error(t('export.failed'), {
        id: toastId,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ButtonGroup>
      {/* Save button */}
      <Button
        variant="outline"
        size="sm"
        className={`${isDirty ? 'bg-primary/10 border-primary/30 text-primary' : ""}`}
        title={isSaving ? t('common.saving') : t('summary.save_changes_title')}
        onClick={() => {
          Analytics.trackButtonClick('save_changes', 'meeting_details');
          onSave();
        }}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="animate-spin" />
            <span className="hidden lg:inline">{t('common.saving')}</span>
          </>
        ) : (
          <>
            <Save />
            <span className="hidden lg:inline">{t('common.save')}</span>
          </>
        )}
      </Button>

      {/* Copy button */}
      <Button
        variant="outline"
        size="sm"
        title={t('summary.copy_summary_title')}
        onClick={() => {
          Analytics.trackButtonClick('copy_summary', 'meeting_details');
          onCopy();
        }}
        disabled={!hasSummary}
        className="cursor-pointer"
      >
        <Copy />
        <span className="hidden lg:inline">{t('common.copy')}</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            title={t('export.menu')}
            disabled={!hasSummary || isExporting}
            className="cursor-pointer"
          >
            {isExporting ? <Loader2 className="animate-spin" /> : <FileDown />}
            <span className="hidden lg:inline">{t('export.menu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void handleExport('pdf')}>
            {t('export.pdf')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleExport('docx')}>
            {t('export.word')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleExport('markdown')}>
            {t('export.markdown')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Find button */}
      {/* {onFind && (
        <Button
          variant="outline"
          size="sm"
          title="Find in Summary"
          onClick={() => {
            Analytics.trackButtonClick('find_in_summary', 'meeting_details');
            onFind();
          }}
          disabled={!hasSummary}
          className="cursor-pointer"
        >
          <Search />
          <span className="hidden lg:inline">Find</span>
        </Button>
      )} */}
    </ButtonGroup>
  );
}
