import type { HocuspocusProvider } from '@hocuspocus/provider';
import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronRight, FileText, Sparkles, Tags } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { onSuggestMetadata } from '@/editor/ai/suggest-metadata-events';
import { SuggestFilenamePanel } from './SuggestFilenamePanel';
import { SuggestMetadataPanel } from './SuggestMetadataPanel';

interface SuggestAiPopoverProps {
  provider: HocuspocusProvider;
  disabled?: boolean;
}

type View = 'menu' | 'metadata' | 'filename';

export function SuggestAiPopover({ provider, disabled }: SuggestAiPopoverProps) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');

  const docName = provider.configuration.name ?? '';

  // The ⌥⌘ T shortcut jumps straight to the metadata panel for this document.
  // Setting `open` programmatically does not fire `onOpenChange`, so the view
  // we pick here is preserved (user clicks always reset to the menu instead).
  useEffect(() => {
    return onSuggestMetadata((target) => {
      if (disabled) return;
      if (target === null || target === docName) {
        setView('metadata');
        setOpen(true);
      }
    });
  }, [docName, disabled]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Always reopen on the menu; reset on close so the next open starts fresh.
    setView('menu');
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t`AI suggestions`}
          disabled={disabled}
          data-testid="suggest-ai-button"
        >
          <Sparkles aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-3"
        data-testid="suggest-ai-popover"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {view === 'menu' ? (
          <div className="space-y-1" data-testid="suggest-ai-menu">
            <div className="px-1 pb-1 text-sm font-medium">
              <Trans>AI suggestions</Trans>
            </div>
            <button
              type="button"
              onClick={() => setView('metadata')}
              data-testid="suggest-ai-menu-metadata"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <Tags className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">
                <Trans>Suggest metadata</Trans>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setView('filename')}
              data-testid="suggest-ai-menu-filename"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">
                <Trans>Suggest filename</Trans>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        ) : view === 'metadata' ? (
          <SuggestMetadataPanel
            provider={provider}
            onBack={() => setView('menu')}
            onApplied={() => setOpen(false)}
          />
        ) : (
          <SuggestFilenamePanel
            provider={provider}
            onBack={() => setView('menu')}
            onApplied={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
