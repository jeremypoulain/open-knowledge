import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type AiProviderId,
  bindFrontmatterDoc,
  type FrontmatterBinding,
  type FrontmatterSnapshot,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { onSuggestTags } from '@/editor/ai/suggest-tags-events';
import { pickDefaultProvider, useAiStatus } from '@/hooks/use-ai-status';
import { httpAiKeyTransport } from '@/lib/transports/ai-key-transport';
import { cn } from '@/lib/utils';

interface SuggestTagsPopoverProps {
  provider: HocuspocusProvider;
  disabled?: boolean;
}

function stripHash(v: string): string {
  return v.startsWith('#') ? v.slice(1) : v;
}

function readExistingTags(snapshot: FrontmatterSnapshot | null): string[] {
  if (!snapshot) return [];
  const value = snapshot.map.tags;
  if (Array.isArray(value)) {
    return value
      .filter((x): x is string => typeof x === 'string')
      .map((x) => stripHash(x.trim()))
      .filter((x) => x !== '');
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(',')
      .map((x) => stripHash(x.trim()))
      .filter((x) => x !== '');
  }
  return [];
}

function docBodyMarkdown(provider: HocuspocusProvider): string {
  const ytext = provider.document.getText('source').toString();
  const { body } = stripFrontmatter(ytext);
  return body.trim();
}

export function SuggestTagsPopover({ provider, disabled }: SuggestTagsPopoverProps) {
  const { t } = useLingui();
  const [binding, setBinding] = useState<FrontmatterBinding | null>(null);
  const [snapshot, setSnapshot] = useState<FrontmatterSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { status } = useAiStatus();

  const docName = provider.configuration.name ?? '';

  useEffect(() => {
    const next = bindFrontmatterDoc(provider);
    setBinding(next);
    setSnapshot(next.current());
    const unsub = next.subscribe((s) => setSnapshot(s));
    return () => {
      unsub();
      next.dispose();
      setBinding((prev) => (prev === next ? null : prev));
    };
  }, [provider]);

  const existingTags = readExistingTags(snapshot);

  // Open via the ⌥⌘ T shortcut when it targets this document.
  useEffect(() => {
    return onSuggestTags((target) => {
      if (disabled) return;
      if (target === null || target === docName) setOpen(true);
    });
  }, [docName, disabled]);

  const load = useEffectEvent(async () => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSelected(new Set());
    const body = docBodyMarkdown(provider);
    const provider2: AiProviderId | undefined = pickDefaultProvider(status) ?? undefined;
    const result = await httpAiKeyTransport().suggestTags({
      provider: provider2,
      docMarkdown: body,
      existingTags,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? t`Couldn't get suggestions — try again.`);
      return;
    }
    // Bias toward the existing vocabulary: prepend existing tags that the
    // model didn't return so the user can re-affirm them.
    const merged = [...new Set([...result.tags, ...existingTags])].slice(0, 12);
    setSuggestions(merged);
    // Pre-select only the newly suggested tags (not existing ones).
    setSelected(new Set(result.tags));
  });

  useEffect(() => {
    if (open) void load();
  }, [open]);

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function apply() {
    if (!binding) return;
    const merged = [...new Set([...existingTags, ...suggestions.filter((s) => selected.has(s))])];
    const result = binding.patch({ tags: merged });
    if (result.ok) {
      setOpen(false);
      return;
    }
    toast.error(t`Couldn't write tags to frontmatter.`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t`Suggest tags`}
          disabled={disabled}
          data-testid="suggest-tags-button"
        >
          <Sparkles aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-3"
        data-testid="suggest-tags-popover"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2">
          <div className="text-sm font-medium">
            <Trans>Suggested tags</Trans>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              <Trans>Asking the model...</Trans>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive" data-testid="suggest-tags-error">
              {error}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5" data-testid="suggest-tags-list">
              {suggestions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  <Trans>No suggestions.</Trans>
                </p>
              ) : null}
              {suggestions.map((tag) => {
                const isExisting = existingTags.includes(tag);
                const isSelected = selected.has(tag);
                return (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => toggle(tag)}
                    data-testid={`suggest-tags-pill-${tag}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {isExisting ? '✓ ' : ''}
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <p className="text-muted-foreground text-xs">
              <Trans>Merged with existing tags on apply.</Trans>
            </p>
            <Button
              size="sm"
              onClick={apply}
              disabled={loading || !!error || suggestions.length === 0}
              data-testid="suggest-tags-apply"
            >
              <Trans>Apply</Trans>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
