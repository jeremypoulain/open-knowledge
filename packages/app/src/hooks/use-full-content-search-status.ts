import { useEffect, useState } from 'react';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';

export interface FullContentSearchStatus {
  enabled: boolean;
  installed: boolean;
  ready: boolean;
  indexing: boolean;
  dirty: boolean;
  docCount: number | null;
  lastIndexedAt: number | null;
}

const INDEXING_POLL_MS = 1500;

async function fetchFullContentStatus(): Promise<FullContentSearchStatus | null> {
  try {
    const res = await fetch('/api/search/full/status');
    if (!res.ok) return null;
    return (await res.json()) as FullContentSearchStatus;
  } catch {
    return null;
  }
}

interface UseFullContentSearchStatusResult {
  status: FullContentSearchStatus | null;
  loaded: boolean;
  reachable: boolean;
  refresh: () => void;
  /** Kick off a rebuild; resolves to whether the server started/coalesced one. */
  triggerReindex: () => Promise<boolean>;
}

export function useFullContentSearchStatus(
  options: { enabled?: boolean } = {},
): UseFullContentSearchStatusResult {
  const enabled = options.enabled ?? true;
  const [status, setStatus] = useState<FullContentSearchStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reachable, setReachable] = useState(true);

  function refresh() {
    if (!enabled) return;
    void fetchFullContentStatus().then((next) => {
      setLoaded(true);
      setReachable(next !== null);
      if (next) setStatus(next);
    });
  }

  async function triggerReindex(): Promise<boolean> {
    try {
      const res = await fetch('/api/search/full/reindex', { method: 'POST' });
      if (!res.ok) return false;
      const body = (await res.json()) as { started?: boolean; busy?: boolean };
      refresh();
      return body.started === true || body.busy === true;
    } catch {
      return false;
    }
  }

  const indexing = status?.indexing ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is stable in component scope; re-run only when `enabled` flips on.
  useEffect(() => {
    refresh();
  }, [enabled]);

  // While a rebuild runs, poll until it settles.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is stable in component scope.
  useEffect(() => {
    if (!enabled || !indexing) return;
    const id = window.setInterval(refresh, INDEXING_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, indexing]);

  // Files changing on disk can make the index dirty.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is stable in component scope.
  useEffect(() => {
    if (!enabled) return;
    return subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files')) refresh();
    });
  }, [enabled]);

  return { status, loaded, reachable, refresh, triggerReindex };
}
