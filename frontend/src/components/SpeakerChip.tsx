'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/TranslationContext';
import { canonicalSpeakerId, formatSpeakerLabel } from '@/lib/speakerLabels';

interface SpeakerChipProps {
  speaker?: string | null;
  /** Custom display names keyed by canonical speaker id */
  names?: Record<string, string>;
  /** When provided, clicking the chip opens a rename popover */
  onRename?: (speakerId: string, name: string) => Promise<void> | void;
}

const CHIP_CLASSES =
  'inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary';

export function SpeakerChip({ speaker, names, onRename }: SpeakerChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const canonical = canonicalSpeakerId(speaker);
  const label = formatSpeakerLabel(speaker, {
    names,
    labelTemplate: t('speakers.label'),
  });

  if (!label) {
    return null;
  }

  if (!canonical || !onRename) {
    return (
      <div className="mb-1">
        <span className={CHIP_CLASSES}>{label}</span>
      </div>
    );
  }

  const submit = async () => {
    const name = value.trim();
    setOpen(false);
    setValue('');
    if (name && name !== names?.[canonical]) {
      try {
        await onRename(canonical, name);
      } catch (error) {
        console.error('Failed to rename speaker:', error);
      }
    }
  };

  return (
    <div className="mb-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setValue(names?.[canonical] ?? '');
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            title={t('speakers.rename')}
            className={`${CHIP_CLASSES} cursor-pointer transition-colors hover:bg-primary/20`}
          >
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <p className="mb-2 text-xs font-medium text-foreground">{t('speakers.rename')}</p>
          <div className="flex gap-2">
            <Input
              value={value}
              autoFocus
              placeholder={t('speakers.rename_placeholder')}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button size="sm" onClick={submit}>
              {t('speakers.save')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
