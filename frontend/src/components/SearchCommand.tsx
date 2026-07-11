'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sparkles, FileText, CalendarClock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/TranslationContext';
import {
  searchService,
  type SmartSearchCommitmentHit,
  type SmartSearchContentHit,
  type SmartSearchMeetingHit,
  type SmartSearchResults,
} from '@/services/searchService';

function formatDate(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date);
}

function renderSnippet(snippet: string) {
  const parts = snippet.split(/(<\/?b>)/g);
  let bold = false;

  return parts.map((part, index) => {
    if (part === '<b>') {
      bold = true;
      return null;
    }

    if (part === '</b>') {
      bold = false;
      return null;
    }

    if (!part) {
      return null;
    }

    return (
      <span
        key={`${index}-${part}`}
        className={bold ? 'rounded bg-impulso-ocean/10 px-0.5 font-semibold text-foreground' : undefined}
      >
        {part}
      </span>
    );
  });
}

function MeetingResult({
  item,
  onOpen,
}: {
  item: SmartSearchMeetingHit;
  onOpen: (meetingId: string, title: string) => void;
}) {
  return (
    <CommandItem value={`${item.title} ${item.id}`} onSelect={() => onOpen(item.id, item.title)}>
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.id}</p>
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
      </div>
    </CommandItem>
  );
}

function ContentResult({
  item,
  onOpen,
  icon,
}: {
  item: SmartSearchContentHit;
  onOpen: (meetingId: string, title: string) => void;
  icon: ReactNode;
}) {
  return (
    <CommandItem
      value={`${item.meetingTitle} ${item.snippet}`}
      onSelect={() => onOpen(item.meetingId, item.meetingTitle)}
      className="items-start"
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium text-foreground">{item.meetingTitle}</p>
        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{renderSnippet(item.snippet)}</p>
      </div>
    </CommandItem>
  );
}

function CommitmentResult({
  item,
  onOpen,
}: {
  item: SmartSearchCommitmentHit;
  onOpen: (commitmentId: string) => void;
}) {
  return (
    <CommandItem
      value={`${item.description} ${item.meeting_title} ${item.responsible ?? ''}`}
      onSelect={() => onOpen(item.id)}
      className="items-start"
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-impulso-ocean/10 text-impulso-ocean">
        <Sparkles size={14} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium text-foreground">{item.description}</p>
        <p className="text-xs text-muted-foreground">
          {item.meeting_title}
          {item.responsible ? ` · ${item.responsible}` : ''}
          {item.due_date ? ` · ${item.due_date}` : ''}
        </p>
      </div>
    </CommandItem>
  );
}

export function SearchCommand() {
  const { t } = useTranslation();
  const { setCurrentMeeting } = useSidebar();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SmartSearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const requestIdRef = useRef(0);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setResults(null);
    setIsSearching(false);
  }, []);

  const openMeeting = useCallback(
    (meetingId: string, title: string) => {
      setCurrentMeeting({ id: meetingId, title });
      closePalette();
      router.push(`/meeting-details?id=${encodeURIComponent(meetingId)}`);
    },
    [closePalette, router, setCurrentMeeting]
  );

  const openCommitment = useCallback(
    (commitmentId: string) => {
      closePalette();
      router.push(`/compromisos?highlight=${encodeURIComponent(commitmentId)}`);
    },
    [closePalette, router]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!debouncedQuery) {
      setResults(null);
      setIsSearching(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsSearching(true);

    void searchService
      .smartSearch(debouncedQuery)
      .then((response) => {
        if (requestId === requestIdRef.current) {
          setResults(response);
        }
      })
      .catch((error) => {
        console.error('Smart search failed:', error);
        if (requestId === requestIdRef.current) {
          setResults({
            meetings: [],
            transcripts: [],
            summaries: [],
            commitments: [],
            usedFts: false,
          });
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      });
  }, [debouncedQuery, open]);

  const hasResults =
    (results?.meetings.length ?? 0) > 0 ||
    (results?.transcripts.length ?? 0) > 0 ||
    (results?.summaries.length ?? 0) > 0 ||
    (results?.commitments.length ?? 0) > 0;

  const emptyMessage = useMemo(() => {
    if (!debouncedQuery) {
      return t('search.type_to_search');
    }
    if (isSearching) {
      return t('search.searching');
    }
    return t('search.no_results');
  }, [debouncedQuery, isSearching, t]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closePalette())}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('search.description')}</DialogDescription>
        <Command shouldFilter={false} className="w-full">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('search.placeholder')}
            autoFocus
          />
          <CommandList className="max-h-[60vh]">
            {!hasResults ? (
              <>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandSeparator />
                <CommandGroup heading={t('search.group_future')}>
                  <CommandItem disabled className="items-center text-muted-foreground">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <CalendarClock size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t('search.ask_ai')}</p>
                      <p className="text-xs text-muted-foreground">{t('search.ask_ai_desc')}</p>
                    </div>
                  </CommandItem>
                </CommandGroup>
              </>
            ) : (
              <>
                {results?.meetings.length ? (
                  <CommandGroup heading={t('search.group_meetings')}>
                    {results.meetings.map((item) => (
                      <MeetingResult key={item.id} item={item} onOpen={openMeeting} />
                    ))}
                  </CommandGroup>
                ) : null}

                {results?.transcripts.length ? (
                  <>
                    {results?.meetings.length ? <CommandSeparator /> : null}
                    <CommandGroup heading={t('search.group_transcripts')}>
                      {results.transcripts.map((item) => (
                        <ContentResult
                          key={`${item.meetingId}-${item.snippet}`}
                          item={item}
                          onOpen={openMeeting}
                          icon={<FileText size={14} />}
                        />
                      ))}
                    </CommandGroup>
                  </>
                ) : null}

                {results?.summaries.length ? (
                  <>
                    {(results?.meetings.length || results?.transcripts.length) ? <CommandSeparator /> : null}
                    <CommandGroup heading={t('search.group_summaries')}>
                      {results.summaries.map((item) => (
                        <ContentResult
                          key={`summary-${item.meetingId}-${item.snippet}`}
                          item={item}
                          onOpen={openMeeting}
                          icon={<Search size={14} />}
                        />
                      ))}
                    </CommandGroup>
                  </>
                ) : null}

                {results?.commitments.length ? (
                  <>
                    {(results?.meetings.length || results?.transcripts.length || results?.summaries.length) ? (
                      <CommandSeparator />
                    ) : null}
                    <CommandGroup heading={t('search.group_commitments')}>
                      {results.commitments.map((item) => (
                        <CommitmentResult key={item.id} item={item} onOpen={openCommitment} />
                      ))}
                    </CommandGroup>
                  </>
                ) : null}

                <CommandSeparator />
                <CommandGroup heading={t('search.group_future')}>
                  <CommandItem disabled className="items-center text-muted-foreground">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <CalendarClock size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t('search.ask_ai')}</p>
                      <p className="text-xs text-muted-foreground">{t('search.ask_ai_desc')}</p>
                    </div>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
