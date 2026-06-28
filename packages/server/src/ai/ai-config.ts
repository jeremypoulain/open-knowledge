import {
  AI_PROVIDERS,
  type AiProviderDefinition,
  type AiProviderId,
  getAiProvider,
} from '@inkeep/open-knowledge-core';
import { readConfigSafely, resolveConfigPath } from '@inkeep/open-knowledge-core/server';

/** Reads the user-scope `ai` config block (~/.ok/global.yml). */
export function readAiUserConfig(
  projectDir: string,
  opts?: { configHomedirOverride?: string; onWarn?: (message: string) => void },
): {
  defaultProvider: AiProviderId | null;
  providers: Record<string, { model?: string; baseUrl?: string }>;
} {
  const ai = readConfigSafely({
    absPath: resolveConfigPath('user', projectDir, opts?.configHomedirOverride),
    sideline: false,
    warn: opts?.onWarn ?? (() => {}),
  }).value.ai;
  return {
    defaultProvider: ai?.defaultProvider ?? null,
    providers: ai?.providers ?? {},
  };
}

export interface ResolvedAiProvider {
  provider: AiProviderDefinition;
  /** Final model id (per-provider override → registry default). */
  model: string;
  /** Final base URL (per-provider override → registry default). */
  baseUrl: string;
}

/** Resolves the provider + model + baseUrl to use for a request.
 *
 *  - If `providerId` is given, use it; otherwise fall back to the user-config
 *    `defaultProvider`; otherwise the first provider in the registry.
 *  - `modelOverride` (from the request) wins, then the per-provider config
 *    model, then the registry default model.
 */
export function resolveAiProvider(
  cfg: {
    defaultProvider: AiProviderId | null;
    providers: Record<string, { model?: string; baseUrl?: string }>;
  },
  providerId: AiProviderId | undefined,
  modelOverride?: string,
): ResolvedAiProvider {
  const id = providerId ?? cfg.defaultProvider ?? AI_PROVIDERS[0]?.id ?? 'ollama-local';
  const def = getAiProvider(id);
  const perProvider = cfg.providers[id];
  return {
    provider: def,
    model: modelOverride ?? perProvider?.model ?? def.defaultModel,
    baseUrl: perProvider?.baseUrl ?? def.defaultBaseUrl,
  };
}
