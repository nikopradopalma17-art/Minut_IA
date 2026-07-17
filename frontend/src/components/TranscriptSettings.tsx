import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { ModelManager } from './WhisperModelManager';
import { ParakeetModelManager } from './ParakeetModelManager';
import { useTranslation } from '@/contexts/TranslationContext';

export interface TranscriptModelProps {
  provider: 'localWhisper' | 'parakeet';
  model: string;
  apiKey?: string | null;
}

export interface TranscriptSettingsProps {
  transcriptModelConfig: TranscriptModelProps;
  setTranscriptModelConfig: (config: TranscriptModelProps) => void;
  onModelSelect?: () => void;
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig, onModelSelect }: TranscriptSettingsProps) {
  const { t } = useTranslation();

  const selectModel = (provider: TranscriptModelProps['provider'], model: string) => {
    setTranscriptModelConfig({ provider, model, apiKey: null });
    onModelSelect?.();
  };

  return (
    <div className="space-y-4 pb-6">
      <div>
        <Label className="block text-sm font-medium text-foreground mb-1">
          {t('settings.transcript_model')}
        </Label>
        <Select
          value={transcriptModelConfig.provider}
          onValueChange={(provider: TranscriptModelProps['provider']) => {
            setTranscriptModelConfig({
              provider,
              model: provider === transcriptModelConfig.provider ? transcriptModelConfig.model : '',
              apiKey: null,
            });
          }}
        >
          <SelectTrigger className="focus:ring-1 focus:ring-primary focus:border-primary">
            <SelectValue placeholder={t('settings.select_provider')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="parakeet">{t('settings.provider_parakeet')}</SelectItem>
            <SelectItem value="localWhisper">{t('settings.provider_whisper')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {transcriptModelConfig.provider === 'localWhisper' ? (
        <ModelManager
          selectedModel={transcriptModelConfig.model}
          onModelSelect={(model) => selectModel('localWhisper', model)}
          autoSave={true}
        />
      ) : (
        <ParakeetModelManager
          selectedModel={transcriptModelConfig.model}
          onModelSelect={(model) => selectModel('parakeet', model)}
          autoSave={true}
        />
      )}
    </div>
  );
}
