import { useState, useEffect, useRef, useCallback } from 'react';
import { useSidebar } from './Sidebar/SidebarProvider';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { useOllamaDownload } from '@/contexts/OllamaDownloadContext';
import { BuiltInModelManager } from '@/components/BuiltInModelManager';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/TranslationContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Lock, Unlock, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp, Download, ExternalLink, Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn, isOllamaNotInstalledError } from '@/lib/utils';
import { CURATED_SUMMARY_MODELS, persistSummaryModel, type SummaryModelProvider } from '@/lib/summaryModelCatalog';
import { persistBeforeInvalidatingCatalog } from '@/lib/summaryModelSave';
import { invalidateSummaryModelCatalog, useSummaryModelCatalog } from '@/hooks/useSummaryModelCatalog';
import { toast } from 'sonner';

export interface ModelConfig {
  provider: 'ollama' | 'groq' | 'claude' | 'openai' | 'openrouter' | 'builtin-ai' | 'custom-openai';
  model: string;
  whisperModel: string;
  apiKey?: string | null;
  ollamaEndpoint?: string | null;
  // Custom OpenAI fields
  customOpenAIEndpoint?: string | null;
  customOpenAIModel?: string | null;
  customOpenAIApiKey?: string | null;
  maxTokens?: number | null;
  temperature?: number | null;
  topP?: number | null;
}

interface OllamaModel {
  name: string;
  id: string;
  size: string;
  modified: string;
}


interface ModelSettingsModalProps {
  modelConfig: ModelConfig;
  setModelConfig: (config: ModelConfig | ((prev: ModelConfig) => ModelConfig)) => void;
  onSave: (config: ModelConfig) => void | Promise<void>;
  skipInitialFetch?: boolean; // Optional: skip fetching config from backend if parent manages it
  layout?: 'inline' | 'dialog';
}

export function ModelSettingsModal({
  modelConfig: propsModelConfig,
  setModelConfig: propsSetModelConfig,
  onSave,
  skipInitialFetch = false,
  layout = 'inline',
}: ModelSettingsModalProps) {
  // Use ConfigContext if available, fallback to props for backward compatibility
  const configContext = useConfig();
  const { t } = useTranslation();
  const modelConfig = configContext?.modelConfig || propsModelConfig;
  const setModelConfig = configContext?.setModelConfig || propsSetModelConfig;

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [error, setError] = useState<string>('');
  const [apiKey, setApiKey] = useState<string | null>(modelConfig.apiKey || null);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(!!modelConfig.apiKey?.trim());
  const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
  const { serverAddress } = useSidebar();
  const [ollamaEndpoint, setOllamaEndpoint] = useState<string>(modelConfig.ollamaEndpoint || '');
  const [isLoadingOllama, setIsLoadingOllama] = useState<boolean>(false);
  const [lastFetchedEndpoint, setLastFetchedEndpoint] = useState<string>(modelConfig.ollamaEndpoint || '');
  const [endpointValidationState, setEndpointValidationState] = useState<'valid' | 'invalid' | 'none'>('none');
  const [hasAutoFetched, setHasAutoFetched] = useState<boolean>(false);
  const hasSyncedFromParent = useRef<boolean>(false);
  const hasLoadedInitialConfig = useRef<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEndpointSectionCollapsed, setIsEndpointSectionCollapsed] = useState<boolean>(true); // Collapsed by default
  const [ollamaNotInstalled, setOllamaNotInstalled] = useState<boolean>(false); // Track if Ollama is not installed

  // Custom OpenAI state
  const [customOpenAIEndpoint, setCustomOpenAIEndpoint] = useState<string>(modelConfig.customOpenAIEndpoint || '');
  const [customOpenAIModel, setCustomOpenAIModel] = useState<string>(modelConfig.customOpenAIModel || '');
  const [customOpenAIApiKey, setCustomOpenAIApiKey] = useState<string>(modelConfig.customOpenAIApiKey || '');
  const [customMaxTokens, setCustomMaxTokens] = useState<string>(modelConfig.maxTokens?.toString() || '');
  const [customTemperature, setCustomTemperature] = useState<string>(modelConfig.temperature?.toString() || '');
  const [customTopP, setCustomTopP] = useState<string>(modelConfig.topP?.toString() || '');
  const [isCustomOpenAIAdvancedOpen, setIsCustomOpenAIAdvancedOpen] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // Combobox state
  const [modelComboboxOpen, setModelComboboxOpen] = useState<boolean>(false);

  const cloudCatalogProvider = ['claude', 'groq', 'openai', 'openrouter'].includes(modelConfig.provider)
    ? modelConfig.provider as SummaryModelProvider
    : null;
  const reconcileCloudModel = useCallback((model: string) => {
    setModelConfig(previous => ({ ...previous, model }));
  }, [setModelConfig]);
  const { models: cloudCatalogModels, isLoading: isLoadingCloudCatalog, error: cloudCatalogError, refresh: refreshCloudCatalog } = useSummaryModelCatalog(cloudCatalogProvider, modelConfig.model, reconcileCloudModel);

  // Use global download context instead of local state
  const { isDownloading, getProgress, downloadingModels } = useOllamaDownload();

  // Built-in AI models state
  const [builtinAiModels, setBuiltinAiModels] = useState<any[]>([]);

  // Cache models by endpoint to avoid refetching when reverting endpoint changes
  const modelsCache = useRef<Map<string, OllamaModel[]>>(new Map());

  // URL validation helper
  const validateOllamaEndpoint = (url: string): boolean => {
    if (!url.trim()) return true; // Empty is valid (uses default)
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Debounced URL validation with visual feedback
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = ollamaEndpoint.trim();

      if (!trimmed) {
        setEndpointValidationState('none');
      } else if (validateOllamaEndpoint(trimmed)) {
        setEndpointValidationState('valid');
      } else {
        setEndpointValidationState('invalid');
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [ollamaEndpoint]);

  // Auto-unlock when API key becomes empty, 
  useEffect(() => {
    const hasContent = !!apiKey?.trim();
    if (!hasContent) {
      setIsApiKeyLocked(false);
    }
  }, [apiKey]);

  const modelOptions: Record<string, string[]> = {
    ollama: models.map((model) => model.name),
    claude: cloudCatalogProvider === 'claude' ? cloudCatalogModels.map(model => model.id) : CURATED_SUMMARY_MODELS.claude.map(model => model.id),
    groq: cloudCatalogProvider === 'groq' ? cloudCatalogModels.map(model => model.id) : CURATED_SUMMARY_MODELS.groq.map(model => model.id),
    openai: cloudCatalogProvider === 'openai' ? cloudCatalogModels.map(model => model.id) : CURATED_SUMMARY_MODELS.openai.map(model => model.id),
    openrouter: cloudCatalogProvider === 'openrouter' ? cloudCatalogModels.map(model => model.id) : CURATED_SUMMARY_MODELS.openrouter.map(model => model.id),
    'builtin-ai': builtinAiModels.map((m) => m.name),
    'custom-openai': customOpenAIModel ? [customOpenAIModel] : [], // User specifies model manually
  };
  const visibleModelItems = cloudCatalogProvider
    ? cloudCatalogModels
    : modelOptions[modelConfig.provider]?.map(id => ({ id, label: id, source: 'dynamic' as const, available: true })) || [];

  const requiresApiKey =
    modelConfig.provider === 'claude' ||
    modelConfig.provider === 'groq' ||
    modelConfig.provider === 'openai' ||
    modelConfig.provider === 'openrouter';

  // Check if Ollama endpoint has changed but models haven't been fetched yet
  const ollamaEndpointChanged = modelConfig.provider === 'ollama' &&
    ollamaEndpoint.trim() !== lastFetchedEndpoint.trim();

  // Custom OpenAI validation
  const isCustomOpenAIInvalid = modelConfig.provider === 'custom-openai' && (
    !customOpenAIEndpoint.trim() ||
    !customOpenAIModel.trim()
  );

  const isDoneDisabled =
    (requiresApiKey && (!apiKey || (typeof apiKey === 'string' && !apiKey.trim()))) ||
    (modelConfig.provider === 'ollama' && ollamaEndpointChanged) ||
    isCustomOpenAIInvalid;

  useEffect(() => {
    const fetchModelConfig = async () => {
      // If parent component manages config, skip fetch and just mark as loaded
      if (skipInitialFetch) {
        hasLoadedInitialConfig.current = true;
        return;
      }

      try {
        const data = (await invoke('api_get_model_config')) as any;
        if (data && data.provider !== null) {
          setModelConfig(data);

          // Persisted credentials never prefill this editor.
          setApiKey('');

          // Sync ollamaEndpoint state with fetched config
          if (data.ollamaEndpoint) {
            setOllamaEndpoint(data.ollamaEndpoint);
            // Don't set lastFetchedEndpoint here - it will be set after successful model fetch
          }
          hasLoadedInitialConfig.current = true; // Mark that initial config is loaded

          // Fetch Custom OpenAI config if that's the active provider
          if (data.provider === 'custom-openai') {
            try {
              const customConfig = (await invoke('api_get_custom_openai_config')) as any;
              if (customConfig) {
                setCustomOpenAIEndpoint(customConfig.endpoint || '');
                setCustomOpenAIModel(customConfig.model || '');
                setCustomOpenAIApiKey('');
                setCustomMaxTokens(customConfig.maxTokens?.toString() || '');
                setCustomTemperature(customConfig.temperature?.toString() || '');
                setCustomTopP(customConfig.topP?.toString() || '');
              }
            } catch (err) {
              console.error('Failed to fetch custom OpenAI config:', err);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch model config:', error);
        hasLoadedInitialConfig.current = true; // Mark as loaded even on error
      }
    };

    fetchModelConfig();
  }, [skipInitialFetch]);

  // Sync ollamaEndpoint state when modelConfig.ollamaEndpoint changes from parent
  useEffect(() => {
    const endpoint = modelConfig.ollamaEndpoint || '';
    if (endpoint !== ollamaEndpoint) {
      setOllamaEndpoint(endpoint);
      // Don't set lastFetchedEndpoint here - only after successful model fetch
    }
    // Only mark as synced if we have a valid provider (prevents race conditions during init)
    if (modelConfig.provider) {
      hasSyncedFromParent.current = true; // Mark that we've received prop value
    }
  }, [modelConfig.ollamaEndpoint, modelConfig.provider]);

  // Sync custom OpenAI state from modelConfig (context or props)
  useEffect(() => {
    if (modelConfig.provider === 'custom-openai') {
      console.log('Syncing custom OpenAI fields from ConfigContext:', {
        endpoint: modelConfig.customOpenAIEndpoint,
        model: modelConfig.customOpenAIModel,
        hasApiKey: !!modelConfig.customOpenAIApiKey,
      });

      // Always sync from modelConfig (which comes from context if available)
      setCustomOpenAIEndpoint(modelConfig.customOpenAIEndpoint || '');
      setCustomOpenAIModel(modelConfig.customOpenAIModel || '');
      setCustomOpenAIApiKey(modelConfig.customOpenAIApiKey || '');
      setCustomMaxTokens(modelConfig.maxTokens?.toString() || '');
      setCustomTemperature(modelConfig.temperature?.toString() || '');
      setCustomTopP(modelConfig.topP?.toString() || '');
    }
  }, [
    modelConfig.provider,
    modelConfig.customOpenAIEndpoint,
    modelConfig.customOpenAIModel,
    modelConfig.customOpenAIApiKey,
    modelConfig.maxTokens,
    modelConfig.temperature,
    modelConfig.topP
  ]);

  // Reset hasAutoFetched flag and clear models when switching away from Ollama
  useEffect(() => {
    if (modelConfig.provider !== 'ollama') {
      setHasAutoFetched(false); // Reset flag so it can auto-fetch again if user switches back
      setModels([]); // Clear models list
      setError(''); // Clear any error state
      setOllamaNotInstalled(false); // Reset installation status
    }
  }, [modelConfig.provider]);

  // Handle endpoint changes - restore cached models or clear
  useEffect(() => {
    if (modelConfig.provider === 'ollama' &&
      ollamaEndpoint.trim() !== lastFetchedEndpoint.trim()) {

      // Check if we have cached models for this endpoint (including empty endpoint = default)
      const cachedModels = modelsCache.current.get(ollamaEndpoint.trim());

      if (cachedModels && cachedModels.length > 0) {
        // Restore cached models and update tracking
        setModels(cachedModels);
        setLastFetchedEndpoint(ollamaEndpoint.trim());
        setError('');
      } else {
        // No cache - clear models and allow refetch
        setHasAutoFetched(false);
        setModels([]);
        setError('');
      }
    }
  }, [ollamaEndpoint, lastFetchedEndpoint, modelConfig.provider]);

  // Manual fetch function for Ollama models
  const fetchOllamaModels = async (silent = false) => {
    const trimmedEndpoint = ollamaEndpoint.trim();

    // Validate URL if provided
    if (trimmedEndpoint && !validateOllamaEndpoint(trimmedEndpoint)) {
      const errorMsg = 'Invalid Ollama endpoint URL. Must start with http:// or https://';
      setError(errorMsg);
      if (!silent) {
        toast.error(errorMsg);
      }
      return;
    }

    setIsLoadingOllama(true);
    setError(''); // Clear previous errors

    try {
      const endpoint = trimmedEndpoint || null;
      const modelList = (await invoke('get_ollama_models', { endpoint })) as OllamaModel[];
      setModels(modelList);
      setLastFetchedEndpoint(trimmedEndpoint); // Track successful fetch

      // Cache the fetched models for this endpoint
      modelsCache.current.set(trimmedEndpoint, modelList);

      // Successfully fetched models, Ollama is installed
      setOllamaNotInstalled(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load Ollama models';
      setError(errorMsg);

      // Check if error indicates Ollama is not installed
      if (isOllamaNotInstalledError(errorMsg)) {
        setOllamaNotInstalled(true);
      } else {
        setOllamaNotInstalled(false);
      }

      if (!silent) {
        toast.error(errorMsg);
      }
      console.error('Error loading models:', err);
    } finally {
      setIsLoadingOllama(false);
    }
  };

  // Auto-fetch models on initial load only (not on endpoint changes)
  useEffect(() => {
    let mounted = true;

    const initialLoad = async () => {
      // Only auto-fetch on initial load if:
      // 1. Provider is ollama
      // 2. Haven't fetched yet
      // 3. Component is still mounted
      // If skipInitialFetch is true, fetch silently (no error toasts)
      if (modelConfig.provider === 'ollama' &&
        !hasAutoFetched &&
        mounted) {
        await fetchOllamaModels(skipInitialFetch); // Silent if skipInitialFetch=true
        setHasAutoFetched(true);
      }
    };

    initialLoad();

    return () => {
      mounted = false;
    };
  }, [modelConfig.provider]); // Only depend on provider, NOT endpoint

  const loadBuiltinAiModels = async () => {
    if (builtinAiModels.length > 0) return; // Already loaded

    try {
      const data = (await invoke('builtin_ai_list_models')) as any[];
      setBuiltinAiModels(data);

      // Auto-select first available model if none selected
      if (data.length > 0 && !modelConfig.model) {
        const firstAvailable = data.find((m: any) => m.status?.type === 'available');
        if (firstAvailable) {
          setModelConfig((prev: ModelConfig) => ({ ...prev, model: firstAvailable.name }));
        }
      }
    } catch (err) {
      console.error('Error loading Built-in AI models:', err);
      toast.error(t('models.builtin_load_failed'));
    }
  };

  // Restore cached model when async model lists become available
  useEffect(() => {
    const providerModels = modelOptions[modelConfig.provider];
    if (!providerModels || providerModels.length === 0) return;

    // If current model is already valid, nothing to do
    if (modelConfig.model && providerModels.includes(modelConfig.model)) return;

    // Try to restore from localStorage cache
    const map = JSON.parse(localStorage.getItem('providerModelMap') || '{}');
    const cachedModel = map[modelConfig.provider];
    if (cachedModel && providerModels.includes(cachedModel)) {
      setModelConfig((prev: ModelConfig) => ({ ...prev, model: cachedModel }));
    }
  }, [models, cloudCatalogModels, builtinAiModels, modelConfig.provider]);

  const handleSave = async () => {
    // For custom-openai provider, save the custom config first
    if (modelConfig.provider === 'custom-openai') {
      try {
        await invoke('api_save_custom_openai_config', {
          endpoint: customOpenAIEndpoint.trim(),
          apiKey: customOpenAIApiKey.trim() || null,
          model: customOpenAIModel.trim(),
          maxTokens: customMaxTokens ? parseInt(customMaxTokens, 10) : null,
          temperature: customTemperature ? parseFloat(customTemperature) : null,
          topP: customTopP ? parseFloat(customTopP) : null,
        });
        console.log('Custom OpenAI config saved successfully');
      } catch (err) {
        console.error('Failed to save custom OpenAI config:', err);
        toast.error('Failed to save custom OpenAI configuration');
        return;
      }
    }

    const updatedConfig = {
      ...modelConfig,
      apiKey: typeof apiKey === 'string' ? apiKey.trim() || null : null,
      ollamaEndpoint: modelConfig.provider === 'ollama'
        ? (ollamaEndpoint.trim() || null)
        : (modelConfig.ollamaEndpoint || null),
      // Include custom OpenAI fields
      customOpenAIEndpoint: modelConfig.provider === 'custom-openai' ? customOpenAIEndpoint.trim() : null,
      customOpenAIModel: modelConfig.provider === 'custom-openai' ? customOpenAIModel.trim() : null,
      customOpenAIApiKey: modelConfig.provider === 'custom-openai' && customOpenAIApiKey.trim() ? customOpenAIApiKey.trim() : null,
      maxTokens: modelConfig.provider === 'custom-openai' && customMaxTokens ? parseInt(customMaxTokens, 10) : null,
      temperature: modelConfig.provider === 'custom-openai' && customTemperature ? parseFloat(customTemperature) : null,
      topP: modelConfig.provider === 'custom-openai' && customTopP ? parseFloat(customTopP) : null,
      // For custom-openai, use the customOpenAIModel as the model field
      model: modelConfig.provider === 'custom-openai' ? customOpenAIModel.trim() : modelConfig.model,
    };
    const isCatalogProvider = ['claude', 'groq', 'openai', 'openrouter', 'builtin-ai'].includes(updatedConfig.provider);

    try {
      if (isCatalogProvider) {
        await persistBeforeInvalidatingCatalog(
          updatedConfig.provider,
          () => onSave(updatedConfig),
          (provider) => invalidateSummaryModelCatalog(provider as SummaryModelProvider),
        );
      } else {
        await onSave(updatedConfig);
      }
    } catch (error) {
      console.error('Failed to persist model configuration:', error);
      return;
    }

    setModelConfig({ ...updatedConfig, apiKey: null, customOpenAIApiKey: null });
    console.log('ModelSettingsModal - handleSave - Updated ModelConfig:', updatedConfig);

    // Persist confirmed model choice to per-provider cache.
    if (updatedConfig.model) {
      persistSummaryModel(updatedConfig.provider, updatedConfig.model);
    }

    setApiKey('');
    setCustomOpenAIApiKey('');
  };

  // Test custom OpenAI connection
  const testCustomOpenAIConnection = async () => {
    if (!customOpenAIEndpoint.trim() || !customOpenAIModel.trim()) {
      toast.error('Please enter endpoint URL and model name first');
      return;
    }

    setIsTestingConnection(true);
    try {
      const result = await invoke<{ status: string; message: string }>('api_test_custom_openai_connection', {
        endpoint: customOpenAIEndpoint.trim(),
        apiKey: customOpenAIApiKey.trim() || null,
        model: customOpenAIModel.trim(),
      });
      toast.success(result.message || 'Connection successful!');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(errorMsg);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleInputClick = () => {
    if (isApiKeyLocked) {
      setIsLockButtonVibrating(true);
      setTimeout(() => setIsLockButtonVibrating(false), 500);
    }
  };

  // Function to download recommended model
  const downloadRecommendedModel = async () => {
    const recommendedModel = 'gemma3:1b';

    // Prevent duplicate downloads (defense in depth - backend also checks)
    if (isDownloading(recommendedModel)) {
      toast.info(`${recommendedModel} is already downloading`, {
        description: `Progress: ${Math.round(getProgress(recommendedModel) || 0)}%`
      });
      return;
    }

    try {
      const endpoint = ollamaEndpoint.trim() || null;

      // The download will be tracked by the global context via events
      // Progress toasts are shown automatically by OllamaDownloadContext
      await invoke('pull_ollama_model', {
        modelName: recommendedModel,
        endpoint
      });

      // Refresh the models list after successful download
      await fetchOllamaModels(true);

      // Note: Model is NOT auto-selected - user must explicitly choose it
      // This respects the database as the single source of truth
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to download model';
      console.error('Error downloading model:', err);

      // Check if Ollama is not installed and show appropriate error
      if (isOllamaNotInstalledError(errorMsg)) {
        toast.error('Ollama is not installed', {
          description: 'Please download and install Ollama before downloading models.',
          duration: 7000,
          action: {
            label: 'Download',
            onClick: () => invoke('open_external_url', { url: 'https://ollama.com/download' })
          }
        });
        // Update the installation status flag
        setOllamaNotInstalled(true);
      }
      // Other errors are handled by the context
    }
  };

  // Function to delete Ollama model
  const deleteOllamaModel = async (modelName: string) => {
    try {
      const endpoint = ollamaEndpoint.trim() || null;
      await invoke('delete_ollama_model', {
        modelName,
        endpoint
      });

      toast.success(`Model ${modelName} deleted`);
      await fetchOllamaModels(true); // Refresh list
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete model';
      toast.error(errorMsg);
      console.error('Error deleting model:', err);
    }
  };

  // Track previous downloading models to detect completions
  const previousDownloadingRef = useRef<Set<string>>(new Set());

  // Refresh models list when download completes
  useEffect(() => {
    const current = downloadingModels;
    const previous = previousDownloadingRef.current;

    // Check if any downloads completed (were in previous, not in current)
    for (const modelName of previous) {
      if (!current.has(modelName)) {
        // Download completed, refresh models list
        console.log(`[ModelSettingsModal] Download completed for ${modelName}, refreshing list`);
        fetchOllamaModels(true);
        break; // Only refresh once even if multiple completed
      }
    }

    // Update ref for next comparison
    previousDownloadingRef.current = new Set(current);
  }, [downloadingModels]);

  // Filter Ollama models based on search query
  const filteredModels = models.filter((model) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const isLoaded = modelConfig.model === model.name;
    const loadedText = isLoaded ? 'loaded' : '';

    return (
      model.name.toLowerCase().includes(query) ||
      model.size.toLowerCase().includes(query) ||
      loadedText.includes(query)
    );
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{t('models.settings_title')}</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label>{t('models.summarization_model')}</Label>
          <div className="flex space-x-2 mt-1">
            <Select
              value={modelConfig.provider}
              onValueChange={(value) => {
                const provider = value as ModelConfig['provider'];

                // Clear error state when switching providers
                setError('');

                // Save current provider's model to localStorage before switching
                const map = JSON.parse(localStorage.getItem('providerModelMap') || '{}');
                if (modelConfig.model) {
                  map[modelConfig.provider] = modelConfig.model;
                  localStorage.setItem('providerModelMap', JSON.stringify(map));
                }

                // Try to restore cached model for the new provider
                const savedModel = map[provider];
                const providerModels = modelOptions[provider];
                const defaultModel = providerModels && providerModels.length > 0
                  ? providerModels[0]
                  : '';
                const model = (savedModel && providerModels?.includes(savedModel))
                  ? savedModel
                  : defaultModel;

                setModelConfig({
                  ...modelConfig,
                  provider,
                  model,
                });
                // Persisted keys remain opaque; this field is only for a newly typed replacement.

                // Load Built-in AI models when selected
                if (provider === 'builtin-ai') {
                  loadBuiltinAiModels();
                }

                // Load custom OpenAI config when selected
                if (provider === 'custom-openai') {
                  invoke<any>('api_get_custom_openai_config').then((config) => {
                    if (config) {
                      setCustomOpenAIEndpoint(config.endpoint || '');
                      setCustomOpenAIModel(config.model || '');
                      setCustomOpenAIApiKey('');
                      setCustomMaxTokens(config.maxTokens?.toString() || '');
                      setCustomTemperature(config.temperature?.toString() || '');
                      setCustomTopP(config.topP?.toString() || '');
                    }
                  }).catch((err) => {
                    console.error('Failed to load custom OpenAI config:', err);
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('models.select_provider')} />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                <SelectItem value="builtin-ai">{t('models.builtin_option')}</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="custom-openai">{t('models.custom_server_option')}</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
              </SelectContent>
            </Select>

            {modelConfig.provider !== 'builtin-ai' && modelConfig.provider !== 'custom-openai' && (
              <Popover open={modelComboboxOpen} onOpenChange={setModelComboboxOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={modelComboboxOpen}
                    className="flex-1 max-w-[200px] justify-between font-normal"
                  >
                    <span className="truncate">
                      {modelConfig.model || t('models.select_model_placeholder')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t('models.search_models')} />
                    <CommandList className="max-h-[300px]">
                      {isLoadingCloudCatalog && cloudCatalogProvider ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          <RefreshCw className="mx-auto h-4 w-4 animate-spin mb-2" />
                          {t('models.loading_models')}
                        </div>
                      ) : cloudCatalogError && cloudCatalogProvider ? (
                        <div className="py-6 px-4 text-center space-y-3">
                          <p className="text-sm text-destructive">{cloudCatalogError}</p>
                          <Button variant="outline" size="sm" onClick={() => refreshCloudCatalog()} className="mx-auto">
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />Reintentar
                          </Button>
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>{t('models.no_models_found')}</CommandEmpty>
                          <CommandGroup>
                            {visibleModelItems.map((model) => (
                              <CommandItem
                                key={model.id}
                                value={model.id}
                                onSelect={() => {
                                  setModelConfig((prev: ModelConfig) => ({ ...prev, model: model.id }));
                                  setModelComboboxOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    modelConfig.model === model.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="truncate">{model.label}</span>
                                {cloudCatalogProvider && <span className="ml-2 text-[10px] text-muted-foreground">{model.source === 'dynamic' ? 'Disponible' : 'Catálogo'}</span>}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* Custom OpenAI Configuration Section */}
        {modelConfig.provider === 'custom-openai' && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label htmlFor="custom-endpoint">{t('models.endpoint_url')}</Label>
              <Input
                id="custom-endpoint"
                value={customOpenAIEndpoint}
                onChange={(e) => setCustomOpenAIEndpoint(e.target.value)}
                placeholder="http://localhost:8000/v1"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('models.endpoint_url_desc')}
              </p>
            </div>

            <div>
              <Label htmlFor="custom-model">{t('models.model_name')}</Label>
              <Input
                id="custom-model"
                value={customOpenAIModel}
                onChange={(e) => setCustomOpenAIModel(e.target.value)}
                placeholder="gpt-4, llama-3-70b, etc."
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('models.model_name_desc')}
              </p>
            </div>

            <div>
              <Label htmlFor="custom-api-key">{t('models.api_key_optional')}</Label>
              <Input
                id="custom-api-key"
                type="password"
                value={customOpenAIApiKey}
                onChange={(e) => setCustomOpenAIApiKey(e.target.value)}
                placeholder={t('models.api_key_optional_placeholder')}
                className="mt-1"
              />
            </div>

            {/* Advanced Options (Collapsible) */}
            <div>
              <div
                className="flex items-center justify-between cursor-pointer py-2"
                onClick={() => setIsCustomOpenAIAdvancedOpen(!isCustomOpenAIAdvancedOpen)}
              >
                <Label className="cursor-pointer">{t('models.advanced_options')}</Label>
                {isCustomOpenAIAdvancedOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {isCustomOpenAIAdvancedOpen && (
                <div className="space-y-3 pl-2 border-l-2 border-muted mt-2">
                  <div>
                    <Label htmlFor="custom-max-tokens">{t('models.max_tokens')}</Label>
                    <Input
                      id="custom-max-tokens"
                      type="number"
                      value={customMaxTokens}
                      onChange={(e) => setCustomMaxTokens(e.target.value)}
                      placeholder="e.g., 4096"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="custom-temperature">{t('models.temperature')}</Label>
                    <Input
                      id="custom-temperature"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={customTemperature}
                      onChange={(e) => setCustomTemperature(e.target.value)}
                      placeholder="e.g., 0.7"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="custom-top-p">{t('models.top_p')}</Label>
                    <Input
                      id="custom-top-p"
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={customTopP}
                      onChange={(e) => setCustomTopP(e.target.value)}
                      placeholder="e.g., 0.9"
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test Connection Button */}
              <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={testCustomOpenAIConnection}
              disabled={isTestingConnection || !customOpenAIEndpoint.trim() || !customOpenAIModel.trim()}
              className="w-full"
            >
              {isTestingConnection ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t('models.testing_connection')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('models.test_connection')}
                </>
              )}
            </Button>
          </div>
        )}

        {requiresApiKey && (
          <div>
            <Label>{t('models.api_key')}</Label>
            <div className="relative mt-1">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey || ''}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isApiKeyLocked}
                placeholder={t('settings.api_key_placeholder')}
                className="pr-24"
              />
              {isApiKeyLocked && apiKey?.trim() && (
                <div
                  onClick={handleInputClick}
                  className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-md cursor-not-allowed"
                />
              )}
              <div className="absolute inset-y-0 right-0 pr-1 flex items-center space-x-1">
                {apiKey?.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsApiKeyLocked(!isApiKeyLocked)}
                    className={isLockButtonVibrating ? 'animate-vibrate text-destructive' : ''}
                    title={isApiKeyLocked ? t('models.unlock_to_edit') : t('models.lock_to_prevent')}
                  >
                    {isApiKeyLocked ? <Lock /> : <Unlock />}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
          </div>
        )}

        {modelConfig.provider === 'ollama' && (
          <div>
            <div
              className="flex items-center justify-between cursor-pointer py-2"
              onClick={() => setIsEndpointSectionCollapsed(!isEndpointSectionCollapsed)}
            >
              <Label className="cursor-pointer">{t('models.custom_endpoint')}</Label>
              {isEndpointSectionCollapsed ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {!isEndpointSectionCollapsed && (
              <>
                <p className="text-sm text-muted-foreground mt-1 mb-2">
                  {t('models.custom_endpoint_desc')}
                </p>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <Input
                      type="url"
                      value={ollamaEndpoint}
                      onChange={(e) => {
                        setOllamaEndpoint(e.target.value);
                        // Clear models and errors when endpoint changes to avoid showing stale data
                        if (e.target.value.trim() !== lastFetchedEndpoint.trim()) {
                          setModels([]);
                          setError(''); // Clear error state
                        }
                      }}
                      placeholder="http://localhost:11434"
                      className={cn(
                        "pr-10",
                        endpointValidationState === 'invalid' && "border-destructive"
                      )}
                    />
                    {endpointValidationState === 'valid' && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-impulso-ocean" />
                    )}
                    {endpointValidationState === 'invalid' && (
                      <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-destructive" />
                    )}
                  </div>
                  <Button
                    type="button"
                    size={'sm'}
                    onClick={() => fetchOllamaModels()}
                    disabled={isLoadingOllama}
                    variant="outline"
                    className="whitespace-nowrap"
                  >
                    {isLoadingOllama ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        {t('models.fetching')}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('models.fetch_models')}
                      </>
                    )}
                  </Button>
                </div>
                {ollamaEndpointChanged && !error && (
                  <Alert className="mt-3 border-impulso-ocean/30 bg-impulso-ocean/10">
                    <AlertDescription className="text-impulso-ocean">
                      {t('models.endpoint_changed_alert')}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}

        {modelConfig.provider === 'ollama' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold">{t('models.available_ollama')}</h4>
              {lastFetchedEndpoint && models.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('models.using')}</span>
                  <code className="px-2 py-1 bg-muted rounded text-xs">
                    {lastFetchedEndpoint || 'http://localhost:11434'}
                  </code>
                </div>
              )}
            </div>
            {models.length > 0 && (
              <div className="mb-4">
                <Input
                  placeholder={t('models.search_models')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
            )}
            {isLoadingOllama ? (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="mx-auto h-8 w-8 animate-spin mb-2" />
                {t('models.loading_models')}
              </div>
            ) : models.length === 0 ? (
              <div className="space-y-3">
                {ollamaNotInstalled ? (
                  /* Show Ollama download link when not installed */
                  <div className="space-y-4">
                    <Alert className="border-impulso-ocean/30 bg-impulso-ocean/10">
                      <AlertDescription className="text-impulso-ocean">
                        {t('models.ollama_not_installed_alert')}
                      </AlertDescription>
                    </Alert>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => invoke('open_external_url', { url: 'https://ollama.com/download' })}
                      className="w-full bg-primary hover:bg-primary/90"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t('models.download_ollama')}
                    </Button>
                    <div className="text-sm text-muted-foreground text-center">
                      {t('models.restart_hint')}
                    </div>
                  </div>
                ) : (
                  /* Show model download option when Ollama is installed but no models */
                  <>
                    <Alert className="mb-4">
                      <AlertDescription>
                        {ollamaEndpointChanged
                          ? t('models.endpoint_changed_short')
                          : t('models.none_found_download_hint')}
                      </AlertDescription>
                    </Alert>
                    {!ollamaEndpointChanged && (
                      <div className="space-y-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadRecommendedModel}
                          disabled={isDownloading('gemma3:1b')}
                          className="w-full"
                        >
                          {isDownloading('gemma3:1b') ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              {t('models.downloading_model').replace('{model}', 'gemma3:1b')}
                            </>
                          ) : (
                            <>
                              <Download className="mr-2 h-4 w-4" />
                              {t('models.download_recommended').replace('{model}', 'gemma3:1b')}
                            </>
                          )}
                        </Button>

                        {/* Show progress for gemma3:1b download */}
                        {isDownloading('gemma3:1b') && getProgress('gemma3:1b') !== undefined && (
                          <div className="bg-card rounded-md border p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-primary">{t('models.downloading_label').replace('{model}', 'gemma3:1b')}</span>
                              <span className="text-sm font-semibold text-primary">
                                {Math.round(getProgress('gemma3:1b')!)}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-300"
                                style={{ width: `${getProgress('gemma3:1b')}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : !ollamaEndpointChanged && (
              <ScrollArea className="max-h-[calc(100vh-450px)] overflow-y-auto pr-4">
                {filteredModels.length === 0 ? (
                  <Alert>
                    <AlertDescription>
                      {t('models.no_search_results').replace('{query}', searchQuery)}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid gap-4">
                    {filteredModels.map((model) => {
                      const progress = getProgress(model.name);
                      const modelIsDownloading = isDownloading(model.name);

                      return (
                        <div
                          key={model.id}
                          className={cn(
                            'bg-card p-2 m-0 rounded-md border transition-colors',
                            modelConfig.model === model.name
                              ? 'ring-1 ring-primary border-primary bg-primary/10'
                              : 'hover:bg-muted/50',
                            !modelIsDownloading && 'cursor-pointer'
                          )}
                          onClick={() => {
                            if (!modelIsDownloading) {
                              setModelConfig((prev: ModelConfig) => ({ ...prev, model: model.name }))
                            }
                          }}
                          >
                          <div>
                            <b className="font-bold">{model.name}&nbsp;</b>
                            <span className="text-muted-foreground">{t('models.size_label')} </span>
                            <span className="font-mono font-bold text-sm">{model.size}</span>
                          </div>

                          {/* Progress bar for downloading models */}
                          {modelIsDownloading && progress !== undefined && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-primary">{t('models.downloading')}</span>
                                <span className="text-sm font-semibold text-primary">{Math.round(progress)}%</span>
                              </div>
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all duration-300"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
        )}

        {/* Built-in AI Models Section */}
        {modelConfig.provider === 'builtin-ai' && (
          <div className="mt-6">
            <BuiltInModelManager
              selectedModel={modelConfig.model}
              layout={layout}
              onModelSelect={(model) =>
                setModelConfig((prev: ModelConfig) => ({ ...prev, model }))
              }
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          className={cn(
            'px-4 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary',
            isDoneDisabled ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
          onClick={handleSave}
          disabled={isDoneDisabled}
        >
          {t('dialog.save')}
        </Button>
      </div>
    </div>
  );
}
