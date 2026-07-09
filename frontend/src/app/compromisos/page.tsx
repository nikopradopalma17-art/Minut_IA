'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

export default function CompromisosPage() {
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
        return 'border-amber-200 bg-amber-50 text-amber-700';
      case 'in_progress':
        return 'border-blue-200 bg-blue-50 text-blue-700';
      case 'completed':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      default:
        return 'border-slate-200 bg-slate-50 text-slate-700';
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
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: t('commitments.overdue'),
      value: overview.overdue,
      icon: Clock3,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      label: t('commitments.in_progress'),
      value: overview.inProgress,
      icon: CalendarClock,
      tone: 'bg-sky-50 text-sky-700',
    },
    {
      label: t('commitments.completed'),
      value: overview.completed,
      icon: CheckSquare2,
      tone: 'bg-emerald-50 text-emerald-700',
    },
  ];

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
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <CheckSquare2 className="h-3.5 w-3.5" />
                {t('nav.commitments')}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                  {t('commitments.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {t('commitments.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={loadCommitments}
                className="h-11 rounded-full border-slate-300 bg-white px-5 text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('commitments.refresh')}
              </Button>
              <Button
                onClick={() => router.push('/minutas')}
                className="h-11 rounded-full bg-blue-700 px-5 text-white hover:bg-blue-800"
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
                  className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-500">{card.label}</p>
                      <p className="text-3xl font-semibold tracking-tight text-slate-900">
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
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('commitments.search')}
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t('commitments.table_commitment')}
                      className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 shadow-none focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('commitments.responsible_filter')}
                  </label>
                  <Input
                    value={responsibleFilter}
                    onChange={(event) => setResponsibleFilter(event.target.value)}
                    placeholder={t('commitments.owner')}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 shadow-none focus-visible:ring-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('commitments.all_statuses')}
                  </label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                    <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-slate-50 shadow-none focus:ring-blue-500">
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
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('commitments.due_filter')}
                  </label>
                  <Select value={dueFilter} onValueChange={(value) => setDueFilter(value as DueFilter)}>
                    <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-slate-50 shadow-none focus:ring-blue-500">
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
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {isLoading ? (
                <div className="p-8 text-sm text-slate-500">{t('dashboard.subtitle')}</div>
              ) : filteredCommitments.length === 0 ? (
                <div className="p-8">
                  <div className="flex items-center gap-3 text-slate-900">
                    <CircleDot className="h-5 w-5 text-amber-600" />
                    <h2 className="text-lg font-semibold">
                      {commitments.length === 0 ? t('commitments.empty') : t('commitments.no_results')}
                    </h2>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                    {t('commitments.source_meeting_desc')}
                  </p>
                  <Button
                    onClick={() => router.push('/minutas')}
                    className="mt-6 h-11 rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
                  >
                    {t('minutes.open_details')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t('commitments.table_commitment')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t('commitments.table_meeting')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t('commitments.table_responsible')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t('commitments.table_due_date')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t('commitments.table_status')}
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t('commitments.table_actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredCommitments.map((commitment) => (
                        <tr
                          key={commitment.id}
                          id={`commitment-${commitment.id}`}
                          className={`transition-colors ${
                            commitment.id === highlightedCommitmentId
                              ? 'bg-amber-50/80'
                              : commitment.status === 'completed'
                                ? 'bg-slate-50/40'
                                : ''
                          }`}
                        >
                          <td className="px-6 py-5 align-top">
                            <div className="max-w-xl space-y-2">
                              <p className="text-sm font-medium leading-6 text-slate-900">
                                {commitment.description}
                              </p>
                              <p className="text-xs text-slate-500">
                                {t('commitments.updated')}: {formatDateTime(commitment.updated_at) || '—'}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <button
                              onClick={() => openMeeting(commitment.meeting_id, commitment.meeting_title)}
                              className="text-left text-sm font-medium text-blue-700 transition-colors hover:text-blue-800"
                            >
                              {commitment.meeting_title}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">{commitment.meeting_id}</p>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                              {commitment.responsible || t('commitments.unassigned')}
                            </span>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <div className="space-y-1">
                              <p className="text-sm text-slate-700">{getDueLabel(commitment)}</p>
                              <p className="text-xs text-slate-500">{commitment.due_date || '—'}</p>
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
                                <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-slate-50 shadow-none">
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
                              className="h-10 rounded-full border-slate-300 bg-white px-4 text-slate-700 hover:bg-slate-50"
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
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{t('dashboard.metrics.commitments')}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {isLoading ? '-' : overview.open}
              </p>
              <p className="mt-2 text-sm text-slate-600">{t('dashboard.subtitle')}</p>
            </div>

            <div className="rounded-3xl border border-amber-100 bg-amber-50/70 p-6">
              <p className="text-sm font-medium text-amber-800">
                {t('commitments.source_meeting')}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t('commitments.source_meeting_desc')}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{t('commitments.filters')}</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-900">{t('commitments.pending')}:</span>{' '}
                  {overview.pending}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t('commitments.in_progress')}:</span>{' '}
                  {overview.inProgress}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t('commitments.completed')}:</span>{' '}
                  {overview.completed}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t('commitments.overdue')}:</span>{' '}
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
