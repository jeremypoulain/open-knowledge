import type { Counter, Histogram } from '@opentelemetry/api';
import { getMeter } from '../telemetry.ts';

export type LlmErrorReason =
  | 'rate_limit'
  | 'timeout'
  | 'http_error'
  | 'network'
  | 'malformed_response'
  | 'auth';

export type LlmProviderLabel =
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'openai'
  | 'openrouter'
  | 'mistral'
  | 'ollama-local'
  | 'ollama-cloud'
  | 'ollama'
  | 'nvidia-nim'
  | 'zai'
  | 'opencode-zen'
  | 'opencode-go'
  | 'opencode';

let _requestDuration: Histogram | null = null;
let _errors: Counter | null = null;
let _calls: Counter | null = null;

function requestDurationHist(): Histogram {
  _requestDuration ||= getMeter().createHistogram('ok.ai.request_duration_ms', {
    description:
      'Wall-clock duration of one chat/messages API request to an LLM provider. Bounded label: provider.',
    unit: 'ms',
  });
  return _requestDuration;
}

function errorsCounter(): Counter {
  _errors ||= getMeter().createCounter('ok.ai.provider_errors_total', {
    description:
      'LLM provider failures, by reason. Bounded label: reason ∈ {rate_limit, timeout, http_error, network, malformed_response, auth}.',
  });
  return _errors;
}

function callsCounter(): Counter {
  _calls ||= getMeter().createCounter('ok.ai.calls_total', {
    description:
      'In-app LLM calls, by provider and surface. Bounded labels: provider, surface ∈ {transform, suggest-metadata, suggest-filename}.',
  });
  return _calls;
}

export function recordLlmRequestDuration(provider: LlmProviderLabel, ms: number): void {
  requestDurationHist().record(Math.max(0, ms), { provider });
}

export function recordLlmProviderError(reason: LlmErrorReason): void {
  errorsCounter().add(1, { reason });
}

export function recordLlmCall(
  provider: LlmProviderLabel,
  surface: 'transform' | 'suggest-metadata' | 'suggest-filename',
): void {
  callsCounter().add(1, { provider, surface });
}

export function __resetAiTelemetryForTesting(): void {
  _requestDuration = null;
  _errors = null;
  _calls = null;
}
