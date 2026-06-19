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
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type ExternalRecord,
    type FetchContext,
    type FetchBatchResult,
} from '@memberjunction/integration-engine';
import { z } from 'zod';

/**
 * Path LMS Reporting API connector (Blue Sky eLearn).
 *
 * TRANSPORT: GraphQL over HTTP. There is exactly ONE protocol base — {@link BaseRESTIntegrationConnector};
 * GraphQL rides on top of it. Every report query POSTs a GraphQL document to the single endpoint
 * `https://data-api.pathlms.com/graphql`; {@link NormalizeResponse} strips the `data.<queryName>`
 * envelope and surfaces `errors[]`.
 *
 * AUTH (two-step, no refresh token): {@link Authenticate} exchanges `{ applicationId, applicationSecret }`
 * (form-urlencoded) at `https://data-api.pathlms.com/api/v1/getToken` for a ~12h bearer JWT. The token +
 * expiry are cached per credential; on expiry OR a 401, the connector re-mints. applicationId/Secret come
 * from the linked Credential entity (or the CompanyIntegration.Configuration JSON) — NEVER baked in code.
 *
 * PAGINATION: offset/limit (`PaginationType=Offset`) on the report queries.
 *
 * PULL-ONLY: the SDL documents 0 mutations / 0 subscriptions, so SupportsCreate/Update/Delete stay false
 * (the base defaults) and no CRUD path is wired. No 501 stubs.
 *
 * INCREMENTAL: every IO here is `SupportsIncrementalSync=false` — the SDL's startDate/endDate args filter
 * by event date, NOT record-modification time, so there is no watermark to assert (provable-only). The
 * engine relies on content-hash idempotency + {@link StableOrderingKey} (the IO's stable `id`) for
 * keyset-style resume.
 *
 * DISCOVERY — CREDENTIAL-FREE, FROM THE PUBLIC SCHEMA (the T3-deadlock fix):
 * Path LMS publishes its complete GraphQL SDL credential-free as a SpectaQL HTML reference page at
 * `https://data-api.pathlms.com/`. That page is the **schema-of-record**. {@link DiscoverObjects} and
 * {@link DiscoverFields} FETCH + PARSE that public page WITH NO CREDENTIAL and enumerate the full standard
 * universe of GraphQL **record types** (84 = 93 SDL object types − 9 non-record types). This is what makes
 * the runtime credential-free `DocStructureSelfCheck` re-yield the same standard universe every time (so
 * persisted objects never read as "structure drift").
 *
 * A live credential is strictly **ADDITIVE**: when present, {@link DiscoverFields} also runs a standard
 * GraphQL introspection against `/graphql` and appends any tenant-specific fields the public SDL lacked
 * (the `Discovered` extension). It NEVER samples live data at build time and NEVER becomes the baseline —
 * the standard universe always comes from the public, token-free schema. The auth-gated live introspection
 * being available does NOT make the connector "case 2": the same schema is published credential-free, so
 * discovery is case 1 (public schema) + an additive case-2 tenant overlay. The catalog is NOT a module-level
 * constant — it is fetched + parsed from the public page at discovery time (only the small set of non-record
 * SDL types to *exclude* is a documented constant, NOT the catalog itself).
 */
@RegisterClass(BaseIntegrationConnector, 'PathLMSConnector')
export class PathLMSConnector extends BaseRESTIntegrationConnector {

    /** Per-process token cache, keyed by credential identity (applicationId). Survives across fetches. */
    private tokenCache = new Map<string, CachedToken>();

    /**
     * Per-process cache of the parsed PUBLIC SpectaQL schema (type-name → record type + fields). Populated
     * lazily, credential-free, from `https://data-api.pathlms.com/`. This is the standard-universe source of
     * record for discovery; it is fetched + parsed at runtime, never a baked array.
     */
    private publicSchemaCache: PublicSchema | null = null;
    private publicSchemaPromise: Promise<PublicSchema> | null = null;

    /**
     * Per-CompanyIntegration introspection cache of the live SDL's object types → their scalar/object field
     * shape. Lets the GraphQL selection-set builder emit a valid sub-selection for object-valued (`json`)
     * report fields like `attendees: [WebinarAttendee]!`, and feeds the ADDITIVE tenant-field overlay in
     * DiscoverFields. Populated lazily at runtime from the live introspection query — never a baked catalog.
     */
    private sdlTypeCache = new Map<string, SDLTypeMap>();

    // ─── Three-way invariant name ─────────────────────────────────────

    /** Verbatim ClassName / IntegrationName getter / MJ: Integrations.Name. */
    public override get IntegrationName(): string {
        return 'Path LMS';
    }

    // ─── Sync-efficiency hooks (override only on evidence) ────────────

    /**
     * KEYSET / no-watermark resume hint. None of the Path LMS report queries expose a record-modification
     * watermark, so every object resumes by its stable ordering key — the object's declared primary key
     * (the report's `id`). Resolved from the cached IOF PK. Returns null when no PK is declared (keyset
     * resume unavailable for the PK-less roll-up/aggregate report types).
     */
    public override StableOrderingKey(objectName: string): string | null {
        const obj = this.TryGetCachedObject(objectName);
        if (!obj) return null;
        const pk = this.GetCachedFields(obj.ID).find(f => f.IsPrimaryKey);
        return pk?.Name ?? null;
    }

    /**
     * Conservative rate-limit policy. Path LMS publishes no explicit per-app limit; a single GraphQL
     * endpoint behind Apollo tolerates modest sustained throughput. A low default keeps the connector
     * polite without a documented number to push to (provable-only — see PROVENANCE BatchRequestWaitTimeGap).
     */
    public override get RateLimitPolicy(): { TokensPerSec: number; Burst?: number } | null {
        return { TokensPerSec: 5, Burst: 10 };
    }

    // ─── Auth + transport (BaseRESTIntegrationConnector abstracts) ─────

    /**
     * Two-step token exchange. Resolves applicationId/applicationSecret from the credential, returns a
     * cached non-expired token when available, else POSTs form-urlencoded credentials to /api/v1/getToken
     * and caches the resulting bearer (stripping any leading "Bearer ") with a 12h expiry (minus a skew
     * buffer). No refresh token exists — re-mint is just another exchange.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<PathLMSAuthContext> {
        const creds = await this.LoadCredentials(companyIntegration, contextUser);
        const token = await this.GetOrMintToken(creds);
        return { Token: token, Credentials: creds, BaseURL: creds.BaseURL };
    }

    /**
     * Builds an auth context from a directly-supplied/pre-configured bearer token WITHOUT a live token
     * exchange. The transport-smoke gate (T7b) configures a dummy token and asserts the connector injects
     * `Authorization: Bearer <token>` on the request — it must NOT require a successful /api/v1/getToken
     * round-trip before a header is present. Whenever a credential/Configuration carries a direct bearer
     * token (alias `Token`/`accessToken`/`bearerToken`/`apiKey`), {@link LoadCredentials} surfaces it as
     * `PreconfiguredToken` and {@link GetOrMintToken} returns it verbatim, so {@link BuildHeaders} sets the
     * header off the configured token state with no network call.
     */

    /** Bearer header on every GraphQL request, plus JSON content negotiation. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token ?? ''}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
    }

    /** The single GraphQL endpoint. APIPath on every IO is `/graphql`, so the base URL is the host root. */
    protected GetBaseURL(companyIntegration: MJCompanyIntegrationEntity, _auth: RESTAuthContext): string {
        const override = companyIntegration.Configuration
            ? this.ParseCredentialJson(companyIntegration.Configuration)?.BaseURL
            : undefined;
        return this.HostFor(override);
    }

    /**
     * Resolves the API host root: an optional `Configuration.BaseURL`/`GraphQLEndpoint` override (a
     * self-hosted/sandbox Path LMS instance, or an e2e mock origin) else the canonical {@link PATHLMS_HOST}.
     * A full `…/graphql` URL is tolerated and reduced to the host root (the connector appends the paths).
     */
    private HostFor(override?: string): string {
        const o = override?.trim();
        if (!o) return PATHLMS_HOST;
        return o.replace(/\/graphql\/?$/i, '').replace(/\/+$/, '');
    }

    /**
     * Executes an HTTP request via fetch. For GraphQL all requests are POSTs carrying a JSON
     * `{ query, variables }` body. Parses the JSON body; returns the raw text on a non-JSON response.
     */
    protected async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const init: RequestInit = { method, headers };
        if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        const response = await fetch(url, init);
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value; });
        const text = await response.text();
        let parsed: unknown = text;
        if (text.length > 0) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        return { Status: response.status, Body: parsed, Headers: responseHeaders };
    }

    /**
     * Strips the GraphQL envelope: `{ data: { <responseDataKey>: <records> } }` → records, normalizing a
     * single object to a one-element array. GraphQL errors are surfaced as a thrown error so the engine
     * records the failure (rather than silently treating `data: null` as zero records). When `data` is
     * present alongside `errors` (partial success), the data is returned and the error is left to the
     * caller's HTTP-status handling.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (!isRecord(rawBody)) return [];
        const data = rawBody['data'];
        const errors = rawBody['errors'];

        // A GraphQL error with no usable data is a failure — surface it loudly, don't swallow it as empty.
        if ((data == null) && Array.isArray(errors) && errors.length > 0) {
            throw new Error(`Path LMS GraphQL error: ${formatGraphQLErrors(errors)}`);
        }
        if (!isRecord(data)) return [];

        const key = responseDataKey ?? '';
        const payload = key.length > 0 ? data[key] : firstValue(data);
        if (Array.isArray(payload)) return payload.filter(isRecord);
        if (isRecord(payload)) return [payload];
        return [];
    }

    /**
     * Offset/limit pagination. Path LMS report queries return a flat list with no total-count or
     * has-next signal, so "more pages remain" is inferred from a full page: when the page returned
     * exactly `pageSize` records, there may be more (advance the offset); a short/empty page is the end.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType !== 'Offset') return { HasMore: false };
        const records = this.NormalizeResponseSafe(rawBody);
        const pageFull = pageSize > 0 && records.length >= pageSize;
        return {
            HasMore: pageFull,
            NextOffset: currentOffset + records.length,
        };
    }

    // ─── TestConnection ───────────────────────────────────────────────

    /**
     * Verifies credentials by minting a token then issuing the cheapest GraphQL query the SDL documents
     * (`teamsList { id }`). A 401/GraphQL auth error means bad credentials; a 2xx with a `data` envelope
     * confirms both the token exchange and live GraphQL access.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const response = await this.PostGraphQL(auth, 'query { teamsList { id } }', {});
            if (response.Status === 401) {
                return { Success: false, Message: 'Path LMS authentication failed (HTTP 401) — token rejected by /graphql.' };
            }
            if (response.Status < 200 || response.Status >= 300) {
                return { Success: false, Message: `Path LMS /graphql returned HTTP ${response.Status}.` };
            }
            if (isRecord(response.Body) && Array.isArray(response.Body['errors']) && response.Body['data'] == null) {
                return { Success: false, Message: `Path LMS GraphQL error: ${formatGraphQLErrors(response.Body['errors'])}` };
            }
            return { Success: true, Message: 'Successfully connected to Path LMS Reporting API.', ServerVersion: 'Path LMS GraphQL Reporting API' };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Path LMS connection error: ${message}` };
        }
    }

    // ─── Discovery (PUBLIC SpectaQL schema — credential-free baseline) ─

    /**
     * Enumerates the FULL STANDARD UNIVERSE of record types CREDENTIAL-FREE by fetching + parsing the
     * public SpectaQL schema page at `https://data-api.pathlms.com/` — NOT a baked array and NOT dependent
     * on any token or on the seeded metadata cache. This is the T3-deadlock fix: because the standard
     * universe is sourced from the public schema (which always resolves without a credential), the runtime
     * credential-free `DocStructureSelfCheck` re-yields the same universe and persisted objects never read
     * as structure drift.
     *
     * The seeded Declared metadata cache is consulted only to ATTACH the persisted IntegrationObject `ID`
     * to each discovered object (a join, not the source of the object set). A live credential is NOT used
     * here at all — standard objects are token-free by construction.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const schema = await this.GetPublicSchema();
        const cachedByName = this.CachedObjectsByName(companyIntegration.IntegrationID);

        return schema.RecordTypes.map(rt => {
            const cached = cachedByName.get(rt.Name.toLowerCase());
            return {
                ID: cached?.ID,
                Name: rt.Name,
                Label: cached?.DisplayName ?? rt.Name,
                Description: cached?.Description ?? rt.Description ?? undefined,
                // Pull-only reporting surface: no record-modification watermark in the SDL, no mutations.
                SupportsIncrementalSync: cached?.SupportsIncrementalSync ?? false,
                SupportsWrite: cached?.SupportsWrite ?? false,
            };
        });
    }

    /**
     * Returns the fields for an object as the FULL STANDARD set parsed CREDENTIAL-FREE from the public
     * SpectaQL schema (the baseline), enriched by the seeded Declared metadata (PK/FK/type curation) where
     * it exists, then — only when a live credential is present — ADDITIVELY augmented with any tenant-
     * specific fields the live introspection exposes that the public SDL lacked (the `Discovered` overlay).
     *
     * The public-schema field set is the baseline that always resolves token-free. The Declared overlay
     * never replaces it; the live overlay only appends. Introspection failures degrade gracefully to the
     * public + Declared fields. NEVER samples live data; NEVER hardcodes the field catalog.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const schema = await this.GetPublicSchema();
        const recordType = schema.RecordTypesByName.get(objectName.toLowerCase());

        // Baseline = the public-schema field set (credential-free). If the object isn't in the public
        // schema (a tenant custom object), fall back to the Declared cache as the baseline.
        const ownerHasIdField = recordType ? recordType.Fields.some(f => f.Name === 'id') : false;
        const baseline = recordType
            ? recordType.Fields.map(f => this.PublicFieldToSchema(f, recordType.Name, schema, ownerHasIdField))
            : this.DeclaredFields(companyIntegration.IntegrationID, objectName);

        const merged = this.MergeDeclaredOverlay(baseline, companyIntegration.IntegrationID, objectName);

        // Additive tenant overlay: only with a live credential, and never as the baseline.
        if (!companyIntegration.CredentialID && !companyIntegration.Configuration) return merged;
        return this.AppendLiveFields(merged, companyIntegration, objectName, contextUser, recordType);
    }

    /**
     * Appends any live-introspection fields the public schema lacked (tenant `Discovered` overlay). The
     * public + Declared fields are the floor; the live introspection only ADDS. Degrades to the merged
     * baseline on any introspection failure.
     */
    private async AppendLiveFields(
        baseline: ExternalFieldSchema[],
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo,
        recordType: PublicRecordType | undefined
    ): Promise<ExternalFieldSchema[]> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const typeMap = await this.GetSDLTypeMap(companyIntegration, auth);
            const sdlType = recordType ? typeMap[recordType.Name] : typeMap[objectName];
            if (!sdlType) return baseline;

            const known = new Set(baseline.map(d => d.Name.toLowerCase()));
            for (const sf of sdlType.Fields) {
                if (known.has(sf.Name.toLowerCase())) continue;
                baseline.push({
                    Name: sf.Name,
                    Label: sf.Name,
                    DataType: this.SDLTypeToDataType(sf),
                    IsRequired: sf.NonNull,
                    IsUniqueKey: false,
                    IsReadOnly: true, // pull-only reporting surface — every field is read-only
                });
            }
            return baseline;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[Path LMS] live SDL augmentation for "${objectName}" failed (${msg}); using public + Declared fields.`);
            return baseline;
        }
    }

    // ─── FetchChanges (GraphQL query built from IO/IOF metadata) ───────

    /**
     * Fetches records by POSTing a GraphQL document built from the IO's metadata:
     *  - operation name + return type + arguments from the IO's per-object Configuration JSON,
     *  - the selection set from the IOF field names (scalar fields selected directly; object-valued
     *    `json` fields given a one-level sub-selection resolved from the live SDL type map),
     *  - offset/limit appended for Offset-paginated queries.
     *
     * Full-record pass-through: every record's COMPLETE GraphQL node lands in `ExternalRecord.Fields` so
     * the framework's custom-column capture sees every key. Identity is the IOF-declared PK; the base
     * content-hash fallback handles PK-less / object-container objects.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const ioConfig = this.ParseIOConfiguration(obj);

        // No derivable fetch route (AccessPath.Door = null) — skip BEFORE any network call, surface a warning.
        if (ioConfig.Unresolved) {
            return {
                Records: [],
                HasMore: false,
                Warnings: [{ Code: 'NO_ACCESS_PATH', Message: `Path LMS: "${ctx.ObjectName}" has no derivable access path (nested polymorphic type) — not synced as a top-level object.`, Data: { ObjectName: ctx.ObjectName } }],
            };
        }

        const typeMap = await this.GetSDLTypeMapSafe(ctx.CompanyIntegration, auth);
        const selectionSet = this.BuildSelectionSet(ioConfig, fields, typeMap);

        const paginated = obj.SupportsPagination && obj.PaginationType === 'Offset';
        const pageSize = this.ResolvePageSize(ctx, obj);
        let offset = ctx.CurrentOffset ?? 0;
        const batchLimit = ctx.BatchSize && ctx.BatchSize > 0 ? ctx.BatchSize : Number.MAX_SAFE_INTEGER;

        const records: ExternalRecord[] = [];
        const pkFieldNames = this.FindPKFieldNames(fields);
        let hasMore = false;

        // Nested record type (tables ≠ doors): query the door, descend the access path to the leaf records.
        if (ioConfig.Segments.length > 0) {
            return this.FetchViaAccessPath(ctx, obj, ioConfig, selectionSet, auth, pkFieldNames);
        }

        for (;;) {
            const { query, variables } = this.BuildQueryDocument(ioConfig, selectionSet, paginated ? { offset, limit: pageSize } : null);
            const response = await this.PostGraphQL(auth, query, variables);
            this.AssertGraphQLOK(response, obj.Name);

            const page = this.NormalizeResponse(response.Body, obj.ResponseDataKey ?? ioConfig.GraphQLQueryName);
            for (const raw of page) {
                records.push({
                    ExternalID: this.BuildRecordIdentity(raw, pkFieldNames),
                    ObjectType: ctx.ObjectName,
                    Fields: raw, // full-record pass-through — the complete GraphQL node
                });
            }

            if (!paginated) break;
            const pageFull = page.length >= pageSize && page.length > 0;
            offset += page.length;
            if (!pageFull) { hasMore = false; break; }
            if (records.length >= batchLimit) { hasMore = true; break; }
        }

        const result: FetchBatchResult = { Records: records, HasMore: hasMore };
        if (paginated && hasMore) {
            result.NextOffset = offset;
        }
        return result;
    }

    /**
     * Fetches a NESTED record type by querying its entry "door" and descending the access-path field
     * chain to the leaf record collection (tables ≠ doors). One GraphQL request selects down the path;
     * the response is then walked the same path to flatten out every leaf record. Each leaf carries its
     * FULL node in `Fields` (custom-column pass-through). Reporting doors return the whole set (no
     * offset/limit on the nested path), so HasMore is false.
     */
    private async FetchViaAccessPath(
        ctx: FetchContext,
        obj: MJIntegrationObjectEntity,
        ioConfig: IOConfig,
        leafSelection: string,
        auth: PathLMSAuthContext,
        pkFieldNames: string[]
    ): Promise<FetchBatchResult> {
        const query = this.BuildNestedQuery(ioConfig.GraphQLQueryName, ioConfig.Segments, leafSelection);
        const response = await this.PostGraphQL(auth, query, {});
        this.AssertGraphQLOK(response, obj.Name);

        const dataRoot = isRecord(response.Body) ? response.Body['data'] : null;
        const leaves = this.DescendAccessPath(dataRoot, ioConfig.GraphQLQueryName, ioConfig.Segments);
        const records: ExternalRecord[] = leaves.map(raw => ({
            ExternalID: this.BuildRecordIdentity(raw, pkFieldNames),
            ObjectType: ctx.ObjectName,
            Fields: raw, // full-record pass-through — the complete GraphQL node
        }));
        return { Records: records, HasMore: false };
    }

    /** Wraps the leaf selection in the door + nested field chain: `door { seg1 { seg2 { leaf } } }`. */
    private BuildNestedQuery(door: string, segments: string[], leafSelection: string): string {
        let inner = leafSelection;
        for (let i = segments.length - 1; i >= 0; i--) {
            inner = `${segments[i]} { ${inner} }`;
        }
        return `query PathLMS_${door} { ${door} { ${inner} } }`;
    }

    /**
     * Walks a GraphQL response down the access path (`data[door]` → each segment), flattening arrays and
     * single objects at every hop, to yield the flat list of leaf records. Robust to a door/segment that
     * resolves to either an object or an array.
     */
    private DescendAccessPath(dataRoot: unknown, door: string, segments: string[]): Record<string, unknown>[] {
        if (!isRecord(dataRoot)) return [];
        let level = toRecordArray(dataRoot[door]);
        for (const seg of segments) {
            const next: Record<string, unknown>[] = [];
            for (const item of level) next.push(...toRecordArray(item[seg]));
            level = next;
        }
        return level;
    }

    // ─── Public SpectaQL schema fetch + parse (credential-free) ────────

    /** Returns the cached public schema, fetching + parsing it once per process (credential-free). */
    private async GetPublicSchema(): Promise<PublicSchema> {
        if (this.publicSchemaCache) return this.publicSchemaCache;
        if (!this.publicSchemaPromise) {
            this.publicSchemaPromise = this.FetchAndParsePublicSchema()
                .then(schema => { this.publicSchemaCache = schema; return schema; })
                .catch(err => { this.publicSchemaPromise = null; throw err; });
        }
        return this.publicSchemaPromise;
    }

    /**
     * Fetches the public SpectaQL HTML (no credential) and parses its `definition-object` blocks into
     * record types + fields. This is the standard-universe source of record. Allows a subclass / test to
     * override {@link FetchPublicSchemaHTML} to supply a fixture without a network call.
     */
    private async FetchAndParsePublicSchema(): Promise<PublicSchema> {
        const html = await this.FetchPublicSchemaHTML();
        return parseSpectaQLSchema(html);
    }

    /**
     * Fetches the raw public SpectaQL schema HTML from `https://data-api.pathlms.com/` with NO auth header.
     * Overridable seam (tests inject a fixture). Throws on a non-2xx response so discovery surfaces a real
     * fetch failure rather than silently returning zero objects.
     */
    protected async FetchPublicSchemaHTML(): Promise<string> {
        const response = await fetch(PUBLIC_SCHEMA_URL, { method: 'GET', headers: { 'Accept': 'text/html' } });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Path LMS public schema fetch failed: HTTP ${response.status} from ${PUBLIC_SCHEMA_URL}`);
        }
        return response.text();
    }

    // ─── GraphQL document construction ─────────────────────────────────

    /**
     * Builds the selection set string for the query's return type. Scalar IOF fields are selected
     * directly; object-valued (`json`) IOF fields receive a one-level sub-selection of their SDL type's
     * SCALAR fields when the live type map resolves the field's type. When the type can't be resolved
     * (no introspection / open JSON scalar), the field is selected as a leaf — correct for true scalars,
     * and harmless for unresolved fields (the query simply omits an unresolvable object field rather than
     * sending an invalid leaf selection on a known object type).
     */
    private BuildSelectionSet(
        ioConfig: IOConfig,
        fields: MJIntegrationObjectFieldEntity[],
        typeMap: SDLTypeMap
    ): string {
        const returnTypeName = stripTypeWrappers(ioConfig.ReturnType);
        const sdlType = typeMap[returnTypeName];
        const parts: string[] = [];

        for (const f of fields) {
            const sdlField = sdlType?.Fields.find(sf => sf.Name === f.Name);
            const objectTypeName = sdlField ? this.ObjectFieldTypeName(sdlField, typeMap) : null;
            if (objectTypeName && typeMap[objectTypeName]) {
                const sub = this.BuildScalarSubSelection(typeMap[objectTypeName], typeMap);
                if (sub.length > 0) {
                    parts.push(`${f.Name} { ${sub} }`);
                    continue;
                }
                // Object field whose type has no scalar leaves we can resolve — skip rather than emit invalid.
                continue;
            }
            // Scalar field (or unresolved type without SDL info) — select as a leaf.
            if (!sdlField || !this.IsObjectField(sdlField, typeMap)) {
                parts.push(f.Name);
            }
        }

        // Always guarantee a non-empty selection — fall back to the PK or `id` so the query is valid.
        if (parts.length === 0) {
            const pk = fields.find(f => f.IsPrimaryKey)?.Name ?? 'id';
            parts.push(pk);
        }
        return parts.join(' ');
    }

    /** Builds a one-level scalar sub-selection for an object type (no nested object recursion). */
    private BuildScalarSubSelection(type: SDLType, typeMap: SDLTypeMap): string {
        const scalars = type.Fields.filter(sf => !this.IsObjectField(sf, typeMap)).map(sf => sf.Name);
        return scalars.join(' ');
    }

    /**
     * Assembles the full GraphQL query document and its variables. Operation arguments come from the IO's
     * Configuration `OperationArguments` (e.g. `["limit:Int","offset:Int","teamIds:[Int!]"]`). Only the
     * pagination args (offset/limit) are bound at fetch time when paginating; all other documented filter
     * args are declared as optional variables left unset (the source returns the unfiltered report).
     */
    private BuildQueryDocument(
        ioConfig: IOConfig,
        selectionSet: string,
        page: { offset: number; limit: number } | null
    ): { query: string; variables: Record<string, unknown> } {
        const argSpecs = ioConfig.OperationArguments.map(parseArgSpec).filter((a): a is ArgSpec => a != null);
        const variables: Record<string, unknown> = {};
        const varDecls: string[] = [];
        const callArgs: string[] = [];

        for (const arg of argSpecs) {
            const isPaginationArg = arg.Name === 'offset' || arg.Name === 'limit';
            if (page && isPaginationArg) {
                varDecls.push(`$${arg.Name}: ${arg.Type}`);
                callArgs.push(`${arg.Name}: $${arg.Name}`);
                variables[arg.Name] = arg.Name === 'offset' ? page.offset : page.limit;
            }
            // Non-pagination filter args are intentionally not bound — full unfiltered report pull.
        }

        const opName = ioConfig.GraphQLQueryName;
        const decl = varDecls.length > 0 ? `(${varDecls.join(', ')})` : '';
        const call = callArgs.length > 0 ? `(${callArgs.join(', ')})` : '';
        const query = `query PathLMS_${opName}${decl} { ${opName}${call} { ${selectionSet} } }`;
        return { query, variables };
    }

    // ─── Live SDL introspection (the tenant-overlay MECHANISM) ─────────

    /** Returns the cached/freshly-introspected SDL type map; throws on hard introspection failure. */
    private async GetSDLTypeMap(
        companyIntegration: MJCompanyIntegrationEntity,
        auth: PathLMSAuthContext
    ): Promise<SDLTypeMap> {
        const key = companyIntegration.ID ?? auth.Credentials.applicationId ?? auth.Credentials.PreconfiguredToken ?? '';
        const cached = this.sdlTypeCache.get(key);
        if (cached) return cached;
        const response = await this.PostGraphQL(auth, INTROSPECTION_QUERY, {});
        this.AssertGraphQLOK(response, '__schema introspection');
        const typeMap = this.ParseIntrospection(response.Body);
        this.sdlTypeCache.set(key, typeMap);
        return typeMap;
    }

    /** Best-effort SDL type map — returns an empty map (no augmentation) on any introspection failure. */
    private async GetSDLTypeMapSafe(
        companyIntegration: MJCompanyIntegrationEntity,
        auth: PathLMSAuthContext
    ): Promise<SDLTypeMap> {
        try {
            return await this.GetSDLTypeMap(companyIntegration, auth);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[Path LMS] SDL introspection unavailable (${msg}); building selection sets from Declared fields only.`);
            return {};
        }
    }

    /** Parses a GraphQL `__schema.types` introspection response into a name→SDLType map (OBJECT types only). */
    private ParseIntrospection(body: unknown): SDLTypeMap {
        const result = IntrospectionResponseSchema.safeParse(body);
        if (!result.success) return {};
        const types = result.data.data.__schema.types;
        const map: SDLTypeMap = {};
        for (const t of types) {
            if (t.kind !== 'OBJECT' || !t.name || t.name.startsWith('__')) continue;
            const fields: SDLField[] = (t.fields ?? []).map(f => ({
                Name: f.name,
                ...flattenIntrospectionType(f.type),
            }));
            map[t.name] = { Name: t.name, Fields: fields };
        }
        return map;
    }

    /** True when a field's underlying named type is an OBJECT type present in the map (needs sub-selection). */
    private IsObjectField(field: SDLField, typeMap: SDLTypeMap): boolean {
        return typeMap[field.NamedType] != null;
    }

    /** Returns the field's underlying OBJECT type name when it is an object (else null). */
    private ObjectFieldTypeName(field: SDLField, typeMap: SDLTypeMap): string | null {
        return typeMap[field.NamedType] ? field.NamedType : null;
    }

    /** Maps an SDL field's underlying type into the connector's coarse DataType vocabulary. */
    private SDLTypeToDataType(field: SDLField): string {
        if (this.IsListOrObjectScalar(field)) return 'json';
        switch (field.NamedType) {
            case 'Int': return 'Int';
            case 'Float': return 'Float';
            case 'Boolean': return 'Boolean';
            case 'Date':
            case 'DateTime': return 'Date';
            default: return 'String';
        }
    }

    private IsListOrObjectScalar(field: SDLField): boolean {
        return field.IsList || field.NamedType === 'JSON';
    }

    // ─── GraphQL request helper ────────────────────────────────────────

    /** POSTs a `{ query, variables }` document to the GraphQL endpoint with auth headers. */
    private async PostGraphQL(
        auth: PathLMSAuthContext,
        query: string,
        variables: Record<string, unknown>
    ): Promise<RESTResponse> {
        const url = `${this.HostFor(auth.BaseURL)}${GRAPHQL_PATH}`;
        return this.MakeHTTPRequest(auth, url, 'POST', this.BuildHeaders(auth), { query, variables });
    }

    /** Throws on a non-2xx HTTP status or a GraphQL error with no usable data. */
    private AssertGraphQLOK(response: RESTResponse, context: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Path LMS GraphQL request for "${context}" failed: HTTP ${response.Status}`);
        }
        if (isRecord(response.Body)) {
            const errors = response.Body['errors'];
            if (Array.isArray(errors) && errors.length > 0 && response.Body['data'] == null) {
                throw new Error(`Path LMS GraphQL error for "${context}": ${formatGraphQLErrors(errors)}`);
            }
        }
    }

    // ─── Token minting + caching ───────────────────────────────────────

    /**
     * Resolves the bearer token for these credentials. Precedence:
     *  1. A directly-supplied/pre-configured bearer token (`PreconfiguredToken`) is returned verbatim with
     *     NO network exchange — this is the path the transport-smoke gate (T7b) exercises with a dummy token,
     *     and the path a broker uses when it injects a ready bearer rather than appId/secret.
     *  2. Else a cached, non-expired minted token.
     *  3. Else mint a fresh token via the two-step /api/v1/getToken exchange and cache it (12h, minus skew).
     */
    private async GetOrMintToken(creds: PathLMSCredentials): Promise<string> {
        if (creds.PreconfiguredToken && creds.PreconfiguredToken.trim().length > 0) {
            return creds.PreconfiguredToken.replace(/^Bearer\s+/i, '').trim();
        }
        const cacheKey = creds.applicationId ?? '';
        const cached = this.tokenCache.get(cacheKey);
        if (cached && cached.ExpiresAt > Date.now() + TOKEN_EXPIRY_SKEW_MS) {
            return cached.Token;
        }
        const token = await this.MintToken(creds);
        this.tokenCache.set(cacheKey, {
            Token: token,
            ExpiresAt: Date.now() + TOKEN_LIFETIME_MS,
        });
        return token;
    }

    /**
     * Exchanges applicationId/applicationSecret for a bearer token via a form-urlencoded POST to
     * /api/v1/getToken. The response carries `{ token: "Bearer <jwt>" }`; the leading "Bearer " is
     * stripped so BuildHeaders applies a single prefix.
     */
    private async MintToken(creds: PathLMSCredentials): Promise<string> {
        if (!creds.applicationId || !creds.applicationSecret) {
            throw new Error('Path LMS: applicationId + applicationSecret are required to mint a token (no pre-configured token supplied).');
        }
        const url = `${this.HostFor(creds.BaseURL)}${TOKEN_PATH}`;
        const form = new URLSearchParams();
        form.set('applicationId', creds.applicationId);
        form.set('applicationSecret', creds.applicationSecret);
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: form.toString(),
        });
        const text = await response.text();
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Path LMS token exchange failed: HTTP ${response.status}`);
        }
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* leave as text */ }
        return this.ExtractToken(parsed);
    }

    /** Reads the token from the getToken response and strips any leading "Bearer " prefix. */
    private ExtractToken(body: unknown): string {
        let raw: string | undefined;
        if (typeof body === 'string') {
            raw = body;
        } else if (isRecord(body)) {
            const candidate = body['token'] ?? body['accessToken'] ?? body['access_token'];
            if (typeof candidate === 'string') raw = candidate;
        }
        if (!raw || raw.trim().length === 0) {
            throw new Error('Path LMS token exchange succeeded but the response contained no token.');
        }
        return raw.replace(/^Bearer\s+/i, '').trim();
    }

    // ─── Credential resolution ─────────────────────────────────────────

    /**
     * Resolves applicationId/applicationSecret from the linked Credential entity, falling back to the
     * CompanyIntegration.Configuration JSON. Credentials are issued by Blue Sky eLearn and are NEVER
     * hardcoded in connector code.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<PathLMSCredentials> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (fromCred) return fromCred;
        }
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const fromConfig = this.ParseCredentialJson(configJson);
            if (fromConfig) return fromConfig;
        }
        throw new Error('Path LMS: no credential or Configuration JSON found — applicationId + applicationSecret are required.');
    }

    /** Loads credentials from a Credential entity's Values JSON. */
    private async LoadFromCredentialEntity(credentialID: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<PathLMSCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    /**
     * Parses a JSON string into credentials (tolerant of casing aliases). Accepts EITHER a pre-minted bearer
     * token (`Token`/`accessToken`/`bearerToken`/`apiKey` — the exchange-free path the transport-smoke gate
     * uses) OR an applicationId + applicationSecret pair for the two-step exchange. Returns null only when
     * neither a usable token nor a full appId+secret pair is present.
     */
    private ParseCredentialJson(json: string): PathLMSCredentials | null {
        try {
            const result = PathLMSCredentialSchema.safeParse(JSON.parse(json));
            if (!result.success) return null;
            const p = result.data;
            const preconfiguredToken = p.Token ?? p.token ?? p.accessToken ?? p.access_token ?? p.bearerToken ?? p.apiKey ?? p.APIKey;
            const appId = p.applicationId ?? p.ApplicationID ?? p.clientId ?? p.ClientID;
            const appSecret = p.applicationSecret ?? p.ApplicationSecret ?? p.clientSecret ?? p.ClientSecret;
            const hasToken = typeof preconfiguredToken === 'string' && preconfiguredToken.trim().length > 0;
            const hasExchangePair = !!appId && !!appSecret;
            if (!hasToken && !hasExchangePair) return null;
            const baseOverride = p.BaseURL ?? p.baseUrl ?? p.GraphQLEndpoint;
            return {
                applicationId: appId,
                applicationSecret: appSecret,
                PreconfiguredToken: hasToken ? preconfiguredToken : undefined,
                BaseURL: typeof baseOverride === 'string' && baseOverride.trim().length > 0 ? baseOverride : undefined,
            };
        } catch {
            return null;
        }
    }

    // ─── Cached-metadata helpers ───────────────────────────────────────

    /** Gets an IO from the cache without throwing (used by StableOrderingKey, which may be called early). */
    private TryGetCachedObject(objectName: string): MJIntegrationObjectEntity | null {
        try {
            const integ = IntegrationEngineBase.Instance.GetIntegrationByName(this.IntegrationName);
            if (!integ) return null;
            return IntegrationEngineBase.Instance.GetIntegrationObject(integ.ID, objectName) ?? null;
        } catch {
            return null;
        }
    }

    /** Returns the seeded Declared IO rows for this integration keyed by lower-cased name (safe on empty cache). */
    private CachedObjectsByName(integrationID: string): Map<string, MJIntegrationObjectEntity> {
        const map = new Map<string, MJIntegrationObjectEntity>();
        try {
            const objects = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID);
            for (const obj of objects) map.set(obj.Name.toLowerCase(), obj);
        } catch {
            /* cache not available in this context — public schema carries the universe regardless */
        }
        return map;
    }

    /** Returns the seeded Declared fields for an object as ExternalFieldSchema (empty when not cached). */
    private DeclaredFields(integrationID: string, objectName: string): ExternalFieldSchema[] {
        try {
            const obj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, objectName);
            if (!obj) return [];
            return this.GetCachedFields(obj.ID).map(f => this.DeclaredFieldToSchema(f));
        } catch {
            return [];
        }
    }

    /**
     * Overlays the seeded Declared field curation (PK / FK target / type / required) onto the public-schema
     * baseline, by field name. Declared wins for the curated structural attributes where it has an opinion;
     * the public-schema baseline supplies everything else and guarantees the full field set even when no
     * Declared row exists. Never drops a public field; only enriches.
     */
    private MergeDeclaredOverlay(
        baseline: ExternalFieldSchema[],
        integrationID: string,
        objectName: string
    ): ExternalFieldSchema[] {
        const declared = this.DeclaredFields(integrationID, objectName);
        if (declared.length === 0) return baseline;
        const declaredByName = new Map(declared.map(d => [d.Name.toLowerCase(), d]));

        const merged = baseline.map(b => {
            const d = declaredByName.get(b.Name.toLowerCase());
            if (!d) return b;
            return {
                ...b,
                Label: d.Label || b.Label,
                Description: d.Description ?? b.Description,
                DataType: d.DataType || b.DataType,
                IsRequired: d.IsRequired,
                IsPrimaryKey: d.IsPrimaryKey ?? b.IsPrimaryKey,
                IsUniqueKey: d.IsUniqueKey || b.IsUniqueKey,
                IsForeignKey: d.IsForeignKey ?? b.IsForeignKey,
                ForeignKeyTarget: d.ForeignKeyTarget ?? b.ForeignKeyTarget,
            };
        });

        // Declared fields the public schema didn't carry (rare) — append so nothing is lost.
        const baselineNames = new Set(baseline.map(b => b.Name.toLowerCase()));
        for (const d of declared) {
            if (!baselineNames.has(d.Name.toLowerCase())) merged.push(d);
        }
        return merged;
    }

    /**
     * Maps a parsed public-schema record field into the ExternalFieldSchema baseline shape — applying the
     * EXACT id-PK / typed-reference-FK rules the persisted metadata was built from, so the connector's
     * credential-free discovery reproduces the persisted PK/FK set and T3 `DocStructureSelfCheck` cannot
     * drift. This is run with zero credential and uses ONLY the parsed public SDL universe ({@param schema}).
     *
     * PK: the row's own `id` field is the sole primary key. An id-less type has NO PK (the engine's
     * content-hash carries identity). A `*Id` reference is NEVER a PK — it is a foreign key (below).
     *
     * FK (two cases, mirroring `parse-sdl-fk.mjs` + the id-less `*Id` demotion path):
     *   (1) TYPED REFERENCE — the field's unwrapped SDL type resolves to ANOTHER emitted record type
     *       (e.g. `groups: [Group]` → Group, `assessmentsReport: [Assessment]!` → Assessment).
     *   (2) SCALAR `<Type>Id` — a scalar field named `<emittedType>Id` (case-insensitive, e.g. userId→User,
     *       courseId→Course, webinarId→Webinar) where the capitalized stem matches another emitted record
     *       type. (No self-alias exclusion: the metadata marks even `userId`-same-as-id as an FK→User on the
     *       id-less report rows, so discovery must too.)
     * Both cases exclude a self-reference to the field's own owning type.
     */
    private PublicFieldToSchema(f: PublicField, ownTypeName: string, schema: PublicSchema, ownerHasIdField: boolean): ExternalFieldSchema {
        const isPK = f.Name === 'id';
        const fkTarget = isPK ? null : this.ResolveFKTarget(f, ownTypeName, schema, ownerHasIdField);
        return {
            Name: f.Name,
            Label: f.Name,
            Description: f.Description ?? undefined,
            DataType: sdlTypeToDataType(f.TargetType, f.IsList),
            // The reporting surface declares non-null with `!`; treat `!` as required-at-read (read-only).
            IsRequired: f.NonNull,
            IsPrimaryKey: isPK,
            IsUniqueKey: isPK,
            IsReadOnly: true, // pull-only reporting surface — every field is read-only
            IsForeignKey: fkTarget != null,
            ForeignKeyTarget: fkTarget,
        };
    }

    /**
     * Resolves a field's foreign-key target to another emitted record type, or null when the field is not
     * a reference. Mirrors EXACTLY the rules `scripts/parse-sdl-fk.mjs` used to author the persisted metadata,
     * so the connector's credential-free FK derivation reproduces it (T3 `DocStructureSelfCheck` cannot drift):
     *
     *   (1) TYPED REFERENCE — the SDL anchor target is itself an emitted record type (e.g. `groups: [Group]`
     *       → Group). Always an FK; no contradiction exclusion.
     *   (2) SCALAR `<Type>Id` — the field name (sans trailing `Id`, capitalized) matches an emitted record
     *       type and the field's underlying type is a scalar (e.g. userId→User, courseId→Course, webinarId→
     *       Webinar). This IS an FK, with ONE exclusion: when the owning type has its own `id` primary key
     *       AND the field's prose marks it a self-alias of that id ("the userId field is the same as id…",
     *       "alias of id", "for cross referencing"), it is a renamed view of the row's own identity, not a
     *       reference to another row — the persisted metadata leaves those non-FK (e.g. `Order.userId`).
     *       On an id-LESS report row (`CategorySale.userId`, `InPersonEventUser.userId`, …) the `<Type>Id`
     *       IS the only identity/reference, so the self-alias exclusion does NOT apply and the FK is kept —
     *       exactly as the metadata records it.
     *
     * Returns the CANONICAL record-type name (so the FK target matches the persisted
     * `@lookup:…Name=<Type>` exactly). Never resolves to the field's own owning type.
     */
    private ResolveFKTarget(f: PublicField, ownTypeName: string, schema: PublicSchema, ownerHasIdField: boolean): string | null {
        const target = f.TargetType;
        if (!target) return null;

        // (1) Typed reference — the anchor is a non-scalar emitted record type.
        if (!GRAPHQL_SCALARS.has(target)) {
            const canonical = schema.RecordTypesByName.get(target.toLowerCase());
            if (canonical && canonical.Name !== ownTypeName) return canonical.Name;
            return null;
        }

        // (2) Scalar `<Type>Id` — the capitalized stem matches an emitted record type.
        if (f.Name.length > 2 && f.Name.toLowerCase() !== 'id' && /Id$/.test(f.Name)) {
            const stem = f.Name.slice(0, -2);
            const candidate = schema.RecordTypesByName.get(stem.toLowerCase());
            if (!candidate || candidate.Name === ownTypeName) return null;
            // Self-alias contradiction (only on types that own an `id`): the `*Id` renames this row's own
            // identity rather than referencing another row — not an FK (matches parse-sdl-fk.mjs).
            if (ownerHasIdField && isSelfAliasOfId(f.Description)) return null;
            return candidate.Name;
        }
        return null;
    }

    /** Parses the per-IO Configuration JSON into the GraphQL query model (incl. the nested access path). */
    private ParseIOConfiguration(obj: MJIntegrationObjectEntity): IOConfig {
        const raw = obj.Configuration;
        const fallbackName = obj.ResponseDataKey ?? obj.Name;
        if (!raw) {
            return { GraphQLQueryName: fallbackName, ReturnType: '', OperationArguments: [], Segments: [], Unresolved: false };
        }
        const parsed = IOConfigSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            return { GraphQLQueryName: fallbackName, ReturnType: '', OperationArguments: [], Segments: [], Unresolved: false };
        }
        const ap = parsed.data.AccessPath;
        // An AccessPath whose Door is explicitly null = no derivable fetch route (e.g. polymorphic survey-question subtypes).
        const unresolved = ap != null && (ap.Door == null || ap.Door.trim().length === 0);
        return {
            // AccessPath.Door (the entry query) wins when present; else the legacy flat GraphQLQueryName.
            GraphQLQueryName: ap?.Door ?? parsed.data.GraphQLQueryName ?? fallbackName,
            ReturnType: parsed.data.ReturnType ?? '',
            OperationArguments: parsed.data.OperationArguments ?? [],
            // Segments = the access-path AFTER the door. Explicit `Segments` wins; otherwise derive from
            // `NestingPath` (which includes the door as element 0) by dropping the door and stripping the
            // `[]` array-hop markers so `DescendAccessPath` can index each field key directly.
            Segments: ap?.Segments ?? (ap?.NestingPath && ap.NestingPath.length > 1
                ? ap.NestingPath.slice(1).map(s => s.replace(/\[\]$/, ''))
                : []),
            Unresolved: unresolved,
        };
    }

    /** Returns the IOF PK field names (sorted by sequence), or empty when none is declared. */
    private FindPKFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        return fields
            .filter(f => f.IsPrimaryKey)
            .sort((a, b) => a.Sequence - b.Sequence)
            .map(f => f.Name);
    }

    /**
     * Builds a stable record identity from the declared PK fields. When all PK parts are present, joins
     * them with '|'; otherwise returns '' so the engine's content-hash identity fallback takes over (the
     * `account`/`teams` container objects without a usable PK dedupe by content hash).
     */
    private BuildRecordIdentity(raw: Record<string, unknown>, pkFieldNames: string[]): string {
        if (pkFieldNames.length === 0) return '';
        const parts: string[] = [];
        for (const name of pkFieldNames) {
            const v = raw[name];
            if (v == null) return '';
            const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
            if (s.length === 0) return '';
            parts.push(s);
        }
        return parts.join('|');
    }

    /** Resolves the page size for a fetch: explicit BatchSize, else the IO default, else 50. */
    private ResolvePageSize(ctx: FetchContext, obj: MJIntegrationObjectEntity): number {
        if (ctx.BatchSize && ctx.BatchSize > 0) return Math.min(ctx.BatchSize, obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE);
        return obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
    }

    /** NormalizeResponse variant that never throws — used by ExtractPaginationInfo to count a page. */
    private NormalizeResponseSafe(rawBody: unknown): Record<string, unknown>[] {
        if (!isRecord(rawBody) || !isRecord(rawBody['data'])) return [];
        const data = rawBody['data'] as Record<string, unknown>;
        const payload = firstValue(data);
        if (Array.isArray(payload)) return payload.filter(isRecord);
        if (isRecord(payload)) return [payload];
        return [];
    }

    /** Converts an IntegrationObjectField entity to the ExternalFieldSchema shape (Declared discovery). */
    private DeclaredFieldToSchema(f: MJIntegrationObjectFieldEntity): ExternalFieldSchema {
        return {
            Name: f.Name,
            Label: f.DisplayName ?? f.Name,
            Description: f.Description ?? undefined,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsPrimaryKey: f.IsPrimaryKey,
            IsUniqueKey: f.IsUniqueKey || f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
            IsForeignKey: f.RelatedIntegrationObjectID != null,
            ForeignKeyTarget: f.RelatedIntegrationObject ?? null,
        };
    }
}

// ─── Module-level constants + helpers (mechanism, NOT a catalog) ──────

/** Path LMS Reporting API host root. */
const PATHLMS_HOST = 'https://data-api.pathlms.com';

/** GraphQL endpoint path (unversioned). */
const GRAPHQL_PATH = '/graphql';

/** Two-step token exchange endpoint. */
const TOKEN_PATH = '/api/v1/getToken';

/** The credential-free PUBLIC SpectaQL schema reference page — the standard-universe schema of record. */
const PUBLIC_SCHEMA_URL = 'https://data-api.pathlms.com/';

/** Token lifetime per docs (~12h). */
const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;

/** Re-mint a little before the documented expiry to avoid mid-request expiry. */
const TOKEN_EXPIRY_SKEW_MS = 5 * 60 * 1000;

/** Default page size when neither BatchSize nor IO DefaultPageSize is set (docs default). */
const DEFAULT_PAGE_SIZE = 50;

/**
 * Built-in GraphQL/Path-LMS scalar leaf types — anything NOT in this set that resolves to an emitted record
 * type is a typed-reference foreign key. Used by {@link PathLMSConnector.ResolveFKTarget} to distinguish a
 * scalar `<Type>Id` FK from a typed-object FK. Matches the SCALARS set in `scripts/parse-sdl-fk.mjs`.
 */
const GRAPHQL_SCALARS = new Set<string>([
    'Int', 'String', 'ID', 'Boolean', 'Float', 'Date', 'DateTime', 'JSON', 'Currency',
]);

/**
 * Non-record SDL OBJECT types to EXCLUDE from the discovered universe. This is the documented exclusion
 * RULE (abstract bases inlined onto their concrete type, report-container pagination wrappers replaced by
 * their record types, and id-less value objects that are embedded structs, not tables) — it is NOT the
 * catalog. The catalog (the 84 record types + their fields) is FETCHED + PARSED from the public schema at
 * runtime; this set merely removes the 9 non-record blocks from the parsed result.
 */
const NON_RECORD_SDL_TYPES = new Set<string>([
    'BaseAccount',                  // abstract base — fields inlined onto Account
    'BaseTeam',                     // abstract base — fields inlined onto Team
    'CourseItemViewReport',         // report-container wrapper around CourseItemView
    'UserPresentationReport',       // report-container wrapper around UserPresentation
    'WebinarArchiveViewerReport',   // report-container wrapper around WebinarArchiveViewerUser
    'WebinarCancellationReport',    // report-container wrapper around WebinarCancellationUser
    'WebinarGuestReport',           // report-container wrapper (envelope only, no own identity)
    'SurveyQuestionAnswer',         // id-less value object — embedded answer struct, not a table
    'SurveySummativeInfo',          // id-less value object — embedded summary struct on Survey
]);

/** Auth context: resolved bearer token + the credentials used to mint it (for re-mint). */
interface PathLMSAuthContext extends RESTAuthContext {
    Token: string;
    Credentials: PathLMSCredentials;
    /** Resolved host root for this connection (override or {@link PATHLMS_HOST}). */
    BaseURL?: string;
}

/**
 * Resolved Path LMS credentials. The normal path carries `applicationId` + `applicationSecret` (exchanged
 * at /api/v1/getToken). `PreconfiguredToken` is an alternate, exchange-free path: a ready bearer token
 * supplied directly (the transport-smoke dummy-token path, or a broker injecting a bearer). When
 * `PreconfiguredToken` is set, appId/secret may be absent — {@link PathLMSConnector.GetOrMintToken} returns
 * the token verbatim with no network call.
 */
interface PathLMSCredentials {
    applicationId?: string;
    applicationSecret?: string;
    PreconfiguredToken?: string;
    /** Optional host-root override (self-hosted/sandbox instance or e2e mock origin); absent ⇒ {@link PATHLMS_HOST}. */
    BaseURL?: string;
}

/** A cached bearer token + its absolute expiry (epoch ms). */
interface CachedToken {
    Token: string;
    ExpiresAt: number;
}

/** A field parsed from the public SpectaQL schema. */
interface PublicField {
    Name: string;
    /** Underlying named type from the SDL link (list/non-null wrappers stripped), e.g. "Int", "Course". */
    TargetType: string | null;
    /** Whether the SDL type was a list (`[Foo]`). */
    IsList: boolean;
    /** Whether the SDL type was non-null at the top level (`!`). */
    NonNull: boolean;
    /** The field's documentation prose, if any. */
    Description?: string;
}

/** A record type parsed from the public SpectaQL schema. */
interface PublicRecordType {
    Name: string;
    Description?: string;
    Fields: PublicField[];
}

/** The fully-parsed public schema: the standard-universe record types + a by-name index. */
interface PublicSchema {
    RecordTypes: PublicRecordType[];
    RecordTypesByName: Map<string, PublicRecordType>;
}

/** The GraphQL query model parsed from an IO's per-object Configuration JSON. */
interface IOConfig {
    GraphQLQueryName: string;
    ReturnType: string;
    OperationArguments: string[];
    /**
     * Access path for a NESTED record type (tables ≠ doors): the chain of field names from the entry
     * query (`GraphQLQueryName` = the "door") down to THIS object's record collection. Empty for an
     * object that sits directly at its door (depth-0). E.g. `OrderItem` = door `account`, Segments
     * `["orders","items"]`. The connector descends this path in the GraphQL selection + the response.
     */
    Segments: string[];
    /** True when the AccessPath's Door is null — no derivable fetch route (the object is skipped + warned). */
    Unresolved: boolean;
}

/** A parsed GraphQL operation argument spec (`name:Type`). */
interface ArgSpec {
    Name: string;
    Type: string;
}

/** A simplified SDL object type (name + its fields). */
interface SDLType {
    Name: string;
    Fields: SDLField[];
}

/** A simplified SDL field: its name + its flattened underlying type info. */
interface SDLField {
    Name: string;
    /** Underlying named type (list/non-null wrappers stripped), e.g. "String", "WebinarAttendee". */
    NamedType: string;
    /** Whether the field's type is a list. */
    IsList: boolean;
    /** Whether the field is non-null at the top level. */
    NonNull: boolean;
}

/** name → SDLType map of the live schema's OBJECT types. */
type SDLTypeMap = Record<string, SDLType>;

/** Credential JSON shape (tolerant of casing aliases + a direct/pre-minted bearer token). */
const PathLMSCredentialSchema = z.object({
    applicationId: z.string().optional(),
    ApplicationID: z.string().optional(),
    clientId: z.string().optional(),
    ClientID: z.string().optional(),
    applicationSecret: z.string().optional(),
    ApplicationSecret: z.string().optional(),
    clientSecret: z.string().optional(),
    ClientSecret: z.string().optional(),
    // Direct/pre-minted bearer token aliases (exchange-free path; transport-smoke dummy token).
    Token: z.string().optional(),
    token: z.string().optional(),
    accessToken: z.string().optional(),
    access_token: z.string().optional(),
    bearerToken: z.string().optional(),
    apiKey: z.string().optional(),
    APIKey: z.string().optional(),
    // Optional host override (a self-hosted/sandbox Path LMS instance, or an e2e mock origin). Absent ⇒
    // the canonical production host. The value is the host ROOT; the connector appends `/graphql` and
    // `/api/v1/getToken` itself (a full `…/graphql` URL is tolerated and reduced to the root).
    BaseURL: z.string().optional(),
    baseUrl: z.string().optional(),
    GraphQLEndpoint: z.string().optional(),
}).passthrough();

/** Per-IO Configuration JSON shape carrying the GraphQL query model. */
const IOConfigSchema = z.object({
    GraphQLQueryName: z.string().optional(),
    ReturnType: z.string().optional(),
    OperationArguments: z.array(z.string()).optional(),
    // Nested access path (tables ≠ doors): the entry query + the field-name chain down to this record.
    AccessPath: z.object({
        Door: z.string().nullable().optional(),
        Segments: z.array(z.string()).optional(),
        // Discovery emits NestingPath (door + field-name chain, array hops marked `field[]`) + Depth.
        // Segments (the path AFTER the door, markers stripped) is derived from it when not explicit.
        NestingPath: z.array(z.string()).optional(),
        Depth: z.number().optional(),
    }).optional(),
}).passthrough();

interface IntrospectionTypeRef {
    kind: string;
    name?: string | null;
    ofType?: IntrospectionTypeRef | null;
}

/** Minimal GraphQL introspection response shape (only the bits the type-map builder reads). */
const IntrospectionTypeRefSchema: z.ZodType<IntrospectionTypeRef> = z.lazy(() => z.object({
    kind: z.string(),
    name: z.string().nullish(),
    ofType: IntrospectionTypeRefSchema.nullish(),
})) as z.ZodType<IntrospectionTypeRef>;

const IntrospectionResponseSchema = z.object({
    data: z.object({
        __schema: z.object({
            types: z.array(z.object({
                kind: z.string(),
                name: z.string().nullable(),
                fields: z.array(z.object({
                    name: z.string(),
                    type: IntrospectionTypeRefSchema,
                })).nullish(),
            })),
        }),
    }),
});

/**
 * A standard GraphQL introspection query restricted to OBJECT types + their fields' type references —
 * everything the selection-set builder + tenant-overlay needs to decide scalar-vs-object.
 */
const INTROSPECTION_QUERY = `query PathLMSIntrospection {
  __schema {
    types {
      kind
      name
      fields {
        name
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}`;

/**
 * Parses a SpectaQL HTML schema page into the standard universe of record types + fields. Each record type
 * is a `<section id="definition-<Type>" class="definition definition-object">` block; the non-record SDL
 * types in {@link NON_RECORD_SDL_TYPES} are removed. Each field row carries the property name + a typed
 * link `<a href="#definition-<Target>"><code>[Type]!</code></a>` from which the underlying type, list-ness
 * and non-null are read. This is the credential-free standard-universe enumeration (record TYPES, not the
 * Query entry-point doors).
 */
export function parseSpectaQLSchema(html: string): PublicSchema {
    const starts = [...html.matchAll(/<section id="definition-([A-Za-z0-9_]+)" class="definition definition-object"/g)];
    const recordTypes: PublicRecordType[] = [];

    for (let i = 0; i < starts.length; i++) {
        const name = starts[i][1];
        if (NON_RECORD_SDL_TYPES.has(name)) continue;
        const begin = starts[i].index ?? 0;
        const end = i + 1 < starts.length ? (starts[i + 1].index ?? html.length) : html.length;
        const block = html.slice(begin, end);
        recordTypes.push({
            Name: name,
            Description: extractDefinitionDescription(block),
            Fields: parseFieldRows(block),
        });
    }

    const byName = new Map<string, PublicRecordType>();
    for (const rt of recordTypes) byName.set(rt.Name.toLowerCase(), rt);
    return { RecordTypes: recordTypes, RecordTypesByName: byName };
}

/** Pulls the top-level field rows out of a definition-object block (skips nested field-argument rows). */
function parseFieldRows(block: string): PublicField[] {
    // A field row: <td data-property-name="..."><span class="property-name"><code>NAME</code></span>
    //   - <span class="property-type">[<a href="#definition-TARGET">]<code>TYPE</code>...</span> </td> <td>DESC</td>
    // The trailing description cell is captured so the FK self-alias contradiction check (see
    // ResolveFKTarget) can read a field's prose — the same signal `scripts/parse-sdl-fk.mjs` used when it
    // authored the persisted metadata, so the connector's credential-free FK derivation reproduces it.
    const re = /<td data-property-name="[^"]*"><span class="property-name"><code>([A-Za-z0-9_]+)<\/code><\/span>\s*-\s*<span class="property-type">(?:<a href="#definition-([A-Za-z0-9_]+)">)?<code>([^<]+)<\/code>[\s\S]*?<\/span>\s*<\/td>\s*<td>([\s\S]*?)<\/td>/g;
    const fields: PublicField[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
        const fieldName = m[1];
        if (seen.has(fieldName)) continue; // de-dupe (a field's own row appears once; arg rows don't match this pattern)
        seen.add(fieldName);
        const rawType = m[3];
        const descText = m[4].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        fields.push({
            Name: fieldName,
            TargetType: m[2] ?? stripTypeWrappers(rawType),
            IsList: rawType.includes('['),
            NonNull: /\]?!$/.test(rawType.trim()),
            Description: descText.length > 0 ? descText : undefined,
        });
    }
    return fields;
}

/** Reads the prose description for a definition block (the first <p> in its doc-description, if present). */
function extractDefinitionDescription(block: string): string | undefined {
    const m = block.match(/<div class="definition-description[^"]*">\s*<p>([\s\S]*?)<\/p>/);
    if (!m) return undefined;
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    return text.length > 0 ? text : undefined;
}

/** Maps a public-schema SDL named type into the connector's coarse DataType vocabulary. */
function sdlTypeToDataType(namedType: string | null, isList: boolean): string {
    if (isList) return 'json';
    switch (namedType) {
        case 'Int': return 'Int';
        case 'Float': return 'Float';
        case 'Currency': return 'Float';
        case 'Boolean': return 'Boolean';
        case 'Date':
        case 'DateTime': return 'Date';
        case 'JSON': return 'json';
        case 'ID':
        case 'String':
            return 'String';
        case null:
            return 'String';
        default:
            // A named type that is itself an object/enum the field references → opaque json blob.
            return 'json';
    }
}

/** Narrows an unknown value to a plain record. */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Normalizes a value to a flat array of records: array → its records, object → singleton, else empty. */
function toRecordArray(v: unknown): Record<string, unknown>[] {
    if (Array.isArray(v)) return v.filter(isRecord);
    if (isRecord(v)) return [v];
    return [];
}

/** Returns the first value of an object (used when no explicit responseDataKey is supplied). */
function firstValue(obj: Record<string, unknown>): unknown {
    for (const v of Object.values(obj)) return v;
    return undefined;
}

/** Formats a GraphQL `errors` array into a single human-readable string. */
function formatGraphQLErrors(errors: unknown): string {
    if (!Array.isArray(errors)) return String(errors);
    return errors
        .map(e => (isRecord(e) && typeof e['message'] === 'string' ? e['message'] : JSON.stringify(e)))
        .join('; ');
}

/** Strips GraphQL list/non-null wrappers from a type string: `[Foo!]!` → `Foo`. */
function stripTypeWrappers(typeStr: string): string {
    return typeStr.replace(/[[\]!]/g, '').trim();
}

/**
 * True when a field's prose marks it a self-alias of the row's own `id` (a renamed view of this record's
 * identity, NOT a reference to another row). Verbatim the `isSelfAlias` contradiction check in
 * `scripts/parse-sdl-fk.mjs` that authored the persisted metadata, so the connector's FK derivation
 * reproduces the metadata's `*Id`-not-an-FK decisions exactly.
 */
function isSelfAliasOfId(description: string | undefined): boolean {
    if (!description) return false;
    const d = description.toLowerCase();
    return /same as (the )?id\b/.test(d) || /alias of (the )?id\b/.test(d) || /for cross.?referencing/.test(d);
}

/** Parses an operation-argument spec `name:Type` into {Name, Type}. Returns null on malformed input. */
function parseArgSpec(spec: string): ArgSpec | null {
    const idx = spec.indexOf(':');
    if (idx <= 0) return null;
    const name = spec.slice(0, idx).trim();
    const type = spec.slice(idx + 1).trim();
    if (name.length === 0 || type.length === 0) return null;
    return { Name: name, Type: type };
}

/** Flattens a GraphQL introspection type ref into {NamedType, IsList, NonNull}. */
function flattenIntrospectionType(ref: IntrospectionTypeRef): { NamedType: string; IsList: boolean; NonNull: boolean } {
    let isList = false;
    let nonNull = false;
    let cur: IntrospectionTypeRef | null | undefined = ref;
    let depth = 0;
    while (cur && depth < 10) {
        if (cur.kind === 'NON_NULL') {
            if (depth === 0) nonNull = true;
        } else if (cur.kind === 'LIST') {
            isList = true;
        } else if (cur.name) {
            return { NamedType: cur.name, IsList: isList, NonNull: nonNull };
        }
        cur = cur.ofType;
        depth++;
    }
    return { NamedType: 'Unknown', IsList: isList, NonNull: nonNull };
}

/** Tree-shaking prevention function — import and call from the module entry point. */
export function LoadPathLMSConnector(): void { /* no-op */ }
