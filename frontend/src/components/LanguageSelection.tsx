import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { toast } from 'sonner';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/TranslationContext';

export interface Language {
  code: string;
  name: string;
}

// ISO 639-1 language codes supported by Whisper (Restricted to Spanish & English for MinutIA)
const LANGUAGES: Language[] = [
  { code: 'auto', name: 'Auto Detect (Original Language) / Detectar Automáticamente' },
  { code: 'auto-translate', name: 'Auto Detect (Translate to English) / Traducir a Inglés' },
  { code: 'es', name: 'Spanish / Español' },
  { code: 'en', name: 'English / Inglés' },
];

interface LanguageSelectionProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
  provider?: 'localWhisper' | 'parakeet' | 'deepgram' | 'elevenLabs' | 'groq' | 'openai';
}

export function LanguageSelection({
  selectedLanguage,
  onLanguageChange,
  disabled = false,
  provider = 'localWhisper'
}: LanguageSelectionProps) {
  const [saving, setSaving] = useState(false);
  const { setSelectedLanguage } = useConfig();
  const { t } = useTranslation();

  // Parakeet only supports auto-detection (doesn't support manual language selection)
  const isParakeet = provider === 'parakeet';
  const availableLanguages = (isParakeet
    ? [
        { code: 'auto', name: t('transcription.auto_detect') },
        { code: 'auto-translate', name: t('transcription.auto_translate') },
      ]
    : [
        { code: 'auto', name: t('transcription.auto_detect') },
        { code: 'auto-translate', name: t('transcription.auto_translate') },
        { code: 'es', name: t('transcription.spanish') },
        { code: 'en', name: t('transcription.english') },
      ]) as Language[];

  const handleLanguageChange = async (languageCode: string) => {
    setSaving(true);
    try {
      // Save language preference to localStorage and sync to backend
      setSelectedLanguage(languageCode);
      onLanguageChange(languageCode);
      console.log('Language preference saved:', languageCode);

      // Track language selection analytics
      const selectedLang = availableLanguages.find(lang => lang.code === languageCode);
      await Analytics.track('language_selected', {
        language_code: languageCode,
        language_name: selectedLang?.name || 'Unknown',
        is_auto_detect: (languageCode === 'auto').toString(),
        is_auto_translate: (languageCode === 'auto-translate').toString()
      });

      // Show success toast
      const languageName = selectedLang?.name || languageCode;
      toast.success(t("language.saved"), {
        description: t("language.saved_desc").replace('{language}', languageName)
      });
    } catch (error) {
      console.error('Failed to save language preference:', error);
      toast.error(t("language.save_failed"), {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setSaving(false);
    }
  };

  // Find the selected language name for display
  const selectedLanguageName = availableLanguages.find(
    lang => lang.code === selectedLanguage
  )?.name || t('transcription.auto_detect');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-foreground">{t("transcription.language_title")}</h4>
        </div>
      </div>

      <div className="space-y-2">
        <select
          value={selectedLanguage}
          onChange={(e) => handleLanguageChange(e.target.value)}
          disabled={disabled || saving}
          className="w-full px-3 py-2 text-sm bg-card border border-border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
        >
          {availableLanguages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
              {language.code !== 'auto' && language.code !== 'auto-translate' && ` (${language.code})`}
            </option>
          ))}
        </select>

        {/* Parakeet language limitation warning */}
        {isParakeet && (
          <div className="p-2 bg-impulso-ocean/10 border border-impulso-ocean/30 rounded text-impulso-ocean">
            <p className="font-medium">{t("transcription.parakeet_support_title")}</p>
            <p className="mt-1 text-xs">{t("transcription.parakeet_support_desc")}</p>
          </div>
        )}

        {/* Info text */}
        <div className="text-xs space-y-2 pt-2">
          <p className="text-muted-foreground">
            <strong>{t("transcription.current")}</strong> {selectedLanguageName}
          </p>
          {selectedLanguage === 'auto' && (
            <div className="p-2 bg-impulso-ocean/10 border border-impulso-ocean/30 rounded text-impulso-ocean">
              <p className="font-medium">{t("transcription.auto_warning_title")}</p>
              <p className="mt-1">{t("transcription.auto_warning_desc")}</p>
            </div>
          )}
          {selectedLanguage === 'auto-translate' && (
            <div className="p-2 bg-primary/10 border border-primary/30 rounded text-primary">
              <p className="font-medium">{t("transcription.translation_title")}</p>
              <p className="mt-1">{t("transcription.translation_desc")}</p>
            </div>
          )}
          {selectedLanguage !== 'auto' && selectedLanguage !== 'auto-translate' && (
            <p className="text-muted-foreground">
              {t("transcription.optimized_for")} <strong>{selectedLanguageName}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
