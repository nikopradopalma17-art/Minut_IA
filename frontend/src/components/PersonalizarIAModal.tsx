'use client';

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfig } from '@/contexts/ConfigContext';
import { ModelConfig } from '@/services/configService';
import { SummaryModelSelector } from '@/components/SummaryModelSelector';
import { CURATED_SUMMARY_MODELS } from '@/lib/summaryModelCatalog';
import { invalidateSummaryModelCatalog } from '@/hooks/useSummaryModelCatalog';

type CloudProvider = 'openrouter' | 'openai' | 'claude' | 'groq';

const PROVIDERS: Array<{ provider: CloudProvider; title: string }> = [
  {
    provider: 'openrouter',
    title: 'OpenRouter',
  },
  {
    provider: 'openai',
    title: 'OpenAI / ChatGPT',
  },
  {
    provider: 'claude',
    title: 'Claude',
  },
  { provider: 'groq', title: 'Groq' },
];

interface PersonalizarIAModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProvider?: CloudProvider | null;
}

export default function PersonalizarIAModal({ open, onOpenChange, initialProvider }: PersonalizarIAModalProps) {
  const { modelConfig, setModelConfig } = useConfig();
  const [keys, setKeys] = useState<Record<CloudProvider, string>>({ openrouter: '', openai: '', claude: '', groq: '' });
  const [apiKeyConfigured, setApiKeyConfigured] = useState<Record<CloudProvider, boolean>>({ openrouter: false, openai: false, claude: false, groq: false });
  const [models, setModels] = useState<Record<CloudProvider, string>>({
    openrouter: CURATED_SUMMARY_MODELS.openrouter[0].id, openai: CURATED_SUMMARY_MODELS.openai[0].id, claude: CURATED_SUMMARY_MODELS.claude[0].id, groq: CURATED_SUMMARY_MODELS.groq[0].id,
  });
  const [unlocked, setUnlocked] = useState<Record<CloudProvider, boolean>>({ openrouter: false, openai: false, claude: false, groq: false });
  const [visible, setVisible] = useState<Record<CloudProvider, boolean>>({ openrouter: false, openai: false, claude: false, groq: false });
  const [pending, setPending] = useState<Record<CloudProvider, 'save' | 'activate' | null>>({ openrouter: null, openai: null, claude: null, groq: null });

  useEffect(() => {
    setVisible({ openrouter: false, openai: false, claude: false, groq: false });
    setUnlocked({ openrouter: false, openai: false, claude: false, groq: false });
    setPending({ openrouter: null, openai: null, claude: null, groq: null });
    if (!open) return;
    setKeys({ openrouter: '', openai: '', claude: '', groq: '' });
    void Promise.all(PROVIDERS.map(async ({ provider }) => [
      provider,
      await invoke<{ configured: boolean }>('api_get_api_key_status', { provider }),
    ] as const)).then(statuses => {
      setApiKeyConfigured(statuses.reduce((next, [provider, status]) => ({ ...next, [provider]: status.configured }), { openrouter: false, openai: false, claude: false, groq: false }));
    }).catch(() => undefined);
    if (modelConfig.provider === 'openrouter' || modelConfig.provider === 'openai' || modelConfig.provider === 'claude' || modelConfig.provider === 'groq') {
      setModels(prev => ({ ...prev, [modelConfig.provider]: modelConfig.model }));
    }
    if (initialProvider) {
      setUnlocked({ openrouter: initialProvider === 'openrouter', openai: initialProvider === 'openai', claude: initialProvider === 'claude', groq: initialProvider === 'groq' });
    }
  }, [open, initialProvider, modelConfig.provider, modelConfig.model]);

  const saveKey = async (provider: CloudProvider) => {
    if (pending[provider]) return;
    const apiKey = keys[provider].trim();
    if (!apiKey) {
      toast.error('Ingresa una API key antes de guardar.');
      return;
    }
    try {
      setPending(prev => ({ ...prev, [provider]: 'save' }));
      await invoke('api_save_api_key', { provider, apiKey });
      invalidateSummaryModelCatalog(provider);
      setKeys(prev => ({ ...prev, [provider]: '' }));
      setApiKeyConfigured(prev => ({ ...prev, [provider]: true }));
      setUnlocked(prev => ({ ...prev, [provider]: false }));
      toast.success(`Clave de ${provider} guardada.`);
    } catch (error) {
      console.error('Failed to save provider API key:', error);
      toast.error('No se pudo guardar la API key.');
    } finally {
      setPending(prev => ({ ...prev, [provider]: null }));
    }
  };

  const useProvider = async (provider: CloudProvider) => {
    if (pending[provider]) return;
    if (!keys[provider].trim() && !apiKeyConfigured[provider]) {
      toast.error('Guarda una API key antes de usar este proveedor.');
      return;
    }
    const apiKey = keys[provider].trim();
    const updated: ModelConfig = { ...modelConfig, provider, model: models[provider], apiKey: '' };
    try {
      setPending(prev => ({ ...prev, [provider]: 'activate' }));
      await invoke('api_save_model_config', {
        provider,
        model: updated.model,
        whisperModel: updated.whisperModel,
        apiKey: apiKey || null,
        ollamaEndpoint: updated.ollamaEndpoint ?? null,
      });
      invalidateSummaryModelCatalog(provider);
      setModelConfig(updated);
      setKeys(prev => ({ ...prev, [provider]: '' }));
      setApiKeyConfigured(prev => ({ ...prev, [provider]: true }));
      toast.success(`${provider} es ahora el proveedor activo.`);
    } catch (error) {
      console.error('Failed to activate provider:', error);
      toast.error('No se pudo activar el proveedor.');
    } finally {
      setPending(prev => ({ ...prev, [provider]: null }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto text-slate-200" style={{ background: '#0a1628', borderColor: '#1a2d42' }}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-heading text-white">Personalizar IA</DialogTitle>
          <DialogDescription style={{ color: '#7a9ab5' }}>Configura tus proveedores de IA en la nube sin cambiar el proveedor activo hasta que tú lo decidas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {PROVIDERS.map(({ provider, title }) => (
            <section key={provider} className="rounded-2xl p-5" style={{ background: '#0d1f33', border: `1px solid ${initialProvider === provider ? '#447794' : '#1a2d42'}` }}>
              <h3 className="font-heading font-bold text-white mb-4">{title}</h3>
              <p className="text-xs mb-3" style={{ color: '#7a9ab5' }}>{apiKeyConfigured[provider] ? 'Clave configurada en este equipo.' : 'Sin clave configurada.'}</p>
              <div className="grid gap-4 md:grid-cols-[1fr_230px]">
                <div>
                  <label htmlFor={`${provider}-api-key`} className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#7a9ab5' }}>API key</label>
                  <div className="flex gap-2">
                    <input
                      type={visible[provider] ? 'text' : 'password'}
                      id={`${provider}-api-key`}
                      value={keys[provider]}
                      readOnly={!unlocked[provider]}
                      onDoubleClick={() => setUnlocked(prev => ({ ...prev, [provider]: true }))}
                      onChange={event => setKeys(prev => ({ ...prev, [provider]: event.target.value }))}
                      className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#447794]"
                      style={{ background: '#061222', border: '1px solid #1a2d42', color: '#e2e8f0' }}
                      placeholder={`Clave de ${title}`}
                    />
                    <button type="button" aria-label={unlocked[provider] ? 'Bloquear clave' : 'Editar clave'} onClick={() => setUnlocked(prev => ({ ...prev, [provider]: !prev[provider] }))} className="p-2 rounded-xl border" style={{ borderColor: '#1a2d42' }}>
                      {unlocked[provider] ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </button>
                    <button type="button" aria-label={visible[provider] ? 'Ocultar clave' : 'Mostrar clave'} onClick={() => setVisible(prev => ({ ...prev, [provider]: !prev[provider] }))} className="p-2 rounded-xl border" style={{ borderColor: '#1a2d42' }}>
                      {visible[provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label id={`${provider}-model-label`} className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#7a9ab5' }}>Modelo</label>
                  <SummaryModelSelector provider={provider} value={models[provider]} onValueChange={model => setModels(prev => ({ ...prev, [provider]: model }))} />
                </div>
              </div>
              {provider === 'openrouter' && <p className="text-xs mt-3" style={{ color: '#7a9ab5' }}>Incluye Gemini, GPT y Claude con una sola clave — ideal si no sabes cuál elegir.</p>}
              <div className="flex gap-3 mt-4 flex-wrap">
                <button type="button" disabled={Boolean(pending[provider])} onClick={() => saveKey(provider)} className="px-4 py-2 rounded-xl border text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed" style={{ borderColor: '#447794', color: '#8db4cc' }}>{pending[provider] === 'save' ? 'Guardando…' : 'Guardar clave'}</button>
                <button type="button" disabled={Boolean(pending[provider])} onClick={() => useProvider(provider)} className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: '#447794' }}>{pending[provider] === 'activate' ? 'Activando…' : 'Usar este proveedor'}</button>
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
