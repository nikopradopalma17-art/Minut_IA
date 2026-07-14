export type OnboardingPlatform = 'macos' | 'other';
export type DownloadContinuation = 'wait' | 'permissions' | 'complete';

export function resolveOnboardingPlatform(platformName?: string, userAgent = ''): OnboardingPlatform {
  if (platformName) return platformName === 'macos' ? 'macos' : 'other';
  return /Macintosh|Mac OS|\bMac\b/i.test(userAgent) ? 'macos' : 'other';
}

export function getDownloadContinuation(platform: OnboardingPlatform | null): DownloadContinuation {
  if (platform === null) return 'wait';
  return platform === 'macos' ? 'permissions' : 'complete';
}
