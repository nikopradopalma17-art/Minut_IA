"use client";

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/contexts/TranslationContext';
import {
  TemplateDetails,
  TemplateInfo,
  TemplatePayload,
  TemplateSectionForm,
} from '@/hooks/meeting-details/useTemplates';

interface TemplateManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateInfo[];
  selectedTemplate: string;
  onSelectTemplate: (templateId: string, templateName: string) => void;
  getTemplateDetails: (templateId: string) => Promise<TemplateDetails>;
  saveCustomTemplate: (templateId: string, template: TemplatePayload) => Promise<TemplateDetails>;
  deleteCustomTemplate: (templateId: string) => Promise<void>;
  onTemplatesUpdated?: () => Promise<void> | void;
}

const EMPTY_SECTION: TemplateSectionForm = {
  title: '',
  instruction: '',
  format: 'paragraph',
  item_format: null,
  example_item_format: null,
};

function cloneSections(sections: TemplateSectionForm[]) {
  return sections.map((section) => ({ ...section }));
}

export function TemplateManagerDialog({
  open,
  onOpenChange,
  templates,
  selectedTemplate,
  onSelectTemplate,
  getTemplateDetails,
  saveCustomTemplate,
  deleteCustomTemplate,
  onTemplatesUpdated,
}: TemplateManagerDialogProps) {
  const { t } = useTranslation();
  const [activeTemplateId, setActiveTemplateId] = useState(selectedTemplate);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSystemPrompt, setTemplateSystemPrompt] = useState('');
  const [sections, setSections] = useState<TemplateSectionForm[]>(cloneSections([EMPTY_SECTION]));
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeTemplateId) || null,
    [activeTemplateId, templates],
  );

  const resetToTemplate = (details: TemplateDetails) => {
    setTemplateId(details.id);
    setTemplateName(details.name);
    setTemplateDescription(details.description);
    setTemplateSystemPrompt(details.system_prompt || '');
    setSections(details.sections.length > 0 ? cloneSections(details.sections) : cloneSections([EMPTY_SECTION]));
    setLoadError(null);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTemplateId(selectedTemplate);
    setMode('existing');
  }, [open, selectedTemplate]);

  useEffect(() => {
    if (!open || mode !== 'existing') {
      return;
    }

    let cancelled = false;
    setIsLoadingDetails(true);
    setLoadError(null);

    void (async () => {
      try {
        const details = await getTemplateDetails(activeTemplateId);
        if (cancelled) return;
        resetToTemplate(details);
      } catch (error) {
        console.error('Failed to load template details:', error);
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDetails(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTemplateId, getTemplateDetails, mode, open]);

  const startNewTemplate = async (sourceTemplateId?: string) => {
    try {
      let source: TemplateDetails | null = null;
      if (sourceTemplateId) {
        source = await getTemplateDetails(sourceTemplateId);
      }

      setMode('new');
      setLoadError(null);
      setTemplateId(source ? `custom_${source.id}` : 'custom_template');
      setTemplateName(source ? `${source.name} (personalizada)` : '');
      setTemplateDescription(source ? source.description : '');
      setTemplateSystemPrompt(source ? source.system_prompt || '' : '');
      setSections(source?.sections?.length ? cloneSections(source.sections) : cloneSections([EMPTY_SECTION]));
    } catch (error) {
      console.error('Failed to prepare new template:', error);
      toast.error(t('templates.load_failed'));
    }
  };

  const addSection = () => {
    setSections((current) => [...current, { ...EMPTY_SECTION }]);
  };

  const updateSection = (index: number, patch: Partial<TemplateSectionForm>) => {
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    );
  };

  const removeSection = (index: number) => {
    setSections((current) => current.filter((_, sectionIndex) => sectionIndex !== index));
  };

  const saveTemplate = async () => {
    const trimmedId = templateId.trim();
    const trimmedName = templateName.trim();
    const trimmedDescription = templateDescription.trim();
    const trimmedSystemPrompt = templateSystemPrompt.trim();

    if (!trimmedId || !trimmedName || !trimmedDescription || sections.length === 0) {
      setLoadError(t('templates.validation_required'));
      return;
    }

    if (mode === 'existing' && !activeTemplate?.is_custom) {
      setLoadError(t('templates.readonly_note'));
      return;
    }

    const payload: TemplatePayload = {
      name: trimmedName,
      description: trimmedDescription,
      system_prompt: trimmedSystemPrompt || null,
      sections: sections.map((section) => ({
        title: section.title.trim(),
        instruction: section.instruction.trim(),
        format: section.format,
        item_format: section.item_format?.trim() || null,
        example_item_format: section.example_item_format?.trim() || null,
      })),
    };

    if (payload.sections.some((section) => !section.title || !section.instruction)) {
      setLoadError(t('templates.validation_required'));
      return;
    }

    setIsSaving(true);
    setLoadError(null);
    try {
      const saved = await saveCustomTemplate(trimmedId, payload);
      onSelectTemplate(saved.id, saved.name);
      setActiveTemplateId(saved.id);
      setMode('existing');
      await onTemplatesUpdated?.();
    } catch (error) {
      console.error('Failed to save custom template:', error);
      setLoadError(error instanceof Error ? error.message : String(error));
      toast.error(t('templates.save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!activeTemplate?.is_custom) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteCustomTemplate(activeTemplate.id);
      await onTemplatesUpdated?.();
      const fallback = templates.find((template) => !template.is_custom) || templates[0];
      if (fallback) {
        onSelectTemplate(fallback.id, fallback.name);
        setActiveTemplateId(fallback.id);
      }
      setMode('existing');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to delete custom template:', error);
      toast.error(t('templates.delete_failed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const canDelete = mode === 'existing' && !!activeTemplate?.is_custom;
  const canEditId = mode === 'new';
  const canSave = mode === 'new' || !!activeTemplate?.is_custom;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('templates.manager_title')}</DialogTitle>
          <DialogDescription>{t('templates.manager_description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3 border rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">{t('templates.available_title')}</h3>
              <Button size="sm" variant="outline" onClick={() => void startNewTemplate()}>
                <Plus className="mr-2 h-4 w-4" />
                {t('templates.new')}
              </Button>
            </div>

            <ScrollArea className="h-[60vh] pr-3">
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setActiveTemplateId(template.id);
                      setMode('existing');
                    }}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      activeTemplateId === template.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{template.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {template.description}
                        </div>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {template.is_custom ? t('templates.custom_badge') : t('templates.default_badge')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-4">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('templates.loading')}
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {loadError}
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="template-id">{t('templates.template_id')}</Label>
                    <Input
                      id="template-id"
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                      disabled={!canEditId}
                      placeholder={t('templates.template_id_placeholder')}
                    />
                    {!canEditId && (
                      <p className="text-xs text-muted-foreground">{t('templates.template_id_hint')}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-name">{t('templates.name')}</Label>
                    <Input
                      id="template-name"
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      placeholder={t('templates.name_placeholder')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-description">{t('templates.description')}</Label>
                  <Textarea
                    id="template-description"
                    value={templateDescription}
                    onChange={(event) => setTemplateDescription(event.target.value)}
                    placeholder={t('templates.description_placeholder')}
                    className="min-h-[72px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-system-prompt">{t('templates.system_prompt')}</Label>
                  <Textarea
                    id="template-system-prompt"
                    value={templateSystemPrompt}
                    onChange={(event) => setTemplateSystemPrompt(event.target.value)}
                    placeholder={t('templates.system_prompt_placeholder')}
                    className="min-h-[110px]"
                  />
                </div>

                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{t('templates.sections')}</h3>
                      <p className="text-sm text-muted-foreground">{t('templates.sections_help')}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addSection}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('templates.add_section')}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {sections.map((section, index) => (
                      <div key={`${section.title}-${index}`} className="rounded-md border p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-medium text-sm">{t('templates.section_label').replace('{index}', String(index + 1))}</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSection(index)}
                            disabled={sections.length === 1}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('templates.remove_section')}
                          </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t('templates.section_title')}</Label>
                            <Input
                              value={section.title}
                              onChange={(event) => updateSection(index, { title: event.target.value })}
                              placeholder={t('templates.section_title_placeholder')}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('templates.section_format')}</Label>
                            <Select
                              value={section.format}
                              onValueChange={(value) =>
                                updateSection(index, {
                                  format: value as TemplateSectionForm['format'],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('templates.section_format_placeholder')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="paragraph">{t('templates.format_paragraph')}</SelectItem>
                                <SelectItem value="list">{t('templates.format_list')}</SelectItem>
                                <SelectItem value="string">{t('templates.format_string')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('templates.section_instruction')}</Label>
                          <Textarea
                            value={section.instruction}
                            onChange={(event) => updateSection(index, { instruction: event.target.value })}
                            placeholder={t('templates.section_instruction_placeholder')}
                            className="min-h-[84px]"
                          />
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t('templates.section_item_format')}</Label>
                            <Textarea
                              value={section.item_format || ''}
                              onChange={(event) =>
                                updateSection(index, {
                                  item_format: event.target.value || null,
                                })
                              }
                              placeholder={t('templates.section_item_format_placeholder')}
                              className="min-h-[76px]"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('templates.section_example_format')}</Label>
                            <Textarea
                              value={section.example_item_format || ''}
                              onChange={(event) =>
                                updateSection(index, {
                                  example_item_format: event.target.value || null,
                                })
                              }
                              placeholder={t('templates.section_example_format_placeholder')}
                              className="min-h-[76px]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {mode === 'existing' && !activeTemplate?.is_custom && (
                  <div className="rounded-lg border border-impulso-ocean/30 bg-impulso-ocean/10 p-3 text-sm text-impulso-ocean">
                    {t('templates.readonly_note')}
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                  {mode === 'existing' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void startNewTemplate(activeTemplateId)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {t('templates.duplicate')}
                    </Button>
                  ) : null}
                  {canDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void deleteTemplate()}
                      disabled={isDeleting || isSaving}
                    >
                      {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      {t('templates.delete')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => void saveTemplate()}
                    disabled={isSaving || !canSave}
                  >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
                    {t('templates.save')}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
