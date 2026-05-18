// packages/Integration/connectors-registry/hubspot/src/HubSpotConnector.ts
//
// Thin REST protocol layer for HubSpot. Per-IO behaviour (paths, methods,
// pagination, capability flags) lives in metadata — this class delegates to
// the BaseRESTIntegrationConnector loop, plugging in only the vendor-specific
// auth + envelope + transform contracts.
//
// Generated initially by @memberjunction/connector-generator from spec.json;
// LLM_COMPLETE regions filled in by CodeBuilder.
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    WatermarkService,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type SearchContext,
    type SearchResult,
    type ListContext,
    type ListResult,
    type ExternalRecord,
    type ExternalObjectDTO,
    type FetchContext,
    type FetchBatchResult,
    type WatermarkType,
} from '@memberjunction/integration-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// NOTE: the auth-helpers submodule lives at `<engine>/dist/auth-helpers/index.js` but the
// engine package.json does not (yet) declare a subpath export for it. Deep-import the
// concrete file so the static dep is honoured by both tsc and Node ESM resolution.
import { OAuth2TokenManager, type OAuth2Token } from '@memberjunction/integration-engine/dist/auth-helpers/index.js';

// ─── Configuration shapes ────────────────────────────────────────────

/** Connection configuration parsed from CompanyIntegration.Configuration JSON. */
export interface HubSpotConnectionConfig {
    /** HubSpot OAuth2 client_id from the app's auth settings */
    ClientId: string;
    /** HubSpot OAuth2 client_secret from the app's auth settings (secret) */
    ClientSecret: string;
    /** HubSpot OAuth2 refresh token obtained from the authorization-code grant exchange (secret) */
    RefreshToken: string;
}

/** Auth context returned by Authenticate(). Carries the cached access token and parsed config. */
interface HubSpotAuthContext extends RESTAuthContext {
    Config: HubSpotConnectionConfig;
}

/**
 * Per-IO routing fields the connector reads from the metadata file when
 * dispatching CRUD. Tightly scoped to fields the CRUD bodies actually consume —
 * everything else in the metadata row is ignored at runtime.
 */
export interface HubSpotIntegrationObjectRouting {
    Name: string;
    CreateAPIPath?: string | null;
    CreateMethod?: string | null;
    UpdateAPIPath?: string | null;
    UpdateMethod?: string | null;
    DeleteAPIPath?: string | null;
    GetAPIPath?: string | null;
    SearchAPIPath?: string | null;
    SearchMethod?: string | null;
    ListAPIPath?: string | null;
    ListMethod?: string | null;
    ResponseDataKey?: string | null;
    /** True iff this IO supports `modifiedSince`-style incremental query per the root metadata. */
    SupportsIncrementalSync?: boolean | null;
    /** Record field name carrying the per-record watermark value (e.g. `updatedAt`, `hs_lastmodifieddate`). */
    IncrementalCursorFieldName?: string | null;
    /** Type of watermark stored — affects ValidateWatermark behavior. */
    IncrementalWatermarkType?: WatermarkType | null;
}

// ─── Constants ───────────────────────────────────────────────────────

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const HUBSPOT_TOKEN_ENDPOINT = 'https://api.hubapi.com/oauth/v1/token';

/**
 * HubSpot's per-resource incremental query param. Pulled from the root metadata
 * (`IncrementalQueryParamName: "modifiedSince"`, `IncrementalQueryParamFormat: "ISO8601"`).
 * The connector uses this as the `FetchChanges` query-string key when an IO declares
 * `SupportsIncrementalSync=true` and a valid watermark is provided.
 */
const HUBSPOT_INCREMENTAL_QUERY_PARAM = 'modifiedSince';

/**
 * Lightweight catalog endpoint used for health checks. The HubSpot owners
 * endpoint requires only the most basic CRM scope; a successful 2xx confirms
 * both connectivity and that the access token is valid.
 */
const HEALTH_CHECK_PATH = '/crm/v3/owners';

// ─── Connector ───────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseRESTIntegrationConnector {
    /** Cached OAuth2 token across calls within this connector instance. */
    private cachedToken: OAuth2Token | undefined;

    /** Canonical brand string. MUST match MJ: Integrations.Name exactly (three-way invariant). */
    public override get IntegrationName(): string {
        return 'HubSpot';
    }

    // ── Capability getters ──────────────────────────────────────────
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    // ── Required abstract method: TestConnection ────────────────────
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const baseURL = this.GetBaseURL(companyIntegration, auth);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, `${baseURL}${HEALTH_CHECK_PATH}`, 'GET', headers);
            return {
                Success: response.Status >= 200 && response.Status < 300,
                Message: response.Status >= 200 && response.Status < 300
                    ? 'Connection successful'
                    : `Health check returned ${response.Status}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ── REST abstract methods ───────────────────────────────────────

    /**
     * LLM_COMPLETE [filled]: HubSpot uses OAuth2 authorization-code grant; long-lived
     * refresh tokens are exchanged for short-lived (30-min) access tokens. We cache the
     * access token on the instance and refresh near expiry via the shared OAuth2TokenManager
     * (no hand-rolled token plumbing per the connector-code-conventions rules).
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser?: UserInfo
    ): Promise<HubSpotAuthContext> {
        const config = this.ParseConfig(companyIntegration);

        if (this.cachedToken && !OAuth2TokenManager.IsNearExpiry(this.cachedToken)) {
            return {
                Token: this.cachedToken.AccessToken,
                ExpiresAt: this.cachedToken.ExpiresAt,
                Config: config,
            };
        }

        this.cachedToken = await OAuth2TokenManager.RefreshToken({
            TokenEndpoint: HUBSPOT_TOKEN_ENDPOINT,
            RefreshToken: config.RefreshToken,
            ClientId: config.ClientId,
            ClientSecret: config.ClientSecret,
        });

        return {
            Token: this.cachedToken.AccessToken,
            ExpiresAt: this.cachedToken.ExpiresAt,
            Config: config,
        };
    }

    protected BuildHeaders(auth: HubSpotAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    protected async MakeHTTPRequest(
        _auth: HubSpotAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const response = await fetch(url, {
            method,
            headers,
            body: body != null ? JSON.stringify(body) : undefined,
        });
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value; });
        const contentType = response.headers.get('content-type') ?? '';
        const responseBody: unknown = contentType.includes('application/json')
            ? await response.json()
            : await response.text();
        return { Status: response.status, Body: responseBody, Headers: responseHeaders };
    }

    /**
     * LLM_COMPLETE [filled]: HubSpot CRM list/search endpoints wrap records under
     * `results`; some non-CRM endpoints return arrays directly. Respect the IO's
     * declared ResponseDataKey (per the metadata file) and fall back to a direct-array
     * read when it's null.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (responseDataKey == null) {
            return Array.isArray(rawBody) ? rawBody as Record<string, unknown>[] : [];
        }
        if (rawBody == null || typeof rawBody !== 'object') return [];
        const inner = (rawBody as Record<string, unknown>)[responseDataKey];
        return Array.isArray(inner) ? inner as Record<string, unknown>[] : [];
    }

    /**
     * LLM_COMPLETE [filled]: HubSpot's canonical pagination is cursor-based via
     * `paging.next.after`; absence of `paging.next` (or its `after`) signals end of
     * results. PageNumber/Offset branches exist for parity with the base contract
     * but are not used by current HubSpot endpoints in the metadata.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        const body = (rawBody ?? {}) as Record<string, unknown>;
        switch (paginationType) {
            case 'Cursor': {
                const paging = body.paging as Record<string, unknown> | undefined;
                const next = paging?.next as Record<string, unknown> | undefined;
                const nextCursor = typeof next?.after === 'string' ? next.after : undefined;
                return { HasMore: !!nextCursor, NextCursor: nextCursor };
            }
            case 'PageNumber': {
                const totalPages = (body.totalPages as number) ?? (body.total_pages as number) ?? 1;
                const hasMore = currentPage < totalPages;
                return { HasMore: hasMore, NextPage: hasMore ? currentPage + 1 : undefined };
            }
            case 'Offset': {
                const records = this.NormalizeResponse(body, null);
                const hasMore = records.length === pageSize;
                return { HasMore: hasMore, NextOffset: hasMore ? currentOffset + records.length : undefined };
            }
            case 'None':
            default:
                return { HasMore: false };
        }
    }

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, _auth: HubSpotAuthContext): string {
        return HUBSPOT_API_BASE;
    }

    // ── CRUD bodies ─────────────────────────────────────────────────
    //
    // Per-object routing reads from the metadata file: each IO carries the
    // canonical CreateAPIPath/UpdateAPIPath/DeleteAPIPath/GetAPIPath +
    // CreateMethod/UpdateMethod. HubSpot CRM writes use a `{ properties: {...} }`
    // envelope; the same envelope is unwrapped on read via TransformRecord.

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return this.CRUDError(404, `Unknown object '${ctx.ObjectName}'`);
        if (!io.CreateAPIPath) return this.CRUDError(405, `Object '${ctx.ObjectName}' does not support Create`);
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const url = `${this.GetBaseURL(ctx.CompanyIntegration as MJCompanyIntegrationEntity, auth)}${this.ResolvePathTemplate(io.CreateAPIPath, undefined, ctx.Attributes)}`;
        const body = this.WrapWriteBody(ctx.Attributes);
        const response = await this.MakeHTTPRequest(auth, url, io.CreateMethod ?? 'POST', this.BuildHeaders(auth), body);
        return this.ParseCRUDResponse(response);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return this.CRUDError(404, `Unknown object '${ctx.ObjectName}'`);
        if (!io.UpdateAPIPath) return this.CRUDError(405, `Object '${ctx.ObjectName}' does not support Update`);
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const url = `${this.GetBaseURL(ctx.CompanyIntegration as MJCompanyIntegrationEntity, auth)}${this.ResolvePathTemplate(io.UpdateAPIPath, ctx.ExternalID, ctx.Attributes)}`;
        const body = this.WrapWriteBody(ctx.Attributes);
        const response = await this.MakeHTTPRequest(auth, url, io.UpdateMethod ?? 'PATCH', this.BuildHeaders(auth), body);
        return this.ParseCRUDResponse(response, ctx.ExternalID);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return this.CRUDError(404, `Unknown object '${ctx.ObjectName}'`);
        if (!io.DeleteAPIPath) return this.CRUDError(405, `Object '${ctx.ObjectName}' does not support Delete`);
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const url = `${this.GetBaseURL(ctx.CompanyIntegration as MJCompanyIntegrationEntity, auth)}${this.ResolvePathTemplate(io.DeleteAPIPath, ctx.ExternalID, {})}`;
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', this.BuildHeaders(auth));
        return this.ParseCRUDResponse(response, ctx.ExternalID);
    }

    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const io = this.ResolveIO(ctx.ObjectName);
        // Search endpoint is `/.../search` (POST), per HubSpot's CRM Search API.
        // If no SearchAPIPath, return empty cleanly rather than throwing.
        if (!io || !io.SearchAPIPath) return { Records: [], TotalCount: 0, HasMore: false };
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const url = `${this.GetBaseURL(ctx.CompanyIntegration as MJCompanyIntegrationEntity, auth)}${io.SearchAPIPath}`;
        // HubSpot Search API takes `filterGroups`, `sorts`, `query`, `limit`, `after` — we
        // pass the caller's filters as a single filterGroup of equals-comparisons (the
        // most common shape) and respect Sort/PageSize. The connector is intentionally
        // conservative here; richer filter expressions are caller-built upstream.
        const filterGroups = Object.keys(ctx.Filters ?? {}).length > 0
            ? [{ filters: Object.entries(ctx.Filters).map(([propertyName, value]) => ({ propertyName, operator: 'EQ', value })) }]
            : [];
        const requestBody: Record<string, unknown> = { filterGroups, limit: ctx.PageSize ?? 100 };
        if (ctx.Sort) requestBody.sorts = [{ propertyName: ctx.Sort, direction: 'DESCENDING' }];
        const response = await this.MakeHTTPRequest(auth, url, io.SearchMethod ?? 'POST', this.BuildHeaders(auth), requestBody);
        return this.ParseListLikeResponse(response, io.ResponseDataKey ?? 'results', ctx.ObjectName);
    }

    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io || !io.ListAPIPath) return { Records: [], HasMore: false };
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        // HubSpot list endpoints take `after` (cursor) + `limit` query params.
        const params = new URLSearchParams();
        if (ctx.PageSize) params.set('limit', String(ctx.PageSize));
        if (ctx.Cursor) params.set('after', ctx.Cursor);
        const qs = params.toString();
        const url = `${this.GetBaseURL(ctx.CompanyIntegration as MJCompanyIntegrationEntity, auth)}${io.ListAPIPath}${qs ? `?${qs}` : ''}`;
        const response = await this.MakeHTTPRequest(auth, url, io.ListMethod ?? 'GET', this.BuildHeaders(auth));
        const parsed = this.ParseListLikeResponse(response, io.ResponseDataKey ?? 'results');
        // Promote cursor for ListResult shape (SearchResult has no NextCursor field).
        const body = (response.Body ?? {}) as Record<string, unknown>;
        const paging = body.paging as Record<string, unknown> | undefined;
        const next = paging?.next as Record<string, unknown> | undefined;
        const nextCursor = typeof next?.after === 'string' ? next.after : undefined;
        return { Records: parsed.Records, HasMore: !!nextCursor, NextCursor: nextCursor, TotalCount: parsed.TotalCount };
    }

    /**
     * Reads a single record by external ID using the IO's `GetAPIPath`. Per the
     * canonical body shape, a 404 surfaces as `null` (record genuinely missing)
     * while other non-2xx responses throw with the parsed vendor message so the
     * caller can distinguish "not found" from "auth failed" / "rate limited".
     * Records are run through `TransformRecord` to flatten the HubSpot
     * `properties` envelope into a flat field shape — same path the list/search
     * methods take.
     */
    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io || !io.GetAPIPath) return null;
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration as MJCompanyIntegrationEntity, auth);
        const url = `${baseURL}${this.ResolvePathTemplate(io.GetAPIPath, ctx.ExternalID, {})}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status === 404) return null;
        if (response.Status < 200 || response.Status >= 300) {
            const body = response.Body as Record<string, unknown> | undefined;
            const errMsg = typeof body?.message === 'string' ? body.message : `HTTP ${response.Status}`;
            throw new Error(`${this.IntegrationName} GetRecord failed for '${ctx.ObjectName}' id='${ctx.ExternalID}': ${errMsg}`);
        }
        const rawBody = (response.Body ?? {}) as Record<string, unknown>;
        const flat = this.TransformRecord(rawBody, undefined as never, undefined as never);
        const externalId = typeof flat.id === 'string' ? flat.id : ctx.ExternalID;
        return { ExternalID: externalId, ObjectType: ctx.ObjectName, Fields: flat };
    }

    /**
     * Incremental fetch for HubSpot. When the IO declares `SupportsIncrementalSync=true`
     * and a valid watermark is provided, adds `modifiedSince=<iso>` (HubSpot's
     * `IncrementalQueryParamName` from the root metadata) to the list call. Pagination
     * is HubSpot's standard `after`-cursor scheme; the connector tracks the maximum
     * watermark across the batch (not the most-recent record) so out-of-order pages
     * don't silently rewind the watermark. Partial failure during the outer iteration
     * leaves the watermark unchanged — the engine only calls `WatermarkService.Update`
     * after the full sync completes successfully (§13.4).
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io || !io.ListAPIPath) return { Records: [], HasMore: false };
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration as MJCompanyIntegrationEntity, auth);

        // Validate the incoming watermark ONCE up front. The validated value flows
        // into BOTH the query param AND the max-watermark comparison baseline.
        // A malformed incoming watermark must NOT be used downstream — neither as
        // a query param (would send garbage to the vendor) NOR as a baseline
        // (would lexicographically dominate valid record values and prevent any
        // record from "winning" the max comparison per §13.4 scenario 5).
        const ws = new WatermarkService();
        const wmType: WatermarkType = io.IncrementalWatermarkType ?? 'Timestamp';
        const effectiveIncoming: string | null =
            io.SupportsIncrementalSync
                && io.IncrementalCursorFieldName
                && typeof ctx.WatermarkValue === 'string'
                && ctx.WatermarkValue.length > 0
                && ws.ValidateWatermark(ctx.WatermarkValue, wmType)
                ? ctx.WatermarkValue
                : null;

        const params = new URLSearchParams();
        if (ctx.BatchSize) params.set('limit', String(ctx.BatchSize));
        if (ctx.CurrentCursor) params.set('after', ctx.CurrentCursor);
        if (effectiveIncoming != null) {
            params.set(HUBSPOT_INCREMENTAL_QUERY_PARAM, effectiveIncoming);
        }
        const qs = params.toString();
        const url = `${baseURL}${io.ListAPIPath}${qs ? `?${qs}` : ''}`;
        const response = await this.MakeHTTPRequest(auth, url, io.ListMethod ?? 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) {
            const body = response.Body as Record<string, unknown> | undefined;
            const errMsg = typeof body?.message === 'string' ? body.message : `HTTP ${response.Status}`;
            throw new Error(`${this.IntegrationName} FetchChanges failed for '${ctx.ObjectName}': ${errMsg}`);
        }
        const parsed = this.ParseListLikeResponse(response, io.ResponseDataKey ?? 'results', ctx.ObjectName);
        // Cursor extraction: HubSpot's standard cursor lives at body.paging.next.after.
        const body = (response.Body ?? {}) as Record<string, unknown>;
        const paging = body.paging as Record<string, unknown> | undefined;
        const next = paging?.next as Record<string, unknown> | undefined;
        const nextCursor = typeof next?.after === 'string' ? next.after : undefined;

        // Max-watermark tracking. Two rules that are easy to break:
        //   (A) When the IO does NOT support incremental sync, return
        //       NewWatermarkValue=undefined — never surface the incoming
        //       watermark for a non-incremental IO.
        //   (B) When the IO does support incremental sync, seed the comparison
        //       baseline from `effectiveIncoming` (validated value), NOT raw
        //       `ctx.WatermarkValue`. A malformed incoming watermark would
        //       otherwise lexicographically dominate valid record values and
        //       prevent any record from "winning" the max comparison.
        // Track max-SEEN (not most-recent) so out-of-order batches don't
        // silently rewind the watermark — per directive §13.4 scenario 3.
        let newWatermark: string | null | undefined;
        if (io.SupportsIncrementalSync && io.IncrementalCursorFieldName) {
            newWatermark = effectiveIncoming; // null when incoming was missing/malformed
            const cursorField = io.IncrementalCursorFieldName;
            for (const rec of parsed.Records) {
                const v = (rec.Fields as Record<string, unknown>)[cursorField];
                if (typeof v === 'string' && v.length > 0) {
                    if (newWatermark == null || v > newWatermark) newWatermark = v;
                }
            }
        } else {
            newWatermark = undefined;
        }

        return {
            Records: parsed.Records,
            HasMore: !!nextCursor,
            NextCursor: nextCursor,
            NewWatermarkValue: newWatermark ?? undefined,
        };
    }

    // ── Optional per-record transformation hook ─────────────────────
    /**
     * LLM_COMPLETE [filled]: HubSpot CRM list/search responses wrap field values
     * in a `properties` object alongside top-level id/createdAt/updatedAt. Spread
     * the properties up to the top level so downstream field mapping sees a single
     * flat shape. Top-level keys (id, createdAt, updatedAt, archived) survive
     * because the spread of `raw` precedes the properties spread.
     */
    protected override TransformRecord(
        raw: Record<string, unknown>,
        _obj: unknown,
        _fields: unknown
    ): Record<string, unknown> {
        if (raw == null || typeof raw !== 'object') return raw;
        const properties = (raw as { properties?: Record<string, unknown> }).properties ?? {};
        if (typeof properties !== 'object' || properties === null) return raw;
        // Strip the now-redundant `properties` envelope after flattening.
        const { properties: _omit, ...rest } = raw as { properties?: unknown } & Record<string, unknown>;
        void _omit;
        return { ...rest, ...properties };
    }

    /**
     * LLM_COMPLETE [filled]: HubSpot exposes custom fields under the
     * `customProperties.` namespace in some discovery responses. Treat those
     * as vendor-custom for downstream filtering.
     */
    protected override IsVendorCustomObject(extObj: ExternalObjectDTO): boolean {
        return extObj.Name.startsWith('customProperties.');
    }

    // ── Helpers ─────────────────────────────────────────────────────

    /**
     * Reads the CompanyIntegration.Configuration JSON and pulls out the three
     * credential fields. Throws clearly if the configuration is missing or
     * malformed — never silently returns a partial config.
     */
    protected ParseConfig(companyIntegration: MJCompanyIntegrationEntity): HubSpotConnectionConfig {
        const raw = companyIntegration.Configuration;
        if (!raw) {
            throw new Error(`${this.IntegrationName} CompanyIntegration has no Configuration JSON.`);
        }
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`${this.IntegrationName} CompanyIntegration.Configuration is not valid JSON: ${message}`);
        }

        const clientId = this.RequireString(parsed, 'ClientId');
        const clientSecret = this.RequireString(parsed, 'ClientSecret');
        const refreshToken = this.RequireString(parsed, 'RefreshToken');

        return { ClientId: clientId, ClientSecret: clientSecret, RefreshToken: refreshToken };
    }

    private RequireString(source: Record<string, unknown>, key: string): string {
        const v = source[key];
        if (typeof v !== 'string' || v.length === 0) {
            throw new Error(`${this.IntegrationName} Configuration missing required field '${key}'.`);
        }
        return v;
    }

    // ── Metadata + CRUD plumbing ────────────────────────────────────

    private cachedMetadata: { ios: HubSpotIntegrationObjectRouting[] } | undefined;

    /**
     * Loads the connector's metadata file (canonical path
     * `<connector-dir>/metadata/integrations/.hubspot.json`) and indexes the
     * routing fields per IO. Result is cached on the instance; tests override
     * by subclassing and replacing this method with an in-memory fixture.
     */
    protected LoadMetadata(): { ios: HubSpotIntegrationObjectRouting[] } {
        if (this.cachedMetadata) return this.cachedMetadata;
        const here = path.dirname(fileURLToPath(import.meta.url));
        // dist/HubSpotConnector.js → ../metadata/integrations/.hubspot.json
        // src/HubSpotConnector.ts → ../metadata/integrations/.hubspot.json
        const metadataPath = path.resolve(here, '..', 'metadata', 'integrations', '.hubspot.json');
        const raw = fs.readFileSync(metadataPath, 'utf-8');
        const parsed = JSON.parse(raw) as { relatedEntities?: { 'MJ: Integration Objects'?: Array<{ fields: HubSpotIntegrationObjectRouting }> } };
        const rows = parsed.relatedEntities?.['MJ: Integration Objects'] ?? [];
        this.cachedMetadata = { ios: rows.map((r) => r.fields) };
        return this.cachedMetadata;
    }

    protected ResolveIO(name: string): HubSpotIntegrationObjectRouting | null {
        const md = this.LoadMetadata();
        return md.ios.find((io) => io.Name === name) ?? null;
    }

    /**
     * Substitutes a single path-template variable (e.g. `{contactId}`) with
     * the provided `id`. If the path has multiple template vars, returns the
     * path untouched and lets the caller surface a 400 — this connector does
     * not yet support multi-level parent-child path resolution.
     */
    protected ResolvePathTemplate(pathTemplate: string, id: string | undefined, attrs: Record<string, unknown>): string {
        const matches = pathTemplate.match(/\{[^}]+\}/g) ?? [];
        if (matches.length === 0) return pathTemplate;
        if (matches.length === 1) {
            const tokenValue = id ?? (typeof attrs[matches[0]!.slice(1, -1)] === 'string' ? String(attrs[matches[0]!.slice(1, -1)]) : '');
            return pathTemplate.replace(matches[0]!, encodeURIComponent(tokenValue));
        }
        // Multi-template paths: substitute each `{name}` from attrs[name] where
        // possible, leave unresolved ones (caller will see a 4xx from HubSpot).
        return pathTemplate.replace(/\{([^}]+)\}/g, (_full, tokenName: string) => {
            const value = attrs[tokenName];
            return typeof value === 'string' ? encodeURIComponent(value) : `{${tokenName}}`;
        });
    }

    /**
     * HubSpot CRM write endpoints expect attributes inside a `properties` envelope.
     * Other (non-CRM) HubSpot APIs use bare bodies; this connector treats the CRM
     * envelope as the default since the populated metadata is overwhelmingly CRM.
     * Non-CRM endpoints can be served by overriding this hook in a per-vendor
     * subclass if/when needed.
     */
    protected WrapWriteBody(attributes: Record<string, unknown>): Record<string, unknown> {
        return { properties: attributes };
    }

    protected ParseCRUDResponse(response: RESTResponse, fallbackId?: string): CRUDResult {
        const ok = response.Status >= 200 && response.Status < 300;
        if (!ok) {
            const body = response.Body as Record<string, unknown> | undefined;
            const errMessage = typeof body?.message === 'string' ? body.message : `HTTP ${response.Status}`;
            return { Success: false, StatusCode: response.Status, ErrorMessage: errMessage };
        }
        const body = response.Body as Record<string, unknown> | undefined;
        const externalId = typeof body?.id === 'string' ? body.id : fallbackId;
        return { Success: true, StatusCode: response.Status, ExternalID: externalId };
    }

    protected ParseListLikeResponse(response: RESTResponse, responseDataKey: string, objectName?: string): SearchResult {
        const ok = response.Status >= 200 && response.Status < 300;
        if (!ok) return { Records: [], TotalCount: 0, HasMore: false };
        const body = (response.Body ?? {}) as Record<string, unknown>;
        const rawRecords = this.NormalizeResponse(body, responseDataKey);
        const transformed: ExternalRecord[] = rawRecords.map((r) => {
            const flat = this.TransformRecord(r, undefined, undefined);
            const externalId = typeof (flat as Record<string, unknown>).id === 'string'
                ? String((flat as Record<string, unknown>).id)
                : '';
            return { ExternalID: externalId, ObjectType: objectName ?? '', Fields: flat };
        });
        const total = typeof body.total === 'number' ? body.total : transformed.length;
        const paging = body.paging as Record<string, unknown> | undefined;
        const hasMore = !!(paging?.next && typeof (paging.next as Record<string, unknown>).after === 'string');
        return { Records: transformed, TotalCount: total, HasMore: hasMore };
    }

    protected CRUDError(statusCode: number, message: string): CRUDResult {
        return { Success: false, StatusCode: statusCode, ErrorMessage: message };
    }
}

