import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed HubSpot API credentials */
interface HubSpotCredentials {
    AccessToken: string;
    ApiVersion: string;
}

/** Extended auth context carrying HubSpot credentials */
interface HubSpotAuthContext extends RESTAuthContext {
    Credentials: HubSpotCredentials;
}

/** HubSpot property definition (from /crm/v3/properties/{objectType}) */
interface HubSpotPropertyDef {
    name: string;
    label: string;
    type: string;
    fieldType: string;
    groupName: string;
    description: string;
    hasUniqueValue: boolean;
    calculated: boolean;
    externalOptions: boolean;
    modificationMetadata?: {
        readOnlyValue: boolean;
    };
}

// ─── Constants ────────────────────────────────────────────────────────

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const DEFAULT_API_VERSION = 'v3';

/** Maximum retries for rate-limited or failed requests */
const MAX_RETRIES = 5;

/** HTTP request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30000;

/** Minimum milliseconds between API requests (HubSpot: 100 req/10s for private apps) */
const MIN_REQUEST_INTERVAL_MS = 100;

/**
 * Known properties to request per object type. HubSpot's list endpoint
 * only returns a handful of default properties unless you explicitly
 * specify which properties to include via the `properties` query param.
 */
const HUBSPOT_PROPERTIES: Record<string, string[]> = {
    contacts: [
        'email', 'firstname', 'lastname', 'phone', 'mobilephone', 'company',
        'jobtitle', 'lifecyclestage', 'hs_lead_status', 'address', 'city',
        'state', 'zip', 'country', 'website', 'industry',
        'annualrevenue', 'numberofemployees', 'hs_object_id',
        'createdate', 'lastmodifieddate', 'associatedcompanyid',
        'notes_last_contacted', 'notes_last_updated', 'hs_email_optout',
    ],
    companies: [
        'name', 'domain', 'industry', 'phone', 'address', 'address2',
        'city', 'state', 'zip', 'country', 'website', 'description',
        'numberofemployees', 'annualrevenue', 'lifecyclestage',
        'type', 'hs_object_id', 'createdate', 'hs_lastmodifieddate',
        'founded_year', 'is_public',
    ],
    deals: [
        'dealname', 'amount', 'dealstage', 'pipeline', 'closedate',
        'createdate', 'hs_object_id', 'hs_lastmodifieddate',
        'dealtype', 'description', 'hs_deal_stage_probability',
        'hs_projected_amount', 'hs_priority', 'hubspot_owner_id',
        'notes_last_contacted', 'num_associated_contacts',
    ],
    tickets: [
        'subject', 'content', 'hs_pipeline', 'hs_pipeline_stage',
        'hs_ticket_priority', 'hs_ticket_category', 'createdate',
        'hs_lastmodifieddate', 'hs_object_id', 'closed_date',
        'source_type', 'hubspot_owner_id',
    ],
    products: [
        'name', 'description', 'price', 'hs_cost_of_goods_sold',
        'hs_recurring_billing_period', 'hs_sku', 'tax',
        'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    line_items: [
        'name', 'description', 'quantity', 'price', 'amount',
        'discount', 'tax', 'hs_product_id', 'hs_line_item_currency_code',
        'hs_sku', 'hs_cost_of_goods_sold', 'hs_recurring_billing_period',
        'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    quotes: [
        'hs_title', 'hs_expiration_date', 'hs_status', 'hs_quote_amount',
        'hs_currency', 'hs_sender_firstname', 'hs_sender_lastname',
        'hs_sender_email', 'hs_sender_company_name', 'hs_language',
        'hs_locale', 'hs_slug', 'hs_public_url_key',
        'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    calls: [
        'hs_call_title', 'hs_call_body', 'hs_call_status',
        'hs_call_direction', 'hs_call_duration', 'hs_call_from_number',
        'hs_call_to_number', 'hs_call_disposition',
        'hs_call_recording_url', 'hubspot_owner_id',
        'hs_timestamp', 'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    emails: [
        'hs_email_subject', 'hs_email_text', 'hs_email_html',
        'hs_email_status', 'hs_email_direction',
        'hs_email_sender_email', 'hs_email_sender_firstname',
        'hs_email_sender_lastname', 'hs_email_to_email',
        'hubspot_owner_id',
        'hs_timestamp', 'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    notes: [
        'hs_note_body', 'hs_timestamp', 'hubspot_owner_id',
        'hs_attachment_ids', 'hs_body_preview', 'hs_body_preview_is_truncated',
        'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    tasks: [
        'hs_task_subject', 'hs_task_body', 'hs_task_status',
        'hs_task_priority', 'hs_task_type', 'hs_timestamp',
        'hs_task_completion_date', 'hs_queue_membership_ids',
        'hubspot_owner_id',
        'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    meetings: [
        'hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time',
        'hs_meeting_end_time', 'hs_meeting_outcome', 'hs_meeting_location',
        'hs_meeting_external_url', 'hs_internal_meeting_notes',
        'hs_activity_type', 'hubspot_owner_id',
        'hs_timestamp', 'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
    feedback_submissions: [
        'hs_survey_id', 'hs_survey_name', 'hs_survey_type',
        'hs_submission_name', 'hs_content', 'hs_response_group',
        'hs_sentiment', 'hs_survey_channel',
        'hs_timestamp', 'createdate', 'hs_lastmodifieddate', 'hs_object_id',
    ],
};

// ─── Connector ────────────────────────────────────────────────────────

/**
 * Connector for HubSpot CRM via the HubSpot REST API v3.
 *
 * Extends BaseRESTIntegrationConnector to leverage metadata-driven object/field
 * discovery from IntegrationEngineBase cache and generic pagination handling.
 *
 * Uses Bearer token authentication (private app key or OAuth access token).
 * Supports cursor-based pagination and automatic response flattening.
 *
 * DATA SAFETY: This connector is READ-ONLY. It never writes data back to HubSpot.
 */
@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseRESTIntegrationConnector {

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    // ─── Abstract method implementations (BaseRESTIntegrationConnector) ──

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const credentials = await this.LoadCredentials(companyIntegration);
        const auth: HubSpotAuthContext = {
            Token: credentials.AccessToken,
            Credentials: credentials,
        };
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
        };
    }

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        _body?: unknown
    ): Promise<RESTResponse> {
        // Throttle: ensure minimum interval between requests
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) {
            await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
        }

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers);
            this.lastRequestTime = Date.now();

            if (response.status === 429) {
                const delayMs = this.CalculateRetryDelay(response, attempt);
                console.warn(
                    `[HubSpot] Rate limited (429), retrying in ${delayMs}ms ` +
                    `(attempt ${attempt + 1}/${MAX_RETRIES})`
                );
                await this.Sleep(delayMs);
                continue;
            }

            const body = await response.json() as unknown;
            return this.BuildRESTResponse(response, body);
        }

        throw new Error(`HubSpot API request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        const body = rawBody as Record<string, unknown>;

        // Extract the records array using the responseDataKey (typically "results")
        let records: unknown[];
        if (responseDataKey != null) {
            const data = body[responseDataKey];
            if (!data || !Array.isArray(data)) return [];
            records = data;
        } else if (Array.isArray(rawBody)) {
            records = rawBody;
        } else {
            return [];
        }

        // Flatten HubSpot's nested { id, properties: {...}, createdAt, updatedAt, archived }
        return records.map(r => this.FlattenHubSpotRecord(r as Record<string, unknown>));
    }

    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        const body = rawBody as Record<string, unknown>;
        const paging = body['paging'] as { next?: { after?: string } } | undefined;
        const nextCursor = paging?.next?.after;

        if (nextCursor) {
            return { HasMore: true, NextCursor: nextCursor };
        }

        return { HasMore: false };
    }

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, _auth: RESTAuthContext): string {
        return HUBSPOT_API_BASE;
    }

    // ─── HubSpot-specific pagination ─────────────────────────────────

    /**
     * Overrides base pagination URL building to use HubSpot's parameter names.
     * HubSpot uses `after` for cursor pagination (not `cursor`), and needs
     * `limit` instead of `pageSize`. Also appends `properties` query param.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';
        const objectName = this.ExtractObjectNameFromPath(basePath);
        const propertiesParam = this.BuildPropertiesParam(objectName);

        if (cursor) {
            return `${basePath}${separator}limit=${obj.DefaultPageSize}&after=${encodeURIComponent(cursor)}${propertiesParam}`;
        }

        return `${basePath}${separator}limit=${obj.DefaultPageSize}${propertiesParam}`;
    }

    // ─── TestConnection ─────────────────────────────────────────────

    /** Tests connectivity by authenticating and fetching 1 contact. */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, _contextUser);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(
                auth,
                `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=1`,
                'GET',
                headers
            );

            if (response.Status >= 200 && response.Status < 300) {
                const hubSpotAuth = auth as HubSpotAuthContext;
                return {
                    Success: true,
                    Message: 'Successfully connected to HubSpot CRM API',
                    ServerVersion: `HubSpot CRM API ${hubSpotAuth.Credentials.ApiVersion}`,
                };
            }

            const bodyPreview = typeof response.Body === 'string'
                ? response.Body.slice(0, 500)
                : JSON.stringify(response.Body).slice(0, 500);
            return {
                Success: false,
                Message: `HubSpot API returned ${response.Status}: ${bodyPreview}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── GetDefaultFieldMappings ──────────────────────────────────

    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'contacts':
                return [
                    { SourceFieldName: 'email', DestinationFieldName: 'Email', IsKeyField: true },
                    { SourceFieldName: 'firstname', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'lastname', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'phone', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'company', DestinationFieldName: 'CompanyName' },
                    { SourceFieldName: 'lifecyclestage', DestinationFieldName: 'Status' },
                ];
            case 'companies':
                return [
                    { SourceFieldName: 'name', DestinationFieldName: 'Name', IsKeyField: true },
                    { SourceFieldName: 'domain', DestinationFieldName: 'Website' },
                    { SourceFieldName: 'industry', DestinationFieldName: 'Industry' },
                    { SourceFieldName: 'city', DestinationFieldName: 'City' },
                    { SourceFieldName: 'state', DestinationFieldName: 'State' },
                ];
            case 'deals':
                return [
                    { SourceFieldName: 'dealname', DestinationFieldName: 'Name', IsKeyField: true },
                    { SourceFieldName: 'amount', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'dealstage', DestinationFieldName: 'Stage' },
                    { SourceFieldName: 'closedate', DestinationFieldName: 'CloseDate' },
                    { SourceFieldName: 'pipeline', DestinationFieldName: 'Pipeline' },
                ];
            default:
                return [];
        }
    }

    // ─── Default Configuration ──────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'HubSpot',
            DefaultObjects: [],  // Objects are auto-discovered from metadata via DiscoverObjects
        };
    }

    // ─── Schema Discovery Helpers ────────────────────────────────────

    /** Converts a HubSpot property definition to ExternalFieldSchema format */
    public MapPropertyToField(prop: HubSpotPropertyDef): {
        Name: string;
        Label: string;
        DataType: string;
        IsRequired: boolean;
        IsUniqueKey: boolean;
        IsReadOnly: boolean;
    } {
        return {
            Name: prop.name,
            Label: prop.label || prop.name,
            DataType: this.MapHubSpotType(prop.type, prop.fieldType),
            IsRequired: false, // HubSpot doesn't expose required via properties API
            IsUniqueKey: prop.hasUniqueValue,
            IsReadOnly: prop.calculated || (prop.modificationMetadata?.readOnlyValue ?? false),
        };
    }

    /** Maps HubSpot type + fieldType to a simplified data type string */
    public MapHubSpotType(type: string, fieldType: string): string {
        switch (type) {
            case 'string':
                if (fieldType === 'textarea') return 'text';
                if (fieldType === 'html') return 'html';
                return 'string';
            case 'number':
                return 'number';
            case 'date':
            case 'datetime':
                return 'datetime';
            case 'bool':
                return 'boolean';
            case 'enumeration':
                return 'enum';
            default:
                return type;
        }
    }

    // ─── Credential management ────────────────────────────────────

    /**
     * Reads credentials from CompanyIntegration.CredentialID -> Credential.Values JSON,
     * or falls back to CompanyIntegration Configuration JSON for backwards compat.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity
    ): Promise<HubSpotCredentials> {
        // Try loading from linked Credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const creds = await this.LoadFromCredentialEntity(credentialID);
            if (creds) return creds;
        }

        // Fallback: read from CompanyIntegration Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const creds = this.ParseCredentialJson(configJson);
            if (creds) return creds;
        }

        throw new Error(
            'No HubSpot credentials found. Attach a credential with an accessToken or apiKey, ' +
            'or set Configuration JSON on the CompanyIntegration.'
        );
    }

    /** Loads credentials from a Credential entity by ID. */
    private async LoadFromCredentialEntity(credentialID: string): Promise<HubSpotCredentials | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials');
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        return this.ParseCredentialJson(credential.Values);
    }

    /** Parses a JSON string to extract HubSpot credentials. Returns null if no token found. */
    private ParseCredentialJson(json: string): HubSpotCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, string>;
            const token = parsed['accessToken'] ?? parsed['AccessToken'] ?? parsed['apiKey'] ?? parsed['ApiKey'];
            if (token) {
                return {
                    AccessToken: token,
                    ApiVersion: parsed['apiVersion'] ?? DEFAULT_API_VERSION,
                };
            }
            return null;
        } catch {
            return null;
        }
    }

    // ─── Response flattening ─────────────────────────────────────────

    /**
     * Flattens a HubSpot CRM record from the nested format:
     *   { id, properties: { field1, field2 }, createdAt, updatedAt, archived }
     * into a flat record with all properties at the top level,
     * plus system fields (hs_object_id, createdAt, updatedAt, archived).
     */
    private FlattenHubSpotRecord(record: Record<string, unknown>): Record<string, unknown> {
        const properties = record['properties'] as Record<string, string | null> | undefined;
        const result: Record<string, unknown> = {};

        // Add flattened properties first
        if (properties) {
            for (const [key, value] of Object.entries(properties)) {
                result[key] = value;
            }
        }

        // Add system fields (these override any conflicting property names)
        result['hs_object_id'] = record['id'];
        result['createdAt'] = record['createdAt'];
        result['updatedAt'] = record['updatedAt'];
        result['archived'] = record['archived'];

        return result;
    }

    // ─── URL helpers ─────────────────────────────────────────────────

    /**
     * Extracts the HubSpot object name from an API path.
     * E.g., "/crm/v3/objects/contacts" -> "contacts"
     */
    private ExtractObjectNameFromPath(path: string): string {
        // Remove query string
        const pathOnly = path.split('?')[0];
        // Get the last path segment
        const segments = pathOnly.split('/').filter(s => s.length > 0);
        return segments[segments.length - 1] ?? '';
    }

    /**
     * Builds the `properties` query parameter for a HubSpot object type.
     * Returns empty string if no properties are configured for the object.
     */
    private BuildPropertiesParam(objectName: string): string {
        const properties = HUBSPOT_PROPERTIES[objectName];
        if (properties && properties.length > 0) {
            return `&properties=${properties.join(',')}`;
        }
        return '';
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    /** Executes an HTTP request with a timeout. */
    private async FetchWithTimeout(
        url: string,
        method: string,
        headers: Record<string, string>
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, { method, headers, signal: controller.signal });
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`HubSpot API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /** Calculates retry delay from Retry-After header or exponential backoff. */
    private CalculateRetryDelay(response: Response, attempt: number): number {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '0', 10);
        return retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 30000);
    }

    /** Converts a fetch Response + parsed body into a RESTResponse. */
    private BuildRESTResponse(response: Response, body: unknown): RESTResponse {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return { Status: response.status, Body: body, Headers: headers };
    }

    /** Returns a promise that resolves after the specified number of milliseconds. */
    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
