'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { es } from '@/constants/locales/es';
import { en } from '@/constants/locales/en';

type Language = 'es' | 'en';

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

const dictionaries = { es, en };
const LOCALE_STORE_FILE = 'ui-preferences.json';
const LOCALE_STORE_KEY = 'uiLocale';

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('es');

  useEffect(() => {
    let cancelled = false;

    const loadLanguagePreference = async () => {
      try {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(LOCALE_STORE_FILE, {
          autoSave: false,
          defaults: {
            [LOCALE_STORE_KEY]: 'es',
          },
        });

        const saved = await store.get<Language>(LOCALE_STORE_KEY);
        if (!cancelled && (saved === 'es' || saved === 'en')) {
          setLanguageState(saved);
        } else if (!saved) {
          await store.set(LOCALE_STORE_KEY, 'es');
          await store.save();
        }
      } catch (error) {
        console.error('Failed to load UI language preference from store:', error);
        const saved = localStorage.getItem(LOCALE_STORE_KEY);
        if (!cancelled && (saved === 'es' || saved === 'en')) {
          setLanguageState(saved);
        } else if (!saved) {
          localStorage.setItem(LOCALE_STORE_KEY, 'es');
        }
      }
    };

    loadLanguagePreference();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);

    void (async () => {
      try {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(LOCALE_STORE_FILE, {
          autoSave: false,
          defaults: {
            [LOCALE_STORE_KEY]: 'es',
          },
        });
        await store.set(LOCALE_STORE_KEY, lang);
        await store.save();
      } catch (error) {
        console.error('Failed to persist UI language preference to store:', error);
        localStorage.setItem(LOCALE_STORE_KEY, lang);
      }
    })();
  };

  const t = (key: string): string => {
    const dict = dictionaries[language];
    return (dict as any)[key] || (dictionaries.es as any)[key] || key;
  };

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
