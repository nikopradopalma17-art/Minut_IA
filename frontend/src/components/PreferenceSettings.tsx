'use client';

import { useEffect, useState } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useTemplates } from '@/hooks/meeting-details/useTemplates';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { normalizeMeetingNamePrefix } from '@/lib/meetingDefaults';

/** The General tab intentionally contains only meeting defaults. */
export function PreferenceSettings() {
  const { meetingNamePrefix, setMeetingNamePrefix, defaultTemplateId, setDefaultTemplateId } = useConfig();
  const { t } = useTranslation();
  const { availableTemplates } = useTemplates();
  const [meetingPrefixDraft, setMeetingPrefixDraft] = useState(meetingNamePrefix);

  useEffect(() => setMeetingPrefixDraft(meetingNamePrefix), [meetingNamePrefix]);

  const handleMeetingPrefixCommit = () => {
    const sanitizedPrefix = normalizeMeetingNamePrefix(meetingPrefixDraft);
    setMeetingPrefixDraft(sanitizedPrefix);
    setMeetingNamePrefix(sanitizedPrefix);
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-2">{t('settings.defaults_title')}</h3>
        <p className="text-sm text-muted-foreground mb-6">{t('settings.defaults_desc')}</p>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('settings.default_template')}</label>
            <Select value={defaultTemplateId} onValueChange={setDefaultTemplateId}>
              <SelectTrigger><SelectValue placeholder={t('settings.default_template')} /></SelectTrigger>
              <SelectContent>
                {availableTemplates.map(template => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="meeting-name-prefix">{t('settings.meeting_prefix')}</label>
            <Input id="meeting-name-prefix" value={meetingPrefixDraft} onChange={event => setMeetingPrefixDraft(event.target.value)} onBlur={handleMeetingPrefixCommit} placeholder="Reunión" />
            <p className="text-xs text-muted-foreground">{t('settings.meeting_prefix_hint').replace('{preview}', `${meetingPrefixDraft || 'Reunión'}.2026-07-12.14.05`)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
