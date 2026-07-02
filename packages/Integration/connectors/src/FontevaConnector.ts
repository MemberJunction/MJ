import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type SearchContext,
    type SearchResult,
    type SourceSchemaInfo,
    type IntrospectSchemaOptions,
} from '@memberjunction/integration-engine';
import { SalesforceConnector } from './SalesforceConnector.js';

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Per-IntegrationObject Configuration shape for a Fonteva managed-package object.
 * Authored by the extractor into MJ: Integration Objects.Configuration. Drives the
 * IO-name ↔ backing-sObject mapping and the FDService alternate access path.
 *
 * NOTE: this is NOT a baked catalog — it is the runtime-read shape of the per-IO
 * metadata the connector consults to translate the friendly IO `Name` (e.g.
 * "Assignment") into the real Salesforce sObject API name (e.g.
 * "OrderApi__Assignment__c"). The object/field universe itself comes from
 * DiscoverObjects (live global describe) + the Declared metadata, never from a
 * constant in this file.
 */
interface FontevaObjectConfig {
    /** The real Salesforce sObject API name backing this IO (e.g. OrderApi__Assignment__c). */
    BackingSObject?: string;
    /** Managed-package namespace prefix (OrderApi | EventApi). */
    Namespace?: string;
    /** The FDService wrapper class name (e.g. "Assignment"). */
    FDServiceWrapper?: string;
    /** Access-path routing emitted by the extractor. */
    AccessPath?: {
        /** Which layer is the documented primary read path: "FDService" | "Salesforce". */
        primary?: string;
        /** /services/apexrest/FDService/<Service> — the Apex REST domain service path. */
        fdServicePath?: string;
        /** /services/data/v{version}/sobjects/<sObject> — the Salesforce platform path. */
        salesforceSObjectPath?: string;
        /** The sObject queried by SOQL on the platform layer. */
        soqlObject?: string;
    };
}

/**
 * Parsed view of the integration-level Configuration JSON that the Fonteva
 * connector reads at runtime. Only the fields the connector actually uses are
 * typed; the rest of the (documentation-heavy) Configuration is ignored.
 */
interface FontevaConnectionConfig {
    /** Managed-package namespace prefixes to scope discovery to (lower-cased). Default: ['orderapi','eventapi']. */
    ManagedPackageNamespaces: string[];
    /** Base path for FDService Apex REST domain services. Default: '/services/apexrest/FDService'. */
    FDServiceBasePath: string;
    /**
     * When true, read fetch routes through the FDService Apex REST domain services
     * (SearchRequest filter/fields/sort/limit) instead of the default SOQL platform
     * layer. Default false — the SOQL platform path (reused verbatim from
     * SalesforceConnector) is the proven default; FDService is opt-in per connection.
     */
    UseFDServiceForRead: boolean;
}

/** FDService SearchRequest parameters (restapi.fonteva.io Search Request section). */
interface FDServiceSearchParams {
    /** Comma-separated Salesforce Ids to filter by. */
    id?: string;
    /** URL-encoded SOQL WHERE fragment (a.k.a. whereClause). */
    filter?: string;
    /** Comma-separated field API names to return. */
    fields?: string;
    /** Comma-separated field API names to sort by. */
    sort?: string;
    /** Sort direction. */
    sorDir?: string;
    /** Max records to return. */
    limit?: number;
}

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_MANAGED_PACKAGE_NAMESPACES = ['orderapi', 'eventapi'];
const DEFAULT_FDSERVICE_BASE_PATH = '/services/apexrest/FDService';

// ─── FontevaConnector ──────────────────────────────────────────────────

/**
 * Fonteva AMS connector.
 *
 * Fonteva is a Salesforce **managed package** (the OrderApi__ and EventApi__
 * namespaces), so it rides the core Salesforce REST infrastructure verbatim.
 * This connector therefore COMPOSES on {@link SalesforceConnector}, reusing —
 * unchanged — its:
 *   - Salesforce OAuth2 bearer authentication (JWT-bearer / client-credentials),
 *   - global describe object discovery (`/services/data/vXX/sobjects/`),
 *   - per-object `/describe` field discovery,
 *   - SOQL incremental fetch with `nextRecordsUrl` cursor pagination,
 *   - `SystemModstamp` watermark incremental sync,
 *   - generic sObject CRUD (POST/PATCH/DELETE) and the `BuildCreatedResult`
 *     loud-fail-on-empty-ID write contract.
 *
 * The Fonteva-specific layer added here is intentionally thin:
 *   1. **Namespace scoping** — `DiscoverObjects` filters the inherited Salesforce
 *      global describe down to the managed-package namespaces (OrderApi__ /
 *      EventApi__), so the connector surfaces ONLY Fonteva AMS objects (the
 *      standard SF CRM objects are the SalesforceConnector's job).
 *   2. **IO-name ↔ backing-sObject translation** — the friendly IO `Name`
 *      ("Assignment") is mapped to its real sObject API name
 *      ("OrderApi__Assignment__c", read from the IO's Configuration) before
 *      every inherited Salesforce operation, and the returned records'
 *      `ObjectType` is rewritten back to the IO name for engine identity.
 *   3. **FDService domain services** — the `/services/apexrest/FDService/*` Apex
 *      REST services are wired as an opt-in read path with the documented
 *      SearchRequest filter/fields/sort/limit query params.
 *
 * Discovery is the live global-describe MECHANISM (no baked catalog); the object
 * universe is Declared (docs) + Discovered (runtime describe). Writes use the
 * inherited generic sObject CRUD; FDService write shapes are not idiosyncratic
 * enough to warrant overriding the sObject write path (the metadata routes all
 * writes through the platform sObject endpoints).
 */
@RegisterClass(BaseIntegrationConnector, 'FontevaConnector')
export class FontevaConnector extends SalesforceConnector {

    private _fontevaConfig: FontevaConnectionConfig | null = null;

    // ─── Identity (three-way invariant) ──────────────────────────────

    public override get IntegrationName(): string { return 'Fonteva'; }

    /**
     * AUTHORITATIVE discovery (inherited rationale): the scoped global describe
     * enumerates the COMPLETE set of Fonteva managed-package objects the
     * credentials expose, so absence in a refresh genuinely means the object was
     * removed and the engine may safely deactivate it. Kept explicit so the
     * Fonteva-scoped filter doesn't quietly inherit a non-authoritative default.
     */
    public override get DiscoveryIsAuthoritative(): boolean { return true; }

    // ─── Config ──────────────────────────────────────────────────────

    /**
     * Parses the integration-level Configuration JSON for the Fonteva-specific
     * knobs (managed-package namespaces, FDService base path, opt-in FDService
     * read). Tolerant of missing/invalid Configuration — falls back to documented
     * defaults so a freshly-seeded integration works without extra config.
     */
    private GetFontevaConfig(companyIntegration: MJCompanyIntegrationEntity): FontevaConnectionConfig {
        if (this._fontevaConfig) return this._fontevaConfig;

        const defaults: FontevaConnectionConfig = {
            ManagedPackageNamespaces: [...DEFAULT_MANAGED_PACKAGE_NAMESPACES],
            FDServiceBasePath: DEFAULT_FDSERVICE_BASE_PATH,
            UseFDServiceForRead: false,
        };

        const raw = companyIntegration.Configuration;
        if (!raw) {
            this._fontevaConfig = defaults;
            return defaults;
        }

        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const namespaces = Array.isArray(parsed['ManagedPackageNamespaces'])
                ? (parsed['ManagedPackageNamespaces'] as unknown[])
                    .filter((n): n is string => typeof n === 'string')
                    .map(n => n.toLowerCase())
                : defaults.ManagedPackageNamespaces;
            const fdBasePath = typeof parsed['FDServiceBasePath'] === 'string'
                ? parsed['FDServiceBasePath'] as string
                : defaults.FDServiceBasePath;
            const useFDService = parsed['UseFDServiceForRead'] === true;

            this._fontevaConfig = {
                ManagedPackageNamespaces: namespaces.length > 0 ? namespaces : defaults.ManagedPackageNamespaces,
                FDServiceBasePath: fdBasePath,
                UseFDServiceForRead: useFDService,
            };
        } catch {
            this._fontevaConfig = defaults;
        }
        return this._fontevaConfig;
    }

    // ─── Discovery (scoped to the managed-package namespaces) ────────

    /**
     * Discovers Fonteva objects by reusing the inherited Salesforce global
     * describe and filtering it to the managed-package namespaces. NO baked
     * catalog — the list comes entirely from the live `/sobjects/` describe; this
     * method only scopes it and presents the friendly (namespace-stripped) IO name.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const cfg = this.GetFontevaConfig(companyIntegration);
        const all = await super.DiscoverObjects(companyIntegration, contextUser);
        const sObjectToIOName = this.BuildBackingSObjectReverseMap(companyIntegration);

        return all
            .filter(o => this.IsInManagedPackage(o.Name, cfg.ManagedPackageNamespaces))
            .map(o => ({
                ...o,
                // Prefer the DECLARED IO name whose Configuration.BackingSObject matches this sObject —
                // this lets IOs whose name diverges from the mechanical derivation map correctly
                // (Term → OrderApi__Renewal__c, EventChatterGroup → EventApi__Event_Chatter_Groups__c).
                // Fall back to the mechanical namespace-strip + PascalCase when no declared mapping exists
                // (a genuinely Discovered object the metadata doesn't yet name).
                Name: sObjectToIOName.get(o.Name.toLowerCase()) ?? this.SObjectToFriendlyName(o.Name),
            }));
    }

    /**
     * Builds a reverse map (lower-cased backing sObject API name → declared IO Name) from the
     * loaded metadata — the inverse of {@link ResolveBackingSObject}. Used at discovery time so a
     * discovered sObject resolves to the IO the metadata actually declares for it, instead of a
     * mechanically-derived name that may not round-trip (singular/plural, wrapper-vs-sObject renames).
     * Returns an empty map when the engine cache isn't populated (e.g. unit tests) — callers then
     * fall back to {@link SObjectToFriendlyName}.
     */
    private BuildBackingSObjectReverseMap(companyIntegration: MJCompanyIntegrationEntity): Map<string, string> {
        const map = new Map<string, string>();
        try {
            const ios = IntegrationEngineBase.Instance.IntegrationObjects.filter(
                io => io.IntegrationID === companyIntegration.IntegrationID
            );
            for (const io of ios) {
                if (!io.Configuration) continue;
                try {
                    const objCfg = JSON.parse(io.Configuration) as FontevaObjectConfig;
                    if (objCfg.BackingSObject) map.set(objCfg.BackingSObject.toLowerCase(), io.Name);
                } catch { /* unparseable Configuration — skip this IO */ }
            }
        } catch { /* engine cache unavailable — caller falls back to mechanical derivation */ }
        return map;
    }

    /**
     * Discovers fields for a Fonteva object. Translates the friendly IO name back
     * to its backing sObject API name, then reuses the inherited Salesforce
     * `/describe` field discovery verbatim.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const sObject = this.ResolveBackingSObject(companyIntegration, objectName);
        return super.DiscoverFields(companyIntegration, sObject, contextUser);
    }

    /**
     * Full schema introspection scoped to the managed-package namespaces. Defers
     * entirely to the inherited Salesforce introspection (which calls
     * DiscoverObjects — overridden here to scope — then `/describe`s each), but
     * re-resolves any caller-supplied ObjectNames (friendly IO names) to their
     * backing sObjects so the inherited describe loop targets real sObjects.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        options?: IntrospectSchemaOptions
    ): Promise<SourceSchemaInfo> {
        if (options?.ObjectNames && options.ObjectNames.length > 0) {
            const resolved = options.ObjectNames.map(n => this.ResolveBackingSObject(companyIntegration, n));
            return super.IntrospectSchema(companyIntegration, contextUser, { ...options, ObjectNames: resolved });
        }
        return super.IntrospectSchema(companyIntegration, contextUser, options);
    }

    // ─── Fetch (SOQL platform layer reused; FDService opt-in) ────────

    /**
     * Fetches changed records. Default path reuses the inherited Salesforce SOQL
     * incremental fetch (SystemModstamp watermark + nextRecordsUrl cursor)
     * verbatim, with the IO name translated to its backing sObject. When the
     * connection opts into FDService reads (`UseFDServiceForRead`), routes through
     * the FDService Apex REST domain service instead.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const cfg = this.GetFontevaConfig(ctx.CompanyIntegration);
        const ioName = ctx.ObjectName;
        const objCfg = this.GetObjectConfig(ctx.CompanyIntegration, ioName);

        if (cfg.UseFDServiceForRead && objCfg?.AccessPath?.fdServicePath) {
            const batch = await this.FetchViaFDService(ctx, objCfg, cfg);
            return this.RewriteObjectType(batch, ioName);
        }

        const sObject = objCfg?.BackingSObject ?? this.ResolveBackingSObject(ctx.CompanyIntegration, ioName);
        const batch = await super.FetchChanges({ ...ctx, ObjectName: sObject });
        return this.RewriteObjectType(batch, ioName);
    }

    // ─── CRUD (generic sObject path reused; IO name → sObject) ───────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const sObject = this.ResolveBackingSObject(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        return super.CreateRecord({ ...ctx, ObjectName: sObject });
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const sObject = this.ResolveBackingSObject(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        return super.UpdateRecord({ ...ctx, ObjectName: sObject });
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const sObject = this.ResolveBackingSObject(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        return super.DeleteRecord({ ...ctx, ObjectName: sObject });
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const sObject = this.ResolveBackingSObject(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        const record = await super.GetRecord({ ...ctx, ObjectName: sObject });
        if (record) record.ObjectType = ctx.ObjectName;
        return record;
    }

    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const sObject = this.ResolveBackingSObject(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        const result = await super.SearchRecords({ ...ctx, ObjectName: sObject });
        for (const r of result.Records) r.ObjectType = ctx.ObjectName;
        return result;
    }

    // ─── FDService Apex REST domain services ─────────────────────────

    /**
     * Reads records through a Fonteva FDService Apex REST domain service using
     * the documented SearchRequest parameters (filter / fields / sort / limit).
     * The connector follows the SystemModstamp watermark by encoding a SOQL WHERE
     * fragment into the `filter` (a.k.a. whereClause) param.
     *
     * Idiosyncratic to Fonteva: FDService returns the wrapper records under a
     * `records` key (camelCase wrapper properties), with the universal `id`
     * property carrying the Salesforce 18-char Id. There is no documented cursor
     * token, so pagination is bounded by `limit` and advanced by the watermark on
     * subsequent syncs (the connector reports the max SystemModstamp it saw).
     */
    private async FetchViaFDService(
        ctx: FetchContext,
        objCfg: FontevaObjectConfig,
        cfg: FontevaConnectionConfig
    ): Promise<FetchBatchResult> {
        const auth = await this.AuthenticateForFonteva(ctx.CompanyIntegration, ctx.ContextUser);
        const servicePath = objCfg.AccessPath?.fdServicePath ?? this.BuildFDServicePath(cfg, objCfg);

        const params = this.BuildFDServiceSearchParams(ctx);
        const query = this.EncodeFDServiceParams(params);
        const url = `${this.FontevaApiBase(auth)}${servicePath}${query ? `?${query}` : ''}`;
        const headers = this.FontevaHeaders(auth);

        const response = await this.MakeFontevaRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Fonteva FDService GET ${url} returned HTTP ${response.Status}: ${this.PreviewFonteva(response.Body)}`);
        }

        const records = this.ParseFDServiceRecords(response.Body, ctx.ObjectName);
        const newWatermark = this.MaxSystemModstamp(records);

        return {
            Records: records,
            HasMore: false,
            NewWatermarkValue: newWatermark ?? undefined,
        };
    }

    /** Builds SearchRequest params from the fetch context (watermark → filter). */
    private BuildFDServiceSearchParams(ctx: FetchContext): FDServiceSearchParams {
        const params: FDServiceSearchParams = {
            limit: ctx.BatchSize > 0 ? ctx.BatchSize : undefined,
            sort: 'SystemModstamp',
            sorDir: 'ASC',
        };
        if (ctx.WatermarkValue) {
            params.filter = `SystemModstamp >= ${this.FormatFDServiceDateTime(ctx.WatermarkValue)}`;
        }
        if (ctx.RequestedSourceFields && ctx.RequestedSourceFields.length > 0) {
            params.fields = ctx.RequestedSourceFields.join(',');
        }
        return params;
    }

    private EncodeFDServiceParams(params: FDServiceSearchParams): string {
        const usp = new URLSearchParams();
        if (params.id) usp.set('id', params.id);
        if (params.filter) usp.set('filter', params.filter);
        if (params.fields) usp.set('fields', params.fields);
        if (params.sort) usp.set('sort', params.sort);
        if (params.sorDir) usp.set('sorDir', params.sorDir);
        if (params.limit != null) usp.set('limit', String(params.limit));
        return usp.toString();
    }

    private FormatFDServiceDateTime(value: string): string {
        return value.includes('T') ? value : `${value}T00:00:00.000Z`;
    }

    /**
     * Parses an FDService response into ExternalRecords. FDService wraps records
     * under a `records` array (each a flat camelCase wrapper object whose `id`
     * carries the Salesforce Id). Preserves the FULL record into Fields for
     * custom-column capture — no narrow projection.
     */
    private ParseFDServiceRecords(body: unknown, objectType: string): ExternalRecord[] {
        const envelope = body as { records?: unknown[] } | unknown[];
        const list = Array.isArray(envelope)
            ? envelope
            : Array.isArray(envelope?.records) ? envelope.records : [];
        return list.map(item => {
            const raw = item as Record<string, unknown>;
            const id = String(raw['id'] ?? raw['Id'] ?? '');
            const modstamp = (raw['SystemModstamp'] ?? raw['systemModstamp']) as string | undefined;
            return {
                ExternalID: id,
                ObjectType: objectType,
                Fields: { ...raw }, // full record pass-through (custom-column capture contract)
                ModifiedAt: modstamp ? new Date(modstamp) : undefined,
            };
        });
    }

    private MaxSystemModstamp(records: ExternalRecord[]): string | null {
        let max: string | null = null;
        for (const r of records) {
            const stamp = (r.Fields['SystemModstamp'] ?? r.Fields['systemModstamp']) as string | undefined;
            if (stamp && (!max || stamp > max)) max = stamp;
        }
        if (!max) return null;
        const parsed = new Date(max);
        if (Number.isNaN(parsed.getTime())) return max;
        // Advance 1ms so the next `>=` filter excludes the boundary cluster (mirrors the SOQL path).
        return new Date(parsed.getTime() + 1).toISOString();
    }

    private BuildFDServicePath(cfg: FontevaConnectionConfig, objCfg: FontevaObjectConfig): string {
        const wrapper = objCfg.FDServiceWrapper ?? 'Order';
        return `${cfg.FDServiceBasePath}/${wrapper}Service`;
    }

    // ─── Backing-sObject resolution ──────────────────────────────────

    /**
     * Resolves the friendly IO `Name` to its backing Salesforce sObject API name.
     * Reads the IO's Configuration.BackingSObject from the engine cache; falls
     * back to a namespace-prefixed PascalSnake derivation when metadata isn't
     * loaded (e.g. unit tests) or the IO already IS a fully-qualified sObject.
     */
    private ResolveBackingSObject(companyIntegration: MJCompanyIntegrationEntity, ioName: string): string {
        const objCfg = this.GetObjectConfig(companyIntegration, ioName);
        if (objCfg?.BackingSObject) return objCfg.BackingSObject;
        // Already a fully-qualified managed-package sObject — pass through unchanged.
        if (/__c$/i.test(ioName)) return ioName;
        return ioName; // best-effort: unmapped name used verbatim (describe will surface a clear error)
    }

    /** Reads + parses the per-IO Configuration from the engine cache. Returns null if unavailable. */
    private GetObjectConfig(companyIntegration: MJCompanyIntegrationEntity, ioName: string): FontevaObjectConfig | null {
        try {
            const obj = IntegrationEngineBase.Instance.GetIntegrationObject(companyIntegration.IntegrationID, ioName);
            if (!obj?.Configuration) return null;
            return JSON.parse(obj.Configuration) as FontevaObjectConfig;
        } catch {
            return null;
        }
    }

    // ─── Namespace + name helpers ────────────────────────────────────

    private IsInManagedPackage(sObjectName: string, namespaces: string[]): boolean {
        const lower = sObjectName.toLowerCase();
        return namespaces.some(ns => lower.startsWith(`${ns}__`));
    }

    /**
     * Presents a managed-package sObject API name as a friendly IO name by
     * stripping the namespace prefix and the `__c` suffix and PascalCasing the
     * snake segments (e.g. OrderApi__Sales_Order_Line__c → SalesOrderLine).
     */
    private SObjectToFriendlyName(sObjectName: string): string {
        const withoutNamespace = sObjectName.replace(/^[A-Za-z]+__/i, '');
        const withoutSuffix = withoutNamespace.replace(/__c$/i, '');
        return withoutSuffix
            .split('_')
            .filter(seg => seg.length > 0)
            .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
            .join('');
    }

    /** Rewrites a fetch batch's record ObjectType from the backing sObject back to the IO name. */
    private RewriteObjectType(batch: FetchBatchResult, ioName: string): FetchBatchResult {
        for (const r of batch.Records) r.ObjectType = ioName;
        return batch;
    }

    // ─── Reuse-friendly thin wrappers over inherited protected helpers ──
    // SalesforceConnector exposes Authenticate / BuildHeaders / MakeHTTPRequest /
    // GetBaseURL as protected; these named wrappers keep the FDService code paths
    // readable and route ALL FDService HTTP through the same auth + mock-redirect
    // surface the inherited SOQL path uses (so FDService is mock-testable too).

    private async AuthenticateForFonteva(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo) {
        return this.Authenticate(companyIntegration, contextUser);
    }

    private FontevaHeaders(auth: Awaited<ReturnType<FontevaConnector['AuthenticateForFonteva']>>): Record<string, string> {
        return this.BuildHeaders(auth);
    }

    private async MakeFontevaRequest(
        auth: Awaited<ReturnType<FontevaConnector['AuthenticateForFonteva']>>,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ) {
        return this.MakeHTTPRequest(auth, url, method, headers, body);
    }

    private FontevaApiBase(auth: Awaited<ReturnType<FontevaConnector['AuthenticateForFonteva']>>): string {
        return this.GetBaseURL(auth.CompanyIntegration, auth);
    }

    private PreviewFonteva(body: unknown): string {
        if (typeof body === 'string') return body.slice(0, 500);
        try { return JSON.stringify(body).slice(0, 500); } catch { return String(body); }
    }
}

/** Tree-shaking prevention: referenced from index.ts so the @RegisterClass survives bundling. */
export function LoadFontevaConnector(): void { /* no-op */ }
