import React from 'react';
import { Upload } from 'lucide-react';
import { getAudioFormatsDisplayList } from '@/constants/audioFormats';
import { useTranslation } from '@/contexts/TranslationContext';

interface ImportDropOverlayProps {
  visible: boolean;
}

export function ImportDropOverlay({ visible }: ImportDropOverlayProps) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-impulso-obsidian/70 backdrop-blur-sm
                 flex items-center justify-center pointer-events-none
                 transition-opacity duration-200"
    >
      <div className="border-2 border-dashed border-primary rounded-2xl
                      p-12 text-center bg-impulso-navy/50 shadow-2xl
                      transform scale-100 transition-transform">
        <Upload className="h-16 w-16 text-primary mx-auto mb-4" />
        <p className="text-xl font-medium text-white">{t('import.drop_overlay')}</p>
        <p className="text-sm text-primary/80 mt-2">{getAudioFormatsDisplayList()}</p>
      </div>
    </div>
  );
}
