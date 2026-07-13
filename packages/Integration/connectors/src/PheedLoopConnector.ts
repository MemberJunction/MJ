import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type CreateRecordContext,
    type CRUDResult,
} from '@memberjunction/integration-engine';
import { z } from 'zod';

/**
 * PheedLoop event-management platform connector (REST API v3).
 *
 * PheedLoop publishes its object catalog in a credential-free Postman collection (v3.3.0), so the
 * connector's object/field set lives in the **Declared** metadata file
 * (`metadata/integrations/pheedloop/.pheedloop.integration.json`) and is surfaced at runtime by the
 * base {@link BaseRESTIntegrationConnector} `DiscoverObjects`/`DiscoverFields`/`IntrospectSchema`
 * (cache-driven, credential-free) — there is NO baked catalog in this file and discovery is NOT
 * overridden. The connector is pure mechanism: tri-component auth, page/page_size pagination over the
 * Django-REST-Framework `{count,next,previous,results}` envelope, generic per-operation CRUD, and the
 * one genuinely-idiosyncratic write (EventAttendance check-in) overridden below.
 *
 * Tri-component auth (dual header + path tenant):
 *  - `X-API-KEY`  — the API Key   (static; NOT a Bearer token)
 *  - `X-API-SECRET` — the API Secret (static; NOT a Bearer token)
 *  - Organization Code — a NON-secret tenant identifier injected as a URL-path segment:
 *    `https://api.pheedloop.com/api/v3/organization/{ORGANIZATION-CODE}/...`
 * Key + secret come from the linked Credential (type "PheedLoop API"); the org code is read from the
 * CompanyIntegration.Configuration JSON (`OrganizationCode`). Neither the credential nor the org code
 * is ever hardcoded. The two header values are static strings — no signing/encoding crypto is involved,
 * so no auth-helper applies (a helper would only matter for HMAC/OAuth/Basic encoding); the headers are
 * assembled directly, which is NOT inline crypto.
 */
@RegisterClass(BaseIntegrationConnector, 'PheedLoopConnector')
export class PheedLoopConnector extends BaseRESTIntegrationConnector {

    /** Verbatim three-way invariant: ClassName / IntegrationName getter / MJ: Integrations.Name. */
    public override get IntegrationName(): string {
        return 'PheedLoop';
    }

    // ── Capability surface ───────────────────────────────────────────
    // Per-IO write columns (Create/Update/Delete* on each IntegrationObject) drive the generic CRUD
    // path. These getters report that the connector CAN write so the engine attempts the per-IO verbs
    // the metadata configures (the metadata gates which IOs actually support which verb).
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    // ── Auth + transport (BaseRESTIntegrationConnector abstracts) ─────

    /**
     * Resolves the API key + secret from the linked Credential entity and the non-secret organization
     * code from the CompanyIntegration.Configuration JSON. Credential bytes never leave this scope.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<PheedLoopAuthContext> {
        return this.LoadAuth(companyIntegration, contextUser);
    }

    /**
     * Dual static-header auth: `X-API-KEY` + `X-API-SECRET` on every request. Neither is a Bearer
     * token; both are opaque key/secret strings requiring no encoding, so no auth-helper is used.
     */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const a = auth as PheedLoopAuthContext;
        return {
            'X-API-KEY': a.ApiKey,
            'X-API-SECRET': a.ApiSecret,
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    /**
     * Base URL with the organization code injected as a path segment. The org code is a non-secret
     * tenant identifier from Configuration — never hardcoded. Every collection request rides this prefix.
     */
    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const a = auth as PheedLoopAuthContext;
        const host = (a.BaseHost ?? PHEEDLOOP_HOST).replace(/\/+$/, '');
        return `${host}/api/v3/organization/${encodeURIComponent(a.OrganizationCode)}`;
    }

    /**
     * Executes an HTTP request via fetch. PheedLoop requires a TRAILING SLASH on every resource path
     * (before any query string) — the base BuildFullURL strips it, so it is re-added here. JSON bodies
     * are sent for non-GET/DELETE verbs.
     */
    protected async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const finalUrl = this.EnsureTrailingSlash(url);
        const init: RequestInit = { method, headers: { ...headers } };
        if (body !== undefined && method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
            (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
        const response = await fetch(finalUrl, init);
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value; });
        const text = await response.text();
        let parsed: unknown = text;
        const contentType = responseHeaders['content-type'] ?? '';
        if (contentType.includes('json') || (text.length > 0 && (text[0] === '{' || text[0] === '['))) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        // PheedLoop signals "past the last page" with HTTP 404 {"detail":"Invalid page."} rather than
        // an empty page (a DRF paginator behaviour). On a GET, treat that SPECIFIC 404 as a graceful
        // empty final page so the paginated fetch terminates with the records already collected, instead
        // of failing the whole sync. A genuine 404 (no "Invalid page" detail — e.g. a wrong path) is
        // left as-is so real errors still surface.
        if (
            response.status === 404 &&
            method === 'GET' &&
            isRecord(parsed) &&
            /invalid page/i.test(String((parsed as Record<string, unknown>)['detail'] ?? ''))
        ) {
            return { Status: 200, Body: { results: [], next: null }, Headers: responseHeaders };
        }
        return { Status: response.status, Body: parsed, Headers: responseHeaders };
    }

    /**
     * Unwraps the Django-REST-Framework pagination envelope `{count, next, previous, results}` to the
     * `results[]` record array. Honors an explicit ResponseDataKey when set, falls back to `results`,
     * and tolerates a bare array or single object (e.g. a create echo, or the flat-shape SessionRegistration).
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody.filter(isRecord);

        if (!isRecord(rawBody)) return [];
        const body = rawBody;
        if (responseDataKey && Array.isArray(body[responseDataKey])) {
            return (body[responseDataKey] as unknown[]).filter(isRecord);
        }
        if (Array.isArray(body['results'])) {
            return (body['results'] as unknown[]).filter(isRecord);
        }
        // A single-object response (create echo / flat object endpoint) becomes a one-element array.
        if (Object.keys(body).length > 0) return [body];
        return [];
    }

    /**
     * Page-number pagination over the DRF envelope. `next` (a non-null URL) is the authoritative
     * "more pages" signal; a short/empty `results` page is the fallback. PaginationType 'None' (e.g.
     * EventAttendance) reports a single page.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };

        const records = this.NormalizeResponse(rawBody, null);
        const envelope = isRecord(rawBody) ? rawBody : null;
        const next = envelope?.['next'];
        const total = typeof envelope?.['count'] === 'number' ? (envelope['count'] as number) : undefined;

        switch (paginationType) {
            case 'PageNumber': {
                const hasNextUrl = typeof next === 'string' && next.length > 0;
                const effectivePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
                // Prefer the DRF `next` link; otherwise a full page implies another may follow.
                const hasMore = hasNextUrl || (records.length >= effectivePageSize && records.length > 0);
                return { HasMore: hasMore, NextPage: currentPage + 1, TotalRecords: total };
            }
            case 'Offset':
                return { HasMore: records.length >= pageSize, NextOffset: currentOffset + records.length };
            case 'Cursor': {
                const cursor = typeof next === 'string' ? next : undefined;
                return { HasMore: typeof cursor === 'string' && cursor.length > 0, NextCursor: cursor };
            }
            default:
                return { HasMore: records.length >= pageSize };
        }
    }

    /**
     * PheedLoop uses `page` (1-based) + `page_size` query params (NOT the base loop's page/pageSize).
     * Override to emit the vendor's actual param names. The base FetchPaginatedLoop is ALSO 1-based
     * (`let page = ctx.CurrentPage ?? 1`), and PheedLoop's `page` is 1-based, so the loop page maps
     * DIRECTLY to the vendor page — do NOT add 1 (doing so skipped page 1 and requested page 2 first,
     * which PheedLoop rejects with 404 "Invalid page" → 0 records synced).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const separator = basePath.includes('?') ? '&' : '?';
        switch (obj.PaginationType) {
            case 'PageNumber':
                // Base loop page is 1-based (FetchPaginatedLoop: `page = ctx.CurrentPage ?? 1`) and so
                // is PheedLoop's `page` — emit it directly. (Adding 1 skipped page 1 → 404 "Invalid page".)
                return `${basePath}${separator}page=${page}&page_size=${pageSize}`;
            case 'Offset':
                return `${basePath}${separator}offset=${offset}&page_size=${pageSize}`;
            case 'Cursor':
                return cursor
                    ? `${basePath}${separator}cursor=${encodeURIComponent(cursor)}&page_size=${pageSize}`
                    : `${basePath}${separator}page_size=${pageSize}`;
            default:
                return basePath;
        }
    }

    // ── Connection test ──────────────────────────────────────────────

    /** Tests connectivity by listing one page of the org-scoped Events collection. */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as PheedLoopAuthContext;
            const url = `${this.GetBaseURL(companyIntegration, auth)}/events/?page=1&page_size=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status === 401 || response.Status === 403) {
                return {
                    Success: false,
                    Message: `PheedLoop rejected the credentials (HTTP ${response.Status}). Verify the API Key / API Secret and the Organization Code.`,
                };
            }
            if (response.Status === 404) {
                return {
                    Success: false,
                    Message: `PheedLoop returned HTTP 404 — the Organization Code "${auth.OrganizationCode}" may be incorrect.`,
                };
            }
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: `Connected to PheedLoop organization "${auth.OrganizationCode}".` };
            }
            return { Success: false, Message: `PheedLoop responded HTTP ${response.Status}.` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `PheedLoop connection error: ${message}` };
        }
    }

    // NOTE: DiscoverObjects / DiscoverFields / IntrospectSchema / FetchChanges are intentionally NOT
    // overridden. PheedLoop's catalog is credential-free (Postman collection v3.3.0) and lives as
    // Declared metadata; the base implementations read it from the IntegrationEngineBase cache. The
    // base FetchChanges walks {eventCode}/{sessionCode} template-var paths via ResolveParentChain.

    // ── EventAttendance check-in override (REQUIRED — idiosyncratic write) ──
    //
    // POST .../checkin/ is a STATE MUTATION returning {attendees:[...], errored_attendees:[...]} — arrays
    // of attendee codes — with NO created-record id (CreateIDLocation='n/a'). The generic CreateRecord →
    // ExtractIDFromResponse would find no id and BuildCreatedResult would (correctly) fail. So for
    // EventAttendance ONLY, the created-record identity is the checked-in attendee (attendees[0]); every
    // other IO delegates to the generic per-operation-column create on the base class. The result STILL
    // routes through BuildCreatedResult so an empty/failed check-in fails loudly (the empty-ID invariant).

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        if (ctx.ObjectName !== EVENT_ATTENDANCE_OBJECT) {
            return super.CreateRecord(ctx);
        }
        return this.CheckInAttendance(ctx);
    }

    /**
     * Executes a PheedLoop check-in: POST .../checkin/ with the flat body the metadata configures
     * (typically `{codes:[<attendee-code>...]}`), reads the checked-in attendee from the response's
     * `attendees[]` array as the created-record identity, and routes the outcome through
     * BuildCreatedResult so a no-usable-attendee result is a loud failure, not a silent success.
     */
    private async CheckInAttendance(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.CreateAPIPath || !obj.CreateMethod) {
            throw new Error(
                `CreateRecord not supported for "${ctx.ObjectName}": CreateAPIPath / CreateMethod not configured.`
            );
        }
        // Use the overridable Authenticate seam (NOT the private LoadAuth) so tests can mock auth.
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const url = `${baseURL}${obj.CreateAPIPath.startsWith('/') ? '' : '/'}${obj.CreateAPIPath}`;
        const body = this.BuildOperationBody(ctx.Attributes, obj.CreateBodyShape, obj.CreateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, headers, body);

        if (response.Status < 200 || response.Status >= 300) {
            return {
                Success: false,
                StatusCode: response.Status,
                ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on EventAttendance check-in`,
            };
        }

        const checkedIn = this.ExtractCheckedInAttendee(response.Body);
        // Empty/undefined identity → BuildCreatedResult turns the 2xx into a loud failure so a check-in
        // that produced no usable attendee id cannot be silently lost.
        return this.BuildCreatedResult(checkedIn, response.Status, ctx.ObjectName);
    }

    /**
     * Reads the first successfully checked-in attendee code from a `{attendees:[...], errored_attendees:[...]}`
     * check-in response. Returns undefined when `attendees` is empty/absent (so the check-in is treated
     * as a failure). Entries may be bare strings (codes) or objects carrying a code/id field.
     */
    private ExtractCheckedInAttendee(rawBody: unknown): string | undefined {
        if (!isRecord(rawBody)) return undefined;
        const attendees = rawBody['attendees'];
        if (!Array.isArray(attendees) || attendees.length === 0) return undefined;
        const first = attendees[0];
        if (typeof first === 'string' && first.length > 0) return first;
        if (typeof first === 'number') return String(first);
        if (isRecord(first)) {
            for (const k of ['code', 'Code', 'id', 'ID', 'Id', 'attendee_code']) {
                const v = first[k];
                if (typeof v === 'string' && v.length > 0) return v;
                if (typeof v === 'number') return String(v);
            }
        }
        return undefined;
    }

    /**
     * Extracts the new record's external ID from a create response. PheedLoop's universal PK is the
     * STRING `code` field on most resources (numeric `id` on Tags / REST Hooks), so `code` is checked
     * FIRST — ahead of the base class's id/externalID names — before falling back to the base for the
     * numeric-id and Location-header cases. (EventAttendance's `n/a` create is handled in CreateRecord.)
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        if ((!idLocation || idLocation === 'body') && isRecord(response.Body)) {
            const code = response.Body['code'];
            if (typeof code === 'string' && code.length > 0) return code;
            if (typeof code === 'number') return String(code);
        }
        return super.ExtractIDFromResponse(response, idLocation);
    }

    // ── Credential / configuration resolution ─────────────────────────

    /**
     * Resolves the API key + secret (from the linked Credential) and the organization code (from the
     * CompanyIntegration.Configuration JSON). Throws a descriptive error when any required component is
     * missing. The org code is per-tenant config — NEVER hardcoded.
     */
    private async LoadAuth(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<PheedLoopAuthContext> {
        let apiKey: string | undefined;
        let apiSecret: string | undefined;
        let organizationCode: string | undefined;
        let baseHost: string | undefined;

        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (fromCred) {
                apiKey = fromCred.ApiKey ?? apiKey;
                apiSecret = fromCred.ApiSecret ?? apiSecret;
                organizationCode = fromCred.OrganizationCode ?? organizationCode;
            }
        }

        // Configuration JSON supplies the non-secret OrganizationCode (and key/secret fallbacks).
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const fromConfig = this.ParseCredentialJson(configJson);
            if (fromConfig) {
                apiKey = apiKey ?? fromConfig.ApiKey;
                apiSecret = apiSecret ?? fromConfig.ApiSecret;
                organizationCode = organizationCode ?? fromConfig.OrganizationCode;
                baseHost = baseHost ?? fromConfig.BaseHost;
            }
        }

        if (!apiKey || !apiSecret) {
            throw new Error('No PheedLoop credential found — an "ApiKey" and "ApiSecret" are required (PheedLoop API credential type).');
        }
        if (!organizationCode) {
            throw new Error('No PheedLoop OrganizationCode found — set "OrganizationCode" in the CompanyIntegration Configuration JSON (it is a non-secret tenant identifier, never hardcoded).');
        }
        return { ApiKey: apiKey, ApiSecret: apiSecret, OrganizationCode: organizationCode, BaseHost: baseHost };
    }

    /** Loads ApiKey/ApiSecret/OrganizationCode from a Credential entity's Values JSON. */
    private async LoadFromCredentialEntity(credentialID: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<PheedLoopCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    /** Parses a JSON string into PheedLoop credential components (tolerant of casing/aliases). */
    private ParseCredentialJson(json: string): PheedLoopCredentials | null {
        try {
            const result = PheedLoopCredentialSchema.safeParse(JSON.parse(json));
            if (!result.success) return null;
            const p = result.data;
            const apiKey = p.ApiKey ?? p.apiKey ?? p['X-API-KEY'] ?? p.key;
            const apiSecret = p.ApiSecret ?? p.apiSecret ?? p['X-API-SECRET'] ?? p.secret;
            const organizationCode = p.OrganizationCode ?? p.organizationCode ?? p.orgCode ?? p.OrgCode;
            const baseHost = p.apiBaseUrl ?? p.BaseURL ?? p.BaseHost;
            if (!apiKey && !apiSecret && !organizationCode) return null;
            return { ApiKey: apiKey, ApiSecret: apiSecret, OrganizationCode: organizationCode, BaseHost: baseHost };
        } catch {
            return null;
        }
    }

    // ── Small helpers ─────────────────────────────────────────────────

    /** Ensures the resource path carries a trailing slash before any query string (PheedLoop requirement). */
    private EnsureTrailingSlash(url: string): string {
        const qIndex = url.indexOf('?');
        if (qIndex < 0) {
            return url.endsWith('/') ? url : `${url}/`;
        }
        const path = url.slice(0, qIndex);
        const query = url.slice(qIndex);
        const pathWithSlash = path.endsWith('/') ? path : `${path}/`;
        return `${pathWithSlash}${query}`;
    }
}

// ─── Module-level constants + helpers (mechanism, NOT a catalog) ──────

/** PheedLoop API host root. The /api/v3/organization/{org}/ prefix is appended in GetBaseURL. */
const PHEEDLOOP_HOST = 'https://api.pheedloop.com';

/** DRF default page size for PheedLoop data endpoints (Reports cap to 100 via metadata DefaultPageSize). */
const DEFAULT_PAGE_SIZE = 500;

/** The IO whose create is an idiosyncratic check-in state mutation (see CreateRecord override). */
const EVENT_ATTENDANCE_OBJECT = 'EventAttendance';

/** Resolved PheedLoop auth context (key + secret headers, org-code path segment, optional host override). */
interface PheedLoopAuthContext extends RESTAuthContext {
    ApiKey: string;
    ApiSecret: string;
    OrganizationCode: string;
    /** Non-secret host override (e.g. a local mock for replay testing). Defaults to PHEEDLOOP_HOST. */
    BaseHost?: string;
}

/** Parsed PheedLoop credential components. Key/secret are secret; org code is non-secret config. */
interface PheedLoopCredentials {
    ApiKey?: string;
    ApiSecret?: string;
    OrganizationCode?: string;
    BaseHost?: string;
}

/** Zod schema for the credential / Configuration JSON shape (tolerant of casing aliases). */
const PheedLoopCredentialSchema = z.object({
    ApiKey: z.string().optional(),
    apiKey: z.string().optional(),
    'X-API-KEY': z.string().optional(),
    key: z.string().optional(),
    ApiSecret: z.string().optional(),
    apiSecret: z.string().optional(),
    'X-API-SECRET': z.string().optional(),
    secret: z.string().optional(),
    OrganizationCode: z.string().optional(),
    organizationCode: z.string().optional(),
    orgCode: z.string().optional(),
    OrgCode: z.string().optional(),
    apiBaseUrl: z.string().optional(),
    BaseURL: z.string().optional(),
    BaseHost: z.string().optional(),
}).passthrough();

/** Narrows an unknown value to a plain record. */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
