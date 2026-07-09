'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarDays, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';

function formatMonth(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(date);
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

export default function HistorialPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { meetings } = useSidebar();

  const groupedMeetings = useMemo(() => {
    const groups = new Map<string, typeof meetings>();

    [...meetings]
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .forEach((meeting) => {
        const key = meeting.createdAt ? meeting.createdAt.slice(0, 7) : 'unknown';
        const bucket = groups.get(key) ?? [];
        bucket.push(meeting);
        groups.set(key, bucket);
      });

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: key === 'unknown' ? t('history.empty') : formatMonth(`${key}-01`),
      items,
    }));
  }, [meetings, t]);

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
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <CalendarDays className="h-3.5 w-3.5" />
                {t('nav.history')}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                  {t('history.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {t('history.subtitle')}
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
                onClick={() => router.push('/inicio')}
                className="h-11 rounded-full bg-blue-700 px-5 text-white hover:bg-blue-800"
              >
                {t('dashboard.open')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {groupedMeetings.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
            {t('history.empty')}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedMeetings.map((group) => (
              <section key={group.key} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {group.label || t('history.title')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {group.items.length} {t('dashboard.metrics.meetings').toLowerCase()}
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-2 text-slate-600">
                    <Clock3 className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {group.items.map((meeting) => (
                    <button
                      key={meeting.id}
                      onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{meeting.title}</p>
                        <p className="text-xs text-slate-500">
                          {meeting.createdAt ? formatDate(meeting.createdAt) : meeting.id}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
