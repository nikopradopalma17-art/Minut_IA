'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Sparkles, CheckCircle2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';

interface MeetingSummaryRow {
  id: string;
  title: string;
  createdAt?: string;
  status: string;
  hasSummary: boolean;
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function MinutasPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { meetings } = useSidebar();
  const [rows, setRows] = useState<MeetingSummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const orderedMeetings = useMemo(
    () => [...meetings].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    }).slice(0, 10),
    [meetings]
  );

  useEffect(() => {
    let cancelled = false;

    const loadSummaries = async () => {
      setIsLoading(true);

      try {
        const results = await Promise.all(
          orderedMeetings.map(async (meeting) => {
            try {
              const summary = await invoke<any>('api_get_summary', { meetingId: meeting.id });
              const status = String(summary?.status ?? 'idle');
              return {
                id: meeting.id,
                title: meeting.title,
                createdAt: meeting.createdAt,
                status,
                hasSummary: status === 'completed' || Boolean(summary?.data),
              };
            } catch (error) {
              console.warn('Failed to load summary status:', meeting.id, error);
              return {
                id: meeting.id,
                title: meeting.title,
                createdAt: meeting.createdAt,
                status: 'idle',
                hasSummary: false,
              };
            }
          })
        );

        if (!cancelled) {
          setRows(results.filter((row) => row.hasSummary));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSummaries();

    return () => {
      cancelled = true;
    };
  }, [orderedMeetings]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="min-h-screen bg-background"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {t('minutes.summary_ready')}
              </div>
              <div>
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                  {t('minutes.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t('minutes.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/reuniones')}
                className="h-11 px-5"
              >
                {t('dashboard.view_all')}
              </Button>
              <Button
                onClick={() => router.push('/')}
                className="h-11 px-5"
              >
                {t('dashboard.primary_cta')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            {isLoading ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground shadow-sm">
                {t('settings.loading')}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-sm text-muted-foreground shadow-sm">
                {t('minutes.empty')}
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => router.push(`/meeting-details?id=${row.id}`)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <p className="text-base font-medium text-foreground">{row.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.createdAt ? formatDate(row.createdAt) : row.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {t('minutes.summary_ready')}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">{t('dashboard.metrics.summaries')}</p>
              <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
                {rows.length}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('minutes.subtitle')}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-secondary p-6">
              <div className="flex items-center gap-2 text-secondary-foreground">
                <CheckCircle2 className="h-4 w-4" />
                <p className="text-sm font-medium">{t('minutes.summary_ready')}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t('meetings.subtitle')}
              </p>
              <Button
                onClick={() => router.push('/reuniones')}
                className="mt-4 h-11 w-full"
              >
                {t('dashboard.view_all')}
              </Button>
            </div>
          </aside>
        </section>
      </div>
    </motion.div>
  );
}
