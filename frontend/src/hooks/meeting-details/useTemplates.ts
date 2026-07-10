"use client";

import { useState, useEffect, useCallback } from 'react';
import { invoke as invokeTauri } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import Analytics from '@/lib/analytics';
import { useTranslation } from '@/contexts/TranslationContext';

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  system_prompt?: string | null;
  is_custom: boolean;
}

export interface TemplateSectionForm {
  title: string;
  instruction: string;
  format: 'paragraph' | 'list' | 'string';
  item_format?: string | null;
  example_item_format?: string | null;
}

export interface TemplateDetails extends TemplateInfo {
  sections: TemplateSectionForm[];
}

export interface TemplatePayload {
  name: string;
  description: string;
  system_prompt?: string | null;
  sections: TemplateSectionForm[];
}

export function useTemplates() {
  const { t } = useTranslation();
  const [availableTemplates, setAvailableTemplates] = useState<TemplateInfo[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('minuta_corporativa');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const refreshTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const templates = await invokeTauri('api_list_templates') as TemplateInfo[];
      setAvailableTemplates(templates);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      toast.error(t('templates.load_failed'));
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [t]);

  // Fetch available templates on mount
  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  // Handle template selection
  const handleTemplateSelection = useCallback((templateId: string, templateName: string) => {
    setSelectedTemplate(templateId);
    toast.success(t('templates.selected_title'), {
      description: t('templates.selected_description').replace('{name}', templateName),
    });
    Analytics.trackFeatureUsed('template_selected');
  }, [t]);

  const getTemplateDetails = useCallback(async (templateId: string) => {
    const template = await invokeTauri('api_get_template_details', {
      templateId,
    }) as TemplateDetails;
    return template;
  }, []);

  const saveCustomTemplate = useCallback(async (templateId: string, template: TemplatePayload) => {
    const result = await invokeTauri('api_save_custom_template', {
      request: {
        template_id: templateId,
        template,
      },
    }) as TemplateDetails;

    await refreshTemplates();
    setSelectedTemplate(result.id);
    toast.success(t('templates.saved_title'), {
      description: t('templates.saved_description').replace('{name}', result.name),
    });
    return result;
  }, [refreshTemplates, t]);

  const deleteCustomTemplate = useCallback(async (templateId: string) => {
    await invokeTauri('api_delete_custom_template', {
      templateId,
    });

    await refreshTemplates();
    toast.success(t('templates.deleted_title'), {
      description: t('templates.deleted_description'),
    });
  }, [refreshTemplates, t]);

  return {
    availableTemplates,
    selectedTemplate,
    isLoadingTemplates,
    refreshTemplates,
    handleTemplateSelection,
    getTemplateDetails,
    saveCustomTemplate,
    deleteCustomTemplate,
    setSelectedTemplate,
  };
}
