import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
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
 * PropFuel data-export file-feed connector.
 *
 * PropFuel exposes a per-tenant hourly data-export feed as a set of JSON files. There is NO
 * public OpenAPI spec and NO describe/introspection endpoint, so this connector encodes the
 * DISCOVERY MECHANISM, never a baked answer:
 *
 *  - {@link DiscoverObjects} calls `GET /dataexport/{AccountID}/list` and derives each object
 *    from the `[microtime]-[datatype].json` filename suffix. The concrete data-type set is
 *    whatever the live listing actually contains — never a static `PROPFUEL_STREAMS` array.
 *  - {@link DiscoverFields} lists the files for a data type, downloads ONE sample file, and
 *    streams its records through the base {@link DiscoverFieldsViaStream} helper to derive the
 *    field set + data-informed soft-PK from real values — never a frozen `STREAM_FIELDS` catalog.
 *
 * Incremental sync uses a SYNTHETIC, FILE-LEVEL, CLIENT-SIDE cursor `__file_microtime`: the feed
 * is append-only and chronologically sortable by the filename microtime prefix, so the connector
 * resumes by tracking the max microtime seen across processed files (WatermarkService). The vendor
 * `ack` endpoint is operational state and is NOT used as the read-only incremental cursor.
 *
 * READ-ONLY: the data-export feed creates/updates/deletes no source records, so all write
 * capability getters stay false and no ack/POST/delete path is exercised.
 *
 * AccountID and the bearer Token both come from the credential (or Configuration JSON) — the
 * AccountID is per-tenant config and is NEVER hardcoded.
 */
@RegisterClass(BaseIntegrationConnector, 'PropFuelConnector')
export class PropFuelConnector extends BaseRESTIntegrationConnector {

    /** Verbatim three-way invariant name: ClassName / IntegrationName getter / MJ: Integrations.Name. */
    public override get IntegrationName(): string {
        return 'PropFuel';
    }

    // ─── Capability surface (read-only file feed) ────────────────────
    // SupportsCreate/Update/Delete stay false (BaseIntegrationConnector defaults). The data-export
    // feed is a pull-only source; the ack endpoint is operational and is not modelled as a write.

    /**
     * KEYSET / no-watermark resume hint: every PropFuel object is a data-export file stream ordered
     * by the filename microtime prefix, so 'microtime' is the stable, monotonic ordering key for all
     * of them (the docs-provable feed object and every runtime-discovered data-type stream alike).
     */
    public override StableOrderingKey(_objectName: string): string | null {
        return MICROTIME_ORDERING_KEY;
    }

    /**
     * The file-feed microtime IS a reliable monotonic high-water mark: PropFuel emits export files in
     * ascending microtime order, and an updated record re-appears in a NEW (higher-microtime) file. So
     * `NewWatermarkValue` (= max microtime seen) is the true global max — the engine can NARROW the next
     * incremental to `microtime > watermark` instead of clearing the keyset position and re-scanning the
     * whole stream every run. Without this, a clean sync's keyset-resume marker is cleared and every
     * incremental re-walks the entire object (correct via content-hash, but wasteful at scale).
     */
    public override get MonotonicWatermark(): boolean {
        return true;
    }

    // ─── Auth + transport (BaseRESTIntegrationConnector abstracts) ────

    /**
     * Resolves the bearer Token + per-tenant AccountID from the linked Credential entity, falling
     * back to the CompanyIntegration.Configuration JSON. The credential bytes never leave this scope.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<PropFuelAuthContext> {
        const creds = await this.LoadCredentials(companyIntegration, contextUser);
        return { Token: creds.Token, AccountID: creds.AccountID, BaseHost: creds.BaseHost };
    }

    /** Static Bearer header. No crypto/signing is required for a static token, so no auth-helper is used. */
    protected BuildHeaders(auth: PropFuelAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
        };
    }

    /** Base URL for the data-export feed, tenant-scoped by the resolved AccountID. */
    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: PropFuelAuthContext): string {
        return `${auth.BaseHost ?? PROPFUEL_HOST}/dataexport/${encodeURIComponent(auth.AccountID)}`;
    }

    /**
     * Executes an HTTP request via fetch. Parses JSON when the response is JSON, else returns the
     * raw text body. The concrete connector owns the transport seam so tests can override it.
     */
    protected async MakeHTTPRequest(
        _auth: PropFuelAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const init: RequestInit = { method, headers };
        if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
            (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
        const response = await fetch(url, init);
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value; });
        const text = await response.text();
        let parsed: unknown = text;
        const contentType = responseHeaders['content-type'] ?? '';
        if (contentType.includes('json') || (text.length > 0 && (text[0] === '{' || text[0] === '['))) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        return { Status: response.status, Body: parsed, Headers: responseHeaders };
    }

    /**
     * The download response for a data-export file is a JSON array of records (no envelope). When a
     * vendor wraps records under a key, that key is honored; otherwise a root array / single object
     * is normalized to an array.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (responseDataKey && rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
            const inner = (rawBody as Record<string, unknown>)[responseDataKey];
            if (Array.isArray(inner)) return inner.filter(isRecord);
        }
        if (Array.isArray(rawBody)) return rawBody.filter(isRecord);
        if (isRecord(rawBody)) return [rawBody];
        return [];
    }

    /**
     * The file feed has no in-file pagination — each downloaded file is read whole. File-level
     * paging across the listing is handled by {@link FetchChanges} via the microtime cursor.
     */
    protected ExtractPaginationInfo(
        _rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        return { HasMore: false };
    }

    /** Tests connectivity by listing the tenant's available data-export files. */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const response = await this.ListFiles(auth);
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `Authentication failed (HTTP ${response.Status}) listing PropFuel data-export files.` };
            }
            if (response.Status < 200 || response.Status >= 300) {
                return { Success: false, Message: `PropFuel list endpoint returned HTTP ${response.Status}.` };
            }
            const files = this.ParseFileListing(response.Body);
            return { Success: true, Message: `Connected to PropFuel account ${auth.AccountID}; ${files.length} data-export file(s) available.` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `PropFuel connection error: ${message}` };
        }
    }

    // ─── Runtime discovery MECHANISM (NOT a baked catalog) ───────────

    /**
     * Discovers objects by listing the live data-export files and deriving the distinct data-type
     * suffix from each `[microtime]-[datatype].json` filename. The returned object set is exactly
     * what the source currently exposes — the frozen contract's `propfuel_data_export_file` is the
     * VERIFICATION FLOOR (discovery must surface at least the feed), never a ceiling.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const response = await this.ListFiles(auth);
        this.AssertOK(response, 'list data-export files');
        const files = this.ParseFileListing(response.Body);

        const dataTypes = new Set<string>();
        for (const f of files) {
            const parsed = parseFileName(f);
            if (parsed) dataTypes.add(parsed.dataType);
        }

        return [...dataTypes].sort().map(dataType => ({
            Name: dataType,
            Label: dataType,
            Description: `PropFuel data-export stream "${dataType}" (discovered from the data-export file listing).`,
            SupportsIncrementalSync: true,
            SupportsWrite: false,
        }));
    }

    /**
     * Discovers fields by downloading ONE sample file for the data type and streaming its records
     * through the base data-informed discovery helper. The field set + soft-PK come from the real
     * values the source returns — never a static `STREAM_FIELDS` map. READ-ONLY: the sample file is
     * fetched and parsed, never acked.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const response = await this.ListFiles(auth);
        this.AssertOK(response, 'list data-export files');
        const files = this.ParseFileListing(response.Body);

        // Pick the most-recent file (max microtime) of this data type as the discovery sample.
        const sample = files
            .map(f => ({ file: f, parsed: parseFileName(f) }))
            .filter(x => x.parsed && x.parsed.dataType === objectName)
            .sort((a, b) => compareMicrotime(b.parsed!.microtime, a.parsed!.microtime))[0];

        if (!sample) return [];

        const records = await this.DownloadFileRecords(auth, sample.file);
        // Data-informed discovery: full field corpus + statistics-first soft-PK over the real records.
        // Default Pk options let the helper combine uniqueness/null statistics with the built-in
        // naming-convention rank (defaultPkNameRank) to pick a best-available soft key.
        return this.DiscoverFieldsViaStream(records, { ReadOnly: true });
    }

    // ─── Incremental fetch via the synthetic file-level microtime cursor ──

    /**
     * Fetches records for a data type using the synthetic `__file_microtime` cursor.
     *
     * Mechanism: load the stored cursor (max microtime processed), list the live files, select the
     * files of this data type whose microtime exceeds the cursor (ascending microtime order), and
     * download each, emitting every record with full-record pass-through. The max microtime seen
     * across the processed files is persisted as the new cursor — ONLY on full-batch success, so a
     * partial failure leaves the cursor unchanged and the next run resumes from the same point.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const listResponse = await this.ListFiles(auth);
        this.AssertOK(listResponse, 'list data-export files');
        const allFiles = this.ParseFileListing(listResponse.Body);

        // The resume cursor: prefer the engine-provided keyset position, else the watermark value.
        const cursor = ctx.AfterKeyValue ?? ctx.WatermarkValue ?? null;

        const candidates = allFiles
            .map(f => ({ file: f, parsed: parseFileName(f) }))
            .filter((x): x is { file: string; parsed: ParsedFileName } => x.parsed != null && x.parsed.dataType === ctx.ObjectName)
            .filter(x => cursor == null || compareMicrotime(x.parsed.microtime, cursor) > 0)
            .sort((a, b) => compareMicrotime(a.parsed.microtime, b.parsed.microtime));

        const records: ExternalRecord[] = [];
        let maxMicrotime = cursor ?? '';
        const batchLimit = ctx.BatchSize && ctx.BatchSize > 0 ? ctx.BatchSize : Number.MAX_SAFE_INTEGER;
        let filesProcessed = 0;

        for (const candidate of candidates) {
            if (records.length >= batchLimit) break;
            const fileRecords = await this.DownloadFileRecords(auth, candidate.file);
            for (const raw of fileRecords) {
                // Full-record pass-through: the COMPLETE source record reaches ExternalRecord.Fields
                // so the framework's custom-column capture sees every key the source returned.
                records.push({
                    ExternalID: this.BuildRecordIdentity(raw, candidate.parsed),
                    ObjectType: ctx.ObjectName,
                    Fields: raw,
                });
            }
            if (compareMicrotime(candidate.parsed.microtime, maxMicrotime) > 0) {
                maxMicrotime = candidate.parsed.microtime;
            }
            filesProcessed++;
        }

        const moreFiles = filesProcessed < candidates.length;
        const result: FetchBatchResult = {
            Records: records,
            HasMore: moreFiles,
        };
        if (maxMicrotime && maxMicrotime !== (cursor ?? '')) {
            // Surface the new cursor both as the watermark value and the keyset resume position.
            result.NewWatermarkValue = maxMicrotime;
            result.NextAfterKeyValue = maxMicrotime;
        }
        return result;
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    /** Issues the list call. Path is relative; BuildHeaders + GetBaseURL supply auth + host. */
    private async ListFiles(auth: PropFuelAuthContext): Promise<RESTResponse> {
        const url = `${this.GetBaseURL({} as MJCompanyIntegrationEntity, auth)}/list`;
        return this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
    }

    /** Downloads one file by name and returns its records (read-only; never acked). */
    private async DownloadFileRecords(auth: PropFuelAuthContext, file: string): Promise<Record<string, unknown>[]> {
        const url = `${this.GetBaseURL({} as MJCompanyIntegrationEntity, auth)}/download/${encodeURIComponent(file)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        this.AssertOK(response, `download file ${file}`);
        return this.NormalizeResponse(response.Body, null);
    }

    /**
     * Parses the list endpoint body into an array of file names. The listing may be a bare array of
     * strings, an array of objects with a name/file/filename key, or an object wrapping such an array.
     */
    private ParseFileListing(body: unknown): string[] {
        const arr = Array.isArray(body)
            ? body
            : (isRecord(body) ? this.FindArrayInObject(body) : []);
        const files: string[] = [];
        for (const item of arr) {
            if (typeof item === 'string') {
                files.push(item);
            } else if (isRecord(item)) {
                const name = item['name'] ?? item['file'] ?? item['filename'] ?? item['fileName'] ?? item['key'];
                if (typeof name === 'string') files.push(name);
            }
        }
        return files;
    }

    /** Finds the first array-valued property of an object (the file listing under a wrapper key). */
    private FindArrayInObject(obj: Record<string, unknown>): unknown[] {
        for (const v of Object.values(obj)) {
            if (Array.isArray(v)) return v;
        }
        return [];
    }

    /**
     * Builds a stable record identity. The per-record schema is undocumented (no provable PK), so
     * the connector prefers a common id key when one is present and otherwise falls back to a
     * deterministic content hash scoped to the file's microtime — the base engine dedupes by the
     * record-map + content hash regardless.
     */
    private BuildRecordIdentity(raw: Record<string, unknown>, parsed: ParsedFileName): string {
        for (const k of ['id', 'ID', 'Id', 'uuid', 'externalID', 'ExternalID']) {
            const v = raw[k];
            if (typeof v === 'string' && v.length > 0) return v;
            if (typeof v === 'number') return String(v);
        }
        return `${parsed.microtime}:${stableHash(raw)}`;
    }

    /** Throws a descriptive error on a non-2xx response (404 included, since a missing file is unexpected here). */
    private AssertOK(response: RESTResponse, action: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`PropFuel failed to ${action}: HTTP ${response.Status}`);
        }
    }

    /**
     * Resolves the bearer Token + per-tenant AccountID from the linked Credential entity, falling
     * back to the CompanyIntegration.Configuration JSON. AccountID is per-tenant config — NEVER hardcoded.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<PropFuelCredentials> {
        let token: string | undefined;
        let accountID: string | undefined;
        let baseHost: string | undefined;

        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (fromCred) {
                token = fromCred.Token ?? token;
                accountID = fromCred.AccountID ?? accountID;
            }
        }

        // Configuration JSON supplies AccountID (and a token fallback) when not on the credential.
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const fromConfig = this.ParseCredentialJson(configJson);
            if (fromConfig) {
                token = token ?? fromConfig.Token;
                accountID = accountID ?? fromConfig.AccountID;
                baseHost = baseHost ?? fromConfig.BaseHost;
            }
        }

        if (!token) {
            throw new Error('No PropFuel credential or Configuration JSON found — a "Token" is required.');
        }
        if (!accountID) {
            throw new Error('No PropFuel AccountID found — set "AccountID" on the credential or Configuration JSON (it is per-tenant, never hardcoded).');
        }
        return { Token: token, AccountID: accountID, BaseHost: baseHost };
    }

    /** Loads Token/AccountID from a Credential entity's Values JSON. */
    private async LoadFromCredentialEntity(credentialID: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<PropFuelCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    /** Parses a JSON string to extract Token + AccountID (tolerant of casing/aliases). */
    private ParseCredentialJson(json: string): PropFuelCredentials | null {
        try {
            const result = PropFuelCredentialSchema.safeParse(JSON.parse(json));
            if (!result.success) return null;
            const p = result.data;
            const token = p.Token ?? p.token ?? p.apiKey ?? p.ApiKey;
            const accountID = p.AccountID ?? p.accountId ?? p.accountID;
            if (!token && accountID == null) return null;
            const baseHost = p.apiBaseUrl ?? p.BaseURL;
            return { Token: token ?? '', AccountID: accountID != null ? String(accountID) : '', BaseHost: baseHost } as PropFuelCredentials;
        } catch {
            return null;
        }
    }
}

// ─── Module-level constants + helpers (mechanism, NOT a catalog) ──────

/** PropFuel host root. Tenant + endpoint are appended at runtime. */
const PROPFUEL_HOST = 'https://app.propfuel.com';

/** Stable ordering key name for keyset/no-watermark resume — the filename microtime prefix. */
const MICROTIME_ORDERING_KEY = 'microtime';

/** Auth context: resolved bearer token + per-tenant AccountID. */
interface PropFuelAuthContext extends RESTAuthContext {
    Token: string;
    AccountID: string;
    /** Non-secret host override (e.g. a local mock for replay testing). Defaults to PROPFUEL_HOST. */
    BaseHost?: string;
}

/** Resolved PropFuel credentials. */
interface PropFuelCredentials {
    Token: string;
    AccountID: string;
    /** Optional non-secret host override from Configuration (apiBaseUrl/BaseURL). */
    BaseHost?: string;
}

/** Parsed `[microtime]-[datatype].json` filename. */
interface ParsedFileName {
    microtime: string;
    dataType: string;
}

/** Zod schema for the credential/Configuration JSON shape (tolerant of casing aliases). */
const PropFuelCredentialSchema = z.object({
    Token: z.string().optional(),
    token: z.string().optional(),
    apiKey: z.string().optional(),
    ApiKey: z.string().optional(),
    AccountID: z.union([z.string(), z.number()]).optional(),
    accountId: z.union([z.string(), z.number()]).optional(),
    accountID: z.union([z.string(), z.number()]).optional(),
    apiBaseUrl: z.string().optional(),
    BaseURL: z.string().optional(),
}).passthrough();

/** Narrows an unknown value to a plain record. */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parses a PropFuel data-export filename of the form `[microtime]-[datatype].json`.
 * The microtime is the leading numeric segment (PHP microtime, e.g. `1717804800.123456`); the data
 * type is everything between the first `-` and the `.json` suffix. Returns null when the name does
 * not match the convention.
 */
export function parseFileName(fileName: string): ParsedFileName | null {
    // Strip any path prefix and the .json extension.
    const base = fileName.split('/').pop() ?? fileName;
    const noExt = base.replace(/\.json$/i, '');
    const dashIndex = noExt.indexOf('-');
    if (dashIndex <= 0) return null;
    const microtime = noExt.slice(0, dashIndex);
    const dataType = noExt.slice(dashIndex + 1);
    if (!/^[0-9]+(\.[0-9]+)?$/.test(microtime) || dataType.length === 0) return null;
    return { microtime, dataType };
}

/**
 * Compares two microtime strings chronologically. Microtimes are numeric (possibly fractional);
 * numeric comparison avoids lexical pitfalls (e.g. different integer widths). Returns >0 when a>b.
 */
export function compareMicrotime(a: string, b: string): number {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
        return na === nb ? 0 : (na > nb ? 1 : -1);
    }
    return a === b ? 0 : (a > b ? 1 : -1);
}

/** Small deterministic hash for record identity fallback (FNV-1a, hex). */
function stableHash(record: Record<string, unknown>): string {
    const json = JSON.stringify(record, Object.keys(record).sort());
    let h = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) {
        h ^= json.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}
