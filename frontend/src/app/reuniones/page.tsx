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
      className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border border-border">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                {t('nav.meetings')}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground font-heading">
                  {t('meetings.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t('meetings.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/inicio')}
                className="h-10 rounded-full border-border bg-background px-5 text-foreground hover:bg-muted focus-visible:ring-2 ring-ring"
              >
                {t('dashboard.view_all')}
              </Button>
              <Button
                onClick={() => router.push('/')}
                className="h-10 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/95 shadow-sm focus-visible:ring-2 ring-ring"
              >
                {t('dashboard.primary_cta')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t('meetings.search')}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('nav.search_placeholder')}
                className="h-11 rounded-2xl border-border bg-muted/40 pl-10 shadow-none focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            {filteredMeetings.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-sm text-muted-foreground shadow-sm text-center">
                {t('meetings.empty')}
              </div>
            ) : (
              filteredMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => openMeeting(meeting.id, meeting.title)}
                  className="flex w-full items-center justify-between rounded-3xl border border-border bg-card px-5 py-4 text-left shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 ring-ring"
                >
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">{meeting.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('meetings.created')}: {formatDate(meeting.createdAt) || meeting.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground/60">
                    <span className="hidden text-sm font-medium text-muted-foreground/80 md:inline">
                      {t('meetings.open_details')}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              ))
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">{t('dashboard.metrics.meetings')}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-foreground font-heading">
                {filteredMeetings.length}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t('meetings.subtitle')}
              </p>
            </div>

            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 flex flex-col justify-between h-48">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-primary">{t('dashboard.primary_cta')}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('dashboard.subtitle')}
                </p>
              </div>
              <Button
                onClick={() => router.push('/')}
                className="h-10 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all font-medium text-sm focus-visible:ring-2 ring-ring"
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
