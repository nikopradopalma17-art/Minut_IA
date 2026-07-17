export type SummaryModelProvider = 'openai' | 'claude' | 'groq' | 'openrouter' | 'builtin-ai';
export type SummaryModelSource = 'dynamic' | 'curated' | 'registry';

export interface SummaryModelCatalogItem {
  id: string;
  label: string;
  provider: SummaryModelProvider;
  source: SummaryModelSource;
  available: boolean;
  sizeMb?: number;
  status?: string;
}

export interface SummaryCatalogResponse {
  models: Array<Pick<SummaryModelCatalogItem, 'id' | 'label'>>;
  source: Exclude<SummaryModelSource, 'registry'>;
}

export function normalizeSummaryCatalogResponse(response: SummaryCatalogResponse | null | undefined): SummaryCatalogResponse {
  if (!response || response.source !== 'dynamic' || !response.models.length) {
    return { source: 'curated', models: [] };
  }
  return response;
}

type DiscoveredModel = Pick<SummaryModelCatalogItem, 'id' | 'label'>;

const curated = (provider: SummaryModelProvider, models: Array<[string, string]>): SummaryModelCatalogItem[] =>
  models.map(([id, label]) => ({ id, label, provider, source: provider === 'builtin-ai' ? 'registry' : 'curated', available: provider !== 'builtin-ai' }));

export const CURATED_SUMMARY_MODELS: Record<SummaryModelProvider, SummaryModelCatalogItem[]> = {
  openai: curated('openai', [
    ['gpt-5', 'GPT-5'], ['gpt-5-mini', 'GPT-5 mini'], ['gpt-4.1', 'GPT-4.1'], ['gpt-4o', 'GPT-4o'], ['gpt-4o-mini', 'GPT-4o mini'],
  ]),
  claude: curated('claude', [
    ['claude-sonnet-4-5-20250929', 'Claude 4.5 Sonnet'], ['claude-haiku-4-5-20251001', 'Claude 4.5 Haiku'], ['claude-opus-4-1-20250805', 'Claude 4.1 Opus'],
  ]),
  groq: curated('groq', [
    ['llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile'], ['llama-3.1-8b-instant', 'Llama 3.1 8B Instant'], ['qwen/qwen3-32b', 'Qwen 3 32B'],
  ]),
  openrouter: curated('openrouter', [
    ['google/gemini-2.5-flash', 'Gemini 2.5 Flash'], ['google/gemini-2.5-pro', 'Gemini 2.5 Pro'], ['anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet'], ['openai/gpt-4o', 'GPT-4o'],
  ]),
  'builtin-ai': [
    { id: 'gemma3:1b', label: 'Gemma 3 1B', provider: 'builtin-ai', source: 'registry', available: false, sizeMb: 1019 },
    { id: 'qwen3.5:2b', label: 'Qwen 3.5 2B', provider: 'builtin-ai', source: 'registry', available: false, sizeMb: 1221 },
    { id: 'gemma3:4b', label: 'Gemma 3 4B', provider: 'builtin-ai', source: 'registry', available: false, sizeMb: 2500 },
    { id: 'qwen3.5:4b', label: 'Qwen 3.5 4B', provider: 'builtin-ai', source: 'registry', available: false, sizeMb: 2614 },
  ],
};

export function resolveSummaryModel(provider: SummaryModelProvider, discovered: DiscoveredModel[] | null | undefined): SummaryModelCatalogItem[] {
  if (!discovered?.length) return CURATED_SUMMARY_MODELS[provider];
  return discovered.map(model => ({ ...model, provider, source: 'dynamic', available: true }));
}

export function filterSummaryModels(models: SummaryModelCatalogItem[], query: string): SummaryModelCatalogItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return models;
  return models.filter(model => `${model.id} ${model.label}`.toLowerCase().includes(normalized));
}

export function selectValidSummaryModel(models: SummaryModelCatalogItem[], preferred: string | null | undefined, fallback = ''): string {
  if (preferred && models.some(model => model.id === preferred)) return preferred;
  if (fallback && models.some(model => model.id === fallback)) return fallback;
  return models[0]?.id ?? '';
}

export function reconcileSummaryModel(models: SummaryModelCatalogItem[], current: string | null | undefined, cached = ''): string {
  return selectValidSummaryModel(models, current, cached);
}

export function shouldApplyCatalogResponse(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}

export function shouldApplyCatalogGeneration(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration === currentGeneration;
}

export interface SummaryCatalogVersionStore {
  getVersion(provider: SummaryModelProvider): number;
  subscribe(listener: () => void): () => void;
  invalidate(provider: SummaryModelProvider): void;
}

/** A small external store so every mounted selector observes cache invalidation. */
export function createSummaryCatalogVersionStore(): SummaryCatalogVersionStore {
  const versions = new Map<SummaryModelProvider, number>();
  const listeners = new Set<() => void>();
  return {
    getVersion: (provider) => versions.get(provider) ?? 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate: (provider) => {
      versions.set(provider, (versions.get(provider) ?? 0) + 1);
      listeners.forEach(listener => listener());
    },
  };
}

export function persistSummaryModel(provider: string, model: string): void {
  if (typeof window === 'undefined' || !model) return;
  try {
    const cached = JSON.parse(localStorage.getItem('providerModelMap') || '{}');
    localStorage.setItem('providerModelMap', JSON.stringify({ ...cached, [provider]: model }));
  } catch {
    localStorage.setItem('providerModelMap', JSON.stringify({ [provider]: model }));
  }
}
