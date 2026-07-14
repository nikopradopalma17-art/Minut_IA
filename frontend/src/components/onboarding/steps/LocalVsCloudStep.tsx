import { useEffect, useState } from 'react';
import { Check, ChevronDown, Cloud, Cpu, Info, TriangleAlert } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { OnboardingContainer } from '../OnboardingContainer';

interface SystemMemoryInfo {
  total_memory_mb: number;
}

function formatMemoryGb(totalMemoryMb: number): string {
  return `${(totalMemoryMb / 1024).toFixed(1)} GB`;
}

function recommendModel(totalMemoryMb: number): { model: string; cloudRecommended: boolean } {
  // Heuristic: keep ~2x model size free for OS + app + whisper.
  if (totalMemoryMb < 4096) return { model: 'cloud', cloudRecommended: true };
  if (totalMemoryMb < 8192) return { model: 'gemma3:1b', cloudRecommended: false };
  if (totalMemoryMb < 16384) return { model: 'qwen3.5:2b', cloudRecommended: false };
  return { model: 'qwen3.5:4b', cloudRecommended: false };
}

export function LocalVsCloudStep() {
  const { goNext } = useOnboarding();
  const { t } = useTranslation();
  const [isMac, setIsMac] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [totalMemoryMb, setTotalMemoryMb] = useState<number | null>(null);

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch {
        setIsMac(navigator.userAgent.includes('Mac'));
      }
    };
    const loadMemory = async () => {
      try {
        const info = await invoke<SystemMemoryInfo>('get_system_memory_info');
        setTotalMemoryMb(info.total_memory_mb);
      } catch {
        setTotalMemoryMb(null);
      }
    };
    void checkPlatform();
    void loadMemory();
  }, []);

  const cards = [
    {
      title: t('onboarding.localcloud.local_title'),
      icon: Cpu,
      pros: [t('onboarding.localcloud.local_pro_1'), t('onboarding.localcloud.local_pro_2'), t('onboarding.localcloud.local_pro_3')],
      cons: [t('onboarding.localcloud.local_con_1'), t('onboarding.localcloud.local_con_2')],
    },
    {
      title: t('onboarding.localcloud.cloud_title'),
      icon: Cloud,
      pros: [t('onboarding.localcloud.cloud_pro_1'), t('onboarding.localcloud.cloud_pro_2'), t('onboarding.localcloud.cloud_pro_3')],
      cons: [t('onboarding.localcloud.cloud_con_1'), t('onboarding.localcloud.cloud_con_2')],
    },
  ];

  return (
    <OnboardingContainer title={t('onboarding.localcloud.title')} description={t('onboarding.localcloud.description')} step={3} totalSteps={isMac ? 5 : 4}>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(({ title, icon: Icon, pros, cons }) => (
            <section key={title} className="rounded-3xl border p-5" style={{ background: '#0d1f33', borderColor: '#1a2d42' }}>
              <div className="mb-4 flex items-center gap-3"><Icon className="h-5 w-5" style={{ color: '#447794' }} /><h3 className="font-heading text-lg font-bold text-white">{title}</h3></div>
              <div className="space-y-2">{pros.map((item) => <p key={item} className="flex gap-2 text-sm text-[#c1d0dc]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#4ade80]" />{item}</p>)}</div>
              <div className="mt-4 space-y-2 border-t border-[#1a2d42] pt-4">{cons.map((item) => <p key={item} className="flex gap-2 text-sm text-[#7a9ab5]"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#b48c3c]" />{item}</p>)}</div>
            </section>
          ))}
        </div>

        <div className="rounded-3xl border p-4" style={{ background: '#0d1f33', borderColor: '#1a2d42' }}>
          <button type="button" onClick={() => setShowGuide((value) => !value)} aria-expanded={showGuide} className="flex w-full items-center justify-between gap-3 bg-transparent text-left text-sm font-bold text-white">
            <span className="flex items-center gap-2"><Info className="h-4 w-4 text-[#447794]" />{t('onboarding.localcloud.more_info')}</span><ChevronDown className={`h-4 w-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
          </button>
          {showGuide && (
            <div className="mt-4 border-t border-[#1a2d42] pt-4 space-y-4">
              <h4 className="text-sm font-bold text-white">{t('onboarding.localcloud.guide_title')}</h4>
              {totalMemoryMb !== null && (
                <div className="rounded-2xl p-3 text-sm" style={{ background: '#061222', border: '1px solid #1a2d42' }}>
                  <p style={{ color: '#7a9ab5' }}>{t('onboarding.localcloud.detected_memory')}: <span className="font-bold text-white">{formatMemoryGb(totalMemoryMb)}</span></p>
                  <p className="mt-1" style={{ color: '#c1d0dc' }}>
                    {recommendModel(totalMemoryMb).cloudRecommended
                      ? t('onboarding.localcloud.recommend_cloud')
                      : t('onboarding.localcloud.recommend_local', { model: recommendModel(totalMemoryMb).model })}
                  </p>
                </div>
              )}
              <ol className="list-decimal space-y-2 pl-5 text-sm text-[#7a9ab5]">
                <li>{t('onboarding.localcloud.guide_step_1')}</li>
                <li>{t('onboarding.localcloud.guide_step_2')}</li>
                <li>{t('onboarding.localcloud.guide_step_3')}</li>
                <li>{t('onboarding.localcloud.guide_step_4')}</li>
                <li>{t('onboarding.localcloud.guide_step_5')}</li>
              </ol>
            </div>
          )}
        </div>

        <div className="mx-auto max-w-xs"><Button onClick={goNext} className="h-11 w-full rounded-2xl font-bold" style={{ background: '#447794', color: '#061222' }}>{t('onboarding.localcloud.cta')}</Button></div>
      </div>
    </OnboardingContainer>
  );
}
