/**
 * ConstantContactConnector — Integration connector for Constant Contact email marketing platform.
 *
 * API Documentation: https://developer.constantcontact.com/api_reference/index.html
 *
 * Auth: OAuth 2.0 Authorization Code — access_token + refresh_token stored in credential.Values.
 *       Refreshes automatically using client_id/client_secret + refresh_token.
 * Token endpoint: https://authz.constantcontact.com/oauth2/default/v1/token
 * Base URL: https://api.cc.email/v3
 * Pagination: Cursor-based via _links.next.href
 * Rate limits: Standard CC limits (varies by endpoint)
 * Incremental: update_date_start param on contacts
 * CRUD: Full on Contacts, Contact Lists, Email Campaigns
 *
 * API Categories:
 *   - Contacts API (implemented) — contacts, contact lists, segments, custom fields
 *   - Email Campaigns API (implemented) — campaigns, activities, schedules, campaign tracking
 *   - Bulk Activities API (implemented, read-only) — async import/export job status
 *   - Account API (implemented, read-only) — account info, user privileges
 *   - Partner API (NOT implemented) — partner-only account management, not accessible with standard OAuth
 *   - Webhooks (NOT implemented) — limited to partner account events; not available for contact/campaign changes
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type DefaultFieldMapping,
    type FetchContext,
    type FetchBatchResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    type IntegrationObjectInfo,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
} from '@memberjunction/integration-engine';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ConstantContactConnectionConfig {
    ClientID: string;
    ClientSecret: string;
    AccessToken: string;
    RefreshToken: string;
}

interface CCAuthContext extends RESTAuthContext {
    Config: ConstantContactConnectionConfig;
}

interface CachedToken {
    AccessToken: string;
    RefreshToken: string;
    ExpiresAt: number;
}

interface CCContactsResponse {
    contacts: Record<string, unknown>[];
    _links?: { next?: { href: string } };
}

interface CCContactListsResponse {
    lists: Record<string, unknown>[];
    _links?: { next?: { href: string } };
}

interface CCCampaignsResponse {
    campaigns: Record<string, unknown>[];
    _links?: { next?: { href: string } };
}

interface CCActivitiesResponse {
    activities: Record<string, unknown>[];
    _links?: { next?: { href: string } };
}

interface CCBulkActivitiesResponse {
    results: Record<string, unknown>[];
    _links?: { next?: { href: string } };
}

// ─── Constants ───────────────────────────────────────────────────────────

const CC_TOKEN_URL = 'https://authz.constantcontact.com/oauth2/default/v1/token';
const CC_API_BASE = 'https://api.cc.email/v3';
const DEFAULT_PAGE_SIZE = 500;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 100;

// ─── Static Object Definitions ────────────────────────────────────────────

const CC_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Contacts',
        DisplayName: 'Contact',
        Description: 'Email contacts and subscribers',
        SupportsWrite: true,
        Fields: [
            { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique contact identifier (UUID)' },
            { Name: 'email_address', DisplayName: 'Email Address', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address object' },
            { Name: 'first_name', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First name' },
            { Name: 'last_name', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last name' },
            { Name: 'job_title', DisplayName: 'Job Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Job title' },
            { Name: 'company_name', DisplayName: 'Company', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company or organization name' },
            { Name: 'phone_numbers', DisplayName: 'Phone Numbers', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Array of phone number objects' },
            { Name: 'street_addresses', DisplayName: 'Street Addresses', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Array of street address objects' },
            { Name: 'list_memberships', DisplayName: 'List Memberships', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Array of list UUIDs this contact belongs to' },
            { Name: 'taggings', DisplayName: 'Tags', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Array of tag UUIDs' },
            { Name: 'custom_fields', DisplayName: 'Custom Fields', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Array of custom field value objects' },
            { Name: 'create_source', DisplayName: 'Create Source', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'How contact was created' },
            { Name: 'created_at', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last update timestamp' },
        ],
    },
    {
        Name: 'ContactLists',
        DisplayName: 'Contact List',
        Description: 'Contact lists and groups for targeting campaigns',
        SupportsWrite: true,
        Fields: [
            { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique list identifier (UUID)' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'List name' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'List description' },
            { Name: 'favorite', DisplayName: 'Favorite', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Marked as favorite' },
            { Name: 'contact_count', DisplayName: 'Contact Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of contacts in list' },
            { Name: 'created_at', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last update timestamp' },
        ],
    },
    {
        Name: 'EmailCampaigns',
        DisplayName: 'Email Campaign',
        Description: 'Email marketing campaigns',
        SupportsWrite: true,
        Fields: [
            { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique campaign identifier (UUID)' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign name' },
            { Name: 'current_status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign status (DRAFT, SENT, SCHEDULED, etc.)' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign type (em_marketing_email, etc.)' },
            { Name: 'created_at', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last update timestamp' },
            { Name: 'campaign_activities', DisplayName: 'Campaign Activities', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Array of activity_id/role objects embedded in campaign' },
        ],
    },
    {
        Name: 'CampaignActivities',
        DisplayName: 'Campaign Activity',
        Description: 'Individual email content/activity records within campaigns (parent-child under EmailCampaigns)',
        SupportsWrite: true,
        Fields: [
            { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique activity identifier (UUID)' },
            { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent campaign ID' },
            { Name: 'role', DisplayName: 'Role', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Activity role (primary_email, permalink, etc.)' },
            { Name: 'current_status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Activity status' },
            { Name: 'from_email', DisplayName: 'From Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender email address' },
            { Name: 'from_name', DisplayName: 'From Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender display name' },
            { Name: 'reply_to_email', DisplayName: 'Reply To', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Reply-to email address' },
            { Name: 'subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email subject line' },
            { Name: 'html_content', DisplayName: 'HTML Content', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HTML email body' },
            { Name: 'contact_list_ids', DisplayName: 'Contact Lists', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Target contact list IDs' },
            { Name: 'created_at', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last update timestamp' },
        ],
    },
    {
        Name: 'CampaignTracking',
        DisplayName: 'Campaign Tracking',
        Description: 'Open/click/bounce tracking metrics per campaign activity (read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Activity being tracked' },
            { Name: 'sends', DisplayName: 'Sends', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total emails sent' },
            { Name: 'opens', DisplayName: 'Opens', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total opens' },
            { Name: 'clicks', DisplayName: 'Clicks', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total clicks' },
            { Name: 'bounces', DisplayName: 'Bounces', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total bounces' },
            { Name: 'unsubscribes', DisplayName: 'Unsubscribes', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total unsubscribes' },
            { Name: 'forwards', DisplayName: 'Forwards', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total forwards' },
        ],
    },
    {
        Name: 'BulkActivities',
        DisplayName: 'Bulk Activity',
        Description: 'Async import/export job status records (read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Job ID' },
            { Name: 'state', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Job state (initialized, processing, completed, failed, cancelled)' },
            { Name: 'activity_type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type of bulk operation' },
            { Name: 'percent_done', DisplayName: 'Percent Done', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Completion percentage' },
            { Name: 'errors', DisplayName: 'Errors', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Array of error messages' },
            { Name: 'created_at', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Job creation time' },
            { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last status update time' },
        ],
    },
    {
        Name: 'Account',
        DisplayName: 'Account',
        Description: 'Constant Contact account information (singleton, read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'encoded_account_id', DisplayName: 'Account ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Encoded account identifier' },
            { Name: 'company_name', DisplayName: 'Company Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Account company name' },
            { Name: 'website', DisplayName: 'Website', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Account website URL' },
            { Name: 'time_zone', DisplayName: 'Time Zone', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Account time zone' },
            { Name: 'country_code', DisplayName: 'Country Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country code' },
        ],
    },
    // ─── Additional CC v3 endpoints — lean overlay (PK + key FKs + date fields) ──
    { Name: 'ContactTags', DisplayName: 'Contact Tag', Description: 'Tags for categorizing contacts', SupportsWrite: true, Fields: [
        { Name: 'tag_id', DisplayName: 'Tag ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tag UUID' },
    ]},
    { Name: 'ContactCustomFields', DisplayName: 'Custom Field', Description: 'Custom field definitions for contacts', SupportsWrite: true, Fields: [
        { Name: 'custom_field_id', DisplayName: 'Field ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom field UUID' },
    ]},
    { Name: 'Segments', DisplayName: 'Segment', Description: 'Contact segments (saved filters)', SupportsWrite: true, Fields: [
        { Name: 'segment_id', DisplayName: 'Segment ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Segment UUID' },
        { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'SegmentMembers', DisplayName: 'Segment Member', Description: 'Contacts within a segment (child of Segments)', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'segment_id', DisplayName: 'Segment ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Segments' },
    ]},
    { Name: 'LandingPages', DisplayName: 'Landing Page', Description: 'Landing page campaigns', SupportsWrite: true, Fields: [
        { Name: 'landing_page_id', DisplayName: 'Page ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Landing page UUID' },
        { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'SmsCampaigns', DisplayName: 'SMS Campaign', Description: 'SMS text message campaigns', SupportsWrite: true, Fields: [
        { Name: 'sms_campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'SMS campaign UUID' },
        { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'EmailSendHistory', DisplayName: 'Email Send History', Description: 'Historical email send records per campaign', SupportsWrite: false, Fields: [
        { Name: 'send_id', DisplayName: 'Send ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Send record ID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
    ]},
    { Name: 'CampaignTrackingOpens', DisplayName: 'Email Opens', Description: 'Per-contact open tracking', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
        { Name: 'created_time', DisplayName: 'Open Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'CampaignTrackingClicks', DisplayName: 'Email Clicks', Description: 'Per-contact click tracking', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
        { Name: 'created_time', DisplayName: 'Click Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'CampaignTrackingBounces', DisplayName: 'Email Bounces', Description: 'Per-contact bounce tracking', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
        { Name: 'created_time', DisplayName: 'Bounce Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'CampaignTrackingUnsubscribes', DisplayName: 'Email Unsubscribes', Description: 'Per-contact unsubscribe tracking', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
    ]},
    { Name: 'WebhookSubscriptions', DisplayName: 'Webhook Subscription', Description: 'Webhook/topic subscription config', SupportsWrite: true, Fields: [
        { Name: 'subscription_id', DisplayName: 'Sub ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Subscription UUID' },
    ]},
    { Name: 'CampaignTrackingForwards', DisplayName: 'Email Forwards', Description: 'Per-contact forward tracking', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
    ]},
    { Name: 'CampaignTrackingSends', DisplayName: 'Email Sends', Description: 'Per-contact send tracking', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
    ]},
    { Name: 'CampaignTrackingDidNotOpens', DisplayName: 'Email Did Not Opens', Description: 'Contacts who did not open', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
        { Name: 'campaign_activity_id', DisplayName: 'Activity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → CampaignActivities' },
    ]},
    { Name: 'ContactReporting', DisplayName: 'Contact Report', Description: 'Per-contact activity detail reports', SupportsWrite: false, Fields: [
        { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact UUID' },
    ]},
    { Name: 'AccountEmailAddresses', DisplayName: 'Account Email', Description: 'Account-level email addresses', SupportsWrite: true, Fields: [
        { Name: 'email_id', DisplayName: 'Email ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email record ID' },
    ]},
    { Name: 'AccountPhysicalAddress', DisplayName: 'Account Address', Description: 'Account physical address (singleton)', SupportsWrite: true, Fields: [
        { Name: 'encoded_account_id', DisplayName: 'Account ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Account ID' },
    ]},
];

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'ConstantContactConnector')
export class ConstantContactConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Constant Contact'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return CC_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-envelope';
        config.CategoryDescription = 'Constant Contact email marketing for contacts, lists, and campaigns';
        config.ParentCategoryName = 'Marketing';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ─────────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return CC_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: obj.Name === 'Contacts',
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity, objectName: string, _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticObj = CC_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!staticObj) return [];
        return staticObj.Fields.map(f => ({
            Name: f.Name,
            Label: f.DisplayName,
            Description: f.Description,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
        }));
    }

    // ─── Auth ──────────────────────────────────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        // Use cached token if still valid
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            const ctx: CCAuthContext = {
                Token: this.tokenCache.AccessToken,
                TokenType: 'Bearer',
                Config: await this.ParseConfig(companyIntegration, contextUser),
            };
            return ctx;
        }

        const config = await this.ParseConfig(companyIntegration, contextUser);

        // If we have a cached refresh token, use it; otherwise use the token from config
        const refreshToken = this.tokenCache?.RefreshToken ?? config.RefreshToken;

        if (refreshToken) {
            try {
                const refreshed = await this.RefreshAccessToken(config, refreshToken);
                this.tokenCache = refreshed;
                return { Token: refreshed.AccessToken, TokenType: 'Bearer', Config: config } as CCAuthContext;
            } catch {
                // Fall through to use the stored access token directly
            }
        }

        // Use access token from credentials as-is (initial setup)
        this.tokenCache = {
            AccessToken: config.AccessToken,
            RefreshToken: config.RefreshToken,
            ExpiresAt: Date.now() + (3600 * 1000), // Assume 1 hour TTL
        };
        return { Token: config.AccessToken, TokenType: 'Bearer', Config: config } as CCAuthContext;
    }

    private async RefreshAccessToken(
        config: ConstantContactConnectionConfig, refreshToken: string
    ): Promise<CachedToken> {
        const basicAuth = Buffer.from(`${config.ClientID}:${config.ClientSecret}`).toString('base64');
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

        const response = await fetch(CC_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`Constant Contact token refresh failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
        };

        return {
            AccessToken: data.access_token,
            RefreshToken: data.refresh_token ?? refreshToken,
            ExpiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000),
        };
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo
    ): Promise<ConstantContactConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['ClientID'] && parsed['ClientSecret'] && parsed['AccessToken']) {
                    return {
                        ClientID: parsed['ClientID'],
                        ClientSecret: parsed['ClientSecret'],
                        AccessToken: parsed['AccessToken'],
                        RefreshToken: parsed['RefreshToken'] ?? '',
                    };
                }
            }
        }
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return {
                ClientID: parsed['ClientID'] ?? '',
                ClientSecret: parsed['ClientSecret'] ?? '',
                AccessToken: parsed['AccessToken'] ?? '',
                RefreshToken: parsed['RefreshToken'] ?? '',
            };
        }
        throw new Error(
            'No Constant Contact credentials found. Set ClientID, ClientSecret, AccessToken, RefreshToken in credential Values or Configuration JSON.'
        );
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, `${CC_API_BASE}/account/summary`, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as Record<string, unknown>;
                const name = (body['organization_name'] as string | undefined) ?? 'Unknown';
                return { Success: true, Message: `Connected to Constant Contact: ${name}` };
            }
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ──────────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, _auth: RESTAuthContext): string {
        return CC_API_BASE;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        _page: number, _offset: number, cursor?: string
    ): string {
        // CC uses cursor-based pagination via _links.next.href
        if (cursor) {
            // The cursor from CC is already a full URL path or contains the cursor param
            if (cursor.startsWith('http')) return cursor;
            const sep = basePath.includes('?') ? '&' : '?';
            return `${basePath}${sep}cursor=${cursor}`;
        }
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}limit=${DEFAULT_PAGE_SIZE}`;
    }

    // ─── Response Parsing ──────────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;

        // Try explicit data key first
        if (responseDataKey && Array.isArray(body[responseDataKey])) {
            return body[responseDataKey] as Record<string, unknown>[];
        }

        // CC wraps responses in named arrays matching endpoint
        for (const key of ['contacts', 'lists', 'campaigns', 'activities', 'results']) {
            if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        }

        // Single-object responses (Account, etc.)
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, _currentPage: number, _currentOffset: number, _pageSize: number
    ): PaginationState {
        const body = rawBody as Record<string, unknown>;
        const links = body['_links'] as Record<string, unknown> | undefined;
        const next = links?.['next'] as Record<string, unknown> | undefined;
        const nextHref = next?.['href'] as string | undefined;

        if (nextHref) {
            // Extract cursor from href: /v3/contacts?cursor=abc&limit=500
            const cursorMatch = nextHref.match(/[?&]cursor=([^&]+)/);
            const cursor = cursorMatch ? decodeURIComponent(cursorMatch[1]) : nextHref;
            return { HasMore: true, NextCursor: cursor };
        }
        return { HasMore: false };
    }

    // ─── FetchChanges ──────────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectLower = ctx.ObjectName.toLowerCase();

        if (objectLower === 'contacts') {
            return this.FetchContacts(ctx);
        } else if (objectLower === 'contactlists') {
            return this.FetchContactLists(ctx);
        } else if (objectLower === 'emailcampaigns') {
            return this.FetchEmailCampaigns(ctx);
        } else if (objectLower === 'campaignactivities') {
            return this.FetchCampaignActivities(ctx);
        } else if (objectLower === 'campaigntracking') {
            return this.FetchCampaignTracking(ctx);
        } else if (objectLower === 'bulkactivities') {
            return this.FetchBulkActivities(ctx);
        } else if (objectLower === 'account') {
            return this.FetchAccount(ctx);
        }

        return this.FetchGenericCCObject(ctx);
    }

    private async FetchGenericCCObject(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        const url = ctx.CurrentCursor ?? `${CC_API_BASE}/${apiPath}?limit=${DEFAULT_PAGE_SIZE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Constant Contact ${ctx.ObjectName} API error: ${response.Status}`);
        }
        const records = this.NormalizeResponse(response.Body, null);
        const body = response.Body as Record<string, unknown>;
        const links = body['_links'] as Record<string, unknown> | undefined;
        const nextHref = (links?.['next'] as Record<string, unknown>)?.['href'] as string | undefined;
        const nextCursor = nextHref ? this.ExtractCursor(nextHref) : undefined;
        return {
            Records: records.map(r => {
                const id = String(r['contact_id'] ?? r['tag_id'] ?? r['segment_id'] ?? r['list_id'] ?? r['campaign_id'] ?? r['id'] ?? '');
                return { ExternalID: id, ObjectType: ctx.ObjectName, Fields: r };
            }),
            HasMore: !!nextCursor, NextCursor: nextCursor,
        };
    }

    private async FetchContacts(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);

        let url: string;
        if (ctx.CurrentCursor) {
            // Cursor is either full URL or param value
            url = ctx.CurrentCursor.startsWith('http') ? ctx.CurrentCursor : `${CC_API_BASE}/contacts?cursor=${ctx.CurrentCursor}`;
        } else {
            url = `${CC_API_BASE}/contacts?limit=${DEFAULT_PAGE_SIZE}&include=list_memberships,taggings,custom_fields,phone_numbers,street_addresses`;
            if (ctx.WatermarkValue) {
                url += `&update_date_start=${encodeURIComponent(ctx.WatermarkValue)}`;
            }
        }

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Constant Contact contacts API error: ${response.Status}`);
        }

        const body = response.Body as CCContactsResponse;
        const records = body.contacts ?? [];
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['contact_id'] ?? ''),
            ObjectType: 'Contacts',
            Fields: r,
        }));

        const nextHref = body._links?.next?.href;
        let nextCursor: string | undefined;
        if (nextHref) {
            const match = nextHref.match(/[?&]cursor=([^&]+)/);
            nextCursor = match ? decodeURIComponent(match[1]) : nextHref;
        }

        let newWatermark: string | undefined;
        if (!nextCursor) {
            for (const r of records) {
                const updated = r['updated_at'] as string | undefined;
                if (updated && (!newWatermark || updated > newWatermark)) newWatermark = updated;
            }
        }

        return {
            Records: externalRecords,
            HasMore: !!nextCursor,
            NextCursor: nextCursor,
            NewWatermarkValue: !nextCursor ? newWatermark : undefined,
        };
    }

    private async FetchContactLists(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);

        const url = ctx.CurrentCursor && ctx.CurrentCursor.startsWith('http')
            ? ctx.CurrentCursor
            : `${CC_API_BASE}/contact_lists?limit=${DEFAULT_PAGE_SIZE}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Constant Contact contact_lists API error: ${response.Status}`);
        }

        const body = response.Body as CCContactListsResponse;
        const records = body.lists ?? [];
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['list_id'] ?? ''),
            ObjectType: 'ContactLists',
            Fields: r,
        }));

        const nextHref = body._links?.next?.href;
        const nextCursor = nextHref ? this.ExtractCursor(nextHref) : undefined;

        return {
            Records: externalRecords,
            HasMore: !!nextCursor,
            NextCursor: nextCursor,
        };
    }

    private async FetchEmailCampaigns(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);

        const url = ctx.CurrentCursor && ctx.CurrentCursor.startsWith('http')
            ? ctx.CurrentCursor
            : `${CC_API_BASE}/emails?limit=${DEFAULT_PAGE_SIZE}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Constant Contact emails API error: ${response.Status}`);
        }

        const body = response.Body as CCCampaignsResponse;
        const records = body.campaigns ?? [];
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['campaign_id'] ?? ''),
            ObjectType: 'EmailCampaigns',
            Fields: r,
        }));

        const nextHref = body._links?.next?.href;
        const nextCursor = nextHref ? this.ExtractCursor(nextHref) : undefined;

        return {
            Records: externalRecords,
            HasMore: !!nextCursor,
            NextCursor: nextCursor,
        };
    }

    private async FetchCampaignActivities(ctx: FetchContext): Promise<FetchBatchResult> {
        // CC doesn't have a flat list endpoint for activities.
        // We fetch campaigns, then for each campaign we GET each activity individually.
        // This is a two-pass fetch: first get campaigns from offset, then collect activities.
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);

        // Fetch campaigns page
        const offset = ctx.CurrentOffset ?? 0;
        const campaignUrl = `${CC_API_BASE}/emails?limit=50`;
        const campaignResp = await this.MakeHTTPRequest(auth, campaignUrl, 'GET', headers);
        if (campaignResp.Status < 200 || campaignResp.Status >= 300) {
            throw new Error(`Constant Contact emails (for activities) API error: ${campaignResp.Status}`);
        }

        const campaignBody = campaignResp.Body as CCCampaignsResponse;
        const campaigns = campaignBody.campaigns ?? [];

        // Collect all activity IDs from campaign embedded activity objects
        const activityIds: string[] = [];
        for (const campaign of campaigns) {
            const activityRefs = campaign['campaign_activities'] as Array<{ campaign_activity_id: string }> | undefined;
            if (activityRefs) {
                for (const ref of activityRefs) {
                    if (ref.campaign_activity_id) activityIds.push(ref.campaign_activity_id);
                }
            }
        }

        // Fetch activities in parallel (batches of 5 to respect rate limits)
        const activityRecords: ExternalRecord[] = [];
        for (let i = 0; i < activityIds.length; i += 5) {
            const batch = activityIds.slice(i, i + 5);
            const results = await Promise.all(
                batch.map(id => this.FetchSingleActivity(auth, headers, id))
            );
            for (const record of results) {
                if (record) activityRecords.push(record);
            }
        }

        const hasMore = !!campaignBody._links?.next?.href;
        const nextCursor = hasMore ? this.ExtractCursor(campaignBody._links!.next!.href) : undefined;

        return {
            Records: activityRecords,
            HasMore: hasMore,
            NextCursor: nextCursor,
            NextOffset: offset + campaigns.length,
        };
    }

    private async FetchSingleActivity(
        auth: RESTAuthContext, headers: Record<string, string>, activityId: string
    ): Promise<ExternalRecord | null> {
        try {
            const response = await this.MakeHTTPRequest(auth, `${CC_API_BASE}/emails/${activityId}`, 'GET', headers);
            if (response.Status !== 200) return null;
            const body = response.Body as Record<string, unknown>;
            return {
                ExternalID: String(body['campaign_activity_id'] ?? activityId),
                ObjectType: 'CampaignActivities',
                Fields: body,
            };
        } catch {
            return null;
        }
    }

    private async FetchCampaignTracking(ctx: FetchContext): Promise<FetchBatchResult> {
        // Tracking is aggregated per campaign_activity_id from the campaign tracking report endpoints.
        // First get all campaign activities to know which to pull tracking for.
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);

        const campaignUrl = `${CC_API_BASE}/emails?limit=50`;
        const campaignResp = await this.MakeHTTPRequest(auth, campaignUrl, 'GET', headers);
        if (campaignResp.Status < 200 || campaignResp.Status >= 300) {
            throw new Error(`Constant Contact emails (for tracking) API error: ${campaignResp.Status}`);
        }

        const campaignBody = campaignResp.Body as CCCampaignsResponse;
        const campaigns = campaignBody.campaigns ?? [];

        const trackingRecords: ExternalRecord[] = [];
        for (const campaign of campaigns) {
            const activityRefs = campaign['campaign_activities'] as Array<{ campaign_activity_id: string }> | undefined;
            if (!activityRefs) continue;
            for (const ref of activityRefs) {
                const trackingRecord = await this.FetchActivityTracking(auth, headers, ref.campaign_activity_id);
                if (trackingRecord) trackingRecords.push(trackingRecord);
            }
        }

        return {
            Records: trackingRecords,
            HasMore: false,
        };
    }

    private async FetchActivityTracking(
        auth: RESTAuthContext, headers: Record<string, string>, activityId: string
    ): Promise<ExternalRecord | null> {
        try {
            const response = await this.MakeHTTPRequest(
                auth, `${CC_API_BASE}/emails/${activityId}/tracking/reports/summary`, 'GET', headers
            );
            if (response.Status !== 200) return null;
            const body = response.Body as Record<string, unknown>;
            return {
                ExternalID: activityId,
                ObjectType: 'CampaignTracking',
                Fields: { campaign_activity_id: activityId, ...body },
            };
        } catch {
            return null;
        }
    }

    private async FetchBulkActivities(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);

        const url = ctx.CurrentCursor && ctx.CurrentCursor.startsWith('http')
            ? ctx.CurrentCursor
            : `${CC_API_BASE}/activities?limit=${DEFAULT_PAGE_SIZE}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Constant Contact activities API error: ${response.Status}`);
        }

        const body = response.Body as CCBulkActivitiesResponse;
        const records = body.results ?? [];
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['activity_id'] ?? ''),
            ObjectType: 'BulkActivities',
            Fields: r,
        }));

        const nextHref = body._links?.next?.href;
        const nextCursor = nextHref ? this.ExtractCursor(nextHref) : undefined;

        return {
            Records: externalRecords,
            HasMore: !!nextCursor,
            NextCursor: nextCursor,
        };
    }

    private async FetchAccount(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, `${CC_API_BASE}/account/summary`, 'GET', headers);
        if (response.Status !== 200) {
            throw new Error(`Constant Contact account summary API error: ${response.Status}`);
        }
        const body = response.Body as Record<string, unknown>;
        return {
            Records: [{
                ExternalID: String(body['encoded_account_id'] ?? 'account'),
                ObjectType: 'Account',
                Fields: body,
            }],
            HasMore: false,
        };
    }

    private ExtractCursor(href: string): string {
        if (href.startsWith('http')) {
            try {
                const u = new URL(href);
                return u.searchParams.get('cursor') ?? href;
            } catch {
                return href;
            }
        }
        const match = href.match(/[?&]cursor=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : href;
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(ctx.ObjectName);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            const id = this.ExtractPrimaryKey(ctx.ObjectName, body);
            return { Success: true, ExternalID: id, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${this.CRUDEndpointURL(ctx.ObjectName)}/${ctx.ExternalID}`;
        // CC uses PUT for contacts (with email_address), PATCH for campaign activities
        const method = ctx.ObjectName.toLowerCase() === 'campaignactivities' ? 'PATCH' : 'PUT';
        const response = await this.MakeHTTPRequest(auth, url, method, headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const url = `${this.CRUDEndpointURL(ctx.ObjectName)}/${ctx.ExternalID}`;
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    private CRUDEndpointURL(objectName: string): string {
        switch (objectName.toLowerCase()) {
            case 'contacts':         return `${CC_API_BASE}/contacts`;
            case 'contactlists':     return `${CC_API_BASE}/contact_lists`;
            case 'emailcampaigns':   return `${CC_API_BASE}/emails`;
            case 'campaignactivities': return `${CC_API_BASE}/emails`;  // PUT /emails/{campaign_activity_id}
            default:                 return `${CC_API_BASE}/${objectName.toLowerCase()}`;
        }
    }

    private ExtractPrimaryKey(objectName: string, body: Record<string, unknown>): string {
        switch (objectName.toLowerCase()) {
            case 'contacts':           return String(body['contact_id'] ?? '');
            case 'contactlists':       return String(body['list_id'] ?? '');
            case 'emailcampaigns':     return String(body['campaign_id'] ?? '');
            case 'campaignactivities': return String(body['campaign_activity_id'] ?? '');
            default:                   return String(body['id'] ?? '');
        }
    }

    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const bodyStr = typeof response.Body === 'string' ? response.Body : JSON.stringify(response.Body);
        return {
            Success: false,
            ExternalID: '',
            StatusCode: response.Status,
            ErrorMessage: `${operation} failed for ${objectName}: HTTP ${response.Status} — ${bodyStr?.substring(0, 300)}`,
        };
    }

    // ─── Headers ───────────────────────────────────────────────────────

    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    // ─── HTTP Transport ────────────────────────────────────────────────

    protected async MakeHTTPRequest(
        auth: RESTAuthContext, url: string, method: string,
        headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        await this.Throttle();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            if (response.status === 401 && attempt === 0) {
                // Token expired — force re-auth by clearing cache and retry
                this.tokenCache = null;
                console.warn('[ConstantContact] 401 received, clearing token cache for retry');
                continue;
            }

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
                const delay = Math.min(retryAfter * 1000, 60_000);
                console.warn(`[ConstantContact] Rate limited (429), waiting ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
                console.warn(`[ConstantContact] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }

        throw new Error(`Constant Contact request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private async FetchWithTimeout(
        url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers, signal: controller.signal };
            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                opts.body = JSON.stringify(body);
            }
            return await fetch(url, opts);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Constant Contact request timed out: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async ParseBody(response: Response): Promise<unknown> {
        const ct = response.headers.get('content-type') ?? '';
        if (ct.includes('json')) return response.json() as Promise<unknown>;
        return response.text();
    }

    private ToRESTResponse(response: Response, body: unknown): RESTResponse {
        const hdrs: Record<string, string> = {};
        response.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
        return { Status: response.status, Body: body, Headers: hdrs };
    }

    private async Throttle(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Default Field Mappings ────────────────────────────────────────

    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const obj = CC_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadConstantContactConnector() { /* intentionally empty */ }
