import type { AiProviderId, AiTransformAction } from '@inkeep/open-knowledge-core';

export interface AiProviderStatus {
  present: boolean;
  hint: string | null;
  source: 'file' | 'env' | null;
  model: string | null;
  baseUrl: string | null;
}

export interface AiStatus {
  defaultProvider: AiProviderId | null;
  providers: Record<string, AiProviderStatus>;
}

export type AiKeyResult = { ok: true } | { ok: false; error?: string };
export type AiModelListResult = { ok: true; models: string[] } | { ok: false; error?: string };

export interface TransformStreamHandlers {
  onDelta: (text: string) => void;
  onComplete: () => void;
  onError: (message: string) => void;
}

export interface AiKeyTransport {
  setKey(provider: AiProviderId, key: string): Promise<AiKeyResult>;
  clearKey(provider: AiProviderId): Promise<AiKeyResult>;
  listModels(provider: AiProviderId): Promise<AiModelListResult>;
  getStatus(): Promise<AiStatus | null>;
  /** Streams a transform request; resolves when the stream ends (complete or
   *  error — handlers receive incremental updates). */
  streamTransform(
    body: {
      provider?: AiProviderId;
      model?: string;
      action: AiTransformAction;
      instruction?: string;
      selection: string;
      docContext?: string;
    },
    handlers: TransformStreamHandlers,
  ): Promise<void>;
  suggestTags(body: {
    provider?: AiProviderId;
    model?: string;
    docMarkdown: string;
    existingTags?: string[];
  }): Promise<{ ok: true; tags: string[] } | { ok: false; error?: string }>;
}

async function extractProblemTitle(res: Response): Promise<string | undefined> {
  try {
    const result = (await res.json()) as { title?: string; detail?: string };
    return result.title ?? result.detail;
  } catch {
    return undefined;
  }
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function httpAiKeyTransport(): AiKeyTransport {
  return {
    async setKey(provider, key) {
      try {
        const res = await postJson('/api/local-op/ai/keys/set', { provider, key });
        return res.ok ? { ok: true } : { ok: false, error: await extractProblemTitle(res) };
      } catch {
        return { ok: false };
      }
    },
    async clearKey(provider) {
      try {
        const res = await postJson('/api/local-op/ai/keys/clear', { provider });
        return res.ok ? { ok: true } : { ok: false, error: await extractProblemTitle(res) };
      } catch {
        return { ok: false };
      }
    },
    async listModels(provider) {
      try {
        const res = await postJson('/api/local-op/ai/models', { provider });
        if (!res.ok) return { ok: false, error: await extractProblemTitle(res) };
        const data = (await res.json()) as { models?: string[] };
        return { ok: true, models: Array.isArray(data.models) ? data.models : [] };
      } catch {
        return { ok: false };
      }
    },
    async getStatus() {
      try {
        const res = await fetch('/api/local-op/ai/status');
        if (!res.ok) return null;
        return (await res.json()) as AiStatus;
      } catch {
        return null;
      }
    },
    async streamTransform(body, handlers) {
      let res: Response;
      try {
        res = await postJson('/api/local-op/ai/transform', body);
      } catch {
        handlers.onError('Could not reach the local server.');
        return;
      }
      if (!res.ok || !res.body) {
        handlers.onError((await extractProblemTitle(res)) ?? 'The AI request failed.');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let settled = false;
      const processLine = (line: string): void => {
        if (line.trim() === '' || settled) return;
        let evt: { type?: string; text?: string; message?: string };
        try {
          evt = JSON.parse(line);
        } catch {
          return;
        }
        if (evt.type === 'delta' && typeof evt.text === 'string') {
          handlers.onDelta(evt.text);
        } else if (evt.type === 'complete') {
          settled = true;
          handlers.onComplete();
        } else if (evt.type === 'error') {
          settled = true;
          handlers.onError(evt.message ?? 'The AI request failed.');
        }
      };
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            processLine(line);
            if (settled) return;
          }
        }
        // Flush any trailing line the server wrote without a final newline.
        if (!settled) processLine(buffer);
        // Stream ended without an explicit complete/error event.
        if (!settled) handlers.onComplete();
      } catch {
        handlers.onError('The connection to the AI provider was interrupted.');
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    },
    async suggestTags(body) {
      try {
        const res = await postJson('/api/local-op/ai/suggest-tags', body);
        if (!res.ok) {
          return { ok: false, error: (await extractProblemTitle(res)) ?? 'The AI request failed.' };
        }
        const data = (await res.json()) as { tags?: string[] };
        return { ok: true, tags: Array.isArray(data.tags) ? data.tags : [] };
      } catch {
        return { ok: false };
      }
    },
  };
}
