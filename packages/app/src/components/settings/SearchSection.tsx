import { humanFormat } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useFullContentSearchStatus } from '@/hooks/use-full-content-search-status';
import { useSemanticSearchStatus } from '@/hooks/use-semantic-search-status';
import { useConfigContext } from '@/lib/config-provider';

const SETTLE_REFRESH_DELAYS_MS = [2500, 5000] as const;

export function SearchSection() {
  const { t } = useLingui();
  const { projectLocalConfig, projectLocalSynced, projectLocalBinding } = useConfigContext();
  const { status, refresh } = useSemanticSearchStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const settleTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(
    () => () => {
      for (const timer of settleTimersRef.current) clearTimeout(timer);
    },
    [],
  );

  const enabled = projectLocalConfig?.search?.semantic?.enabled ?? false;
  const bindingReady = projectLocalSynced && projectLocalBinding !== null;

  function scheduleSettleRefresh() {
    for (const timer of settleTimersRef.current) clearTimeout(timer);
    settleTimersRef.current = SETTLE_REFRESH_DELAYS_MS.map((delay) => setTimeout(refresh, delay));
  }

  function write(next: boolean): boolean {
    if (projectLocalBinding === null) {
      toast.error(t`Search settings not yet loaded — try again in a moment`);
      return false;
    }
    const result = projectLocalBinding.patch({ search: { semantic: { enabled: next } } });
    if (!result.ok) {
      const detail = humanFormat(result.error);
      toast.error(
        next
          ? t`Failed to enable semantic search — ${detail}`
          : t`Failed to disable semantic search — ${detail}`,
      );
      return false;
    }
    refresh();
    scheduleSettleRefresh();
    return true;
  }

  function onToggleRequest(next: boolean) {
    if (next) {
      setConfirmOpen(true);
      return;
    }
    write(false);
  }

  function onConfirm() {
    if (write(true)) setConfirmOpen(false);
  }

  const serverEnabled = status?.enabled ?? false;
  const keyPresent = status?.keyPresent ?? false;
  const ready = status?.ready ?? false;
  const capable = status?.capable ?? false;
  const embedded = status?.embedded ?? 0;
  const total = status?.total ?? 0;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="settings-search-title"
        className="space-y-3"
        data-testid="settings-search"
      >
        <div className="space-y-1">
          <h3 id="settings-search-title" className="text-base font-semibold">
            <Trans>Semantic search</Trans>
          </h3>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Add meaning-based ranking to search so conceptually-related pages surface even when
              they share no keywords. This setting applies only to this computer.
            </Trans>
          </p>
        </div>

        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="settings-search-semantic-toggle" className="text-sm font-medium">
                <Trans>Semantic search</Trans>
              </label>
              <p className="text-muted-foreground text-1sm" data-testid="settings-search-body">
                {enabled ? (
                  <Trans>
                    On — your search queries and the text of matching pages are sent to your
                    embeddings provider (OpenAI by default) to compute embeddings.
                  </Trans>
                ) : (
                  <Trans>
                    Off — search ranks by keyword only. No content leaves this computer.
                  </Trans>
                )}
              </p>
            </div>
            <Switch
              id="settings-search-semantic-toggle"
              checked={enabled}
              disabled={!bindingReady}
              onCheckedChange={onToggleRequest}
              aria-label={enabled ? t`Disable semantic search` : t`Enable semantic search`}
              data-testid="settings-search-semantic-toggle"
            />
          </div>

          {enabled ? (
            <SemanticStatusPanel
              loaded={status !== null}
              serverEnabled={serverEnabled}
              keyPresent={keyPresent}
              ready={ready}
              capable={capable}
              embedded={embedded}
              total={total}
            />
          ) : null}
        </div>

        <EnableSemanticSearchConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={onConfirm}
        />
      </section>

      <FullContentSearchSection />
    </div>
  );
}

function FullContentSearchSection() {
  const { t } = useLingui();
  const { projectLocalConfig, projectLocalSynced, projectLocalBinding } = useConfigContext();
  const configEnabled = projectLocalConfig?.search?.fullContent?.enabled ?? false;
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const settleTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const enabled = optimisticEnabled ?? configEnabled;
  const bindingReady = projectLocalSynced && projectLocalBinding !== null;
  const { status, loaded, reachable, refresh, triggerReindex } = useFullContentSearchStatus();

  useEffect(() => {
    setOptimisticEnabled((current) => (current === configEnabled ? null : current));
  }, [configEnabled]);

  useEffect(
    () => () => {
      for (const timer of settleTimersRef.current) clearTimeout(timer);
    },
    [],
  );

  function scheduleSettleRefresh() {
    for (const timer of settleTimersRef.current) clearTimeout(timer);
    settleTimersRef.current = SETTLE_REFRESH_DELAYS_MS.map((delay) => setTimeout(refresh, delay));
  }

  function write(next: boolean) {
    if (projectLocalBinding === null) {
      toast.error(t`Search settings not yet loaded — try again in a moment`);
      return;
    }
    const result = projectLocalBinding.patch({ search: { fullContent: { enabled: next } } });
    if (!result.ok) {
      toast.error(
        next
          ? t`Failed to enable full content search — ${humanFormat(result.error)}`
          : t`Failed to disable full content search — ${humanFormat(result.error)}`,
      );
      return;
    }
    setOptimisticEnabled(next);
    refresh();
    scheduleSettleRefresh();
  }

  async function onRebuild() {
    const started = await triggerReindex();
    if (started) toast.success(t`Rebuilding the full content index`);
    else toast.error(t`Couldn't start the rebuild — is the bm25-turbo CLI installed?`);
  }

  return (
    <section
      aria-labelledby="settings-fullsearch-title"
      className="space-y-3"
      data-testid="settings-fullsearch"
    >
      <div className="space-y-1">
        <h3 id="settings-fullsearch-title" className="text-base font-semibold">
          <Trans>Full content search</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Search inside every file in this workspace — text, code, PDF, Word, Excel, and
            PowerPoint — using a local BM25 index. CPU-only; nothing leaves this computer. This
            setting applies only to this computer.
          </Trans>
        </p>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor="settings-fullsearch-toggle" className="text-sm font-medium">
              <Trans>Index all file contents</Trans>
            </label>
            <p className="text-muted-foreground text-1sm" data-testid="settings-fullsearch-body">
              {enabled ? (
                <Trans>
                  On — an "All files" mode appears in search. Requires the{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">bm25-turbo</code>{' '}
                  CLI on your PATH.
                </Trans>
              ) : (
                <Trans>Off — search covers page names and markdown bodies only.</Trans>
              )}
            </p>
          </div>
          <Switch
            id="settings-fullsearch-toggle"
            checked={enabled}
            disabled={!bindingReady}
            onCheckedChange={write}
            aria-label={enabled ? t`Disable full content search` : t`Enable full content search`}
            data-testid="settings-fullsearch-toggle"
          />
        </div>

        {enabled ? (
          <FullContentStatusPanel
            status={status}
            loaded={loaded}
            reachable={reachable}
            pendingServerEnable={enabled && status?.enabled === false}
            onRebuild={onRebuild}
          />
        ) : null}
      </div>
    </section>
  );
}

interface FullContentStatusPanelProps {
  status: ReturnType<typeof useFullContentSearchStatus>['status'];
  loaded: boolean;
  reachable: boolean;
  pendingServerEnable: boolean;
  onRebuild: () => void;
}

function FullContentStatusPanel({
  status,
  loaded,
  reachable,
  pendingServerEnable,
  onRebuild,
}: FullContentStatusPanelProps) {
  const { t } = useLingui();

  if (pendingServerEnable || !loaded) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground text-1sm mt-3 inline-flex items-center gap-2"
        data-testid="settings-fullsearch-settling"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        <Trans>Applying your change</Trans>
      </p>
    );
  }

  if (!reachable || status === null) {
    return (
      <div
        role="alert"
        className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-1sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        data-testid="settings-fullsearch-unreachable"
      >
        <Trans>
          OpenKnowledge couldn't reach the local search server, so full-content index status is
          unavailable right now. If this keeps happening, restart the app and try again.
        </Trans>
      </div>
    );
  }

  if (status && !status.installed) {
    return (
      <div
        role="alert"
        className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-1sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        data-testid="settings-fullsearch-not-installed"
      >
        <Trans>
          The{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-900">
            bm25-turbo
          </code>{' '}
          CLI wasn't found on your PATH. Install it with{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-900">
            cargo install --locked bm25-turbo-cli
          </code>{' '}
          (the <code className="font-mono text-xs">--locked</code> flag is required — see the note
          below), then rebuild the index.
        </Trans>
      </div>
    );
  }

  const indexing = status?.indexing ?? false;
  const ready = status?.ready ?? false;
  const dirty = status?.dirty ?? false;
  const docCount = status?.docCount ?? null;
  const lastIndexedAt = status?.lastIndexedAt ?? null;
  const lastIndexedLabel = lastIndexedAt ? new Date(lastIndexedAt).toLocaleString() : null;

  return (
    <div className="mt-3 space-y-3" data-testid="settings-fullsearch-status">
      <div className="rounded-md bg-muted/40 px-3 py-2">
        <dl className="grid gap-x-4 gap-y-1 text-1sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">
            <Trans>CLI status</Trans>
          </dt>
          <dd data-testid="settings-fullsearch-cli-status">
            <Trans>
              Installed on PATH as{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">bm25-turbo</code>.
            </Trans>
          </dd>

          <dt className="text-muted-foreground">
            <Trans>Index status</Trans>
          </dt>
          <dd
            role="status"
            aria-live="polite"
            data-testid="settings-fullsearch-index-status"
            className={dirty ? 'text-amber-700 dark:text-amber-400' : undefined}
          >
            {indexing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <Trans>Indexing all file contents now.</Trans>
              </span>
            ) : !ready ? (
              <Trans>Not indexed yet — rebuild to enable "All files" search.</Trans>
            ) : dirty ? (
              <Trans>Index out of date — files have changed since the last build.</Trans>
            ) : (
              <Trans>Ready.</Trans>
            )}
          </dd>

          <dt className="text-muted-foreground">
            <Trans>Indexed segments</Trans>
          </dt>
          <dd data-testid="settings-fullsearch-doc-count">
            {docCount === null ? <Trans>Unknown until the first build.</Trans> : docCount}
          </dd>

          <dt className="text-muted-foreground">
            <Trans>Last indexed</Trans>
          </dt>
          <dd data-testid="settings-fullsearch-last-indexed">
            {lastIndexedLabel ?? t`Not yet indexed`}
          </dd>
        </dl>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onRebuild}
          disabled={indexing}
          data-testid="settings-fullsearch-rebuild"
          aria-label={t`Rebuild full content index`}
        >
          {indexing ? <Trans>Rebuilding</Trans> : <Trans>Rebuild index</Trans>}
        </Button>
      </div>
    </div>
  );
}

interface SemanticStatusPanelProps {
  loaded: boolean;
  serverEnabled: boolean;
  keyPresent: boolean;
  ready: boolean;
  capable: boolean;
  embedded: number;
  total: number;
}

function SemanticStatusPanel({
  loaded,
  serverEnabled,
  keyPresent,
  ready,
  capable,
  embedded,
  total,
}: SemanticStatusPanelProps) {
  if (!loaded || !serverEnabled) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground text-1sm mt-2"
        data-testid="settings-search-settling"
      >
        <Trans>Applying your change</Trans>
      </p>
    );
  }

  if (!keyPresent) {
    return (
      <div
        role="alert"
        className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-1sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        data-testid="settings-search-needs-key"
      >
        <Trans>
          Semantic search is on, but no API key is set — search falls back to keyword matching. Add
          one in <span className="font-medium">Settings → Account</span> (it's stored once for your
          whole machine).
        </Trans>
      </div>
    );
  }

  if (ready && !capable) {
    return (
      <div
        role="alert"
        className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-1sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        data-testid="settings-search-provider-error"
      >
        <Trans>
          A key is set, but the embeddings provider rejected it or was unreachable — search fell
          back to keyword matching. Check the key in{' '}
          <span className="font-medium">Settings → Account</span> and your provider settings.
        </Trans>
      </div>
    );
  }

  if (!ready) {
    return (
      <p
        role="status"
        className="text-muted-foreground text-1sm mt-2"
        data-testid="settings-search-pending"
      >
        <Trans>Semantic ranking activates the first time an agent runs a search.</Trans>
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-0.5" data-testid="settings-search-coverage">
      <p className="text-muted-foreground text-1sm">
        <Trans>
          Indexed {embedded} of {total} pages.
        </Trans>
      </p>
      {embedded === 0 ? (
        <p className="text-muted-foreground text-1sm">
          <Trans>Pages are embedded the first time a search needs them.</Trans>
        </p>
      ) : null}
    </div>
  );
}

interface EnableSemanticSearchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

function EnableSemanticSearchConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: EnableSemanticSearchConfirmDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="settings-search-confirm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Turn on semantic search?</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Semantic search adds meaning-based ranking to the search tool so conceptually-related
              pages surface even without shared keywords.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          >
            <p className="mb-2 font-medium">
              <Trans>This sends content off your machine</Trans>
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <Trans>
                  Your search queries and the full text of matching pages are sent to your
                  embeddings provider (OpenAI by default) to compute embeddings.
                </Trans>
              </li>
              <li>
                <Trans>
                  Embeddings are computed only when a search runs and are cached locally under{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-900">
                    .ok/local
                  </code>
                  .
                </Trans>
              </li>
              <li>
                <Trans>
                  This setting is per-machine and isn't shared with collaborators. It needs an API
                  key set with{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-900">
                    ok embeddings set-key
                  </code>
                  .
                </Trans>
              </li>
            </ul>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          </DialogClose>
          <Button onClick={onConfirm} data-testid="settings-search-confirm-enable">
            <Trans>Turn on</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
