import React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PermissionRowProps } from '@/types/onboarding';
import { useTranslation } from '@/contexts/TranslationContext';

export function PermissionRow({ icon, title, description, status, isPending = false, onAction }: PermissionRowProps) {
  const { t } = useTranslation();
  const isAuthorized = status === 'authorized';
  const isDenied = status === 'denied';
  const isChecking = isPending;

  const getButtonText = () => {
    if (isChecking) return t('onboarding.permissions.checking');
    if (isDenied) return t('onboarding.permissions.open_settings');
    return t('onboarding.permissions.enable');
  };

  return (
    <div
      className="flex items-center justify-between rounded-3xl border px-6 py-5 transition-all duration-200"
      style={isAuthorized
        ? { background: 'rgba(45,91,117,0.12)', borderColor: 'rgba(45,91,117,0.3)' }
        : isDenied
          ? { background: 'rgba(180,60,60,0.1)', borderColor: 'rgba(180,60,60,0.25)' }
          : { background: '#0d1f33', borderColor: '#1a2d42' }
      }
    >
      {/* Left side: Icon + Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Icon */}
        <div
          className="flex w-10 h-10 items-center justify-center rounded-xl flex-shrink-0 border"
          style={isAuthorized
            ? { background: 'rgba(45,91,117,0.15)', borderColor: 'rgba(45,91,117,0.35)', color: '#2D5B75' }
            : isDenied
              ? { background: 'rgba(180,60,60,0.15)', borderColor: 'rgba(180,60,60,0.35)', color: '#d97070' }
              : { background: '#061222', borderColor: '#1a2d42', color: '#5a7a94' }
          }
        >
          {icon}
        </div>

        {/* Title + Description */}
        <div className="min-w-0 flex-1 ml-1">
          <div className="font-semibold truncate text-white text-sm">{title}</div>
          <div className="text-xs mt-0.5">
            {isAuthorized ? (
              <span className="flex items-center gap-1" style={{ color: '#2D5B75' }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('onboarding.permissions.access_granted')}
              </span>
            ) : isDenied ? (
              <span className="flex items-center gap-1" style={{ color: '#d97070' }}>
                <XCircle className="w-3.5 h-3.5" />
                {t('onboarding.permissions.access_denied')}
              </span>
            ) : (
              <span style={{ color: '#7a9ab5' }}>{description}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Action button or checkmark */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {!isAuthorized && (
          <Button
            size="sm"
            onClick={onAction}
            disabled={isChecking}
            className="min-w-[100px] font-bold rounded-xl text-xs transition-all"
            style={isDenied
              ? { background: '#9e3f3f', color: '#ffffff' }
              : { background: '#447794', color: '#061222' }
            }
          >
            {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {getButtonText()}
          </Button>
        )}
        {isAuthorized && (
          <div className="flex w-8 h-8 items-center justify-center rounded-lg border"
            style={{ background: 'rgba(45,91,117,0.15)', borderColor: 'rgba(45,91,117,0.35)', color: '#2D5B75' }}>
            <CheckCircle2 className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
