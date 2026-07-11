import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Mic, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { PermissionRow } from '../shared';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useTranslation } from '@/contexts/TranslationContext';

export function PermissionsStep() {
  const { setPermissionStatus, setPermissionsSkipped, permissions, completeOnboarding } = useOnboarding();
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState(false);

  const checkPermissions = useCallback(async () => {
    console.log('[PermissionsStep] Current permission states:');
    console.log(`  - Microphone: ${permissions.microphone}`);
    console.log(`  - System Audio: ${permissions.systemAudio}`);
  }, [permissions.microphone, permissions.systemAudio]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const handleMicrophoneAction = async () => {
    if (permissions.microphone === 'denied') {
      try {
        await invoke('open_system_settings');
      } catch {
        alert(t('onboarding.permissions.microphone_settings'));
      }
      return;
    }

    setIsPending(true);
    try {
      console.log('[PermissionsStep] Triggering microphone permission...');
      const granted = await invoke<boolean>('trigger_microphone_permission');
      console.log('[PermissionsStep] Microphone permission result:', granted);

      if (granted) {
        setPermissionStatus('microphone', 'authorized');
      } else {
        setPermissionStatus('microphone', 'denied');
      }
    } catch (err) {
      console.error('[PermissionsStep] Failed to request microphone permission:', err);
      setPermissionStatus('microphone', 'denied');
    } finally {
      setIsPending(false);
    }
  };

  const handleSystemAudioAction = async () => {
    if (permissions.systemAudio === 'denied') {
      try {
        await invoke('open_system_settings');
      } catch {
        alert(t('onboarding.permissions.system_audio_settings_mac'));
      }
      return;
    }

    setIsPending(true);
    try {
      console.log('[PermissionsStep] Triggering Audio Capture permission...');
      const granted = await invoke<boolean>('trigger_system_audio_permission_command');
      console.log('[PermissionsStep] System audio permission result:', granted);

      if (granted) {
        setPermissionStatus('systemAudio', 'authorized');
        console.log('[PermissionsStep] Audio Capture permission verified - audio is not silence');
      } else {
        setPermissionStatus('systemAudio', 'denied');
        console.log('[PermissionsStep] Audio Capture permission denied - audio is silence');
      }
    } catch (err) {
      console.error('[PermissionsStep] Failed to request system audio permission:', err);
      setPermissionStatus('systemAudio', 'denied');
    } finally {
      setIsPending(false);
    }
  };

  const handleFinish = async () => {
    try {
      await completeOnboarding();
      window.location.reload();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  const handleSkip = async () => {
    setPermissionsSkipped(true);
    await handleFinish();
  };

  const allPermissionsGranted =
    permissions.microphone === 'authorized' &&
    permissions.systemAudio === 'authorized';

  return (
    <OnboardingContainer
      title={t('onboarding.permissions.title')}
      description={t('onboarding.permissions.description')}
      step={4}
      hideProgress={true}
      showNavigation={allPermissionsGranted}
      canGoNext={allPermissionsGranted}
    >
      <div className="max-w-lg mx-auto space-y-6">
        <div className="space-y-4">
          <PermissionRow
            icon={<Mic className="w-5 h-5" />}
            title={t('onboarding.permissions.microphone_title')}
            description={t('onboarding.permissions.microphone_desc')}
            status={permissions.microphone}
            isPending={isPending}
            onAction={handleMicrophoneAction}
          />

          <PermissionRow
            icon={<Volume2 className="w-5 h-5" />}
            title={t('onboarding.permissions.system_audio_title')}
            description={t('onboarding.permissions.system_audio_desc')}
            status={permissions.systemAudio}
            isPending={isPending}
            onAction={handleSystemAudioAction}
          />
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <Button onClick={handleFinish} disabled={!allPermissionsGranted} className="w-full h-11">
            {t('onboarding.permissions.finish')}
          </Button>

          <button
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('onboarding.permissions.later')}
          </button>

          {!allPermissionsGranted && (
            <p className="text-xs text-center text-muted-foreground">
              {t('onboarding.permissions.note')}
            </p>
          )}
        </div>
      </div>
    </OnboardingContainer>
  );
}
