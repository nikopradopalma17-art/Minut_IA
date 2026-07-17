'use client';

import { CalendarDays, ChevronLeft, Home, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { About } from '@/components/About';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

export interface HubTopNavProps {
  active?: 'inicio' | 'reuniones' | 'ajustes';
  showVolver?: boolean;
  onVolver?: () => void;
  onOpenSettings?: () => void;
}

export default function HubTopNav({ active, showVolver = false, onVolver, onOpenSettings }: HubTopNavProps) {
  const router = useRouter();
  const items = [
    ...(showVolver ? [{ key: 'volver', icon: ChevronLeft, label: 'Volver', onClick: onVolver }] : []),
    {
      key: 'inicio',
      icon: Home,
      label: 'Inicio',
      onClick: showVolver && onVolver ? onVolver : () => router.push('/'),
    },
    { key: 'reuniones', icon: CalendarDays, label: 'Reuniones', onClick: () => router.push('/compromisos') },
    { key: 'ajustes', icon: Settings, label: 'Ajustes', onClick: onOpenSettings ?? (() => router.push('/settings')) },
  ];

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 sm:px-6 xl:px-8 border-b bg-[#061222]/80 backdrop-blur-md" style={{ borderColor: '#1a2d42' }}>
      <Dialog>
        <DialogTrigger asChild>
          <button type="button" aria-label="Acerca de MinutIA" className="flex items-center space-x-3 animate-fade-in cursor-pointer bg-transparent border-none p-0 rounded-xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/40">
            <img src="/brand/minutia.svg" alt="MinutIA" className="w-9 h-9 rounded-xl" />
            <span className="text-xl font-heading font-bold tracking-tight text-white">MinutIA</span>
          </button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <VisuallyHidden><DialogTitle>About MinutIA</DialogTitle></VisuallyHidden>
          <About />
        </DialogContent>
      </Dialog>

      <div className="ml-4 flex flex-wrap items-center justify-end gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className="flex h-[52px] w-[72px] flex-col items-center justify-center gap-1 rounded-2xl border transition-all cursor-pointer bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:h-[60px] sm:w-[88px]"
              style={isActive
                ? { background: 'rgba(68,119,148,0.18)', borderColor: 'rgba(68,119,148,0.45)', color: '#447794' }
                : { background: '#0d1f33', borderColor: '#1a2d42', color: '#7a9ab5' }}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-bold tracking-wider uppercase">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
