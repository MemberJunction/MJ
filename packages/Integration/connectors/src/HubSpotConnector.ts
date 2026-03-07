import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
} from '@memberjunction/integration-engine';
import type { ExternalRecord } from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed HubSpot API credentials */
interface HubSpotCredentials {
    AccessToken: string;
    ApiVersion: string;
}

/** HubSpot API list response shape */
interface HubSpotListResponse {
    results: HubSpotObject[];
    paging?: {
        next?: { after: string; link?: string };
    };
}

/** Single HubSpot CRM object */
interface HubSpotObject {
    id: string;
    properties: Record<string, string | null>;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
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
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 100; // HubSpot max per request

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

/** Standard CRM objects with their sync capabilities */
const HUBSPOT_OBJECTS: Record<string, { Label: string; SupportsIncrementalSync: boolean; SupportsWrite: boolean }> = {
    contacts:             { Label: 'Contacts',             SupportsIncrementalSync: true,  SupportsWrite: false },
    companies:            { Label: 'Companies',            SupportsIncrementalSync: true,  SupportsWrite: false },
    deals:                { Label: 'Deals',                SupportsIncrementalSync: true,  SupportsWrite: false },
    tickets:              { Label: 'Tickets',              SupportsIncrementalSync: true,  SupportsWrite: false },
    products:             { Label: 'Products',             SupportsIncrementalSync: false, SupportsWrite: false },
    line_items:           { Label: 'Line Items',           SupportsIncrementalSync: true,  SupportsWrite: false },
    quotes:               { Label: 'Quotes',               SupportsIncrementalSync: true,  SupportsWrite: false },
    calls:                { Label: 'Calls',                SupportsIncrementalSync: true,  SupportsWrite: false },
    emails:               { Label: 'Emails',               SupportsIncrementalSync: true,  SupportsWrite: false },
    notes:                { Label: 'Notes',                SupportsIncrementalSync: true,  SupportsWrite: false },
    tasks:                { Label: 'Tasks',                SupportsIncrementalSync: true,  SupportsWrite: false },
    meetings:             { Label: 'Meetings',             SupportsIncrementalSync: true,  SupportsWrite: false },
    feedback_submissions: { Label: 'Feedback Submissions', SupportsIncrementalSync: false, SupportsWrite: false },
};

// ─── Connector ────────────────────────────────────────────────────────

/**
 * Connector for HubSpot CRM via the HubSpot REST API v3.
 * Uses Bearer token authentication (private app key or OAuth access token).
 * Supports discovery of standard CRM objects and their properties,
 * incremental sync via cursor-based pagination, and default field mappings.
 *
 * DATA SAFETY: This connector is READ-ONLY. It never writes data back to HubSpot.
 */
@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseIntegrationConnector {

    // ─── TestConnection ───────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const creds = await this.GetCredentials(companyIntegration, contextUser);
            // Minimal test: fetch 1 contact to validate auth
            const response = await this.HubSpotGet(creds, '/crm/v3/objects/contacts?limit=1');

            if (response.ok) {
                return {
                    Success: true,
                    Message: 'Successfully connected to HubSpot CRM API',
                    ServerVersion: `HubSpot CRM API ${creds.ApiVersion}`,
                };
            }

            const errorBody = await response.text();
            return {
                Success: false,
                Message: `HubSpot API returned ${response.status}: ${errorBody}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                Success: false,
                Message: `Connection failed: ${message}`,
            };
        }
    }

    // ─── DiscoverObjects ──────────────────────────────────────────

    public async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return Object.entries(HUBSPOT_OBJECTS).map(([name, meta]) => ({
            Name: name,
            Label: meta.Label,
            SupportsIncrementalSync: meta.SupportsIncrementalSync,
            SupportsWrite: meta.SupportsWrite,
        }));
    }

    // ─── DiscoverFields ───────────────────────────────────────────

    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const creds = await this.GetCredentials(companyIntegration, contextUser);
        const response = await this.HubSpotGet(creds, `/crm/v3/properties/${objectName}`);

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Failed to discover fields for "${objectName}": ${response.status} ${body}`);
        }

        const data = await response.json() as { results: HubSpotPropertyDef[] };
        return data.results.map(prop => this.MapPropertyToField(prop));
    }

    // ─── FetchChanges ─────────────────────────────────────────────

    /**
     * Fetches a batch of records from HubSpot using cursor-based pagination.
     * The watermark value is the cursor (`after` parameter) for the next page.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const creds = await this.GetCredentials(ctx.CompanyIntegration, ctx.ContextUser);
        const batchSize = Math.min(ctx.BatchSize || DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);

        let url = `/crm/v3/objects/${ctx.ObjectName}?limit=${batchSize}`;

        // Request all known properties for this object type so the API
        // returns full record data instead of just default properties
        const properties = HUBSPOT_PROPERTIES[ctx.ObjectName];
        if (properties && properties.length > 0) {
            url += `&properties=${properties.join(',')}`;
        }

        if (ctx.WatermarkValue) {
            url += `&after=${encodeURIComponent(ctx.WatermarkValue)}`;
        }

        const response = await this.HubSpotGet(creds, url);
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`FetchChanges failed for "${ctx.ObjectName}": ${response.status} ${body}`);
        }

        const data = await response.json() as HubSpotListResponse;
        const records: ExternalRecord[] = data.results.map(obj => this.MapHubSpotObject(obj, ctx.ObjectName));
        const nextCursor = data.paging?.next?.after ?? undefined;

        return {
            Records: records,
            HasMore: !!nextCursor,
            NewWatermarkValue: nextCursor,
        };
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
        const objects = Object.entries(HUBSPOT_OBJECTS);
        return {
            DefaultSchemaName: 'HubSpot',
            DefaultObjects: objects.map(([name, meta]) => ({
                SourceObjectName: name,
                TargetTableName: meta.Label.replace(/\s+/g, ''),
                TargetEntityName: `HubSpot ${meta.Label}`,
                SyncEnabled: true,
                FieldMappings: this.GetDefaultFieldMappings(name, meta.Label),
            })),
        };
    }

    // ─── Credential management ────────────────────────────────────

    /**
     * Reads credentials from CompanyIntegration.CredentialID → Credential.Values JSON,
     * or falls back to CompanyIntegration Configuration JSON for backwards compat.
     */
    protected async GetCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<HubSpotCredentials> {
        // Try loading from linked Credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded) {
                const values = credential.Values;
                if (values) {
                    const parsed = JSON.parse(values) as Record<string, string>;
                    const token = parsed['accessToken'] ?? parsed['AccessToken'] ?? parsed['apiKey'] ?? parsed['ApiKey'];
                    if (token) {
                        return {
                            AccessToken: token,
                            ApiVersion: parsed['apiVersion'] ?? DEFAULT_API_VERSION,
                        };
                    }
                }
            }
        }

        // Fallback: read from CompanyIntegration Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const config = JSON.parse(configJson) as Record<string, string>;
            const token = config['accessToken'] ?? config['AccessToken'] ?? config['apiKey'] ?? config['ApiKey'];
            if (token) {
                return {
                    AccessToken: token,
                    ApiVersion: config['apiVersion'] ?? DEFAULT_API_VERSION,
                };
            }
        }

        throw new Error('No HubSpot credentials found. Attach a credential with an accessToken or apiKey, or set Configuration JSON on the CompanyIntegration.');
    }

    // ─── HTTP helpers ─────────────────────────────────────────────

    /** Executes a GET request against the HubSpot API with Bearer auth */
    private async HubSpotGet(creds: HubSpotCredentials, path: string): Promise<Response> {
        const url = `${HUBSPOT_API_BASE}${path}`;
        return fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${creds.AccessToken}`,
                'Accept': 'application/json',
            },
        });
    }

    // ─── Mapping helpers ──────────────────────────────────────────

    /** Converts a HubSpot property definition to ExternalFieldSchema */
    private MapPropertyToField(prop: HubSpotPropertyDef): ExternalFieldSchema {
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
    private MapHubSpotType(type: string, fieldType: string): string {
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

    /** Converts a HubSpot CRM object to an ExternalRecord */
    private MapHubSpotObject(obj: HubSpotObject, objectName: string): ExternalRecord {
        const fields: Record<string, unknown> = {
            hs_object_id: obj.id,
            ...obj.properties,
        };

        return {
            ExternalID: obj.id,
            ObjectType: objectName,
            Fields: fields,
            ModifiedAt: obj.updatedAt ? new Date(obj.updatedAt) : new Date(),
            IsDeleted: obj.archived,
        };
    }
}
