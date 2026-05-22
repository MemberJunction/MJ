/**
 * BlackbaudConnector — Integration connector for Blackbaud Raiser's Edge NXT (SKY API).
 *
 * API Documentation: https://developer.blackbaud.com/skyapi/
 *
 * Auth: OAuth 2.0 (access_token + refresh_token) PLUS subscription key header.
 *       - Authorization: Bearer {access_token}
 *       - bb-api-subscription-key: {subscription_key}
 *       Refresh via https://oauth2.sky.blackbaud.com/token
 * Base URL: https://api.sky.blackbaud.com/
 * Pagination: Offset-based via next_link in response
 * Rate limits: 10 calls/second hard limit — enforced with 120ms minimum interval
 * Incremental: Date filter params on list endpoints
 * CRUD: Full on Constituents, Gifts, Pledges, Notes, Relationships
 *
 * API Categories:
 *   - Constituent API (implemented) — constituents, addresses, phones, emails, relationships, notes
 *   - Gift API (implemented) — gifts, pledges, gift splits, soft credits
 *   - Fundraising API (implemented) — fundraisers, campaigns, appeals, funds
 *   - Opportunity API (implemented, read-only) — prospect opportunities
 *   - Event API (NOT implemented) — separate Sky Signup product, not RE NXT
 *   - Education API (NOT implemented) — Higher Education product, separate license
 *   - Merchant Services API (NOT implemented) — payment terminal APIs, hardware-specific
 *   - Church Management (NOT implemented) — separate product (Church Management)
 *   - Webhooks (available) — Constituent, Gift, Payment, Custom Field events; not implemented as receiver
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
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

// ─── Types ────────────────────────────────────────────────────────────────

export interface BlackbaudConnectionConfig {
    ClientID: string;
    ClientSecret: string;
    SubscriptionKey: string;
    AccessToken: string;
    RefreshToken: string;
}

interface BBAuthContext extends RESTAuthContext {
    Config: BlackbaudConnectionConfig;
    SubscriptionKey: string;
}

interface CachedToken {
    AccessToken: string;
    RefreshToken: string;
    ExpiresAt: number;
}

interface BBPagedResponse {
    count: number;
    value: Record<string, unknown>[];
    next_link?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

const BB_TOKEN_URL = 'https://oauth2.sky.blackbaud.com/token';
const BB_API_BASE = 'https://api.sky.blackbaud.com';
const BB_PAGE_SIZE = 500;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
// 10 calls/second = 100ms minimum. Use 120ms to stay comfortably under.
const MIN_REQUEST_INTERVAL_MS = 120;

// ─── Static Object Definitions ────────────────────────────────────────────

const BB_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Constituents',
        DisplayName: 'Constituent',
        Description: 'Individual donors, prospects, volunteers, and organizational constituents',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Constituent GUID' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Individual or Organization' },
            { Name: 'lookup_id', DisplayName: 'Lookup ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'External lookup ID' },
            { Name: 'first', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First name (individuals)' },
            { Name: 'last', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last name (individuals)' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Full name or organization name' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address object' },
            { Name: 'phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone object' },
            { Name: 'address', DisplayName: 'Address', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary address object' },
            { Name: 'gender', DisplayName: 'Gender', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Gender (individuals)' },
            { Name: 'birthdate', DisplayName: 'Birthdate', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date of birth (individuals)' },
            { Name: 'deceased', DisplayName: 'Deceased', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether constituent is deceased' },
            { Name: 'inactive', DisplayName: 'Inactive', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether constituent is inactive' },
            { Name: 'date_added', DisplayName: 'Date Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Record creation date' },
            { Name: 'date_modified', DisplayName: 'Date Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
        ],
    },
    {
        Name: 'ConstituentAddresses',
        DisplayName: 'Constituent Address',
        Description: 'Addresses for constituents (parent-child under Constituents)',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Address GUID' },
            { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent constituent GUID' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address type (Home, Business, etc.)' },
            { Name: 'address_lines', DisplayName: 'Street', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street address lines' },
            { Name: 'city', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'state', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State/province' },
            { Name: 'postal_code', DisplayName: 'Postal Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'ZIP/postal code' },
            { Name: 'country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'preferred', DisplayName: 'Preferred', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether this is the preferred address' },
        ],
    },
    {
        Name: 'ConstituentPhones',
        DisplayName: 'Constituent Phone',
        Description: 'Phone numbers for constituents (parent-child under Constituents)',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Phone GUID' },
            { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent constituent GUID' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Phone type (Home, Business, Mobile, etc.)' },
            { Name: 'number', DisplayName: 'Number', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Phone number' },
            { Name: 'primary', DisplayName: 'Primary', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether this is the primary phone' },
        ],
    },
    {
        Name: 'ConstituentEmails',
        DisplayName: 'Constituent Email',
        Description: 'Email addresses for constituents (parent-child under Constituents)',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email GUID' },
            { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent constituent GUID' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email type (Personal, Business, etc.)' },
            { Name: 'address', DisplayName: 'Address', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email address value' },
            { Name: 'primary', DisplayName: 'Primary', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether this is the primary email' },
        ],
    },
    {
        Name: 'Gifts',
        DisplayName: 'Gift',
        Description: 'Donation and gift records linked to constituents',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Gift GUID' },
            { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Donor constituent GUID' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Gift type (Donation, RecurringGift, GiftInKind, etc.)' },
            { Name: 'amount', DisplayName: 'Amount', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Gift amount object { value, currency }' },
            { Name: 'date', DisplayName: 'Gift Date', Type: 'datetime', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Gift date' },
            { Name: 'fund', DisplayName: 'Fund', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Fund designation' },
            { Name: 'campaign', DisplayName: 'Campaign', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign designation' },
            { Name: 'appeal', DisplayName: 'Appeal', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Appeal designation' },
            { Name: 'acknowledgement', DisplayName: 'Acknowledgement', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Acknowledgement status' },
            { Name: 'date_added', DisplayName: 'Date Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Record creation date' },
            { Name: 'date_modified', DisplayName: 'Date Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
        ],
    },
    {
        Name: 'Fundraisers',
        DisplayName: 'Fundraiser',
        Description: 'Fundraising campaigns and appeals',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Fundraiser GUID' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fundraiser name/description' },
            { Name: 'start_date', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fundraiser start date' },
            { Name: 'end_date', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fundraiser end date' },
            { Name: 'goal', DisplayName: 'Goal', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fundraising goal amount' },
        ],
    },
    {
        Name: 'Campaigns',
        DisplayName: 'Campaign',
        Description: 'Fundraising campaigns',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign GUID' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign name/description' },
            { Name: 'start_date', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign start date' },
            { Name: 'end_date', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign end date' },
            { Name: 'goal', DisplayName: 'Goal', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign goal' },
        ],
    },
    {
        Name: 'Opportunities',
        DisplayName: 'Opportunity',
        Description: 'Major gift prospect opportunities (read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Opportunity GUID' },
            { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Prospect constituent GUID' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Opportunity name' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Opportunity status' },
            { Name: 'ask_date', DisplayName: 'Ask Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date of ask' },
            { Name: 'ask_amount', DisplayName: 'Ask Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount asked' },
            { Name: 'expected_date', DisplayName: 'Expected Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Expected close date' },
        ],
    },
    // ─── Additional SKY API endpoints — lean overlay ──
    // Constituent sub-resources
    { Name: 'ConstituentRelationships', DisplayName: 'Relationship', Description: 'Constituent relationships', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Relationship ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentNotes', DisplayName: 'Note', Description: 'Constituent notes', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Note ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
        { Name: 'date_added', DisplayName: 'Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'ConstituentActions', DisplayName: 'Action', Description: 'Constituent actions/activities', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Action ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
        { Name: 'date', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'ConstituentCustomFields', DisplayName: 'Custom Field', Description: 'Constituent custom field values', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom field ID' },
        { Name: 'parent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentCodes', DisplayName: 'Constituent Code', Description: 'Constituent classification codes', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Code ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentEducation', DisplayName: 'Education', Description: 'Constituent education records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Education ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentOnlinePresence', DisplayName: 'Online Presence', Description: 'Social media/web profiles', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Presence ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentMemberships', DisplayName: 'Membership', Description: 'Constituent memberships', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    // Gift sub-resources
    { Name: 'GiftCustomFields', DisplayName: 'Gift Custom Field', Description: 'Custom field values on gifts', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom field ID' },
        { Name: 'parent_id', DisplayName: 'Gift ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Gifts' },
    ]},
    { Name: 'GiftSoftCredits', DisplayName: 'Soft Credit', Description: 'Soft credit allocations on gifts', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Soft credit ID' },
        { Name: 'gift_id', DisplayName: 'Gift ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Gifts' },
    ]},
    // Pledges & Recurring Gifts
    { Name: 'Pledges', DisplayName: 'Pledge', Description: 'Pledge commitments', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Pledge ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
        { Name: 'date_added', DisplayName: 'Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'RecurringGifts', DisplayName: 'Recurring Gift', Description: 'Recurring gift/donation schedules', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Recurring gift ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    // Funds & Appeals
    { Name: 'Funds', DisplayName: 'Fund', Description: 'Fund designations', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Fund ID' },
        { Name: 'date_added', DisplayName: 'Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Appeals', DisplayName: 'Appeal', Description: 'Fundraising appeals', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Appeal ID' },
        { Name: 'date_added', DisplayName: 'Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Events
    { Name: 'Events', DisplayName: 'Event', Description: 'Fundraising/special events', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event ID' },
        { Name: 'start_date', DisplayName: 'Start', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'EventParticipants', DisplayName: 'Event Participant', Description: 'Event attendees/registrants', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Participant ID' },
        { Name: 'event_id', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    // Lists
    { Name: 'Lists', DisplayName: 'List', Description: 'Constituent lists', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'List ID' },
        { Name: 'date_modified', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Tributes
    { Name: 'Tributes', DisplayName: 'Tribute', Description: 'Gift tribute/memorial records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tribute ID' },
    ]},
    // GL
    { Name: 'GLAccounts', DisplayName: 'GL Account', Description: 'General ledger accounts', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'GL Account ID' },
    ]},
    { Name: 'GLTransactionDistributions', DisplayName: 'GL Distribution', Description: 'GL transaction distributions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Distribution ID' },
        { Name: 'post_date', DisplayName: 'Post Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Lookup types (read-only)
    { Name: 'MembershipTypes', DisplayName: 'Membership Type', Description: 'Membership type definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'GiftTypes', DisplayName: 'Gift Type', Description: 'Gift type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'ActionTypes', DisplayName: 'Action Type', Description: 'Action type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'NoteTypes', DisplayName: 'Note Type', Description: 'Note type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'FundTypes', DisplayName: 'Fund Type', Description: 'Fund type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    // ─── Remaining Blackbaud sub-resources ──
    { Name: 'ConstituentAliases', DisplayName: 'Alias', Description: 'Constituent name aliases', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Alias ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentSolicitCodes', DisplayName: 'Solicit Code', Description: 'Solicitation codes', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Code ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentRatings', DisplayName: 'Rating', Description: 'Constituent prospect ratings', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Rating ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentAttachments', DisplayName: 'Constituent Attachment', Description: 'File attachments on constituents', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Attachment ID' },
        { Name: 'parent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentConsent', DisplayName: 'GDPR Consent', Description: 'GDPR consent records', SupportsWrite: true, Fields: [
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Constituents' },
    ]},
    { Name: 'ConstituentFundraiserAssignments', DisplayName: 'Fundraiser Assignment', Description: 'Fundraiser-to-constituent assignments', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Assignment ID' },
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Constituents' },
    ]},
    // Action sub-resources
    { Name: 'ConstituentActionCustomFields', DisplayName: 'Action Custom Field', Description: 'Custom fields on actions', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom field ID' },
        { Name: 'parent_id', DisplayName: 'Action ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → ConstituentActions' },
    ]},
    { Name: 'ConstituentActionAttachments', DisplayName: 'Action Attachment', Description: 'File attachments on actions', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Attachment ID' },
        { Name: 'parent_id', DisplayName: 'Action ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → ConstituentActions' },
    ]},
    // Gift sub-resources
    { Name: 'GiftAttachments', DisplayName: 'Gift Attachment', Description: 'File attachments on gifts', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Attachment ID' },
        { Name: 'parent_id', DisplayName: 'Gift ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Gifts' },
    ]},
    // Fund/Appeal sub-resources
    { Name: 'FundCustomFields', DisplayName: 'Fund Custom Field', Description: 'Custom fields on funds', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom field ID' },
        { Name: 'parent_id', DisplayName: 'Fund ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Funds' },
    ]},
    { Name: 'AppealCustomFields', DisplayName: 'Appeal Custom Field', Description: 'Custom fields on appeals', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom field ID' },
        { Name: 'parent_id', DisplayName: 'Appeal ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Appeals' },
    ]},
    // RecurringGiftSchedules REMOVED — schedules are a sub-object property of recurring gifts, not a separate endpoint (verified)
    // Event sub-resources
    { Name: 'EventCategories', DisplayName: 'Event Category', Description: 'Event category definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category ID' },
    ]},
    { Name: 'EventFees', DisplayName: 'Event Fee', Description: 'Fee types on events', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Fee ID' },
        { Name: 'event_id', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'EventAttachments', DisplayName: 'Event Attachment', Description: 'File attachments on events', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Attachment ID' },
        { Name: 'parent_id', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'EventParticipantFees', DisplayName: 'Participant Fee', Description: 'Fees paid by event participants', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Participant fee ID' },
        { Name: 'participant_id', DisplayName: 'Participant ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EventParticipants' },
    ]},
    // Opportunity sub-resources
    { Name: 'OpportunityCustomFields', DisplayName: 'Opportunity Custom Field', Description: 'Custom fields on opportunities', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom field ID' },
        { Name: 'parent_id', DisplayName: 'Opportunity ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Opportunities' },
    ]},
    { Name: 'OpportunityFundraisers', DisplayName: 'Opportunity Fundraiser', Description: 'Fundraisers assigned to opportunities', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Assignment ID' },
        { Name: 'opportunity_id', DisplayName: 'Opportunity ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Opportunities' },
    ]},
    // Lists sub-resource
    { Name: 'ListConstituents', DisplayName: 'List Member', Description: 'Constituents in a list', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Constituent ID in list' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    // Tribute sub-resources
    { Name: 'TributeTypes', DisplayName: 'Tribute Type', Description: 'Tribute type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'TributeAcknowledgees', DisplayName: 'Tribute Acknowledgee', Description: 'Acknowledgee records on tributes', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Acknowledgee ID' },
        { Name: 'tribute_id', DisplayName: 'Tribute ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Tributes' },
    ]},
    // GL sub-resources
    { Name: 'GLProjects', DisplayName: 'GL Project', Description: 'General ledger projects', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Project ID' },
    ]},
    { Name: 'GLJournalEntries', DisplayName: 'GL Journal Entry', Description: 'GL journal entries', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'JE ID' },
        { Name: 'post_date', DisplayName: 'Post Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'GLFiscalYears', DisplayName: 'Fiscal Year', Description: 'Fiscal year definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'FY ID' },
    ]},
    // Communication preferences
    { Name: 'CommunicationPreferences', DisplayName: 'Comm Preference', Description: 'Communication preferences per constituent', SupportsWrite: true, Fields: [
        { Name: 'constituent_id', DisplayName: 'Constituent ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Constituents' },
    ]},
    // ConsentChannels REMOVED — not a standalone endpoint, embedded in communication preferences model (verified)
    // Remaining lookups
    { Name: 'ConstituentCodeTypes', DisplayName: 'Code Type', Description: 'Constituent code type definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'CustomFieldCategories', DisplayName: 'CF Category', Description: 'Custom field category definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category ID' },
    ]},
    { Name: 'SuffixCodes', DisplayName: 'Suffix Code', Description: 'Name suffix lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Code ID' },
    ]},
    { Name: 'TitleCodes', DisplayName: 'Title Code', Description: 'Name title/prefix lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Code ID' },
    ]},
    { Name: 'GiftSubtypes', DisplayName: 'Gift Subtype', Description: 'Gift subtype lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Subtype ID' },
    ]},
    { Name: 'OpportunityTypes', DisplayName: 'Opportunity Type', Description: 'Opportunity type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'ActionStatusTypes', DisplayName: 'Action Status', Description: 'Action status type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Status ID' },
    ]},
    { Name: 'EventFeeTypes', DisplayName: 'Event Fee Type', Description: 'Event fee type lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
    ]},
    { Name: 'MembershipStanding', DisplayName: 'Membership Standing', Description: 'Membership standing lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Standing ID' },
    ]},
    { Name: 'MembershipDues', DisplayName: 'Membership Dues', Description: 'Dues records per membership', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Dues ID' },
    ]},
    // Remaining sub-resources from audit
    { Name: 'PledgeCustomFields', DisplayName: 'Pledge Custom Field', Description: 'Custom fields on pledges', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'CF ID' },
        { Name: 'parent_id', DisplayName: 'Pledge ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Pledges' },
    ]},
    { Name: 'OpportunityAttachments', DisplayName: 'Opportunity Attachment', Description: 'File attachments on opportunities', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Attachment ID' },
        { Name: 'parent_id', DisplayName: 'Opportunity ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Opportunities' },
    ]},
    { Name: 'OpportunityStatus', DisplayName: 'Opportunity Status', Description: 'Opportunity status lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Status ID' },
    ]},
    // ConsentCategories REMOVED — not a standalone endpoint, embedded in communication preferences model (verified)
    { Name: 'EventParticipantDonations', DisplayName: 'Participant Donation', Description: 'Donations from event participants', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation ID' },
        { Name: 'participant_id', DisplayName: 'Participant ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EventParticipants' },
    ]},
];

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'BlackbaudConnector')
export class BlackbaudConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Blackbaud'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return BB_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-hand-holding-heart';
        config.CategoryDescription = 'Blackbaud Raiser\'s Edge NXT for constituents, gifts, campaigns, and fundraising';
        config.ParentCategoryName = 'Nonprofit/Fundraising';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ─────────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return BB_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: ['Constituents', 'Gifts'].includes(obj.Name),
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const apiPath = objectName.replace(/([a-z])([A-Z])/g, '$1/$2').toLowerCase();
            const response = await this.MakeHTTPRequest(auth, `${BB_API_BASE}/constituent/v1/${apiPath}?limit=1`, 'GET', headers);
            if (response.Status === 200) {
                const records = this.NormalizeResponse(response.Body, null);
                if (records.length > 0) return this.InferFieldsWithOverlay(records[0], objectName, BB_OBJECTS);
            }
        } catch { /* fall through */ }
        const staticObj = BB_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!staticObj) return [];
        return staticObj.Fields.map(f => ({ Name: f.Name, Label: f.DisplayName, Description: f.Description, DataType: f.Type, IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly }));
    }

    private InferFieldsWithOverlay(sample: Record<string, unknown>, objectName: string, allObjects: IntegrationObjectInfo[]): ExternalFieldSchema[] {
        const staticObj = allObjects.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));
        const fields: ExternalFieldSchema[] = [];
        for (const [key, value] of Object.entries(sample)) {
            if (key === 'links' || key === '_links') continue;
            const sf = staticMap.get(key.toLowerCase());
            fields.push({ Name: key, Label: sf?.DisplayName ?? key, Description: sf?.Description ?? '',
                DataType: sf?.Type ?? this.InferTypeVal(value), IsRequired: sf?.IsRequired ?? false, IsUniqueKey: sf?.IsPrimaryKey ?? false, IsReadOnly: sf?.IsReadOnly ?? false });
        }
        return fields;
    }
    private InferTypeVal(v: unknown): string {
        if (v === null || v === undefined) return 'string';
        if (typeof v === 'number') return Number.isInteger(v) ? 'number' : 'decimal';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return 'datetime';
        return 'string';
    }

    // ─── Auth ──────────────────────────────────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);

        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return {
                Token: this.tokenCache.AccessToken,
                TokenType: 'Bearer',
                Config: config,
                SubscriptionKey: config.SubscriptionKey,
            } as BBAuthContext;
        }

        const refreshToken = this.tokenCache?.RefreshToken ?? config.RefreshToken;
        if (refreshToken) {
            try {
                const refreshed = await this.RefreshToken(config, refreshToken);
                this.tokenCache = refreshed;
                return {
                    Token: refreshed.AccessToken,
                    TokenType: 'Bearer',
                    Config: config,
                    SubscriptionKey: config.SubscriptionKey,
                } as BBAuthContext;
            } catch {
                // Fall through to use stored access token
            }
        }

        this.tokenCache = {
            AccessToken: config.AccessToken,
            RefreshToken: config.RefreshToken,
            ExpiresAt: Date.now() + (3600 * 1000),
        };
        return {
            Token: config.AccessToken,
            TokenType: 'Bearer',
            Config: config,
            SubscriptionKey: config.SubscriptionKey,
        } as BBAuthContext;
    }

    private async RefreshToken(
        config: BlackbaudConnectionConfig, refreshToken: string
    ): Promise<CachedToken> {
        const basicAuth = Buffer.from(`${config.ClientID}:${config.ClientSecret}`).toString('base64');
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });

        const response = await fetch(BB_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`Blackbaud token refresh failed: ${response.status}`);
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
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo, provider?: IMetadataProvider
    ): Promise<BlackbaudConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const md = provider ?? new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['ClientID'] && parsed['SubscriptionKey']) {
                    return {
                        ClientID: parsed['ClientID'],
                        ClientSecret: parsed['ClientSecret'] ?? '',
                        SubscriptionKey: parsed['SubscriptionKey'],
                        AccessToken: parsed['AccessToken'] ?? '',
                        RefreshToken: parsed['RefreshToken'] ?? '',
                    };
                }
            }
        }
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return {
                ClientID: parsed['ClientID'] ?? '',
                ClientSecret: parsed['ClientSecret'] ?? '',
                SubscriptionKey: parsed['SubscriptionKey'] ?? '',
                AccessToken: parsed['AccessToken'] ?? '',
                RefreshToken: parsed['RefreshToken'] ?? '',
            };
        }
        throw new Error(
            'No Blackbaud credentials found. Set ClientID, ClientSecret, SubscriptionKey, AccessToken, RefreshToken in credential Values or Configuration JSON.'
        );
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const url = `${BB_API_BASE}/constituent/v1/constituents?limit=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as BBPagedResponse;
                return { Success: true, Message: `Connected to Blackbaud SKY API — ${body.count ?? 0} total constituents` };
            }
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ──────────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, _auth: RESTAuthContext): string {
        return BB_API_BASE;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        _page: number, offset: number, _cursor?: string
    ): string {
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}limit=${BB_PAGE_SIZE}&offset=${offset}`;
    }

    // ─── Response Parsing ──────────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, _responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        if (Array.isArray(body['value'])) return body['value'] as Record<string, unknown>[];
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, _currentPage: number, currentOffset: number, _pageSize: number
    ): PaginationState {
        const body = rawBody as BBPagedResponse;
        const records = this.NormalizeResponse(rawBody, null);
        const hasMore = !!body.next_link;
        return { HasMore: hasMore, NextOffset: currentOffset + records.length };
    }

    // ─── FetchChanges ──────────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectLower = ctx.ObjectName.toLowerCase();

        switch (objectLower) {
            case 'constituents':          return this.FetchConstituents(ctx);
            case 'constituentaddresses':  return this.FetchConstituentChildren(ctx, 'addresses', 'ConstituentAddresses');
            case 'constituentphones':     return this.FetchConstituentChildren(ctx, 'phones', 'ConstituentPhones');
            case 'constituentemails':     return this.FetchConstituentChildren(ctx, 'emailaddresses', 'ConstituentEmails');
            case 'gifts':                 return this.FetchGifts(ctx);
            case 'fundraisers':           return this.FetchList(ctx, `${BB_API_BASE}/fundraising/v1/fundraisers`, 'Fundraisers');
            case 'campaigns':             return this.FetchList(ctx, `${BB_API_BASE}/fundraising/v1/campaigns`, 'Campaigns');
            case 'opportunities':         return this.FetchList(ctx, `${BB_API_BASE}/opportunity/v1/opportunities`, 'Opportunities');
            default:                      return this.FetchGenericBBObject(ctx);
        }
    }

    private async FetchGenericBBObject(ctx: FetchContext): Promise<FetchBatchResult> {
        // Generic fetch — maps object name to likely SKY API path
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1/$2').toLowerCase();
        const url = `${BB_API_BASE}/constituent/v1/${apiPath}`;
        return this.FetchList(ctx, url, ctx.ObjectName);
    }

    private async FetchConstituents(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        let url = `${BB_API_BASE}/constituent/v1/constituents?limit=${BB_PAGE_SIZE}&offset=${offset}`;
        if (ctx.WatermarkValue) {
            url += `&date_modified=${encodeURIComponent(ctx.WatermarkValue)}`;
        }
        return this.ExecuteListFetch(auth, headers, url, 'Constituents', 'id', offset, ctx);
    }

    private async FetchGifts(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        let url = `${BB_API_BASE}/gift/v1/gifts?limit=${BB_PAGE_SIZE}&offset=${offset}`;
        if (ctx.WatermarkValue) {
            url += `&date_modified=${encodeURIComponent(ctx.WatermarkValue)}`;
        }
        return this.ExecuteListFetch(auth, headers, url, 'Gifts', 'id', offset, ctx);
    }

    private async FetchList(ctx: FetchContext, endpoint: string, objectType: string): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        let url = `${endpoint}?limit=${BB_PAGE_SIZE}&offset=${offset}`;
        // Blackbaud SKY API endpoint families that document a `date_modified`
        // query filter: Constituent API + Gift API + Fundraising API +
        // Opportunity API. The connector identifies them by URL substring so the
        // metadata can flip SupportsIncrementalSync=true for IOs in those
        // families and FetchList will honor the watermark.
        if (ctx.WatermarkValue && this.SupportsDateModified(endpoint)) {
            url += `&date_modified=${encodeURIComponent(ctx.WatermarkValue)}`;
        }
        return this.ExecuteListFetch(auth, headers, url, objectType, 'id', offset, ctx);
    }

    /**
     * Returns true if a Blackbaud SKY API endpoint is in a family documented to
     * accept the `date_modified` query filter. Conservative — only includes
     * endpoint roots where the SKY API docs surface the filter. Add new prefixes
     * after verifying against the vendor docs for that endpoint family.
     */
    private SupportsDateModified(endpoint: string): boolean {
        const supportedPrefixes = [
            '/constituent/v1/',
            '/gift/v1/',
            '/fundraising/v1/',
            '/opportunity/v1/',
        ];
        return supportedPrefixes.some(p => endpoint.includes(p));
    }

    private async FetchConstituentChildren(
        ctx: FetchContext, childEndpoint: string, objectType: string
    ): Promise<FetchBatchResult> {
        // Blackbaud provides flat list endpoints for child resources — no need to iterate parents
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        let url = `${BB_API_BASE}/constituent/v1/constituents/${childEndpoint}?limit=${BB_PAGE_SIZE}&offset=${offset}`;
        // Constituent-child endpoints are in the Constituent API family —
        // honor the watermark when provided.
        if (ctx.WatermarkValue) {
            url += `&date_modified=${encodeURIComponent(ctx.WatermarkValue)}`;
        }
        return this.ExecuteListFetch(auth, headers, url, objectType, 'id', offset, ctx);
    }

    private async ExecuteListFetch(
        auth: RESTAuthContext, headers: Record<string, string>,
        url: string, objectType: string, pkField: string,
        offset: number, ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Blackbaud ${objectType} API error: ${response.Status}`);
        }

        const body = response.Body as BBPagedResponse;
        const records = this.NormalizeResponse(response.Body, null);

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: objectType,
            Fields: r,
        }));

        const hasMore = !!body.next_link;
        let newWatermark: string | undefined;
        if (!hasMore) {
            for (const r of records) {
                const modified = r['date_modified'] as string | undefined;
                if (modified && (!newWatermark || modified > newWatermark)) newWatermark = modified;
            }
        }

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NextOffset: offset + records.length,
            NewWatermarkValue: !hasMore ? newWatermark : undefined,
        };
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(ctx.ObjectName, ctx.Attributes, null);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return { Success: true, ExternalID: String(body['id'] ?? ''), StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(ctx.ObjectName, ctx.Attributes, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const url = this.CRUDEndpointURL(ctx.ObjectName, {}, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    private CRUDEndpointURL(
        objectName: string, attrs: Record<string, unknown>, externalID: string | null
    ): string {
        const lower = objectName.toLowerCase();

        if (lower === 'constituentaddresses') {
            const base = `${BB_API_BASE}/constituent/v1/addresses`;
            return externalID ? `${base}/${externalID}` : base;
        }
        if (lower === 'constituentphones') {
            const base = `${BB_API_BASE}/constituent/v1/phones`;
            return externalID ? `${base}/${externalID}` : base;
        }
        if (lower === 'constituentemails') {
            const base = `${BB_API_BASE}/constituent/v1/emailaddresses`;
            return externalID ? `${base}/${externalID}` : base;
        }

        const endpointMap: Record<string, string> = {
            'constituents':  `${BB_API_BASE}/constituent/v1/constituents`,
            'gifts':         `${BB_API_BASE}/gift/v1/gifts`,
        };

        const base = endpointMap[lower] ?? `${BB_API_BASE}/${lower}`;
        return externalID ? `${base}/${externalID}` : base;
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
        const bbAuth = auth as BBAuthContext;
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'bb-api-subscription-key': bbAuth.SubscriptionKey,
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    // ─── HTTP Transport ────────────────────────────────────────────────

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string,
        headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        await this.Throttle();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            if (response.status === 401 && attempt === 0) {
                this.tokenCache = null;
                console.warn('[Blackbaud] 401 — clearing token cache for retry');
                continue;
            }

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') ?? '10', 10);
                const delay = Math.min(retryAfter * 1000, 60_000);
                console.warn(`[Blackbaud] Rate limited (429), waiting ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
                console.warn(`[Blackbaud] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }

        throw new Error(`Blackbaud request failed after ${MAX_RETRIES} retries: ${url}`);
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
                throw new Error(`Blackbaud request timed out: ${url}`);
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
        const obj = BB_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadBlackbaudConnector() { /* intentionally empty */ }
