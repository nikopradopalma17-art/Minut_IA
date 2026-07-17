import React from 'react';
import { Lock, Sparkles, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useTranslation } from '@/contexts/TranslationContext';

export function WelcomeStep() {
  const { goNext } = useOnboarding();
  const { t } = useTranslation();

  const features = [
    {
      icon: Lock,
      title: t('onboarding.welcome.feature_private'),
    },
    {
      icon: Sparkles,
      title: t('onboarding.welcome.feature_intelligent'),
    },
    {
      icon: Cpu,
      title: t('onboarding.welcome.feature_offline'),
    },
  ];

  return (
    <OnboardingContainer
      title={t('onboarding.welcome.title')}
      description={t('onboarding.welcome.description')}
      step={1}
      hideProgress={true}
    >
      <div className="flex flex-col items-center space-y-10">
        {/* Divider */}
        <div className="w-16 h-px" style={{ background: '#1a2d42' }} />

        {/* Features Card */}
        <div className="w-full max-w-md rounded-3xl border p-6 space-y-5 glow-border-impulso"
          style={{ background: '#0d1f33', borderColor: '#1a2d42' }}>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center border"
                    style={{ background: 'rgba(68,119,148,0.15)', borderColor: 'rgba(68,119,148,0.35)', color: '#447794' }}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: '#c1d0dc' }}>{feature.title}</p>
              </div>
            );
          })}
        </div>

        {/* CTA Section */}
        <div className="w-full max-w-xs space-y-4">
          <Button
            onClick={goNext}
            className="w-full h-11 font-bold rounded-2xl transition-all"
            style={{ background: '#447794', color: '#061222' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {t('onboarding.welcome.cta')}
          </Button>
          <p className="text-xs text-center" style={{ color: '#5a7a94' }}>{t('onboarding.welcome.subtitle')}</p>
        </div>
      </div>
    </OnboardingContainer>
  );
}
