/**
 * NetForumConnector — netFORUM Enterprise xWeb SOAP/XML integration connector.
 *
 * Protocol: SOAP 1.1 over HTTPS. There is NO `BaseSOAPIntegrationConnector` in the
 * engine — the only protocol bases are `BaseIntegrationConnector` (grandparent) and
 * `BaseRESTIntegrationConnector`. This connector rides `BaseRESTIntegrationConnector`
 * and implements SOAP over its HTTP seam: it POSTs SOAP 1.1 envelopes to
 * `/xweb/secure/netForumXML.asmx` via `MakeHTTPRequest` and parses the XML in
 * `NormalizeResponse`. The transport is text/xml, not JSON.
 *
 * ── Wire truth (from the public WSDL: sources/netForumXML_asm.wsdl, 5.9 MB, 277 ops) ──
 *
 *   Endpoint   : POST <tenantHost>/xweb/secure/netForumXML.asmx   (Content-Type: text/xml; charset=utf-8)
 *   Namespace  : http://www.avectra.com/2005/   (Avectra-era, retained by Community Brands)
 *   SOAPAction : http://www.avectra.com/2005/<MethodName>
 *
 *   Auth (TWO-STEP, SOAP — NOT HTTP Basic / WWW-Authenticate / Bearer):
 *     1. Authenticate(userName, password) → AuthenticateResult (the token string).
 *        The Authenticate envelope carries NO AuthorizationToken header — it is the bootstrap.
 *     2. Every subsequent data/CRUD call carries the token in the SOAP HEADER element:
 *          <AuthorizationToken xmlns="http://www.avectra.com/2005/"><Token>{token}</Token></AuthorizationToken>
 *        (NOT an HTTP Authorization header.) Source: WSDL `AuthorizationToken` complexType +
 *        `<soap:header part="AuthorizationToken">` on every WEB-prefixed / GetQuery operation binding.
 *
 *   Read (door = GetQuery):
 *     GetQuery(szObjectName, szColumnList, szWhereClause?, szOrderBy?) → GetQueryResult
 *       - GetQueryResult is a `<s:any>` wildcard DataSet — flattened rows, one element per row.
 *       - Incremental: szWhereClause = "<watermarkField> >= '<wm>'" where the watermark column is
 *         the IO's per-facade `IncrementalWatermarkField` (e.g. ind_change_date, evt_*_change_date).
 *         There is NO canonical `LastModifiedDate` column — the field is per-facade and is read
 *         from metadata, never hardcoded.
 *       - Row limit: szObjectName supports an `@TOP -1` / `@TOP N` modifier to bypass / bound the
 *         server-side DataGrid row cap. The connector requests the modifier from the IO's accessPath.
 *
 *   Discovery (mechanism, NOT a baked catalog):
 *     - Standard objects come from the Declared metadata (the persisted IntegrationObject rows in
 *       the engine cache — credential-free docs → static metadata, case 1). `DiscoverObjects`
 *       returns the cache; it does NOT enumerate a hardcoded `NF_OBJECTS` array (that was the bug
 *       this IMPROVE round removes).
 *     - Per-object field definitions come from `GetQueryDefinition(szObjectName)` at runtime
 *       (credential-gated, case 2): the response carries the SQL column definition
 *       (Object → ListTable → ListFromTables → ListFromTable[] → Columns → Column[]). The connector
 *       parses that into ExternalFieldSchema. With no credential it falls back to the Declared
 *       fields. The customer's own installed query objects (variable per installation) are reached
 *       the same way — GetQueryDefinition is the discovery MECHANISM, never an answer baked in code.
 *     - `DiscoveryIsAuthoritative` is FALSE: discovery extends the Declared baseline, it does not
 *       enumerate the full credential gamut, so absence in a refresh must NEVER deactivate.
 *
 *   Write (facade CRUD — only where metadata declares the capability + per-operation columns):
 *     - Create/Update route through the IO's per-operation columns (CreateAPIPath/CreateMethod/
 *       CreateBodyShape/CreateBodyKey/CreateIDLocation, Update*) which name the SOAP operation
 *       (e.g. WEBIndividualInsert, InsertFacadeObject). The connector wraps the attributes in a
 *       SOAP envelope for that operation and routes the result through BuildCreatedResult so a 2xx
 *       with no record key fails loudly (no silent record loss / duplicate-create next sync).
 *     - SupportsDelete = false. `DeleteFacadeObject` is not confirmed in any reachable vendor doc;
 *       netFORUM prefers soft-delete via status flags. Held false until verified.
 *
 * Vendor doc URLs:
 *   - WSDL (primary)  : https://myasm.asm.org/xweb/secure/netforumxml.asmx?WSDL
 *   - xWeb Overview   : https://documentation.abila.com/netforum-enterprise/2017.1/Content/xWeb/XWeb_Overview.htm
 *   - GetQuery        : https://documentation.abila.com/netforum-enterprise/2017.1/Content/xWeb/Methods/GetQuery.htm
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
} from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type FetchContext,
    type FetchBatchResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
} from '@memberjunction/integration-engine';

// ─── Constants ───────────────────────────────────────────────────────

/** Avectra-era SOAP namespace, retained by Community Brands. All ops + types use it. */
const SOAP_NS = 'http://www.avectra.com/2005/';
/** Canonical xWeb SOAP endpoint path (per-tenant host; path is constant). */
const DEFAULT_SOAP_PATH = '/xweb/secure/netForumXML.asmx';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 200;
/** Session-token TTL. netFORUM does not publish a token lifetime; re-auth on 401 covers expiry. */
const TOKEN_TTL_MS = 3_600_000;

// ─── Config / auth types ─────────────────────────────────────────────

export interface NetForumConnectionConfig {
    BaseURL: string;
    Username: string;
    Password: string;
}

interface NFAuthContext extends RESTAuthContext {
    /** The session token returned by Authenticate (carried in the SOAP AuthorizationToken header). */
    Token: string;
    Config: NetForumConnectionConfig;
}

interface CachedToken {
    Token: string;
    ExpiresAt: number;
}

/**
 * The per-IO access path the extractor emits into IntegrationObject.Configuration. Read at fetch
 * time so the connector walks the documented door/query rather than assuming one flat query per
 * object. All fields optional — a depth-0 directly-queryable object carries an empty nestingPath.
 */
interface NFAccessPath {
    door?: string;
    queryObject?: string;
    nestingPath?: string[];
    doorArgs?: { szObjectName?: string; topModifier?: string };
}

/** Shape of the per-IO Configuration JSON relevant to this connector. */
interface NFObjectConfig {
    accessPath?: NFAccessPath;
    stableOrderingKey?: string;
    soapEndpoint?: string;
    soapNamespace?: string;
    getOperation?: string;
    createSoapAction?: string;
    updateSoapAction?: string;
    writeOps?: { createOp?: string; updateOp?: string };
}

@RegisterClass(BaseIntegrationConnector, 'NetForumConnector')
export class NetForumConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'NetForum Enterprise'; }

    // Capability flags — kept in lockstep with the metadata's per-operation columns.
    // Create/Update are declared on a subset of IOs (those with WEB*Insert/Update or a facade op);
    // the generic CRUD path throws for an IO whose columns are null, so a flag here only asserts
    // "at least one IO supports it". Delete stays false (DeleteFacadeObject unconfirmed in docs).
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return false; }

    /**
     * §7 — discovery is NOT an authoritative full-gamut enumeration. `DiscoverObjects` returns the
     * Declared baseline (engine cache) and GetQueryDefinition only extends per-object fields; neither
     * enumerates the complete set of objects the credentials expose (customer-installed queries vary).
     * So absence in a refresh proves nothing → the comprehensive-refresh deactivation path must stay
     * off. Returning false keeps the Declared metadata safe from wrongful deactivation.
     */
    public override get DiscoveryIsAuthoritative(): boolean { return false; }

    // ─── Auth — two-step SOAP token ──────────────────────────────────

    /**
     * Step 1 of the two-step auth: POST a SOAP `Authenticate(userName, password)` envelope (which
     * carries NO AuthorizationToken header — it is the bootstrap) and read the token string from
     * `AuthenticateResult`. The token is cached and re-used until its TTL elapses or a 401 forces
     * re-auth. Credentials go in the SOAP body elements — there is no HTTP Basic / Bearer here.
     */
    protected async Authenticate(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(ci, cu);
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + 60_000) {
            return { Token: this.tokenCache.Token, Config: config } as NFAuthContext;
        }
        const body = this.BuildSoapEnvelope('Authenticate', {
            userName: config.Username,
            password: config.Password,
        });
        const url = `${config.BaseURL}${DEFAULT_SOAP_PATH}`;
        const headers = this.SoapHeaders('Authenticate');
        const response = await this.MakeRawHTTPRequest(url, 'POST', headers, body);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`NetForum Authenticate failed: HTTP ${response.Status}`);
        }
        const token = this.ParseSoapScalar(this.AsText(response.Body), 'AuthenticateResult');
        if (!token) {
            throw new Error('NetForum Authenticate response contained no token (AuthenticateResult element)');
        }
        this.tokenCache = { Token: token, ExpiresAt: Date.now() + TOKEN_TTL_MS };
        return { Token: token, Config: config } as NFAuthContext;
    }

    private async ParseConfig(
        ci: MJCompanyIntegrationEntity,
        cu?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<NetForumConnectionConfig> {
        if (ci.CredentialID) {
            const fromCred = await this.ParseConfigFromCredential(ci.CredentialID, cu, provider);
            if (fromCred) return fromCred;
        }
        if (ci.Configuration) {
            const parsed = JSON.parse(ci.Configuration) as Record<string, string>;
            return this.ExtractConfig(parsed);
        }
        throw new Error('NetForum connector requires either CredentialID or Configuration JSON');
    }

    private async ParseConfigFromCredential(
        credentialID: string,
        cu?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<NetForumConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', cu);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) return null;
        const values = JSON.parse(cred.Values) as Record<string, string>;
        return this.ExtractConfig(values);
    }

    private ExtractConfig(values: Record<string, string>): NetForumConnectionConfig {
        const get = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const hit = Object.entries(values).find(([k]) => k.toLowerCase() === key.toLowerCase());
                if (hit) return String(hit[1] ?? '');
            }
            return undefined;
        };
        const baseURL = get('BaseURL', 'BaseUrl', 'base_url');
        const username = get('Username', 'username', 'user', 'userName');
        const password = get('Password', 'password', 'pass');
        if (!baseURL) throw new Error('NetForum configuration missing required field: BaseURL');
        if (!username) throw new Error('NetForum configuration missing required field: Username');
        if (!password) throw new Error('NetForum configuration missing required field: Password');
        return { BaseURL: this.StripTrailingSlash(baseURL), Username: username, Password: password };
    }

    private StripTrailingSlash(s: string): string { return s.replace(/\/+$/, ''); }

    public async TestConnection(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(ci, cu) as NFAuthContext;
            // Read-only smoke: GetVersion is a harmless, token-gated SystemInfo op.
            const url = `${auth.Config.BaseURL}${DEFAULT_SOAP_PATH}`;
            const body = this.BuildSoapEnvelope('GetVersion', {}, auth.Token);
            const r = await this.MakeRawHTTPRequest(url, 'POST', this.SoapHeaders('GetVersion'), body);
            return r.Status >= 200 && r.Status < 300
                ? { Success: true, Message: 'Connected to netFORUM Enterprise xWeb (SOAP)' }
                : { Success: false, Message: `xWeb returned HTTP ${r.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── Discovery — Declared cache + runtime GetQueryDefinition ──────

    /**
     * Standard objects = the Declared metadata (engine cache of persisted IntegrationObject rows).
     * NO hardcoded catalog. The base implementation reads exactly the credential-free Declared
     * universe; a live credential only ADDS customer-installed query objects (the Discovered
     * extension), it never supplies the baseline — so this re-yields the standard universe
     * credential-free and the runtime structure self-check passes without a token.
     */
    public override async DiscoverObjects(
        ci: MJCompanyIntegrationEntity,
        cu: UserInfo,
    ): Promise<ExternalObjectSchema[]> {
        return super.DiscoverObjects(ci, cu);
    }

    /**
     * Two-stage field discovery. Stage 1 returns the Declared field set (engine cache). Stage 2, when
     * a credential is available, calls the GetQueryDefinition MECHANISM and parses the returned SQL
     * column definition (Object → ListTable → ListFromTables → Column[]) into ExternalFieldSchema —
     * this surfaces customer-added columns the static metadata never saw. With no credential, or on
     * any error, it degrades to the Declared fields (never throws, never bakes a catalog).
     */
    public override async DiscoverFields(
        ci: MJCompanyIntegrationEntity,
        objectName: string,
        cu: UserInfo,
    ): Promise<ExternalFieldSchema[]> {
        const declared = await super.DiscoverFields(ci, objectName, cu);
        // The base FieldEntityToSchema folds PK into IsUniqueKey and never sets IsPrimaryKey, so
        // re-derive the honest IsPrimaryKey from the cached IOF entities (which carry it explicitly).
        const pkNames = this.DeclaredPrimaryKeyNames(ci, objectName);
        const declaredByName = new Map(
            declared.map(f => [f.Name.toLowerCase(), { ...f, IsPrimaryKey: pkNames.has(f.Name.toLowerCase()) }]),
        );
        try {
            const auth = await this.Authenticate(ci, cu) as NFAuthContext;
            const url = `${auth.Config.BaseURL}${DEFAULT_SOAP_PATH}`;
            const body = this.BuildSoapEnvelope('GetQueryDefinition', { szObjectName: objectName }, auth.Token);
            const r = await this.MakeRawHTTPRequest(url, 'POST', this.SoapHeaders('GetQueryDefinition'), body);
            if (r.Status >= 200 && r.Status < 300) {
                const discovered = this.ParseQueryDefinition(this.AsText(r.Body), declaredByName);
                if (discovered.length > 0) return discovered;
            }
        } catch {
            // credential-free / network / parse failure → fall through to Declared
        }
        return declared;
    }

    /**
     * Parses a GetQueryDefinition response (the SQL column definition) into ExternalFieldSchema[].
     * Each `<Column>` carries mdc_name / mdc_description / mdc_data_type / mdc_nullable /
     * mdc_width_max. Declared metadata wins for PK identity (a column definition does not mark a PK);
     * discovery contributes the full column corpus + provable nullability/length.
     */
    private ParseQueryDefinition(
        xml: string,
        declaredByName: Map<string, ExternalFieldSchema>,
    ): ExternalFieldSchema[] {
        const out: ExternalFieldSchema[] = [];
        const seen = new Set<string>();
        for (const colXml of this.ExtractElements(xml, 'Column')) {
            const name = this.ParseSoapScalar(colXml, 'mdc_name');
            if (!name || seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            const declared = declaredByName.get(name.toLowerCase());
            const dataType = this.ParseSoapScalar(colXml, 'mdc_data_type');
            const description = this.ParseSoapScalar(colXml, 'mdc_description');
            const nullable = this.ParseSoapScalar(colXml, 'mdc_nullable');
            const widthRaw = this.ParseSoapScalar(colXml, 'mdc_width_max');
            const maxLength = widthRaw && /^\d+$/.test(widthRaw) ? Number(widthRaw) : null;
            // AllowsNull provable-only: 'mdc_nullable' is an explicit source flag. "0"/"false"/"no" ⇒ NOT NULL.
            const allowsNull = nullable == null
                ? undefined
                : !/^(0|false|no|n)$/i.test(nullable.trim());
            out.push({
                Name: name,
                Label: declared?.Label ?? name,
                Description: declared?.Description ?? (description || undefined),
                DataType: declared?.DataType ?? this.MapSoapType(dataType),
                IsRequired: declared?.IsRequired ?? false,
                AllowsNull: allowsNull,
                IsPrimaryKey: declared?.IsPrimaryKey ?? false,
                IsUniqueKey: declared?.IsUniqueKey ?? false,
                IsReadOnly: declared?.IsReadOnly ?? false,
                IsForeignKey: declared?.IsForeignKey ?? false,
                ForeignKeyTarget: declared?.ForeignKeyTarget ?? null,
                MaxLength: maxLength,
            });
        }
        // Re-add any Declared field GetQueryDefinition did not surface (provable-only baseline never lost).
        for (const [key, f] of declaredByName) {
            if (!seen.has(key)) out.push(f);
        }
        return out;
    }

    private MapSoapType(sqlType: string | null): string {
        if (!sqlType) return 'string';
        const t = sqlType.toLowerCase();
        if (/(date|time)/.test(t)) return 'datetime';
        if (/(int|bigint|smallint|tinyint)/.test(t)) return 'number';
        if (/(decimal|numeric|money|float|real)/.test(t)) return 'decimal';
        if (/bit/.test(t)) return 'boolean';
        if (/uniqueidentifier/.test(t)) return 'string';
        return 'string';
    }

    // ─── FetchChanges — GetQuery door walk + per-facade watermark ─────

    /**
     * Fetches a batch via the GetQuery door. Walks the IO's access path from Configuration: the door
     * (GetQuery), the query object name, and any top modifier (@TOP -1 to bypass the DataGrid row
     * cap). Incremental sync uses the IO's per-facade `IncrementalWatermarkField` in the
     * szWhereClause — there is NO canonical LastModifiedDate; the field is metadata-driven.
     *
     * Full-record pass-through: every parsed row becomes ExternalRecord.Fields verbatim — never a
     * filtered/narrow literal — so the framework's custom-column capture sees every column the query
     * returned, including customer-added ones.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as NFAuthContext;
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const cfg = this.ParseObjectConfig(obj);
        const accessPath = cfg.accessPath ?? {};

        const queryObject = accessPath.queryObject ?? accessPath.doorArgs?.szObjectName ?? ctx.ObjectName;
        const topModifier = accessPath.doorArgs?.topModifier ?? '@TOP -1';
        const szObjectName = topModifier ? `${queryObject} ${topModifier}` : queryObject;

        const args: Record<string, string> = { szObjectName, szColumnList: '*' };
        const watermarkField = obj.IncrementalWatermarkField ?? undefined;
        if (ctx.WatermarkValue && watermarkField) {
            args.szWhereClause = `${watermarkField} >= '${this.EscapeSqlLiteral(ctx.WatermarkValue)}'`;
        }
        const orderingKey = cfg.stableOrderingKey ?? this.PrimaryKeyFieldName(obj);
        if (orderingKey) args.szOrderBy = orderingKey;

        const url = `${auth.Config.BaseURL}${this.SoapEndpoint(cfg)}`;
        const envelope = this.BuildSoapEnvelope('GetQuery', args, auth.Token);
        const response = await this.MakeRawHTTPRequest(url, 'POST', this.SoapHeaders('GetQuery'), envelope);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`NetForum GetQuery(${ctx.ObjectName}) failed: HTTP ${response.Status}`);
        }

        const rows = this.NormalizeResponse(response.Body, null);
        const pkField = this.PrimaryKeyFieldName(obj);
        const warnings = rows.length === 0
            ? [{ Code: 'ZERO_ROWS', Message: `GetQuery(${szObjectName}) returned no rows.` }]
            : undefined;

        // Highest ordering-key value seen → keyset resume position when no watermark exists.
        let maxKey: string | undefined;
        const records: ExternalRecord[] = rows.map(row => {
            const externalID = pkField ? String(row[pkField] ?? '') : '';
            if (orderingKey) {
                const v = row[orderingKey];
                if (v != null) { const s = String(v); if (maxKey === undefined || s > maxKey) maxKey = s; }
            }
            return { ExternalID: externalID, ObjectType: ctx.ObjectName, Fields: row };
        });

        // Watermark: when this IO has a watermark field, the engine narrows next sync from the max
        // seen. GetQuery returns the full result set in one call → HasMore is always false.
        let newWatermark: string | undefined;
        if (watermarkField) {
            for (const row of rows) {
                const v = row[watermarkField];
                if (v != null) { const s = String(v); if (newWatermark === undefined || s > newWatermark) newWatermark = s; }
            }
        }

        return {
            Records: records,
            HasMore: false,
            Warnings: warnings,
            NewWatermarkValue: newWatermark,
            NextAfterKeyValue: maxKey,
        };
    }

    private EscapeSqlLiteral(v: string): string { return v.replace(/'/g, "''"); }

    // ─── CRUD — SOAP facade ops via per-operation metadata columns ────

    /**
     * Create via the SOAP operation named in the IO's CreateBodyKey / Configuration.writeOps.createOp
     * (e.g. WEBIndividualInsert, InsertFacadeObject). The attributes are wrapped in a SOAP envelope
     * for that operation; the new key is read from the response and routed through BuildCreatedResult,
     * so a 2xx that carries no record key FAILS loudly (the silent-create-loss invariant).
     *
     * Overridden (not the generic per-operation REST path) because the body must be a SOAP envelope,
     * not a JSON body — the generic CreateRecord builds a JSON body. We still honor the metadata
     * columns (operation name) and still call BuildCreatedResult.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.SupportsCreate) {
            return { Success: false, StatusCode: 0, ErrorMessage: `CreateRecord not supported for "${ctx.ObjectName}".` };
        }
        const cfg = this.ParseObjectConfig(obj);
        const operation = obj.CreateBodyKey ?? cfg.writeOps?.createOp;
        if (!operation) {
            return { Success: false, StatusCode: 0, ErrorMessage: `Create of "${ctx.ObjectName}" has no SOAP operation configured (CreateBodyKey).` };
        }
        const auth = await this.Authenticate(ci, ctx.ContextUser as UserInfo) as NFAuthContext;
        const url = `${auth.Config.BaseURL}${this.SoapEndpoint(cfg)}`;
        const envelope = this.BuildSoapEnvelope(operation, ctx.Attributes, auth.Token);
        const r = await this.MakeRawHTTPRequest(url, 'POST', this.SoapHeaders(operation), envelope);
        if (r.Status < 200 || r.Status >= 300) {
            return { Success: false, ExternalID: '', StatusCode: r.Status, ErrorMessage: `Create of "${ctx.ObjectName}" failed: HTTP ${r.Status}` };
        }
        const externalID = this.ExtractKeyFromResponse(r.Body);
        return this.BuildCreatedResult(externalID, r.Status, ctx.ObjectName);
    }

    /**
     * Update via the SOAP operation named in UpdateBodyKey / Configuration.writeOps.updateOp.
     * netFORUM exposes no ETag / If-Match — updates are last-write-wins.
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.SupportsUpdate) {
            return { Success: false, ExternalID: ctx.ExternalID, StatusCode: 0, ErrorMessage: `UpdateRecord not supported for "${ctx.ObjectName}".` };
        }
        const cfg = this.ParseObjectConfig(obj);
        const operation = obj.UpdateBodyKey ?? cfg.writeOps?.updateOp;
        if (!operation) {
            return { Success: false, ExternalID: ctx.ExternalID, StatusCode: 0, ErrorMessage: `Update of "${ctx.ObjectName}" has no SOAP operation configured (UpdateBodyKey).` };
        }
        const auth = await this.Authenticate(ci, ctx.ContextUser as UserInfo) as NFAuthContext;
        const url = `${auth.Config.BaseURL}${this.SoapEndpoint(cfg)}`;
        const pkField = this.PrimaryKeyFieldName(obj);
        const attributes: Record<string, unknown> = pkField
            ? { [pkField]: ctx.ExternalID, ...ctx.Attributes }
            : { ...ctx.Attributes };
        const envelope = this.BuildSoapEnvelope(operation, attributes, auth.Token);
        const r = await this.MakeRawHTTPRequest(url, 'POST', this.SoapHeaders(operation), envelope);
        if (r.Status >= 200 && r.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: r.Status };
        }
        return { Success: false, ExternalID: ctx.ExternalID, StatusCode: r.Status, ErrorMessage: `Update of "${ctx.ObjectName}" failed: HTTP ${r.Status}` };
    }

    /**
     * Delete is not supported. DeleteFacadeObject is not confirmed in any reachable vendor doc and
     * netFORUM prefers soft-delete via status flags. SupportsDelete is false, so this returns a clean
     * error rather than silently claiming success.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        return {
            Success: false,
            ExternalID: ctx.ExternalID,
            StatusCode: 0,
            ErrorMessage: 'NetForum connector does not support delete (DeleteFacadeObject unconfirmed; netFORUM uses soft-delete via status flags).',
        };
    }

    private ExtractKeyFromResponse(body: unknown): string | undefined {
        const xml = this.AsText(body);
        // The Insert/Create ops return the new GUID — scan common result/key element names.
        for (const tag of ['key', 'Key', 'AddResult', 'InsertResult', 'CreateResult', 'WEBIndividualInsertResult', 'cst_key']) {
            const v = this.ParseSoapScalar(xml, tag);
            if (v && v.trim().length > 0) return v.trim();
        }
        // Fallback: first GUID-shaped token anywhere in the body.
        const guid = xml.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
        return guid ? guid[0] : undefined;
    }

    // ─── Stable ordering key (no-watermark resume) ───────────────────

    /**
     * Returns the IO's stable, monotonic ordering column (the PK / Configuration.stableOrderingKey)
     * so the engine can keyset-resume objects that have no incremental watermark. Null when the IO is
     * unknown or has no stable key — keyset resume is simply unavailable then, not an error.
     */
    public override StableOrderingKey(objectName: string): string | null {
        const ci = this.LastIntegrationID;
        if (!ci) return null;
        try {
            const obj = this.GetCachedObject(ci, objectName);
            const cfg = this.ParseObjectConfig(obj);
            return cfg.stableOrderingKey ?? this.PrimaryKeyFieldName(obj) ?? null;
        } catch {
            return null;
        }
    }

    // ─── SOAP envelope + XML helpers ─────────────────────────────────

    /** Required SOAP 1.1 HTTP headers for a given operation. */
    private SoapHeaders(operation: string): Record<string, string> {
        return {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': `${SOAP_NS}${operation}`,
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    /**
     * Builds a SOAP 1.1 envelope for `operation` with the given body args. When a token is provided
     * (every call except Authenticate), the AuthorizationToken header element carries it — this is
     * the documented SOAP token carrier, NOT an HTTP Authorization header. Values are XML-escaped.
     */
    private BuildSoapEnvelope(operation: string, args: Record<string, unknown>, token?: string): string {
        const header = token
            ? `<soap:Header><AuthorizationToken xmlns="${SOAP_NS}"><Token>${this.EscapeXml(token)}</Token></AuthorizationToken></soap:Header>`
            : '<soap:Header/>';
        const argXml = Object.entries(args)
            .map(([k, v]) => this.ArgElement(k, v))
            .join('');
        return `<?xml version="1.0" encoding="utf-8"?>` +
            `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
            header +
            `<soap:Body><${operation} xmlns="${SOAP_NS}">${argXml}</${operation}></soap:Body>` +
            `</soap:Envelope>`;
    }

    /** Serializes one SOAP arg. Objects become nested elements; scalars become escaped text. */
    private ArgElement(name: string, value: unknown): string {
        if (value === null || value === undefined) return `<${name} />`;
        if (typeof value === 'object') {
            const inner = Object.entries(value as Record<string, unknown>)
                .map(([k, v]) => this.ArgElement(k, v))
                .join('');
            return `<${name}>${inner}</${name}>`;
        }
        return `<${name}>${this.EscapeXml(String(value))}</${name}>`;
    }

    private EscapeXml(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private UnescapeXml(s: string): string {
        return s
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
            .replace(/&amp;/g, '&');
    }

    /**
     * Extracts the text content of the FIRST occurrence of a scalar element by local name, ignoring
     * namespace prefixes. Returns undefined when absent. Used for AuthenticateResult, mdc_* columns,
     * and create-result keys.
     */
    private ParseSoapScalar(xml: string, localName: string): string | undefined {
        const re = new RegExp(`<(?:[\\w.-]+:)?${this.EscapeRegExp(localName)}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${this.EscapeRegExp(localName)}>`);
        const m = re.exec(xml);
        if (!m) return undefined;
        return this.UnescapeXml(m[1]).trim();
    }

    /** Returns the inner XML of every occurrence of an element by local name (namespace-agnostic). */
    private ExtractElements(xml: string, localName: string): string[] {
        const re = new RegExp(`<(?:[\\w.-]+:)?${this.EscapeRegExp(localName)}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${this.EscapeRegExp(localName)}>`, 'g');
        const out: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(xml)) !== null) out.push(m[1]);
        return out;
    }

    private EscapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    /**
     * Strips the SOAP envelope and the GetQueryResult wrapper, returning each flattened row as a
     * plain object of column→value. netFORUM GetQuery returns a DataSet of repeated row elements
     * (the row element name is the query's "Result"/"<Object>" element). We locate the GetQueryResult
     * payload, then treat every direct child element that itself contains child elements as a row.
     */
    protected NormalizeResponse(rawBody: unknown, _key: string | null): Record<string, unknown>[] {
        const xml = this.AsText(rawBody);
        if (!xml) return [];
        // Unwrap the GetQueryResult body (the <s:any> DataSet). Fall back to the whole body.
        const resultElems = this.ExtractElements(xml, 'GetQueryResult');
        const payload = resultElems.length > 0 ? resultElems[0] : xml;
        return this.ParseRowSet(payload);
    }

    /**
     * Parses a flattened row set. The DataSet shape is `<Results><Result>...cols...</Result>...` (the
     * outer/inner names vary by query, e.g. IndividualObjects/IndividualObject). We find the most
     * common repeated leaf-bearing element name and treat each as a row of column elements.
     */
    private ParseRowSet(xml: string): Record<string, unknown>[] {
        // Identify candidate row element names: any tag that recurs AND contains nested elements.
        const topTags = this.TopLevelTagNames(xml);
        // The row wrapper is usually a single outer element (e.g. <Results>); descend one level if so.
        let scope = xml;
        if (topTags.length === 1) {
            const inner = this.ExtractElements(xml, topTags[0]);
            if (inner.length === 1 && /</.test(inner[0])) scope = inner[0];
        }
        const rowTagCounts = new Map<string, number>();
        for (const tag of this.TopLevelTagNames(scope)) {
            rowTagCounts.set(tag, (rowTagCounts.get(tag) ?? 0) + 1);
        }
        // Pick the most frequent row tag (ties → first). A single-row result still has count 1.
        let rowTag: string | undefined;
        let best = 0;
        for (const [tag, count] of rowTagCounts) {
            if (count > best) { best = count; rowTag = tag; }
        }
        if (!rowTag) return [];
        const rows: Record<string, unknown>[] = [];
        for (const rowXml of this.ExtractElements(scope, rowTag)) {
            const row = this.ParseRowColumns(rowXml);
            if (Object.keys(row).length > 0) rows.push(row);
        }
        return rows;
    }

    /** Parses one row's column elements into a flat object (full-record — every column kept). */
    private ParseRowColumns(rowXml: string): Record<string, unknown> {
        const row: Record<string, unknown> = {};
        const re = /<([\w.-]+)\b[^>]*?(\/)?>(?:([\s\S]*?)<\/\1>)?/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(rowXml)) !== null) {
            const tag = m[1];
            const selfClosing = m[2] === '/';
            const content = m[3];
            if (selfClosing || content === undefined) { row[tag] = null; continue; }
            // Flattened GetQuery rows carry scalar columns; keep the unescaped text value.
            row[tag] = this.UnescapeXml(content);
        }
        return row;
    }

    /**
     * Returns the local names of the direct (top-level) child elements of an XML fragment, by a
     * depth scan over open/close/self-close tags (so a tag opened at depth 0 is a direct child).
     */
    private TopLevelTagNames(xml: string): string[] {
        const names: string[] = [];
        let depth = 0;
        const tokenRe = /<\/?([\w.-]+)\b[^>]*?(\/)?>/g;
        let t: RegExpExecArray | null;
        while ((t = tokenRe.exec(xml)) !== null) {
            const full = t[0];
            const name = t[1];
            const selfClose = t[2] === '/';
            const isClose = full.startsWith('</');
            if (isClose) { depth--; continue; }
            if (depth === 0) names.push(name);
            if (!selfClose) depth++;
        }
        return names;
    }

    protected ExtractPaginationInfo(
        _rb: unknown,
        _pt: PaginationType,
        _cp: number,
        _co: number,
        _ps: number,
    ): PaginationState {
        // GetQuery returns the full result set in one call — no protocol-level pagination.
        return { HasMore: false };
    }

    protected GetBaseURL(_ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as NFAuthContext).Config.BaseURL;
    }

    /** The base-class abstract BuildHeaders — defers to SoapHeaders for the active operation. */
    protected BuildHeaders(_auth: RESTAuthContext): Record<string, string> {
        return { 'Content-Type': 'text/xml; charset=utf-8', 'User-Agent': 'MemberJunction-Integration/1.0' };
    }

    /** The base-class abstract MakeHTTPRequest — routes through the raw transport. */
    protected async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown,
    ): Promise<RESTResponse> {
        return this.MakeRawHTTPRequest(url, method, headers, typeof body === 'string' ? body : (body == null ? undefined : String(body)));
    }

    /**
     * Raw SOAP transport: POSTs the XML envelope, retries on 401 (re-auth)/429/5xx, and returns the
     * response body as text (SOAP is text/xml). Never logs credentials, the token, or PII.
     *
     * `protected` so a unit-test subclass can override this single transport seam to feed canned
     * SOAP responses (no live network, no credentials) — the only seam tests need to mock.
     */
    protected async MakeRawHTTPRequest(
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: string,
    ): Promise<RESTResponse> {
        await this.Throttle();
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                const opts: RequestInit = { method, headers, signal: controller.signal };
                if (body !== undefined && method !== 'GET') opts.body = body;
                const response = await fetch(url, opts);
                clearTimeout(timer);
                this.lastRequestTime = Date.now();
                if (response.status === 401 && attempt === 0) { this.tokenCache = null; continue; }
                if (response.status === 429 && attempt < MAX_RETRIES) {
                    await this.Sleep(this.RetryAfterMs(response, attempt));
                    continue;
                }
                if (response.status >= 500 && attempt < MAX_RETRIES) {
                    await this.Sleep(Math.min(1000 * Math.pow(2, attempt), 30_000));
                    continue;
                }
                const text = await response.text();
                const h: Record<string, string> = {};
                response.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
                return { Status: response.status, Body: text, Headers: h };
            } catch (e) {
                clearTimeout(timer);
                if (e instanceof Error && e.name === 'AbortError') throw new Error(`NetForum request timed out: ${url}`);
                if (attempt >= MAX_RETRIES) throw e;
                await this.Sleep(Math.min(1000 * Math.pow(2, attempt), 30_000));
            }
        }
        throw new Error(`NetForum request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private RetryAfterMs(response: Response, attempt: number): number {
        const ra = response.headers.get('retry-after');
        if (ra) {
            const secs = Number(ra);
            if (!Number.isNaN(secs)) return Math.min(secs * 1000, 60_000);
        }
        return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000);
    }

    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        if (error && typeof error === 'object' && 'Headers' in error) {
            const headers = (error as { Headers?: Record<string, string> }).Headers;
            const ra = headers?.['retry-after'];
            if (ra) { const secs = Number(ra); if (!Number.isNaN(secs)) return secs * 1000; }
        }
        return undefined;
    }

    private async Throttle(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    private Sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

    // ─── Per-object config helpers ───────────────────────────────────

    /** Remembered integration ID from the last fetch, so StableOrderingKey can read the cache. */
    private LastIntegrationID: string | null = null;

    private ParseObjectConfig(obj: MJIntegrationObjectEntity): NFObjectConfig {
        this.LastIntegrationID = obj.IntegrationID ?? this.LastIntegrationID;
        if (!obj.Configuration) return {};
        try {
            return JSON.parse(obj.Configuration) as NFObjectConfig;
        } catch {
            return {};
        }
    }

    private SoapEndpoint(cfg: NFObjectConfig): string {
        return cfg.soapEndpoint ?? DEFAULT_SOAP_PATH;
    }

    private PrimaryKeyFieldName(obj: MJIntegrationObjectEntity): string | undefined {
        const fields = this.GetCachedFields(obj.ID);
        const pk = fields.find(f => f.IsPrimaryKey);
        return pk?.Name;
    }

    /** Lowercased names of the IO's declared primary-key fields, read from the cached IOF entities. */
    private DeclaredPrimaryKeyNames(ci: MJCompanyIntegrationEntity, objectName: string): Set<string> {
        try {
            const obj = this.GetCachedObject(ci.IntegrationID, objectName);
            return new Set(this.GetCachedFields(obj.ID).filter(f => f.IsPrimaryKey).map(f => f.Name.toLowerCase()));
        } catch {
            return new Set<string>();
        }
    }

    private AsText(body: unknown): string {
        if (typeof body === 'string') return body;
        if (body == null) return '';
        return String(body);
    }
}

export function LoadNetForumConnector() { /* intentionally empty — tree-shaking anchor */ }
