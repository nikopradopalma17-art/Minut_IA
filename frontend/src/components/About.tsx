import React, { useEffect, useState } from "react";
import { getVersion } from '@tauri-apps/api/app';
import Image from 'next/image';
import AnalyticsConsentSwitch from "./AnalyticsConsentSwitch";
import { Button } from './ui/button';
import { toast } from 'sonner';

export function About() {
    const [currentVersion, setCurrentVersion] = useState<string>('0.4.0');

    useEffect(() => {
        getVersion().then(setCurrentVersion).catch(console.error);
    }, []);

    const handleContactClick = async () => {
        toast.info('Contacto externo no configurado todavía.');
    };

    return (
        <div className="p-4 space-y-4 h-[80vh] overflow-y-auto">
            <div className="text-center">
                <div className="mb-3">
                    <Image
                        src="icon_128x128.png"
                        alt="MinutIA Logo"
                        width={64}
                        height={64}
                        className="mx-auto"
                    />
                </div>
                <span className="text-sm text-gray-500"> v{currentVersion}</span>
                <p className="text-medium text-gray-600 mt-1">
                    Asistente corporativo para actas, acuerdos y seguimiento de reuniones.
                </p>
            </div>

            <div className="space-y-3">
                <h2 className="text-base font-semibold text-gray-800">What makes MinutIA different</h2>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Privacy-first</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">Your data & AI processing workflow can now stay within your premise. No cloud, no leaks.</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Use Any Model</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">Prefer local open-source model? Great. Want to plug in an external API? Also fine. No lock-in.</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Cost-Smart</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">Avoid pay-per-minute bills by running models locally (or pay only for the calls you choose).</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">Works everywhere</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">Google Meet, Zoom, Teams-online or offline.</p>
                    </div>
                </div>
            </div>

            <div className="bg-primary/10 rounded p-3">
                <p className="text-s text-primary">
                    <span className="font-bold">Coming soon:</span> A library of on-device AI agents-automating follow-ups, action tracking, and more.
                </p>
            </div>

            <div className="text-center space-y-2">
                <h3 className="text-medium font-semibold text-gray-800">¿Quieres adaptar MinutIA a tu organización?</h3>
                <p className="text-s text-gray-600">
                    La plataforma está pensada para trabajo interno, privacidad y automatización de minutas.
                </p>
                <Button
                    onClick={handleContactClick}
                    className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded transition-colors duration-200 shadow-sm hover:shadow-md"
                >
                    Contacto
                </Button>
            </div>

            <div className="pt-2 border-t border-gray-200 text-center">
                <p className="text-xs text-gray-400">
                    MinutIA local edition
                </p>
            </div>
            <AnalyticsConsentSwitch />
        </div>
    )
}
