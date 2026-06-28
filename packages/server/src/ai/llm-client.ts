import {
  type AiProviderDefinition,
  type AiProviderId,
  ANTHROPIC_API_VERSION,
} from '@inkeep/open-knowledge-core';
import {
  type LlmErrorReason,
  type LlmProviderLabel,
  recordLlmCall,
  recordLlmProviderError,
  recordLlmRequestDuration,
} from './ai-telemetry.ts';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  provider: AiProviderDefinition;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  system: string;
  messages: ChatMessage[];
  /** Max output tokens. Defaults differ by adapter. */
  maxTokens?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface ListModelsRequest {
  provider: AiProviderDefinition;
  baseUrl: string;
  apiKey: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 500;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reasonForStatus(status: number): LlmErrorReason {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  return 'http_error';
}

function assertSafeBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`AI provider baseUrl is not a valid URL: ${baseUrl}`);
  }
  if (url.protocol === 'https:') return url;
  const host = url.hostname.toLowerCase();
  const isLoopback =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (url.protocol === 'http:' && isLoopback) return url;
  throw new Error(
    `refusing to send the AI API key to a non-HTTPS endpoint (${url.protocol}//${url.host}); ` +
      'use https:// (http:// is allowed only for localhost)',
  );
}

function uniqueNonEmpty(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = value.trim();
    if (next === '' || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Parses a Server-Sent-Events byte stream into {event, data} pairs. */
async function* parseSseStream(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal | undefined,
): AsyncGenerator<{ event: string | null; data: string }> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let nlIdx = buffer.indexOf('\n'); nlIdx !== -1; nlIdx = buffer.indexOf('\n')) {
        const rawLine = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const line = rawLine.replace(/\r$/, '');
        if (line === '' || line.startsWith(':')) continue; // comment / keepalive
        if (line.startsWith('event:')) {
          yield { event: line.slice(6).trim(), data: '' };
        } else if (line.startsWith('data:')) {
          yield { event: null, data: line.slice(5).trim() };
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

/** Parses a newline-delimited JSON byte stream. */
async function* parseJsonLineStream(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal | undefined,
): AsyncGenerator<string> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIdx = buffer.indexOf('\n');
      while (nlIdx !== -1) {
        const rawLine = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const line = rawLine.trim();
        if (line !== '') yield line;
        nlIdx = buffer.indexOf('\n');
      }
    }
    const tail = buffer.trim();
    if (tail !== '') yield tail;
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

/** Initiates a streaming request with bounded retry/backoff on 429/5xx, then
 *  returns the Response body once 200 + streaming has begun. */
async function openStreamingResponse(
  endpoint: string,
  headers: Record<string, string>,
  body: unknown,
  opts: {
    fetchImpl: typeof fetch;
    signal?: AbortSignal;
    timeoutMs: number;
    sleep: (ms: number) => Promise<void>;
    providerLabel: LlmProviderLabel;
  },
): Promise<Response> {
  const serialized = JSON.stringify(body);
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const startedAt = performance.now();
    try {
      const res = await opts.fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: serialized,
        signal: controller.signal,
      });
      recordLlmRequestDuration(opts.providerLabel, performance.now() - startedAt);
      if (res.ok && res.body) {
        return res;
      }
      const errText = await res.text().catch(() => '');
      const reason = reasonForStatus(res.status);
      recordLlmProviderError(reason);
      if (
        res.status === 401 ||
        res.status === 403 ||
        !RETRYABLE_STATUS.has(res.status) ||
        attempt >= MAX_RETRIES
      ) {
        throw new LlmHttpError(res.status, errText);
      }
      attempt += 1;
    } catch (err) {
      if (err instanceof LlmHttpError) throw err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      recordLlmProviderError(isAbort ? 'timeout' : 'network');
      if (attempt >= MAX_RETRIES) {
        throw new LlmRequestError(
          isAbort ? 'timed out contacting the AI provider' : 'could not reach the AI provider',
          err instanceof Error ? err : undefined,
        );
      }
      attempt += 1;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    const ceiling = BACKOFF_BASE_MS * 2 ** (attempt - 1);
    await opts.sleep(Math.round(ceiling / 2 + Math.random() * (ceiling / 2)));
  }
}

export class LlmHttpError extends Error {
  readonly name = 'LlmHttpError';
  constructor(
    readonly status: number,
    readonly bodyText: string,
  ) {
    super(`AI provider returned HTTP ${status}`);
  }
}

export class LlmRequestError extends Error {
  readonly name = 'LlmRequestError';
  constructor(message: string, cause?: Error) {
    super(message);
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

async function fetchJson(
  endpoint: string,
  headers: Record<string, string>,
  opts: {
    fetchImpl: typeof fetch;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await opts.fetchImpl(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new LlmHttpError(res.status, await res.text().catch(() => ''));
    }
    try {
      return await res.json();
    } catch (err) {
      throw new LlmRequestError(
        'the AI provider returned an unreadable models response',
        err instanceof Error ? err : undefined,
      );
    }
  } catch (err) {
    if (err instanceof LlmHttpError || err instanceof LlmRequestError) throw err;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new LlmRequestError(
      isAbort ? 'timed out contacting the AI provider' : 'could not reach the AI provider',
      err instanceof Error ? err : undefined,
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

function parseOpenAiCompatModels(payload: unknown): string[] {
  const data = (payload as { data?: Array<{ id?: unknown }> } | null)?.data;
  if (!Array.isArray(data)) return [];
  return uniqueNonEmpty(
    data.map((entry) => (typeof entry?.id === 'string' ? entry.id : '')).filter(Boolean),
  );
}

function parseAnthropicModels(payload: unknown): string[] {
  const data = (payload as { data?: Array<{ id?: unknown }> } | null)?.data;
  if (!Array.isArray(data)) return [];
  return uniqueNonEmpty(
    data.map((entry) => (typeof entry?.id === 'string' ? entry.id : '')).filter(Boolean),
  );
}

function parseOllamaModels(payload: unknown): string[] {
  const data = (payload as { models?: Array<{ name?: unknown; model?: unknown }> } | null)?.models;
  if (!Array.isArray(data)) return [];
  return uniqueNonEmpty(
    data
      .map((entry) => {
        if (typeof entry?.name === 'string') return entry.name;
        if (typeof entry?.model === 'string') return entry.model;
        return '';
      })
      .filter(Boolean),
  );
}

/** OpenAI-compatible Chat Completions streaming. Yields text deltas. */
async function* streamOpenAiCompatChat(
  req: ChatRequest,
  providerLabel: LlmProviderLabel,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AsyncGenerator<string> {
  const url = assertSafeBaseUrl(req.baseUrl);
  const endpoint = `${url.origin}${url.pathname.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (req.apiKey) headers.authorization = `Bearer ${req.apiKey}`;
  const payload = {
    model: req.model,
    messages: [{ role: 'system', content: req.system }, ...req.messages],
    stream: true,
    ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
  };
  const res = await openStreamingResponse(endpoint, headers, payload, {
    fetchImpl,
    signal,
    timeoutMs,
    sleep,
    providerLabel,
  });
  try {
    for await (const evt of parseSseStream(res.body, signal)) {
      if (evt.data === '[DONE]' || evt.data === '') continue;
      let parsed: { choices?: Array<{ delta?: { content?: string } }> };
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta !== '') yield delta;
    }
  } finally {
    try {
      await res.body?.cancel();
    } catch {}
  }
}

/** Anthropic Messages API streaming. Yields text deltas. */
async function* streamAnthropicMessages(
  req: ChatRequest,
  providerLabel: LlmProviderLabel,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AsyncGenerator<string> {
  const url = assertSafeBaseUrl(req.baseUrl);
  const endpoint = `${url.origin}${url.pathname.replace(/\/+$/, '')}/v1/messages`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_API_VERSION,
  };
  if (req.apiKey) headers['x-api-key'] = req.apiKey;
  const payload = {
    model: req.model,
    max_tokens: req.maxTokens ?? 2048,
    system: req.system,
    messages: req.messages,
    stream: true,
  };
  const res = await openStreamingResponse(endpoint, headers, payload, {
    fetchImpl,
    signal,
    timeoutMs,
    sleep,
    providerLabel,
  });
  let pendingEvent: string | null = null;
  try {
    for await (const evt of parseSseStream(res.body, signal)) {
      if (evt.event !== null) {
        pendingEvent = evt.event;
        continue;
      }
      if (evt.data === '') continue;
      const event = pendingEvent;
      let parsed: { type?: string; delta?: { type?: string; text?: string } };
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        continue;
      }
      if (
        event === 'content_block_delta' &&
        parsed.delta?.type === 'text_delta' &&
        typeof parsed.delta.text === 'string'
      ) {
        if (parsed.delta.text !== '') yield parsed.delta.text;
      }
      if (parsed.type === 'message_stop') return;
    }
  } finally {
    try {
      await res.body?.cancel();
    } catch {}
  }
}

/** Ollama Chat API streaming. Yields text deltas from NDJSON chunks. */
async function* streamOllamaChat(
  req: ChatRequest,
  providerLabel: LlmProviderLabel,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AsyncGenerator<string> {
  const url = assertSafeBaseUrl(req.baseUrl);
  const endpoint = `${url.origin}${url.pathname.replace(/\/+$/, '')}/chat`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (req.apiKey) headers.authorization = `Bearer ${req.apiKey}`;
  const payload = {
    model: req.model,
    messages: [{ role: 'system', content: req.system }, ...req.messages],
    stream: true,
  };
  const res = await openStreamingResponse(endpoint, headers, payload, {
    fetchImpl,
    signal,
    timeoutMs,
    sleep,
    providerLabel,
  });
  try {
    for await (const line of parseJsonLineStream(res.body, signal)) {
      let parsed: { message?: { content?: string }; done?: boolean };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const delta = parsed.message?.content;
      if (typeof delta === 'string' && delta !== '') yield delta;
      if (parsed.done === true) return;
    }
  } finally {
    try {
      await res.body?.cancel();
    } catch {}
  }
}

const PROVIDER_LABELS: Record<AiProviderId, LlmProviderLabel> = {
  anthropic: 'anthropic',
  openai: 'openai',
  gemini: 'gemini',
  groq: 'groq',
  openrouter: 'openrouter',
  mistral: 'mistral',
  'ollama-local': 'ollama-local',
  'ollama-cloud': 'ollama-cloud',
  ollama: 'ollama',
  'nvidia-nim': 'nvidia-nim',
  zai: 'zai',
  'opencode-zen': 'opencode-zen',
  'opencode-go': 'opencode-go',
  opencode: 'opencode',
};

/** Dispatches to the right streaming adapter for a provider, wrapped in an
 *  OpenTelemetry span. Yields text deltas. Records the call. */
export function streamChat(
  req: ChatRequest,
  opts: {
    surface: 'transform' | 'suggest-metadata' | 'suggest-filename';
    timeoutMs?: number;
  } = {
    surface: 'transform',
  },
): AsyncGenerator<string> {
  const fetchImpl = req.fetchImpl ?? fetch;
  const sleep = defaultSleep;
  const signal = req.signal;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const providerLabel = PROVIDER_LABELS[req.provider.id];
  recordLlmCall(providerLabel, opts.surface);

  const adapter =
    req.provider.type === 'anthropic'
      ? streamAnthropicMessages
      : req.provider.type === 'ollama-native'
        ? streamOllamaChat
        : streamOpenAiCompatChat;

  async function* run(): AsyncGenerator<string> {
    yield* adapter(req, providerLabel, fetchImpl, sleep, signal, timeoutMs);
  }
  return run();
}

/** Consumes a streaming chat into a single string. */
export async function completeChat(
  req: ChatRequest,
  opts: {
    surface: 'transform' | 'suggest-metadata' | 'suggest-filename';
    timeoutMs?: number;
  } = {
    surface: 'suggest-metadata',
  },
): Promise<string> {
  let out = '';
  for await (const delta of streamChat(req, opts)) {
    out += delta;
  }
  return out;
}

/** Lists models available for a provider using its native discovery endpoint. */
export async function listAvailableModels(req: ListModelsRequest): Promise<string[]> {
  const url = assertSafeBaseUrl(req.baseUrl);
  const fetchImpl = req.fetchImpl ?? fetch;
  const timeoutMs = DEFAULT_TIMEOUT_MS;

  if (req.provider.type === 'anthropic') {
    const endpoint = `${url.origin}${url.pathname.replace(/\/+$/, '')}/v1/models`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
    if (req.apiKey) headers['x-api-key'] = req.apiKey;
    return parseAnthropicModels(
      await fetchJson(endpoint, headers, { fetchImpl, signal: req.signal, timeoutMs }),
    );
  }

  if (req.provider.type === 'ollama-native') {
    const endpoint = `${url.origin}${url.pathname.replace(/\/+$/, '')}/tags`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (req.apiKey) headers.authorization = `Bearer ${req.apiKey}`;
    return parseOllamaModels(
      await fetchJson(endpoint, headers, { fetchImpl, signal: req.signal, timeoutMs }),
    );
  }

  const endpoint = `${url.origin}${url.pathname.replace(/\/+$/, '')}/models`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (req.apiKey) headers.authorization = `Bearer ${req.apiKey}`;
  return parseOpenAiCompatModels(
    await fetchJson(endpoint, headers, { fetchImpl, signal: req.signal, timeoutMs }),
  );
}
