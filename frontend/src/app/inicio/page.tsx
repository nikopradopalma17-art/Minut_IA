'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar, Clock3, FileText, Mic, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';

interface DashboardStats {
  meetings_count: number;
  summaries_count: number;
  pending_commitments: number;
  latest_meeting_title: string | null;
  latest_meeting_created_at: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function InicioPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { meetings, setCurrentMeeting } = useSidebar();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const result = await invoke<DashboardStats>('api_get_dashboard_stats');
        if (!cancelled) {
          setStats(result);
        }
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const recentMeetings = useMemo(
    () => meetings.slice(0, 5),
    [meetings]
  );

  const startRecording = () => {
    sessionStorage.setItem('autoStartRecording', 'true');
    setCurrentMeeting({ id: 'intro-call', title: `+ ${t('nav.new_call')}` });
    router.push('/');
  };

  const latestTitle = stats?.latest_meeting_title || recentMeetings[0]?.title || t('dashboard.no_meetings');
  const latestCreatedAt = stats?.latest_meeting_created_at || recentMeetings[0]?.createdAt || null;

  const metricCards = [
    {
      label: t('dashboard.metrics.meetings'),
      value: isLoading ? '—' : String(stats?.meetings_count ?? recentMeetings.length),
      icon: Mic,
      tone: 'bg-primary/10 text-primary',
    },
    {
      label: t('dashboard.metrics.summaries'),
      value: isLoading ? '—' : String(stats?.summaries_count ?? 0),
      icon: FileText,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: t('dashboard.metrics.commitments'),
      value: isLoading ? '—' : String(stats?.pending_commitments ?? 0),
      icon: Sparkles,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: t('dashboard.metrics.latest'),
      value: latestTitle,
      icon: Calendar,
      tone: 'bg-slate-100 text-slate-700',
      helper: formatDate(latestCreatedAt),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.14),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f8fafc_100%)]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-primary/15 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.3fr_0.9fr] lg:px-8 lg:py-10">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                MinutIA
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 lg:text-5xl">
                  {t('dashboard.title')}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 lg:text-base">
                  {t('dashboard.subtitle')}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={startRecording}
                  className="h-11 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                >
                  {t('dashboard.primary_cta')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/reuniones')}
                  className="h-11 rounded-full border-slate-300 bg-white px-5 text-slate-700 hover:bg-slate-50"
                >
                  {t('dashboard.view_all')}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {t('dashboard.latest_prefix')}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">
                    {latestTitle}
                  </h2>
                </div>
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <Clock3 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5 space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-700">
                  {t('dashboard.latest_suffix')}
                </p>
                <p className="text-sm text-slate-500">
                  {latestCreatedAt ? formatDate(latestCreatedAt) : t('dashboard.no_meetings')}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-500">{card.label}</p>
                    <p className="text-2xl font-semibold tracking-tight text-slate-900">
                      {card.value}
                    </p>
                    {card.helper && (
                      <p className="text-xs text-slate-500">{card.helper}</p>
                    )}
                  </div>
                  <div className={`rounded-2xl p-3 ${card.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {t('dashboard.recent_meetings')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {recentMeetings.length > 0 ? `${recentMeetings.length} ${t('dashboard.metrics.meetings').toLowerCase()}` : t('dashboard.no_meetings')}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => router.push('/reuniones')}
                className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {t('dashboard.open')}
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              {recentMeetings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  {t('dashboard.no_meetings')}
                </div>
              ) : (
                recentMeetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">{meeting.title}</p>
                      <p className="text-xs text-slate-500">
                        {meeting.createdAt ? formatDate(meeting.createdAt) : meeting.id}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t('dashboard.view_all')}
                </h2>
                <Calendar className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t('meetings.subtitle')}
              </p>
              <Button
                onClick={() => router.push('/reuniones')}
                className="mt-5 h-11 w-full rounded-full bg-slate-900 text-white hover:bg-slate-800"
              >
                {t('dashboard.view_all')}
              </Button>
            </div>

            <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6">
              <p className="text-sm font-medium text-primary">
                {t('dashboard.latest_prefix')} {t('dashboard.latest_suffix')}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {latestTitle}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {latestCreatedAt ? formatDate(latestCreatedAt) : t('dashboard.no_meetings')}
              </p>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
