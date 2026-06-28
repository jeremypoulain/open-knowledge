import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type AiProviderId,
  bindFrontmatterDoc,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pickDefaultProvider, useAiStatus } from '@/hooks/use-ai-status';
import { emitAiRenameDoc } from '@/lib/ai-rename-events';
import { httpAiKeyTransport } from '@/lib/transports/ai-key-transport';
import { cn } from '@/lib/utils';

interface SuggestFilenamePanelProps {
  provider: HocuspocusProvider;
  onBack: () => void;
  onApplied: () => void;
}

/** Mirrors the server-side sanitizer so the editable field can only ever emit a
 *  safe kebab-case base name (no directory, no extension). */
function slugifyFilename(value: string, maxLen = 60): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > maxLen ? slug.slice(0, maxLen).replace(/-+$/g, '') : slug;
}

function docBodyMarkdown(provider: HocuspocusProvider): string {
  const ytext = provider.document.getText('source').toString();
  const { body } = stripFrontmatter(ytext);
  return body.trim();
}

function readTitle(provider: HocuspocusProvider): string {
  const binding = bindFrontmatterDoc(provider);
  try {
    const value = binding.current()?.map.title;
    return typeof value === 'string' ? value.trim() : '';
  } finally {
    binding.dispose();
  }
}

export function SuggestFilenamePanel({ provider, onBack, onApplied }: SuggestFilenamePanelProps) {
  const { t } = useLingui();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const { status } = useAiStatus();

  const docName = provider.configuration.name ?? '';
  const lastSlash = docName.lastIndexOf('/');
  const currentBase = lastSlash === -1 ? docName : docName.slice(lastSlash + 1);

  const load = useEffectEvent(async () => {
    setLoading(true);
    setError(null);
    setFilename('');
    const provider2: AiProviderId | undefined = pickDefaultProvider(status) ?? undefined;
    const result = await httpAiKeyTransport().suggestFilename({
      provider: provider2,
      docMarkdown: docBodyMarkdown(provider),
      existingTitle: readTitle(provider),
      currentFilename: currentBase,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? t`Couldn't get a suggestion — try again.`);
      return;
    }
    setFilename(result.filename ?? '');
  });

  useEffect(() => {
    void load();
  }, []);

  const trimmed = slugifyFilename(filename);
  const unchanged = trimmed === slugifyFilename(currentBase);
  const canApply = !loading && !error && trimmed !== '' && !unchanged;

  function apply() {
    if (!canApply) return;
    emitAiRenameDoc({ docName, newBaseName: trimmed });
    onApplied();
  }

  return (
    <div className="space-y-3" data-testid="suggest-filename-popover">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            onClick={onBack}
            aria-label={t`Back`}
            data-testid="suggest-filename-back"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="text-sm font-medium">
            <Trans>Suggested filename</Trans>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-muted-foreground"
          onClick={() => void load()}
          disabled={loading}
          data-testid="suggest-filename-regenerate"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
          <Trans>Regenerate</Trans>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          <Trans>Asking the model...</Trans>
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" data-testid="suggest-filename-error">
          {error}
        </p>
      ) : (
        <div className="space-y-1">
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder={t`No filename suggestion`}
            data-testid="suggest-filename-input"
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
          />
          <p className="text-muted-foreground text-xs">
            <Trans>Renames the file and updates links pointing to it.</Trans>
          </p>
        </div>
      )}

      <div className="flex items-center justify-end pt-1">
        <Button size="sm" onClick={apply} disabled={!canApply} data-testid="suggest-filename-apply">
          <Trans>Rename</Trans>
        </Button>
      </div>
    </div>
  );
}
