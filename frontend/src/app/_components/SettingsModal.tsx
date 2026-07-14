import { DeviceSelection } from "@/components/DeviceSelection";
import { LanguageSelection } from "@/components/LanguageSelection";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TranscriptSettings } from "@/components/TranscriptSettings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useConfig } from "@/contexts/ConfigContext";
import { useRecordingState } from "@/contexts/RecordingStateContext";
import { useTranslation } from "@/contexts/TranslationContext";

type modalType = "modelSettings" | "deviceSettings" | "languageSettings" | "modelSelector" | "errorAlert" | "chunkDropWarning";

/**
 * SettingsModals Component
 *
 * All settings modals consolidated into a single component.
 * Uses ConfigContext and RecordingStateContext internally - no prop drilling needed!
 */

interface SettingsModalsProps {
  modals: {
    modelSettings: boolean;
    deviceSettings: boolean;
    languageSettings: boolean;
    modelSelector: boolean;
    errorAlert: boolean;
    chunkDropWarning: boolean;
  };
  messages: {
    errorAlert: string;
    chunkDropWarning: string;
    modelSelector: string;
  };
  onClose: (name: modalType) => void;
}

export function SettingsModals({
  modals,
  messages,
  onClose,
}: SettingsModalsProps) {
  // Contexts
  const {
    selectedDevices,
    setSelectedDevices,
    selectedLanguage,
    setSelectedLanguage,
    transcriptModelConfig,
    setTranscriptModelConfig,
    showConfidenceIndicator,
    toggleConfidenceIndicator,
  } = useConfig();

  const { isRecording } = useRecordingState();
  const { t } = useTranslation();

  return <>
    {/* Legacy Settings Modal */}
    <Dialog open={modals.modelSettings} onOpenChange={(open) => !open && onClose("modelSettings")}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 border-b border-border space-y-0">
          <DialogTitle className="font-heading">{t('settings_modal.preferences_title')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <SettingsPanel />
        </div>

        <DialogFooter className="p-6 border-t border-border">
          <Button onClick={() => onClose('modelSettings')}>
            {t('settings_modal.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Device Settings Modal */}
    <Dialog open={modals.deviceSettings} onOpenChange={(open) => !open && onClose('deviceSettings')}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('settings_modal.device_settings_title')}</DialogTitle>
        </DialogHeader>

        <DeviceSelection
          selectedDevices={selectedDevices}
          onDeviceChange={setSelectedDevices}
          disabled={isRecording}
        />

        <DialogFooter>
          <Button
            onClick={() => {
              const micDevice = selectedDevices.micDevice || 'Default';
              const systemDevice = selectedDevices.systemDevice || 'Default';
              toast.success(t('settings_modal.devices_selected_toast'), {
                description: t('settings_modal.devices_selected_desc')
                  .replace('{mic}', micDevice)
                  .replace('{system}', systemDevice)
              });
              onClose('deviceSettings');
            }}
          >
            {t('settings_modal.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Language Settings Modal */}
    <Dialog open={modals.languageSettings} onOpenChange={(open) => !open && onClose('languageSettings')}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('settings_modal.language_settings_title')}</DialogTitle>
        </DialogHeader>

        <LanguageSelection
          selectedLanguage={selectedLanguage}
          onLanguageChange={setSelectedLanguage}
          disabled={isRecording}
          provider={transcriptModelConfig.provider}
        />

        <DialogFooter>
          <Button onClick={() => onClose('languageSettings')}>
            {t('settings_modal.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Model Selection Modal */}
    <Dialog open={modals.modelSelector} onOpenChange={(open) => !open && onClose('modelSelector')}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border space-y-0">
          <DialogTitle className="font-heading">
            {messages.modelSelector ? t('settings_modal.speech_setup_required_title') : t('settings_modal.transcription_model_settings_title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <TranscriptSettings
            transcriptModelConfig={transcriptModelConfig}
            setTranscriptModelConfig={setTranscriptModelConfig}
            onModelSelect={() => onClose('modelSelector')}
          />
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-border sm:justify-between">
          {/* Confidence Indicator Toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="confidence-indicator-toggle"
              checked={showConfidenceIndicator}
              onCheckedChange={toggleConfidenceIndicator}
            />
            <label htmlFor="confidence-indicator-toggle" className="cursor-pointer">
              <p className="text-sm font-medium text-foreground">{t('settings_modal.confidence_toggle_label')}</p>
              <p className="text-xs text-muted-foreground">{t('settings_modal.confidence_toggle_desc')}</p>
            </label>
          </div>

          <Button variant="outline" onClick={() => onClose('modelSelector')}>
            {messages.modelSelector ? t('settings_modal.cancel') : t('settings_modal.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Error Alert Modal */}
    <Dialog open={modals.errorAlert} onOpenChange={(open) => !open && onClose('errorAlert')}>
      <DialogContent className="max-w-md">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('settings_modal.recording_stopped_title')}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{messages.errorAlert}</p>
            <Button size="sm" variant="destructive" onClick={() => onClose('errorAlert')}>
              {t('settings_modal.dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>

    {/* Chunk Drop Warning Modal */}
    <Dialog open={modals.chunkDropWarning} onOpenChange={(open) => !open && onClose('chunkDropWarning')}>
      <DialogContent className="max-w-lg">
        <Alert className="border-impulso-ocean/30 bg-impulso-ocean/5">
          <AlertTriangle className="h-4 w-4 text-impulso-ocean" />
          <AlertTitle className="text-impulso-ocean">{t('settings_modal.perf_warning_title')}</AlertTitle>
          <AlertDescription className="space-y-3 text-impulso-ocean">
            <p>{messages.chunkDropWarning}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onClose('chunkDropWarning')}
              className="border-impulso-ocean/40 text-impulso-ocean hover:bg-impulso-ocean/10"
            >
              {t('settings_modal.dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>
  </>
}
