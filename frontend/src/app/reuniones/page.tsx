'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Search, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function ReunionesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { meetings, setCurrentMeeting } = useSidebar();
  const [query, setQuery] = useState('');

  const filteredMeetings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const sorted = [...meetings].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    if (!normalized) return sorted;

    return sorted.filter((meeting) =>
      meeting.title.toLowerCase().includes(normalized) ||
      meeting.id.toLowerCase().includes(normalized)
    );
  }, [meetings, query]);

  const openMeeting = (meetingId: string, title: string) => {
    setCurrentMeeting({ id: meetingId, title });
    router.push(`/meeting-details?id=${meetingId}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <Calendar className="h-3.5 w-3.5" />
                {t('nav.meetings')}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                  {t('meetings.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {t('meetings.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/inicio')}
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

          <div className="mt-6">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {t('meetings.search')}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('nav.search_placeholder')}
                className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 shadow-none focus-visible:ring-blue-500"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            {filteredMeetings.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
                {t('meetings.empty')}
              </div>
            ) : (
              filteredMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => openMeeting(meeting.id, meeting.title)}
                  className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <div className="space-y-1">
                    <p className="text-base font-medium text-slate-900">{meeting.title}</p>
                    <p className="text-xs text-slate-500">
                      {t('meetings.created')}: {formatDate(meeting.createdAt) || meeting.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400">
                    <span className="hidden text-sm font-medium text-slate-500 md:inline">
                      {t('meetings.open_details')}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              ))
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{t('dashboard.metrics.meetings')}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {filteredMeetings.length}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {t('meetings.subtitle')}
              </p>
            </div>

            <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-6">
              <p className="text-sm font-medium text-blue-800">{t('dashboard.primary_cta')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t('dashboard.subtitle')}
              </p>
              <Button
                onClick={() => router.push('/')}
                className="mt-4 h-11 w-full rounded-full bg-slate-900 text-white hover:bg-slate-800"
              >
                {t('dashboard.primary_cta')}
              </Button>
            </div>
          </aside>
        </section>
      </div>
    </motion.div>
  );
}
