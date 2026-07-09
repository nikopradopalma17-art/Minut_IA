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
      className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" />
                {t('minutes.summary_ready')}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                  {t('minutes.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {t('minutes.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/reuniones')}
                className="h-11 rounded-full border-slate-300 bg-white px-5 text-slate-700 hover:bg-slate-50"
              >
                {t('dashboard.view_all')}
              </Button>
              <Button
                onClick={() => router.push('/')}
                className="h-11 rounded-full bg-blue-700 px-5 text-white hover:bg-blue-800"
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
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
                {t('settings.loading')}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
                {t('minutes.empty')}
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => router.push(`/meeting-details?id=${row.id}`)}
                  className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      <p className="text-base font-medium text-slate-900">{row.title}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {row.createdAt ? formatDate(row.createdAt) : row.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {t('minutes.summary_ready')}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              ))
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{t('dashboard.metrics.summaries')}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {rows.length}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {t('minutes.subtitle')}
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                <p className="text-sm font-medium">{t('minutes.summary_ready')}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t('meetings.subtitle')}
              </p>
              <Button
                onClick={() => router.push('/reuniones')}
                className="mt-4 h-11 w-full rounded-full bg-slate-900 text-white hover:bg-slate-800"
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
