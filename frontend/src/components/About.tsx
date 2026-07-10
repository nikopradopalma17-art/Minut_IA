import React, { useEffect, useState } from "react";
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
        <div className="p-4 space-y-4 h-[80vh] overflow-y-auto">
            <div className="text-center">
                <div className="mb-3">
                    <Image
                        src={`/icon_128x128.png?v=${encodeURIComponent(currentVersion)}`}
                        alt="MinutIA Logo"
                        width={64}
                        height={64}
                        className="mx-auto"
                    />
                </div>
                <span className="text-sm text-gray-500"> v{currentVersion}</span>
                <p className="text-medium text-gray-600 mt-1">
                    {t('about.tagline')}
                </p>
            </div>

            <div className="space-y-3">
                <h2 className="text-base font-semibold text-gray-800">{t('about.diff_title')}</h2>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('about.privacy_title')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('about.privacy_desc')}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('about.any_model_title')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('about.any_model_desc')}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('about.cost_title')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('about.cost_desc')}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('about.everywhere_title')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('about.everywhere_desc')}</p>
                    </div>
                </div>
            </div>

            <div className="text-center space-y-2">
                <h3 className="text-medium font-semibold text-gray-800">{t('about.customize_title')}</h3>
                <p className="text-s text-gray-600">
                    {t('about.customize_body')}
                </p>
                <p className="text-xs text-gray-500">
                    {t('about.customize_hint')}
                </p>
            </div>

            <div className="pt-2 border-t border-gray-200 text-center">
                <p className="text-xs text-gray-400">
                    {t('about.local_edition')}
                </p>
            </div>
        </div>
    )
}
