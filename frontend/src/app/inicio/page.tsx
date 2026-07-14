'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export default function InicioRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, [router]);
  return <div className="flex min-h-screen items-center justify-center bg-[#061222]"><RefreshCw className="h-6 w-6 animate-spin text-[#447794]" /></div>;
}
