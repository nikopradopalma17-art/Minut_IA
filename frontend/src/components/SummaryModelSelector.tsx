'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { filterSummaryModels, type SummaryModelProvider } from '@/lib/summaryModelCatalog';
import { useSummaryModelCatalog } from '@/hooks/useSummaryModelCatalog';

interface SummaryModelSelectorProps {
  provider: Exclude<SummaryModelProvider, 'builtin-ai'>;
  value: string;
  onValueChange: (model: string) => void;
  className?: string;
}

export function SummaryModelSelector({ provider, value, onValueChange, className }: SummaryModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { models, isLoading, error, refresh } = useSummaryModelCatalog(provider, value, onValueChange);
  const options = filterSummaryModels(models, query);
  const selected = models.find(model => model.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn('w-full justify-between font-normal', className)}>
          <span className="truncate">{selected?.label || value || 'Selecciona un modelo'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Buscar modelos..." />
          <CommandList className="max-h-[300px]">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground"><RefreshCw className="mx-auto h-4 w-4 animate-spin mb-2" />Cargando modelos...</div>
            ) : error ? (
              <div className="py-6 px-4 text-center space-y-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={() => refresh()} className="mx-auto">
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />Reintentar
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>No se encontraron modelos.</CommandEmpty>
                <CommandGroup>{options.map(model => <CommandItem key={model.id} value={model.id} onSelect={() => { onValueChange(model.id); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4', value === model.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{model.label}</span>
                </CommandItem>)}</CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
