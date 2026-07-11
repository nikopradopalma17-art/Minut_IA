import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import Image from 'next/image';
import { useTranslation } from '@/contexts/TranslationContext';

export function About() {
  const { t } = useTranslation();
  const [currentVersion, setCurrentVersion] = useState<string>('0.4.0');

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(console.error);
  }, []);

  return (
    <div className="h-[min(80vh,720px)] space-y-6 overflow-y-auto px-1 pr-2 text-foreground">
      <header className="flex items-center gap-4 border-b border-border/70 pb-5">
        <Image
          src={`/icon_128x128.png?v=${encodeURIComponent(currentVersion)}`}
          alt="MinutIA Logo"
          width={64}
          height={64}
          className="shrink-0"
          priority
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="font-heading text-xl font-semibold text-impulso-navy">
              {t('about.title')}
            </h1>
            <span className="text-xs text-muted-foreground">v{currentVersion}</span>
          </div>
          <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            {t('about.tagline')}
          </p>
        </div>
      </header>

      <section className="rounded-xl bg-impulso-obsidian p-5 text-white">
        <h2 className="font-heading text-base font-semibold">{t('about.mission_title')}</h2>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-white/80">
          {t('about.mission_body')}
        </p>
      </section>

      <section>
        <h2 className="font-heading text-base font-semibold text-impulso-navy">
          {t('about.vision_title')}
        </h2>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          {t('about.vision_body')}
        </p>
      </section>

      <div className="border-t border-border/70 pt-5">
        <section className="rounded-xl bg-secondary/70 p-4">
          <div className="flex items-start gap-3">
            <Image
              src="/brand/impulso-logo.svg"
              alt="Impulso IA Logo"
              width={48}
              height={48}
              className="shrink-0"
            />
            <div className="min-w-0">
              <h2 className="font-heading text-base font-semibold text-impulso-navy">
                {t('about.impulso_title')}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t('about.impulso_body')}
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="space-y-2 border-t border-border/70 pt-5 text-center">
        <p className="text-xs font-semibold text-muted-foreground">
          {t('brand.developed_by')}
        </p>
        <p className="text-[10px] text-muted-foreground/70">{t('about.local_edition')}</p>
      </footer>
    </div>
  );
}
