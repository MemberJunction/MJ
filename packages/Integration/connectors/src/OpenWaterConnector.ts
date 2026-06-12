/**
 * OpenWaterConnector — REST integration connector for OpenWater
 * (https://www.getopenwater.com), an awards / grants / abstracts / fellowship
 * submission-and-review platform. The connector targets OpenWater's v2 REST API.
 *
 * Auth — DUAL custom headers on EVERY request (no token exchange; the
 * Account/Authenticate endpoint is out of scope):
 *   - X-ClientKey       (config: ClientKey)
 *   - X-ApiKey          (config secret: ApiKey)
 *   - X-OrganizationCode (config: OrganizationCode, OPTIONAL)
 *
 * Pagination — PageNumber (pageIndex / pageSize); advance pageIndex until a
 * short/empty page.
 *
 * Incremental — per-IO IncrementalWatermarkField (lastModifiedSinceUtc /
 * createdSinceUtc / deletedSinceUtc / lastModifiedUtc / mostRecentTransactionSinceUtc)
 * formatted into the request query.
 *
 * Nested objects — OpenWater's object universe is larger than its directly-
 * queryable doors. Each nested IO carries an AccessPath in its IntegrationObject
 * Configuration { door, doorPath, parentParamName, nestingSegments[], entryPath,
 * parentParamIn, extractionMode, alternativePaths[] }. FetchChanges WALKS that path:
 * it queries the door, descends to the leaf parent IDs (e.g. Program -> rounds[] ->
 * roundId), then calls the entry path once per parent — injecting the parent id either
 * into the path template ({programId}/{fundId}) or as a query param (roundId-gated
 * JudgeAssignments/Recusals, which 400 without it). An `embedded-array` AccessPath
 * (Rounds) emits records directly from the door payload with no second call.
 *
 * Discovery — credential-free: DiscoverObjects/DiscoverFields/IntrospectSchema use the
 * BaseRESTIntegrationConnector implementations, which read the Declared IO/IOF metadata
 * from the IntegrationEngineBase cache. No catalog is baked into this file.
 *
 * Write — generic per-operation CRUD (Create/Update/Delete read from the IO's
 * CreateAPIPath/Method/BodyShape/IDLocation, Update*, Delete* columns) for the FLAT-body
 * write IOs (Application, JudgeTeam, User, Evaluation, ScheduleDay/Item/Room). THREE IOs
 * declare CreateBodyShape='literal' because their create-request schema needs fields absent
 * from the synced list-model, so CreateRecord is overridden for them (each still routes
 * through BuildCreatedResult; each IO's Configuration.LiteralCreateReason documents the
 * mapping):
 *   - Session         → POST /v2/Sessions {programId, typeId, name, ...}; typeId resolved
 *                       from the synced typeName via the SessionType IO (or a typeId input),
 *                       per Models.Session.CreateRequest.
 *   - JudgeAssignment → POST /v2/JudgeAssignments/Round {judgeUserId, roundId}; judgeUserId
 *                       <- record.userId, roundId from the create attributes' round context,
 *                       per Models.JudgeAssignment.AssignJudgeToRoundRequest. CreateIDLocation
 *                       /DeleteIDLocation = 'n/a' (no body id) → synthetic composite identity
 *                       roundId|judgeUserId. Delete re-uses the same /Round endpoint with the
 *                       pair as query params (DELETE has no path id).
 *   - ScheduleTimeSlot→ POST/PATCH supply scheduleDayIds (from the read-side availableOnlyInDayIds),
 *                       per Models.ScheduleTimeSlot.Create/UpdateRequest. ScheduleTimeSlot also
 *                       declares UpdateBodyShape='literal', so UpdateRecord is overridden too.
 * All other write IOs (incl. the lifecycle PATCHes Forwarding/WinnerAssignment/Status, which
 * are NOT in the frozen contract) use the generic per-operation path unchanged. These literal
 * write paths are untestable credential-free → RequiresLiveVerification (T10).
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type DefaultIntegrationConfig,
    type FetchContext,
    type FetchBatchResult,
    type FetchWarning,
    type RateLimitPolicy,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
} from '@memberjunction/integration-engine';

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Resolved OpenWater connection configuration. ClientKey + ApiKey are required;
 * OrganizationCode + BaseURL are optional.
 */
export interface OpenWaterConnectionConfig {
    /** X-ClientKey header value. */
    ClientKey: string;
    /** X-ApiKey header value (the secret). */
    ApiKey: string;
    /** X-OrganizationCode header value (optional, multi-org tenants). */
    OrganizationCode?: string;
    /** API base URL. Defaults to the OpenWater public API host. */
    BaseURL?: string;
    /** Maximum retries for rate-limited / transient failures. Default 3. */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default 30000. */
    RequestTimeoutMs?: number;
}

interface OpenWaterAuthContext extends RESTAuthContext {
    Config: OpenWaterConnectionConfig;
    BaseURL: string;
}

/**
 * Per-IO access path (read from IntegrationObject.Configuration.AccessPath) describing how
 * to reach a nested object's records from a queryable door.
 */
interface AccessPath {
    /** The door object name (e.g. "Program", "Fund"). */
    door: string;
    /** The door's queryable collection path (e.g. "/v2/Programs"). */
    doorPath: string;
    /** The path the leaf records are fetched from (may contain a {parentParamName} template var). */
    entryPath: string;
    /** Name of the parent id injected into entryPath (e.g. "programId", "fundId", "roundId"). */
    parentParamName?: string;
    /** Field-path chain descending the door payload to the parent ids (segments ending in [] are arrays). */
    nestingSegments?: string[];
    /** Where the parent id goes: 'query' → ?<parentParamName>=, otherwise the path template. */
    parentParamIn?: 'query' | 'path';
    /** 'embedded-array' → records live inside the door payload; no second call. */
    extractionMode?: 'embedded-array';
    /** Alternative entry paths to also fetch and union (e.g. JudgeReports + SessionReports). */
    alternativePaths?: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.getopenwater.com';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** OpenWater is a modest-throughput enterprise API — keep a conservative sustained rate. */
const RATE_LIMIT_TOKENS_PER_SEC = 3;

// ─── Connector ──────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'OpenWaterConnector')
export class OpenWaterConnector extends BaseRESTIntegrationConnector {

    private authState: OpenWaterAuthContext | null = null;

    // ── Identity (three-way invariant axis) ─────────────────────────
    public override get IntegrationName(): string { return 'OpenWater'; }

    // ── Capability flags ─────────────────────────────────────────────
    // The per-IO write columns (SupportsCreate/Update/Delete + Create/Update/Delete*
    // metadata) drive the generic CRUD path; these getters report that the connector
    // CAN write so the engine attempts the per-IO verbs the metadata configures.
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    // ── Sync-efficiency hooks ────────────────────────────────────────

    /** OpenWater's modest enterprise throughput; engine runs an AIMD token bucket from this. */
    public override get RateLimitPolicy(): RateLimitPolicy {
        return { TokensPerSec: RATE_LIMIT_TOKENS_PER_SEC };
    }

    /** Parse a Retry-After header (seconds, or an HTTP-date) into milliseconds. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const retryAfter = this.ReadRetryAfterHeader(error);
        if (retryAfter == null) return undefined;
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
        const when = Date.parse(retryAfter);
        if (Number.isFinite(when)) {
            const delta = when - Date.now();
            return delta > 0 ? delta : 0;
        }
        return undefined;
    }

    private ReadRetryAfterHeader(error: unknown): string | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const e = error as { Headers?: Record<string, string>; headers?: Record<string, string>; Status?: number; status?: number };
        const status = e.Status ?? e.status;
        if (status != null && status !== 429 && status !== 503) return undefined;
        const headers = e.Headers ?? e.headers;
        if (!headers) return undefined;
        return headers['retry-after'] ?? headers['Retry-After'];
    }

    // ── Auth + transport (abstract methods) ─────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        return this.GetAuth(companyIntegration, contextUser);
    }

    /** Dual custom-header auth: X-ClientKey + X-ApiKey on every request; X-OrganizationCode when present. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const config = (auth as OpenWaterAuthContext).Config;
        const headers: Record<string, string> = {
            'X-ClientKey': config.ClientKey,
            'X-ApiKey': config.ApiKey,
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
        if (config.OrganizationCode) headers['X-OrganizationCode'] = config.OrganizationCode;
        return headers;
    }

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const config = (auth as OpenWaterAuthContext).Config;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

        const effectiveHeaders = { ...headers };
        if (body !== undefined && method !== 'GET' && method !== 'DELETE' && !effectiveHeaders['Content-Type']) {
            effectiveHeaders['Content-Type'] = 'application/json';
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const response = await this.ExecuteFetch(url, method, effectiveHeaders, body, timeoutMs);
            if (this.ShouldRetry(response.status) && attempt < maxRetries) {
                await this.Sleep(this.ComputeRetryDelay(response, attempt));
                continue;
            }
            return this.BuildRESTResponse(response);
        }
        throw new Error(`OpenWater API request failed after ${maxRetries} attempt(s): ${url}`);
    }

    /**
     * OpenWater v2 list endpoints return a paged envelope { records: [...], pageIndex, pageSize,
     * totalRecords } or a bare array. NormalizeResponse unwraps to the record array.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];

        const body = rawBody as Record<string, unknown>;
        if (responseDataKey && Array.isArray(body[responseDataKey])) {
            return body[responseDataKey] as Record<string, unknown>[];
        }
        for (const key of ['records', 'data', 'items', 'results']) {
            if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        }
        // A single-object response (e.g. a create echo) becomes a one-element array.
        if (Object.keys(body).length > 0) return [body];
        return [];
    }

    /**
     * PageNumber pagination over OpenWater's pageIndex/pageSize. Advances pageIndex until a
     * short/empty page (records.length < requested pageSize) signals the last page.
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
        const effectivePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
        const total = this.ReadTotalRecords(rawBody);

        switch (paginationType) {
            case 'PageNumber': {
                // Short page ⇒ done. Otherwise honor a totalRecords hint when the API supplies one.
                const moreByPageSize = records.length >= effectivePageSize;
                // pageIndex is 0-based: after page `currentPage` we've fetched (currentPage+1) pages.
                const fetchedSoFar = (currentPage + 1) * effectivePageSize;
                const hasMore = total != null ? fetchedSoFar < total && records.length > 0 : moreByPageSize;
                return { HasMore: hasMore, NextPage: currentPage + 1 };
            }
            case 'Offset':
                return { HasMore: records.length >= effectivePageSize, NextOffset: currentOffset + records.length };
            case 'Cursor': {
                const body = rawBody as Record<string, unknown> | null;
                const cursor = body?.['nextCursor'] ?? body?.['next_cursor'] ?? body?.['cursor'];
                return { HasMore: typeof cursor === 'string' && cursor.length > 0, NextCursor: typeof cursor === 'string' ? cursor : undefined };
            }
            default:
                return { HasMore: records.length >= effectivePageSize };
        }
    }

    private ReadTotalRecords(rawBody: unknown): number | null {
        if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return null;
        const b = rawBody as Record<string, unknown>;
        for (const key of ['totalRecords', 'totalCount', 'total']) {
            const v = b[key];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
        }
        return null;
    }

    /**
     * OpenWater uses page=/pageSize= by default in the base loop, but the API's param names are
     * pageIndex/pageSize. Override to emit the vendor's actual param names.
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
                return `${basePath}${separator}pageIndex=${page}&pageSize=${pageSize}`;
            case 'Offset':
                return `${basePath}${separator}offset=${offset}&pageSize=${pageSize}`;
            case 'Cursor':
                return cursor
                    ? `${basePath}${separator}cursor=${encodeURIComponent(cursor)}&pageSize=${pageSize}`
                    : `${basePath}${separator}pageSize=${pageSize}`;
            default:
                return basePath;
        }
    }

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as OpenWaterAuthContext).BaseURL;
    }

    // ── Connection test ──────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser, true);
            // Programs is a top-level door present in every OpenWater tenant.
            const url = `${auth.BaseURL}/v2/Programs?pageIndex=0&pageSize=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: `Connected to OpenWater at ${auth.BaseURL}` };
            }
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `OpenWater rejected the credentials (HTTP ${response.Status}). Verify ClientKey / ApiKey / OrganizationCode.` };
            }
            return { Success: false, Message: `OpenWater responded HTTP ${response.Status}.` };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `OpenWater connection failed: ${message}` };
        }
    }

    // NOTE: DiscoverObjects / DiscoverFields / IntrospectSchema are intentionally NOT
    // overridden — the base implementations read the Declared IO/IOF metadata from the
    // IntegrationEngineBase cache (credential-free, no baked catalog in this file).

    // ── Fetch (incremental + nested-graph access-path walk) ─────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const accessPath = this.ParseAccessPath(obj);

        // Depth-0 (directly-queryable door / flat top-level query): delegate to the base
        // flat/pagination path, but layer the incremental watermark query param on top.
        if (!accessPath) {
            return this.FetchDoor(ctx, obj);
        }

        // Depth-N (nested): walk the access path from the door to the leaf records.
        return this.FetchViaAccessPath(ctx, obj, accessPath);
    }

    // ── Literal-create / literal-update overrides (RequiresLiveVerification) ──────────
    //
    // Three IOs declare CreateBodyShape='literal' (Session, JudgeAssignment, ScheduleTimeSlot)
    // because their create-request schema needs fields absent from the synced list-model — the
    // generic flat body would 400/422. ScheduleTimeSlot additionally declares UpdateBodyShape=
    // 'literal'. CreateRecord/UpdateRecord dispatch ONLY those IOs to a hand-built body (read from
    // the OpenAPI create/update-request schema) and delegate every other IO to the generic
    // per-operation column path on the base class. All creates route through BuildCreatedResult.

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        switch (ctx.ObjectName) {
            case 'Session':          return this.CreateSession(ctx);
            case 'JudgeAssignment':  return this.CreateJudgeAssignment(ctx);
            case 'ScheduleTimeSlot': return this.CreateScheduleTimeSlot(ctx);
            default:                 return super.CreateRecord(ctx);
        }
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        // Only ScheduleTimeSlot declares UpdateBodyShape='literal'; everything else is generic.
        if (ctx.ObjectName === 'ScheduleTimeSlot') return this.UpdateScheduleTimeSlot(ctx);
        return super.UpdateRecord(ctx);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        // JudgeAssignment delete has no path id (DeleteIDLocation='n/a'): DELETE /v2/JudgeAssignments/Round
        // with the {roundId, judgeUserId} pair as query params, recovered from the synthetic composite id.
        if (ctx.ObjectName === 'JudgeAssignment') return this.DeleteJudgeAssignment(ctx);
        return super.DeleteRecord(ctx);
    }

    /**
     * Session create — Models.Session.CreateRequest requires {programId, typeId, name}. The synced
     * list-model carries typeName (string), not typeId (int). Resolve typeId from an explicit typeId
     * attribute when supplied; otherwise look it up by name against the SessionType IO (which is
     * program-scoped, so we match within the record's programId).
     */
    private async CreateSession(ctx: CreateRecordContext): Promise<CRUDResult> {
        const a = ctx.Attributes;
        const programId = this.RequireNumber(a, 'programId');
        const typeId = await this.ResolveSessionTypeId(ctx, a, programId);
        if (typeId == null) {
            return this.FailedResult(`Session create: could not resolve a SessionType id from typeId/typeName for programId ${programId}.`);
        }
        const body: Record<string, unknown> = {
            programId,
            typeId,
            name: a['name'] ?? a['Name'] ?? '',
        };
        this.CopyOptional(a, body, ['chairUserIds', 'fieldValues']);
        return this.PostCreate(ctx, '/v2/Sessions', body, 'body');
    }

    /**
     * JudgeAssignment create — Models.JudgeAssignment.AssignJudgeToRoundRequest requires
     * {judgeUserId, roundId}. judgeUserId <- the synced userId; roundId from the create attributes'
     * round context (tagged onto the synced record by the AccessPath walk, or passed explicitly).
     * CreateIDLocation='n/a' → there is no body id; the stable identity is the (roundId, judgeUserId)
     * pair, so BuildCreatedResult is fed the synthetic composite id roundId|judgeUserId.
     */
    private async CreateJudgeAssignment(ctx: CreateRecordContext): Promise<CRUDResult> {
        const a = ctx.Attributes;
        const judgeUserId = this.FirstNumber(a, ['judgeUserId', 'userId']);
        const roundId = this.FirstNumber(a, ['roundId']);
        if (judgeUserId == null) return this.FailedResult('JudgeAssignment create: missing judgeUserId/userId.');
        if (roundId == null) return this.FailedResult('JudgeAssignment create: missing roundId (round context not available).');
        const body = { judgeUserId, roundId };
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as OpenWaterAuthContext;
        const url = `${auth.BaseURL}/v2/JudgeAssignments/Round`;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', this.BuildHeaders(auth), body);
        if (response.Status >= 200 && response.Status < 300) {
            // No returned id (n/a) — the pair IS the identity. Synthesize it so the create is tracked.
            return this.BuildCreatedResult(`${roundId}|${judgeUserId}`, response.Status, ctx.ObjectName);
        }
        return this.FailedResult(this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on JudgeAssignment create`, response.Status);
    }

    private async DeleteJudgeAssignment(ctx: DeleteRecordContext): Promise<CRUDResult> {
        // Recover {roundId, judgeUserId} from the synthetic composite id roundId|judgeUserId.
        const [roundId, judgeUserId] = String(ctx.ExternalID).split('|');
        if (!roundId || !judgeUserId) {
            return this.FailedResult(`JudgeAssignment delete: external id "${ctx.ExternalID}" is not a roundId|judgeUserId pair.`);
        }
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as OpenWaterAuthContext;
        const url = `${auth.BaseURL}/v2/JudgeAssignments/Round?roundId=${encodeURIComponent(roundId)}&judgeUserId=${encodeURIComponent(judgeUserId)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', this.BuildHeaders(auth));
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return this.FailedResult(this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on JudgeAssignment delete`, response.Status);
    }

    /**
     * ScheduleTimeSlot create — Models.ScheduleTimeSlot.CreateRequest requires
     * {name, code, startTime, endTime, scheduleDayIds}. The read-side IOF is availableOnlyInDayIds;
     * map it (or an explicit scheduleDayIds) into scheduleDayIds. The path is program-scoped, so the
     * generic path is bypassed and the {programId} template is filled from the attributes.
     */
    private async CreateScheduleTimeSlot(ctx: CreateRecordContext): Promise<CRUDResult> {
        const a = ctx.Attributes;
        const programId = this.RequireNumber(a, 'programId');
        const body = this.BuildTimeSlotBody(a);
        return this.PostCreate(ctx, `/v2/Programs/${encodeURIComponent(String(programId))}/Scheduler/TimeSlots`, body, 'body');
    }

    /**
     * ScheduleTimeSlot update — Models.ScheduleTimeSlot.UpdateRequest mirrors the create shape and
     * also requires scheduleDayIds (mapped from availableOnlyInDayIds). The update path is keyed by
     * the time-slot id (not program-scoped): PATCH /v2/Programs/Scheduler/TimeSlots/{scheduleTimeSlotId}.
     */
    private async UpdateScheduleTimeSlot(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const body = this.BuildTimeSlotBody(ctx.Attributes);
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as OpenWaterAuthContext;
        const url = `${auth.BaseURL}/v2/Programs/Scheduler/TimeSlots/${encodeURIComponent(ctx.ExternalID)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', this.BuildHeaders(auth), body);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return this.FailedResult(this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on ScheduleTimeSlot update`, response.Status);
    }

    /** Shared body for ScheduleTimeSlot create/update: maps availableOnlyInDayIds -> scheduleDayIds. */
    private BuildTimeSlotBody(a: Record<string, unknown>): Record<string, unknown> {
        const scheduleDayIds = a['scheduleDayIds'] ?? a['availableOnlyInDayIds'] ?? [];
        return {
            name: a['name'] ?? a['Name'] ?? '',
            code: a['code'] ?? a['Code'] ?? '',
            startTime: a['startTime'] ?? a['StartTime'],
            endTime: a['endTime'] ?? a['EndTime'],
            scheduleDayIds: Array.isArray(scheduleDayIds) ? scheduleDayIds : [],
        };
    }

    /** Resolve a SessionType id: explicit typeId attribute, else lookup by typeName in the SessionType IO. */
    private async ResolveSessionTypeId(
        ctx: CreateRecordContext,
        a: Record<string, unknown>,
        programId: number
    ): Promise<number | null> {
        const explicit = this.FirstNumber(a, ['typeId']);
        if (explicit != null) return explicit;
        const typeName = a['typeName'] ?? a['TypeName'];
        if (typeof typeName !== 'string' || typeName.length === 0) return null;
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as OpenWaterAuthContext;
        const url = `${auth.BaseURL}/v2/Programs/${encodeURIComponent(String(programId))}/SessionTypes`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) return null;
        const types = this.NormalizeResponse(response.Body, null);
        const match = types.find(t => String(t['name'] ?? t['typeName'] ?? '').toLowerCase() === typeName.toLowerCase());
        if (!match) return null;
        const id = match['id'];
        return typeof id === 'number' ? id : (typeof id === 'string' && id.length > 0 ? Number(id) : null);
    }

    /** POST a hand-built create body and route the result through BuildCreatedResult (id from body). */
    private async PostCreate(
        ctx: CreateRecordContext,
        path: string,
        body: Record<string, unknown>,
        idLocation: 'body' | 'header'
    ): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as OpenWaterAuthContext;
        const url = `${auth.BaseURL}${path}`;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', this.BuildHeaders(auth), body);
        if (response.Status >= 200 && response.Status < 300) {
            const externalID = this.ExtractIDFromResponse(response, idLocation);
            return this.BuildCreatedResult(externalID, response.Status, ctx.ObjectName);
        }
        return this.FailedResult(this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on ${ctx.ObjectName} create`, response.Status);
    }

    // ── Literal-write attribute helpers ──────────────────────────────

    private RequireNumber(a: Record<string, unknown>, key: string): number {
        const v = this.FirstNumber(a, [key]);
        if (v == null) throw new Error(`OpenWater write: required numeric attribute "${key}" is missing.`);
        return v;
    }

    /** First parseable number among candidate keys (case-tolerant), or null. */
    private FirstNumber(a: Record<string, unknown>, keys: string[]): number | null {
        for (const key of keys) {
            for (const k of [key, key.charAt(0).toUpperCase() + key.slice(1)]) {
                const v = a[k];
                if (typeof v === 'number' && Number.isFinite(v)) return v;
                if (typeof v === 'string' && v.length > 0 && Number.isFinite(Number(v))) return Number(v);
            }
        }
        return null;
    }

    private CopyOptional(src: Record<string, unknown>, dest: Record<string, unknown>, keys: string[]): void {
        for (const k of keys) if (src[k] !== undefined) dest[k] = src[k];
    }

    private FailedResult(message: string, statusCode = 0): CRUDResult {
        return { Success: false, StatusCode: statusCode, ErrorMessage: message };
    }

    /**
     * Flat/door fetch with incremental watermark applied. Reuses the base pagination loop by
     * temporarily folding the watermark param into the IO's DefaultQueryParams-equivalent via a
     * one-shot manual paginated loop (so the watermark rides every page request).
     */
    private async FetchDoor(ctx: FetchContext, obj: MJIntegrationObjectEntity): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as OpenWaterAuthContext;
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration, auth);
        const watermarkParam = this.BuildWatermarkParam(obj, ctx.WatermarkValue);
        const path = this.AppendQuery(obj.APIPath, watermarkParam);
        const fields = this.GetCachedFields(obj.ID);
        const pkFieldNames = this.PrimaryKeyNames(fields);

        const { records, newWatermark, hasMore, nextPage } = await this.PaginateLeaf(
            auth, baseURL, path, obj, ctx, undefined, watermarkParam
        );

        return {
            Records: records.map(r => this.BuildExternalRecord(r, obj, fields, pkFieldNames)),
            HasMore: hasMore,
            NextPage: nextPage,
            NewWatermarkValue: newWatermark,
        };
    }

    /**
     * Walks the per-IO AccessPath: query the door, descend the nesting segments to the leaf parent
     * ids, then fetch the entry path once per parent (id in path template or query param), unioning
     * any alternativePaths. An `embedded-array` access path emits records straight from the door.
     */
    private async FetchViaAccessPath(
        ctx: FetchContext,
        obj: MJIntegrationObjectEntity,
        accessPath: AccessPath
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as OpenWaterAuthContext;
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration, auth);
        const fields = this.GetCachedFields(obj.ID);
        const pkFieldNames = this.PrimaryKeyNames(fields);
        const warnings: FetchWarning[] = [];

        // Pull the door collection (paginated) and descend to the parent leaf values + the door rows.
        const doorRows = await this.FetchDoorRows(auth, baseURL, accessPath.doorPath, obj);
        if (doorRows.length === 0) {
            warnings.push({
                Code: 'ZERO_PARENTS',
                Message: `No "${accessPath.door}" door records available; "${obj.Name}" produced zero records.`,
                Data: { door: accessPath.door, doorPath: accessPath.doorPath },
            });
            return { Records: [], HasMore: false, Warnings: warnings };
        }

        // embedded-array: records are already inside the door payload (e.g. Program.rounds[]).
        if (accessPath.extractionMode === 'embedded-array') {
            const records = this.ExtractEmbedded(doorRows, accessPath.nestingSegments ?? []);
            return {
                Records: records.map(r => this.BuildExternalRecord(r, obj, fields, pkFieldNames)),
                HasMore: false,
                Warnings: warnings,
            };
        }

        const parentIDs = this.DescendToParentIDs(doorRows, accessPath);
        if (parentIDs.length === 0) {
            warnings.push({
                Code: 'ZERO_PARENTS',
                Message: `No "${accessPath.parentParamName}" parent ids reachable via ${accessPath.door} ${(accessPath.nestingSegments ?? []).join('->')}; "${obj.Name}" produced zero records.`,
                Data: { door: accessPath.door, parentParamName: accessPath.parentParamName ?? null },
            });
            return { Records: [], HasMore: false, Warnings: warnings };
        }

        const entryPaths = [accessPath.entryPath, ...(accessPath.alternativePaths ?? [])];
        const parentTagName = accessPath.parentParamName; // e.g. roundId / programId / fundId
        const out: ExternalRecord[] = [];
        for (const parentID of parentIDs) {
            for (const entryPath of entryPaths) {
                const leafPath = this.InjectParentID(entryPath, parentID, accessPath);
                if (leafPath == null) continue; // template var this entry path doesn't use
                const { records } = await this.PaginateLeaf(auth, baseURL, leafPath, obj, ctx, parentID, '');
                for (const r of records) {
                    // Tag the leaf with its parent id (e.g. roundId) when the record doesn't already
                    // carry it — makes round/program-scoped objects self-describing for pass-through
                    // AND supplies the round context a literal-create write-back (JudgeAssignment) needs.
                    if (parentTagName && r[parentTagName] == null) r[parentTagName] = parentID;
                    out.push(this.BuildExternalRecord(r, obj, fields, pkFieldNames));
                }
            }
        }
        return { Records: out, HasMore: false, Warnings: warnings };
    }

    /** Fetch all pages of a door collection (used to enumerate parent ids / embedded children). */
    private async FetchDoorRows(
        auth: OpenWaterAuthContext,
        baseURL: string,
        doorPath: string,
        obj: MJIntegrationObjectEntity
    ): Promise<Record<string, unknown>[]> {
        const { records } = await this.PaginateLeaf(auth, baseURL, doorPath, obj, undefined, undefined, '', true);
        return records;
    }

    /**
     * Generic paginated leaf fetch. Loops pageIndex until a short/empty page (or the batch cap when
     * `ctx` is supplied), tracking the max watermark seen across the IO's IncrementalWatermarkField.
     * `forceFullScan` ignores the batch cap (used when enumerating door parents).
     */
    private async PaginateLeaf(
        auth: OpenWaterAuthContext,
        baseURL: string,
        path: string,
        obj: MJIntegrationObjectEntity,
        ctx?: FetchContext,
        _parentID?: string,
        _watermarkParam?: string,
        forceFullScan = false
    ): Promise<{ records: Record<string, unknown>[]; newWatermark?: string; hasMore: boolean; nextPage?: number }> {
        const headers = this.BuildHeaders(auth);
        const pageSize = obj.DefaultPageSize && obj.DefaultPageSize > 0 ? obj.DefaultPageSize : DEFAULT_PAGE_SIZE;
        const batchLimit = !forceFullScan && ctx?.BatchSize ? ctx.BatchSize : Number.MAX_SAFE_INTEGER;
        const watermarkField = obj.IncrementalWatermarkField;
        const all: Record<string, unknown>[] = [];

        let page = ctx?.CurrentPage ?? 0;
        let newWatermark = ctx?.WatermarkValue ?? undefined;
        let hasMore = true;

        while (hasMore && all.length < batchLimit) {
            const sep = path.includes('?') ? '&' : '?';
            const usePaging = obj.SupportsPagination && obj.PaginationType !== 'None';
            const url = usePaging
                ? `${baseURL}${path}${sep}pageIndex=${page}&pageSize=${pageSize}`
                : `${baseURL}${path}`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status === 403 || response.Status === 401) {
                console.warn(`[OpenWater] HTTP ${response.Status} for "${obj.Name}" at ${url} — skipping.`);
                break;
            }
            if (response.Status < 200 || response.Status >= 300) {
                throw this.HttpError(`OpenWater fetch failed for "${obj.Name}": HTTP ${response.Status}`, response);
            }

            const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
            if (records.length === 0) break;
            all.push(...records);

            // Track max watermark seen for the incremental cursor (string/ISO-comparable).
            if (watermarkField) {
                for (const r of records) {
                    const v = r[watermarkField];
                    if (typeof v === 'string' && (newWatermark == null || v > newWatermark)) newWatermark = v;
                }
            }

            if (!usePaging) break;
            const state = this.ExtractPaginationInfo(response.Body, obj.PaginationType, page, 0, pageSize);
            hasMore = state.HasMore;
            page = state.NextPage ?? page + 1;
        }

        return {
            records: all,
            newWatermark: watermarkField ? newWatermark : undefined,
            hasMore: hasMore && all.length >= batchLimit,
            nextPage: page,
        };
    }

    // ── Access-path helpers ──────────────────────────────────────────

    /** Reads and validates AccessPath from the IO's Configuration JSON; null when absent. */
    private ParseAccessPath(obj: MJIntegrationObjectEntity): AccessPath | null {
        if (!obj.Configuration) return null;
        try {
            const parsed = JSON.parse(obj.Configuration) as { AccessPath?: AccessPath };
            const ap = parsed.AccessPath;
            if (!ap || !ap.door || !ap.doorPath || !ap.entryPath) return null;
            return ap;
        } catch {
            console.warn(`[OpenWater] Invalid Configuration JSON for object "${obj.Name}"`);
            return null;
        }
    }

    /**
     * Descends the door rows along the nesting segments to the list of parent ids that get injected
     * into the leaf entry path. For `rounds[]` this yields each round's id; for a direct programId
     * parent (no nesting) it yields each door row's `id`.
     */
    private DescendToParentIDs(doorRows: Record<string, unknown>[], accessPath: AccessPath): string[] {
        // Only `[]`-suffixed segments are real array descents in the door payload (e.g. `rounds[]`,
        // whose leaf `id` is the roundId). A bare segment (e.g. `transactions`) names the leaf API
        // resource that lives in entryPath, NOT a nested array — those parents are the door rows
        // themselves (the door's own `id` IS the parent id, e.g. programId / fundId).
        const arraySegments = (accessPath.nestingSegments ?? []).filter(s => s.endsWith('[]'));
        const ids: string[] = [];
        const seen = new Set<string>();

        const collect = (id: unknown): void => {
            if (id == null) return;
            const s = String(id);
            if (s.length === 0 || seen.has(s)) return;
            seen.add(s);
            ids.push(s);
        };

        if (arraySegments.length === 0) {
            // Direct parent: the door row's own id is the parent id (e.g. programId, fundId).
            for (const row of doorRows) collect(row['id']);
            return ids;
        }

        // Descend nested array segments (e.g. rounds[]), collecting the leaf nodes' ids.
        const nodes = this.WalkSegments(doorRows, arraySegments);
        for (const leaf of nodes) collect(leaf['id']);
        return ids;
    }

    /** Walks the door rows down a chain of (array) field segments, returning the leaf object nodes. */
    private WalkSegments(doorRows: Record<string, unknown>[], segments: string[]): Record<string, unknown>[] {
        let nodes: Record<string, unknown>[] = doorRows;
        for (const seg of segments) {
            const key = seg.endsWith('[]') ? seg.slice(0, -2) : seg;
            const next: Record<string, unknown>[] = [];
            for (const node of nodes) {
                const child = node[key];
                if (Array.isArray(child)) {
                    for (const c of child) if (c && typeof c === 'object') next.push(c as Record<string, unknown>);
                } else if (child && typeof child === 'object') {
                    next.push(child as Record<string, unknown>);
                }
            }
            nodes = next;
        }
        return nodes;
    }

    /** For embedded-array access paths: emit the nested records directly from the door payload. */
    private ExtractEmbedded(doorRows: Record<string, unknown>[], segments: string[]): Record<string, unknown>[] {
        return this.WalkSegments(doorRows, segments);
    }

    /**
     * Injects a parent id into an entry path: as a query param (?<parentParamName>=) when
     * parentParamIn='query' (the roundId-gated endpoints, which 400 without it), otherwise into the
     * {parentParamName} path template. Returns null when a path template var is present but unset
     * (so an alternativePath that uses a different var is skipped, not mis-substituted).
     */
    private InjectParentID(entryPath: string, parentID: string, accessPath: AccessPath): string | null {
        const paramName = accessPath.parentParamName;
        const encoded = encodeURIComponent(parentID);

        if (accessPath.parentParamIn === 'query' && paramName) {
            const sep = entryPath.includes('?') ? '&' : '?';
            return `${entryPath}${sep}${paramName}=${encoded}`;
        }

        // Path-template injection. Substitute the declared parent param if its placeholder is present.
        if (paramName && entryPath.includes(`{${paramName}}`)) {
            return entryPath.replace(`{${paramName}}`, encoded);
        }
        // A single remaining template var (e.g. {roundId}/{programId} in an alternativePath) also
        // takes the parent id; this keeps roundId-based alternative report paths working.
        const m = entryPath.match(/\{(\w+)\}/);
        if (m) return entryPath.replace(m[0], encoded);
        // No template var to fill and not a query param → use as-is (already-flat entry path).
        return entryPath;
    }

    // ── Watermark + record helpers ───────────────────────────────────

    /** Builds the incremental watermark query fragment (e.g. lastModifiedSinceUtc=2026-01-01T...). */
    private BuildWatermarkParam(obj: MJIntegrationObjectEntity, watermarkValue: string | null): string {
        if (!obj.SupportsIncrementalSync || !obj.IncrementalWatermarkField || !watermarkValue) return '';
        return `${obj.IncrementalWatermarkField}=${encodeURIComponent(watermarkValue)}`;
    }

    private AppendQuery(path: string, query: string): string {
        if (!query) return path;
        const sep = path.includes('?') ? '&' : '?';
        return `${path}${sep}${query}`;
    }

    /**
     * Builds an ExternalRecord. Fields carries the FULL source record (custom-column pass-through);
     * runs the TransformRecord-preserving pipeline; resolves the ExternalID from the declared PK
     * (composite-aware) with a content-hash fallback for partial/missing keys.
     */
    private BuildExternalRecord(
        raw: Record<string, unknown>,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        pkFieldNames: string[]
    ): ExternalRecord {
        const transformed = this.applyTransformPreservingKeys(raw, obj, fields);
        const allPkPresent = pkFieldNames.length > 0
            && pkFieldNames.every(name => transformed[name] != null && String(transformed[name]).length > 0);
        const externalID = allPkPresent
            ? pkFieldNames.map(name => String(transformed[name])).join('|')
            : this.ContentHash(transformed);
        return { ExternalID: externalID, ObjectType: obj.Name, Fields: transformed };
    }

    private PrimaryKeyNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pk = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence).map(f => f.Name);
        return pk.length > 0 ? pk : ['id'];
    }

    /** Deterministic fallback identity for partial/missing keys (FNV-1a over the canonical JSON). */
    private ContentHash(record: Record<string, unknown>): string {
        const json = JSON.stringify(record, Object.keys(record).sort());
        let hash = 0x811c9dc5;
        for (let i = 0; i < json.length; i++) {
            hash ^= json.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return `hash:${(hash >>> 0).toString(16)}`;
    }

    // ── Default config ───────────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return { DefaultSchemaName: 'OpenWater', DefaultObjects: [] };
    }

    // ─────────────────────────────────────────────────────────────────
    //                         Private helpers
    // ─────────────────────────────────────────────────────────────────

    private async GetAuth(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<OpenWaterAuthContext> {
        if (!forceRefresh && this.authState) return this.authState;
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const baseURL = this.StripTrailingSlash(config.BaseURL ?? DEFAULT_BASE_URL);
        this.authState = { Config: { ...config, BaseURL: baseURL }, BaseURL: baseURL };
        return this.authState;
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<OpenWaterConnectionConfig> {
        if (companyIntegration.CredentialID) {
            const fromCred = await this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
            if (fromCred) return this.MergeConfigJson(fromCred, companyIntegration.Configuration);
        }
        if (companyIntegration.Configuration) {
            const parsed = JSON.parse(companyIntegration.Configuration) as Record<string, string>;
            return this.ExtractConfig(parsed);
        }
        throw new Error('OpenWater connector requires either CredentialID or Configuration JSON');
    }

    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<OpenWaterConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        const values = JSON.parse(credential.Values) as Record<string, string>;
        return this.ExtractConfig(values, true);
    }

    /** Overlay non-secret config (BaseURL / OrganizationCode) from the CompanyIntegration JSON onto a credential-derived config. */
    private MergeConfigJson(base: OpenWaterConnectionConfig, configJson: string | null): OpenWaterConnectionConfig {
        if (!configJson) return base;
        try {
            const extra = this.ExtractConfig(JSON.parse(configJson) as Record<string, string>, false, true);
            return {
                ...base,
                BaseURL: extra.BaseURL ?? base.BaseURL,
                OrganizationCode: extra.OrganizationCode ?? base.OrganizationCode,
                ClientKey: extra.ClientKey || base.ClientKey,
            };
        } catch {
            return base;
        }
    }

    /**
     * Resolves the connection config from a credential / configuration value bag. ClientKey + ApiKey
     * are required unless `lenient` (used when overlaying optional config JSON onto a credential).
     */
    private ExtractConfig(values: Record<string, string>, requireApiKey = true, lenient = false): OpenWaterConnectionConfig {
        const get = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const hit = Object.entries(values).find(([k]) => k.toLowerCase() === key.toLowerCase());
                if (hit && hit[1] != null && String(hit[1]).length > 0) return String(hit[1]);
            }
            return undefined;
        };

        const clientKey = get('ClientKey', 'clientKey', 'client_key', 'X-ClientKey');
        const apiKey = get('ApiKey', 'apiKey', 'api_key', 'X-ApiKey');
        const organizationCode = get('OrganizationCode', 'organizationCode', 'organization_code', 'X-OrganizationCode');
        const baseURL = get('BaseURL', 'BaseUrl', 'base_url', 'endpoint');

        if (!lenient) {
            if (!clientKey) throw new Error('OpenWater configuration missing required field: ClientKey');
            if (requireApiKey && !apiKey) throw new Error('OpenWater configuration missing required field: ApiKey');
        }

        return {
            ClientKey: clientKey ?? '',
            ApiKey: apiKey ?? '',
            OrganizationCode: organizationCode,
            BaseURL: baseURL ? this.StripTrailingSlash(baseURL) : undefined,
        };
    }

    // ── HTTP helpers ─────────────────────────────────────────────────

    private async ExecuteFetch(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const requestInit: RequestInit = { method, headers, signal: controller.signal };
            if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
                requestInit.body = JSON.stringify(body);
            }
            return await fetch(url, requestInit);
        } finally {
            clearTimeout(timer);
        }
    }

    private async BuildRESTResponse(response: Response): Promise<RESTResponse> {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        const contentType = headers['content-type'] ?? '';
        const body: unknown = contentType.includes('application/json')
            ? await this.ParseJsonSafely(response)
            : await response.text();
        return { Status: response.status, Body: body, Headers: headers };
    }

    private async ParseJsonSafely(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    private ShouldRetry(status: number): boolean {
        return status === 429 || status === 502 || status === 503 || status === 504;
    }

    private ComputeRetryDelay(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const seconds = Number.parseInt(retryAfter, 10);
            if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
        }
        return Math.min(Math.pow(2, attempt) * 1000, 15_000);
    }

    /** Wraps an error message with the response Status + Headers so ExtractRetryAfterMs can read them. */
    private HttpError(message: string, response: RESTResponse): Error & { Status: number; Headers: Record<string, string> } {
        const err = new Error(message) as Error & { Status: number; Headers: Record<string, string> };
        err.Status = response.Status;
        err.Headers = response.Headers;
        return err;
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private StripTrailingSlash(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }
}

/** Tree-shaking prevention — import and call from the module entry point. */
export function LoadOpenWaterConnector(): void { /* intentional no-op */ }
