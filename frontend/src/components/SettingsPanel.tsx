'use client';

import { useState } from 'react';
import { Database, Mic, Settings2, SparkleIcon } from 'lucide-react';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { RecordingSettings } from '@/components/RecordingSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { TranscriptSettings } from '@/components/TranscriptSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/TranslationContext';

const tabs = [
  { value: 'general', labelKey: 'settings.general', icon: Settings2 },
  { value: 'recording', labelKey: 'settings.recordings', icon: Mic },
  { value: 'transcription', labelKey: 'settings.transcription', icon: Database },
  { value: 'summary', labelKey: 'settings.summary', icon: SparkleIcon },
] as const;

export function SettingsPanel() {
  const { t } = useTranslation();
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['value']>('general');

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
      <TabsList className="h-auto flex-wrap bg-transparent">
        {tabs.map(({ value, labelKey, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="general"><PreferenceSettings /></TabsContent>
      <TabsContent value="recording"><RecordingSettings /></TabsContent>
      <TabsContent value="transcription">
        <TranscriptSettings
          transcriptModelConfig={transcriptModelConfig}
          setTranscriptModelConfig={setTranscriptModelConfig}
        />
      </TabsContent>
      <TabsContent value="summary"><SummaryModelSettings /></TabsContent>
    </Tabs>
  );
}
