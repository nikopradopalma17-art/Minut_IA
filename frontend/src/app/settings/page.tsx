'use client';

import HubTopNav from '@/components/HubTopNav';
import { SettingsPanel } from '@/components/SettingsPanel';
import { useTranslation } from '@/contexts/TranslationContext';

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="h-dvh bg-background overflow-hidden flex flex-col">
      <HubTopNav active="ajustes" />
      <main className="flex-1 min-h-0 overflow-y-auto max-w-6xl mx-auto px-4 py-6 sm:px-6 xl:px-8 w-full">
        <h1 className="font-heading text-3xl font-bold text-foreground mb-6">{t('settings.title')}</h1>
        <SettingsPanel />
      </main>
    </div>
  );
}
