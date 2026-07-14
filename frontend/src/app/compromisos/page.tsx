'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckSquare2,
  CircleDot,
  Clock3,
  Edit2,
  FileText,
  Mic,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';
import HubTopNav from '@/components/HubTopNav';

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

interface DashboardStats {
  meetings_count: number;
  summaries_count: number;
  pending_commitments: number;
}

interface MeetingItem {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
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
  const { setCurrentMeeting, currentMeeting } = useSidebar();

  const [commitments, setCommitments] = useState<CommitmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CommitmentStatus>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [highlightedCommitmentId, setHighlightedCommitmentId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [meetingQuery, setMeetingQuery] = useState('');
  const [isHubLoading, setIsHubLoading] = useState(true);

  // Edit/delete meeting modals (mirrors the sidebar pattern so both surfaces
  // reuse the same backend commands: api_save_meeting_title / api_delete_meeting).
  const [editModalState, setEditModalState] = useState<{ isOpen: boolean; meetingId: string | null; currentTitle: string }>({ isOpen: false, meetingId: null, currentTitle: '' });
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; meetingId: string | null; title: string }>({ isOpen: false, meetingId: null, title: '' });
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [isDeletingMeeting, setIsDeletingMeeting] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const loadHubData = async () => {
      try {
        const [statsResult, meetingsResult] = await Promise.all([
          invoke<DashboardStats>('api_get_dashboard_stats'),
          invoke<MeetingItem[]>('api_get_meetings'),
        ]);
        if (!cancelled) {
          setStats(statsResult);
          setMeetings(meetingsResult);
        }
      } catch (hubError) {
        console.error('Failed to load meetings hub:', hubError);
      } finally {
        if (!cancelled) setIsHubLoading(false);
      }
    };
    void loadHubData();
    return () => { cancelled = true; };
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

  const filteredMeetings = useMemo(() => {
    const normalized = meetingQuery.trim().toLowerCase();
    return [...meetings]
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .filter((meeting) => !normalized || meeting.title.toLowerCase().includes(normalized));
  }, [meetingQuery, meetings]);

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
        return 'border-[#1a2d42] bg-[#061222] text-[#7a9ab5]';
      case 'in_progress':
        return 'border-impulso-ocean/30 bg-impulso-ocean/10 text-impulso-ocean';
      case 'completed':
        return 'border-[#447794]/30 bg-[#447794]/10 text-[#447794]';
      default:
        return 'border-[#1a2d42] bg-[#061222] text-[#7a9ab5]';
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
    router.push(`/?meeting=${meetingId}`);
  };

  // ── Edit meeting handlers ──
  const handleEditStart = (meetingId: string, currentTitle: string) => {
    setEditModalState({ isOpen: true, meetingId, currentTitle });
    setEditingTitle(currentTitle);
  };

  const handleEditConfirm = async () => {
    const newTitle = editingTitle.trim();
    const meetingId = editModalState.meetingId;
    if (!meetingId) return;
    if (!newTitle) {
      toast.error('El nombre no puede estar vacío.');
      return;
    }
    if (newTitle === editModalState.currentTitle) {
      setEditModalState({ isOpen: false, meetingId: null, currentTitle: '' });
      setEditingTitle('');
      return;
    }
    setIsSavingMeeting(true);
    try {
      await invoke('api_save_meeting_title', { meetingId, title: newTitle });
      setMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, title: newTitle } : m)));
      if (currentMeeting?.id === meetingId) {
        setCurrentMeeting({ id: meetingId, title: newTitle });
      }
      toast.success('Nombre de reunión actualizado.');
    } catch (editError) {
      console.error('Failed to update meeting title:', editError);
      toast.error('No se pudo actualizar el nombre.', {
        description: editError instanceof Error ? editError.message : String(editError),
      });
    } finally {
      setIsSavingMeeting(false);
      setEditModalState({ isOpen: false, meetingId: null, currentTitle: '' });
      setEditingTitle('');
    }
  };

  const handleEditCancel = () => {
    setEditModalState({ isOpen: false, meetingId: null, currentTitle: '' });
    setEditingTitle('');
  };

  // ── Delete meeting handlers ──
  const handleDeleteStart = (meetingId: string, title: string) => {
    setDeleteModalState({ isOpen: true, meetingId, title });
  };

  const handleDeleteConfirm = async () => {
    const meetingId = deleteModalState.meetingId;
    if (!meetingId) return;
    setIsDeletingMeeting(true);
    try {
      await invoke('api_delete_meeting', { meetingId });
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      if (currentMeeting?.id === meetingId) {
        setCurrentMeeting({ id: 'intro-call', title: '+ Nueva llamada' });
        router.push('/');
      }
      toast.success('Reunión eliminada.');
    } catch (deleteError) {
      console.error('Failed to delete meeting:', deleteError);
      toast.error('No se pudo eliminar la reunión.', {
        description: deleteError instanceof Error ? deleteError.message : String(deleteError),
      });
    } finally {
      setIsDeletingMeeting(false);
      setDeleteModalState({ isOpen: false, meetingId: null, title: '' });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalState({ isOpen: false, meetingId: null, title: '' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="bg-grid-subtle h-dvh font-sans flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(circle at center, #0a1628 0%, #061222 100%)', color: '#e2e8f0' }}
    >
      <HubTopNav active="reuniones" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 min-h-0 flex-col gap-8 px-4 py-6 sm:px-6 xl:px-8 overflow-y-auto">
        <header>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white">Reuniones</h1>
          <p className="mt-2 text-sm" style={{ color: '#7a9ab5' }}>Consulta tus reuniones y da seguimiento a sus compromisos.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4" aria-label="Resumen de reuniones">
          {[
            { label: 'Reuniones guardadas', value: stats?.meetings_count ?? meetings.length, icon: Mic },
            { label: 'Resúmenes IA', value: stats?.summaries_count ?? 0, icon: FileText },
            { label: 'Compromisos pendientes', value: stats?.pending_commitments ?? overview.open, icon: CheckSquare2 },
            { label: 'Vencidos', value: overview.overdue, icon: Clock3 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-3xl p-6" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#7a9ab5' }}>{label}</p><p className="mt-2 text-3xl font-bold text-white">{isHubLoading ? '—' : value}</p></div>
                <Icon className="h-5 w-5" style={{ color: '#447794' }} />
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-3xl p-6" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="font-heading text-xl font-bold text-white">Tus reuniones</h2><p className="text-xs" style={{ color: '#5a7a94' }}>{meetings.length} guardadas</p></div>
            <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: '#5a7a94' }} /><Input value={meetingQuery} onChange={(event) => setMeetingQuery(event.target.value)} placeholder="Buscar por título" className="h-11 rounded-2xl pl-10 text-white" style={{ background: '#061222', borderColor: '#1a2d42' }} /></div>
          </div>
          {filteredMeetings.length === 0 ? <p className="py-8 text-center text-sm" style={{ color: '#5a7a94' }}>{isHubLoading ? 'Cargando reuniones…' : 'No se encontraron reuniones.'}</p> : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{filteredMeetings.map((meeting) => (
              <div key={meeting.id} className="group relative rounded-2xl transition-colors hover:border-[#447794]" style={{ background: '#0a1628', border: '1px solid #1a2d42' }}>
                <button type="button" onClick={() => openMeeting(meeting.id, meeting.title)} className="block w-full p-4 text-left">
                  <span className="block font-semibold text-white truncate">{meeting.title}</span>
                  <span className="mt-1 block text-xs" style={{ color: '#5a7a94' }}>{formatDateTime(meeting.created_at) || meeting.id}</span>
                </button>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button type="button" aria-label={`Editar ${meeting.title}`} onClick={() => handleEditStart(meeting.id, meeting.title)} className="p-2 rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors hover:bg-white/5" style={{ background: '#061222', borderColor: '#1a2d42', color: '#447794' }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" aria-label={`Eliminar ${meeting.title}`} onClick={() => handleDeleteStart(meeting.id, meeting.title)} className="p-2 rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors hover:bg-red-500/10" style={{ background: '#061222', borderColor: '#1a2d42', color: '#e88' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}</div>
          )}
        </section>

        <div className="flex items-center justify-between gap-4">
          <div><h2 className="font-heading text-2xl font-bold text-white">Compromisos</h2><p className="text-sm" style={{ color: '#7a9ab5' }}>{t('commitments.subtitle')}</p></div>
          <Button variant="outline" onClick={loadCommitments} className="h-11 px-5" style={{ background: '#0d1f33', borderColor: '#1a2d42', color: '#e2e8f0' }}><RefreshCw className="mr-2 h-4 w-4" />{t('commitments.refresh')}</Button>
        </div>

        <section>
          <div className="space-y-4">
            <div className="rounded-3xl p-5" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[#7a9ab5]">
                    {t('commitments.search')}
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a7a94]" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t('commitments.table_commitment')}
                      className="h-11 rounded-lg bg-[rgba(6,18,34,0.5)] pl-10 text-white shadow-none border-[#1a2d42]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-[#7a9ab5]">
                    {t('commitments.responsible_filter')}
                  </label>
                  <Input
                    value={responsibleFilter}
                    onChange={(event) => setResponsibleFilter(event.target.value)}
                    placeholder={t('commitments.owner')}
                    className="h-11 rounded-lg bg-[rgba(6,18,34,0.5)] text-white shadow-none border-[#1a2d42]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-[#7a9ab5]">
                    {t('commitments.all_statuses')}
                  </label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                    <SelectTrigger className="h-11 rounded-lg shadow-none text-white" style={{ background: 'rgba(6,18,34,0.5)', borderColor: '#1a2d42' }}>
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
                  <label className="text-xs font-medium text-[#7a9ab5]">
                    {t('commitments.due_filter')}
                  </label>
                  <Select value={dueFilter} onValueChange={(value) => setDueFilter(value as DueFilter)}>
                    <SelectTrigger className="h-11 rounded-lg shadow-none text-white" style={{ background: 'rgba(6,18,34,0.5)', borderColor: '#1a2d42' }}>
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

            <div className="rounded-3xl" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
              {isLoading ? (
                <div className="p-8 text-sm text-[#7a9ab5]">{t('dashboard.subtitle')}</div>
              ) : filteredCommitments.length === 0 ? (
                <div className="p-8">
                  <div className="flex items-center gap-3 text-white">
                    <CircleDot className="h-5 w-5 text-[#447794]" />
                    <h2 className="font-heading text-lg font-semibold">
                      {commitments.length === 0 ? t('commitments.empty') : t('commitments.no_results')}
                    </h2>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-[#7a9ab5]">
                    {t('commitments.source_meeting_desc')}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] divide-y divide-[#1a2d42]">
                    <thead className="bg-[rgba(6,18,34,0.5)]">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#7a9ab5]">
                          {t('commitments.table_commitment')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#7a9ab5]">
                          {t('commitments.table_meeting')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#7a9ab5]">
                          {t('commitments.table_responsible')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#7a9ab5]">
                          {t('commitments.table_due_date')}
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#7a9ab5]">
                          {t('commitments.table_status')}
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#7a9ab5]">
                          {t('commitments.table_actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a2d42] bg-[#0d1f33]">
                      {filteredCommitments.map((commitment) => (
                        <tr
                          key={commitment.id}
                          id={`commitment-${commitment.id}`}
                          className={`transition-colors ${
                            commitment.id === highlightedCommitmentId
                                ? 'bg-[rgba(68,119,148,0.18)]'
                              : commitment.status === 'completed'
                                ? 'bg-[rgba(6,18,34,0.5)]'
                                : ''
                          }`}
                        >
                          <td className="px-6 py-5 align-top">
                            <div className="max-w-xl space-y-2">
                              <p className="text-sm font-medium leading-6 text-white">
                                {commitment.description}
                              </p>
                              <p className="text-xs text-[#5a7a94]">
                                {t('commitments.updated')}: {formatDateTime(commitment.updated_at) || '—'}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <button
                              onClick={() => openMeeting(commitment.meeting_id, commitment.meeting_title)}
                              className="text-left text-sm font-medium text-[#447794] transition-colors hover:text-[#7a9ab5]"
                            >
                              {commitment.meeting_title}
                            </button>
                            <p className="mt-1 text-xs text-[#5a7a94]">{commitment.meeting_id}</p>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <span className="inline-flex rounded-full border border-[#1a2d42] bg-[rgba(6,18,34,0.5)] px-3 py-1 text-sm text-white">
                              {commitment.responsible || t('commitments.unassigned')}
                            </span>
                          </td>
                          <td className="px-6 py-5 align-top">
                            <div className="space-y-1">
                              <p className="text-sm text-white">{getDueLabel(commitment)}</p>
                              <p className="text-xs text-[#5a7a94]">{commitment.due_date || '—'}</p>
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
                                <SelectTrigger className="h-9 rounded-lg shadow-none text-white" style={{ background: 'rgba(6,18,34,0.5)', borderColor: '#1a2d42' }}>
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

        </section>
      </div>

      {/* Edit meeting title modal */}
      <Dialog open={editModalState.isOpen} onOpenChange={(open) => { if (!open) handleEditCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar nombre de la reunión</DialogTitle>
            <DialogDescription>Cambia el título con el que aparece esta reunión en la lista.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            placeholder="Nombre de la reunión"
            onKeyDown={(e) => { if (e.key === 'Enter') handleEditConfirm(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleEditCancel} disabled={isSavingMeeting}>Cancelar</Button>
            <Button onClick={handleEditConfirm} disabled={isSavingMeeting || !editingTitle.trim()}>
              {isSavingMeeting ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete meeting confirmation modal */}
      <Dialog open={deleteModalState.isOpen} onOpenChange={(open) => { if (!open) handleDeleteCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar reunión</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar «{deleteModalState.title}»? Esta acción no se puede deshacer y borrará transcripciones y resúmenes asociados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleDeleteCancel} disabled={isDeletingMeeting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeletingMeeting}>
              {isDeletingMeeting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="px-8 py-10 text-center text-[11px]" style={{ color: '#5a7a94' }}>{t('brand.developed_by')}</footer>
    </motion.div>
  );
}

export default function CompromisosPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#061222]">
          <RefreshCw className="h-6 w-6 animate-spin text-[#447794]" />
        </div>
      }
    >
      <CompromisosContent />
    </Suspense>
  );
}
