'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar, Clock3, FileText, Mic, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';
import { BentoGrid, BentoCard } from '@/components/ui/bento-grid';

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-8">
        
        {/* Main Bento Grid layout */}
        <BentoGrid className="auto-rows-auto">
          
          {/* Welcome Card (Hero) */}
          <BentoCard colSpan={3} className="overflow-hidden border-primary/15 relative bg-gradient-to-br from-card via-card to-impulso-navy/5">
            <div className="absolute right-0 top-0 w-96 h-96 bg-impulso-navy/5 rounded-full blur-3xl -z-10" />
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  MinutIA
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground font-heading">
                    {t('dashboard.title')}
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground lg:text-base">
                    {t('dashboard.subtitle')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={startRecording}
                    className="h-10 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/95 transition-all shadow-sm focus-visible:ring-2 ring-ring"
                  >
                    {t('dashboard.primary_cta')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/reuniones')}
                    className="h-10 rounded-full px-5 text-foreground bg-background hover:bg-muted border-border transition-all focus-visible:ring-2 ring-ring"
                  >
                    {t('dashboard.view_all')}
                  </Button>
                </div>
              </div>

              {/* Latest meeting quick stats overlay */}
              <div className="w-full md:w-80 rounded-2xl border border-border bg-muted/40 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      {t('dashboard.latest_prefix')}
                    </p>
                    <h2 className="mt-1.5 text-base font-semibold text-foreground truncate max-w-[200px]">
                      {latestTitle}
                    </h2>
                  </div>
                  <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                    <Clock3 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 space-y-1 rounded-xl bg-card p-3 shadow-sm border border-border/60">
                  <p className="text-xs font-medium text-foreground/80">
                    {t('dashboard.latest_suffix')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {latestCreatedAt ? formatDate(latestCreatedAt) : t('dashboard.no_meetings')}
                  </p>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Metric: Meetings Count */}
          <BentoCard colSpan={1} className="hover:border-primary/30">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t('dashboard.metrics.meetings')}</p>
                <p className="text-3xl font-bold tracking-tight text-foreground">
                  {isLoading ? '—' : String(stats?.meetings_count ?? recentMeetings.length)}
                </p>
              </div>
              <div className="rounded-2xl p-3 bg-primary/10 text-primary">
                <Mic className="h-5 w-5" />
              </div>
            </div>
          </BentoCard>

          {/* Metric: Summaries Count */}
          <BentoCard colSpan={1} className="hover:border-impulso-ocean/30">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t('dashboard.metrics.summaries')}</p>
                <p className="text-3xl font-bold tracking-tight text-foreground">
                  {isLoading ? '—' : String(stats?.summaries_count ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl p-3 bg-impulso-ocean/10 text-impulso-ocean">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </BentoCard>

          {/* Metric: Commitments Count */}
          <BentoCard colSpan={1} className="hover:border-impulso-baltic/30">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t('dashboard.metrics.commitments')}</p>
                <p className="text-3xl font-bold tracking-tight text-foreground">
                  {isLoading ? '—' : String(stats?.pending_commitments ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl p-3 bg-impulso-baltic/10 text-impulso-baltic">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
          </BentoCard>

          {/* Recent Meetings list */}
          <BentoCard colSpan={2} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground font-heading">
                  {t('dashboard.recent_meetings')}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {recentMeetings.length > 0 ? `${recentMeetings.length} ${t('dashboard.metrics.meetings').toLowerCase()}` : t('dashboard.no_meetings')}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => router.push('/reuniones')}
                className="text-muted-foreground hover:text-foreground hover:bg-muted font-medium text-sm rounded-full px-4"
              >
                {t('dashboard.open')}
              </Button>
            </div>

            <div className="space-y-2 flex-1">
              {recentMeetings.length === 0 ? (
                <div className="flex items-center justify-center h-48 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                  {t('dashboard.no_meetings')}
                </div>
              ) : (
                recentMeetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3.5 text-left transition-all hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 ring-ring"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground text-sm">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {meeting.createdAt ? formatDate(meeting.createdAt) : meeting.id}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
                  </button>
                ))
              )}
            </div>
          </BentoCard>

          {/* Sidebar CTA Card (Right columns) */}
          <BentoCard colSpan={1} className="flex flex-col justify-between border-border bg-card">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground font-heading">
                  {t('dashboard.view_all')}
                </h2>
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t('meetings.subtitle')}
              </p>
            </div>
            
            <div className="mt-6 space-y-3">
              <Button
                onClick={() => router.push('/reuniones')}
                className="h-10 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all font-medium text-sm focus-visible:ring-2 ring-ring"
              >
                {t('dashboard.view_all')}
              </Button>
              
              {/* Extra branding signature slot inside bento layout */}
              <div className="pt-2 text-center">
                <span className="text-[10px] text-muted-foreground/50 tracking-wider uppercase font-semibold">
                  {t('brand.developed_by')}
                </span>
              </div>
            </div>
          </BentoCard>

        </BentoGrid>
      </div>
    </motion.div>
  );
}
