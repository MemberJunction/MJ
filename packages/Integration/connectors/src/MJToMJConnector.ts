import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
} from '@memberjunction/integration-engine';

// ─── Configuration & Context Types ───────────────────────────────────

/**
 * Supported auth header styles for remote MJ. MJ versions differ in which
 * header is accepted — newer builds default to `x-api-key`; older or
 * JWT-configured builds use `Authorization: Bearer`.
 */
export type MJToMJAuthHeaderStyle = 'x-api-key: {key}' | 'Authorization: Bearer {key}';

/**
 * Connection configuration for a remote MemberJunction instance.
 *
 * Stored on `MJ: Credentials.Values` (preferred) or
 * `MJ: Company Integrations.Configuration` as JSON. Accepts both PascalCase
 * and camelCase key spellings to tolerate the credential JSON schema's
 * camelCase default alongside hand-written PascalCase snippets.
 */
export interface MJToMJConnectionConfig {
    /** Full URL to the remote MJ's GraphQL endpoint (e.g., https://mj.customer.org/graphql). */
    GraphQLEndpoint: string;
    /** Read-only API key provisioned by the remote MJ admin. */
    ApiKey: string;
    /** Which HTTP header to use for the API key. Default: `x-api-key: {key}`. */
    AuthHeader?: MJToMJAuthHeaderStyle;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Minimum ms between requests to avoid hammering the remote instance. Default: 250. */
    MinRequestIntervalMs?: number;
}

// ─── GraphQL Response / Introspection Types ──────────────────────────

/** A single entry in the GraphQL `errors` array. */
interface GraphQLError {
    message: string;
    path?: ReadonlyArray<string | number>;
    extensions?: Record<string, unknown>;
}

/** Generic GraphQL response envelope. */
interface GraphQLResponse<TData> {
    data?: TData | null;
    errors?: GraphQLError[];
}

/** Shape of one field from an introspection __type result. */
interface IntrospectionField {
    name: string;
    description?: string | null;
    type: IntrospectionTypeRef;
}

/** Reduced __Type shape as used by our introspection calls. */
interface IntrospectionTypeRef {
    kind: string;
    name?: string | null;
    ofType?: IntrospectionTypeRef | null;
}

/** Shape returned by a `__type(name: "X")` introspection query. */
interface IntrospectionTypeResult {
    name?: string;
    kind?: string;
    fields?: IntrospectionField[] | null;
}

/** Shape of the `__schema.queryType.fields` list we enumerate for discovery. */
interface IntrospectionSchemaField {
    name: string;
    description?: string | null;
    type: IntrospectionTypeRef;
}

interface IntrospectionSchemaResult {
    queryType: {
        name: string;
        fields?: IntrospectionSchemaField[] | null;
    };
}

/** Parsed DefaultQueryParams hints from an IntegrationObject row. */
interface ObjectQueryHints {
    GraphQLFields: string[];
    WatermarkField: string | null;
    GraphQLQueryName: string;
    ResponseDataKey: string;
}

/** A generic "row" from a GraphQL list response. */
type GraphQLRow = Record<string, unknown>;

/**
 * Forward-compatible extension of FetchContext — in some builds of
 * `@memberjunction/integration-engine`, `FetchContext.RequestedSourceFields`
 * exists natively; in others (older published dist) it does not yet. Using
 * a local intersection lets us read the field without an `any` cast.
 */
type FetchContextWithRequestedFields = FetchContext & { RequestedSourceFields?: string[] };

// ─── Constants ───────────────────────────────────────────────────────

/** Default HTTP timeout in ms. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default minimum interval between requests in ms. */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 250;

/** Maximum retries on 429/503 / GraphQL-level errors before giving up. */
const MAX_RETRIES = 4;

/** Base backoff (ms) for exponential backoff on 429/503. */
const BASE_BACKOFF_MS = 1000;

/** Maximum cap on the backoff delay. */
const MAX_BACKOFF_MS = 30000;

/** Fields on a remote MJ entity that, when present, suggest conversational shape. */
const CONVERSATIONAL_MARKER_FIELDS: ReadonlySet<string> = new Set([
    'conversationid',
    'message',
    'role',
]);

/** Static seed entities — merged with runtime introspection in DiscoverObjects. */
const MJ_TO_MJ_STATIC_OBJECTS: ReadonlyArray<{
    Name: string;
    Label: string;
    Description: string;
    SupportsIncrementalSync: boolean;
    SupportsWrite: boolean;
}> = [
    {
        Name: 'Conversations',
        Label: 'Conversations',
        Description: 'Remote MJ Conversations — maps to MJ: Conversations.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'ConversationDetails',
        Label: 'Conversation Details',
        Description: 'Remote MJ Conversation Details — maps to MJ: Conversation Details.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'AIAgents',
        Label: 'AI Agents',
        Description: 'Remote MJ AI Agents — reference data for agent definitions.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'AIAgentRuns',
        Label: 'AI Agent Runs',
        Description: 'Remote MJ AI Agent Runs — execution logs (GraphQL: MJ_AIAgentRuns).',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'AIAgentRunSteps',
        Label: 'AI Agent Run Steps',
        Description: 'Remote MJ AI Agent Run Steps — step-level run detail (GraphQL: MJ_AIAgentRunSteps).',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'Users',
        Label: 'Users',
        Description: 'Remote MJ Users — reference data for conversation ownership.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
];

// ─── Connector Implementation ────────────────────────────────────────

/**
 * Read-only connector that pulls conversational data (Conversations,
 * Conversation Details, optional AI Agent Runs/Steps, reference Users and
 * Agents) from a remote, self-hosted MemberJunction GraphQL API into
 * this MJ's native conversation entities.
 *
 * Destination mapping on this MJ:
 *   - Conversations        -> `MJ: Conversations`
 *   - ConversationDetails  -> `MJ: Conversation Details`
 *   - AIAgents / Users / AIAgentRuns / AIAgentRunSteps are reference-only by
 *     default and not auto-mapped to MJ entities.
 *
 * Design notes:
 *   - Extends `BaseIntegrationConnector` directly (not REST) because MJ
 *     uses GraphQL, not REST-over-HTTP-verbs.
 *   - No dependency on `@memberjunction/graphql-data-provider` — we POST
 *     plain GraphQL over `fetch` to keep the dependency surface minimal.
 *   - The GraphQL query is **built from IntegrationObject metadata** — the
 *     connector does NOT switch on entity names. `DefaultQueryParams`
 *     carries the `graphql_fields` selection, `watermark_field`, and
 *     `mj_target_entity` / `mj_field_map` hints.
 *   - MJ's GraphQL filter convention is `ExtraFilter` — a SQL-like WHERE
 *     clause. We build the filter string from the watermark, escaping the
 *     datetime literal, and send it as a GraphQL **variable**
 *     (`$extraFilter: String`) rather than interpolating into the query
 *     text. This avoids injection from the watermark value.
 *   - Pagination is offset/limit via MJ's `skip` / `top` args.
 *   - 200 OK with non-empty `errors[]` is treated as a transient failure
 *     and retried like a 5xx.
 *
 * Configuration shape:
 * ```json
 * {
 *   "GraphQLEndpoint": "https://mj.customer.org/graphql",
 *   "ApiKey": "<read-only key>",
 *   "AuthHeader": "x-api-key: {key}",
 *   "RequestTimeoutMs": 30000,
 *   "MinRequestIntervalMs": 250
 * }
 * ```
 */
@RegisterClass(BaseIntegrationConnector, 'MJToMJConnector')
export class MJToMJConnector extends BaseIntegrationConnector {

    // ── Instance state ───────────────────────────────────────────────

    /** Resolved config for the current run (populated on first auth). */
    private resolvedConfig: MJToMJConnectionConfig | null = null;

    /** Timestamp of the last HTTP request for throttling. */
    private lastRequestTime = 0;

    // ── Capability getters (all default to false — read-only) ────────

    public override get SupportsCreate(): boolean { return false; }
    public override get SupportsUpdate(): boolean { return false; }
    public override get SupportsDelete(): boolean { return false; }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return false; }

    public override get IntegrationName(): string { return 'MJ to MJ'; }

    // ── Read-only guards ─────────────────────────────────────────────

    public override async CreateRecord(): Promise<never> {
        throw new Error('MJToMJ connector is read-only — CreateRecord is not supported.');
    }

    public override async UpdateRecord(): Promise<never> {
        throw new Error('MJToMJ connector is read-only — UpdateRecord is not supported.');
    }

    public override async DeleteRecord(): Promise<never> {
        throw new Error('MJToMJ connector is read-only — DeleteRecord is not supported.');
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Validates connectivity by running a minimal GraphQL introspection
     * query. Any 200 response with a populated `__schema.queryType.name`
     * is treated as success.
     *
     * - 401 => "API key rejected"
     * - 403 => "API key lacks schema access"
     * - other non-2xx => surfaced with the HTTP status for debugging
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.resolveConfig(companyIntegration, contextUser);
            const result = await this.probeSchema(config);
            return result;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                Success: false,
                Message:
                    `MJToMJ connection test failed: ${message}. ` +
                    `Verify GraphQLEndpoint, ApiKey, and AuthHeader style with the remote MJ admin.`,
            };
        }
    }

    /**
     * Runs the minimal `__schema.queryType.name` introspection query and
     * translates HTTP-level outcomes into a user-facing connection result.
     */
    private async probeSchema(config: MJToMJConnectionConfig): Promise<ConnectionTestResult> {
        const query = 'query { __schema { queryType { name } } }';
        const response = await this.postGraphQL<{ __schema: { queryType: { name: string } } }>(
            config, query, undefined
        );

        if (response.HTTPStatus === 401) {
            return { Success: false, Message: 'Remote MJ rejected the API key (HTTP 401). Re-check the key value and header style.' };
        }
        if (response.HTTPStatus === 403) {
            return { Success: false, Message: 'Remote MJ accepted the key but the key lacks schema-introspection access (HTTP 403).' };
        }
        if (response.HTTPStatus < 200 || response.HTTPStatus >= 300) {
            return { Success: false, Message: `Remote MJ returned HTTP ${response.HTTPStatus} during introspection.` };
        }
        if (response.Body.errors && response.Body.errors.length > 0) {
            const joined = response.Body.errors.map(e => e.message).join('; ');
            return { Success: false, Message: `GraphQL errors during introspection: ${joined}` };
        }
        const queryTypeName = response.Body.data?.__schema?.queryType?.name;
        if (!queryTypeName) {
            return { Success: false, Message: 'Remote MJ responded but __schema.queryType was empty — introspection may be disabled.' };
        }
        return {
            Success: true,
            Message: `Connected to remote MemberJunction GraphQL (queryType: ${queryTypeName}). Ready to pull conversational data.`,
            ServerVersion: `MemberJunction GraphQL (${queryTypeName})`,
        };
    }

    // ─── DiscoverObjects ─────────────────────────────────────────────

    /**
     * Merges static seed objects with entities the connector detects via
     * `__schema.queryType.fields` whose names look conversational. Anything
     * discovered dynamically is flagged `IsCustom: true` through a
     * "Custom:" description prefix.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const staticObjects: ExternalObjectSchema[] = MJ_TO_MJ_STATIC_OBJECTS.map(o => ({ ...o }));
        const staticNames = this.toLowerSet(staticObjects.map(o => o.Name));

        try {
            const config = await this.resolveConfig(companyIntegration, contextUser);
            const schemaFields = await this.fetchRootQueryFields(config);
            const discovered = await this.findCustomConversationalObjects(config, schemaFields, staticNames);
            return [...staticObjects, ...discovered];
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[MJToMJ] DiscoverObjects runtime introspection failed (${message}) — returning static objects only.`);
            return staticObjects;
        }
    }

    /** Fetches the list of queryable root fields from the remote schema. */
    private async fetchRootQueryFields(config: MJToMJConnectionConfig): Promise<IntrospectionSchemaField[]> {
        const query = `query {
            __schema {
                queryType {
                    name
                    fields {
                        name
                        description
                        type { kind name ofType { kind name ofType { kind name } } }
                    }
                }
            }
        }`;
        const response = await this.postGraphQL<{ __schema: IntrospectionSchemaResult }>(config, query, undefined);
        this.assertGraphQLOk(response, 'introspect root schema');
        return response.Body.data?.__schema?.queryType?.fields ?? [];
    }

    /**
     * Filters root query fields to those that resemble conversational
     * entities by probing each candidate's type with an introspection call
     * and checking for marker fields (ConversationID / Message / Role).
     */
    private async findCustomConversationalObjects(
        config: MJToMJConnectionConfig,
        rootFields: IntrospectionSchemaField[],
        staticNames: Set<string>
    ): Promise<ExternalObjectSchema[]> {
        const discovered: ExternalObjectSchema[] = [];
        const seen = new Set<string>(staticNames);

        for (const rootField of rootFields) {
            const normalizedName = rootField.name;
            const lc = normalizedName.toLowerCase();
            if (seen.has(lc)) continue;

            const elementTypeName = this.extractListElementTypeName(rootField.type);
            if (!elementTypeName) continue;

            const isConversational = await this.typeHasConversationalShape(config, elementTypeName);
            if (!isConversational) continue;

            seen.add(lc);
            discovered.push({
                Name: normalizedName,
                Label: normalizedName,
                Description: `Custom: discovered via GraphQL introspection (type ${elementTypeName}).`,
                SupportsIncrementalSync: true,
                SupportsWrite: false,
            });
        }
        return discovered;
    }

    /** Returns true if the given GraphQL type has any conversational marker fields. */
    private async typeHasConversationalShape(
        config: MJToMJConnectionConfig,
        typeName: string
    ): Promise<boolean> {
        const introspected = await this.introspectType(config, typeName);
        if (!introspected?.fields) return false;
        return introspected.fields.some(f => CONVERSATIONAL_MARKER_FIELDS.has(f.name.toLowerCase()));
    }

    // ─── DiscoverFields ──────────────────────────────────────────────

    /**
     * Merges statically-configured fields (from IntegrationObjectField) with
     * fields discovered via GraphQL introspection on the corresponding
     * GraphQL type. Anything seen only at runtime is flagged `IsCustom`.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticFields = this.getStaticFieldSchemas(companyIntegration.IntegrationID, objectName);
        const staticNames = this.toLowerSet(staticFields.map(f => f.Name));

        try {
            const config = await this.resolveConfig(companyIntegration, contextUser);
            const typeName = this.resolveGraphQLTypeName(companyIntegration.IntegrationID, objectName);
            if (!typeName) return staticFields;

            const introspected = await this.introspectType(config, typeName);
            if (!introspected?.fields) return staticFields;

            const discovered = this.buildCustomFieldSchemas(introspected.fields, staticNames);
            return [...staticFields, ...discovered];
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[MJToMJ] DiscoverFields for "${objectName}" failed (${message}) — returning static fields only.`);
            return staticFields;
        }
    }

    /**
     * Resolves the expected remote GraphQL type name for an IntegrationObject
     * by looking up the type of the list query field named by `APIPath`.
     */
    private resolveGraphQLTypeName(integrationID: string, objectName: string): string | null {
        const obj = this.tryGetCachedObject(integrationID, objectName);
        if (!obj) return null;
        // APIPath stores the GraphQL query name (e.g., "Conversations").
        // Without a live root-schema cache, we cannot resolve the exact type
        // name here; callers that need the element type should use
        // extractListElementTypeName() on introspection results instead.
        // Fall back to the object name itself, which matches MJ conventions
        // where the query `Foo` returns a list of `Foo`.
        return this.stripMJPrefix(obj.APIPath) || objectName;
    }

    /** Builds ExternalFieldSchema entries for introspected fields absent from static metadata. */
    private buildCustomFieldSchemas(
        introspectedFields: IntrospectionField[],
        staticNames: Set<string>
    ): ExternalFieldSchema[] {
        const out: ExternalFieldSchema[] = [];
        for (const f of introspectedFields) {
            if (staticNames.has(f.name.toLowerCase())) continue;
            out.push({
                Name: f.name,
                Label: f.name,
                Description: `Custom: ${f.description ?? 'discovered via GraphQL introspection'}`,
                DataType: this.mapIntrospectionTypeToMJType(f.type),
                IsRequired: this.isNonNull(f.type),
                IsUniqueKey: f.name.toLowerCase() === 'id',
                IsReadOnly: true,
                IsForeignKey: false,
                ForeignKeyTarget: null,
            });
        }
        return out;
    }

    // ─── FetchChanges ────────────────────────────────────────────────

    /**
     * Pulls a batch of records from the remote MJ using a GraphQL query
     * built entirely from `DefaultQueryParams` on the IntegrationObject:
     *
     *   - `graphql_fields`  → GraphQL field selection
     *   - `watermark_field` → used to build an ExtraFilter
     *   - pagination via `skip` / `top` (offset / limit)
     *
     * Watermark values are passed as GraphQL variables, never string-concatenated
     * into the query body.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.getCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.getCachedFields(obj.ID);
        const hints = this.parseObjectHints(obj);

        const config = await this.resolveConfig(ctx.CompanyIntegration, ctx.ContextUser);
        const offset = ctx.CurrentOffset ?? 0;
        const limit = this.computeBatchSize(obj, ctx.BatchSize);
        const filter = this.buildExtraFilter(hints.WatermarkField, ctx.WatermarkValue);

        const requestedFields = (ctx as FetchContextWithRequestedFields).RequestedSourceFields;
        const selection = this.narrowSelection(hints.GraphQLFields, requestedFields);
        const { query, variables } = this.buildListQuery(hints.GraphQLQueryName, selection, offset, limit, filter);
        const response = await this.postGraphQL<GraphQLRow>(config, query, variables);
        this.assertGraphQLOk(response, `fetch ${ctx.ObjectName}`);

        const rows = this.extractRows(response.Body.data, hints.ResponseDataKey);
        const pkFieldNames = this.findPrimaryKeyFieldNames(fields);
        const records: ExternalRecord[] = rows.map(r => this.toExternalRecord(r, ctx.ObjectName, pkFieldNames));
        const newWatermark = this.computeNewWatermark(rows, hints.WatermarkField, ctx.WatermarkValue);

        return {
            Records: records,
            HasMore: rows.length >= limit,
            NextOffset: offset + rows.length,
            NewWatermarkValue: newWatermark ?? undefined,
        };
    }

    /** Extracts the list of rows from the GraphQL data envelope under the configured key. */
    private extractRows(data: unknown, key: string): GraphQLRow[] {
        if (!data || typeof data !== 'object') return [];
        const container = data as Record<string, unknown>;
        const value = container[key];
        return Array.isArray(value) ? value.filter((r): r is GraphQLRow => r != null && typeof r === 'object') : [];
    }

    /** Returns the max row count to request in a single page. */
    private computeBatchSize(obj: MJIntegrationObjectEntity, batchSize: number | undefined): number {
        const defaultPageSize = obj.DefaultPageSize ?? 100;
        if (batchSize && batchSize > 0) return Math.min(batchSize, defaultPageSize);
        return defaultPageSize;
    }

    /**
     * Builds an MJ `ExtraFilter` clause from the watermark field and value.
     * Returns null when either piece is missing, which signals "no filter".
     * Datetime literals are wrapped in single quotes and double-single-quoted
     * to guard against injection from exotic watermark values.
     */
    private buildExtraFilter(watermarkField: string | null, watermarkValue: string | null): string | null {
        if (!watermarkField || !watermarkValue) return null;
        const safeValue = String(watermarkValue).replace(/'/g, "''");
        return `${watermarkField} > '${safeValue}'`;
    }

    /**
     * Returns the list of GraphQL fields to request. If the engine supplied
     * RequestedSourceFields, intersect with the configured `graphql_fields`;
     * always include primary-key-like fields to preserve ExternalID derivation.
     */
    private narrowSelection(configuredFields: string[], requestedFields: string[] | undefined): string[] {
        if (!requestedFields || requestedFields.length === 0) return configuredFields;
        const requestedLower = this.toLowerSet(requestedFields);
        const preserved = configuredFields.filter(f => requestedLower.has(f.toLowerCase()) || f.toLowerCase() === 'id');
        return preserved.length > 0 ? preserved : configuredFields;
    }

    /**
     * Builds a paginated list query of the shape
     * `query Fetch($skip:Int,$top:Int,$extraFilter:String) { <name>(skip:$skip,top:$top,ExtraFilter:$extraFilter) { field1 field2 } }`.
     */
    private buildListQuery(
        queryName: string,
        fieldSelection: string[],
        offset: number,
        limit: number,
        filter: string | null
    ): { query: string; variables: Record<string, unknown> } {
        const sanitizedName = this.sanitizeGraphQLName(queryName);
        const selectionText = this.escapeFieldSelection(fieldSelection);
        const args: string[] = ['skip: $skip', 'top: $top'];
        if (filter != null) {
            args.push('ExtraFilter: $extraFilter');
        }
        const varDefs: string[] = ['$skip: Int!', '$top: Int!'];
        if (filter != null) varDefs.push('$extraFilter: String');

        const query = `query Fetch(${varDefs.join(', ')}) {
    ${sanitizedName}(${args.join(', ')}) {
        ${selectionText}
    }
}`;
        const variables: Record<string, unknown> = { skip: offset, top: limit };
        if (filter != null) variables.extraFilter = filter;
        return { query, variables };
    }

    // ─── DefaultQueryParams parsing ──────────────────────────────────

    /**
     * Extracts the GraphQL hint block from an IntegrationObject's
     * DefaultQueryParams. Uses safe fallbacks so an object with partial
     * hints can still fetch at least its declared primary key.
     */
    private parseObjectHints(obj: MJIntegrationObjectEntity): ObjectQueryHints {
        const parsed = this.safeParseJson(obj.DefaultQueryParams);
        const graphQLFields = this.extractFieldListFromHints(parsed, obj.ID);
        const watermarkField = this.pickString(parsed, 'watermark_field') ?? null;
        const graphQLQueryName = obj.APIPath?.trim() || obj.Name;
        const responseDataKey = obj.ResponseDataKey?.trim() || graphQLQueryName;
        return { GraphQLFields: graphQLFields, WatermarkField: watermarkField, GraphQLQueryName: graphQLQueryName, ResponseDataKey: responseDataKey };
    }

    /**
     * Resolves the declared GraphQL field selection for an object. Prefers
     * `graphql_fields` on DefaultQueryParams; falls back to the IntegrationObjectField
     * metadata when not set (ensures at least the PK is requested).
     */
    private extractFieldListFromHints(
        parsed: Record<string, unknown> | null,
        objectID: string
    ): string[] {
        const raw = parsed ? this.pickString(parsed, 'graphql_fields') : undefined;
        if (raw) {
            return raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        // Fallback: derive from IntegrationObjectField list.
        const fields = this.getCachedFields(objectID);
        if (fields.length === 0) return ['ID'];
        return fields.filter(f => f.Status === 'Active').map(f => f.Name);
    }

    // ─── GraphQL name / selection sanitization ───────────────────────

    /**
     * Sanitizes a GraphQL identifier — strips anything outside `[A-Za-z0-9_]`.
     * Names that start with a digit are prefixed with `_` to stay valid.
     */
    private sanitizeGraphQLName(name: string): string {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('MJToMJConnector: GraphQL query name cannot be empty.');
        const cleaned = trimmed.replace(/[^A-Za-z0-9_]/g, '');
        if (!cleaned) throw new Error(`MJToMJConnector: GraphQL query name "${name}" contains no valid characters.`);
        return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
    }

    /** Sanitizes each requested field name so the built query stays valid GraphQL. */
    private escapeFieldSelection(fields: string[]): string {
        const safe = fields
            .map(f => this.sanitizeGraphQLName(f))
            .filter(f => f.length > 0);
        return safe.length > 0 ? safe.join('\n        ') : 'ID';
    }

    // ─── GraphQL transport ───────────────────────────────────────────

    /**
     * Executes a single GraphQL POST. Automatically retries on 429/503 and
     * on GraphQL-level transient errors (200 with non-empty `errors[]`).
     */
    private async postGraphQL<TData>(
        config: MJToMJConnectionConfig,
        query: string,
        variables: Record<string, unknown> | undefined
    ): Promise<{ HTTPStatus: number; Body: GraphQLResponse<TData> }> {
        const headers = this.buildHeaders(config);
        const bodyPayload = JSON.stringify(variables ? { query, variables } : { query });

        await this.applyThrottle(config);

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.fetchRaw(config, headers, bodyPayload);
            const status = response.status;

            if (status === 429 || status === 503) {
                if (attempt === MAX_RETRIES) {
                    return { HTTPStatus: status, Body: await this.parseGraphQLBody<TData>(response) };
                }
                await this.sleep(this.computeBackoffMs(response, attempt));
                continue;
            }

            this.lastRequestTime = Date.now();
            const body = await this.parseGraphQLBody<TData>(response);

            if (status >= 200 && status < 300 && this.shouldRetryGraphQLErrors(body) && attempt < MAX_RETRIES) {
                await this.sleep(this.computeBackoffMs(response, attempt));
                continue;
            }
            return { HTTPStatus: status, Body: body };
        }

        throw new Error('MJToMJConnector: GraphQL request failed after maximum retries.');
    }

    /** Executes the raw fetch with an AbortController-based timeout. */
    private async fetchRaw(
        config: MJToMJConnectionConfig,
        headers: Record<string, string>,
        bodyPayload: string
    ): Promise<Response> {
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(config.GraphQLEndpoint, {
                method: 'POST',
                headers,
                body: bodyPayload,
                signal: controller.signal,
            });
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`MJToMJ GraphQL request timed out after ${timeoutMs / 1000}s.`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Parses a fetch Response body into the GraphQL envelope. */
    private async parseGraphQLBody<TData>(response: Response): Promise<GraphQLResponse<TData>> {
        try {
            const text = await response.text();
            if (!text) return {};
            return JSON.parse(text) as GraphQLResponse<TData>;
        } catch {
            return {};
        }
    }

    /** Returns true when the response body carries recoverable-looking GraphQL errors. */
    private shouldRetryGraphQLErrors<TData>(body: GraphQLResponse<TData>): boolean {
        if (!body.errors || body.errors.length === 0) return false;
        const retryableKeywords = ['timeout', 'temporarily', 'try again', 'rate limit', 'busy', 'unavailable'];
        return body.errors.some(e => {
            const msg = (e.message ?? '').toLowerCase();
            return retryableKeywords.some(k => msg.includes(k));
        });
    }

    /**
     * Asserts that a GraphQL response was successful — throws a descriptive
     * error otherwise. Used on introspection / schema-level calls where we
     * can't return a partial result.
     */
    private assertGraphQLOk<TData>(
        response: { HTTPStatus: number; Body: GraphQLResponse<TData> },
        operation: string
    ): void {
        if (response.HTTPStatus < 200 || response.HTTPStatus >= 300) {
            throw new Error(`MJToMJConnector: HTTP ${response.HTTPStatus} while trying to ${operation}.`);
        }
        if (response.Body.errors && response.Body.errors.length > 0) {
            const joined = response.Body.errors.map(e => e.message).join('; ');
            throw new Error(`MJToMJConnector: GraphQL errors while trying to ${operation} — ${joined}`);
        }
    }

    /** Builds HTTP headers honoring the configured auth-header style. */
    private buildHeaders(config: MJToMJConnectionConfig): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        const style = config.AuthHeader ?? 'x-api-key: {key}';
        if (style === 'Authorization: Bearer {key}') {
            headers['Authorization'] = `Bearer ${config.ApiKey}`;
        } else {
            headers['x-api-key'] = config.ApiKey;
        }
        return headers;
    }

    /** Enforces MinRequestIntervalMs between consecutive calls. */
    private async applyThrottle(config: MJToMJConnectionConfig): Promise<void> {
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minInterval) {
            await this.sleep(minInterval - elapsed);
        }
    }

    /** Returns a Promise that resolves after `ms` milliseconds. */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Honors Retry-After if present, otherwise exponential backoff capped at MAX_BACKOFF_MS. */
    private computeBackoffMs(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const seconds = Number(retryAfter);
            if (!Number.isNaN(seconds) && seconds > 0) {
                return Math.min(seconds * 1000, MAX_BACKOFF_MS);
            }
        }
        return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
    }

    // ─── GraphQL introspection helpers ───────────────────────────────

    /** Runs a `__type(name: $name)` introspection query on a single type. */
    private async introspectType(
        config: MJToMJConnectionConfig,
        typeName: string
    ): Promise<IntrospectionTypeResult | null> {
        const query = `query IntrospectType($typeName: String!) {
            __type(name: $typeName) {
                name
                kind
                fields { name description type { kind name ofType { kind name ofType { kind name } } } }
            }
        }`;
        const response = await this.postGraphQL<{ __type: IntrospectionTypeResult | null }>(
            config, query, { typeName }
        );
        if (response.HTTPStatus < 200 || response.HTTPStatus >= 300) return null;
        if (response.Body.errors && response.Body.errors.length > 0) return null;
        return response.Body.data?.__type ?? null;
    }

    /**
     * Walks a GraphQL type reference and returns the innermost NAMED type
     * that sits underneath any LIST/NON_NULL wrappers — this is the element
     * type for a list-returning query like `Conversations: [Conversation!]!`.
     */
    private extractListElementTypeName(type: IntrospectionTypeRef): string | null {
        let current: IntrospectionTypeRef | null = type;
        while (current) {
            if (current.kind === 'LIST' && current.ofType) {
                return this.extractInnerNamedType(current.ofType);
            }
            current = current.ofType ?? null;
        }
        return null;
    }

    /** Returns the innermost NAMED type ignoring NON_NULL wrappers. */
    private extractInnerNamedType(type: IntrospectionTypeRef): string | null {
        let current: IntrospectionTypeRef | null = type;
        while (current) {
            if (current.kind === 'NON_NULL' || current.kind === 'LIST') {
                current = current.ofType ?? null;
                continue;
            }
            return current.name ?? null;
        }
        return null;
    }

    /** Returns true if the OUTERMOST type is NON_NULL. */
    private isNonNull(type: IntrospectionTypeRef): boolean {
        return type.kind === 'NON_NULL';
    }

    /**
     * Maps a GraphQL scalar/type reference to the coarse MJ data-type label
     * used by `ExternalFieldSchema.DataType`. Leans conservative — unknowns
     * fall back to `nvarchar`.
     */
    private mapIntrospectionTypeToMJType(type: IntrospectionTypeRef): string {
        const named = this.extractInnerNamedType(type);
        if (!named) return 'nvarchar';
        switch (named) {
            case 'Int':
                return 'int';
            case 'Float':
                return 'decimal';
            case 'Boolean':
                return 'bit';
            case 'ID':
            case 'String':
                return 'nvarchar';
            case 'Date':
            case 'DateTime':
            case 'DateTimeOffset':
                return 'datetimeoffset';
            default:
                return 'nvarchar';
        }
    }

    // ─── Config resolution ───────────────────────────────────────────

    /**
     * Resolves a MJToMJConnectionConfig from either the CompanyIntegration's
     * linked credential record or its legacy Configuration JSON field.
     * Result is cached on the instance so subsequent calls skip the lookup.
     */
    private async resolveConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<MJToMJConnectionConfig> {
        if (this.resolvedConfig) return this.resolvedConfig;

        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.loadConfigFromCredential(credentialID, contextUser);
            if (fromCred) {
                this.resolvedConfig = fromCred;
                return fromCred;
            }
        }
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = this.parseConfigJson(configJson);
            this.resolvedConfig = parsed;
            return parsed;
        }
        throw new Error(
            'MJToMJConnector: No credentials or configuration found. ' +
            'Attach a "MJ API Key" credential with GraphQLEndpoint + ApiKey or set Configuration JSON on the CompanyIntegration.'
        );
    }

    /** Loads config from a `MJ: Credentials` record; returns null on miss/parse failure. */
    private async loadConfigFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<MJToMJConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        try {
            return this.parseConfigJson(credential.Values);
        } catch {
            return null;
        }
    }

    /**
     * Parses a JSON config payload into a fully-typed MJToMJConnectionConfig.
     * Accepts PascalCase and camelCase key spellings so either the JSON schema's
     * default camelCase or hand-written PascalCase works interchangeably.
     */
    private parseConfigJson(json: string): MJToMJConnectionConfig {
        const parsed = this.safeParseJson(json);
        if (!parsed) throw new Error('MJToMJConnector: Configuration JSON is malformed.');

        const endpoint = this.pickString(parsed, 'GraphQLEndpoint', 'graphqlEndpoint', 'graphQLEndpoint', 'Endpoint', 'endpoint');
        const apiKey = this.pickString(parsed, 'ApiKey', 'apiKey', 'APIKey', 'api_key');
        if (!endpoint || !apiKey) {
            throw new Error('MJToMJConnector: Configuration must include GraphQLEndpoint and ApiKey.');
        }
        const authHeader = this.normalizeAuthHeader(this.pickString(parsed, 'AuthHeader', 'authHeader'));
        return {
            GraphQLEndpoint: this.stripTrailingSlash(endpoint),
            ApiKey: apiKey,
            AuthHeader: authHeader,
            RequestTimeoutMs: this.pickPositiveInt(parsed, 'RequestTimeoutMs', 'requestTimeoutMs'),
            MinRequestIntervalMs: this.pickPositiveInt(parsed, 'MinRequestIntervalMs', 'minRequestIntervalMs'),
        };
    }

    /** Normalizes a raw auth header string into the typed union. */
    private normalizeAuthHeader(raw: string | undefined): MJToMJAuthHeaderStyle {
        if (!raw) return 'x-api-key: {key}';
        const trimmed = raw.trim();
        if (trimmed === 'Authorization: Bearer {key}' || /^authorization\b/i.test(trimmed)) {
            return 'Authorization: Bearer {key}';
        }
        return 'x-api-key: {key}';
    }

    // ─── IntegrationObject/Field metadata accessors ──────────────────

    /** Returns the cached IntegrationObject entity or throws if not present. */
    private getCachedObject(integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const obj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, objectName);
        if (!obj) {
            throw new Error(`MJToMJConnector: IntegrationObject not found for "${objectName}" (integration ${integrationID}).`);
        }
        return obj;
    }

    /** Null-safe version of getCachedObject — used in DiscoverFields. */
    private tryGetCachedObject(integrationID: string, objectName: string): MJIntegrationObjectEntity | null {
        try {
            return this.getCachedObject(integrationID, objectName);
        } catch {
            return null;
        }
    }

    /** Returns active fields sorted by Sequence for a given IntegrationObject. */
    private getCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return IntegrationEngineBase.Instance.GetIntegrationObjectFields(objectID)
            .filter(f => f.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
    }

    /** Builds the static ExternalFieldSchema list from cached metadata. */
    private getStaticFieldSchemas(integrationID: string, objectName: string): ExternalFieldSchema[] {
        const obj = this.tryGetCachedObject(integrationID, objectName);
        if (!obj) return [];
        const fields = this.getCachedFields(obj.ID);
        return fields.map(f => ({
            Name: f.Name,
            Label: f.DisplayName ?? f.Name,
            Description: f.Description ?? undefined,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsUniqueKey || f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
            IsForeignKey: f.RelatedIntegrationObjectID != null,
            ForeignKeyTarget: f.RelatedIntegrationObject ?? null,
        }));
    }

    /** Returns the primary key field names sorted by Sequence; falls back to `['ID']`. */
    private findPrimaryKeyFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pk = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence);
        return pk.length > 0 ? pk.map(f => f.Name) : ['ID'];
    }

    // ─── Record / watermark conversion ───────────────────────────────

    /** Converts a raw GraphQL row into the framework's ExternalRecord. */
    private toExternalRecord(
        raw: GraphQLRow,
        objectType: string,
        pkFieldNames: string[]
    ): ExternalRecord {
        const externalID = pkFieldNames
            .map(name => raw[name] != null ? String(raw[name]) : '')
            .join('|');
        return { ExternalID: externalID, ObjectType: objectType, Fields: raw };
    }

    /**
     * Computes the watermark to advance to after this batch. Returns the
     * greatest watermark-field value among the fetched rows (lexicographic
     * comparison works for ISO-8601 timestamps), falling back to the
     * previous value so we never regress.
     */
    private computeNewWatermark(
        rows: GraphQLRow[],
        watermarkField: string | null,
        previous: string | null
    ): string | null {
        if (!watermarkField || rows.length === 0) return previous;
        let max: string | null = previous;
        for (const row of rows) {
            const raw = row[watermarkField];
            if (raw == null) continue;
            const asString = raw instanceof Date ? raw.toISOString() : String(raw);
            if (max == null || asString > max) max = asString;
        }
        return max;
    }

    // ─── String helpers ──────────────────────────────────────────────

    /** Parses JSON safely — returns null on malformed input. */
    private safeParseJson(json: string | null | undefined): Record<string, unknown> | null {
        if (!json) return null;
        try {
            const parsed = JSON.parse(json);
            return (typeof parsed === 'object' && parsed != null) ? parsed as Record<string, unknown> : null;
        } catch {
            return null;
        }
    }

    /** Returns the first defined non-empty string value among the given keys. */
    private pickString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
        for (const key of keys) {
            const value = source[key];
            if (typeof value === 'string' && value.trim().length > 0) return value.trim();
        }
        return undefined;
    }

    /** Returns the first positive integer value found among the given keys. */
    private pickPositiveInt(source: Record<string, unknown>, ...keys: string[]): number | undefined {
        for (const key of keys) {
            const value = source[key];
            if (value == null) continue;
            const n = Number(value);
            if (!Number.isNaN(n) && Number.isFinite(n) && n > 0) return Math.floor(n);
        }
        return undefined;
    }

    /** Removes a trailing slash if present. */
    private stripTrailingSlash(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    /**
     * Strips an "MJ:" / "MJ_" prefix from a name so introspection sees the
     * underlying type name (e.g., "MJ_AIAgentRuns" -> "AIAgentRuns").
     */
    private stripMJPrefix(name: string): string {
        const trimmed = name.trim();
        if (/^MJ[_:]/.test(trimmed)) return trimmed.replace(/^MJ[_:]/, '');
        return trimmed;
    }

    /** Builds a lowercased Set from a string[] for case-insensitive containment checks. */
    private toLowerSet(values: string[]): Set<string> {
        return new Set(values.map(v => v.toLowerCase()));
    }

}

/** Tree-shaking prevention function — import and call from module entry point. */
export function LoadMJToMJConnector(): void { /* no-op */ }
