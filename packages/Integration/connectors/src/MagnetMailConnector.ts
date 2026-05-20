/**
 * ⚠️ DO NOT SHIP TO CUSTOMERS WITHOUT REWORK ⚠️
 *
 * 2026-05-20 vendor-truth audit (vs public WSDL at hlma-apie1.magnetmail.net/mmapi.asmx?WSDL):
 * the wire-level SOAP envelope this connector builds DOES NOT MATCH the vendor's
 * actual API surface. The connector has almost certainly never exchanged a successful
 * authenticated call against a real MagnetMail tenant. Known mismatches:
 *
 *   1. SOAP namespace: connector uses `http://api.magnetmail.net/`; vendor uses
 *      `http://www.magnetmail.net/`.
 *   2. Auth placement: connector inlines user_id + session as operation-body children;
 *      vendor uses a SOAP HEADER (`<mmAuthHeader>{sessionId, user_id}</mmAuthHeader>`).
 *   3. Authenticate body: connector sends `user_id` + `password`; vendor expects
 *      `username` + `password`.
 *   4. Authenticate response: connector looks for <session>/<sessionid>; actual element
 *      is <sessionId> (case matters for some XML parsers).
 *   5. Pagination params: connector hardcodes `start_row`/`row_count`; vendor uses
 *      `pageNumber`/`pageCount`. searchForRecipients takes NO pagination at all.
 *   6. searchForRecipients shape: vendor wraps all fields in <criteria>; connector
 *      emits flat children.
 *   7. getMessagesUTC watermark params in metadata: send_date_from/send_date_to;
 *      vendor wants sentStartDate/sentEndDate (with separate createStartDate/End).
 *   8. addRecipient: WSDL exposes a <Groups> array; the Recipients IOF set lacks it.
 *
 * Boilerplate (service name, endpoint URL, operation names) is shape-correct.
 * Envelope construction needs a near-total rewrite against the canonical WSDL
 * before this connector can serve a real customer.
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
} from '@memberjunction/integration-engine';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Connection configuration parsed from CompanyIntegration credentials.
 * MagnetMail uses two-step authentication: user_id + password -> session
 * token; the token is attached to every subsequent SOAP operation.
 */
export interface MagnetMailConnectionConfig {
    /** MagnetMail numeric user/account identifier */
    UserId: string;
    /** MagnetMail account password (used by Authenticate). */
    Password: string;
    /** Optional endpoint override. Default: https://hlma-apie1.magnetmail.net/mmapi.asmx */
    Endpoint?: string;
    /** Default SOAP XML namespace used by mmapi.asmx. */
    Namespace?: string;

    // ── Performance overrides ───────────────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 4 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 60000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 500 */
    MinRequestIntervalMs?: number;
    /** Session TTL in ms — re-authenticate after this. Default: 30 minutes */
    SessionTTLMs?: number;
}

/** Internal session state. */
interface MagnetMailSession {
    SessionToken: string;
    CreatedAt: number;
    Config: MagnetMailConnectionConfig;
}

/** Per-object metadata used when building SOAP envelopes from IntegrationObject rows. */
interface MagnetMailObjectMeta {
    /** SOAP action for list/read (= APIPath) */
    ListAction: string;
    /** Path under SOAP response body where the result array lives (= ResponseDataKey) */
    ResultPath: string;
    /** Optional create action (from DefaultQueryParams.create_action) */
    CreateAction?: string;
    /** Optional update action */
    UpdateAction?: string;
    /** Optional delete/soft-delete action */
    DeleteAction?: string;
    /** Optional detail (get-by-id) action */
    DetailAction?: string;
    /** Optional incremental-sync watermark field + from/to param names */
    WatermarkField?: string;
    WatermarkFromParam?: string;
    WatermarkToParam?: string;
    /** Extra default SOAP args merged into every request (excluding reserved keys) */
    ExtraArgs: Record<string, string>;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Default MagnetMail SOAP endpoint (shared hostname, not per-customer). */
const DEFAULT_ENDPOINT = 'https://hlma-apie1.magnetmail.net/mmapi.asmx';

/** Default MagnetMail SOAP namespace (derived from the public WSDL's tns). */
const DEFAULT_NAMESPACE = 'http://api.magnetmail.net/';

/** Default request timeout for MagnetMail (slower than typical REST). */
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

/** Default minimum milliseconds between API calls. */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 500;

/** Default retry count. */
const DEFAULT_MAX_RETRIES = 4;

/** Default session TTL — re-authenticate after 30 minutes of use. */
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

/** Keys in DefaultQueryParams JSON that are reserved for connector behavior, not SOAP args. */
const RESERVED_META_KEYS = new Set<string>([
    'create_action', 'update_action', 'delete_action', 'detail_action',
    'count_action', 'run_action', 'enhanced_action',
    'beta_create_action', 'beta_status_action',
    'watermark_field', 'watermark_from_param', 'watermark_to_param',
]);

// ─── MagnetMail Static Object Metadata for Action Generation ─────────

const MAGNETMAIL_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Recipients',
        DisplayName: 'Recipient',
        Description: 'An email recipient / contact record in MagnetMail.',
        SupportsWrite: true,
        Fields: [
            { Name: 'recipient_id', DisplayName: 'Recipient ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MagnetMail recipient identifier (integer).' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address (de-facto natural key).' },
            { Name: 'first_name', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First name.' },
            { Name: 'last_name', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last name.' },
            { Name: 'company', DisplayName: 'Company', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company name.' },
            { Name: 'phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Phone number.' },
            { Name: 'unsubscribed', DisplayName: 'Unsubscribed', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'True when the recipient has unsubscribed.' },
        ],
    },
    {
        Name: 'Groups',
        DisplayName: 'Group',
        Description: 'A distribution group in MagnetMail.',
        SupportsWrite: true,
        Fields: [
            { Name: 'group_id', DisplayName: 'Group ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group identifier.' },
            { Name: 'group_name', DisplayName: 'Group Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group name.' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group description.' },
            { Name: 'category_id', DisplayName: 'Category ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated category.' },
        ],
    },
    {
        Name: 'Messages',
        DisplayName: 'Message',
        Description: 'An email message / template in MagnetMail.',
        SupportsWrite: true,
        Fields: [
            { Name: 'message_id', DisplayName: 'Message ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Message identifier.' },
            { Name: 'message_name', DisplayName: 'Message Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Message name.' },
            { Name: 'subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email subject.' },
            { Name: 'from_email', DisplayName: 'From Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender email address.' },
            { Name: 'createDate', DisplayName: 'Create Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Message creation timestamp.' },
            { Name: 'lastSent', DisplayName: 'Last Sent', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Most recent send timestamp.' },
        ],
    },
    {
        Name: 'UploadJobs',
        DisplayName: 'Upload Job',
        Description: 'An async bulk CSV upload job in MagnetMail.',
        SupportsWrite: true,
        Fields: [
            { Name: 'jobid', DisplayName: 'Job ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Upload job identifier.' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Job status.' },
            { Name: 'total_rows', DisplayName: 'Total Rows', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total rows in CSV.' },
            { Name: 'processed_rows', DisplayName: 'Processed Rows', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of rows processed.' },
        ],
    },
];

// ─── Connector Implementation ────────────────────────────────────────

/**
 * Connector for Higher Logic MagnetMail (mmapi.asmx SOAP API).
 *
 * Extends BaseIntegrationConnector directly because MagnetMail is SOAP/XML.
 * The generic BaseRESTIntegrationConnector pagination helpers don't apply;
 * MagnetMail has per-operation offset/row_count pagination, UTC-variant names,
 * and envelope-wrapped responses that need XML parsing.
 *
 * Operations are driven by `IntegrationObject` metadata:
 *   - `APIPath` holds the SOAP action name for list/read (e.g., `getMessagesUTC`)
 *   - `ResponseDataKey` holds the response element wrapping the result (e.g., `getMessagesUTCResult`)
 *   - `DefaultQueryParams` carries additional metadata:
 *       - `create_action` / `update_action` / `delete_action` / `detail_action` — SOAP action names
 *       - `watermark_field` / `watermark_from_param` / `watermark_to_param` — incremental sync settings
 *
 * Auth flow:
 *   1. POST `Authenticate` with userId + password -> session token
 *   2. Attach (user_id, session) to every subsequent SOAP call
 *   3. Cache session for SESSION_TTL_MS; refresh on expiry or auth failure
 */
@RegisterClass(BaseIntegrationConnector, 'MagnetMailConnector')
export class MagnetMailConnector extends BaseIntegrationConnector {

    // ── State ────────────────────────────────────────────────────────

    private cachedSession: MagnetMailSession | null = null;
    private lastRequestTime = 0;

    // ── Capability Getters ───────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return false; }

    public override get IntegrationName(): string { return 'MagnetMail'; }

    // ── Action Generation ────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return MAGNETMAIL_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;
        return {
            IntegrationName: 'MagnetMail',
            CategoryName: 'MagnetMail',
            IconClass: 'fa-solid fa-envelope-circle-check',
            Objects: objects,
            IncludeSearch: false,
            IncludeList: false,
            CategoryDescription: 'Higher Logic MagnetMail email marketing integration actions',
            ParentCategoryName: 'Business Apps',
        };
    }

    // ── Default Configuration ────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig | null {
        return {
            DefaultSchemaName: 'MagnetMail',
            DefaultObjects: [
                {
                    SourceObjectName: 'Recipients',
                    TargetTableName: 'MagnetMail_Recipient',
                    TargetEntityName: 'MagnetMail Recipients',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Recipients', 'Contacts'),
                },
                {
                    SourceObjectName: 'Groups',
                    TargetTableName: 'MagnetMail_Group',
                    TargetEntityName: 'MagnetMail Groups',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
                {
                    SourceObjectName: 'Messages',
                    TargetTableName: 'MagnetMail_Message',
                    TargetEntityName: 'MagnetMail Messages',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
            ],
        };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        if (objectName === 'Recipients') {
            return [
                { SourceFieldName: 'recipient_id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                { SourceFieldName: 'email', DestinationFieldName: 'Email' },
                { SourceFieldName: 'first_name', DestinationFieldName: 'FirstName' },
                { SourceFieldName: 'last_name', DestinationFieldName: 'LastName' },
                { SourceFieldName: 'phone', DestinationFieldName: 'Phone' },
                { SourceFieldName: 'company', DestinationFieldName: 'Company' },
            ];
        }
        return [];
    }

    // ── TestConnection ───────────────────────────────────────────────

    /**
     * Exercises the Authenticate operation and then calls getUserDetails to
     * validate the session token is accepted by a regular endpoint.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const session = await this.GetSession(companyIntegration, contextUser, true);
            const response = await this.InvokeSoapOperation(session, 'getUserDetails', {});
            const account = this.ExtractNodeText(response, 'account_name') ?? 'authenticated';
            return {
                Success: true,
                Message: `Successfully authenticated to MagnetMail (user_id=${session.Config.UserId}, account=${account})`,
                ServerVersion: 'MagnetMail mmapi.asmx (SOAP 1.1/1.2)',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ── Discovery ────────────────────────────────────────────────────

    /**
     * Returns static metadata — MagnetMail's WSDL is fixed and no runtime
     * discovery is possible for SOAP operations. Engine's cached IntegrationObjects
     * are returned when available; otherwise the connector's static list.
     */
    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const cached = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(companyIntegration.IntegrationID);
        if (cached && cached.length > 0) {
            return cached.map(obj => ({
                ID: obj.ID,
                Name: obj.Name,
                Label: obj.DisplayName ?? obj.Name,
                Description: obj.Description ?? undefined,
                SupportsIncrementalSync: obj.SupportsIncrementalSync,
                SupportsWrite: obj.SupportsWrite,
            }));
        }

        return MAGNETMAIL_OBJECTS.map(o => ({
            Name: o.Name,
            Label: o.DisplayName,
            Description: o.Description,
            SupportsIncrementalSync: o.Name === 'Messages' || o.Name === 'Unsubscribes' || o.Name === 'MessageTrackingDetailed',
            SupportsWrite: o.SupportsWrite,
        }));
    }

    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const cached = IntegrationEngineBase.Instance.GetIntegrationObject(companyIntegration.IntegrationID, objectName);
        if (cached) {
            const fields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(cached.ID);
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

        const obj = MAGNETMAIL_OBJECTS.find(o => o.Name === objectName);
        if (!obj) return [];
        return obj.Fields.map(f => ({
            Name: f.Name,
            Label: f.DisplayName,
            Description: f.Description,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
        }));
    }

    // ── FetchChanges ─────────────────────────────────────────────────

    /**
     * Drives a list/read SOAP operation using the object's metadata. Pagination
     * uses MagnetMail's `start_row` / `row_count` convention; incremental sync
     * passes watermark_from/to parameters when configured on the IntegrationObject.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.ResolveObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const meta = this.BuildObjectMeta(obj);
        const session = await this.GetSession(ctx.CompanyIntegration, ctx.ContextUser);

        const offset = ctx.CurrentOffset ?? 0;
        const pageSize = ctx.BatchSize || obj.DefaultPageSize || 500;
        const args = this.BuildFetchArgs(meta, ctx, offset, pageSize);

        const responseXml = await this.InvokeSoapOperation(session, meta.ListAction, args);
        const records = this.ParseRecordArray(responseXml, meta.ResultPath);

        const pkField = this.GetPrimaryKeyField(obj.ID);
        const externalRecords: ExternalRecord[] = records.map(r => this.RawToExternalRecord(r, ctx.ObjectName, pkField));
        const watermarkAfter = meta.WatermarkField ? this.ComputeWatermark(records, meta.WatermarkField) : undefined;

        return {
            Records: externalRecords,
            HasMore: obj.SupportsPagination && records.length >= pageSize,
            NewWatermarkValue: watermarkAfter,
            NextOffset: records.length >= pageSize ? offset + records.length : undefined,
        };
    }

    // ── CRUD operations ──────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        return this.ExecuteMutation(ctx, 'CreateAction', ctx.Attributes, null);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        return this.ExecuteMutation(ctx, 'UpdateAction', ctx.Attributes, ctx.ExternalID);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        return this.ExecuteMutation(ctx, 'DeleteAction', {}, ctx.ExternalID);
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.ResolveObject(companyIntegration.IntegrationID, ctx.ObjectName);
        const meta = this.BuildObjectMeta(obj);
        const action = meta.DetailAction;
        if (!action) return null;

        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(obj.ID);
        const args: Record<string, string> = { ...meta.ExtraArgs, [pkField]: ctx.ExternalID };
        const responseXml = await this.InvokeSoapOperation(session, action, args);
        const records = this.ParseRecordArray(responseXml, `${action}Result`);
        if (records.length === 0) return null;

        return this.RawToExternalRecord(records[0], ctx.ObjectName, pkField);
    }

    // ── Mutation helper ──────────────────────────────────────────────

    /**
     * Shared create/update/delete implementation. Reads the mutation SOAP action
     * name from the IntegrationObject's DefaultQueryParams metadata and POSTs
     * the given attributes.
     */
    private async ExecuteMutation(
        ctx: CreateRecordContext | UpdateRecordContext | DeleteRecordContext,
        metaKey: 'CreateAction' | 'UpdateAction' | 'DeleteAction',
        attributes: Record<string, unknown>,
        externalID: string | null
    ): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.ResolveObject(companyIntegration.IntegrationID, ctx.ObjectName);
        const meta = this.BuildObjectMeta(obj);
        const actionName = this.GetMutationActionName(meta, metaKey);
        if (!actionName) {
            return {
                Success: false,
                ErrorMessage: `${metaKey} is not supported for MagnetMail object ${ctx.ObjectName}`,
                StatusCode: 400,
            };
        }

        try {
            const session = await this.GetSession(companyIntegration, contextUser);
            const args = this.BuildMutationArgs(meta, attributes, externalID, obj);
            const responseXml = await this.InvokeSoapOperation(session, actionName, args);
            const returnedId = this.ExtractMutationResultId(responseXml, actionName, obj) ?? externalID ?? '';
            return { Success: true, ExternalID: returnedId, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, metaKey, ctx.ObjectName);
        }
    }

    private GetMutationActionName(meta: MagnetMailObjectMeta, key: 'CreateAction' | 'UpdateAction' | 'DeleteAction'): string | undefined {
        if (key === 'CreateAction') return meta.CreateAction;
        if (key === 'UpdateAction') return meta.UpdateAction;
        return meta.DeleteAction;
    }

    private BuildMutationArgs(
        meta: MagnetMailObjectMeta,
        attributes: Record<string, unknown>,
        externalID: string | null,
        obj: MJIntegrationObjectEntity
    ): Record<string, string> {
        const args: Record<string, string> = { ...meta.ExtraArgs };
        for (const [key, value] of Object.entries(attributes)) {
            if (value == null) continue;
            args[key] = String(value);
        }
        if (externalID != null) {
            const pkField = this.GetPrimaryKeyField(obj.ID);
            args[pkField] = externalID;
        }
        return args;
    }

    /**
     * Attempts to extract an ID from a create/update response. MagnetMail
     * conventions vary per operation; this falls back to returning the
     * external ID already passed in.
     */
    private ExtractMutationResultId(responseXml: string, action: string, obj: MJIntegrationObjectEntity): string | null {
        const pkField = this.GetPrimaryKeyField(obj.ID);
        const direct = this.ExtractNodeText(responseXml, pkField);
        if (direct) return direct;
        const resultPath = `${action}Result`;
        const wrapped = this.ExtractWrappedNodeText(responseXml, resultPath, pkField);
        if (wrapped) return wrapped;
        return null;
    }

    // ── Session Management ───────────────────────────────────────────

    private async GetSession(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<MagnetMailSession> {
        if (!forceRefresh && this.cachedSession && this.IsSessionValid()) {
            return this.cachedSession;
        }

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const token = await this.Authenticate(config);
        const session: MagnetMailSession = {
            SessionToken: token,
            CreatedAt: Date.now(),
            Config: config,
        };
        this.cachedSession = session;
        return session;
    }

    private IsSessionValid(): boolean {
        if (!this.cachedSession) return false;
        const ttl = this.cachedSession.Config.SessionTTLMs ?? DEFAULT_SESSION_TTL_MS;
        return Date.now() - this.cachedSession.CreatedAt < ttl;
    }

    private async Authenticate(config: MagnetMailConnectionConfig): Promise<string> {
        const envelope = this.BuildEnvelope(config, 'Authenticate', {
            user_id: config.UserId,
            password: config.Password,
        }, /* includeSession */ false);
        const responseXml = await this.PostSOAP(config, 'Authenticate', envelope);
        const token = this.ExtractNodeText(responseXml, 'AuthenticateResult')
            ?? this.ExtractNodeText(responseXml, 'session')
            ?? this.ExtractNodeText(responseXml, 'sessionid');
        if (!token) {
            throw new Error('MagnetMailConnector: Authenticate did not return a session token');
        }
        return token;
    }

    // ── Configuration Parsing ────────────────────────────────────────

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<MagnetMailConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const config = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (config) return config;
        }

        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Partial<MagnetMailConnectionConfig>;
            return this.ValidateConfig(parsed);
        }

        throw new Error('MagnetMailConnector: No credentials or configuration found on CompanyIntegration');
    }

    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo
    ): Promise<MagnetMailConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            const raw = JSON.parse(credential.Values) as Record<string, unknown>;
            const parsed: Partial<MagnetMailConnectionConfig> = {
                UserId: (raw.userId as string | undefined) ?? (raw.UserId as string | undefined),
                Password: (raw.password as string | undefined) ?? (raw.Password as string | undefined),
                Endpoint: (raw.endpoint as string | undefined) ?? (raw.Endpoint as string | undefined),
                Namespace: (raw.namespace as string | undefined) ?? (raw.Namespace as string | undefined),
            };
            return this.ValidateConfig(parsed);
        } catch {
            return null;
        }
    }

    private ValidateConfig(raw: Partial<MagnetMailConnectionConfig>): MagnetMailConnectionConfig {
        if (!raw.UserId) throw new Error('MagnetMailConnector: UserId is required');
        if (!raw.Password) throw new Error('MagnetMailConnector: Password is required');

        return {
            UserId: raw.UserId,
            Password: raw.Password,
            Endpoint: raw.Endpoint ?? DEFAULT_ENDPOINT,
            Namespace: raw.Namespace ?? DEFAULT_NAMESPACE,
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
            SessionTTLMs: raw.SessionTTLMs ?? DEFAULT_SESSION_TTL_MS,
        };
    }

    // ── SOAP helpers ─────────────────────────────────────────────────

    /**
     * Invokes a SOAP operation with session authentication. The `args` map is
     * serialised as child elements of the operation element; complex types
     * should be pre-serialised to string by callers.
     */
    private async InvokeSoapOperation(
        session: MagnetMailSession,
        action: string,
        args: Record<string, string>
    ): Promise<string> {
        const envelope = this.BuildEnvelope(session.Config, action, args, /* includeSession */ true, session.SessionToken);
        return this.PostSOAP(session.Config, action, envelope);
    }

    /**
     * Builds a SOAP 1.1 envelope for a given operation. Optionally includes
     * `user_id` + `session` auth tokens as child elements (MagnetMail uses
     * positional args rather than SOAP headers).
     */
    private BuildEnvelope(
        config: MagnetMailConnectionConfig,
        operation: string,
        args: Record<string, string>,
        includeSession: boolean,
        sessionToken?: string
    ): string {
        const namespace = config.Namespace ?? DEFAULT_NAMESPACE;
        const authTags = includeSession
            ? `<user_id>${this.EscapeXmlValue(config.UserId)}</user_id>\n      <session>${this.EscapeXmlValue(sessionToken ?? '')}</session>\n      `
            : '';
        const argTags = Object.entries(args)
            .map(([k, v]) => `<${k}>${this.EscapeXmlValue(v)}</${k}>`)
            .join('\n      ');

        return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operation} xmlns="${namespace}">
      ${authTags}${argTags}
    </${operation}>
  </soap:Body>
</soap:Envelope>`;
    }

    /**
     * POSTs a SOAP envelope with throttling, retry, and timeout.
     */
    private async PostSOAP(
        config: MagnetMailConnectionConfig,
        action: string,
        envelope: string
    ): Promise<string> {
        const endpoint = config.Endpoint ?? DEFAULT_ENDPOINT;
        const namespace = config.Namespace ?? DEFAULT_NAMESPACE;
        const soapAction = `${namespace}${action}`;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);
            const outcome = await this.ExecuteSoapAttempt(endpoint, envelope, soapAction, timeoutMs);
            if (outcome.retryable && attempt < maxRetries) {
                const delay = Math.min(Math.pow(2, attempt) * 1000, 15000);
                await this.Sleep(delay);
                continue;
            }
            if (outcome.error) throw outcome.error;
            return outcome.xml as string;
        }
        throw new Error(`MagnetMailConnector: exhausted ${maxRetries + 1} attempts for SOAP action "${action}"`);
    }

    private async ExecuteSoapAttempt(
        endpoint: string,
        envelope: string,
        soapAction: string,
        timeoutMs: number
    ): Promise<{ xml?: string; error?: Error; retryable: boolean }> {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': `"${soapAction}"`,
                    'Accept': 'text/xml',
                },
                body: envelope,
                signal: controller.signal,
            });
            this.lastRequestTime = Date.now();
            const xml = await response.text();
            if (response.status === 429 || response.status >= 500) {
                return { error: new Error(`MagnetMail HTTP ${response.status}: ${xml.slice(0, 500)}`), retryable: true };
            }
            if (!response.ok) {
                return { error: new Error(`MagnetMail HTTP ${response.status}: ${xml.slice(0, 500)}`), retryable: false };
            }
            this.CheckSoapFault(xml);
            return { xml, retryable: false };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const retryable = message.includes('abort') || message.includes('timeout') || message.includes('ECONNRESET');
            return { error: new Error(`MagnetMail SOAP request failed: ${message}`), retryable };
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    // ── XML parsing (regex-based, consistent with SageIntacct approach) ──

    /**
     * Throws a descriptive error if the SOAP response contains a fault element.
     */
    private CheckSoapFault(xml: string): void {
        const faultMatch = xml.match(/<soap:Fault>([\s\S]*?)<\/soap:Fault>/i);
        if (!faultMatch) return;
        const fault = faultMatch[1];
        const code = this.ExtractNodeText(fault, 'faultcode') ?? 'UNKNOWN';
        const reason = this.ExtractNodeText(fault, 'faultstring') ?? this.ExtractNodeText(fault, 'Reason') ?? 'unknown';
        throw new Error(`MagnetMail SOAP Fault ${code}: ${reason}`);
    }

    /**
     * Extracts the text content of the first element with the given tag name.
     * Namespace-agnostic — matches by local name.
     */
    private ExtractNodeText(xml: string, tag: string): string | null {
        const regex = new RegExp(`<(?:\\w+:)?${this.EscapeRegex(tag)}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${this.EscapeRegex(tag)}>`, 'i');
        const match = xml.match(regex);
        return match ? this.DecodeXmlEntities(match[1].trim()) : null;
    }

    /**
     * Extracts a node nested inside another wrapper node (e.g., `<FooResult><id>42</id></FooResult>`).
     */
    private ExtractWrappedNodeText(xml: string, wrapperTag: string, innerTag: string): string | null {
        const wrapperRegex = new RegExp(`<(?:\\w+:)?${this.EscapeRegex(wrapperTag)}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${this.EscapeRegex(wrapperTag)}>`, 'i');
        const wrapperMatch = xml.match(wrapperRegex);
        if (!wrapperMatch) return null;
        return this.ExtractNodeText(wrapperMatch[1], innerTag);
    }

    /**
     * Parses an array of records inside a result wrapper. Returns one plain
     * object per record element. Works for both singular wrapper responses
     * (e.g., GetMessageDetails) and array-style (e.g., getMessagesUTC).
     */
    private ParseRecordArray(xml: string, resultPath: string | null): Record<string, unknown>[] {
        const containerXml = resultPath ? this.FindElementContent(xml, resultPath) : xml;
        if (!containerXml) return [];

        const childElements = this.ExtractDirectChildElements(containerXml);
        if (childElements.length === 0) return [];

        // Group consecutive same-tag elements as a record array
        const records: Record<string, unknown>[] = [];
        for (const child of childElements) {
            records.push(this.ParseElementFields(child.content));
        }
        return records;
    }

    private FindElementContent(xml: string, tag: string): string | null {
        const regex = new RegExp(`<(?:\\w+:)?${this.EscapeRegex(tag)}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${this.EscapeRegex(tag)}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1] : null;
    }

    private ExtractDirectChildElements(xml: string): Array<{ tag: string; content: string }> {
        const results: Array<{ tag: string; content: string }> = [];
        const regex = /<(?:\w+:)?(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?\1>/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(xml)) !== null) {
            results.push({ tag: match[1], content: match[2] });
        }
        return results;
    }

    /**
     * Parses a record element's children into a flat key-value map. Nested
     * objects and arrays are returned as raw inner XML strings (caller can
     * re-parse if needed — simple enough for most MagnetMail fields).
     */
    private ParseElementFields(xml: string): Record<string, unknown> {
        const record: Record<string, unknown> = {};
        const children = this.ExtractDirectChildElements(xml);
        for (const child of children) {
            const value = this.CoerceFieldValue(child.content.trim());
            // Last-write-wins for repeated child elements; MagnetMail rarely emits them in these shapes
            record[child.tag] = value;
        }
        return record;
    }

    private CoerceFieldValue(raw: string): unknown {
        if (raw === '') return null;
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
        if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
        return this.DecodeXmlEntities(raw);
    }

    // ── Metadata helpers ─────────────────────────────────────────────

    private ResolveObject(integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const obj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, objectName);
        if (!obj) throw new Error(`MagnetMailConnector: unknown IntegrationObject "${objectName}"`);
        return obj;
    }

    private BuildObjectMeta(obj: MJIntegrationObjectEntity): MagnetMailObjectMeta {
        const listAction = obj.APIPath || '';
        if (!listAction) throw new Error(`MagnetMailConnector: IntegrationObject "${obj.Name}" is missing APIPath (SOAP action)`);
        const resultPath = obj.ResponseDataKey || `${listAction}Result`;
        const raw = this.ParseDefaultQueryParams(obj);

        const extraArgs: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
            if (RESERVED_META_KEYS.has(k)) continue;
            extraArgs[k] = String(v);
        }

        return {
            ListAction: listAction,
            ResultPath: resultPath,
            CreateAction: raw['create_action'] as string | undefined,
            UpdateAction: raw['update_action'] as string | undefined,
            DeleteAction: raw['delete_action'] as string | undefined,
            DetailAction: raw['detail_action'] as string | undefined,
            WatermarkField: raw['watermark_field'] as string | undefined,
            WatermarkFromParam: raw['watermark_from_param'] as string | undefined,
            WatermarkToParam: raw['watermark_to_param'] as string | undefined,
            ExtraArgs: extraArgs,
        };
    }

    private ParseDefaultQueryParams(obj: MJIntegrationObjectEntity): Record<string, unknown> {
        if (!obj.DefaultQueryParams) return {};
        try {
            return JSON.parse(obj.DefaultQueryParams) as Record<string, unknown>;
        } catch {
            console.warn(`[MagnetMailConnector] Invalid DefaultQueryParams JSON for "${obj.Name}"`);
            return {};
        }
    }

    private GetPrimaryKeyField(objectID: string): string {
        const fields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(objectID);
        const pk = fields.find(f => f.IsPrimaryKey);
        return pk ? pk.Name : 'id';
    }

    private BuildFetchArgs(
        meta: MagnetMailObjectMeta,
        ctx: FetchContext,
        offset: number,
        pageSize: number
    ): Record<string, string> {
        const args: Record<string, string> = { ...meta.ExtraArgs };
        args['start_row'] = String(offset);
        args['row_count'] = String(pageSize);

        if (ctx.WatermarkValue && meta.WatermarkFromParam) {
            args[meta.WatermarkFromParam] = ctx.WatermarkValue;
        }
        return args;
    }

    private RawToExternalRecord(raw: Record<string, unknown>, objectType: string, pkField: string): ExternalRecord {
        const id = raw[pkField];
        return {
            ExternalID: id != null ? String(id) : '',
            ObjectType: objectType,
            Fields: raw,
        };
    }

    private ComputeWatermark(records: Record<string, unknown>[], field: string): string | undefined {
        let latest: string | undefined;
        for (const record of records) {
            const value = record[field];
            if (value && typeof value === 'string' && (!latest || value > latest)) {
                latest = value;
            }
        }
        return latest;
    }

    // ── Utility helpers ──────────────────────────────────────────────

    private async Throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.Sleep(minIntervalMs - elapsed);
        }
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private EscapeXmlValue(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private EscapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private DecodeXmlEntities(value: string): string {
        return value
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    private BuildCRUDError(err: unknown, operation: string, objectName: string): CRUDResult {
        const message = err instanceof Error ? err.message : String(err);
        return {
            Success: false,
            ErrorMessage: `${operation} failed for ${objectName}: ${message}`,
            StatusCode: 500,
        };
    }
}

/** Tree-shaking prevention function — import and call from module entry point. */
export function LoadMagnetMailConnector(): void { /* no-op */ }
