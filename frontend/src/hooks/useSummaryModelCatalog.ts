'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createSummaryCatalogVersionStore, CURATED_SUMMARY_MODELS, normalizeSummaryCatalogResponse, reconcileSummaryModel, resolveSummaryModel, shouldApplyCatalogGeneration, shouldApplyCatalogResponse, type SummaryCatalogResponse, type SummaryModelCatalogItem, type SummaryModelProvider } from '@/lib/summaryModelCatalog';

interface BuiltInModelResponse {
  name: string;
  display_name: string;
  size_mb: number;
  status: { type: string };
}

const catalogCache = new Map<SummaryModelProvider, SummaryModelCatalogItem[]>();
const catalogVersions = createSummaryCatalogVersionStore();

function getCatalogGeneration(provider: SummaryModelProvider): number {
  return catalogVersions.getVersion(provider);
}

export function invalidateSummaryModelCatalog(provider: SummaryModelProvider): void {
  catalogCache.delete(provider);
  catalogVersions.invalidate(provider);
}

export async function loadSummaryModelCatalog(provider: SummaryModelProvider): Promise<SummaryModelCatalogItem[]> {
  const cached = catalogCache.get(provider);
  if (cached) return cached;

  const generation = getCatalogGeneration(provider);
  // Cloud providers now surface real errors from the backend when a key is
  // configured but the request fails. We only fall back to the curated list on
  // unexpected client-side issues (e.g. serialization) — the hook turns catalog
  // errors into an `error` state for the UI to display.
  const models = provider === 'builtin-ai'
    ? await loadBuiltInCatalog()
    : await loadCloudCatalog(provider);
  if (shouldApplyCatalogGeneration(generation, getCatalogGeneration(provider))) {
    catalogCache.set(provider, models);
  }
  return models;
}

async function loadCloudCatalog(provider: Exclude<SummaryModelProvider, 'builtin-ai'>): Promise<SummaryModelCatalogItem[]> {
  const response = normalizeSummaryCatalogResponse(await invoke<SummaryCatalogResponse>('summary_list_models', { provider }));
  if (response.source === 'curated') return CURATED_SUMMARY_MODELS[provider];
  return resolveSummaryModel(provider, response.models);
}

async function loadBuiltInCatalog(): Promise<SummaryModelCatalogItem[]> {
  const items = await invoke<BuiltInModelResponse[]>('builtin_ai_list_models');
  const byName = new Map(items.map(item => [item.name, item]));
  return CURATED_SUMMARY_MODELS['builtin-ai'].map(model => {
    const item = byName.get(model.id);
    return item ? { ...model, label: item.display_name, sizeMb: item.size_mb, status: item.status.type, available: item.status.type === 'available' } : model;
  });
}

export function useSummaryModelCatalog(provider: SummaryModelProvider | null, selectedModel?: string, onReconcile?: (model: string) => void) {
  const [models, setModels] = useState<SummaryModelCatalogItem[]>(provider ? CURATED_SUMMARY_MODELS[provider] : []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const catalogVersion = useSyncExternalStore(
    catalogVersions.subscribe,
    () => provider ? catalogVersions.getVersion(provider) : 0,
    () => 0,
  );

  const refresh = useCallback(async () => {
    if (!provider) return;
    const requestId = ++requestIdRef.current;
    const generation = getCatalogGeneration(provider);
    setIsLoading(true);
    setError(null);
    try {
      const nextModels = await loadSummaryModelCatalog(provider);
      if (!shouldApplyCatalogResponse(requestId, requestIdRef.current) || !shouldApplyCatalogGeneration(generation, getCatalogGeneration(provider))) return;
      setModels(nextModels);
      const validModel = reconcileSummaryModel(nextModels, selectedModel);
      if (validModel && validModel !== selectedModel) onReconcile?.(validModel);
    } catch (refreshError) {
      // Surface the backend error so the UI can offer a retry instead of
      // silently swapping in the curated list.
      if (!shouldApplyCatalogResponse(requestId, requestIdRef.current) || !shouldApplyCatalogGeneration(generation, getCatalogGeneration(provider))) return;
      const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
      console.warn(`Unable to refresh ${provider} summary models.`, refreshError);
      setError(message);
      // Keep the previous model list (likely curated) visible as a fallback.
    } finally {
      if (shouldApplyCatalogResponse(requestId, requestIdRef.current)) {
        setIsLoading(false);
      }
    }
  }, [provider, selectedModel, onReconcile]);

  useEffect(() => { refresh(); }, [refresh, catalogVersion]);
  return useMemo(() => ({ models, isLoading, error, refresh }), [models, isLoading, error, refresh]);
}
