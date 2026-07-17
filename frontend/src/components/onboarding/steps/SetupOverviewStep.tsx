import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useTranslation } from '@/contexts/TranslationContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SetupOverviewStep() {
  const { goNext } = useOnboarding();
  const { t } = useTranslation();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch (e) {
        setIsMac(navigator.userAgent.includes('Mac'));
      }
    };
    checkPlatform();
  }, []);

  const steps = [
    {
      number: 1,
      type: 'transcription',
      title: t('onboarding.setup.step1'),
    },
    {
      number: 2,
      type: 'summarization',
      title: t('onboarding.setup.step2'),
    },
  ];

  const handleContinue = () => {
    goNext();
  };

  return (
    <OnboardingContainer
      title={t('onboarding.setup.title')}
      description={t('onboarding.setup.description')}
      step={2}
      totalSteps={isMac ? 5 : 4}
    >
      <div className="flex flex-col items-center space-y-10">
        {/* Steps Card */}
        <div className="w-full max-w-md rounded-3xl border p-5 glow-border-impulso"
          style={{ background: '#0d1f33', borderColor: '#1a2d42' }}>
          <div className="space-y-5">
            {steps.map((step) => {
              return (
                <div
                  key={step.number}
                  className="flex items-start gap-4 p-1"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
                      Paso {step.number}: {step.title}

                      {step.type === "summarization" && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer" style={{ color: '#447794' }}>
                                <Info className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs p-3 rounded-xl border"
                              style={{ background: '#0d1f33', borderColor: '#1a2d42', color: '#c1d0dc' }}>
                              {t('onboarding.setup.tooltip')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </h3>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA Section */}
        <div className="w-full max-w-xs space-y-4">
          <Button
            onClick={handleContinue}
            className="w-full h-11 font-bold rounded-2xl transition-all"
            style={{ background: '#447794', color: '#061222' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {t('onboarding.setup.cta')}
          </Button>
        </div>
      </div>
    </OnboardingContainer>
  );
}
