import type { AiProviderId } from '@inkeep/open-knowledge-core';
import { useEffect, useEffectEvent, useState } from 'react';
import {
  type AiKeyTransport,
  type AiStatus,
  httpAiKeyTransport,
} from '@/lib/transports/ai-key-transport';

interface UseAiStatusResult {
  status: AiStatus | null;
  refresh: () => void;
}

/** Polls `/api/local-op/ai/status` for which providers have keys configured.
 *  Mirrors `useSemanticSearchStatus`. */
export function useAiStatus(
  options: { transport?: AiKeyTransport; enabled?: boolean } = {},
): UseAiStatusResult {
  const enabled = options.enabled ?? true;
  const transport = options.transport ?? httpAiKeyTransport();
  const [status, setStatus] = useState<AiStatus | null>(null);

  const refreshImpl = useEffectEvent(() => {
    if (!enabled) return;
    void transport.getStatus().then((next) => {
      if (next) setStatus(next);
    });
  });

  const refresh = () => {
    refreshImpl();
  };

  useEffect(() => {
    refreshImpl();
  }, []);

  return { status, refresh };
}

/** Convenience selector: which provider id should a transform/tag action use
 *  by default, accounting for which providers actually have a key. */
export function pickDefaultProvider(status: AiStatus | null): AiProviderId | null {
  if (!status) return null;
  const declared = status.defaultProvider;
  if (declared && status.providers[declared]?.present) return declared;
  if (declared === 'ollama-local' || declared === 'ollama') return declared;
  // Fall back to the first provider with a key present.
  for (const [id, desc] of Object.entries(status.providers)) {
    if (desc?.present) return id as AiProviderId;
  }
  if (status.providers['ollama-local']) return 'ollama-local';
  if (status.providers.ollama) return 'ollama';
  return declared;
}
