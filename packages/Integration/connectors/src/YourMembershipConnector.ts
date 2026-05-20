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
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type IntegrationObjectInfo,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type SourceSchemaInfo,
    type SourceFieldInfo,
} from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity } from '@memberjunction/core-entities';

// ─── Configuration & Session Types ──────────────────────────────────

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface YMConnectionConfig {
    /** YM client/site identifier (integer) */
    ClientID: string;
    /** YM API key (used as UserName for session auth) */
    APIKey: string;
    /** YM API password (used as Password for session auth) */
    APIPassword: string;

    // ── Optional performance overrides (all have defaults) ──────────
    /** Maximum retries for rate-limited or failed requests. Default: 5 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests to avoid rate limiting. Default: 600 */
    MinRequestIntervalMs?: number;
    /** Number of members to enrich per batch before writing to DB. Default: 500 */
    EnrichBatchSize?: number;
    /** JSON parsing timeout in milliseconds. Default: 30000 */
    JsonTimeoutMs?: number;
    /** Detail enrichment timeout per record in milliseconds. Default: 45000 */
    EnrichTimeoutMs?: number;
}

/** Extended auth context with YM-specific session and config data */
interface YMAuthContext extends RESTAuthContext {
    Config: YMConnectionConfig;
}

/** Cached session data */
interface YMSession {
    SessionId: string;
    CreatedAt: number;
}

/** YM REST API base URL */
const YM_API_BASE = 'https://ws.yourmembership.com';

/** Sessions expire after 14 minutes (YM sessions last ~15 min) */
const SESSION_TTL_MS = 14 * 60 * 1000;

/** Maximum retries for rate-limited or failed requests */
const MAX_RETRIES = 5;

/** HTTP request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30000;

/** Minimum milliseconds between API requests to avoid rate limiting */
const MIN_REQUEST_INTERVAL_MS = 600;

/** Number of members to enrich per batch before writing to DB */
const ENRICH_BATCH_SIZE = 500;

/** JSON parsing timeout in milliseconds */
const JSON_TIMEOUT_MS = 30000;

/** Detail enrichment timeout per record in milliseconds */
const ENRICH_TIMEOUT_MS = 45000;

/** YM API metadata keys that should be filtered from record data */
const METADATA_KEYS = new Set([
    'ResponseStatus', 'UsingRedis', 'AppInitTime', 'ServerID',
    'ClientID', 'BypassCache', 'DateCached', 'Device',
]);

// ─── Connector Implementation ───────────────────────────────────────

/**
 * Connector for the YourMembership (YM) AMS REST API.
 *
 * Extends BaseRESTIntegrationConnector to leverage metadata-driven object/field
 * discovery from IntegrationEngineBase cache and generic pagination handling.
 *
 * Auth flow:
 *   1. POST /Ams/Authenticate with credentials + ClientID
 *   2. Receive SessionId
 *   3. Pass SessionId as X-SS-ID header on all data requests
 *
 * Configuration JSON (required + optional overrides):
 * {
 *   "ClientID": "25363",
 *   "APIKey": "...",
 *   "APIPassword": "...",
 *   "MaxRetries": 5,             // optional, default: 5
 *   "RequestTimeoutMs": 30000,   // optional, default: 30000
 *   "MinRequestIntervalMs": 600, // optional, default: 600
 *   "EnrichBatchSize": 500,      // optional, default: 500
 *   "JsonTimeoutMs": 30000,      // optional, default: 30000
 *   "EnrichTimeoutMs": 45000     // optional, default: 45000
 * }
 */
// ─── Action Metadata Objects ──────────────────────────────────────────

/**
 * All 123 YourMembership API objects — used for action generation and
 * schema discovery (YM API has no programmatic schema endpoint).
 * Same pattern as QuickBooks connector.
 */
const YM_ACTION_OBJECTS: IntegrationObjectInfo[] = [
    // ── Membership ────────────────────────────────────────
    {
        Name: 'Members', DisplayName: 'Members',
        Description: 'Organization members with profile, contact, and membership details', SupportsWrite: true,
        Fields: [
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Profile ID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'EmailAddr', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'MemberTypeCode', DisplayName: 'Member Type Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Member Type Code' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'Phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Phone' },
            { Name: 'Address1', DisplayName: 'Address 1', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address 1' },
            { Name: 'Address2', DisplayName: 'Address 2', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address 2' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
            { Name: 'PostalCode', DisplayName: 'Postal Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Postal Code' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'JoinDate', DisplayName: 'Join Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Join Date' },
            { Name: 'RenewalDate', DisplayName: 'Renewal Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Renewal Date' },
            { Name: 'ExpirationDate', DisplayName: 'Expiration Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Expiration Date' },
            { Name: 'MemberSinceDate', DisplayName: 'Member Since', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member Since' },
            { Name: 'WebsiteUrl', DisplayName: 'Website URL', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Website URL' },
        ],
    },
    {
        Name: 'MemberTypes', DisplayName: 'Member Types',
        Description: 'Classification types for members (e.g., Individual, Corporate, Student)', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'Type ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type ID' },
            { Name: 'TypeCode', DisplayName: 'Type Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type Code' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'IsDefault', DisplayName: 'Is Default', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Is Default' },
            { Name: 'PresetType', DisplayName: 'Preset Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Preset Type' },
            { Name: 'SortOrder', DisplayName: 'Sort Order', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sort Order' },
        ],
    },
    {
        Name: 'Memberships', DisplayName: 'Memberships',
        Description: 'Membership plans with dues amounts, proration rules, and invoice settings', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Membership ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership ID' },
            { Name: 'Code', DisplayName: 'Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Code' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'DuesAmount', DisplayName: 'Dues Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Dues Amount' },
            { Name: 'ProRatedDues', DisplayName: 'Pro-Rated Dues', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Pro-Rated Dues' },
            { Name: 'AllowMultipleOpenInvoices', DisplayName: 'Allow Multiple Invoices', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Allow Multiple Invoices' },
        ],
    },
    {
        Name: 'MembersProfiles', DisplayName: 'Members Profiles',
        Description: 'Comprehensive member profile data including custom fields, richer than basic member list', SupportsWrite: false,
        Fields: [
            { Name: 'WebSiteMemberID', DisplayName: 'WebSiteMemberID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'WebSiteMemberID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'EmailAddress', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'MemberTypeCode', DisplayName: 'Member Type Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Member Type Code' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'JoinDate', DisplayName: 'Join Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Join Date' },
            { Name: 'ExpirationDate', DisplayName: 'Expiration Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Expiration Date' },
            { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Modified' },
        ],
    },
    {
        Name: 'PeopleIDs', DisplayName: 'People IDs',
        Description: 'Member and non-member identity records for data synchronization with timestamp support', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'Person ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Person ID' },
            { Name: 'UserType', DisplayName: 'User Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User Type' },
            { Name: 'DateRegistered', DisplayName: 'Date Registered', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Registered' },
        ],
    },
    {
        Name: 'MemberSubAccounts', DisplayName: 'Member Sub Accounts',
        Description: 'Sub-account relationships linking dependent members to primary accounts', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'Sub-Account ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sub-Account ID' },
            { Name: 'ParentID', DisplayName: 'Parent Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent Member ID' },
            { Name: 'DateRegistered', DisplayName: 'Date Registered', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Registered' },
        ],
    },
    {
        Name: 'MembershipModifiers', DisplayName: 'Membership Modifiers',
        Description: 'Price modifier rules per membership plan (discounts, surcharges)', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'Modifier ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Modifier ID' },
            { Name: 'MembershipID', DisplayName: 'Membership ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership ID' },
            { Name: 'Name', DisplayName: 'Modifier Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Modifier Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
        ],
    },
    {
        Name: 'MembershipPromoCodes', DisplayName: 'Membership Promo Codes',
        Description: 'Promotional discount codes per membership plan with usage limits and expiration', SupportsWrite: true,
        Fields: [
            { Name: 'PromoCodeId', DisplayName: 'Promo Code ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Promo Code ID' },
            { Name: 'MembershipID', DisplayName: 'Membership ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership ID' },
            { Name: 'FriendlyName', DisplayName: 'Friendly Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Friendly Name' },
            { Name: 'DiscountAmount', DisplayName: 'Discount Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Discount Amount' },
            { Name: 'ExpirationDate', DisplayName: 'Expiration Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expiration Date' },
            { Name: 'UsageLimit', DisplayName: 'Usage Limit', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Usage Limit' },
        ],
    },
    // ── Events ────────────────────────────────────────────
    {
        Name: 'Events', DisplayName: 'Events',
        Description: 'Events including conferences, webinars, and meetings with dates and virtual meeting info', SupportsWrite: true,
        Fields: [
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event ID' },
            { Name: 'Name', DisplayName: 'Event Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event Name' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Date' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Date' },
            { Name: 'StartTime', DisplayName: 'Start Time', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Time' },
            { Name: 'EndTime', DisplayName: 'End Time', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Time' },
            { Name: 'IsVirtual', DisplayName: 'Is Virtual', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Is Virtual' },
            { Name: 'VirtualMeetingType', DisplayName: 'Virtual Meeting Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Virtual Meeting Type' },
        ],
    },
    {
        Name: 'EventRegistrations', DisplayName: 'Event Registrations',
        Description: 'Event registration records with attendee details, status, badge numbers, and attendance tracking', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Registrant ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registrant ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event ID' },
            { Name: 'RegistrationID', DisplayName: 'Registration ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Registration ID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Display Name' },
            { Name: 'HeadShotImage', DisplayName: 'Head Shot Image', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Head Shot Image' },
            { Name: 'DateRegistered', DisplayName: 'Date Registered', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Registered' },
            { Name: 'IsPrimary', DisplayName: 'Is Primary', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Is Primary' },
            { Name: 'BadgeNumber', DisplayName: 'Badge Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Badge Number' },
        ],
    },
    {
        Name: 'EventSessions', DisplayName: 'Event Sessions',
        Description: 'Breakout sessions within events including presenter, schedule, and CEU eligibility', SupportsWrite: true,
        Fields: [
            { Name: 'SessionId', DisplayName: 'Session ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Session ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event ID' },
            { Name: 'Name', DisplayName: 'Session Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Session Name' },
            { Name: 'Presenter', DisplayName: 'Presenter', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Presenter' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Date' },
            { Name: 'StartTime', DisplayName: 'Start Time', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Time' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Date' },
            { Name: 'EndTime', DisplayName: 'End Time', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Time' },
            { Name: 'MaxRegistrants', DisplayName: 'Max Registrants', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Max Registrants' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'AllowCEUs', DisplayName: 'Allow CEUs', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Allow CEUs' },
        ],
    },
    {
        Name: 'EventTickets', DisplayName: 'Event Tickets',
        Description: 'Ticket types for events with pricing, quantity limits, and categories', SupportsWrite: true,
        Fields: [
            { Name: 'TicketId', DisplayName: 'Ticket ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Ticket ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event ID' },
            { Name: 'Name', DisplayName: 'Ticket Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket Name' },
            { Name: 'Quantity', DisplayName: 'Quantity', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quantity' },
            { Name: 'UnitPrice', DisplayName: 'Unit Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Unit Price' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Category', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Category' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'EventCategories', DisplayName: 'Event Categories',
        Description: 'Categories for organizing and classifying events', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Category ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category ID' },
            { Name: 'Name', DisplayName: 'Category Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Category Name' },
        ],
    },
    {
        Name: 'EventAttendeeTypes', DisplayName: 'Event Attendee Types',
        Description: 'Attendee type definitions per event (e.g., Member, Non-Member, Speaker)', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Attendee Type ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Attendee Type ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'EventSessionGroups', DisplayName: 'Event Session Groups',
        Description: 'Logical groupings of sessions within events (e.g., tracks, time slots)', SupportsWrite: true,
        Fields: [
            { Name: 'SessionGroupId', DisplayName: 'Session Group ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Session Group ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event ID' },
            { Name: 'Name', DisplayName: 'Group Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'EventCEUAwards', DisplayName: 'Event CEU Awards',
        Description: 'Continuing education credit awards linked to events and certifications', SupportsWrite: false,
        Fields: [
            { Name: 'AwardID', DisplayName: 'Award ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Award ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event ID' },
            { Name: 'CertificationID', DisplayName: 'Certification ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Certification ID' },
            { Name: 'CreditTypeID', DisplayName: 'Credit Type ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Credit Type ID' },
            { Name: 'Credits', DisplayName: 'Credits', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Credits' },
        ],
    },
    {
        Name: 'EventRegistrationForms', DisplayName: 'Event Registration Forms',
        Description: 'Registration form definitions for events with auto-approval settings', SupportsWrite: true,
        Fields: [
            { Name: 'FormId', DisplayName: 'Form ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Form ID' },
            { Name: 'FormName', DisplayName: 'Form Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Form Name' },
            { Name: 'AutoApprove', DisplayName: 'Auto Approve', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Auto Approve' },
        ],
    },
    {
        Name: 'EventIDs', DisplayName: 'Event IDs',
        Description: 'Lightweight event identifier list for sync with last-modified date filtering', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Modified' },
        ],
    },
    // ── Finance ───────────────────────────────────────────
    {
        Name: 'DonationFunds', DisplayName: 'Donation Funds',
        Description: 'Donation fund definitions for directing charitable contributions', SupportsWrite: false,
        Fields: [
            { Name: 'fundId', DisplayName: 'Fund ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Fund ID' },
            { Name: 'fundName', DisplayName: 'Fund Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Fund Name' },
            { Name: 'fundOptionsCount', DisplayName: 'Options Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Options Count' },
        ],
    },
    {
        Name: 'InvoiceItems', DisplayName: 'Invoice Items',
        Description: 'Individual line items from invoices including dues, events, store purchases, and donations', SupportsWrite: false,
        Fields: [
            { Name: 'LineItemID', DisplayName: 'Line Item ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Line Item ID' },
            { Name: 'InvoiceNo', DisplayName: 'Invoice Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice Number' },
            { Name: 'InvoiceType', DisplayName: 'Invoice Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice Type' },
            { Name: 'WebSiteMemberID', DisplayName: 'Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member ID' },
            { Name: 'ConstituentID', DisplayName: 'Constituent ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Constituent ID' },
            { Name: 'InvoiceNameFirst', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'InvoiceNameLast', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'EmailAddress', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'LineItemType', DisplayName: 'Line Item Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Line Item Type' },
            { Name: 'LineItemDescription', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'LineItemDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date' },
            { Name: 'LineItemDateEntered', DisplayName: 'Date Entered', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Entered' },
            { Name: 'LineItemAmount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'LineItemQuantity', DisplayName: 'Quantity', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Quantity' },
            { Name: 'LineTotal', DisplayName: 'Line Total', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Line Total' },
            { Name: 'OutstandingBalance', DisplayName: 'Outstanding Balance', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Outstanding Balance' },
            { Name: 'PaymentTerms', DisplayName: 'Payment Terms', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment Terms' },
            { Name: 'GLCodeItemName', DisplayName: 'GL Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GL Code' },
            { Name: 'QBClassItemName', DisplayName: 'QB Class', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'QB Class' },
            { Name: 'PaymentOption', DisplayName: 'Payment Option', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment Option' },
        ],
    },
    {
        Name: 'DuesTransactions', DisplayName: 'Dues Transactions',
        Description: 'Membership dues payment transactions with status, amounts, and membership details', SupportsWrite: false,
        Fields: [
            { Name: 'TransactionID', DisplayName: 'Transaction ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Transaction ID' },
            { Name: 'InvoiceNumber', DisplayName: 'Invoice Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice Number' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WebsiteMemberID', DisplayName: 'Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member ID' },
            { Name: 'ConstituentID', DisplayName: 'Constituent ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Constituent ID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'BalanceDue', DisplayName: 'Balance Due', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Balance Due' },
            { Name: 'PaymentType', DisplayName: 'Payment Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment Type' },
            { Name: 'DateSubmitted', DisplayName: 'Date Submitted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Submitted' },
            { Name: 'DateProcessed', DisplayName: 'Date Processed', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Processed' },
            { Name: 'MembershipRequested', DisplayName: 'Membership Requested', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership Requested' },
            { Name: 'CurrentMembership', DisplayName: 'Current Membership', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current Membership' },
            { Name: 'CurrentMembershipExpDate', DisplayName: 'Membership Expiration', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership Expiration' },
            { Name: 'MemberType', DisplayName: 'Member Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member Type' },
            { Name: 'DateMemberSignup', DisplayName: 'Member Signup Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member Signup Date' },
            { Name: 'InvoiceDate', DisplayName: 'Invoice Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice Date' },
            { Name: 'ClosedBy', DisplayName: 'Closed By', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Closed By' },
        ],
    },
    {
        Name: 'DonationHistory', DisplayName: 'Donation History',
        Description: 'Individual donation records per member with amounts, funds, and payment methods', SupportsWrite: false,
        Fields: [
            { Name: 'intDonationId', DisplayName: 'Donation ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation ID' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Profile ID' },
            { Name: 'DatDonation', DisplayName: 'Donation Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Donation Date' },
            { Name: 'dblDonation', DisplayName: 'Donation Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Donation Amount' },
            { Name: 'strStatus', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'strFundName', DisplayName: 'Fund Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fund Name' },
            { Name: 'strDonorName', DisplayName: 'Donor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Donor Name' },
            { Name: 'strPaymentMethod', DisplayName: 'Payment Method', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment Method' },
        ],
    },
    {
        Name: 'DonationTransactions', DisplayName: 'Donation Transactions',
        Description: 'Donation payment transactions with member, fund, and payment details. DateFrom must be within 90 days.', SupportsWrite: false,
        Fields: [
            { Name: 'TransactionID', DisplayName: 'Transaction ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Transaction ID' },
            { Name: 'WebsiteMemberID', DisplayName: 'Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member ID' },
            { Name: 'ConstituentID', DisplayName: 'Constituent ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Constituent ID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'FundName', DisplayName: 'Fund Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fund Name' },
            { Name: 'DateSubmitted', DisplayName: 'Date Submitted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Submitted' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'PaymentType', DisplayName: 'Payment Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment Type' },
        ],
    },
    {
        Name: 'StoreOrders', DisplayName: 'Store Orders',
        Description: 'Online store order headers with order date, status, and shipping info', SupportsWrite: false,
        Fields: [
            { Name: 'InvoiceID', DisplayName: 'InvoiceID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'InvoiceID' },
            { Name: 'WebsiteMemberID', DisplayName: 'Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member ID' },
            { Name: 'OrderDate', DisplayName: 'Order Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Order Date' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'TotalAmount', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'ShippingMethod', DisplayName: 'Shipping Method', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shipping Method' },
            { Name: 'TrackingNumber', DisplayName: 'Tracking Number', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Tracking Number' },
        ],
    },
    {
        Name: 'StoreOrderDetails', DisplayName: 'Store Order Details',
        Description: 'Individual line items within store orders with product, pricing, and quantity details', SupportsWrite: false,
        Fields: [
            { Name: 'OrderID', DisplayName: 'OrderID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'OrderID' },
            { Name: 'WebsiteMemberID', DisplayName: 'Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member ID' },
            { Name: 'ProductName', DisplayName: 'Product Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Product Name' },
            { Name: 'Quantity', DisplayName: 'Quantity', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Quantity' },
            { Name: 'UnitPrice', DisplayName: 'Unit Price', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Unit Price' },
            { Name: 'TotalPrice', DisplayName: 'Total Price', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Price' },
            { Name: 'OrderDate', DisplayName: 'Order Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Order Date' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'ShippingMethod', DisplayName: 'Shipping Method', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shipping Method' },
            { Name: 'ProductCode', DisplayName: 'Product Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product Code' },
        ],
    },
    {
        Name: 'GLCodes', DisplayName: 'GL Codes',
        Description: 'General ledger codes for financial reporting and accounting integration', SupportsWrite: false,
        Fields: [
            { Name: 'GLCodeId', DisplayName: 'GL Code ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'GL Code ID' },
            { Name: 'GLCodeName', DisplayName: 'GL Code Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'GL Code Name' },
        ],
    },
    {
        Name: 'FinanceBatches', DisplayName: 'Finance Batches',
        Description: 'Financial processing batches grouping transactions by commerce type and close date. DISABLED: YM API pagination is broken for this endpoint — returns the same full result set on every page regardless of PageNumber, causing infinite loops.', SupportsWrite: true,
        Fields: [
            { Name: 'BatchID', DisplayName: 'Batch ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Batch ID' },
            { Name: 'CommerceType', DisplayName: 'Commerce Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Commerce Type' },
            { Name: 'ItemCount', DisplayName: 'Item Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item Count' },
            { Name: 'ClosedDate', DisplayName: 'Closed Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Closed Date' },
            { Name: 'CreateDateTime', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Created' },
        ],
    },
    {
        Name: 'FinanceBatchDetails', DisplayName: 'Finance Batch Details',
        Description: 'Detailed invoice and payment records within financial processing batches', SupportsWrite: false,
        Fields: [
            { Name: 'LineItemID', DisplayName: 'LineItemID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'LineItemID' },
            { Name: 'BatchID', DisplayName: 'Batch ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Batch ID' },
            { Name: 'InvoiceNumber', DisplayName: 'Invoice Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice Number' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'PaymentType', DisplayName: 'Payment Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment Type' },
            { Name: 'TransactionDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Transaction Date' },
        ],
    },
    {
        Name: 'DuesRules', DisplayName: 'Dues Rules',
        Description: 'Dues calculation rules with names, descriptions, and amount modifiers', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'Rule ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Rule ID' },
            { Name: 'Name', DisplayName: 'Rule Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Rule Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'Selected', DisplayName: 'Selected', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Selected' },
        ],
    },
    // ── Groups ────────────────────────────────────────────
    {
        Name: 'Groups', DisplayName: 'Groups',
        Description: 'Committees, chapters, sections, and other organizational groups', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Group ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group ID' },
            { Name: 'Name', DisplayName: 'Group Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group Name' },
            { Name: 'GroupTypeName', DisplayName: 'Group Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group Type' },
            { Name: 'GroupTypeId', DisplayName: 'Group Type ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group Type ID' },
        ],
    },
    {
        Name: 'MemberGroups', DisplayName: 'Member Groups',
        Description: 'Association between members and their group/committee memberships', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Profile ID' },
            { Name: 'GroupId', DisplayName: 'Group ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group ID' },
            { Name: 'GroupName', DisplayName: 'Group Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group Name' },
            { Name: 'GroupTypeName', DisplayName: 'Group Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group Type' },
            { Name: 'GroupTypeId', DisplayName: 'Group Type ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group Type ID' },
        ],
    },
    {
        Name: 'GroupTypes', DisplayName: 'Group Types',
        Description: 'Classification types for groups (e.g., Committee, Chapter, Section)', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Group Type ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group Type ID' },
            { Name: 'TypeName', DisplayName: 'Type Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type Name' },
            { Name: 'SortIndex', DisplayName: 'Sort Index', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sort Index' },
        ],
    },
    {
        Name: 'MembersGroupsBulk', DisplayName: 'Members Groups Bulk',
        Description: 'Bulk member-to-group assignments with group codes and primary group designation', SupportsWrite: false,
        Fields: [
            { Name: 'WebSiteMemberID', DisplayName: 'Member ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Member ID' },
            { Name: 'GroupID', DisplayName: 'Group ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group ID' },
            { Name: 'GroupCode', DisplayName: 'Group Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group Code' },
            { Name: 'GroupName', DisplayName: 'Group Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group Name' },
            { Name: 'PrimaryGroup', DisplayName: 'Primary Group', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Primary Group' },
        ],
    },
    {
        Name: 'GroupMembershipLogs', DisplayName: 'Group Membership Logs',
        Description: 'Audit trail of group membership changes with member details and timestamps', SupportsWrite: false,
        Fields: [
            { Name: 'ItemID', DisplayName: 'Item ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Item ID' },
            { Name: 'ID', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ID' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Profile ID' },
            { Name: 'NamePrefix', DisplayName: 'Name Prefix', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name Prefix' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'MiddleName', DisplayName: 'Middle Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Middle Name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'Suffix', DisplayName: 'Suffix', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Suffix' },
            { Name: 'Nickname', DisplayName: 'Nickname', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Nickname' },
            { Name: 'EmployerName', DisplayName: 'Employer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Employer Name' },
            { Name: 'WorkTitle', DisplayName: 'Work Title', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Work Title' },
            { Name: 'Date', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    // ── Certifications ────────────────────────────────────
    {
        Name: 'Certifications', DisplayName: 'Certifications',
        Description: 'Professional certifications and continuing education programs', SupportsWrite: false,
        Fields: [
            { Name: 'CertificationID', DisplayName: 'Certification ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Certification ID' },
            { Name: 'ID', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'IsActive', DisplayName: 'Is Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Is Active' },
            { Name: 'CEUsRequired', DisplayName: 'CEUs Required', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'CEUs Required' },
            { Name: 'Code', DisplayName: 'Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Code' },
        ],
    },
    {
        Name: 'CertificationsJournals', DisplayName: 'Certifications Journals',
        Description: 'Continuing education journal entries tracking CEU credits earned by members', SupportsWrite: true,
        Fields: [
            { Name: 'EntryID', DisplayName: 'Entry ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Entry ID' },
            { Name: 'CertificationName', DisplayName: 'Certification Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Certification Name' },
            { Name: 'CEUsEarned', DisplayName: 'CEUs Earned', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CEUs Earned' },
            { Name: 'EntryDate', DisplayName: 'Entry Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Entry Date' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WebsiteMemberID', DisplayName: 'Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member ID' },
        ],
    },
    {
        Name: 'CertificationCreditTypes', DisplayName: 'Certification Credit Types',
        Description: 'Types of continuing education credits (e.g., CEU, CPE) with expiration rules', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'Credit Type ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Credit Type ID' },
            { Name: 'Code', DisplayName: 'Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Code' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'IsDefault', DisplayName: 'Is Default', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Is Default' },
            { Name: 'CreditsExpire', DisplayName: 'Credits Expire', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Credits Expire' },
        ],
    },
    // ── Products ──────────────────────────────────────────
    {
        Name: 'Products', DisplayName: 'Products',
        Description: 'Store products available for purchase with pricing, inventory, and tax info', SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Product ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product ID' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'weight', DisplayName: 'Weight', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Weight' },
            { Name: 'taxRate', DisplayName: 'Tax Rate', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax Rate' },
            { Name: 'quantity', DisplayName: 'Quantity', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quantity' },
            { Name: 'ProductActive', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'IsFeatured', DisplayName: 'Is Featured', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Is Featured' },
            { Name: 'ListInStore', DisplayName: 'List In Store', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'List In Store' },
            { Name: 'taxable', DisplayName: 'Taxable', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Taxable' },
        ],
    },
    {
        Name: 'ProductCategories', DisplayName: 'Product Categories',
        Description: 'Categories for organizing store products', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Category ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category ID' },
            { Name: 'Name', DisplayName: 'Category Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Category Name' },
        ],
    },
    // ── Marketing ─────────────────────────────────────────
    {
        Name: 'Campaigns', DisplayName: 'Campaigns',
        Description: 'Email marketing campaigns with scheduling, sender, and delivery status', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'CampaignName', DisplayName: 'Campaign Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign Name' },
            { Name: 'Subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Subject' },
            { Name: 'SenderEmail', DisplayName: 'Sender Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sender Email' },
            { Name: 'DateScheduled', DisplayName: 'Date Scheduled', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Scheduled' },
            { Name: 'DateSent', DisplayName: 'Date Sent', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Sent' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'AllCampaigns', DisplayName: 'All Campaigns',
        Description: 'Extended campaign data with scheduling, processing counts, categories, and version info', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'CampaignName', DisplayName: 'Campaign Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign Name' },
            { Name: 'Subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Subject' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'Category', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Category' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type' },
            { Name: 'DateScheduled', DisplayName: 'Date Scheduled', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Scheduled' },
            { Name: 'DateSent', DisplayName: 'Date Sent', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Sent' },
            { Name: 'ProcessingCount', DisplayName: 'Processing Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Processing Count' },
        ],
    },
    {
        Name: 'CampaignEmailLists', DisplayName: 'Campaign Email Lists',
        Description: 'Email distribution lists for campaigns with totals, bounces, and opt-out metrics', SupportsWrite: true,
        Fields: [
            { Name: 'ListId', DisplayName: 'List ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'List ID' },
            { Name: 'ListType', DisplayName: 'List Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List Type' },
            { Name: 'ListSize', DisplayName: 'List Size', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List Size' },
            { Name: 'ListName', DisplayName: 'List Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List Name' },
            { Name: 'ListArea', DisplayName: 'List Area', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List Area' },
            { Name: 'DateCreated', DisplayName: 'Date Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'DateModified', DisplayName: 'Date Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Modified' },
            { Name: 'DateLastUpdated', DisplayName: 'Date Last Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Last Updated' },
        ],
    },
    {
        Name: 'Announcements', DisplayName: 'Announcements',
        Description: 'Admin announcements with title, text, publication dates, and active status', SupportsWrite: true,
        Fields: [
            { Name: 'AnnouncementId', DisplayName: 'Announcement ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Announcement ID' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'Text', DisplayName: 'Text', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Text' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Date' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Date' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'EmailSuppressionList', DisplayName: 'Email Suppression List',
        Description: 'Email addresses suppressed from delivery with bounce counts and health rates', SupportsWrite: false,
        Fields: [
            { Name: 'EmailAddress', DisplayName: 'EmailAddress', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'EmailAddress' },
            { Name: 'SuppressionType', DisplayName: 'Suppression Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Suppression Type' },
            { Name: 'BounceCount', DisplayName: 'Bounce Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Bounce Count' },
            { Name: 'HealthRate', DisplayName: 'Health Rate', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Health Rate' },
        ],
    },
    {
        Name: 'SponsorRotators', DisplayName: 'Sponsor Rotators',
        Description: 'Sponsor advertisement rotator configurations with display settings', SupportsWrite: false,
        Fields: [
            { Name: 'RotatorId', DisplayName: 'Rotator ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Rotator ID' },
            { Name: 'AutoScroll', DisplayName: 'Auto Scroll', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Auto Scroll' },
            { Name: 'Random', DisplayName: 'Random', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Random' },
            { Name: 'DateAdded', DisplayName: 'Date Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Added' },
            { Name: 'Mode', DisplayName: 'Mode', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mode' },
            { Name: 'Orientation', DisplayName: 'Orientation', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Orientation' },
            { Name: 'SchoolId', DisplayName: 'School ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'School ID' },
            { Name: 'Speed', DisplayName: 'Speed', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Speed' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'ClientId', DisplayName: 'Client ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Client ID' },
            { Name: 'Heading', DisplayName: 'Heading', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Heading' },
            { Name: 'Height', DisplayName: 'Height', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Height' },
        ],
    },
    // ── Engagement ────────────────────────────────────────
    {
        Name: 'Connections', DisplayName: 'Connections',
        Description: 'Networking connections between members including contact info and connection status', SupportsWrite: true,
        Fields: [
            { Name: 'ConnectionId', DisplayName: 'Connection ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Connection ID' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Profile ID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'WorkTitle', DisplayName: 'Work Title', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Work Title' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'EngagementScores', DisplayName: 'Engagement Scores',
        Description: 'Member engagement scoring metrics tracking participation and activity levels', SupportsWrite: true,
        Fields: [
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Profile ID' },
            { Name: 'EngagementScore', DisplayName: 'Engagement Score', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Engagement Score' },
            { Name: 'LastUpdated', DisplayName: 'Last Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last Updated' },
        ],
    },
    {
        Name: 'MemberReferrals', DisplayName: 'Member Referrals',
        Description: 'Member-to-member referral tracking records', SupportsWrite: false,
        Fields: [
            { Name: 'ReferralId', DisplayName: 'Referral ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Referral ID' },
            { Name: 'ReferrerID', DisplayName: 'Referrer Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Referrer Member ID' },
            { Name: 'ReferredID', DisplayName: 'Referred Member ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Referred Member ID' },
            { Name: 'ReferralDate', DisplayName: 'Referral Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Referral Date' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'MemberNetworks', DisplayName: 'Member Networks',
        Description: 'Social network profile links for members (LinkedIn, Twitter, etc.)', SupportsWrite: false,
        Fields: [
            { Name: 'NetworkId', DisplayName: 'Network ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Network ID' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Profile ID' },
            { Name: 'NetworkType', DisplayName: 'Network Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Network Type' },
            { Name: 'ProfileUrl', DisplayName: 'Profile URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Profile URL' },
        ],
    },
    {
        Name: 'MemberFavorites', DisplayName: 'Member Favorites',
        Description: 'Bookmarked/favorited items per member for personalization tracking', SupportsWrite: false,
        Fields: [
            { Name: 'FavoriteId', DisplayName: 'Favorite ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Favorite ID' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Profile ID' },
            { Name: 'ItemType', DisplayName: 'Item Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item Type' },
            { Name: 'ItemId', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item ID' },
            { Name: 'DateAdded', DisplayName: 'Date Added', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Added' },
        ],
    },
    // ── Reference ─────────────────────────────────────────
    {
        Name: 'Countries', DisplayName: 'Countries',
        Description: 'Country reference list with default country designation', SupportsWrite: false,
        Fields: [
            { Name: 'countryId', DisplayName: 'Country ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Country ID' },
            { Name: 'countryName', DisplayName: 'Country Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country Name' },
            { Name: 'countryCode', DisplayName: 'Country Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country Code' },
        ],
    },
    {
        Name: 'Locations', DisplayName: 'Locations',
        Description: 'States, provinces, and regions within countries with tax GL codes', SupportsWrite: false,
        Fields: [
            { Name: 'locationCode', DisplayName: 'Location Code', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Location Code' },
            { Name: 'countryId', DisplayName: 'Country ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country ID' },
            { Name: 'locationName', DisplayName: 'Location Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location Name' },
            { Name: 'taxGLCode', DisplayName: 'Tax GL Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax GL Code' },
            { Name: 'taxQBClass', DisplayName: 'Tax QB Class', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax QB Class' },
        ],
    },
    {
        Name: 'ShippingMethods', DisplayName: 'Shipping Methods',
        Description: 'Shipping method definitions with base pricing and weight-based rates', SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Shipping Method ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Shipping Method ID' },
            { Name: 'method', DisplayName: 'Method Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Method Name' },
            { Name: 'basePrice', DisplayName: 'Base Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Base Price' },
            { Name: 'pricePerWeightUnit', DisplayName: 'Price Per Weight Unit', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Price Per Weight Unit' },
            { Name: 'isDefault', DisplayName: 'Is Default', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Is Default' },
        ],
    },
    {
        Name: 'PaymentProcessors', DisplayName: 'Payment Processors',
        Description: 'Configured payment processors with active/primary status and card order types', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Processor ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Processor ID' },
            { Name: 'Name', DisplayName: 'Processor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Processor Name' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'Primary', DisplayName: 'Primary', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Primary' },
            { Name: 'CardOrderType', DisplayName: 'Card Order Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Card Order Type' },
        ],
    },
    {
        Name: 'CustomTaxLocations', DisplayName: 'Custom Tax Locations',
        Description: 'Locations with custom tax rate overrides for commerce transactions', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Tax Location ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tax Location ID' },
            { Name: 'CountryLabel', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'TaxRate', DisplayName: 'Tax Rate', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Tax Rate' },
        ],
    },
    {
        Name: 'QBClasses', DisplayName: 'QB Classes',
        Description: 'QuickBooks class definitions for accounting integration and financial categorization', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'QB Class ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'QB Class ID' },
            { Name: 'Name', DisplayName: 'QB Class Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'QB Class Name' },
        ],
    },
    {
        Name: 'TimeZones', DisplayName: 'Time Zones',
        Description: 'Time zone reference data with GMT offsets and display names', SupportsWrite: false,
        Fields: [
            { Name: 'fullName', DisplayName: 'Full Name', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Full Name' },
            { Name: 'gmtOffset', DisplayName: 'GMT Offset', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GMT Offset' },
        ],
    },
    // ── Careers ───────────────────────────────────────────
    {
        Name: 'CareerOpenings', DisplayName: 'Career Openings',
        Description: 'Job board postings with position, organization, salary, and contact details', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'Position', DisplayName: 'Position', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Position' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Salary', DisplayName: 'Salary', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Salary' },
            { Name: 'DatePosted', DisplayName: 'Date Posted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Posted' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'ContactEmail', DisplayName: 'Contact Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Contact Email' },
        ],
    },
    // ── Other ─────────────────────────────────────────────
    {
        Name: 'Ambassadors', DisplayName: 'Ambassadors',
        Description: 'YourMembership Ambassadors data', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'DisplayName', DisplayName: 'DisplayName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DisplayName' },
            { Name: 'MemberType', DisplayName: 'MemberType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberType' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'Rank', DisplayName: 'Rank', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Rank' },
            { Name: 'LatestActivity', DisplayName: 'LatestActivity', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LatestActivity' },
        ],
    },
    {
        Name: 'CampaignEmailListDuplicates', DisplayName: 'CampaignEmailListDuplicates',
        Description: 'YourMembership CampaignEmailListDuplicates data', SupportsWrite: false,
        Fields: [
            { Name: 'ItemId', DisplayName: 'ItemId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ItemId' },
            { Name: 'MemberId', DisplayName: 'MemberId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
        ],
    },
    {
        Name: 'CampaignReports', DisplayName: 'CampaignReports',
        Description: 'YourMembership CampaignReports data', SupportsWrite: false,
        Fields: [
            { Name: 'Date', DisplayName: 'Date', Type: 'datetime', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Date' },
            { Name: 'ListSize', DisplayName: 'ListSize', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ListSize' },
            { Name: 'Process', DisplayName: 'Process', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Process' },
            { Name: 'Send', DisplayName: 'Send', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Send' },
            { Name: 'Delivery', DisplayName: 'Delivery', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Delivery' },
            { Name: 'Open', DisplayName: 'Open', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Open' },
            { Name: 'OpenUnique', DisplayName: 'OpenUnique', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'OpenUnique' },
            { Name: 'Click', DisplayName: 'Click', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Click' },
            { Name: 'ClickUnique', DisplayName: 'ClickUnique', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ClickUnique' },
            { Name: 'HardBounce', DisplayName: 'HardBounce', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HardBounce' },
            { Name: 'SoftBounce', DisplayName: 'SoftBounce', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SoftBounce' },
            { Name: 'Complaint', DisplayName: 'Complaint', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Complaint' },
            { Name: 'CategoryOptOut', DisplayName: 'CategoryOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CategoryOptOut' },
            { Name: 'EmailOptOut', DisplayName: 'EmailOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EmailOptOut' },
            { Name: 'SuppressHardBounce', DisplayName: 'SuppressHardBounce', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressHardBounce' },
            { Name: 'SuppressCategoryOptOut', DisplayName: 'SuppressCategoryOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressCategoryOptOut' },
            { Name: 'SuppressEmailOptOut', DisplayName: 'SuppressEmailOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressEmailOptOut' },
            { Name: 'SuppressComplaint', DisplayName: 'SuppressComplaint', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressComplaint' },
            { Name: 'Fail', DisplayName: 'Fail', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fail' },
            { Name: 'Reject', DisplayName: 'Reject', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Reject' },
            { Name: 'NotOpen', DisplayName: 'NotOpen', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NotOpen' },
            { Name: 'NotSend', DisplayName: 'NotSend', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NotSend' },
            { Name: 'Accountability', DisplayName: 'Accountability', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Accountability' },
            { Name: 'EngagementScore', DisplayName: 'EngagementScore', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EngagementScore' },
            { Name: 'SuccessRate', DisplayName: 'SuccessRate', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuccessRate' },
        ],
    },
    {
        Name: 'CampaignReports_DailyRate', DisplayName: 'CampaignReports_DailyRate',
        Description: 'YourMembership CampaignReports_DailyRate data', SupportsWrite: false,
        Fields: [
            { Name: 'Date', DisplayName: 'Date', Type: 'datetime', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Date' },
            { Name: 'ListSize', DisplayName: 'ListSize', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ListSize' },
            { Name: 'Process', DisplayName: 'Process', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Process' },
            { Name: 'Send', DisplayName: 'Send', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Send' },
            { Name: 'Delivery', DisplayName: 'Delivery', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Delivery' },
            { Name: 'Open', DisplayName: 'Open', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Open' },
            { Name: 'OpenUnique', DisplayName: 'OpenUnique', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'OpenUnique' },
            { Name: 'Click', DisplayName: 'Click', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Click' },
            { Name: 'ClickUnique', DisplayName: 'ClickUnique', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ClickUnique' },
            { Name: 'HardBounce', DisplayName: 'HardBounce', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HardBounce' },
            { Name: 'SoftBounce', DisplayName: 'SoftBounce', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SoftBounce' },
            { Name: 'Complaint', DisplayName: 'Complaint', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Complaint' },
            { Name: 'CategoryOptOut', DisplayName: 'CategoryOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CategoryOptOut' },
            { Name: 'EmailOptOut', DisplayName: 'EmailOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EmailOptOut' },
            { Name: 'SuppressHardBounce', DisplayName: 'SuppressHardBounce', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressHardBounce' },
            { Name: 'SuppressCategoryOptOut', DisplayName: 'SuppressCategoryOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressCategoryOptOut' },
            { Name: 'SuppressEmailOptOut', DisplayName: 'SuppressEmailOptOut', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressEmailOptOut' },
            { Name: 'SuppressComplaint', DisplayName: 'SuppressComplaint', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuppressComplaint' },
            { Name: 'Fail', DisplayName: 'Fail', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fail' },
            { Name: 'Reject', DisplayName: 'Reject', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Reject' },
            { Name: 'NotOpen', DisplayName: 'NotOpen', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NotOpen' },
            { Name: 'NotSend', DisplayName: 'NotSend', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NotSend' },
            { Name: 'Accountability', DisplayName: 'Accountability', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Accountability' },
            { Name: 'EngagementScore', DisplayName: 'EngagementScore', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EngagementScore' },
            { Name: 'SuccessRate', DisplayName: 'SuccessRate', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SuccessRate' },
        ],
    },
    {
        Name: 'CampaignReports_MessageActivity', DisplayName: 'CampaignReports_MessageActivity',
        Description: 'YourMembership CampaignReports_MessageActivity data', SupportsWrite: false,
        Fields: [
            { Name: 'TypeId', DisplayName: 'TypeId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'TypeId' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Date', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date' },
        ],
    },
    {
        Name: 'CampaignReports_Messages', DisplayName: 'CampaignReports_Messages',
        Description: 'YourMembership CampaignReports_Messages data', SupportsWrite: false,
        Fields: [
            { Name: 'MemberId', DisplayName: 'MemberId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MemberId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'MessageGuid', DisplayName: 'MessageGuid', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MessageGuid' },
            { Name: 'Activity', DisplayName: 'Activity', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Activity' },
        ],
    },
    {
        Name: 'CommunityPhotos', DisplayName: 'CommunityPhotos',
        Description: 'YourMembership CommunityPhotos data', SupportsWrite: true,
        Fields: [
            { Name: 'CommentID', DisplayName: 'CommentID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'CommentID' },
            { Name: 'CdbID', DisplayName: 'CdbID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CdbID' },
            { Name: 'Posted', DisplayName: 'Posted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Posted' },
            { Name: 'PostedUTC', DisplayName: 'PostedUTC', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedUTC' },
            { Name: 'GalleryItemID', DisplayName: 'GalleryItemID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GalleryItemID' },
            { Name: 'SchoolID', DisplayName: 'SchoolID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SchoolID' },
            { Name: 'Comment', DisplayName: 'Comment', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Comment' },
            { Name: 'PostedBy', DisplayName: 'PostedBy', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedBy' },
            { Name: 'PostedByMugshot', DisplayName: 'PostedByMugshot', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedByMugshot' },
            { Name: 'PostedDate', DisplayName: 'PostedDate', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedDate' },
            { Name: 'GroupID', DisplayName: 'GroupID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GroupID' },
            { Name: 'IsOwner', DisplayName: 'IsOwner', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsOwner' },
            { Name: 'LikeID', DisplayName: 'LikeID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeID' },
            { Name: 'LikedComment', DisplayName: 'LikedComment', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikedComment' },
            { Name: 'LikeCount', DisplayName: 'LikeCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeCount' },
            { Name: 'SkipCrossPost', DisplayName: 'SkipCrossPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SkipCrossPost' },
        ],
    },
    {
        Name: 'ConnectionCategoryList', DisplayName: 'ConnectionCategoryList',
        Description: 'YourMembership ConnectionCategoryList data', SupportsWrite: false,
        Fields: [
            { Name: 'CategoryID', DisplayName: 'CategoryID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'CategoryID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'IndexType', DisplayName: 'IndexType', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IndexType' },
        ],
    },
    {
        Name: 'ConnectionSuggestions', DisplayName: 'ConnectionSuggestions',
        Description: 'YourMembership ConnectionSuggestions data', SupportsWrite: false,
        Fields: [
            { Name: 'ConnectionStatus', DisplayName: 'ConnectionStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionStatus' },
            { Name: 'ConnectionId', DisplayName: 'ConnectionId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ConnectionId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'ConnectionName', DisplayName: 'ConnectionName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionName' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'MemberType', DisplayName: 'MemberType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberType' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Shared', DisplayName: 'Shared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shared' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'PhoneLabel', DisplayName: 'PhoneLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneLabel' },
            { Name: 'PhoneAreaCode', DisplayName: 'PhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneAreaCode' },
            { Name: 'PhoneNumber', DisplayName: 'PhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneNumber' },
            { Name: 'FaxLabel', DisplayName: 'FaxLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxLabel' },
            { Name: 'FaxAreaCode', DisplayName: 'FaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxAreaCode' },
            { Name: 'FaxNumber', DisplayName: 'FaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxNumber' },
            { Name: 'CanShow', DisplayName: 'CanShow', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShow' },
            { Name: 'intCategoryID', DisplayName: 'intCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intCategoryID' },
            { Name: 'IsAmbassador', DisplayName: 'IsAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassador' },
        ],
    },
    {
        Name: 'ContentAreaCustomMacros', DisplayName: 'ContentAreaCustomMacros',
        Description: 'YourMembership ContentAreaCustomMacros data', SupportsWrite: false,
        Fields: [
            { Name: 'Label', DisplayName: 'Label', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Label' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Code', DisplayName: 'Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Code' },
        ],
    },
    {
        Name: 'ContentAreaVersions', DisplayName: 'ContentAreaVersions',
        Description: 'YourMembership ContentAreaVersions data', SupportsWrite: false,
        Fields: [
            { Name: 'VersionID', DisplayName: 'VersionID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'VersionID' },
            { Name: 'EditorName', DisplayName: 'EditorName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EditorName' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'Body', DisplayName: 'Body', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Body' },
            { Name: 'Label', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Label' },
            { Name: 'Notes', DisplayName: 'Notes', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Notes' },
            { Name: 'LastModifiedDate', DisplayName: 'LastModifiedDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastModifiedDate' },
            { Name: 'Status', DisplayName: 'Status', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'CustomFormFields', DisplayName: 'CustomFormFields',
        Description: 'YourMembership CustomFormFields data', SupportsWrite: false,
        Fields: [
            { Name: 'Label', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Label' },
            { Name: 'ID', DisplayName: 'ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'ListItems', DisplayName: 'ListItems', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ListItems' },
            { Name: 'FieldType', DisplayName: 'FieldType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FieldType' },
            { Name: 'DataType', DisplayName: 'DataType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DataType' },
            { Name: 'InputRows', DisplayName: 'InputRows', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'InputRows' },
            { Name: 'MaxLen', DisplayName: 'MaxLen', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MaxLen' },
            { Name: 'Required', DisplayName: 'Required', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Required' },
            { Name: 'FullRow', DisplayName: 'FullRow', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FullRow' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'IsVisibleToPublic', DisplayName: 'IsVisibleToPublic', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsVisibleToPublic' },
        ],
    },
    {
        Name: 'CustomPageCrossLinks', DisplayName: 'CustomPageCrossLinks',
        Description: 'YourMembership CustomPageCrossLinks data', SupportsWrite: false,
        Fields: [
            { Name: 'PageID', DisplayName: 'PageID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'PageID' },
            { Name: 'PageName', DisplayName: 'PageName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PageName' },
            { Name: 'Selected', DisplayName: 'Selected', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Selected' },
        ],
    },
    {
        Name: 'CustomPageFeatures', DisplayName: 'CustomPageFeatures',
        Description: 'YourMembership CustomPageFeatures data', SupportsWrite: false,
        Fields: [
            { Name: 'ID', DisplayName: 'ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'Visible', DisplayName: 'Visible', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Visible' },
            { Name: 'DefaultValue', DisplayName: 'DefaultValue', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DefaultValue' },
        ],
    },
    {
        Name: 'CustomPageForms', DisplayName: 'CustomPageForms',
        Description: 'YourMembership CustomPageForms data', SupportsWrite: false,
        Fields: [
            { Name: 'FormID', DisplayName: 'FormID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FormID' },
            { Name: 'FormName', DisplayName: 'FormName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FormName' },
            { Name: 'AutoApproveNewSubmissions', DisplayName: 'AutoApproveNewSubmissions', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AutoApproveNewSubmissions' },
        ],
    },
    {
        Name: 'CustomPageMemberTypes', DisplayName: 'CustomPageMemberTypes',
        Description: 'YourMembership CustomPageMemberTypes data', SupportsWrite: false,
        Fields: [
            { Name: 'TypeID', DisplayName: 'TypeID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'TypeID' },
            { Name: 'TypeName', DisplayName: 'TypeName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TypeName' },
            { Name: 'Selected', DisplayName: 'Selected', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Selected' },
        ],
    },
    {
        Name: 'CustomPageVersions', DisplayName: 'CustomPageVersions',
        Description: 'YourMembership CustomPageVersions data', SupportsWrite: true,
        Fields: [
            { Name: 'VersionID', DisplayName: 'VersionID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'VersionID' },
            { Name: 'PageID', DisplayName: 'PageID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PageID' },
            { Name: 'Status', DisplayName: 'Status', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'Body', DisplayName: 'Body', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Body' },
            { Name: 'Label', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Label' },
            { Name: 'Notes', DisplayName: 'Notes', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Notes' },
            { Name: 'DateModified', DisplayName: 'DateModified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateModified' },
            { Name: 'EditorName', DisplayName: 'EditorName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EditorName' },
        ],
    },
    {
        Name: 'DashboardData', DisplayName: 'DashboardData',
        Description: 'YourMembership DashboardData data', SupportsWrite: false,
        Fields: [
            { Name: 'Date', DisplayName: 'Date', Type: 'datetime', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Date' },
            { Name: 'PostCount', DisplayName: 'PostCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostCount' },
            { Name: 'CommentCount', DisplayName: 'CommentCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentCount' },
            { Name: 'LikeCount', DisplayName: 'LikeCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeCount' },
            { Name: 'ShareCount', DisplayName: 'ShareCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ShareCount' },
            { Name: 'ConnectionCount', DisplayName: 'ConnectionCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionCount' },
            { Name: 'LoginCount', DisplayName: 'LoginCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LoginCount' },
        ],
    },
    {
        Name: 'DirectorySearch', DisplayName: 'DirectorySearch',
        Description: 'YourMembership DirectorySearch data', SupportsWrite: false,
        Fields: [
            { Name: 'CanHaveConnections', DisplayName: 'CanHaveConnections', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanHaveConnections' },
            { Name: 'CanUseMessaging', DisplayName: 'CanUseMessaging', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanUseMessaging' },
            { Name: 'MemberID', DisplayName: 'MemberID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MemberID' },
            { Name: 'PrimaryGroupName', DisplayName: 'PrimaryGroupName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PrimaryGroupName' },
            { Name: 'IsMember', DisplayName: 'IsMember', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsMember' },
            { Name: 'IsNonMember', DisplayName: 'IsNonMember', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsNonMember' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'AddressLine1', DisplayName: 'AddressLine1', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AddressLine1' },
            { Name: 'AddressLine2', DisplayName: 'AddressLine2', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AddressLine2' },
            { Name: 'Phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Phone' },
            { Name: 'HeadshotImagePath', DisplayName: 'HeadshotImagePath', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadshotImagePath' },
            { Name: 'NonMemberLost', DisplayName: 'NonMemberLost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NonMemberLost' },
            { Name: 'NonMemberDeceased', DisplayName: 'NonMemberDeceased', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NonMemberDeceased' },
            { Name: 'NonMemberComments', DisplayName: 'NonMemberComments', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NonMemberComments' },
            { Name: 'JobTitle', DisplayName: 'JobTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'JobTitle' },
        ],
    },
    {
        Name: 'DomainAuthentication', DisplayName: 'DomainAuthentication',
        Description: 'YourMembership DomainAuthentication data', SupportsWrite: true,
        Fields: [
            { Name: 'DomainId', DisplayName: 'DomainId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'DomainId' },
            { Name: 'DomainName', DisplayName: 'DomainName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DomainName' },
            { Name: 'IsYmMangedDomain', DisplayName: 'IsYmMangedDomain', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsYmMangedDomain' },
            { Name: 'EmailsCount', DisplayName: 'EmailsCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EmailsCount' },
            { Name: 'DomainStatus', DisplayName: 'DomainStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DomainStatus' },
            { Name: 'IdentityZoneRecord', DisplayName: 'IdentityZoneRecord', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IdentityZoneRecord' },
            { Name: 'DkimZoneRecords', DisplayName: 'DkimZoneRecords', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DkimZoneRecords' },
        ],
    },
    {
        Name: 'EmailSendersInfo', DisplayName: 'EmailSendersInfo',
        Description: 'YourMembership EmailSendersInfo data', SupportsWrite: false,
        Fields: [
            { Name: 'Address', DisplayName: 'Address', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Address' },
            { Name: 'Display', DisplayName: 'Display', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Display' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'IsDefault', DisplayName: 'IsDefault', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsDefault' },
        ],
    },
    {
        Name: 'EmailVerification', DisplayName: 'EmailVerification',
        Description: 'YourMembership EmailVerification data', SupportsWrite: true,
        Fields: [
            { Name: 'EmailId', DisplayName: 'EmailId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'EmailId' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'EmailStatus', DisplayName: 'EmailStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EmailStatus' },
            { Name: 'DomainId', DisplayName: 'DomainId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DomainId' },
        ],
    },
    {
        Name: 'EventAttendeeTypeSessions', DisplayName: 'EventAttendeeTypeSessions',
        Description: 'YourMembership EventAttendeeTypeSessions data', SupportsWrite: true,
        Fields: [
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'EventId', DisplayName: 'EventId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'EventId' },
            { Name: 'TypeId', DisplayName: 'TypeId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TypeId' },
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Id' },
        ],
    },
    {
        Name: 'EventAttendeeTypeTickets', DisplayName: 'EventAttendeeTypeTickets',
        Description: 'YourMembership EventAttendeeTypeTickets data', SupportsWrite: true,
        Fields: [
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'EventId', DisplayName: 'EventId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'EventId' },
            { Name: 'TypeId', DisplayName: 'TypeId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TypeId' },
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Id' },
        ],
    },
    {
        Name: 'EventAttendees', DisplayName: 'EventAttendees',
        Description: 'YourMembership EventAttendees data', SupportsWrite: false,
        Fields: [
            { Name: 'RegisterID', DisplayName: 'RegisterID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'RegisterID' },
            { Name: 'RsvpID', DisplayName: 'RsvpID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RsvpID' },
            { Name: 'DateRegister', DisplayName: 'DateRegister', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateRegister' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'ProfileID', DisplayName: 'ProfileID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ProfileID' },
            { Name: 'ID', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ID' },
            { Name: 'RsvpResponse', DisplayName: 'RsvpResponse', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RsvpResponse' },
            { Name: 'DataSet', DisplayName: 'DataSet', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DataSet' },
        ],
    },
    {
        Name: 'EventCustomLabels', DisplayName: 'EventCustomLabels',
        Description: 'YourMembership EventCustomLabels data', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'MetaId', DisplayName: 'MetaId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MetaId' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'DefaultValue', DisplayName: 'DefaultValue', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DefaultValue' },
            { Name: 'CustomValue', DisplayName: 'CustomValue', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CustomValue' },
        ],
    },
    {
        Name: 'EventRegistrants', DisplayName: 'EventRegistrants',
        Description: 'YourMembership EventRegistrants data', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'DisplayName', DisplayName: 'DisplayName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DisplayName' },
            { Name: 'DateRegistered', DisplayName: 'DateRegistered', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateRegistered' },
            { Name: 'RegistrationID', DisplayName: 'RegistrationID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RegistrationID' },
            { Name: 'IsPrimary', DisplayName: 'IsPrimary', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsPrimary' },
            { Name: 'BadgeNumber', DisplayName: 'BadgeNumber', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'BadgeNumber' },
        ],
    },
    {
        Name: 'EventSearch', DisplayName: 'EventSearch',
        Description: 'YourMembership EventSearch data', SupportsWrite: false,
        Fields: [
            { Name: 'EventName', DisplayName: 'EventName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EventName' },
            { Name: 'EventID', DisplayName: 'EventID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'EventID' },
            { Name: 'EventDate', DisplayName: 'EventDate', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EventDate' },
        ],
    },
    {
        Name: 'EventSessionCEUAwards', DisplayName: 'EventSessionCEUAwards',
        Description: 'YourMembership EventSessionCEUAwards data', SupportsWrite: false,
        Fields: [
            { Name: 'AwardID', DisplayName: 'AwardID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'AwardID' },
            { Name: 'CertificationID', DisplayName: 'CertificationID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CertificationID' },
            { Name: 'CreditTypeID', DisplayName: 'CreditTypeID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CreditTypeID' },
            { Name: 'Credits', DisplayName: 'Credits', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Credits' },
            { Name: 'Expiry', DisplayName: 'Expiry', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Expiry' },
            { Name: 'DateExpires', DisplayName: 'DateExpires', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateExpires' },
            { Name: 'DateCreated', DisplayName: 'DateCreated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateCreated' },
            { Name: 'DateUpdated', DisplayName: 'DateUpdated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateUpdated' },
            { Name: 'ActivityCode', DisplayName: 'ActivityCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ActivityCode' },
            { Name: 'MemberTypeID', DisplayName: 'MemberTypeID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberTypeID' },
            { Name: 'LinkedEntityID', DisplayName: 'LinkedEntityID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LinkedEntityID' },
        ],
    },
    {
        Name: 'Feeds', DisplayName: 'Feeds',
        Description: 'YourMembership Feeds data', SupportsWrite: false,
        Fields: [
            { Name: 'Sponsored', DisplayName: 'Sponsored', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sponsored' },
            { Name: 'MemberID', DisplayName: 'MemberID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MemberID' },
            { Name: 'PostText', DisplayName: 'PostText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostText' },
            { Name: 'PostHtml', DisplayName: 'PostHtml', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHtml' },
            { Name: 'AuthorId', DisplayName: 'AuthorId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorId' },
            { Name: 'WallOwnerId', DisplayName: 'WallOwnerId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerId' },
            { Name: 'AuthorName', DisplayName: 'AuthorName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorName' },
            { Name: 'WallOwnerName', DisplayName: 'WallOwnerName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerName' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'PostDate', DisplayName: 'PostDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostDate' },
            { Name: 'PostType', DisplayName: 'PostType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostType' },
            { Name: 'ShareCount', DisplayName: 'ShareCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ShareCount' },
            { Name: 'LikesCount', DisplayName: 'LikesCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikesCount' },
            { Name: 'LikedPost', DisplayName: 'LikedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikedPost' },
            { Name: 'LikeId', DisplayName: 'LikeId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeId' },
            { Name: 'CommentCount', DisplayName: 'CommentCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentCount' },
            { Name: 'CommenterCount', DisplayName: 'CommenterCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommenterCount' },
            { Name: 'PostHeadShotUrl', DisplayName: 'PostHeadShotUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadShotUrl' },
            { Name: 'CanReply', DisplayName: 'CanReply', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanReply' },
            { Name: 'CanShare', DisplayName: 'CanShare', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShare' },
            { Name: 'CanComment', DisplayName: 'CanComment', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanComment' },
            { Name: 'CanDelete', DisplayName: 'CanDelete', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanDelete' },
            { Name: 'RecentComments', DisplayName: 'RecentComments', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RecentComments' },
            { Name: 'CommentList', DisplayName: 'CommentList', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentList' },
            { Name: 'PostHeadline', DisplayName: 'PostHeadline', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadline' },
            { Name: 'TopLine', DisplayName: 'TopLine', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TopLine' },
            { Name: 'PostContentData', DisplayName: 'PostContentData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostContentData' },
            { Name: 'PhotoGallery', DisplayName: 'PhotoGallery', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoGallery' },
            { Name: 'IsAmbassadorPost', DisplayName: 'IsAmbassadorPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassadorPost' },
            { Name: 'IsActorAmbassador', DisplayName: 'IsActorAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsActorAmbassador' },
            { Name: 'IsSharedPost', DisplayName: 'IsSharedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsSharedPost' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'JobAlerts', DisplayName: 'JobAlerts',
        Description: 'YourMembership JobAlerts data', SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'id', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'id' },
            { Name: 'name', DisplayName: 'name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'name' },
            { Name: 'expires_in', DisplayName: 'expires_in', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'expires_in' },
            { Name: 'send_frequency', DisplayName: 'send_frequency', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'send_frequency' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'filters', DisplayName: 'filters', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'filters' },
            { Name: 'jobs', DisplayName: 'jobs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'jobs' },
        ],
    },
    {
        Name: 'LatestPosts', DisplayName: 'LatestPosts',
        Description: 'YourMembership LatestPosts data', SupportsWrite: false,
        Fields: [
            { Name: 'Sponsored', DisplayName: 'Sponsored', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sponsored' },
            { Name: 'MemberID', DisplayName: 'MemberID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MemberID' },
            { Name: 'PostText', DisplayName: 'PostText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostText' },
            { Name: 'PostHtml', DisplayName: 'PostHtml', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHtml' },
            { Name: 'AuthorId', DisplayName: 'AuthorId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorId' },
            { Name: 'WallOwnerId', DisplayName: 'WallOwnerId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerId' },
            { Name: 'AuthorName', DisplayName: 'AuthorName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorName' },
            { Name: 'WallOwnerName', DisplayName: 'WallOwnerName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerName' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'PostDate', DisplayName: 'PostDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostDate' },
            { Name: 'PostType', DisplayName: 'PostType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostType' },
            { Name: 'ShareCount', DisplayName: 'ShareCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ShareCount' },
            { Name: 'LikesCount', DisplayName: 'LikesCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikesCount' },
            { Name: 'LikedPost', DisplayName: 'LikedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikedPost' },
            { Name: 'LikeId', DisplayName: 'LikeId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeId' },
            { Name: 'CommentCount', DisplayName: 'CommentCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentCount' },
            { Name: 'CommenterCount', DisplayName: 'CommenterCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommenterCount' },
            { Name: 'PostHeadShotUrl', DisplayName: 'PostHeadShotUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadShotUrl' },
            { Name: 'CanReply', DisplayName: 'CanReply', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanReply' },
            { Name: 'CanShare', DisplayName: 'CanShare', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShare' },
            { Name: 'CanComment', DisplayName: 'CanComment', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanComment' },
            { Name: 'CanDelete', DisplayName: 'CanDelete', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanDelete' },
            { Name: 'RecentComments', DisplayName: 'RecentComments', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RecentComments' },
            { Name: 'CommentList', DisplayName: 'CommentList', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentList' },
            { Name: 'PostHeadline', DisplayName: 'PostHeadline', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadline' },
            { Name: 'TopLine', DisplayName: 'TopLine', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TopLine' },
            { Name: 'PostContentData', DisplayName: 'PostContentData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostContentData' },
            { Name: 'PhotoGallery', DisplayName: 'PhotoGallery', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoGallery' },
            { Name: 'IsAmbassadorPost', DisplayName: 'IsAmbassadorPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassadorPost' },
            { Name: 'IsActorAmbassador', DisplayName: 'IsActorAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsActorAmbassador' },
            { Name: 'IsSharedPost', DisplayName: 'IsSharedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsSharedPost' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'Likes', DisplayName: 'Likes',
        Description: 'YourMembership Likes data', SupportsWrite: true,
        Fields: [
            { Name: 'LikeId', DisplayName: 'LikeId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'LikeId' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'CommentId', DisplayName: 'CommentId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentId' },
            { Name: 'PhotoId', DisplayName: 'PhotoId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoId' },
            { Name: 'PhotoCommentId', DisplayName: 'PhotoCommentId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoCommentId' },
            { Name: 'DateLiked', DisplayName: 'DateLiked', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateLiked' },
            { Name: 'ConnectionStatus', DisplayName: 'ConnectionStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionStatus' },
            { Name: 'ConnectionId', DisplayName: 'ConnectionId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'ConnectionName', DisplayName: 'ConnectionName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionName' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'MemberType', DisplayName: 'MemberType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberType' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Shared', DisplayName: 'Shared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shared' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'PhoneLabel', DisplayName: 'PhoneLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneLabel' },
            { Name: 'PhoneAreaCode', DisplayName: 'PhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneAreaCode' },
            { Name: 'PhoneNumber', DisplayName: 'PhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneNumber' },
            { Name: 'FaxLabel', DisplayName: 'FaxLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxLabel' },
            { Name: 'FaxAreaCode', DisplayName: 'FaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxAreaCode' },
            { Name: 'FaxNumber', DisplayName: 'FaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxNumber' },
            { Name: 'CanShow', DisplayName: 'CanShow', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShow' },
            { Name: 'intCategoryID', DisplayName: 'intCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intCategoryID' },
            { Name: 'IsAmbassador', DisplayName: 'IsAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassador' },
        ],
    },
    {
        Name: 'Likes_PostList', DisplayName: 'Likes_PostList',
        Description: 'YourMembership Likes_PostList data', SupportsWrite: true,
        Fields: [
            { Name: 'LikeId', DisplayName: 'LikeId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'LikeId' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'CommentId', DisplayName: 'CommentId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentId' },
            { Name: 'PhotoId', DisplayName: 'PhotoId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoId' },
            { Name: 'PhotoCommentId', DisplayName: 'PhotoCommentId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoCommentId' },
            { Name: 'DateLiked', DisplayName: 'DateLiked', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateLiked' },
            { Name: 'ConnectionStatus', DisplayName: 'ConnectionStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionStatus' },
            { Name: 'ConnectionId', DisplayName: 'ConnectionId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'ConnectionName', DisplayName: 'ConnectionName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionName' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'MemberType', DisplayName: 'MemberType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberType' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Shared', DisplayName: 'Shared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shared' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'PhoneLabel', DisplayName: 'PhoneLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneLabel' },
            { Name: 'PhoneAreaCode', DisplayName: 'PhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneAreaCode' },
            { Name: 'PhoneNumber', DisplayName: 'PhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneNumber' },
            { Name: 'FaxLabel', DisplayName: 'FaxLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxLabel' },
            { Name: 'FaxAreaCode', DisplayName: 'FaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxAreaCode' },
            { Name: 'FaxNumber', DisplayName: 'FaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxNumber' },
            { Name: 'CanShow', DisplayName: 'CanShow', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShow' },
            { Name: 'intCategoryID', DisplayName: 'intCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intCategoryID' },
            { Name: 'IsAmbassador', DisplayName: 'IsAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassador' },
        ],
    },
    {
        Name: 'LocationCoordinates', DisplayName: 'LocationCoordinates',
        Description: 'YourMembership LocationCoordinates data', SupportsWrite: false,
        Fields: [
            { Name: 'city', DisplayName: 'city', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'city' },
            { Name: 'state', DisplayName: 'state', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'state' },
            { Name: 'country', DisplayName: 'country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'country' },
            { Name: 'latitude', DisplayName: 'latitude', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'latitude' },
            { Name: 'longitude', DisplayName: 'longitude', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'longitude' },
            { Name: 'place_id', DisplayName: 'place_id', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'place_id' },
        ],
    },
    {
        Name: 'Markup', DisplayName: 'Markup',
        Description: 'YourMembership Markup data', SupportsWrite: true,
        Fields: [
            { Name: 'MarkupId', DisplayName: 'MarkupId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MarkupId' },
            { Name: 'MarkupData', DisplayName: 'MarkupData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MarkupData' },
            { Name: 'MarkupName', DisplayName: 'MarkupName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MarkupName' },
            { Name: 'MarkupType', DisplayName: 'MarkupType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MarkupType' },
            { Name: 'MarkupTypeName', DisplayName: 'MarkupTypeName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MarkupTypeName' },
            { Name: 'TargetClientId', DisplayName: 'TargetClientId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TargetClientId' },
            { Name: 'Template', DisplayName: 'Template', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Template' },
            { Name: 'MarkupClass', DisplayName: 'MarkupClass', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MarkupClass' },
            { Name: 'PageSize', DisplayName: 'PageSize', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PageSize' },
            { Name: 'PageNumber', DisplayName: 'PageNumber', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PageNumber' },
            { Name: 'CampaignId', DisplayName: 'CampaignId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CampaignId' },
            { Name: 'DateCreated', DisplayName: 'DateCreated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateCreated' },
            { Name: 'DateLastModified', DisplayName: 'DateLastModified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateLastModified' },
            { Name: 'AdminLastModified', DisplayName: 'AdminLastModified', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AdminLastModified' },
            { Name: 'MaxComponents', DisplayName: 'MaxComponents', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MaxComponents' },
            { Name: 'ClientID', DisplayName: 'ClientID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ClientID' },
            { Name: 'ResponseStatus', DisplayName: 'ResponseStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ResponseStatus' },
            { Name: 'BypassCache', DisplayName: 'BypassCache', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'BypassCache' },
            { Name: 'DateCached', DisplayName: 'DateCached', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateCached' },
            { Name: 'Device', DisplayName: 'Device', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Device' },
        ],
    },
    {
        Name: 'MarkupComponentTypes', DisplayName: 'MarkupComponentTypes',
        Description: 'YourMembership MarkupComponentTypes data', SupportsWrite: false,
        Fields: [
            { Name: 'ComponentType', DisplayName: 'ComponentType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ComponentType' },
            { Name: 'ComponentName', DisplayName: 'ComponentName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ComponentName' },
            { Name: 'IsAtRootColumn', DisplayName: 'IsAtRootColumn', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAtRootColumn' },
            { Name: 'CanHaveChildren', DisplayName: 'CanHaveChildren', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanHaveChildren' },
            { Name: 'OrderId', DisplayName: 'OrderId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'OrderId' },
            { Name: 'ButtonData', DisplayName: 'ButtonData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ButtonData' },
            { Name: 'ImageData', DisplayName: 'ImageData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ImageData' },
            { Name: 'DividerData', DisplayName: 'DividerData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DividerData' },
            { Name: 'TextData', DisplayName: 'TextData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TextData' },
            { Name: 'ContainerData', DisplayName: 'ContainerData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ContainerData' },
            { Name: 'PlainText', DisplayName: 'PlainText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PlainText' },
        ],
    },
    {
        Name: 'MarkupMacroComponents', DisplayName: 'MarkupMacroComponents',
        Description: 'YourMembership MarkupMacroComponents data', SupportsWrite: true,
        Fields: [
            { Name: 'MacroComponentId', DisplayName: 'MacroComponentId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MacroComponentId' },
            { Name: 'IsShared', DisplayName: 'IsShared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsShared' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'ComponentData', DisplayName: 'ComponentData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ComponentData' },
        ],
    },
    {
        Name: 'MediaGalleryAlbum', DisplayName: 'MediaGalleryAlbum',
        Description: 'YourMembership MediaGalleryAlbum data', SupportsWrite: false,
        Fields: [
            { Name: 'AlbumID', DisplayName: 'AlbumID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'AlbumID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'ImageURI', DisplayName: 'ImageURI', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ImageURI' },
        ],
    },
    {
        Name: 'MemberList', DisplayName: 'MemberList',
        Description: 'YourMembership MemberList data', SupportsWrite: false,
        Fields: [
            { Name: 'ProfileID', DisplayName: 'ProfileID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ProfileID' },
            { Name: 'IsMember', DisplayName: 'IsMember', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsMember' },
            { Name: 'ImportID', DisplayName: 'ImportID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ImportID' },
            { Name: 'Approved', DisplayName: 'Approved', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Approved' },
            { Name: 'Suspended', DisplayName: 'Suspended', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Suspended' },
            { Name: 'MasterID', DisplayName: 'MasterID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MasterID' },
            { Name: 'ApprovalDate', DisplayName: 'ApprovalDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ApprovalDate' },
            { Name: 'QueuedForDelete', DisplayName: 'QueuedForDelete', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'QueuedForDelete' },
            { Name: 'QueuedForDeleteDate', DisplayName: 'QueuedForDeleteDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'QueuedForDeleteDate' },
            { Name: 'MembershipEffectiveExpiresDate', DisplayName: 'MembershipEffectiveExpiresDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MembershipEffectiveExpiresDate' },
            { Name: 'EmailBounced', DisplayName: 'EmailBounced', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EmailBounced' },
            { Name: 'HasConsented', DisplayName: 'HasConsented', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HasConsented' },
            { Name: 'DateConsented', DisplayName: 'DateConsented', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateConsented' },
            { Name: 'ConsentIPAddress', DisplayName: 'ConsentIPAddress', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConsentIPAddress' },
            { Name: 'HasRevokedConsent', DisplayName: 'HasRevokedConsent', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HasRevokedConsent' },
            { Name: 'DateConsentRevoked', DisplayName: 'DateConsentRevoked', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateConsentRevoked' },
            { Name: 'MasterProfileID', DisplayName: 'MasterProfileID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MasterProfileID' },
            { Name: 'UserName', DisplayName: 'UserName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'UserName' },
            { Name: 'MembershipExpires', DisplayName: 'MembershipExpires', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MembershipExpires' },
            { Name: 'MembershipExpiresDate', DisplayName: 'MembershipExpiresDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MembershipExpiresDate' },
            { Name: 'SubordinateSeats', DisplayName: 'SubordinateSeats', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SubordinateSeats' },
            { Name: 'ConstituentID', DisplayName: 'ConstituentID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConstituentID' },
            { Name: 'MemberTypeCode', DisplayName: 'MemberTypeCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberTypeCode' },
            { Name: 'Registered', DisplayName: 'Registered', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Registered' },
            { Name: 'Membership', DisplayName: 'Membership', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership' },
            { Name: 'LastRenewalDate', DisplayName: 'LastRenewalDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastRenewalDate' },
            { Name: 'LastRenewalReminderSent', DisplayName: 'LastRenewalReminderSent', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastRenewalReminderSent' },
            { Name: 'PrimaryGroupCode', DisplayName: 'PrimaryGroupCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PrimaryGroupCode' },
            { Name: 'LastUpdated', DisplayName: 'LastUpdated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastUpdated' },
            { Name: 'Gender', DisplayName: 'Gender', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Gender' },
            { Name: 'Prefix', DisplayName: 'Prefix', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Prefix' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'MiddleName', DisplayName: 'MiddleName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MiddleName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'Suffix', DisplayName: 'Suffix', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Suffix' },
            { Name: 'NickName', DisplayName: 'NickName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NickName' },
            { Name: 'MaidenName', DisplayName: 'MaidenName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MaidenName' },
            { Name: 'SpouseName', DisplayName: 'SpouseName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SpouseName' },
            { Name: 'MaritalStatus', DisplayName: 'MaritalStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MaritalStatus' },
            { Name: 'AnniversaryDate', DisplayName: 'AnniversaryDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AnniversaryDate' },
            { Name: 'BirthdayDate', DisplayName: 'BirthdayDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'BirthdayDate' },
            { Name: 'HomeUrl', DisplayName: 'HomeUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeUrl' },
            { Name: 'HomeAddressLine1', DisplayName: 'HomeAddressLine1', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeAddressLine1' },
            { Name: 'HomeAddressLine2', DisplayName: 'HomeAddressLine2', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeAddressLine2' },
            { Name: 'HomeAddressCity', DisplayName: 'HomeAddressCity', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeAddressCity' },
            { Name: 'HomeAddressLocation', DisplayName: 'HomeAddressLocation', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeAddressLocation' },
            { Name: 'HomeAddressPostalCode', DisplayName: 'HomeAddressPostalCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeAddressPostalCode' },
            { Name: 'HomeAddressCountry', DisplayName: 'HomeAddressCountry', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeAddressCountry' },
            { Name: 'HomePhoneCountryCode', DisplayName: 'HomePhoneCountryCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomePhoneCountryCode' },
            { Name: 'HomePhoneAreaCode', DisplayName: 'HomePhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomePhoneAreaCode' },
            { Name: 'HomePhoneNumber', DisplayName: 'HomePhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomePhoneNumber' },
            { Name: 'HomeFaxNumber', DisplayName: 'HomeFaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeFaxNumber' },
            { Name: 'HomeFaxCountryCode', DisplayName: 'HomeFaxCountryCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeFaxCountryCode' },
            { Name: 'HomeFaxAreaCode', DisplayName: 'HomeFaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HomeFaxAreaCode' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'EmailAlt', DisplayName: 'EmailAlt', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EmailAlt' },
            { Name: 'HeadshotImageURI', DisplayName: 'HeadshotImageURI', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadshotImageURI' },
            { Name: 'EmployerName', DisplayName: 'EmployerName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'EmployerName' },
            { Name: 'SelfEmployed', DisplayName: 'SelfEmployed', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SelfEmployed' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'WorkType', DisplayName: 'WorkType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkType' },
            { Name: 'WorkUrl', DisplayName: 'WorkUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkUrl' },
            { Name: 'WorkAddressLine1', DisplayName: 'WorkAddressLine1', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkAddressLine1' },
            { Name: 'WorkAddressLine2', DisplayName: 'WorkAddressLine2', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkAddressLine2' },
            { Name: 'WorkAddressCity', DisplayName: 'WorkAddressCity', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkAddressCity' },
            { Name: 'WorkAddressLocation', DisplayName: 'WorkAddressLocation', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkAddressLocation' },
            { Name: 'WorkAddressPostalCode', DisplayName: 'WorkAddressPostalCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkAddressPostalCode' },
            { Name: 'WorkAddressCountry', DisplayName: 'WorkAddressCountry', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkAddressCountry' },
            { Name: 'WorkPhoneCountryCode', DisplayName: 'WorkPhoneCountryCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkPhoneCountryCode' },
            { Name: 'WorkPhoneNumber', DisplayName: 'WorkPhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkPhoneNumber' },
            { Name: 'WorkPhoneAreaCode', DisplayName: 'WorkPhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkPhoneAreaCode' },
            { Name: 'WorkFaxNumber', DisplayName: 'WorkFaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkFaxNumber' },
            { Name: 'WorkFaxAreaCode', DisplayName: 'WorkFaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkFaxAreaCode' },
            { Name: 'PersonalComments', DisplayName: 'PersonalComments', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PersonalComments' },
            { Name: 'AdditionalEdu', DisplayName: 'AdditionalEdu', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AdditionalEdu' },
            { Name: 'SocialOrgs', DisplayName: 'SocialOrgs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SocialOrgs' },
            { Name: 'PreferredAddressLatitude', DisplayName: 'PreferredAddressLatitude', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PreferredAddressLatitude' },
            { Name: 'PreferredAddressLongitude', DisplayName: 'PreferredAddressLongitude', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PreferredAddressLongitude' },
            { Name: 'MemberCustomFieldResponses', DisplayName: 'MemberCustomFieldResponses', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberCustomFieldResponses' },
        ],
    },
    {
        Name: 'MembersGroups', DisplayName: 'MembersGroups',
        Description: 'YourMembership MembersGroups data', SupportsWrite: false,
        Fields: [
            { Name: 'WebSiteMemberID', DisplayName: 'WebSiteMemberID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'WebSiteMemberID' },
            { Name: 'GroupCode', DisplayName: 'GroupCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GroupCode' },
            { Name: 'GroupName', DisplayName: 'GroupName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GroupName' },
            { Name: 'PrimaryGroup', DisplayName: 'PrimaryGroup', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PrimaryGroup' },
            { Name: 'GroupID', DisplayName: 'GroupID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GroupID' },
        ],
    },
    {
        Name: 'NetworkTypes', DisplayName: 'NetworkTypes',
        Description: 'YourMembership NetworkTypes data', SupportsWrite: false,
        Fields: [
            { Name: 'ServiceId', DisplayName: 'ServiceId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ServiceId' },
            { Name: 'NetworkName', DisplayName: 'NetworkName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NetworkName' },
            { Name: 'HelpText', DisplayName: 'HelpText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HelpText' },
        ],
    },
    {
        Name: 'Networks', DisplayName: 'Networks',
        Description: 'YourMembership Networks data', SupportsWrite: true,
        Fields: [
            { Name: 'LinkId', DisplayName: 'LinkId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'LinkId' },
            { Name: 'Url', DisplayName: 'Url', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Url' },
            { Name: 'NetworkName', DisplayName: 'NetworkName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NetworkName' },
            { Name: 'NetworkId', DisplayName: 'NetworkId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NetworkId' },
        ],
    },
    {
        Name: 'NetworksCloud', DisplayName: 'NetworksCloud',
        Description: 'YourMembership NetworksCloud data', SupportsWrite: false,
        Fields: [
            { Name: 'NetworkId', DisplayName: 'NetworkId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'NetworkId' },
            { Name: 'NetworkName', DisplayName: 'NetworkName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NetworkName' },
            { Name: 'Url', DisplayName: 'Url', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Url' },
            { Name: 'MemberCount', DisplayName: 'MemberCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberCount' },
            { Name: 'Density', DisplayName: 'Density', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Density' },
        ],
    },
    {
        Name: 'NotificationMacros', DisplayName: 'NotificationMacros',
        Description: 'YourMembership NotificationMacros data', SupportsWrite: false,
        Fields: [
            { Name: 'MacroId', DisplayName: 'MacroId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MacroId' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Macro', DisplayName: 'Macro', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Macro' },
            { Name: 'IsRequired', DisplayName: 'IsRequired', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsRequired' },
        ],
    },
    {
        Name: 'Notifications', DisplayName: 'Notifications',
        Description: 'YourMembership Notifications data', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'Id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Id' },
            { Name: 'Message', DisplayName: 'Message', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Message' },
            { Name: 'Headline', DisplayName: 'Headline', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Headline' },
            { Name: 'MemberId', DisplayName: 'MemberId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberId' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'HeadshotImage', DisplayName: 'HeadshotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadshotImage' },
            { Name: 'IsRead', DisplayName: 'IsRead', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsRead' },
            { Name: 'DateCreated', DisplayName: 'DateCreated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateCreated' },
            { Name: 'Category', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Category' },
            { Name: 'ActionType', DisplayName: 'ActionType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ActionType' },
            { Name: 'NavigateUrl', DisplayName: 'NavigateUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NavigateUrl' },
            { Name: 'PrimaryId', DisplayName: 'PrimaryId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PrimaryId' },
            { Name: 'PhotoUrl', DisplayName: 'PhotoUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoUrl' },
            { Name: 'PhotoUrlLarge', DisplayName: 'PhotoUrlLarge', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoUrlLarge' },
        ],
    },
    {
        Name: 'OAuthClientAppName', DisplayName: 'OAuthClientAppName',
        Description: 'YourMembership OAuthClientAppName data', SupportsWrite: true,
        Fields: [
            { Name: 'AppID', DisplayName: 'AppID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'AppID' },
            { Name: 'ClientAppID', DisplayName: 'ClientAppID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ClientAppID' },
            { Name: 'ClientAppSecret', DisplayName: 'ClientAppSecret', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ClientAppSecret' },
            { Name: 'AppName', DisplayName: 'AppName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AppName' },
            { Name: 'CompanyName', DisplayName: 'CompanyName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CompanyName' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'WebSiteUrl', DisplayName: 'WebSiteUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WebSiteUrl' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'ContactName', DisplayName: 'ContactName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ContactName' },
            { Name: 'ContactNumber', DisplayName: 'ContactNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ContactNumber' },
            { Name: 'IsActive', DisplayName: 'IsActive', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsActive' },
            { Name: 'ScopeApproved', DisplayName: 'ScopeApproved', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ScopeApproved' },
            { Name: 'LogoImage', DisplayName: 'LogoImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LogoImage' },
            { Name: 'Created', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Created' },
            { Name: 'Modified', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Modified' },
            { Name: 'Redirects', DisplayName: 'Redirects', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Redirects' },
            { Name: 'IsExternal', DisplayName: 'IsExternal', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsExternal' },
        ],
    },
    {
        Name: 'OAuthClientApps', DisplayName: 'OAuthClientApps',
        Description: 'YourMembership OAuthClientApps data', SupportsWrite: true,
        Fields: [
            { Name: 'AppID', DisplayName: 'AppID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'AppID' },
            { Name: 'ClientAppID', DisplayName: 'ClientAppID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ClientAppID' },
            { Name: 'ClientAppSecret', DisplayName: 'ClientAppSecret', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ClientAppSecret' },
            { Name: 'AppName', DisplayName: 'AppName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AppName' },
            { Name: 'CompanyName', DisplayName: 'CompanyName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CompanyName' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'WebSiteUrl', DisplayName: 'WebSiteUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WebSiteUrl' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'ContactName', DisplayName: 'ContactName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ContactName' },
            { Name: 'ContactNumber', DisplayName: 'ContactNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ContactNumber' },
            { Name: 'IsActive', DisplayName: 'IsActive', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsActive' },
            { Name: 'ScopeApproved', DisplayName: 'ScopeApproved', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ScopeApproved' },
            { Name: 'LogoImage', DisplayName: 'LogoImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LogoImage' },
            { Name: 'Created', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Created' },
            { Name: 'Modified', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Modified' },
            { Name: 'Redirects', DisplayName: 'Redirects', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Redirects' },
            { Name: 'IsExternal', DisplayName: 'IsExternal', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsExternal' },
        ],
    },
    {
        Name: 'OAuthScopes', DisplayName: 'OAuthScopes',
        Description: 'YourMembership OAuthScopes data', SupportsWrite: false,
        Fields: [
            { Name: 'ScopeID', DisplayName: 'ScopeID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ScopeID' },
            { Name: 'ScopeName', DisplayName: 'ScopeName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ScopeName' },
            { Name: 'DisplayName', DisplayName: 'DisplayName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DisplayName' },
            { Name: 'IsDefault', DisplayName: 'IsDefault', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsDefault' },
            { Name: 'GranularScope', DisplayName: 'GranularScope', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GranularScope' },
        ],
    },
    {
        Name: 'People', DisplayName: 'People',
        Description: 'YourMembership People data', SupportsWrite: true,
        Fields: [
            { Name: 'FieldCode', DisplayName: 'FieldCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FieldCode' },
            { Name: 'Fields', DisplayName: 'Fields', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fields' },
            { Name: 'Visibility', DisplayName: 'Visibility', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Visibility' },
            { Name: 'VisibilityInt', DisplayName: 'VisibilityInt', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'VisibilityInt' },
            { Name: 'Values', DisplayName: 'Values', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Values' },
            { Name: 'ValuesProxy', DisplayName: 'ValuesProxy', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ValuesProxy' },
            { Name: 'MetaValue', DisplayName: 'MetaValue', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MetaValue' },
            { Name: 'ClientID', DisplayName: 'ClientID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ClientID' },
        ],
    },
    {
        Name: 'Photos', DisplayName: 'Photos',
        Description: 'YourMembership Photos data', SupportsWrite: true,
        Fields: [
            { Name: 'CommentID', DisplayName: 'CommentID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'CommentID' },
            { Name: 'CdbID', DisplayName: 'CdbID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CdbID' },
            { Name: 'Posted', DisplayName: 'Posted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Posted' },
            { Name: 'PostedUTC', DisplayName: 'PostedUTC', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedUTC' },
            { Name: 'GalleryItemID', DisplayName: 'GalleryItemID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GalleryItemID' },
            { Name: 'SchoolID', DisplayName: 'SchoolID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SchoolID' },
            { Name: 'Comment', DisplayName: 'Comment', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Comment' },
            { Name: 'PostedBy', DisplayName: 'PostedBy', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedBy' },
            { Name: 'PostedByMugshot', DisplayName: 'PostedByMugshot', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedByMugshot' },
            { Name: 'PostedDate', DisplayName: 'PostedDate', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostedDate' },
            { Name: 'GroupID', DisplayName: 'GroupID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'GroupID' },
            { Name: 'IsOwner', DisplayName: 'IsOwner', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsOwner' },
            { Name: 'LikeID', DisplayName: 'LikeID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeID' },
            { Name: 'LikedComment', DisplayName: 'LikedComment', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikedComment' },
            { Name: 'LikeCount', DisplayName: 'LikeCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeCount' },
            { Name: 'SkipCrossPost', DisplayName: 'SkipCrossPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SkipCrossPost' },
        ],
    },
    {
        Name: 'PushNotificationsConfig', DisplayName: 'PushNotificationsConfig',
        Description: 'YourMembership PushNotificationsConfig data', SupportsWrite: true,
        Fields: [
            { Name: 'NotificationID', DisplayName: 'NotificationID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'NotificationID' },
            { Name: 'DisplayName', DisplayName: 'DisplayName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DisplayName' },
            { Name: 'Status', DisplayName: 'Status', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'SMSCampaignReports', DisplayName: 'SMSCampaignReports',
        Description: 'YourMembership SMSCampaignReports data', SupportsWrite: false,
        Fields: [
            { Name: 'TypeId', DisplayName: 'TypeId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'TypeId' },
            { Name: 'ActivityType', DisplayName: 'ActivityType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ActivityType' },
            { Name: 'Date', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date' },
        ],
    },
    {
        Name: 'SMSCampaignReports_Messages', DisplayName: 'SMSCampaignReports_Messages',
        Description: 'YourMembership SMSCampaignReports_Messages data', SupportsWrite: false,
        Fields: [
            { Name: 'MemberId', DisplayName: 'MemberId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MemberId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'Mobile', DisplayName: 'Mobile', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Mobile' },
            { Name: 'MessageId', DisplayName: 'MessageId', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MessageId' },
            { Name: 'Activity', DisplayName: 'Activity', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Activity' },
        ],
    },
    {
        Name: 'SavedSearches', DisplayName: 'SavedSearches',
        Description: 'YourMembership SavedSearches data', SupportsWrite: false,
        Fields: [
            { Name: 'SavedSearchId', DisplayName: 'SavedSearchId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'SavedSearchId' },
            { Name: 'SearchName', DisplayName: 'SearchName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchName' },
            { Name: 'SearchText', DisplayName: 'SearchText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchText' },
            { Name: 'SearchTextPrintSet', DisplayName: 'SearchTextPrintSet', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchTextPrintSet' },
            { Name: 'Shared', DisplayName: 'Shared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shared' },
            { Name: 'SearchType', DisplayName: 'SearchType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchType' },
            { Name: 'Version', DisplayName: 'Version', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Version' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'FilePath', DisplayName: 'FilePath', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FilePath' },
            { Name: 'CurrentVersion', DisplayName: 'CurrentVersion', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CurrentVersion' },
            { Name: 'AdminUserId', DisplayName: 'AdminUserId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AdminUserId' },
            { Name: 'ErrorCount', DisplayName: 'ErrorCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ErrorCount' },
            { Name: 'FullName', DisplayName: 'FullName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FullName' },
            { Name: 'SearchTermsHuman', DisplayName: 'SearchTermsHuman', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchTermsHuman' },
            { Name: 'SearchCategoryId', DisplayName: 'SearchCategoryId', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchCategoryId' },
            { Name: 'SearchNameFilter', DisplayName: 'SearchNameFilter', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchNameFilter' },
            { Name: 'SearchStatusProduct', DisplayName: 'SearchStatusProduct', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'SearchStatusProduct' },
        ],
    },
    {
        Name: 'Shares', DisplayName: 'Shares',
        Description: 'YourMembership Shares data', SupportsWrite: true,
        Fields: [
            { Name: 'ShareId', DisplayName: 'ShareId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ShareId' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'PhotoId', DisplayName: 'PhotoId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoId' },
            { Name: 'DateShared', DisplayName: 'DateShared', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DateShared' },
            { Name: 'ConnectionStatus', DisplayName: 'ConnectionStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionStatus' },
            { Name: 'ConnectionId', DisplayName: 'ConnectionId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'ConnectionName', DisplayName: 'ConnectionName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionName' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'MemberType', DisplayName: 'MemberType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberType' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Shared', DisplayName: 'Shared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shared' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'PhoneLabel', DisplayName: 'PhoneLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneLabel' },
            { Name: 'PhoneAreaCode', DisplayName: 'PhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneAreaCode' },
            { Name: 'PhoneNumber', DisplayName: 'PhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneNumber' },
            { Name: 'FaxLabel', DisplayName: 'FaxLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxLabel' },
            { Name: 'FaxAreaCode', DisplayName: 'FaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxAreaCode' },
            { Name: 'FaxNumber', DisplayName: 'FaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxNumber' },
            { Name: 'CanShow', DisplayName: 'CanShow', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShow' },
            { Name: 'intCategoryID', DisplayName: 'intCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intCategoryID' },
            { Name: 'IsAmbassador', DisplayName: 'IsAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassador' },
        ],
    },
    {
        Name: 'SponsorPosts', DisplayName: 'SponsorPosts',
        Description: 'YourMembership SponsorPosts data', SupportsWrite: false,
        Fields: [
            { Name: 'Sponsored', DisplayName: 'Sponsored', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sponsored' },
            { Name: 'MemberID', DisplayName: 'MemberID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MemberID' },
            { Name: 'PostText', DisplayName: 'PostText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostText' },
            { Name: 'PostHtml', DisplayName: 'PostHtml', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHtml' },
            { Name: 'AuthorId', DisplayName: 'AuthorId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorId' },
            { Name: 'WallOwnerId', DisplayName: 'WallOwnerId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerId' },
            { Name: 'AuthorName', DisplayName: 'AuthorName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorName' },
            { Name: 'WallOwnerName', DisplayName: 'WallOwnerName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerName' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'PostDate', DisplayName: 'PostDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostDate' },
            { Name: 'PostType', DisplayName: 'PostType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostType' },
            { Name: 'ShareCount', DisplayName: 'ShareCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ShareCount' },
            { Name: 'LikesCount', DisplayName: 'LikesCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikesCount' },
            { Name: 'LikedPost', DisplayName: 'LikedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikedPost' },
            { Name: 'LikeId', DisplayName: 'LikeId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeId' },
            { Name: 'CommentCount', DisplayName: 'CommentCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentCount' },
            { Name: 'CommenterCount', DisplayName: 'CommenterCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommenterCount' },
            { Name: 'PostHeadShotUrl', DisplayName: 'PostHeadShotUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadShotUrl' },
            { Name: 'CanReply', DisplayName: 'CanReply', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanReply' },
            { Name: 'CanShare', DisplayName: 'CanShare', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShare' },
            { Name: 'CanComment', DisplayName: 'CanComment', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanComment' },
            { Name: 'CanDelete', DisplayName: 'CanDelete', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanDelete' },
            { Name: 'RecentComments', DisplayName: 'RecentComments', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RecentComments' },
            { Name: 'CommentList', DisplayName: 'CommentList', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentList' },
            { Name: 'PostHeadline', DisplayName: 'PostHeadline', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadline' },
            { Name: 'TopLine', DisplayName: 'TopLine', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TopLine' },
            { Name: 'PostContentData', DisplayName: 'PostContentData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostContentData' },
            { Name: 'PhotoGallery', DisplayName: 'PhotoGallery', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoGallery' },
            { Name: 'IsAmbassadorPost', DisplayName: 'IsAmbassadorPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassadorPost' },
            { Name: 'IsActorAmbassador', DisplayName: 'IsActorAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsActorAmbassador' },
            { Name: 'IsSharedPost', DisplayName: 'IsSharedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsSharedPost' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'StoreProductExtractSelection', DisplayName: 'StoreProductExtractSelection',
        Description: 'YourMembership StoreProductExtractSelection data', SupportsWrite: false,
        Fields: [
            { Name: 'Product_ID', DisplayName: 'Product_ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product_ID' },
            { Name: 'Product_Code', DisplayName: 'Product_Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Product_Code' },
            { Name: 'Product_Name', DisplayName: 'Product_Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Product_Name' },
            { Name: 'Active', DisplayName: 'Active', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'Featured_Product', DisplayName: 'Featured_Product', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Featured_Product' },
            { Name: 'Primary_Category_ID', DisplayName: 'Primary_Category_ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Primary_Category_ID' },
            { Name: 'Primary_Category', DisplayName: 'Primary_Category', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Primary_Category' },
            { Name: 'Use_Inventory', DisplayName: 'Use_Inventory', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Use_Inventory' },
            { Name: 'Stock_Level', DisplayName: 'Stock_Level', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Stock_Level' },
            { Name: 'Low_Stock_Threshold', DisplayName: 'Low_Stock_Threshold', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Low_Stock_Threshold' },
            { Name: 'Allow_Back_Order', DisplayName: 'Allow_Back_Order', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Allow_Back_Order' },
            { Name: 'Number_Sold', DisplayName: 'Number_Sold', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number_Sold' },
            { Name: 'NonMember_Price', DisplayName: 'NonMember_Price', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'NonMember_Price' },
            { Name: 'Permalink', DisplayName: 'Permalink', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Permalink' },
            { Name: 'Is_Dowloadable', DisplayName: 'Is_Dowloadable', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Is_Dowloadable' },
            { Name: 'Download_Path', DisplayName: 'Download_Path', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Download_Path' },
            { Name: 'List_In_Store', DisplayName: 'List_In_Store', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List_In_Store' },
            { Name: 'Buy_From_Store', DisplayName: 'Buy_From_Store', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Buy_From_Store' },
            { Name: 'Is_Ticket', DisplayName: 'Is_Ticket', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Is_Ticket' },
            { Name: 'Is_Career_Post', DisplayName: 'Is_Career_Post', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Is_Career_Post' },
            { Name: 'Is_LMS_Course', DisplayName: 'Is_LMS_Course', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Is_LMS_Course' },
        ],
    },
    {
        Name: 'StoreProductSelection', DisplayName: 'StoreProductSelection',
        Description: 'YourMembership StoreProductSelection data', SupportsWrite: false,
        Fields: [
            { Name: 'aut_ProductId', DisplayName: 'aut_ProductId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'aut_ProductId' },
            { Name: 'txt_productName', DisplayName: 'txt_productName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'txt_productName' },
            { Name: 'intSequence', DisplayName: 'intSequence', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intSequence' },
            { Name: 'int_productActive', DisplayName: 'int_productActive', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'int_productActive' },
            { Name: 'bln_Featured', DisplayName: 'bln_Featured', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'bln_Featured' },
            { Name: 'blnDownloadable', DisplayName: 'blnDownloadable', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'blnDownloadable' },
            { Name: 'strDownloadPath', DisplayName: 'strDownloadPath', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'strDownloadPath' },
            { Name: 'blnAllowBackOrder', DisplayName: 'blnAllowBackOrder', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'blnAllowBackOrder' },
            { Name: 'intStockLevel', DisplayName: 'intStockLevel', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intStockLevel' },
            { Name: 'intLowStockThreshold', DisplayName: 'intLowStockThreshold', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intLowStockThreshold' },
            { Name: 'blnUseInventory', DisplayName: 'blnUseInventory', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'blnUseInventory' },
            { Name: 'intPrimaryCategoryID', DisplayName: 'intPrimaryCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intPrimaryCategoryID' },
            { Name: 'intCurrentCategoryID', DisplayName: 'intCurrentCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intCurrentCategoryID' },
            { Name: 'blnPrimaryCategory', DisplayName: 'blnPrimaryCategory', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'blnPrimaryCategory' },
            { Name: 'strPrimaryCategory', DisplayName: 'strPrimaryCategory', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'strPrimaryCategory' },
            { Name: 'blnFeaturedHere', DisplayName: 'blnFeaturedHere', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'blnFeaturedHere' },
            { Name: 'intPurchased', DisplayName: 'intPurchased', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intPurchased' },
            { Name: 'intReserved', DisplayName: 'intReserved', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intReserved' },
            { Name: 'intTotalRows', DisplayName: 'intTotalRows', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intTotalRows' },
        ],
    },
    {
        Name: 'Templates', DisplayName: 'Templates',
        Description: 'YourMembership Templates data', SupportsWrite: false,
        Fields: [
            { Name: 'type', DisplayName: 'type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'type' },
            { Name: 'id', DisplayName: 'id', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'id' },
            { Name: 'generated_template_id', DisplayName: 'generated_template_id', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'generated_template_id' },
            { Name: 'site_id', DisplayName: 'site_id', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'site_id' },
            { Name: 'partner_id', DisplayName: 'partner_id', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'partner_id' },
            { Name: 'questions', DisplayName: 'questions', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'questions' },
        ],
    },
    {
        Name: 'TopContributors', DisplayName: 'TopContributors',
        Description: 'YourMembership TopContributors data', SupportsWrite: false,
        Fields: [
            { Name: 'RankNumber', DisplayName: 'RankNumber', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RankNumber' },
            { Name: 'RankPercentage', DisplayName: 'RankPercentage', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RankPercentage' },
            { Name: 'RankBaseline', DisplayName: 'RankBaseline', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RankBaseline' },
            { Name: 'Score', DisplayName: 'Score', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Score' },
            { Name: 'PostCount', DisplayName: 'PostCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostCount' },
            { Name: 'CommentCount', DisplayName: 'CommentCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentCount' },
            { Name: 'LikeCount', DisplayName: 'LikeCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeCount' },
            { Name: 'LevelId', DisplayName: 'LevelId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'LevelId' },
            { Name: 'LevelName', DisplayName: 'LevelName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LevelName' },
            { Name: 'DisplayOptions', DisplayName: 'DisplayOptions', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'DisplayOptions' },
            { Name: 'ConnectionStatus', DisplayName: 'ConnectionStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionStatus' },
            { Name: 'ConnectionId', DisplayName: 'ConnectionId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'ConnectionName', DisplayName: 'ConnectionName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionName' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'MemberType', DisplayName: 'MemberType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberType' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Shared', DisplayName: 'Shared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shared' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'PhoneLabel', DisplayName: 'PhoneLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneLabel' },
            { Name: 'PhoneAreaCode', DisplayName: 'PhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneAreaCode' },
            { Name: 'PhoneNumber', DisplayName: 'PhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneNumber' },
            { Name: 'FaxLabel', DisplayName: 'FaxLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxLabel' },
            { Name: 'FaxAreaCode', DisplayName: 'FaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxAreaCode' },
            { Name: 'FaxNumber', DisplayName: 'FaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxNumber' },
            { Name: 'CanShow', DisplayName: 'CanShow', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShow' },
            { Name: 'intCategoryID', DisplayName: 'intCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intCategoryID' },
            { Name: 'IsAmbassador', DisplayName: 'IsAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassador' },
        ],
    },
    {
        Name: 'TrendingPosts', DisplayName: 'TrendingPosts',
        Description: 'YourMembership TrendingPosts data', SupportsWrite: false,
        Fields: [
            { Name: 'Sponsored', DisplayName: 'Sponsored', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sponsored' },
            { Name: 'MemberID', DisplayName: 'MemberID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'MemberID' },
            { Name: 'PostText', DisplayName: 'PostText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostText' },
            { Name: 'PostHtml', DisplayName: 'PostHtml', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHtml' },
            { Name: 'AuthorId', DisplayName: 'AuthorId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorId' },
            { Name: 'WallOwnerId', DisplayName: 'WallOwnerId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerId' },
            { Name: 'AuthorName', DisplayName: 'AuthorName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorName' },
            { Name: 'WallOwnerName', DisplayName: 'WallOwnerName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerName' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'PostDate', DisplayName: 'PostDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostDate' },
            { Name: 'PostType', DisplayName: 'PostType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostType' },
            { Name: 'ShareCount', DisplayName: 'ShareCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ShareCount' },
            { Name: 'LikesCount', DisplayName: 'LikesCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikesCount' },
            { Name: 'LikedPost', DisplayName: 'LikedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikedPost' },
            { Name: 'LikeId', DisplayName: 'LikeId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeId' },
            { Name: 'CommentCount', DisplayName: 'CommentCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentCount' },
            { Name: 'CommenterCount', DisplayName: 'CommenterCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommenterCount' },
            { Name: 'PostHeadShotUrl', DisplayName: 'PostHeadShotUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadShotUrl' },
            { Name: 'CanReply', DisplayName: 'CanReply', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanReply' },
            { Name: 'CanShare', DisplayName: 'CanShare', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShare' },
            { Name: 'CanComment', DisplayName: 'CanComment', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanComment' },
            { Name: 'CanDelete', DisplayName: 'CanDelete', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanDelete' },
            { Name: 'RecentComments', DisplayName: 'RecentComments', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RecentComments' },
            { Name: 'CommentList', DisplayName: 'CommentList', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentList' },
            { Name: 'PostHeadline', DisplayName: 'PostHeadline', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadline' },
            { Name: 'TopLine', DisplayName: 'TopLine', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TopLine' },
            { Name: 'PostContentData', DisplayName: 'PostContentData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostContentData' },
            { Name: 'PhotoGallery', DisplayName: 'PhotoGallery', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoGallery' },
            { Name: 'IsAmbassadorPost', DisplayName: 'IsAmbassadorPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassadorPost' },
            { Name: 'IsActorAmbassador', DisplayName: 'IsActorAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsActorAmbassador' },
            { Name: 'IsSharedPost', DisplayName: 'IsSharedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsSharedPost' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'WallComments', DisplayName: 'WallComments',
        Description: 'YourMembership WallComments data', SupportsWrite: true,
        Fields: [
            { Name: 'WallId', DisplayName: 'WallId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'WallId' },
            { Name: 'Sponsored', DisplayName: 'Sponsored', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sponsored' },
            { Name: 'MemberID', DisplayName: 'MemberID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberID' },
            { Name: 'PostText', DisplayName: 'PostText', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostText' },
            { Name: 'PostHtml', DisplayName: 'PostHtml', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHtml' },
            { Name: 'AuthorId', DisplayName: 'AuthorId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorId' },
            { Name: 'WallOwnerId', DisplayName: 'WallOwnerId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerId' },
            { Name: 'AuthorName', DisplayName: 'AuthorName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AuthorName' },
            { Name: 'WallOwnerName', DisplayName: 'WallOwnerName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WallOwnerName' },
            { Name: 'PostId', DisplayName: 'PostId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostId' },
            { Name: 'PostDate', DisplayName: 'PostDate', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostDate' },
            { Name: 'PostType', DisplayName: 'PostType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostType' },
            { Name: 'ShareCount', DisplayName: 'ShareCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ShareCount' },
            { Name: 'LikesCount', DisplayName: 'LikesCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikesCount' },
            { Name: 'LikedPost', DisplayName: 'LikedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikedPost' },
            { Name: 'LikeId', DisplayName: 'LikeId', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LikeId' },
            { Name: 'CommentCount', DisplayName: 'CommentCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentCount' },
            { Name: 'CommenterCount', DisplayName: 'CommenterCount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommenterCount' },
            { Name: 'PostHeadShotUrl', DisplayName: 'PostHeadShotUrl', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadShotUrl' },
            { Name: 'CanReply', DisplayName: 'CanReply', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanReply' },
            { Name: 'CanShare', DisplayName: 'CanShare', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShare' },
            { Name: 'CanComment', DisplayName: 'CanComment', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanComment' },
            { Name: 'CanDelete', DisplayName: 'CanDelete', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanDelete' },
            { Name: 'RecentComments', DisplayName: 'RecentComments', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'RecentComments' },
            { Name: 'CommentList', DisplayName: 'CommentList', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CommentList' },
            { Name: 'PostHeadline', DisplayName: 'PostHeadline', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostHeadline' },
            { Name: 'TopLine', DisplayName: 'TopLine', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'TopLine' },
            { Name: 'PostContentData', DisplayName: 'PostContentData', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PostContentData' },
            { Name: 'PhotoGallery', DisplayName: 'PhotoGallery', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhotoGallery' },
            { Name: 'IsAmbassadorPost', DisplayName: 'IsAmbassadorPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassadorPost' },
            { Name: 'IsActorAmbassador', DisplayName: 'IsActorAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsActorAmbassador' },
            { Name: 'IsSharedPost', DisplayName: 'IsSharedPost', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsSharedPost' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
        ],
    },
    {
        Name: 'WallComments_MemberList', DisplayName: 'WallComments_MemberList',
        Description: 'YourMembership WallComments_MemberList data', SupportsWrite: true,
        Fields: [
            { Name: 'ConnectionStatus', DisplayName: 'ConnectionStatus', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionStatus' },
            { Name: 'ConnectionId', DisplayName: 'ConnectionId', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'ConnectionId' },
            { Name: 'FirstName', DisplayName: 'FirstName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FirstName' },
            { Name: 'LastName', DisplayName: 'LastName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'LastName' },
            { Name: 'ConnectionName', DisplayName: 'ConnectionName', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ConnectionName' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization' },
            { Name: 'HeadShotImage', DisplayName: 'HeadShotImage', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'HeadShotImage' },
            { Name: 'WorkTitle', DisplayName: 'WorkTitle', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'WorkTitle' },
            { Name: 'MemberType', DisplayName: 'MemberType', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'MemberType' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Shared', DisplayName: 'Shared', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Shared' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'PhoneLabel', DisplayName: 'PhoneLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneLabel' },
            { Name: 'PhoneAreaCode', DisplayName: 'PhoneAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneAreaCode' },
            { Name: 'PhoneNumber', DisplayName: 'PhoneNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PhoneNumber' },
            { Name: 'FaxLabel', DisplayName: 'FaxLabel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxLabel' },
            { Name: 'FaxAreaCode', DisplayName: 'FaxAreaCode', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxAreaCode' },
            { Name: 'FaxNumber', DisplayName: 'FaxNumber', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FaxNumber' },
            { Name: 'CanShow', DisplayName: 'CanShow', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'CanShow' },
            { Name: 'intCategoryID', DisplayName: 'intCategoryID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'intCategoryID' },
            { Name: 'IsAmbassador', DisplayName: 'IsAmbassador', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'IsAmbassador' },
        ],
    },
    {
        Name: 'WebScraper', DisplayName: 'WebScraper',
        Description: 'YourMembership WebScraper data', SupportsWrite: true,
        Fields: [
            { Name: 'Src', DisplayName: 'Src', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Src' },
            { Name: 'Width', DisplayName: 'Width', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Width' },
            { Name: 'Height', DisplayName: 'Height', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Height' },
            { Name: 'AutoFit', DisplayName: 'AutoFit', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'AutoFit' },
            { Name: 'Index', DisplayName: 'Index', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Index' },
            { Name: 'Token', DisplayName: 'Token', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Token' },
            { Name: 'OriginalSrc', DisplayName: 'OriginalSrc', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'OriginalSrc' },
        ],
    },
];



@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends BaseRESTIntegrationConnector {
    /** Session cache keyed by ClientID */
    private sessionCache = new Map<string, YMSession>();

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'YourMembership'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return YM_ACTION_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-id-card';
        config.CategoryDescription = 'YourMembership AMS integration for managing members, events, dues, and association data';
        config.ParentCategoryName = 'Business Apps';
        // YM is read-only but we still want Search/List for querying
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Schema Discovery (from static TS definitions) ───────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return YM_ACTION_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: true,
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    /**
     * Discovers fields by fetching one record from the live YM API endpoint and
     * inferring field names/types from the response. Static metadata from
     * YM_ACTION_OBJECTS is merged in to preserve PK, FK, description, and
     * IsRequired/IsReadOnly annotations.
     *
     * Falls back to the static array if the live API call fails.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticObj = YM_ACTION_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());

        try {
            const liveFields = await this.DiscoverFieldsFromLiveAPI(companyIntegration, objectName, contextUser);
            if (liveFields.length > 0) {
                return this.MergeFieldsWithStaticMetadata(liveFields, staticObj);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[YM] Live field discovery failed for "${objectName}", falling back to static: ${msg}`);
        }

        // Fallback: return static fields
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

    /**
     * Fetches one record from the YM API for the given object and infers field schemas.
     */
    private async DiscoverFieldsFromLiveAPI(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser?: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as YMAuthContext;
        const headers = this.BuildHeaders(auth);

        // Map object names to their YM API endpoints
        const endpointMap: Record<string, { path: string; dataKey: string | null }> = {
            members:       { path: 'MemberList', dataKey: 'Members' },
            membertypes:   { path: 'MemberTypes', dataKey: 'MemberTypes' },
            memberships:   { path: 'Memberships', dataKey: 'Memberships' },
            events:        { path: 'Events', dataKey: 'Events' },
            products:      { path: 'Products', dataKey: null },
            invoices:      { path: 'Invoices', dataKey: 'Invoices' },
            donations:     { path: 'Donations', dataKey: 'Donations' },
            orders:        { path: 'Orders', dataKey: 'Orders' },
            groups:        { path: 'Groups', dataKey: 'GroupTypeList' },
            grouptypes:    { path: 'Groups', dataKey: 'GroupTypeList' },
            engagementscores: { path: 'EngagementScores', dataKey: null },
        };

        const mapping = endpointMap[objectName.toLowerCase()];
        if (!mapping) {
            console.warn(`[YM] No API endpoint mapping for "${objectName}", skipping live discovery`);
            return [];
        }

        const url = `${YM_API_BASE}/Ams/${auth.Config.ClientID}/${mapping.path}?PageSize=1`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

        if (response.Status < 200 || response.Status >= 300) return [];

        const body = response.Body as Record<string, unknown>;
        const sampleRecord = this.ExtractSampleRecord(body, mapping.dataKey);
        if (!sampleRecord) return [];

        return this.InferFieldsFromRecord(sampleRecord);
    }

    /**
     * Extracts a single sample record from the YM API response body.
     */
    private ExtractSampleRecord(
        body: Record<string, unknown>,
        dataKey: string | null
    ): Record<string, unknown> | null {
        if (dataKey != null) {
            const data = body[dataKey];
            if (Array.isArray(data) && data.length > 0) {
                return data[0] as Record<string, unknown>;
            }
            return null;
        }

        // Null dataKey: raw array or single object
        if (Array.isArray(body) && body.length > 0) {
            return body[0] as Record<string, unknown>;
        }

        // Single object response — filter metadata keys and use as sample
        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
            if (!METADATA_KEYS.has(key)) {
                filtered[key] = value;
            }
        }
        return Object.keys(filtered).length > 0 ? filtered : null;
    }

    /**
     * Infers ExternalFieldSchema[] from a sample record's keys and values.
     */
    private InferFieldsFromRecord(record: Record<string, unknown>): ExternalFieldSchema[] {
        const fields: ExternalFieldSchema[] = [];
        for (const [key, value] of Object.entries(record)) {
            // Skip nested objects/arrays — only flat scalar fields
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) continue;
            if (Array.isArray(value)) continue;

            fields.push({
                Name: key,
                Label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '),
                Description: undefined,
                DataType: this.InferFieldType(value),
                IsRequired: false,
                IsUniqueKey: false,
                IsReadOnly: false,
            });
        }
        return fields;
    }

    /**
     * Infer a MJ-compatible type string from a JavaScript value.
     */
    private InferFieldType(value: unknown): string {
        if (value === null || value === undefined) return 'string';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'decimal';
        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime';
            return 'string';
        }
        return 'string';
    }

    /**
     * Merges live-discovered fields with static metadata from YM_ACTION_OBJECTS.
     * Live fields are the base; static metadata overlays PK, FK, Description,
     * IsRequired, and IsReadOnly where a matching field name exists.
     */
    private MergeFieldsWithStaticMetadata(
        liveFields: ExternalFieldSchema[],
        staticObj: IntegrationObjectInfo | undefined
    ): ExternalFieldSchema[] {
        if (!staticObj) return liveFields;

        const staticMap = new Map(
            staticObj.Fields.map(f => [f.Name.toLowerCase(), f])
        );

        const merged = liveFields.map(lf => {
            const sf = staticMap.get(lf.Name.toLowerCase());
            if (sf) {
                return {
                    ...lf,
                    Label: sf.DisplayName || lf.Label,
                    Description: sf.Description || lf.Description,
                    IsRequired: sf.IsRequired,
                    IsUniqueKey: sf.IsPrimaryKey,
                    IsReadOnly: sf.IsReadOnly,
                };
            }
            return lf;
        });

        // Add any static fields not found in the live response (e.g., computed fields)
        for (const sf of staticObj.Fields) {
            if (!merged.some(f => f.Name.toLowerCase() === sf.Name.toLowerCase())) {
                merged.push({
                    Name: sf.Name,
                    Label: sf.DisplayName,
                    Description: sf.Description,
                    DataType: sf.Type,
                    IsRequired: sf.IsRequired,
                    IsUniqueKey: sf.IsPrimaryKey,
                    IsReadOnly: sf.IsReadOnly,
                });
            }
        }

        return merged;
    }

    /**
     * Override IntrospectSchema to use live field discovery (with static fallback).
     * Ensures DDL generation always reflects the actual API response shape.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const objects = await this.DiscoverObjects(companyIntegration, contextUser);
        const result: SourceSchemaInfo = { Objects: [] };

        for (const obj of objects) {
            const fields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);
            const sourceFields: SourceFieldInfo[] = fields.map(f => ({
                Name: f.Name,
                Label: f.Label ?? f.Name,
                Description: f.Description,
                SourceType: f.DataType,
                IsRequired: f.IsRequired ?? false,
                IsPrimaryKey: f.IsUniqueKey ?? false,
                IsForeignKey: false,
                ForeignKeyTarget: null,
                MaxLength: null,
                Precision: null,
                Scale: null,
                DefaultValue: null,
            }));

            result.Objects.push({
                ExternalName: obj.Name,
                ExternalLabel: obj.Label ?? obj.Name,
                Description: obj.Description,
                Fields: sourceFields,
                PrimaryKeyFields: sourceFields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                Relationships: [],
            });
        }

        return result;
    }


    /** Resolved config (populated after first Authenticate call) */
    private _config: YMConnectionConfig | null = null;

    /** Current adaptive request interval — increases on 429, recovers toward resolved MIN */
    private currentRequestIntervalMs = MIN_REQUEST_INTERVAL_MS;

    // ── Per-instance config accessors (fall back to module-level defaults) ──
    private get effectiveMaxRetries(): number { return this._config?.MaxRetries ?? MAX_RETRIES; }
    private get effectiveRequestTimeoutMs(): number { return this._config?.RequestTimeoutMs ?? REQUEST_TIMEOUT_MS; }
    private get effectiveMinRequestIntervalMs(): number { return this._config?.MinRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS; }
    private get effectiveEnrichBatchSize(): number { return this._config?.EnrichBatchSize ?? ENRICH_BATCH_SIZE; }
    private get effectiveJsonTimeoutMs(): number { return this._config?.JsonTimeoutMs ?? JSON_TIMEOUT_MS; }
    private get effectiveEnrichTimeoutMs(): number { return this._config?.EnrichTimeoutMs ?? ENRICH_TIMEOUT_MS; }

    /** Cache of the filtered member list pending enrichment, shared across batch calls */
    private memberFetchCache: {
        changedRecords: ExternalRecord[];
        newWatermark: string | null;
    } | null = null;

    // ─── Abstract method implementations (BaseRESTIntegrationConnector) ──

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        console.log(`[YM] Authenticating...`);
        const config = await this.ParseConfig(companyIntegration, contextUser);
        this._config = config;
        this.currentRequestIntervalMs = this.effectiveMinRequestIntervalMs;
        const sessionId = await this.GetSession(config);
        console.log(`[YM] Authenticated, sessionId length: ${sessionId.length}`);
        const auth: YMAuthContext = { SessionID: sessionId, Config: config };
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return { 'X-SS-ID': auth.SessionID!, 'Accept': 'application/json' };
    }

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const ymAuth = auth as YMAuthContext;
        const currentHeaders = { ...headers };
        if (body !== undefined && !currentHeaders['Content-Type']) {
            currentHeaders['Content-Type'] = 'application/json';
        }

        // Throttle: ensure adaptive minimum interval between requests
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < this.currentRequestIntervalMs) {
            await this.Sleep(this.currentRequestIntervalMs - elapsed);
        }

        const maxRetries = this.effectiveMaxRetries;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let response: Response;
            try {
                response = await this.FetchWithTimeout(url, method, currentHeaders, body);
            } catch (err) {
                if (this.IsTimeoutError(err)) {
                    console.warn(`YM timeout on ${url}, re-authenticating (attempt ${attempt + 1}/${maxRetries})`);
                    await this.RefreshSession(ymAuth, currentHeaders);
                    continue;
                }
                throw err;
            }

            if (response.status === 401) {
                await this.RefreshSession(ymAuth, currentHeaders);
                continue;
            }

            if (response.status === 429) {
                const delayMs = this.CalculateRetryDelay(response, attempt);
                this.currentRequestIntervalMs = Math.min(this.currentRequestIntervalMs * 2, 10000);
                console.warn(`YM rate limited (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries}). Interval adjusted to ${this.currentRequestIntervalMs}ms`);
                await this.Sleep(delayMs);
                continue;
            }

            this.lastRequestTime = Date.now();
            // Gradually recover interval toward configured minimum on successful requests
            const minInterval = this.effectiveMinRequestIntervalMs;
            if (this.currentRequestIntervalMs > minInterval) {
                this.currentRequestIntervalMs = Math.max(
                    this.currentRequestIntervalMs - 50,
                    minInterval
                );
            }
            const responseBody = await this.JsonWithTimeout(response, this.effectiveJsonTimeoutMs);
            return this.BuildRESTResponse(response, responseBody);
        }

        throw new Error(`YM API request failed after ${maxRetries} retries: ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        // Check for YM API-level errors in the response envelope
        if (typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)) {
            this.CheckResponseError(rawBody as Record<string, unknown>);
        }

        let records: Record<string, unknown>[];

        if (responseDataKey != null) {
            const body = rawBody as Record<string, unknown>;
            const data = body[responseDataKey];
            if (!data || !Array.isArray(data)) return [];
            records = data as Record<string, unknown>[];
        } else if (Array.isArray(rawBody)) {
            // Null responseDataKey: raw array (Products)
            records = rawBody as Record<string, unknown>[];
        } else {
            // Single object response — filter metadata and wrap in array
            records = [this.FilterMetadataKeys(rawBody as Record<string, unknown>)];
        }

        // Sanitize invalid date values: empty strings and DateTime.MinValue → null
        return records.map(r => this.SanitizeDateFields(r));
    }

    /**
     * Converts empty strings and DateTime.MinValue (0001-01-01) in date-like fields to null.
     * YM API returns "" and "0001-01-01T00:00:00" instead of null for empty date fields,
     * which causes DATETIMEOFFSET columns to reject the value.
     */
    private SanitizeDateFields(record: Record<string, unknown>): Record<string, unknown> {
        for (const [key, value] of Object.entries(record)) {
            if (typeof value !== 'string') continue;

            // Empty string → null for any field
            if (value === '') {
                record[key] = null;
                continue;
            }

            // DateTime.MinValue patterns → null
            if (value.startsWith('0001-01-01') || value.startsWith('0001/01/01')) {
                record[key] = null;
            }
        }
        return record;
    }

    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType === 'None') {
            return { HasMore: false };
        }

        // YM API doesn't return total counts; infer from record count
        const recordCount = this.EstimateRecordCount(rawBody);
        const hasMore = recordCount >= pageSize;

        return {
            HasMore: hasMore,
            NextPage: paginationType === 'PageNumber' ? currentPage + 1 : undefined,
            NextOffset: paginationType === 'Offset' ? currentOffset + recordCount : undefined,
        };
    }

    protected GetBaseURL(companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const ymAuth = auth as YMAuthContext;
        if (ymAuth.Config?.ClientID) {
            return `${YM_API_BASE}/Ams/${ymAuth.Config.ClientID}`;
        }
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
            if (clientId) return `${YM_API_BASE}/Ams/${clientId}`;
        }
        throw new Error('Cannot determine YM base URL: no ClientID in configuration');
    }

    // ─── YM-specific pagination parameter names ───────────────────────

    /**
     * Overrides base pagination URL building to use YM's expected parameter names:
     * - PageNumber type: `PageNumber` / `PageSize` (not `page` / `pageSize`)
     * - Offset type: `OffSet` (not `offset`); no explicit limit param — YM uses
     *   its own default batch size (~200 records)
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        offset: number,
        cursor?: string
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';

        switch (obj.PaginationType) {
            case 'PageNumber':
                return `${basePath}${separator}PageNumber=${page}&PageSize=${obj.DefaultPageSize}`;
            case 'Offset':
                return `${basePath}${separator}OffSet=${offset}&PageSize=${obj.DefaultPageSize}`;
            case 'Cursor':
                return cursor
                    ? `${basePath}${separator}cursor=${encodeURIComponent(cursor)}&limit=${obj.DefaultPageSize}`
                    : `${basePath}${separator}limit=${obj.DefaultPageSize}`;
            default:
                return basePath;
        }
    }

    // ─── FetchChanges override for YM-specific cases ──────────────────

    /**
     * Overrides base FetchChanges to handle YM-specific edge cases:
     * - Groups/GroupTypes: nested GroupTypeList response needs custom flattening
     * - Members: client-side watermark filtering + batched detail enrichment
     *
     * The MemberList API returns all members every time (no server-side date filter),
     * but each record includes a `LastUpdated` field. We pull the full list once,
     * filter to only records changed since the watermark, cache that filtered list,
     * and enrich + return ENRICH_BATCH_SIZE records per FetchChanges call so the
     * engine writes each batch to the database before moving to the next.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        console.log(`[YM] FetchChanges called for '${ctx.ObjectName}' (batchSize=${ctx.BatchSize}, watermark=${ctx.WatermarkValue ?? 'none'}, offset=${ctx.CurrentOffset ?? 'none'})`);

        const objLower = ctx.ObjectName.toLowerCase();
        if (objLower === 'groups' || objLower === 'grouptypes') {
            return this.FetchGroups(ctx);
        }

        if (objLower === 'members') {
            return this.FetchMemberBatch(ctx);
        }

        return super.FetchChanges(ctx);
    }

    /**
     * Fetches and enriches members in batches of ENRICH_BATCH_SIZE.
     *
     * On the first call (CurrentOffset = 0 or undefined), fetches the full member
     * list via the base class, filters by watermark, and caches the result.
     * On subsequent calls, uses the cached list and enriches the next slice.
     * Returns HasMore=true until all records are enriched.
     * Only sets NewWatermarkValue on the final batch so the watermark is only
     * updated once all records have been written to the database.
     */
    private async FetchMemberBatch(ctx: FetchContext): Promise<FetchBatchResult> {
        // Simple approach: fetch one page of member IDs, enrich them, return.
        // The engine's outer loop handles pagination — it calls FetchChanges
        // repeatedly with incrementing offsets until HasMore=false.
        const pageResult = await super.FetchChanges(ctx);

        if (pageResult.Records.length === 0) {
            return pageResult;
        }

        console.log(`[YM Members] Fetched ${pageResult.Records.length} member IDs, enriching...`);

        // Enrich FIRST — the raw member list doesn't have LastUpdated,
        // only the detail API returns it. We need it for watermark computation.
        const enriched = await this.EnrichMembersWithDetails(
            ctx, pageResult.Records, ctx.CurrentOffset ?? 0, pageResult.Records.length
        );

        // Now filter by watermark using the enriched records (which have LastUpdated)
        const { changedRecords, newWatermark } = this.FilterByWatermark(
            enriched, ctx.WatermarkValue, 'LastUpdated'
        );

        if (changedRecords.length === 0) {
            return {
                Records: [],
                HasMore: pageResult.HasMore,
                NextOffset: pageResult.NextOffset,
                NextPage: pageResult.NextPage,
                NextCursor: pageResult.NextCursor,
                NewWatermarkValue: !pageResult.HasMore ? newWatermark : undefined,
            };
        }

        console.log(`[YM Members] ${changedRecords.length}/${enriched.length} changed since watermark`);

        return {
            Records: changedRecords,
            HasMore: pageResult.HasMore,
            NextOffset: pageResult.NextOffset,
            NextPage: pageResult.NextPage,
            NextCursor: pageResult.NextCursor,
            NewWatermarkValue: !pageResult.HasMore ? newWatermark : undefined,
        };
    }

    /**
     * Filters records by comparing a date field against a watermark timestamp.
     * Returns only records where the date field is newer than the watermark,
     * plus the latest date value seen (to use as the next watermark).
     */
    private FilterByWatermark(
        records: ExternalRecord[],
        watermarkValue: string | null,
        dateFieldName: string
    ): { changedRecords: ExternalRecord[]; newWatermark: string | null } {
        let latestDate: Date | null = null;
        const watermarkDate = watermarkValue ? new Date(watermarkValue) : null;

        const changed: ExternalRecord[] = [];

        for (const record of records) {
            const dateValue = record.Fields[dateFieldName];
            if (dateValue == null) {
                // No date field — include record (can't determine if changed)
                changed.push(record);
                continue;
            }

            const recordDate = new Date(String(dateValue));
            if (isNaN(recordDate.getTime())) {
                changed.push(record);
                continue;
            }

            // Track the latest date for the new watermark
            if (!latestDate || recordDate > latestDate) {
                latestDate = recordDate;
            }

            // Include if no watermark or record is newer than watermark
            if (!watermarkDate || recordDate > watermarkDate) {
                changed.push(record);
            }
        }

        const newWatermark = latestDate ? latestDate.toISOString() : null;
        return { changedRecords: changed, newWatermark };
    }

    // ─── CRUD Operations ────────────────────────────────────────────

    /**
     * Creates a new record in YourMembership via POST /Ams/{ClientID}/{ObjectName}.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const sessionId = await this.GetSession(config);
        const auth: YMAuthContext = { SessionID: sessionId, Config: config };
        const headers = this.BuildHeaders(auth);
        const url = `${YM_API_BASE}/Ams/${config.ClientID}/${ctx.ObjectName}`;

        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);

        if (response.Status >= 200 && response.Status < 300) {
            const created = response.Body as Record<string, unknown>;
            return {
                Success: true,
                ExternalID: String(created['Id'] ?? created['ID'] ?? created['ProfileID'] ?? ''),
                StatusCode: response.Status,
            };
        }

        return this.BuildYMCRUDErrorResult(response, 'CreateRecord', ctx.ObjectName);
    }

    /**
     * Updates an existing record in YourMembership via PUT /Ams/{ClientID}/{ObjectName}/{Id}.
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const sessionId = await this.GetSession(config);
        const auth: YMAuthContext = { SessionID: sessionId, Config: config };
        const headers = this.BuildHeaders(auth);
        const url = `${YM_API_BASE}/Ams/${config.ClientID}/${ctx.ObjectName}/${ctx.ExternalID}`;

        const response = await this.MakeHTTPRequest(auth, url, 'PUT', headers, ctx.Attributes);

        if (response.Status >= 200 && response.Status < 300) {
            const updated = response.Body as Record<string, unknown>;
            return {
                Success: true,
                ExternalID: String(updated['Id'] ?? updated['ID'] ?? ctx.ExternalID),
                StatusCode: response.Status,
            };
        }

        return this.BuildYMCRUDErrorResult(response, 'UpdateRecord', ctx.ObjectName);
    }

    /**
     * Deletes a record in YourMembership via DELETE /Ams/{ClientID}/{ObjectName}/{Id}.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const sessionId = await this.GetSession(config);
        const auth: YMAuthContext = { SessionID: sessionId, Config: config };
        const headers = this.BuildHeaders(auth);
        const url = `${YM_API_BASE}/Ams/${config.ClientID}/${ctx.ObjectName}/${ctx.ExternalID}`;

        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);

        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return {
                Success: true,
                ExternalID: ctx.ExternalID,
                StatusCode: response.Status,
            };
        }

        return this.BuildYMCRUDErrorResult(response, 'DeleteRecord', ctx.ObjectName);
    }

    /** Builds a standardized error CRUDResult from a failed YM response. */
    private BuildYMCRUDErrorResult(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const bodyObj = response.Body as Record<string, unknown> | undefined;
        const rs = bodyObj?.['ResponseStatus'] as Record<string, unknown> | undefined;
        const message = rs?.['Message']
            ? String(rs['Message'])
            : `[YM] ${operation} on ${objectName} failed (HTTP ${response.Status})`;
        return {
            Success: false,
            ErrorMessage: message,
            StatusCode: response.Status,
        };
    }

    // ─── TestConnection ─────────────────────────────────────────────

    /** Tests connectivity by authenticating and fetching ClientConfig. */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            const sessionId = await this.GetSession(config);
            const auth: YMAuthContext = { SessionID: sessionId, Config: config };
            const json = await this.MakeYMRequest(auth, 'ClientConfig');
            const siteUrl = (json['SiteUrl'] as string) ?? 'Unknown';

            return {
                Success: true,
                Message: `Connected to YourMembership site: ${siteUrl}`,
                ServerVersion: `ClientID ${config.ClientID}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Default configurations ──────────────────────────────────────

    /** Returns suggested default configuration for YM integration setup. */
    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'YourMembership',
            DefaultObjects: [], // Objects are auto-discovered from metadata via DiscoverObjects
        };
    }

    /** Returns suggested default field mappings for common YM objects to MJ entities. */
    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Members':
                return [
                    { SourceFieldName: 'EmailAddr', DestinationFieldName: 'Email', IsKeyField: true },
                    { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'Organization', DestinationFieldName: 'CompanyName' },
                    { SourceFieldName: 'MemberTypeCode', DestinationFieldName: 'Status' },
                ];
            case 'Events':
                return [
                    { SourceFieldName: 'EventId', DestinationFieldName: 'ID', IsKeyField: true },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                    { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
                ];
            case 'InvoiceItems':
                return [
                    { SourceFieldName: 'LineItemID', DestinationFieldName: 'LineItemID', IsKeyField: true },
                    { SourceFieldName: 'InvoiceNo', DestinationFieldName: 'InvoiceNo' },
                    { SourceFieldName: 'InvoiceType', DestinationFieldName: 'InvoiceType' },
                    { SourceFieldName: 'WebSiteMemberID', DestinationFieldName: 'WebSiteMemberID' },
                    { SourceFieldName: 'LineItemDescription', DestinationFieldName: 'Description' },
                    { SourceFieldName: 'LineItemAmount', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'LineItemDate', DestinationFieldName: 'Date' },
                ];
            case 'DuesTransactions':
                return [
                    { SourceFieldName: 'TransactionID', DestinationFieldName: 'TransactionID', IsKeyField: true },
                    { SourceFieldName: 'WebsiteMemberID', DestinationFieldName: 'WebsiteMemberID' },
                    { SourceFieldName: 'Status', DestinationFieldName: 'Status' },
                    { SourceFieldName: 'Amount', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'MembershipRequested', DestinationFieldName: 'MembershipRequested' },
                    { SourceFieldName: 'DateSubmitted', DestinationFieldName: 'DateSubmitted' },
                ];
            case 'EventRegistrations':
                return [
                    { SourceFieldName: 'Id', DestinationFieldName: 'Id', IsKeyField: true },
                    { SourceFieldName: 'EventId', DestinationFieldName: 'EventId' },
                    { SourceFieldName: 'RegistrationID', DestinationFieldName: 'RegistrationID' },
                    { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'DisplayName', DestinationFieldName: 'DisplayName' },
                    { SourceFieldName: 'HeadShotImage', DestinationFieldName: 'HeadShotImage' },
                    { SourceFieldName: 'DateRegistered', DestinationFieldName: 'DateRegistered' },
                    { SourceFieldName: 'IsPrimary', DestinationFieldName: 'IsPrimary' },
                    { SourceFieldName: 'BadgeNumber', DestinationFieldName: 'BadgeNumber' },
                ];
            case 'EventSessions':
                return [
                    { SourceFieldName: 'SessionId', DestinationFieldName: 'SessionId', IsKeyField: true },
                    { SourceFieldName: 'EventId', DestinationFieldName: 'EventId' },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'Presenter', DestinationFieldName: 'Presenter' },
                    { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                    { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
                ];
            case 'StoreOrderDetails':
                return [
                    { SourceFieldName: 'OrderDetailID', DestinationFieldName: 'OrderDetailID', IsKeyField: true },
                    { SourceFieldName: 'OrderID', DestinationFieldName: 'OrderID' },
                    { SourceFieldName: 'WebsiteMemberID', DestinationFieldName: 'WebsiteMemberID' },
                    { SourceFieldName: 'ProductName', DestinationFieldName: 'ProductName' },
                    { SourceFieldName: 'Quantity', DestinationFieldName: 'Quantity' },
                    { SourceFieldName: 'TotalPrice', DestinationFieldName: 'TotalPrice' },
                ];
            case 'DonationHistory':
                return [
                    { SourceFieldName: 'intDonationId', DestinationFieldName: 'DonationId', IsKeyField: true },
                    { SourceFieldName: 'ProfileID', DestinationFieldName: 'ProfileID' },
                    { SourceFieldName: 'dblDonation', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'strFundName', DestinationFieldName: 'FundName' },
                    { SourceFieldName: 'DatDonation', DestinationFieldName: 'DonationDate' },
                    { SourceFieldName: 'strStatus', DestinationFieldName: 'Status' },
                ];
            case 'CareerOpenings':
                return [
                    { SourceFieldName: 'CareerOpeningID', DestinationFieldName: 'CareerOpeningID', IsKeyField: true },
                    { SourceFieldName: 'Position', DestinationFieldName: 'Position' },
                    { SourceFieldName: 'Organization', DestinationFieldName: 'Organization' },
                    { SourceFieldName: 'DatePosted', DestinationFieldName: 'DatePosted' },
                ];
            default:
                return [];
        }
    }

    // ─── Groups special handling ─────────────────────────────────────

    /**
     * Fetches Groups or GroupTypes, which have a nested structure:
     * GroupTypeList → Groups. When objectName is 'GroupTypes', returns just
     * the type entries. When 'Groups', flattens into individual group records.
     */
    private async FetchGroups(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as YMAuthContext;
        const json = await this.MakeYMRequest(auth, 'Groups');
        const typeList = json['GroupTypeList'] as GroupTypeListItem[] | undefined;

        if (!typeList || !Array.isArray(typeList)) {
            return { Records: [], HasMore: false };
        }

        if (ctx.ObjectName.toLowerCase() === 'grouptypes') {
            return this.BuildGroupTypeRecords(typeList, ctx.ObjectName);
        }

        return this.FlattenGroupRecords(typeList, ctx.ObjectName);
    }

    /** Builds ExternalRecords for GroupType entries only. */
    private BuildGroupTypeRecords(
        typeList: GroupTypeListItem[],
        objectType: string
    ): FetchBatchResult {
        const records = typeList.map(gt => ({
            ExternalID: String(gt.Id ?? ''),
            ObjectType: objectType,
            Fields: { Id: gt.Id, TypeName: gt.TypeName, SortIndex: gt.SortIndex } as Record<string, unknown>,
        }));
        return { Records: records, HasMore: false };
    }

    /** Flattens nested GroupTypeList → Groups into flat group records. */
    private FlattenGroupRecords(
        typeList: GroupTypeListItem[],
        objectType: string
    ): FetchBatchResult {
        const records: ExternalRecord[] = [];
        for (const groupType of typeList) {
            const typeName = groupType.TypeName ?? '';
            for (const group of groupType.Groups ?? []) {
                records.push({
                    ExternalID: String(group.Id),
                    ObjectType: objectType,
                    Fields: { ...group, GroupTypeName: typeName, GroupTypeId: groupType.Id },
                });
            }
        }
        return { Records: records, HasMore: false };
    }

    // ─── Detail enrichment (Members) ─────────────────────────────────

    /**
     * Enriches a slice of member records with full profile data from the detail endpoint.
     * The list endpoint returns sparse data (name, email); the detail endpoint
     * returns full address, phone, custom fields, etc.
     *
     * @param ctx - Fetch context for auth
     * @param records - The slice of records to enrich
     * @param batchOffset - Starting index of this slice within the overall set (for progress logging)
     * @param overallTotal - Total number of records being enriched across all batches (for progress logging)
     */
    private async EnrichMembersWithDetails(
        ctx: FetchContext,
        records: ExternalRecord[],
        batchOffset: number,
        overallTotal: number
    ): Promise<ExternalRecord[]> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as YMAuthContext;
        const concurrency = 3;
        const enriched: ExternalRecord[] = [];
        let lastLoggedPct = Math.floor((batchOffset / overallTotal) * 100);

        for (let i = 0; i < records.length; i += concurrency) {
            const chunk = records.slice(i, i + concurrency);
            const results = await Promise.all(
                chunk.map(record => this.EnrichSingleMember(auth, record))
            );
            enriched.push(...results);

            const doneOverall = batchOffset + enriched.length;
            const pct = Math.floor((doneOverall / overallTotal) * 100);
            if (pct >= lastLoggedPct + 1) {
                lastLoggedPct = pct;
                console.log(`[YM Members] Enriched ${doneOverall}/${overallTotal} (${pct}%)`);
            }
        }

        return enriched;
    }

    /**
     * Fetches full detail data for a single member and merges it.
     * Detail endpoint returns camelCase + nested objects; we normalize to flat PascalCase.
     */
    private async EnrichSingleMember(
        auth: YMAuthContext,
        record: ExternalRecord
    ): Promise<ExternalRecord> {
        try {
            const detailPath = `Members/${record.ExternalID}`;
            const fetchPromise = this.MakeYMRequest(auth, detailPath);
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Detail fetch timed out for ${record.ExternalID}`)), this.effectiveEnrichTimeoutMs)
            );
            const json = await Promise.race([fetchPromise, timeoutPromise]);
            const normalized = this.NormalizeMemberDetail(json);
            record.Fields = { ...record.Fields, ...normalized };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[YM Members] Failed to enrich member ${record.ExternalID}: ${message}`);
        }

        return record;
    }

    /**
     * Maps the Members detail endpoint response to our flat PascalCase schema.
     * Detail endpoint returns: { firstName, lastName, emailAddress, primaryAddress: { ... } }
     * We need:                 { FirstName, LastName, EmailAddr, Phone, Address1, ... }
     */
    private NormalizeMemberDetail(detail: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const addr = detail['primaryAddress'] as Record<string, unknown> | undefined;

        const fieldMap: Record<string, string> = {
            'id': 'ProfileID',
            'firstName': 'FirstName',
            'lastName': 'LastName',
            'emailAddress': 'EmailAddr',
            'organization': 'Organization',
            'typeCode': 'MemberTypeCode',
            'expirationDate': 'ExpirationDate',
            'isMember': 'Status',
        };

        for (const [detailKey, ourKey] of Object.entries(fieldMap)) {
            const value = detail[detailKey];
            if (value !== undefined && value !== null && value !== '') {
                result[ourKey] = detailKey === 'isMember' ? (value ? 'Active' : 'Inactive') : value;
            }
        }

        if (addr) {
            const addrMap: Record<string, string> = {
                'address1': 'Address1',
                'address2': 'Address2',
                'city': 'City',
                'location': 'State',
                'postalCode': 'PostalCode',
                'countryName': 'Country',
                'phone': 'Phone',
            };
            for (const [addrKey, ourKey] of Object.entries(addrMap)) {
                const value = addr[addrKey];
                if (value !== undefined && value !== null && value !== '') {
                    result[ourKey] = value;
                }
            }
        }

        return result;
    }

    // ─── Configuration parsing ───────────────────────────────────────

    /**
     * Parses credentials from CompanyIntegration.CredentialID (preferred) or
     * falls back to CompanyIntegration.Configuration JSON for backwards compat.
     */
    protected async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<YMConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID && contextUser) {
            const config = await this.LoadFromCredential(credentialID, contextUser);
            if (config) return config;
        }

        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            return this.ParseConfigJson(configJson);
        }

        throw new Error('No YM credentials found. Attach a credential with ClientID, APIKey, and APIPassword, or set Configuration JSON on the CompanyIntegration.');
    }

    private async LoadFromCredential(credentialID: string, contextUser: UserInfo): Promise<YMConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            return this.ParseConfigJson(credential.Values);
        } catch {
            return null;
        }
    }

    private ParseConfigJson(json: string): YMConnectionConfig {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
        const apiKey = parsed['APIKey'] || parsed['apiKey'] || parsed['ApiKey'];
        const apiPassword = parsed['APIPassword'] || parsed['apiPassword'] || parsed['ApiPassword'];

        if (!clientId || !apiKey || !apiPassword) {
            throw new Error('Configuration JSON must contain ClientID, APIKey, and APIPassword (any casing)');
        }

        const parseOptionalInt = (key: string): number | undefined => {
            const v = parsed[key];
            if (v == null) return undefined;
            const n = Number(v);
            return isNaN(n) ? undefined : Math.floor(n);
        };

        return {
            ClientID: String(clientId),
            APIKey: String(apiKey),
            APIPassword: String(apiPassword),
            MaxRetries: parseOptionalInt('MaxRetries'),
            RequestTimeoutMs: parseOptionalInt('RequestTimeoutMs'),
            MinRequestIntervalMs: parseOptionalInt('MinRequestIntervalMs'),
            EnrichBatchSize: parseOptionalInt('EnrichBatchSize'),
            JsonTimeoutMs: parseOptionalInt('JsonTimeoutMs'),
            EnrichTimeoutMs: parseOptionalInt('EnrichTimeoutMs'),
        };
    }

    // ─── Session management ──────────────────────────────────────────

    /** Obtains or reuses a YM session for the given credentials. */
    protected async GetSession(config: YMConnectionConfig): Promise<string> {
        const cached = this.sessionCache.get(config.ClientID);
        if (cached && (Date.now() - cached.CreatedAt) < SESSION_TTL_MS) {
            return cached.SessionId;
        }
        return this.CreateSession(config);
    }

    /** Creates a new YM session via the Authenticate endpoint. */
    private async CreateSession(config: YMConnectionConfig): Promise<string> {
        const response = await fetch(`${YM_API_BASE}/Ams/Authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                provider: 'credentials',
                UserName: config.APIKey,
                Password: config.APIPassword,
                UserType: 'Admin',
                ClientID: Number(config.ClientID),
            }),
        });

        if (!response.ok) {
            throw new Error(`YM authentication failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as {
            SessionId?: string;
            ResponseStatus?: { ErrorCode?: string; Message?: string };
        };

        if (json.ResponseStatus?.ErrorCode && json.ResponseStatus.ErrorCode !== 'None') {
            throw new Error(`YM auth error: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`);
        }

        if (!json.SessionId) {
            throw new Error('YM auth: No SessionId returned');
        }

        this.sessionCache.set(config.ClientID, {
            SessionId: json.SessionId,
            CreatedAt: Date.now(),
        });

        return json.SessionId;
    }

    /** Invalidates a cached session so the next request re-authenticates. */
    protected InvalidateSession(clientId: string): void {
        this.sessionCache.delete(clientId);
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    /**
     * Makes a direct YM API request using the connector's auth and URL conventions.
     * Used for YM-specific calls (Groups, detail enrichment, TestConnection)
     * that bypass the base class's metadata-driven flow.
     */
    private async MakeYMRequest(
        auth: YMAuthContext,
        endpoint: string,
        queryParams?: Record<string, string>
    ): Promise<Record<string, unknown>> {
        let url = `${YM_API_BASE}/Ams/${auth.Config.ClientID}/${endpoint}`;
        if (queryParams && Object.keys(queryParams).length > 0) {
            url += '?' + new URLSearchParams(queryParams).toString();
        }
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

        if (response.Status < 200 || response.Status >= 300) {
            const bodyPreview = typeof response.Body === 'string'
                ? response.Body.slice(0, 500)
                : JSON.stringify(response.Body).slice(0, 500);
            throw new Error(`YM API error for ${endpoint}: ${response.Status} - ${bodyPreview}`);
        }

        return response.Body as Record<string, unknown>;
    }

    /** Executes an HTTP request with a timeout. */
    private async FetchWithTimeout(
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutMs = this.effectiveRequestTimeoutMs;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const init: RequestInit = { method, headers, signal: controller.signal };
            if (body !== undefined) {
                init.body = JSON.stringify(body);
            }
            return await fetch(url, init);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`YM API request timed out after ${timeoutMs / 1000}s: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /** Wraps response.json() with a timeout to prevent indefinite hangs. */
    private async JsonWithTimeout(response: Response, timeoutMs: number): Promise<unknown> {
        return Promise.race([
            response.json(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`response.json() timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
        ]);
    }

    /** Refreshes session after 401 or timeout, updating headers in-place. */
    private async RefreshSession(
        auth: YMAuthContext,
        headers: Record<string, string>
    ): Promise<void> {
        this.InvalidateSession(auth.Config.ClientID);
        const newSessionId = await this.GetSession(auth.Config);
        auth.SessionID = newSessionId;
        headers['X-SS-ID'] = newSessionId;
    }

    /** Checks if an error is a timeout/abort error. */
    private IsTimeoutError(err: unknown): boolean {
        return err instanceof Error && (err.message.includes('timed out') || err.name === 'AbortError');
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

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Response helpers ────────────────────────────────────────────

    /** Checks for YM API-level errors in the response envelope. */
    private CheckResponseError(json: Record<string, unknown>): void {
        const rs = json['ResponseStatus'] as { ErrorCode?: string; Message?: string } | undefined;
        if (rs?.ErrorCode && rs.ErrorCode !== 'None' && rs.ErrorCode !== '') {
            throw new Error(`YM API error: ${rs.Message ?? rs.ErrorCode}`);
        }
    }

    /** Filters out YM API metadata keys that shouldn't be stored as field data. */
    private FilterMetadataKeys(data: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
            if (!METADATA_KEYS.has(key)) {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Estimates record count from a raw response body.
     * Used by ExtractPaginationInfo to determine if more pages exist.
     */
    private EstimateRecordCount(rawBody: unknown): number {
        if (Array.isArray(rawBody)) return rawBody.length;
        if (typeof rawBody === 'object' && rawBody !== null) {
            for (const value of Object.values(rawBody as Record<string, unknown>)) {
                if (Array.isArray(value)) return value.length;
            }
        }
        return 0;
    }
}

/** Shape of a GroupType entry from the Groups endpoint */
interface GroupTypeListItem {
    Id?: number;
    TypeName?: string;
    SortIndex?: number;
    Groups?: Array<{ Id: number; Name: string; [key: string]: unknown }>;
}
