import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import { AI_PROVIDER_ID_VALUES } from '../../ai/providers.ts';

export const LocalOpOkInitRequestSchema = z
  .object({
    projectPath: z.string().min(1),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpOkInitRequest = z.infer<typeof LocalOpOkInitRequestSchema>;

export const LocalOpOkInitFailureReasonSchema = z.enum([
  'not-a-git-worktree',
  'init-failed',
]) satisfies StandardSchemaV1;
export type LocalOpOkInitFailureReason = z.infer<typeof LocalOpOkInitFailureReasonSchema>;

export const LocalOpOkInitResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      projectPath: z.string().min(1),
    })
    .loose(),
  z
    .object({
      ok: z.literal(false),
      reason: LocalOpOkInitFailureReasonSchema,
      message: z.string().min(1),
    })
    .loose(),
]) satisfies StandardSchemaV1;
export type LocalOpOkInitResponse = z.infer<typeof LocalOpOkInitResponseSchema>;

export const LocalOpAuthHostRequestSchema = z
  .object({
    host: z.string().min(1).optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthHostRequest = z.infer<typeof LocalOpAuthHostRequestSchema>;

export const LocalOpEmbeddingsSetKeyRequestSchema = z
  .object({
    key: z.string().min(1),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpEmbeddingsSetKeyRequest = z.infer<typeof LocalOpEmbeddingsSetKeyRequestSchema>;

export const LocalOpEmbeddingsMutationSuccessSchema = z
  .object({
    keyPresent: z.boolean(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpEmbeddingsMutationSuccess = z.infer<
  typeof LocalOpEmbeddingsMutationSuccessSchema
>;

export const LocalOpAuthSetIdentityRequestSchema = z
  .object({
    name: z.string().refine((s) => s.trim().length > 0, { message: 'name must be non-empty' }),
    email: z.string().refine((s) => s.trim().length > 0, { message: 'email must be non-empty' }),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthSetIdentityRequest = z.infer<typeof LocalOpAuthSetIdentityRequestSchema>;

export const LocalOpAuthStatusSuccessSchema = z
  .object({
    authenticated: z.boolean(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthStatusSuccess = z.infer<typeof LocalOpAuthStatusSuccessSchema>;

export const LocalOpAuthEmptySuccessSchema = z.object({}).loose() satisfies StandardSchemaV1;
export type LocalOpAuthEmptySuccess = z.infer<typeof LocalOpAuthEmptySuccessSchema>;

export const AiProviderIdSchema = z.enum(AI_PROVIDER_ID_VALUES) satisfies StandardSchemaV1;

export const LocalOpAiKeySetRequestSchema = z
  .object({
    provider: AiProviderIdSchema,
    key: z.string().min(1),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiKeySetRequest = z.infer<typeof LocalOpAiKeySetRequestSchema>;

export const LocalOpAiKeyClearRequestSchema = z
  .object({
    provider: AiProviderIdSchema,
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiKeyClearRequest = z.infer<typeof LocalOpAiKeyClearRequestSchema>;

export const LocalOpAiKeyMutationSuccessSchema = z
  .object({
    provider: AiProviderIdSchema,
    keyPresent: z.boolean(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiKeyMutationSuccess = z.infer<typeof LocalOpAiKeyMutationSuccessSchema>;

export const LocalOpAiStatusSuccessSchema = z
  .object({
    defaultProvider: AiProviderIdSchema.nullable(),
    providers: z.record(
      z.string(),
      z.object({
        present: z.boolean(),
        hint: z.string().nullable(),
        source: z.enum(['file', 'env']).nullable(),
        model: z.string().nullable(),
        baseUrl: z.string().nullable(),
      }),
    ),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiStatusSuccess = z.infer<typeof LocalOpAiStatusSuccessSchema>;

export const LocalOpAiModelsRequestSchema = z
  .object({
    provider: AiProviderIdSchema,
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiModelsRequest = z.infer<typeof LocalOpAiModelsRequestSchema>;

export const LocalOpAiModelsSuccessSchema = z
  .object({
    provider: AiProviderIdSchema,
    models: z.array(z.string()),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiModelsSuccess = z.infer<typeof LocalOpAiModelsSuccessSchema>;

export const AI_TRANSFORM_ACTIONS = [
  'clarify',
  'improve',
  'concise',
  'fix-grammar',
  'longer',
  'friendly-tone',
  'professional-tone',
  'summarize',
  'custom',
] as const;
export type AiTransformAction = (typeof AI_TRANSFORM_ACTIONS)[number];

export const LocalOpAiTransformRequestSchema = z
  .object({
    provider: AiProviderIdSchema.optional(),
    model: z.string().optional(),
    action: z.enum(AI_TRANSFORM_ACTIONS),
    instruction: z.string().optional(),
    selection: z.string().min(1),
    docContext: z.string().optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiTransformRequest = z.infer<typeof LocalOpAiTransformRequestSchema>;

export const LocalOpAiSuggestTagsRequestSchema = z
  .object({
    provider: AiProviderIdSchema.optional(),
    model: z.string().optional(),
    docMarkdown: z.string(),
    existingTags: z.array(z.string()).optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAiSuggestTagsRequest = z.infer<typeof LocalOpAiSuggestTagsRequestSchema>;
