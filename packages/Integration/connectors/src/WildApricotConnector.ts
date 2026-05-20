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
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Connection configuration for the Wild Apricot connector.
 *
 * Wild Apricot uses OAuth 2.0 client_credentials grant: the admin API Key is
 * passed as the Basic auth username (with empty password) on the token
 * endpoint. A bearer access token comes back and is used on every subsequent
 * request.
 */
export interface WildApricotConnectionConfig {
    /** Wild Apricot admin API Key (used as Basic auth username on the OAuth token endpoint). */
    ApiKey: string;
    /**
     * Optional Wild Apricot account (tenant) ID. When omitted, the connector
     * auto-discovers it via GET /v2/accounts on first authentication and
     * selects the first account the API Key has access to.
     */
    AccountId?: string;
    /**
     * Wild Apricot REST API version segment, e.g. "v2.3". Defaults to "v2.3".
     * Changing this lets the integration opt into a newer/older published version.
     */
    ApiVersion?: string;

    // ── Optional performance overrides ──────────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 4 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /**
     * Minimum interval between requests (ms). Default: 1100.
     * Wild Apricot's rate limit baseline is ~60 req/min — 1.1s floor keeps
     * headroom. Adaptive backoff widens this on 429.
     */
    MinRequestIntervalMs?: number;
    /** Polling interval for async contact queries (ms). Default: 2000 */
    AsyncPollIntervalMs?: number;
    /** Maximum wait for async contact queries (ms). Default: 120000 (2 min) */
    AsyncPollTimeoutMs?: number;
}

/** Authenticated context carried through each request cycle. */
interface WildApricotAuthContext extends RESTAuthContext {
    Token: string;
    ExpiresAt: Date;
    AccountId: string;
    BaseUrl: string;
    Config: WildApricotConnectionConfig;
}

/** Token response from https://oauth.wildapricot.org/auth/token. */
interface WildApricotTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    Permissions?: Array<{ AccountId?: number }>;
}

/** Shape of an entry returned by GET /v2/accounts. */
interface WildApricotAccountSummary {
    Id: number;
    Name?: string;
    Url?: string;
    PrimaryDomainName?: string;
}

/** Response envelope for async /contacts queries — contains a pollable ResultId. */
interface WildApricotAsyncResponse {
    State?: string;
    ResultId?: string;
    ResultUrl?: string;
}

/** Polled result envelope for async /contacts queries. */
interface WildApricotContactResults {
    Contacts?: Record<string, unknown>[];
    ContactsCount?: number;
    State?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const WA_OAUTH_TOKEN_URL = 'https://oauth.wildapricot.org/auth/token';
const WA_API_HOST = 'https://api.wildapricot.org';
const DEFAULT_API_VERSION = 'v2.3';

/** Refresh access token 60s before hard expiry to avoid race conditions. */
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
/** 60 req/min documented baseline → ~1.1s floor. */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1100;
const DEFAULT_ASYNC_POLL_INTERVAL_MS = 2000;
const DEFAULT_ASYNC_POLL_TIMEOUT_MS = 120000;
const DEFAULT_PAGE_SIZE = 100;

/**
 * Maps the ApiType string used in /contactfields responses to a MemberJunction
 * field DataType. Wild Apricot's custom field type taxonomy is a closed set
 * documented in the Admin API.
 */
const WA_CUSTOM_FIELD_TYPE_MAP: Record<string, string> = {
    'String': 'nvarchar',
    'Text': 'nvarchar',
    'MultilineText': 'nvarchar',
    'Number': 'decimal',
    'Decimal': 'decimal',
    'Integer': 'int',
    'Boolean': 'bit',
    'Date': 'datetime',
    'DateTime': 'datetime',
    'Email': 'nvarchar',
    'Phone': 'nvarchar',
    'Picture': 'nvarchar',
    'Document': 'nvarchar',
    'Choice': 'nvarchar',
    'MultipleChoice': 'nvarchar',
    'RadioButtons': 'nvarchar',
    'DropDown': 'nvarchar',
    'ExtraChargeCalculation': 'decimal',
    'Rules': 'nvarchar',
    'Section': 'nvarchar',
};

// ─── Static Action Metadata ───────────────────────────────────────────

/**
 * Static catalog of Wild Apricot admin API objects used for action generation.
 * Mirrors the runtime metadata in `metadata/integrations/.wild-apricot.json`
 * but is maintained here so action generation does not require a live
 * connection. The custom-fields discovery layer is dynamic and layered on top
 * of the Contacts object at runtime.
 */
const WILD_APRICOT_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Contacts', DisplayName: 'Contacts', SupportsWrite: true,
        Description: 'Contacts including members, prospects, and staff. Rich custom field support via FieldValues.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique contact identifier' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Shortcut to FirstName system field' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Shortcut to LastName system field' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email — natural key' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization name' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Computed display name' },
            { Name: 'MembershipLevel', DisplayName: 'Membership Level', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Linked membership level reference' },
            { Name: 'MembershipEnabled', DisplayName: 'Membership Enabled', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether contact is a member' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Membership status' },
            { Name: 'ProfileLastUpdated', DisplayName: 'Profile Last Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Watermark field for incremental sync' },
        ],
    },
    {
        Name: 'MembershipLevels', DisplayName: 'Membership Levels', SupportsWrite: false,
        Description: 'Membership level catalog — tiers, fees, renewal cadence.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique membership level ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Level name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Level description' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Individual or Bundle' },
            { Name: 'MembershipFee', DisplayName: 'Membership Fee', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Base fee' },
            { Name: 'PublicCanApply', DisplayName: 'Public Can Apply', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Self-apply flag' },
            { Name: 'BundleMembersLimit', DisplayName: 'Bundle Members Limit', Type: 'integer', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Seats for bundle tiers' },
        ],
    },
    {
        Name: 'MemberGroups', DisplayName: 'Member Groups', SupportsWrite: false,
        Description: 'Ad-hoc member groups with contact membership lists.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group ID' },
            { Name: 'ContactsCount', DisplayName: 'Contacts Count', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Count of members' },
            { Name: 'ContactIds', DisplayName: 'Contact IDs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member contact IDs (array)' },
        ],
    },
    {
        Name: 'Events', DisplayName: 'Events', SupportsWrite: true,
        Description: 'Event catalog with dates, locations, registration settings, and tags.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event title' },
            { Name: 'EventType', DisplayName: 'Event Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Simple (RSVP) or Regular' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Scheduled start' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Scheduled end' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location text' },
            { Name: 'RegistrationEnabled', DisplayName: 'Registration Enabled', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether registration is open' },
            { Name: 'RegistrationsLimit', DisplayName: 'Registrations Limit', Type: 'integer', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Max registrations' },
        ],
    },
    {
        Name: 'EventRegistrations', DisplayName: 'Event Registrations', SupportsWrite: true,
        Description: 'Per-event registrations tying a Contact to an Event + RegistrationType.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration ID' },
            { Name: 'Event', DisplayName: 'Event', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Linked event reference' },
            { Name: 'Contact', DisplayName: 'Contact', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Linked contact reference' },
            { Name: 'RegistrationTypeId', DisplayName: 'Registration Type ID', Type: 'integer', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Registration type FK' },
            { Name: 'IsCheckedIn', DisplayName: 'Is Checked In', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Check-in flag' },
            { Name: 'RegistrationDate', DisplayName: 'Registration Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'Memo', DisplayName: 'Memo', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal notes' },
        ],
    },
    {
        Name: 'EventRegistrationTypes', DisplayName: 'Event Registration Types', SupportsWrite: true,
        Description: 'Event-specific registration type definitions with pricing and availability.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration type ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'integer', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent event' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Display name' },
            { Name: 'IsEnabled', DisplayName: 'Is Enabled', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Enabled flag' },
            { Name: 'BasePrice', DisplayName: 'Base Price', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Base price' },
            { Name: 'GuestPrice', DisplayName: 'Guest Price', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Per-guest price' },
            { Name: 'AvailableFrom', DisplayName: 'Available From', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start of availability window' },
            { Name: 'AvailableThrough', DisplayName: 'Available Through', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End of availability window' },
        ],
    },
    {
        Name: 'Invoices', DisplayName: 'Invoices', SupportsWrite: true,
        Description: 'Invoices with line items, totals, and paid amounts.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invoice ID' },
            { Name: 'DocumentNumber', DisplayName: 'Document Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'User-visible invoice number' },
            { Name: 'IsPaid', DisplayName: 'Is Paid', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fully paid flag' },
            { Name: 'PaidAmount', DisplayName: 'Paid Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount paid so far' },
            { Name: 'OrderType', DisplayName: 'Order Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Source order type' },
            { Name: 'Memo', DisplayName: 'Memo', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal memo' },
            { Name: 'PublicMemo', DisplayName: 'Public Memo', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Public memo' },
            { Name: 'VoidedDate', DisplayName: 'Voided Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Void timestamp' },
        ],
    },
    {
        Name: 'Payments', DisplayName: 'Payments', SupportsWrite: true,
        Description: 'Payments linked to invoices and contacts.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Payment ID' },
            { Name: 'Value', DisplayName: 'Value', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment amount' },
            { Name: 'DocumentDate', DisplayName: 'Document Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment date' },
            { Name: 'Contact', DisplayName: 'Contact', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Linked contact' },
            { Name: 'Tender', DisplayName: 'Tender', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Linked tender' },
            { Name: 'Comment', DisplayName: 'Comment', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal note' },
            { Name: 'PublicComment', DisplayName: 'Public Comment', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Public note' },
            { Name: 'PaymentType', DisplayName: 'Payment Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment type' },
        ],
    },
    {
        Name: 'Refunds', DisplayName: 'Refunds', SupportsWrite: true,
        Description: 'Refunds issued against payments.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Refund ID' },
            { Name: 'Tender', DisplayName: 'Tender', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tender reference' },
            { Name: 'Comment', DisplayName: 'Comment', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal comment' },
            { Name: 'PublicComment', DisplayName: 'Public Comment', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Public-facing comment' },
            { Name: 'SettledValue', DisplayName: 'Settled Value', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Previously settled amount' },
        ],
    },
    {
        Name: 'Donations', DisplayName: 'Donations', SupportsWrite: true,
        Description: 'Donation transactions with donor, fund, and amount details.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation ID' },
            { Name: 'Value', DisplayName: 'Value', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donation amount' },
            { Name: 'DonationDate', DisplayName: 'Donation Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donation date' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donor first name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donor last name' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donor email' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donor organization' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donation type' },
            { Name: 'Comment', DisplayName: 'Comment', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal note' },
            { Name: 'PublicComment', DisplayName: 'Public Comment', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Public-facing note' },
        ],
    },
    {
        Name: 'Tenders', DisplayName: 'Tenders', SupportsWrite: true,
        Description: 'Tender (payment method) definitions — cash, check, credit card, etc.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tender ID' },
            { Name: 'DisplayPosition', DisplayName: 'Display Position', Type: 'integer', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Display sort order' },
            { Name: 'IsCustom', DisplayName: 'Is Custom', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Admin-created flag' },
        ],
    },
    {
        Name: 'ContactFields', DisplayName: 'Contact Fields', SupportsWrite: true,
        Description: 'Definitions of standard and custom fields available on Contacts. Drives dynamic custom-field discovery.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Field definition ID' },
            { Name: 'SystemCode', DisplayName: 'System Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Stable system code' },
            { Name: 'FieldName', DisplayName: 'Field Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Human-readable field name' },
            { Name: 'FieldType', DisplayName: 'Field Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Data type (Text, Number, Choice, etc.)' },
            { Name: 'MemberOnly', DisplayName: 'Member Only', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether field is member-only' },
        ],
    },
    {
        Name: 'DonationFields', DisplayName: 'Donation Fields', SupportsWrite: true,
        Description: 'Custom field definitions for donations.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Field ID' },
            { Name: 'FieldType', DisplayName: 'Field Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Data type' },
        ],
    },
    {
        Name: 'Bundles', DisplayName: 'Bundles', SupportsWrite: false,
        Description: 'Bundle memberships grouping multiple sub-members under a primary contact.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Bundle ID' },
            { Name: 'Email', DisplayName: 'Administrator Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Bundle admin email' },
            { Name: 'ParticipantsCount', DisplayName: 'Participants Count', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of members' },
            { Name: 'SpacesLeft', DisplayName: 'Spaces Left', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Remaining capacity' },
        ],
    },
    {
        Name: 'SentEmails', DisplayName: 'Sent Emails', SupportsWrite: false,
        Description: 'History of emails sent through Wild Apricot with delivery metrics.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email ID' },
            { Name: 'SentDate', DisplayName: 'Sent Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Send start timestamp' },
            { Name: 'Subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email subject' },
            { Name: 'RecipientCount', DisplayName: 'Recipient Count', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total recipients' },
            { Name: 'SuccessfullySentCount', DisplayName: 'Successfully Sent', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Successfully delivered count' },
            { Name: 'ReadCount', DisplayName: 'Read Count', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Opened count' },
            { Name: 'FailedCount', DisplayName: 'Failed Count', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Failed delivery count' },
        ],
    },
    {
        Name: 'EmailDrafts', DisplayName: 'Email Drafts', SupportsWrite: false,
        Description: 'Draft emails staged for sending, including scheduled-send metadata.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Draft ID' },
            { Name: 'CreatedDate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Created at' },
            { Name: 'LastChangedDate', DisplayName: 'Last Changed', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last edit timestamp' },
            { Name: 'Subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Draft subject' },
            { Name: 'IsScheduled', DisplayName: 'Is Scheduled', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Scheduled-send flag' },
            { Name: 'ScheduledDate', DisplayName: 'Scheduled Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'When draft will send' },
        ],
    },
    {
        Name: 'AuditLogItems', DisplayName: 'Audit Log Items', SupportsWrite: false,
        Description: 'Audit log entries capturing admin + member actions across the tenant.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Audit log ID' },
            { Name: 'Timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event timestamp' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Actor first name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Actor last name' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Actor email' },
            { Name: 'Message', DisplayName: 'Message', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Log message' },
            { Name: 'Severity', DisplayName: 'Severity', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Severity level' },
            { Name: 'OrderType', DisplayName: 'Order Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Origin of audit event' },
        ],
    },
    {
        Name: 'SavedSearches', DisplayName: 'Saved Searches', SupportsWrite: false,
        Description: 'Saved contact searches with computed contact ID lists.',
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Saved search ID' },
            { Name: 'ContactIds', DisplayName: 'Contact IDs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Matching contact IDs' },
        ],
    },
    {
        Name: 'StoreProducts', DisplayName: 'Store Products', SupportsWrite: false,
        Description: 'Storefront product catalog with pricing, stock, and option/variant metadata.',
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'integer', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product ID' },
            { Name: 'title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product title' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'price', DisplayName: 'Price', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Price object (value + currency)' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product status' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product type' },
            { Name: 'stock', DisplayName: 'Stock', Type: 'integer', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Inventory count' },
            { Name: 'trackInventory', DisplayName: 'Track Inventory', Type: 'boolean', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether inventory is tracked' },
            { Name: 'outOfStock', DisplayName: 'Out Of Stock', Type: 'boolean', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Out-of-stock flag' },
        ],
    },
];

/**
 * Maps the API object name to its list path relative to `/accounts/{accountId}`.
 * Keyed lowercase for case-insensitive lookup.
 */
const WA_API_PATHS: Record<string, string> = {
    contacts: 'contacts',
    contactfields: 'contactfields',
    membershiplevels: 'membershiplevels',
    membergroups: 'membergroups',
    events: 'events',
    eventregistrations: 'eventregistrations',
    eventregistrationtypes: 'EventRegistrationTypes',
    invoices: 'invoices',
    payments: 'payments',
    refunds: 'refunds',
    donations: 'donations',
    donationfields: 'donationfields',
    tenders: 'tenders',
    bundles: 'bundles',
    sentemails: 'SentEmails',
    emaildrafts: 'EmailDrafts',
    auditlogitems: 'auditLogItems',
    savedsearches: 'savedsearches',
    storeproducts: 'store/products',
};

/**
 * Maps the API object name to the response envelope key that contains the
 * record array. Null means the response body IS the array (root array).
 */
const WA_RESPONSE_DATA_KEYS: Record<string, string | null> = {
    contacts: 'Contacts',
    contactfields: null,
    membershiplevels: null,
    membergroups: null,
    events: 'Events',
    eventregistrations: null,
    eventregistrationtypes: null,
    invoices: 'Invoices',
    payments: 'Payments',
    refunds: 'Refunds',
    donations: 'Donations',
    donationfields: null,
    tenders: 'Tenders',
    bundles: null,
    sentemails: null,
    emaildrafts: null,
    auditlogitems: 'Items',
    savedsearches: null,
    storeproducts: null,
};

/**
 * Maps the API object name to an incremental-sync configuration.
 * Wild Apricot's filter syntax uses display names with spaces in quotes,
 * e.g. `$filter='Profile last updated' ge '<iso>'` on Contacts.
 */
const WA_WATERMARK_CONFIG: Record<string, { filterField: string; responseField: string }> = {
    contacts: { filterField: 'Profile last updated', responseField: 'ProfileLastUpdated' },
    events:   { filterField: 'LastUpdated',          responseField: 'LastUpdated' },
    invoices: { filterField: 'LastUpdated',          responseField: 'LastUpdated' },
    payments: { filterField: 'LastUpdated',          responseField: 'LastUpdated' },
};

// ─── Connector Implementation ─────────────────────────────────────────

/**
 * Connector for Wild Apricot (part of Personify / Momentive Software).
 *
 * Authenticates via OAuth 2.0 client_credentials (API Key as Basic auth
 * username). Auto-discovers the Account ID from GET /v2/accounts when not
 * supplied. Handles the cursor-by-offset pagination model (`$top`/`$skip`),
 * the async contact query pattern (`$async=true` + poll), custom-field
 * discovery via `/contactfields`, server-side date filtering with the
 * `$filter` OData syntax, and rate-limit-aware retries.
 */
@RegisterClass(BaseIntegrationConnector, 'WildApricotConnector')
export class WildApricotConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context (token + discovered account). Invalidated on token expiry or 401. */
    private authState: WildApricotAuthContext | null = null;

    /** Timestamp of the last outbound request, used for throttling. */
    private lastRequestTime = 0;

    /** Currently-active watermark for FetchChanges, used to inject $filter params. */
    private currentWatermark: string | null = null;

    // ── Capability getters ────────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override get IntegrationName(): string { return 'Wild Apricot'; }

    // ── Action generation ─────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return WILD_APRICOT_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;
        return {
            IntegrationName: 'Wild Apricot',
            CategoryName: 'Wild Apricot',
            IconClass: 'fa-solid fa-apple-whole',
            Objects: objects,
            IncludeSearch: false,
            IncludeList: false,
            CategoryDescription: 'Wild Apricot (Personify) AMS integration actions',
            ParentCategoryName: 'Membership',
        };
    }

    public override GetDefaultConfiguration(): DefaultIntegrationConfig | null {
        return {
            DefaultSchemaName: 'Wild Apricot',
            DefaultObjects: [
                {
                    SourceObjectName: 'Contacts',
                    TargetTableName: 'WildApricot_Contact',
                    TargetEntityName: 'WildApricot Contacts',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Contacts', 'Contacts'),
                },
                {
                    SourceObjectName: 'Events',
                    TargetTableName: 'WildApricot_Event',
                    TargetEntityName: 'WildApricot Events',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Events', 'Events'),
                },
                {
                    SourceObjectName: 'EventRegistrations',
                    TargetTableName: 'WildApricot_EventRegistration',
                    TargetEntityName: 'WildApricot Event Registrations',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
            ],
        };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Contacts':
                return [
                    { SourceFieldName: 'Id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'Email', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'Organization', DestinationFieldName: 'CompanyName' },
                ];
            case 'Events':
                return [
                    { SourceFieldName: 'Id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                    { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
                    { SourceFieldName: 'Location', DestinationFieldName: 'Location' },
                ];
            default:
                return [];
        }
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Verifies connectivity by authenticating (which also discovers the
     * Account ID if needed) and calling `/` on the accounts endpoint to
     * fetch account name/URL for feedback.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as WildApricotAuthContext;
            const url = `${auth.BaseUrl}`;
            const headers = this.BuildHeaders(auth);
            const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (resp.Status < 200 || resp.Status >= 300) {
                return { Success: false, Message: `Wild Apricot TestConnection failed: HTTP ${resp.Status}` };
            }
            const body = resp.Body as WildApricotAccountSummary | null;
            const name = body?.Name ?? 'Unknown account';
            return {
                Success: true,
                Message: `Successfully connected to Wild Apricot account: ${name}`,
                ServerVersion: `Wild Apricot Admin API ${auth.Config.ApiVersion ?? DEFAULT_API_VERSION}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery ────────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return WILD_APRICOT_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: this.supportsIncrementalSync(obj.Name),
            SupportsWrite: obj.SupportsWrite,
        }));
    }

    /**
     * Returns the static fields for the object, merging in any dynamically
     * discovered custom fields for Contacts via GET /contactfields. Custom
     * fields are flagged in their description for downstream consumers.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const base = this.staticFieldsFor(objectName);
        if (objectName.toLowerCase() !== 'contacts') return base;

        try {
            const customFields = await this.discoverContactCustomFields(companyIntegration, contextUser);
            return this.mergeStaticAndCustomFields(base, customFields);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[WildApricot] Custom field discovery for Contacts failed — returning static catalog only: ${message}`);
            return base;
        }
    }

    private staticFieldsFor(objectName: string): ExternalFieldSchema[] {
        const obj = WILD_APRICOT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
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

    /**
     * Fetches Wild Apricot's contact field definitions and returns one
     * ExternalFieldSchema per contact field, marked `IsCustom` in the
     * description so consumers can recognise them.
     */
    private async discoverContactCustomFields(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as WildApricotAuthContext;
        const url = `${auth.BaseUrl}/contactfields`;
        const headers = this.BuildHeaders(auth);
        const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (resp.Status < 200 || resp.Status >= 300) return [];
        const arr = Array.isArray(resp.Body) ? resp.Body as Record<string, unknown>[] : [];
        return arr
            .filter(f => typeof f['SystemCode'] === 'string')
            .map(f => this.toContactFieldSchema(f));
    }

    private toContactFieldSchema(raw: Record<string, unknown>): ExternalFieldSchema {
        const systemCode = String(raw['SystemCode'] ?? '');
        const fieldName = typeof raw['FieldName'] === 'string' ? raw['FieldName'] : systemCode;
        const apiType = typeof raw['Type'] === 'string' ? raw['Type'] : 'String';
        const dataType = WA_CUSTOM_FIELD_TYPE_MAP[apiType] ?? 'nvarchar';
        const isSystem = raw['IsSystem'] === true;
        return {
            Name: systemCode,
            Label: fieldName,
            Description: isSystem
                ? `Wild Apricot standard contact field (${apiType}).`
                : `Wild Apricot CUSTOM contact field (${apiType}). IsCustom=true. Stored inside Contact.FieldValues[] keyed by SystemCode.`,
            DataType: dataType,
            IsRequired: raw['IsRequired'] === true,
            IsUniqueKey: false,
            IsReadOnly: raw['IsSystem'] === true && raw['IsBuiltIn'] === true,
        };
    }

    /**
     * Merges static fields with discovered contact fields. Static fields win
     * on name collision (their metadata is more precise). Non-colliding
     * discovered fields are appended.
     */
    private mergeStaticAndCustomFields(
        staticFields: ExternalFieldSchema[],
        discovered: ExternalFieldSchema[]
    ): ExternalFieldSchema[] {
        const existing = new Set(staticFields.map(f => f.Name.toLowerCase()));
        const extra = discovered.filter(f => !existing.has(f.Name.toLowerCase()));
        return [...staticFields, ...extra];
    }

    // ─── FetchChanges (OData $top/$skip pagination) ──────────────────

    /**
     * Fetches records for the given object using Wild Apricot's OData-style
     * pagination. For Contacts, uses the `$async=true` pattern to dispatch
     * long-running queries and polls the ResultUrl until ready.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as WildApricotAuthContext;
        const objLower = ctx.ObjectName.toLowerCase();
        const path = WA_API_PATHS[objLower];
        if (!path) {
            console.warn(`[WildApricot] No API path mapped for object "${ctx.ObjectName}"`);
            return { Records: [], HasMore: false };
        }

        this.currentWatermark = ctx.WatermarkValue;
        try {
            if (objLower === 'contacts') {
                return await this.fetchContactsAsync(auth, ctx);
            }
            return await this.fetchFlat(auth, ctx, path);
        } finally {
            this.currentWatermark = null;
        }
    }

    /**
     * Executes the standard OData flat fetch: GET {path}?$top={batchSize}&$skip={offset}
     * with optional $filter for incremental sync.
     */
    private async fetchFlat(
        auth: WildApricotAuthContext,
        ctx: FetchContext,
        path: string
    ): Promise<FetchBatchResult> {
        const objLower = ctx.ObjectName.toLowerCase();
        const dataKey = WA_RESPONSE_DATA_KEYS[objLower] ?? null;
        const pageSize = ctx.BatchSize > 0 ? ctx.BatchSize : DEFAULT_PAGE_SIZE;
        const offset = ctx.CurrentOffset ?? 0;

        const url = this.buildListUrl(auth.BaseUrl, path, objLower, pageSize, offset, ctx.WatermarkValue);
        const headers = this.BuildHeaders(auth);
        const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (resp.Status < 200 || resp.Status >= 300) {
            throw new Error(`Wild Apricot GET ${path} returned HTTP ${resp.Status}`);
        }
        const records = this.extractRecords(resp.Body, dataKey);
        const externalRecords = records.map(r => this.toExternalRecord(r, ctx.ObjectName));
        const { hasMore, newWatermark } = this.computePageState(records, pageSize, objLower);

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NextOffset: hasMore ? offset + records.length : undefined,
            NewWatermarkValue: !hasMore && newWatermark ? newWatermark : undefined,
        };
    }

    /**
     * Builds the URL for a flat list request, adding OData pagination and —
     * when a watermark is present for a supported object — a server-side
     * `$filter` with the Wild Apricot display-name-in-quotes syntax.
     */
    private buildListUrl(
        baseUrl: string,
        path: string,
        objLower: string,
        top: number,
        skip: number,
        watermark: string | null
    ): string {
        const params: string[] = [`$top=${top}`, `$skip=${skip}`];
        const wm = WA_WATERMARK_CONFIG[objLower];
        if (wm && watermark) {
            const filter = `'${wm.filterField}' ge '${watermark}'`;
            params.push(`$filter=${encodeURIComponent(filter)}`);
        }
        return `${baseUrl}/${path}?${params.join('&')}`;
    }

    /**
     * Extracts the record array from a Wild Apricot response. When `dataKey`
     * is null the response body itself is expected to be the array.
     */
    private extractRecords(body: unknown, dataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(body)) return body as Record<string, unknown>[];
        if (!dataKey) return [];
        const obj = body as Record<string, unknown> | null;
        if (!obj) return [];
        const arr = obj[dataKey];
        return Array.isArray(arr) ? arr as Record<string, unknown>[] : [];
    }

    /**
     * Computes HasMore and the rolling watermark for a page. Watermark is
     * the max of the configured response field across returned records.
     */
    private computePageState(
        records: Record<string, unknown>[],
        pageSize: number,
        objLower: string
    ): { hasMore: boolean; newWatermark: string | null } {
        const hasMore = records.length >= pageSize;
        const wm = WA_WATERMARK_CONFIG[objLower];
        if (!wm) return { hasMore, newWatermark: null };

        let latest: Date | null = null;
        for (const rec of records) {
            const raw = rec[wm.responseField];
            if (typeof raw !== 'string') continue;
            const parsed = new Date(raw);
            if (isNaN(parsed.getTime())) continue;
            if (!latest || parsed > latest) latest = parsed;
        }
        return { hasMore, newWatermark: latest ? latest.toISOString() : null };
    }

    /**
     * Fetches contacts using Wild Apricot's async query pattern:
     *   GET /contacts?$async=true&$filter=...  → returns ResultUrl
     *   poll ResultUrl until State=Complete
     */
    private async fetchContactsAsync(
        auth: WildApricotAuthContext,
        ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const pageSize = ctx.BatchSize > 0 ? ctx.BatchSize : DEFAULT_PAGE_SIZE;
        const offset = ctx.CurrentOffset ?? 0;
        const params: string[] = ['$async=true', `$top=${pageSize}`, `$skip=${offset}`];
        const wm = WA_WATERMARK_CONFIG['contacts'];
        if (ctx.WatermarkValue && wm) {
            const filter = `'${wm.filterField}' ge '${ctx.WatermarkValue}'`;
            params.push(`$filter=${encodeURIComponent(filter)}`);
        }
        const url = `${auth.BaseUrl}/contacts?${params.join('&')}`;
        const headers = this.BuildHeaders(auth);

        const initial = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (initial.Status < 200 || initial.Status >= 300) {
            throw new Error(`Wild Apricot async contacts initial call returned HTTP ${initial.Status}`);
        }

        const contacts = await this.resolveAsyncContactResult(auth, initial);
        const externalRecords = contacts.map(r => this.toExternalRecord(r, ctx.ObjectName));
        const { hasMore, newWatermark } = this.computePageState(contacts, pageSize, 'contacts');

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NextOffset: hasMore ? offset + contacts.length : undefined,
            NewWatermarkValue: !hasMore && newWatermark ? newWatermark : undefined,
        };
    }

    /**
     * If the initial async contacts response already contains the Contacts
     * array (small queries return synchronously), returns it. Otherwise polls
     * the ResultUrl at the configured interval until Complete or timeout.
     */
    private async resolveAsyncContactResult(
        auth: WildApricotAuthContext,
        initial: RESTResponse
    ): Promise<Record<string, unknown>[]> {
        const body = (initial.Body ?? {}) as WildApricotAsyncResponse & WildApricotContactResults;
        if (Array.isArray(body.Contacts)) {
            return body.Contacts;
        }
        const resultUrl = body.ResultUrl;
        if (typeof resultUrl !== 'string' || resultUrl.length === 0) {
            console.warn('[WildApricot] Async contacts response has no ResultUrl and no inline Contacts — returning empty');
            return [];
        }
        return this.pollAsyncContactsResultUrl(auth, resultUrl);
    }

    /** Polls the Wild Apricot async ResultUrl until it returns a Contacts array. */
    private async pollAsyncContactsResultUrl(
        auth: WildApricotAuthContext,
        resultUrl: string
    ): Promise<Record<string, unknown>[]> {
        const interval = auth.Config.AsyncPollIntervalMs ?? DEFAULT_ASYNC_POLL_INTERVAL_MS;
        const timeout = auth.Config.AsyncPollTimeoutMs ?? DEFAULT_ASYNC_POLL_TIMEOUT_MS;
        const deadline = Date.now() + timeout;
        const headers = this.BuildHeaders(auth);

        while (Date.now() < deadline) {
            await this.sleep(interval);
            const resp = await this.MakeHTTPRequest(auth, resultUrl, 'GET', headers);
            if (resp.Status === 202) continue; // still processing
            if (resp.Status < 200 || resp.Status >= 300) {
                throw new Error(`Wild Apricot async ResultUrl poll returned HTTP ${resp.Status}`);
            }
            const body = (resp.Body ?? {}) as WildApricotContactResults;
            if (Array.isArray(body.Contacts)) return body.Contacts;
        }
        throw new Error(`Wild Apricot async contacts query timed out after ${timeout}ms`);
    }

    private toExternalRecord(raw: Record<string, unknown>, objectType: string): ExternalRecord {
        const idRaw = raw['Id'] ?? raw['id'] ?? raw['ID'];
        const externalID = idRaw != null ? String(idRaw) : '';
        return { ExternalID: externalID, ObjectType: objectType, Fields: raw };
    }

    private supportsIncrementalSync(objectName: string): boolean {
        return WA_WATERMARK_CONFIG[objectName.toLowerCase()] != null;
    }

    // ─── CRUD ─────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        return this.executeMutation(companyIntegration, contextUser, ctx.ObjectName, 'POST', null, ctx.Attributes, 'CreateRecord');
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        return this.executeMutation(companyIntegration, contextUser, ctx.ObjectName, 'PUT', ctx.ExternalID, ctx.Attributes, 'UpdateRecord');
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        return this.executeMutation(companyIntegration, contextUser, ctx.ObjectName, 'DELETE', ctx.ExternalID, undefined, 'DeleteRecord');
    }

    /**
     * Shared CRUD implementation: routes POST/PUT/DELETE to the object's list
     * path with an optional trailing `/{id}`. Returns a uniform CRUDResult.
     */
    private async executeMutation(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        objectName: string,
        method: 'POST' | 'PUT' | 'DELETE',
        externalID: string | null,
        attributes: Record<string, unknown> | undefined,
        operation: string
    ): Promise<CRUDResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as WildApricotAuthContext;
            const objLower = objectName.toLowerCase();
            const path = WA_API_PATHS[objLower];
            if (!path) {
                return { Success: false, ErrorMessage: `WildApricot ${operation} not supported for "${objectName}"`, StatusCode: 400 };
            }
            const url = externalID != null
                ? `${auth.BaseUrl}/${path}/${encodeURIComponent(externalID)}`
                : `${auth.BaseUrl}/${path}`;
            const headers = this.BuildHeaders(auth);
            const resp = await this.MakeHTTPRequest(auth, url, method, headers, attributes);
            if (resp.Status < 200 || resp.Status >= 300) {
                return this.buildCRUDError(resp, operation, objectName);
            }
            const body = (resp.Body ?? {}) as Record<string, unknown>;
            const newIdRaw = body['Id'] ?? body['id'] ?? externalID;
            return {
                Success: true,
                ExternalID: newIdRaw != null ? String(newIdRaw) : undefined,
                StatusCode: resp.Status,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, ErrorMessage: `WildApricot ${operation} failed: ${message}`, StatusCode: 500 };
        }
    }

    private buildCRUDError(resp: RESTResponse, op: string, objectName: string): CRUDResult {
        const body = resp.Body as Record<string, unknown> | undefined;
        const rawMessage = typeof body?.['Message'] === 'string'
            ? (body['Message'] as string)
            : typeof body?.['message'] === 'string'
                ? (body['message'] as string)
                : undefined;
        return {
            Success: false,
            ErrorMessage: rawMessage ?? `WildApricot ${op} on ${objectName} failed (HTTP ${resp.Status})`,
            StatusCode: resp.Status,
        };
    }

    // ─── Abstract REST hooks (BaseRESTIntegrationConnector) ───────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authState && this.isTokenValid(this.authState)) {
            return this.authState;
        }
        const config = await this.parseConfig(companyIntegration, contextUser);
        const token = await this.obtainAccessToken(config);
        const accountId = config.AccountId ?? await this.resolveAccountId(token.access_token);
        const apiVersion = config.ApiVersion ?? DEFAULT_API_VERSION;
        const state: WildApricotAuthContext = {
            Token: token.access_token,
            ExpiresAt: new Date(Date.now() + (token.expires_in * 1000)),
            AccountId: accountId,
            BaseUrl: `${WA_API_HOST}/${apiVersion}/accounts/${accountId}`,
            Config: config,
        };
        this.authState = state;
        return state;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const waAuth = auth as WildApricotAuthContext;
        return {
            'Authorization': `Bearer ${waAuth.Token}`,
            'Accept': 'application/json',
        };
    }

    /**
     * Not used by FetchChanges (which implements its own pagination), but
     * retained for compatibility with any callers that route through the
     * base pipeline.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        return this.extractRecords(rawBody, responseDataKey);
    }

    protected ExtractPaginationInfo(
        _rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        // Wild Apricot uses skip-based pagination; we advance the base engine's offset by pageSize.
        return { HasMore: false, NextOffset: currentOffset + pageSize };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as WildApricotAuthContext).BaseUrl;
    }

    // ─── Token lifecycle ──────────────────────────────────────────────

    private isTokenValid(state: WildApricotAuthContext): boolean {
        return state.ExpiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS;
    }

    /**
     * Exchanges the admin API Key for a bearer token via OAuth 2.0
     * client_credentials grant. Per the Wild Apricot docs, `scope=auto` is
     * required — without it the token has near-empty permissions.
     */
    private async obtainAccessToken(config: WildApricotConnectionConfig): Promise<WildApricotTokenResponse> {
        const basic = Buffer.from(`APIKEY:${config.ApiKey}`).toString('base64');
        const resp = await fetch(WA_OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basic}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: 'grant_type=client_credentials&scope=auto',
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Wild Apricot OAuth token request failed (HTTP ${resp.status}): ${text.slice(0, 500)}`);
        }
        const payload = await resp.json() as WildApricotTokenResponse;
        if (!payload.access_token || typeof payload.access_token !== 'string') {
            throw new Error('Wild Apricot OAuth token response missing access_token');
        }
        return payload;
    }

    /**
     * Auto-discovers the account ID by calling GET /v2/accounts with the
     * freshly obtained token. Selects the first account the API Key has
     * access to. Most Wild Apricot keys are scoped to a single tenant.
     */
    private async resolveAccountId(accessToken: string): Promise<string> {
        const url = `${WA_API_HOST}/v2/accounts`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
            },
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Wild Apricot /v2/accounts failed (HTTP ${resp.status}): ${text.slice(0, 500)}`);
        }
        const body = await resp.json() as WildApricotAccountSummary[] | WildApricotAccountSummary;
        const accounts = Array.isArray(body) ? body : [body];
        const first = accounts.find(a => typeof a?.Id === 'number');
        if (!first) {
            throw new Error('Wild Apricot /v2/accounts returned no accounts for this API Key');
        }
        return String(first.Id);
    }

    // ─── HTTP transport with retry + throttling ───────────────────────

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const waAuth = auth as WildApricotAuthContext;
        const cfg = waAuth.Config;
        const maxRetries = cfg.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = cfg.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = cfg.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
        let currentHeaders = headers;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.throttle(minInterval);
            try {
                const resp = await this.doFetch(url, method, currentHeaders, body, timeoutMs);
                this.lastRequestTime = Date.now();

                if (resp.Status === 401 && attempt < maxRetries) {
                    // Token expired or revoked — drop cache and refresh against the same
                    // credentials we already hold, then retry with the new bearer header.
                    this.authState = null;
                    const refreshedToken = await this.obtainAccessToken(cfg);
                    const accountId = cfg.AccountId ?? await this.resolveAccountId(refreshedToken.access_token);
                    const apiVersion = cfg.ApiVersion ?? DEFAULT_API_VERSION;
                    const refreshedState: WildApricotAuthContext = {
                        Token: refreshedToken.access_token,
                        ExpiresAt: new Date(Date.now() + (refreshedToken.expires_in * 1000)),
                        AccountId: accountId,
                        BaseUrl: `${WA_API_HOST}/${apiVersion}/accounts/${accountId}`,
                        Config: cfg,
                    };
                    this.authState = refreshedState;
                    currentHeaders = this.BuildHeaders(refreshedState);
                    continue;
                }
                if (resp.Status === 429 || resp.Status === 503) {
                    if (attempt === maxRetries) return resp;
                    await this.sleep(this.backoffFromResponse(resp, attempt));
                    continue;
                }
                return resp;
            } catch (err: unknown) {
                if (attempt === maxRetries) throw err;
                if (!this.isRetryableError(err)) throw err;
                await this.sleep(this.backoffMs(attempt));
            }
        }
        throw new Error(`Wild Apricot request to ${url} exhausted ${maxRetries + 1} attempts`);
    }

    /** Single fetch() with AbortController-backed timeout. */
    private async doFetch(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<RESTResponse> {
        const controller = new AbortController();
        const handle = setTimeout(() => controller.abort(), timeoutMs);
        const finalHeaders: Record<string, string> = { ...headers };
        if (body !== undefined && !finalHeaders['Content-Type']) {
            finalHeaders['Content-Type'] = 'application/json';
        }
        try {
            const resp = await fetch(url, {
                method,
                headers: finalHeaders,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            const respHeaders: Record<string, string> = {};
            resp.headers.forEach((value, key) => { respHeaders[key.toLowerCase()] = value; });
            const text = await resp.text();
            const parsed = text.length > 0 ? this.safeParseJSON(text) : null;
            return { Status: resp.status, Body: parsed, Headers: respHeaders };
        } finally {
            clearTimeout(handle);
        }
    }

    private safeParseJSON(text: string): unknown {
        try { return JSON.parse(text) as unknown; } catch { return text; }
    }

    private isRetryableError(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        return /abort|timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(msg);
    }

    private backoffMs(attempt: number): number {
        const base = Math.min(1000 * Math.pow(2, attempt), 20000);
        const jitter = Math.floor(Math.random() * 500);
        return base + jitter;
    }

    /**
     * Derives a back-off duration from a 429/503 response, honoring a
     * Retry-After header when present (both delta-seconds and HTTP-date
     * forms are supported).
     */
    private backoffFromResponse(resp: RESTResponse, attempt: number): number {
        const retryAfter = resp.Headers['retry-after'];
        if (typeof retryAfter === 'string' && retryAfter.length > 0) {
            const asSeconds = Number(retryAfter);
            if (!isNaN(asSeconds) && asSeconds >= 0) {
                return Math.min(asSeconds * 1000, 30000);
            }
            const asDate = Date.parse(retryAfter);
            if (!isNaN(asDate)) {
                const delta = asDate - Date.now();
                if (delta > 0) return Math.min(delta, 30000);
            }
        }
        return this.backoffMs(attempt);
    }

    private async throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.sleep(minIntervalMs - elapsed);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Config parsing ───────────────────────────────────────────────

    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<WildApricotConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.loadFromCredential(credentialID, contextUser);
            if (fromCred) return fromCred;
        }
        const raw = companyIntegration.Configuration;
        if (!raw) {
            throw new Error('WildApricotConnector: No credential or Configuration JSON found on CompanyIntegration');
        }
        const parsed = JSON.parse(raw) as Partial<WildApricotConnectionConfig>;
        return this.validateConfig(parsed);
    }

    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo
    ): Promise<WildApricotConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        try {
            const raw = JSON.parse(credential.Values) as Record<string, unknown>;
            // Accept both PascalCase (WildApricot-specific) and the standard
            // 'API Key' schema field name 'apiKey' (lowercase). AccountId is
            // optional — auto-discovered via GET /v2/accounts when omitted.
            const get = (...keys: string[]): string | undefined => {
                for (const k of keys) {
                    const hit = Object.entries(raw).find(([key]) => key.toLowerCase() === k.toLowerCase());
                    if (hit && typeof hit[1] === 'string') return hit[1] as string;
                }
                return undefined;
            };
            const apiKey = get('ApiKey', 'apiKey', 'api_key');
            const accountId = get('AccountId', 'accountId', 'account_id');
            if (!apiKey) return null;
            const parsed: Partial<WildApricotConnectionConfig> = {
                ApiKey: apiKey,
                AccountId: accountId,
            };
            return this.validateConfig(parsed);
        } catch {
            return null;
        }
    }

    private validateConfig(raw: Partial<WildApricotConnectionConfig>): WildApricotConnectionConfig {
        if (!raw.ApiKey || typeof raw.ApiKey !== 'string') {
            throw new Error('WildApricotConnector: ApiKey is required');
        }
        return {
            ApiKey: raw.ApiKey,
            AccountId: raw.AccountId,
            ApiVersion: raw.ApiVersion ?? DEFAULT_API_VERSION,
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
            AsyncPollIntervalMs: raw.AsyncPollIntervalMs ?? DEFAULT_ASYNC_POLL_INTERVAL_MS,
            AsyncPollTimeoutMs: raw.AsyncPollTimeoutMs ?? DEFAULT_ASYNC_POLL_TIMEOUT_MS,
        };
    }
}

/** Tree-shaking prevention function — import and call from module entry point. */
export function LoadWildApricotConnector(): void { /* no-op */ }
