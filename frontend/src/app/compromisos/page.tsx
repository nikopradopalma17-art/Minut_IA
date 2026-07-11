'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarClock,
  CheckSquare2,
  CircleDot,
  Clock3,
  RefreshCw,
  Search,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';

type CommitmentStatus = 'pending' | 'in_progress' | 'completed';
type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'later';

interface CommitmentItem {
  id: string;
  meeting_id: string;
  meeting_title: string;
  responsible: string | null;
  description: string;
  due_date: string | null;
  status: CommitmentStatus | string;
  created_at: string;
  updated_at: string;
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDateOnly(value?: string | null) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date);
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function CompromisosContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentMeeting } = useSidebar();

  const [commitments, setCommitments] = useState<CommitmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CommitmentStatus>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [highlightedCommitmentId, setHighlightedCommitmentId] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadCommitments = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<CommitmentItem[]>('api_get_commitments');
      if (isMountedRef.current) {
        setCommitments(result);
      }
    } catch (invokeError) {
      console.error('Failed to load commitments:', invokeError);
      if (isMountedRef.current) {
        setError(
          invokeError instanceof Error
            ? invokeError.message
            : 'Unable to load commitments.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadCommitments();
  }, []);

  const highlightId = searchParams.get('highlight');

  useEffect(() => {
    if (!highlightId) {
      setHighlightedCommitmentId(null);
      return;
    }

    setHighlightedCommitmentId(highlightId);
  }, [highlightId]);

  useEffect(() => {
    if (!highlightedCommitmentId) {
      return;
    }

    const element = document.getElementById(`commitment-${highlightedCommitmentId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedCommitmentId, commitments.length]);

  const today = useMemo(() => startOfToday(), []);
  const weekAhead = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 7);
    return date;
  }, [today]);

  const filteredCommitments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedResponsible = responsibleFilter.trim().toLowerCase();

    return commitments.filter((commitment) => {
      if (statusFilter !== 'all' && commitment.status !== statusFilter) {
        return false;
      }

      if (normalizedQuery) {
        const haystack = [
          commitment.description,
          commitment.meeting_title,
          commitment.meeting_id,
          commitment.responsible ?? '',
          commitment.due_date ?? '',
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }

      if (normalizedResponsible) {
        const responsible = (commitment.responsible ?? '').toLowerCase();
        if (!responsible.includes(normalizedResponsible)) {
          return false;
        }
      }

      const dueDate = parseDateOnly(commitment.due_date);
      const isCompleted = commitment.status === 'completed';
      const isOverdue = !!dueDate && !isCompleted && dueDate.getTime() < today.getTime();
      const isToday = !!dueDate && !isCompleted && dueDate.getTime() === today.getTime();
      const isThisWeek =
        !!dueDate && !isCompleted && dueDate.getTime() > today.getTime() && dueDate <= weekAhead;

      switch (dueFilter) {
        case 'overdue':
          return isOverdue;
        case 'today':
          return isToday;
        case 'week':
          return isThisWeek;
        case 'later':
          return !!dueDate && !isCompleted && dueDate > weekAhead;
        default:
          return true;
      }
    });
  }, [commitments, dueFilter, query, responsibleFilter, statusFilter, today, weekAhead]);

  const overview = useMemo(() => {
    const open = commitments.filter((item) => item.status !== 'completed').length;
    const pending = commitments.filter((item) => item.status === 'pending').length;
    const inProgress = commitments.filter((item) => item.status === 'in_progress').length;
    const completed = commitments.filter((item) => item.status === 'completed').length;
    const overdue = commitments.filter((item) => {
      const dueDate = parseDateOnly(item.due_date);
      return !!dueDate && item.status !== 'completed' && dueDate.getTime() < today.getTime();
    }).length;

    return { open, pending, inProgress, completed, overdue };
  }, [commitments, today]);

  const getStatusLabel = (status: CommitmentStatus | string) => {
    switch (status) {
      case 'pending':
        return t('commitments.pending');
      case 'in_progress':
        return t('commitments.in_progress');
      case 'completed':
        return t('commitments.completed');
      default:
        return status;
    }
  };

  const getStatusTone = (status: CommitmentStatus | string) => {
    switch (status) {
      case 'pending':
        return 'border-border bg-muted text-muted-foreground';
      case 'in_progress':
        return 'border-impulso-ocean/30 bg-impulso-ocean/10 text-impulso-ocean';
      case 'completed':
        return 'border-primary/30 bg-primary/10 text-primary';
      default:
        return 'border-border bg-muted text-muted-foreground';
    }
  };

  const getDueLabel = (commitment: CommitmentItem) => {
    const dueDate = parseDateOnly(commitment.due_date);
    if (!dueDate) return '—';

    const isCompleted = commitment.status === 'completed';
    const base = formatDateOnly(commitment.due_date);

    if (!isCompleted && dueDate.getTime() < today.getTime()) {
      return `${base} · ${t('commitments.overdue')}`;
    }
    if (dueDate.getTime() === today.getTime()) {
      return `${base} · ${t('commitments.due_today')}`;
    }
    if (dueDate <= weekAhead) {
      return `${base} · ${t('commitments.due_this_week')}`;
    }
    return base;
  };

  const handleStatusUpdate = async (commitmentId: string, status: CommitmentStatus) => {
    setUpdatingId(commitmentId);
    try {
      await invoke('api_update_commitment_status', {
        commitmentId,
        status,
      });
      await loadCommitments();
    } catch (updateError) {
      console.error('Failed to update commitment status:', updateError);
    } finally {
      if (isMountedRef.current) {
        setUpdatingId(null);
      }
    }
  };

  const openMeeting = (meetingId: string, meetingTitle: string) => {
    setCurrentMeeting({ id: meetingId, title: meetingTitle });
    router.push(`/meeting-details?id=${meetingId}`);
  };

  const summaryCards = [
    {
      label: t('dashboard.metrics.commitments'),
      value: overview.open,
      icon: CircleDot,
      tone: 'bg-primary/10 text-primary',
    },
    {
      label: t('commitments.overdue'),
      value: overview.overdue,
      icon: Clock3,
      tone: 'bg-destructive/10 text-destructive',
    },
    {
      label: t('commitments.in_progress'),
      value: overview.inProgress,
      icon: CalendarClock,
      tone: 'bg-impulso-ocean/10 text-impulso-ocean',
    },
    {
      label: t('commitments.completed'),
      value: overview.completed,
      icon: CheckSquare2,
      tone: 'bg-impulso-navy/10 text-impulso-navy',
    },
  ];

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
                <CheckSquare2 className="h-3.5 w-3.5" />
                {t('nav.commitments')}
              </div>
              <div>
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                  {t('commitments.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t('commitments.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={loadCommitments}
                className="h-11 px-5"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('commitments.refresh')}
              </Button>
              <Button
                onClick={() => router.push('/minutas')}
                className="h-11 px-5"
              >
                {t('minutes.open_details')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-2xl border border-border bg-muted/40 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                      <p className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                        {isLoading ? '-' : card.value}
                      </p>
                    </div>
                    <div className={`rounded-2xl p-3 ${card.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('commitments.search')}
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t('commitments.table_commitment')}
                      className="h-11 rounded-lg bg-muted/40 pl-10 shadow-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('commitments.responsible_filter')}
                  </label>
                  <Input
                    value={responsibleFilter}
                    onChange={(event) => setResponsibleFilter(event.target.value)}
                    placeholder={t('commitments.owner')}
                    className="h-11 rounded-lg bg-muted/40 shadow-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('commitments.all_statuses')}
                  </label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                    <SelectTrigger className="h-11 rounded-lg bg-muted/40 shadow-none">
                      <SelectValue placeholder={t('commitments.all_statuses')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('commitments.all_statuses')}</SelectItem>
                      <SelectItem value="pending">{t('commitments.pending')}</SelectItem>
                      <SelectItem value="in_progress">{t('commitments.in_progress')}</SelectItem>
                      <SelectItem value="completed">{t('commitments.completed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('commitments.due_filter')}
                  </label>
                  <Select value={dueFilter} onValueChange={(value) => setDueFilter(value as DueFilter)}>
                    <SelectTrigger className="h-11 rounded-lg bg-muted/40 shadow-none">
                      <SelectValue placeholder={t('commitments.due_filter')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('commitments.all_statuses')}</SelectItem>
                      <SelectItem value="overdue">{t('commitments.overdue')}</SelectItem>
                      <SelectItem value="today">{t('commitments.due_today')}</SelectItem>
                      <SelectItem value="week">{t('commitments.due_this_week')}</SelectItem>
                      <SelectItem value="later">{t('commitments.due_later')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {isLoading ? (
                <div className="p-8 text-sm text-muted-foreground">{t('dashboard.subtitle')}</div>
              ) : filteredCommitments.length === 0 ? (
                <div className="p-8">
                  <div className="flex items-center gap-3 text-foreground">
                    <CircleDot className="h-5 w-5 text-primary" />
                    <h2 className="font-heading text-lg font-semibold">
                      {commitments.length === 0 ? t('commitments.empty') : t('commitments.no_results')}
                    </h2>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {t('commitments.source_meeting_desc')}
                  </p>
                  <Button
                    onClick={() => router.push('/minutas')}
                    className="mt-6 h-11 px-5"
                  >
                    {t('minutes.open_details')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('commitments.table_commitment')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('commitments.table_meeting')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('commitments.table_responsible')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('commitments.table_due_date')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('commitments.table_status')}
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('commitments.table_actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {filteredCommitments.map((commitment) => (
                        <tr
                          key={commitment.id}
                          id={`commitment-${commitment.id}`}
                          className={`transition-colors ${
                            commitment.id === highlightedCommitmentId
                              ? 'bg-primary/10'
                              : commitment.status === 'completed'
                                ? 'bg-muted/40'
                                : ''
                          }`}
                        >
                          <td className="px-6 py-5 align-top">
                            <div className="max-w-xl space-y-2">
                              <p className="text-sm font-medium leading-6 text-foreground">
                                {commitment.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t('commitments.updated')}: {formatDateTime(commitment.updated_at) || '—'}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <button
                              onClick={() => openMeeting(commitment.meeting_id, commitment.meeting_title)}
                              className="text-left text-sm font-medium text-primary transition-colors hover:text-primary/80"
                            >
                              {commitment.meeting_title}
                            </button>
                            <p className="mt-1 text-xs text-muted-foreground">{commitment.meeting_id}</p>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <span className="inline-flex rounded-full border border-border bg-muted/40 px-3 py-1 text-sm text-foreground">
                              {commitment.responsible || t('commitments.unassigned')}
                            </span>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <div className="space-y-1">
                              <p className="text-sm text-foreground">{getDueLabel(commitment)}</p>
                              <p className="text-xs text-muted-foreground">{commitment.due_date || '—'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium capitalize ${getStatusTone(commitment.status)}`}
                            >
                              {getStatusLabel(commitment.status)}
                            </span>
                            <div className="mt-3 max-w-[180px]">
                              <Select
                                value={commitment.status}
                                onValueChange={(value) => {
                                  void handleStatusUpdate(commitment.id, value as CommitmentStatus);
                                }}
                                disabled={updatingId === commitment.id}
                              >
                                <SelectTrigger className="h-9 rounded-lg bg-muted/40 shadow-none">
                                  <SelectValue placeholder={t('commitments.change_status')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">{t('commitments.pending')}</SelectItem>
                                  <SelectItem value="in_progress">{t('commitments.in_progress')}</SelectItem>
                                  <SelectItem value="completed">{t('commitments.completed')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                          <td className="px-6 py-5 align-top text-right">
                            <Button
                              variant="outline"
                              onClick={() => openMeeting(commitment.meeting_id, commitment.meeting_title)}
                              className="h-10 px-4"
                            >
                              {t('commitments.open_meeting')}
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">{t('dashboard.metrics.commitments')}</p>
              <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
                {isLoading ? '-' : overview.open}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
            </div>

            <div className="rounded-2xl border border-border bg-secondary p-6">
              <p className="text-sm font-medium text-secondary-foreground">
                {t('commitments.source_meeting')}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('commitments.source_meeting_desc')}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">{t('commitments.filters')}</p>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">{t('commitments.pending')}:</span>{' '}
                  {overview.pending}
                </p>
                <p>
                  <span className="font-medium text-foreground">{t('commitments.in_progress')}:</span>{' '}
                  {overview.inProgress}
                </p>
                <p>
                  <span className="font-medium text-foreground">{t('commitments.completed')}:</span>{' '}
                  {overview.completed}
                </p>
                <p>
                  <span className="font-medium text-foreground">{t('commitments.overdue')}:</span>{' '}
                  {overview.overdue}
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </motion.div>
  );
}

export default function CompromisosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <CompromisosContent />
    </Suspense>
  );
}
