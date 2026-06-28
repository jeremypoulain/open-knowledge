/**
 * AI provider registry — the single source of truth for the in-app LLM
 * providers shared by the local server and the app.
 *
 * Three adapter families cover the entire provider list:
 *   - `openai-compat`: Chat Completions (`POST {baseUrl}/chat/completions`,
 *     `Authorization: Bearer`).
 *   - `anthropic`:     Messages API (`POST {baseUrl}/v1/messages`,
 *     `x-api-key`, `anthropic-version`).
 *   - `ollama-native`: Ollama Chat API (`POST {baseUrl}/chat`,
 *     optional `Authorization: Bearer` for Ollama Cloud).
 *
 * API keys are NOT modelled here — they live in `~/.ok/secrets.yml` (one
 * self-documenting field per provider, see `secretsField`). Only non-secret
 * config (active default provider, per-provider model + baseUrl) is stored in
 * the synced config schema.
 */

export type AiProviderType = 'openai-compat' | 'anthropic' | 'ollama-native';

export type AiProviderId =
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

export interface AiProviderDefinition {
  readonly id: AiProviderId;
  readonly type: AiProviderType;
  /** Display label for settings UI + menus. */
  readonly label: string;
  /** Default Chat/Messages base URL (no trailing slash). */
  readonly defaultBaseUrl: string;
  /** Default model id for this provider. */
  readonly defaultModel: string;
  /** Whether this provider should appear in settings by default. */
  readonly visible?: boolean;
  /** `~/.ok/secrets.yml` field name (the API key). Omitted for providers that
   *  typically need no key (e.g. local Ollama). */
  readonly secretsField?: string;
  /** Environment variable consulted when no stored key is present. */
  readonly envVar: string;
  /** Whether a key is required to use the provider. */
  readonly keyRequired: boolean;
}

export const ANTHROPIC_API_VERSION = '2023-06-01';

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'anthropic',
    type: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-5-20250929',
    secretsField: 'ANTHROPIC_API_KEY',
    envVar: 'OK_AI_ANTHROPIC_KEY',
    keyRequired: true,
  },
  {
    id: 'openai',
    type: 'openai-compat',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    secretsField: 'OPENAI_API_KEY',
    envVar: 'OK_AI_OPENAI_KEY',
    keyRequired: true,
  },
  {
    id: 'gemini',
    type: 'openai-compat',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash',
    secretsField: 'GEMINI_API_KEY',
    envVar: 'OK_AI_GEMINI_KEY',
    keyRequired: true,
  },
  {
    id: 'groq',
    type: 'openai-compat',
    label: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    secretsField: 'GROQ_API_KEY',
    envVar: 'OK_AI_GROQ_KEY',
    keyRequired: true,
  },
  {
    id: 'openrouter',
    type: 'openai-compat',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5.2',
    secretsField: 'OPENROUTER_API_KEY',
    envVar: 'OK_AI_OPENROUTER_KEY',
    keyRequired: true,
  },
  {
    id: 'mistral',
    type: 'openai-compat',
    label: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-medium-3-5',
    secretsField: 'MISTRAL_API_KEY',
    envVar: 'OK_AI_MISTRAL_KEY',
    keyRequired: true,
  },
  {
    id: 'ollama-local',
    type: 'ollama-native',
    label: 'Ollama Local',
    defaultBaseUrl: 'http://localhost:11434/api',
    defaultModel: 'llama3.2',
    envVar: 'OK_AI_OLLAMA_LOCAL_KEY',
    keyRequired: false,
  },
  {
    id: 'ollama-cloud',
    type: 'ollama-native',
    label: 'Ollama Cloud',
    defaultBaseUrl: 'https://ollama.com/api',
    defaultModel: 'openai/gpt-oss-120b',
    secretsField: 'OLLAMA_API_KEY',
    envVar: 'OK_AI_OLLAMA_CLOUD_KEY',
    keyRequired: true,
  },
  {
    id: 'ollama',
    type: 'ollama-native',
    label: 'Ollama (legacy)',
    defaultBaseUrl: 'http://localhost:11434/api',
    defaultModel: 'llama3.2',
    visible: false,
    envVar: 'OK_AI_OLLAMA_LOCAL_KEY',
    keyRequired: false,
  },
  {
    id: 'nvidia-nim',
    type: 'openai-compat',
    label: 'NVIDIA NIM',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    secretsField: 'NVIDIA_NIM_API_KEY',
    envVar: 'OK_AI_NVIDIA_NIM_KEY',
    keyRequired: true,
  },
  {
    id: 'zai',
    type: 'openai-compat',
    label: 'Z.ai',
    defaultBaseUrl: 'https://api.z.ai/api/coding/paas/v4',
    defaultModel: 'glm-5.2',
    secretsField: 'ZAI_API_KEY',
    envVar: 'OK_AI_ZAI_KEY',
    keyRequired: true,
  },
  {
    id: 'opencode-zen',
    type: 'openai-compat',
    label: 'OpenCode Zen',
    defaultBaseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'glm-4.6',
    secretsField: 'OPENCODE_API_KEY',
    envVar: 'OK_AI_OPENCODE_KEY',
    keyRequired: true,
  },
  {
    id: 'opencode-go',
    type: 'openai-compat',
    label: 'OpenCode Go',
    defaultBaseUrl: 'https://opencode.ai/zen/go/v1',
    defaultModel: 'glm-4.6',
    secretsField: 'OPENCODE_API_KEY',
    envVar: 'OK_AI_OPENCODE_KEY',
    keyRequired: true,
  },
  {
    id: 'opencode',
    type: 'openai-compat',
    label: 'OpenCode (legacy)',
    defaultBaseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'glm-4.6',
    visible: false,
    secretsField: 'OPENCODE_API_KEY',
    envVar: 'OK_AI_OPENCODE_KEY',
    keyRequired: true,
  },
];

/** Enum values for config schema + transport validation. Kept as a const
 *  tuple so `z.enum(...)` infers literal union types. */
export const AI_PROVIDER_ID_VALUES = [
  'anthropic',
  'openai',
  'gemini',
  'groq',
  'openrouter',
  'mistral',
  'ollama-local',
  'ollama-cloud',
  'ollama',
  'nvidia-nim',
  'zai',
  'opencode-zen',
  'opencode-go',
  'opencode',
] as const satisfies readonly AiProviderId[];

export const AI_VISIBLE_PROVIDERS = AI_PROVIDERS.filter((provider) => provider.visible !== false);

export function getAiProvider(id: AiProviderId): AiProviderDefinition {
  const def = AI_PROVIDERS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown AI provider: ${id}`);
  return def;
}

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_ID_VALUES as readonly string[]).includes(value);
}

/** Returns the env-var value to use for a provider when no stored key exists.
 *  Exposed for the secrets store's env fallback. */
export function aiProviderEnvValue(provider: AiProviderId): string | null {
  const def = getAiProvider(provider);
  const value = process.env[def.envVar];
  return typeof value === 'string' && value !== '' ? value : null;
}
