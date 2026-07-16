/**
 * Shared types + Zod schemas for the mj-metadata MCP server.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.18.1
 */
import { z } from 'zod';

export const ProvenanceEntrySchema = z.object({
    URL: z.string().url(),
    AccessedAt: z.string(), // ISO 8601
    UsedFor: z.string(),
    SourceTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    SourceCategory: z.enum(['OfficialDocs', 'OfficialSDK', 'OpenAPISpec', 'PostmanCollection', 'CommunityFixture']),
    EvidenceStrength: z.enum(['ExplicitStatement', 'ImpliedFromExample', 'InferredFromContext']),
    TargetField: z.string(), // 'integration.AuthModel' | 'io.contacts.SupportsWrite' etc.
    Excerpt: z.string().optional(),
});

export type ProvenanceEntry = z.infer<typeof ProvenanceEntrySchema>;

export const CodeEvidenceEntrySchema = z.object({
    ScriptPath: z.string(),
    ScriptRunAt: z.string(),
    StructuredOutput: z.unknown(),
    SchemaValidationStatus: z.enum(['Passed', 'Failed']),
    TargetField: z.string(),
});

export type CodeEvidenceEntry = z.infer<typeof CodeEvidenceEntrySchema>;

/**
 * Loose schema for root-level integration fields. The Integration entity has
 * 30+ Phase 0 hot-path columns (CredentialTypeID, APIBaseURL, APIBaseURLMode,
 * TokenRefreshStrategy, AuthHeaderPattern, PaginationCursorParamName,
 * IncrementalSyncCapability, WebhooksAvailable, BulkOperationsAvailable,
 * CustomObjectMarkerPattern, FKNamingConvention, etc.) — too many enum-typed
 * unions to maintain in lockstep with the generated entity schema here. We
 * accept any string/number/boolean/null at this layer; the actual validation
 * happens at mj-sync push time against the live entity schema.
 */
export const IntegrationRootFieldsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string(), z.unknown())]));

export type IntegrationRootFields = z.infer<typeof IntegrationRootFieldsSchema>;

export const IntegrationObjectSchema = z.object({
    Name: z.string(),
    DisplayName: z.string().optional(),
    Description: z.string().optional(),
    APIPath: z.string().optional(),
    SupportsWrite: z.boolean().optional(),
    SupportsIncrementalSync: z.boolean().optional(),
    Source: z.enum(['Declared', 'Discovered', 'Custom']).optional(),
    IncludeInActionGeneration: z.boolean().optional(),
    // passthrough(): the extractor emits many more IO columns than are typed here
    // (Status, PaginationType, SupportsPagination, Configuration, Category,
    // ResponseDataKey, the per-operation Create/Update/Delete columns,
    // IncrementalWatermarkField, Sequence, ...). The store persists arbitrary keys
    // (IntegrationObjectPayload & Record<string, unknown>) and mj-sync validates the
    // real column set at push time, so preserve unknown keys rather than stripping
    // floor-required slots like Status.
}).passthrough();

export type IntegrationObjectPayload = z.infer<typeof IntegrationObjectSchema>;

export const IntegrationObjectFieldSchema = z.object({
    Name: z.string(),
    DisplayName: z.string().optional(),
    Description: z.string().optional(),
    Type: z.string(),
    IsRequired: z.boolean().optional(),
    IsReadOnly: z.boolean().optional(),
    IsPrimaryKey: z.boolean().optional(),
    IsUniqueKey: z.boolean().optional(),
    RelatedIntegrationObjectID: z.string().optional(),
    RelatedIntegrationObjectFieldName: z.string().optional(),
    Source: z.enum(['Declared', 'Discovered', 'Custom']).optional(),
    // passthrough(): the extractor emits IOF columns beyond those typed here
    // (Status, Sequence, Category, AllowsNull, Length, Precision, Scale, DefaultValue).
    // Persisted verbatim; validated at mj-sync push time.
}).passthrough();

export type IntegrationObjectFieldPayload = z.infer<typeof IntegrationObjectFieldSchema>;

/** Aggregated metadata file shape that mj-metadata reads/writes. */
export interface IntegrationMetadataFile {
    fields: {
        Name: string;
        ClassName: string;
        [key: string]: unknown;
    };
    relatedEntities?: {
        'MJ: Integration Objects'?: Array<{
            fields: IntegrationObjectPayload & Record<string, unknown>;
            relatedEntities?: {
                'MJ: Integration Object Fields'?: Array<{
                    fields: IntegrationObjectFieldPayload & Record<string, unknown>;
                }>;
            };
        }>;
    };
}
