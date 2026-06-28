import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type AiProviderId,
  bindFrontmatterDoc,
  type FrontmatterBinding,
  type FrontmatterSnapshot,
  type FrontmatterValue,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { pickDefaultProvider, useAiStatus } from '@/hooks/use-ai-status';
import { httpAiKeyTransport } from '@/lib/transports/ai-key-transport';
import { cn } from '@/lib/utils';

interface SuggestMetadataPanelProps {
  provider: HocuspocusProvider;
  onBack: () => void;
  onApplied: () => void;
}

function stripHash(v: string): string {
  return v.startsWith('#') ? v.slice(1) : v;
}

function readScalar(snapshot: FrontmatterSnapshot | null, key: string): string {
  const value = snapshot?.map[key];
  return typeof value === 'string' ? value.trim() : '';
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

export function SuggestMetadataPanel({ provider, onBack, onApplied }: SuggestMetadataPanelProps) {
  const { t } = useLingui();
  const [binding, setBinding] = useState<FrontmatterBinding | null>(null);
  const [snapshot, setSnapshot] = useState<FrontmatterSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Title/description are single-valued strings — track an editable draft and
  // an opt-in "replace" toggle (defaults off when the field already has a value).
  const [titleValue, setTitleValue] = useState('');
  const [applyTitle, setApplyTitle] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [applyDescription, setApplyDescription] = useState(false);
  const { status } = useAiStatus();

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
  const existingTitle = readScalar(snapshot, 'title');
  const existingDescription = readScalar(snapshot, 'description');

  const load = useEffectEvent(async () => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSelected(new Set());
    const body = docBodyMarkdown(provider);
    const provider2: AiProviderId | undefined = pickDefaultProvider(status) ?? undefined;
    const result = await httpAiKeyTransport().suggestMetadata({
      provider: provider2,
      docMarkdown: body,
      existingTitle,
      existingDescription,
      existingTags,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? t`Couldn't get suggestions — try again.`);
      return;
    }
    // Tags: bias toward the existing vocabulary, pre-select only the new ones.
    const merged = [...new Set([...result.tags, ...existingTags])].slice(0, 12);
    setSuggestions(merged);
    setSelected(new Set(result.tags));
    // Title/description: seed the draft, default the replace toggle on only when
    // the field is currently empty (never silently clobber existing prose).
    const nextTitle = result.title ?? existingTitle;
    setTitleValue(nextTitle);
    setApplyTitle(existingTitle === '' && result.title !== null && result.title !== '');
    const nextDescription = result.description ?? existingDescription;
    setDescriptionValue(nextDescription);
    setApplyDescription(
      existingDescription === '' && result.description !== null && result.description !== '',
    );
  });

  useEffect(() => {
    void load();
  }, []);

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
    const patch: Record<string, FrontmatterValue | null> = {};
    const mergedTags = [
      ...new Set([...existingTags, ...suggestions.filter((s) => selected.has(s))]),
    ];
    patch.tags = mergedTags;
    if (applyTitle && titleValue.trim() !== '') patch.title = titleValue.trim();
    if (applyDescription && descriptionValue.trim() !== '')
      patch.description = descriptionValue.trim();
    const result = binding.patch(patch);
    if (result.ok) {
      onApplied();
      return;
    }
    toast.error(t`Couldn't write metadata to frontmatter.`);
  }

  const nothingToApply =
    !applyTitle &&
    !applyDescription &&
    suggestions.filter((s) => selected.has(s)).length === 0 &&
    existingTags.length === 0;

  return (
    <div className="space-y-3" data-testid="suggest-metadata-popover">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            onClick={onBack}
            aria-label={t`Back`}
            data-testid="suggest-metadata-back"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="text-sm font-medium">
            <Trans>Suggested metadata</Trans>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-muted-foreground"
          onClick={() => void load()}
          disabled={loading}
          data-testid="suggest-metadata-regenerate"
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
        <p className="text-sm text-destructive" data-testid="suggest-metadata-error">
          {error}
        </p>
      ) : (
        <div className="space-y-3">
          {/* Title */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Checkbox
                checked={applyTitle}
                onCheckedChange={(v) => setApplyTitle(v === true)}
                aria-label={t`Replace title`}
                data-testid="suggest-metadata-title-toggle"
                className="size-3.5"
              />
              <Trans>Replace title</Trans>
              {existingTitle === '' ? (
                <span className="font-normal text-muted-foreground">
                  <Trans>(currently empty)</Trans>
                </span>
              ) : null}
            </div>
            <Input
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              disabled={!applyTitle}
              placeholder={t`No title suggestion`}
              data-testid="suggest-metadata-title-input"
              className="h-8 text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Checkbox
                checked={applyDescription}
                onCheckedChange={(v) => setApplyDescription(v === true)}
                aria-label={t`Replace description`}
                data-testid="suggest-metadata-description-toggle"
                className="size-3.5"
              />
              <Trans>Replace description</Trans>
              {existingDescription === '' ? (
                <span className="font-normal text-muted-foreground">
                  <Trans>(currently empty)</Trans>
                </span>
              ) : null}
            </div>
            <Textarea
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              disabled={!applyDescription}
              rows={3}
              placeholder={t`No description suggestion`}
              data-testid="suggest-metadata-description-input"
              className="text-sm"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1">
            <div className="text-xs font-medium">
              <Trans>Tags</Trans>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="suggest-metadata-tags-list">
              {suggestions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  <Trans>No tag suggestions.</Trans>
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
                    data-testid={`suggest-metadata-pill-${tag}`}
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
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <p className="text-muted-foreground text-xs">
          <Trans>Tags merge; title and description replace.</Trans>
        </p>
        <Button
          size="sm"
          onClick={apply}
          disabled={loading || !!error || nothingToApply}
          data-testid="suggest-metadata-apply"
        >
          <Trans>Apply</Trans>
        </Button>
      </div>
    </div>
  );
}
