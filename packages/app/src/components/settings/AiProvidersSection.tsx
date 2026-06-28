import {
  AI_VISIBLE_PROVIDERS,
  type AiProviderId,
  type Config,
  type ConfigBinding,
  getAiProvider,
} from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronDown, Minus } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import type { FieldPath, UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAiStatus } from '@/hooks/use-ai-status';
import { type AiKeyTransport, httpAiKeyTransport } from '@/lib/transports/ai-key-transport';
import { cn } from '@/lib/utils';
import { useConfigForm } from './use-config-form';

interface AiProvidersSectionProps {
  binding: ConfigBinding;
  transport?: AiKeyTransport;
}

const NO_DEFAULT_PROVIDER_VALUE = '__none__';

function uniqueModelSuggestions(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = value.trim();
    if (next === '' || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function visibleProviderAlias(provider: AiProviderId | null | undefined): AiProviderId | null {
  if (provider === 'ollama') return 'ollama-local';
  if (provider === 'opencode') return 'opencode-zen';
  return provider ?? null;
}

export function AiProvidersSection({ binding, transport }: AiProvidersSectionProps) {
  const { t } = useLingui();
  const resolvedTransport = transport ?? httpAiKeyTransport();
  const { status, refresh } = useAiStatus({ transport: resolvedTransport });
  const { form, commitFieldValue } = useConfigForm(binding);

  const defaultProvider = form.watch('ai.defaultProvider' as FieldPath<Config>) as
    | AiProviderId
    | undefined
    | null;
  const visibleDefaultProvider = visibleProviderAlias(defaultProvider);

  return (
    <section aria-labelledby="settings-ai-title" className="space-y-5" data-testid="settings-ai">
      <div className="space-y-1">
        <h3 id="settings-ai-title" className="text-base font-semibold">
          <Trans>AI</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Connect a model provider to transform selected text and auto-suggest tags in-app. API
            keys are stored on this machine in{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              ~/.ok/secrets.yml
            </code>{' '}
            (readable only by your user account) and shared across all projects. They never leave
            your machine except to call the provider you choose.
          </Trans>
        </p>
      </div>

      <div className="space-y-3 rounded-md border p-3" data-testid="settings-ai-default">
        <div className="space-y-1.5">
          <label htmlFor="settings-ai-default-provider" className="text-sm font-medium">
            <Trans>Default provider</Trans>
          </label>
          <p className="text-muted-foreground text-1sm">
            <Trans>Used by the in-app text actions when no provider is specified.</Trans>
          </p>
        </div>
        <Select
          value={visibleDefaultProvider ?? NO_DEFAULT_PROVIDER_VALUE}
          onValueChange={(v) => {
            const nextValue = v === NO_DEFAULT_PROVIDER_VALUE ? null : (v as AiProviderId);
            form.setValue('ai.defaultProvider' as FieldPath<Config>, nextValue as never, {
              shouldDirty: true,
            });
            commitFieldValue('ai.defaultProvider' as FieldPath<Config>, nextValue);
          }}
        >
          <SelectTrigger id="settings-ai-default-provider" size="sm" className="w-64">
            <SelectValue placeholder={t`None`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_DEFAULT_PROVIDER_VALUE}>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Minus className="size-3.5" aria-hidden="true" />
                <Trans>None</Trans>
              </span>
            </SelectItem>
            {AI_VISIBLE_PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {AI_VISIBLE_PROVIDERS.map((def) => (
          <ProviderCard
            key={def.id}
            provider={def.id}
            status={status}
            transport={resolvedTransport}
            onChanged={refresh}
            form={form}
            commitFieldValue={commitFieldValue}
          />
        ))}
      </div>
    </section>
  );
}

interface ProviderCardProps {
  provider: AiProviderId;
  status: ReturnType<typeof useAiStatus>['status'];
  transport: AiKeyTransport;
  onChanged: () => void;
  form: UseFormReturn<Config>;
  commitFieldValue: (name: FieldPath<Config>, value: unknown) => boolean;
}

function ProviderCard({
  provider,
  status,
  transport,
  onChanged,
  form,
  commitFieldValue,
}: ProviderCardProps) {
  const { t } = useLingui();
  const def = getAiProvider(provider);
  const desc = status?.providers[provider];
  const present = desc?.present ?? false;
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const modelPath = `ai.providers.${provider}.model` as FieldPath<Config>;
  const baseUrlPath = `ai.providers.${provider}.baseUrl` as FieldPath<Config>;
  const modelValue = (form.watch(modelPath) as string | undefined) ?? def.defaultModel;
  const baseUrlValue = (form.watch(baseUrlPath) as string | undefined) ?? def.defaultBaseUrl;
  const modelListId = `settings-ai-${provider}-model-options`;
  const canLoadModels = !def.keyRequired || present;
  const modelSuggestions = uniqueModelSuggestions([
    modelValue,
    def.defaultModel,
    ...(availableModels ?? []),
  ]);

  const refreshModelList = useEffectEvent(async () => {
    if (!canLoadModels || modelsLoading) return;
    setModelsLoading(true);
    setModelsError(null);
    const result = await transport.listModels(provider);
    setModelsLoading(false);
    if (result.ok) {
      setAvailableModels(result.models);
      return;
    }
    setAvailableModels([]);
    setModelsError(result.error ?? t`Couldn't load the available models.`);
  });

  useEffect(() => {
    if (!open || !canLoadModels || availableModels !== null || modelsLoading) return;
    void refreshModelList();
  }, [availableModels, canLoadModels, modelsLoading, open]);

  async function onSave() {
    const key = keyInput.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    const result = await transport.setKey(provider, key);
    setBusy(false);
    if (result.ok) {
      setKeyInput('');
      setAvailableModels(null);
      setModelsError(null);
      onChanged();
      if (open) void refreshModelList();
    } else {
      setError(result.error ?? t`Couldn't save the key — please try again.`);
    }
  }

  async function onClear() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await transport.clearKey(provider);
    setBusy(false);
    if (result.ok) {
      setAvailableModels(null);
      setModelsError(null);
      onChanged();
    } else {
      setError(result.error ?? t`Couldn't clear the key — please try again.`);
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border"
      data-testid={`settings-ai-provider-${provider}`}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                present ? 'bg-emerald-500' : 'bg-muted-foreground/30',
              )}
              aria-hidden="true"
            />
            <span className="sr-only">{present ? t`Configured` : t`Not configured`}</span>
            <span className="text-sm font-medium truncate">{def.label}</span>
            <span
              className="max-w-52 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              title={modelValue}
              data-testid={`settings-ai-${provider}-model-chip`}
            >
              {modelValue}
            </span>
            {def.keyRequired && desc?.source === 'env' ? (
              <span className="text-muted-foreground text-xs">
                <Trans>via env</Trans>
              </span>
            ) : null}
            {present && desc?.hint ? (
              <span
                className="truncate font-mono text-muted-foreground text-xs"
                title={t`Key ending in ${desc.hint}`}
              >
                <span aria-hidden="true">••••</span>
                {desc.hint}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3 space-y-3">
        {def.keyRequired ? (
          desc?.source === 'env' ? (
            <p className="text-muted-foreground text-1sm">
              <Trans>
                Using an environment variable (managed outside OpenKnowledge). Clear it in your
                shell to manage the key here.
              </Trans>
            </p>
          ) : (
            <div className="space-y-1.5">
              {present ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    <Trans>API key set</Trans>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onClear()}
                    disabled={busy}
                    data-testid={`settings-ai-${provider}-clear`}
                  >
                    <Trans>Clear</Trans>
                  </Button>
                </div>
              ) : null}
              <label htmlFor={`settings-ai-${provider}-key`} className="block text-sm font-medium">
                {present ? <Trans>Replace key</Trans> : <Trans>Add key</Trans>}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={`settings-ai-${provider}-key`}
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={t`Paste your API key`}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  data-testid={`settings-ai-${provider}-input`}
                  className="h-8 font-mono text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => void onSave()}
                  disabled={busy || keyInput.trim().length === 0}
                  data-testid={`settings-ai-${provider}-save`}
                >
                  {busy ? <Trans>Saving</Trans> : <Trans>Save</Trans>}
                </Button>
              </div>
            </div>
          )
        ) : (
          <p className="text-muted-foreground text-1sm">
            <Trans>
              Runs locally — no API key required. Set the base URL below to point at your Ollama
              host if it isn't on the default port.
            </Trans>
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor={`settings-ai-${provider}-model`} className="block text-sm font-medium">
            <Trans>Model</Trans>
          </label>
          <div className="flex items-start justify-between gap-3">
            <p className="text-muted-foreground text-1sm">
              <Trans>
                Default:{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {def.defaultModel}
                </code>
                . Choose from the provider's available models or enter a custom model ID.
              </Trans>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshModelList()}
              disabled={!canLoadModels || modelsLoading}
              data-testid={`settings-ai-${provider}-models-refresh`}
            >
              {modelsLoading ? <Trans>Loading</Trans> : <Trans>Refresh list</Trans>}
            </Button>
          </div>
          <Input
            id={`settings-ai-${provider}-model`}
            list={modelSuggestions.length > 0 ? modelListId : undefined}
            value={modelValue}
            onChange={(e) =>
              form.setValue(modelPath, e.target.value as never, { shouldDirty: true })
            }
            onBlur={(e) => commitFieldValue(modelPath, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitFieldValue(modelPath, e.currentTarget.value);
              }
            }}
            placeholder={def.defaultModel}
            data-testid={`settings-ai-${provider}-model`}
            className="h-8 font-mono text-sm"
          />
          {modelSuggestions.length > 0 ? (
            <datalist id={modelListId}>
              {modelSuggestions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          ) : null}
          {!canLoadModels ? (
            <p className="text-muted-foreground text-1sm">
              <Trans>Save a valid API key first to load this provider's model list.</Trans>
            </p>
          ) : modelsError ? (
            <p
              className="text-muted-foreground text-1sm"
              data-testid={`settings-ai-${provider}-models-error`}
            >
              {modelsError}
            </p>
          ) : availableModels !== null ? (
            <p
              className="text-muted-foreground text-1sm"
              data-testid={`settings-ai-${provider}-models-count`}
            >
              <Trans>{availableModels.length} models available for this provider.</Trans>
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`settings-ai-${provider}-baseurl`} className="block text-sm font-medium">
            <Trans>Base URL</Trans>
          </label>
          <Input
            id={`settings-ai-${provider}-baseurl`}
            value={baseUrlValue}
            onChange={(e) =>
              form.setValue(baseUrlPath, e.target.value as never, { shouldDirty: true })
            }
            onBlur={(e) => {
              setAvailableModels(null);
              setModelsError(null);
              commitFieldValue(baseUrlPath, e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setAvailableModels(null);
                setModelsError(null);
                commitFieldValue(baseUrlPath, e.currentTarget.value);
              }
            }}
            placeholder={def.defaultBaseUrl}
            data-testid={`settings-ai-${provider}-baseurl`}
            className="h-8 font-mono text-sm"
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid={`settings-ai-${provider}-error`}
          >
            {error}
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
