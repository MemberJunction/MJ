/**
 * GrowthZoneConnector — Integration connector for GrowthZone / MemberZone AMS platform.
 *
 * API Documentation: https://integration.growthzone.com/api/
 *
 * Auth: API Key in Authorization header: `Authorization: ApiKey {key}`
 * Base URL: https://app.memberzone.org  OR  https://{subdomain}.growthzoneapp.com
 *           Subdomain configured per-tenant in CompanyIntegration Configuration.
 * Pagination: OData-style skip/take; response envelope has TotalRecordAvailable + ModelItems
 * Rate limits: Not documented — conservative throttling applied
 * Incremental: /api/contacts/delta?modifiedSince={ISO-8601} returns changed contacts
 * CRUD: Contacts (full), Organizations (read + create), most others read-only
 *
 * API Categories:
 *   - Contacts API (implemented) — contacts, activity, addresses, emails, phones, delta
 *   - Organizations API (implemented) — org profiles and membership
 *   - Groups API (implemented) — committees, chapters, groups
 *   - Branches API (implemented) — branch/chapter hierarchy
 *   - Engagement API (implemented, read-only) — engagement scores
 *   - Purchases API (implemented, read-only) — transaction history
 *   - Events API (NOT implemented) — verify endpoint availability with your GrowthZone instance
 *   - Commerce API (NOT implemented) — store/product management, verify with instance
 *   - Webhooks (NOT implemented) — manual webhook setup via GrowthZone support required
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

// ─── Types ────────────────────────────────────────────────────────────────

export interface GrowthZoneConnectionConfig {
    ApiKey: string;
    BaseURL: string; // e.g. https://app.memberzone.org or https://{subdomain}.growthzoneapp.com
}

interface GZAuthContext extends RESTAuthContext {
    Config: GrowthZoneConnectionConfig;
}

interface GZPagedResponse {
    TotalRecordAvailable: number;
    ModelItems: Record<string, unknown>[];
}

// ─── Constants ────────────────────────────────────────────────────────────

const GZ_DEFAULT_TAKE = 200;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 200;

// ─── Static Object Definitions ────────────────────────────────────────────

const GZ_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Contacts',
        DisplayName: 'Contact',
        Description: 'Member and non-member contacts in GrowthZone',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact GUID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact first name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact last name' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address' },
            { Name: 'Phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone number' },
            { Name: 'Company', DisplayName: 'Company', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated organization name' },
            { Name: 'OrganizationId', DisplayName: 'Organization ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent organization GUID' },
            { Name: 'MembershipTypeId', DisplayName: 'Membership Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Membership type identifier' },
            { Name: 'MembershipStatusId', DisplayName: 'Membership Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current membership status' },
            { Name: 'MemberSince', DisplayName: 'Member Since', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership start date' },
            { Name: 'RenewalDate', DisplayName: 'Renewal Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership renewal date' },
            { Name: 'ModifiedSinceUtc', DisplayName: 'Modified At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp (UTC)' },
            { Name: 'CreatedUtc', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Record creation timestamp (UTC)' },
        ],
    },
    {
        Name: 'ContactActivities',
        DisplayName: 'Contact Activity',
        Description: 'Activity log entries for contacts (parent-child under Contacts)',
        SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Activity record GUID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent contact GUID' },
            { Name: 'ActivityType', DisplayName: 'Activity Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type of activity' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Activity description' },
            { Name: 'ActivityDate', DisplayName: 'Activity Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When activity occurred' },
        ],
    },
    {
        Name: 'ContactAddresses',
        DisplayName: 'Contact Address',
        Description: 'Addresses for contacts (parent-child under Contacts)',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Address GUID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent contact GUID' },
            { Name: 'AddressType', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address type (Home, Work, etc.)' },
            { Name: 'Street1', DisplayName: 'Street 1', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street address line 1' },
            { Name: 'Street2', DisplayName: 'Street 2', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street address line 2' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State/province code' },
            { Name: 'PostalCode', DisplayName: 'Postal Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'ZIP/postal code' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country code' },
        ],
    },
    {
        Name: 'ContactEmails',
        DisplayName: 'Contact Email',
        Description: 'Email addresses for contacts (parent-child under Contacts)',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email record GUID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent contact GUID' },
            { Name: 'EmailType', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email type (Work, Personal, etc.)' },
            { Name: 'EmailAddress', DisplayName: 'Email Address', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email address value' },
            { Name: 'IsPrimary', DisplayName: 'Is Primary', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether this is the primary email' },
        ],
    },
    {
        Name: 'ContactPhones',
        DisplayName: 'Contact Phone',
        Description: 'Phone numbers for contacts (parent-child under Contacts)',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Phone record GUID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent contact GUID' },
            { Name: 'PhoneType', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Phone type (Work, Mobile, Home, etc.)' },
            { Name: 'PhoneNumber', DisplayName: 'Phone Number', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Phone number value' },
            { Name: 'IsPrimary', DisplayName: 'Is Primary', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether this is the primary number' },
        ],
    },
    {
        Name: 'Organizations',
        DisplayName: 'Organization',
        Description: 'Member organizations (companies) in GrowthZone',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Organization GUID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization name' },
            { Name: 'Website', DisplayName: 'Website', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization website URL' },
            { Name: 'Industry', DisplayName: 'Industry', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Industry classification' },
            { Name: 'MembershipTypeId', DisplayName: 'Membership Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Membership type' },
            { Name: 'MembershipStatusId', DisplayName: 'Membership Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current membership status' },
            { Name: 'ModifiedSinceUtc', DisplayName: 'Modified At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp (UTC)' },
        ],
    },
    {
        Name: 'Groups',
        DisplayName: 'Group / Committee',
        Description: 'Groups, committees, and chapters in GrowthZone',
        SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group GUID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group description' },
            { Name: 'GroupType', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group type' },
            { Name: 'IsActive', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether group is active' },
        ],
    },
    {
        Name: 'Branches',
        DisplayName: 'Branch / Chapter',
        Description: 'Branch or chapter hierarchy in GrowthZone',
        SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Branch GUID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Branch name' },
            { Name: 'ParentBranchId', DisplayName: 'Parent Branch', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent branch GUID (if sub-branch)' },
            { Name: 'IsActive', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether branch is active' },
        ],
    },
    {
        Name: 'Engagement',
        DisplayName: 'Engagement Score',
        Description: 'Contact engagement scores and metrics (read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact GUID' },
            { Name: 'EngagementScore', DisplayName: 'Score', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Overall engagement score' },
            { Name: 'LastActivity', DisplayName: 'Last Activity', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Most recent activity date' },
        ],
    },
    {
        Name: 'Purchases',
        DisplayName: 'Purchase',
        Description: 'Purchase/transaction records for contacts (read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Purchase GUID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Purchasing contact GUID' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Purchase amount' },
            { Name: 'PurchaseDate', DisplayName: 'Purchase Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When purchase was made' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Purchase description' },
        ],
    },
    // ─── Additional GZ endpoints — lean overlay ──
    // Membership
    { Name: 'MembershipTypes', DisplayName: 'Membership Type', Description: 'Membership type definitions', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type GUID' },
    ]},
    { Name: 'MembershipLevels', DisplayName: 'Membership Level', Description: 'Membership level tiers', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Level GUID' },
    ]},
    { Name: 'MembershipApplications', DisplayName: 'Membership Application', Description: 'Membership applications', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'App GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'ApplicationDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'MembershipRenewals', DisplayName: 'Membership Renewal', Description: 'Renewal records', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Renewal GUID' },
        { Name: 'RenewalDate', DisplayName: 'Renewal Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Events
    { Name: 'Events', DisplayName: 'Event', Description: 'Events and conferences', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event GUID' },
        { Name: 'StartDate', DisplayName: 'Start', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'EventRegistrations', DisplayName: 'Event Registration', Description: 'Event registrations', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Reg GUID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'RegistrationDate', DisplayName: 'Reg Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'EventSessions', DisplayName: 'Event Session', Description: 'Sessions within events', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Session GUID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'EventSpeakers', DisplayName: 'Event Speaker', Description: 'Event speakers', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Speaker GUID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    // Financial
    { Name: 'Invoices', DisplayName: 'Invoice', Description: 'Invoices', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invoice GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'InvoiceDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Payments', DisplayName: 'Payment', Description: 'Payment records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Payment GUID' },
        { Name: 'PaymentDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Committees
    { Name: 'Committees', DisplayName: 'Committee', Description: 'Committees and boards', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Committee GUID' },
    ]},
    { Name: 'CommitteeMembers', DisplayName: 'Committee Member', Description: 'Committee membership', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership GUID' },
        { Name: 'CommitteeId', DisplayName: 'Committee ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Committees' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    // Donations
    { Name: 'Donations', DisplayName: 'Donation', Description: 'Donation records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'DonationDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Pledges', DisplayName: 'Pledge', Description: 'Pledge commitments', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Pledge GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    // Certifications / CE
    { Name: 'CertificationPrograms', DisplayName: 'Certification Program', Description: 'Certification program definitions', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Program GUID' },
    ]},
    { Name: 'CECredits', DisplayName: 'CE Credit', Description: 'Continuing education credits', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Credit GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'EarnedDate', DisplayName: 'Earned', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Job Board
    { Name: 'JobPostings', DisplayName: 'Job Posting', Description: 'Job board postings', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Posting GUID' },
        { Name: 'PostDate', DisplayName: 'Posted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Communications
    { Name: 'EmailBlasts', DisplayName: 'Email Blast', Description: 'Sent email blasts/campaigns', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Blast GUID' },
        { Name: 'SentDate', DisplayName: 'Sent', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Store
    { Name: 'Products', DisplayName: 'Product', Description: 'Store products', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product GUID' },
    ]},
    // Misc
    { Name: 'Tags', DisplayName: 'Tag', Description: 'Tags for categorizing contacts', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tag GUID' },
    ]},
    { Name: 'Tasks', DisplayName: 'Task/Activity', Description: 'CRM tasks and activities', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Task GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'DueDate', DisplayName: 'Due Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'CustomFieldDefinitions', DisplayName: 'Custom Field Def', Description: 'Custom field schema definitions', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Field def GUID' },
    ]},
    { Name: 'AuditLog', DisplayName: 'Audit Log', Description: 'Activity audit trail', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Log entry GUID' },
        { Name: 'Date', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'ContactNotes', DisplayName: 'Contact Note', Description: 'Notes on contacts', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Note GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'DirectoryListings', DisplayName: 'Directory Listing', Description: 'Member directory listings', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Listing GUID' },
    ]},
    // ─── Contact sub-resources ──
    { Name: 'ContactSocialMedia', DisplayName: 'Contact Social', Description: 'Social media profiles', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Social GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactDemographics', DisplayName: 'Contact Demographics', Description: 'Demographic data', SupportsWrite: true, Fields: [
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactCustomFields', DisplayName: 'Contact Custom Fields', Description: 'Custom field values', SupportsWrite: true, Fields: [
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactCertifications', DisplayName: 'Contact Certification', Description: 'Certification records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Cert GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactEducation', DisplayName: 'Contact Education', Description: 'Education/degree records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Education GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactEmployment', DisplayName: 'Contact Employment', Description: 'Employment history', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Employment GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactRelationships', DisplayName: 'Contact Relationship', Description: 'Contact-to-contact relationships', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Relationship GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactVolunteerInterests', DisplayName: 'Volunteer Interest', Description: 'Volunteer interest areas', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Interest GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'ContactCommunications', DisplayName: 'Contact Comm Pref', Description: 'Communication preferences', SupportsWrite: true, Fields: [
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Contacts' },
    ]},
    // ─── Event sub-resources ──
    { Name: 'EventCategories', DisplayName: 'Event Category', Description: 'Event category definitions', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category GUID' },
    ]},
    { Name: 'EventSessionRegistrations', DisplayName: 'Session Registration', Description: 'Session-level registrations', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Reg GUID' },
        { Name: 'SessionId', DisplayName: 'Session ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EventSessions' },
    ]},
    { Name: 'EventSponsors', DisplayName: 'Event Sponsor', Description: 'Event sponsors', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sponsor GUID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'EventExhibitors', DisplayName: 'Event Exhibitor', Description: 'Event exhibitors', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Exhibitor GUID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'EventFees', DisplayName: 'Event Fee', Description: 'Fee definitions per event', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Fee GUID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    // ─── Financial sub-resources ──
    { Name: 'InvoiceLineItems', DisplayName: 'Invoice Line', Description: 'Invoice line items', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Line GUID' },
        { Name: 'InvoiceId', DisplayName: 'Invoice ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Invoices' },
    ]},
    { Name: 'Credits', DisplayName: 'Credit', Description: 'Credit/refund records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Credit GUID' },
        { Name: 'CreditDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'DonationCampaigns', DisplayName: 'Donation Campaign', Description: 'Fundraising campaign definitions', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign GUID' },
    ]},
    // ─── Misc lookups and remaining ──
    { Name: 'CommitteePositions', DisplayName: 'Committee Position', Description: 'Position types on committees', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Position GUID' },
    ]},
    { Name: 'MembershipStatusChanges', DisplayName: 'Status Change', Description: 'Membership status change history', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Change GUID' },
        { Name: 'ChangeDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'MemberBenefits', DisplayName: 'Member Benefit', Description: 'Benefit entitlements', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Benefit GUID' },
    ]},
    { Name: 'EmailBlastRecipients', DisplayName: 'Blast Recipient', Description: 'Email blast recipients', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Recipient GUID' },
        { Name: 'EmailBlastId', DisplayName: 'Blast ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EmailBlasts' },
    ]},
    { Name: 'EmailTemplates', DisplayName: 'Email Template', Description: 'Email template definitions', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Template GUID' },
    ]},
    { Name: 'CERequirements', DisplayName: 'CE Requirement', Description: 'CE requirement definitions', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Requirement GUID' },
    ]},
    { Name: 'DirectoryCategories', DisplayName: 'Directory Category', Description: 'Directory listing categories', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category GUID' },
    ]},
    { Name: 'JobCategories', DisplayName: 'Job Category', Description: 'Job board categories', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category GUID' },
    ]},
    { Name: 'JobApplications', DisplayName: 'Job Application', Description: 'Applications to job postings', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Application GUID' },
        { Name: 'JobPostingId', DisplayName: 'Posting ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → JobPostings' },
        { Name: 'ApplicationDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'ProductCategories', DisplayName: 'Product Category', Description: 'Store product categories', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category GUID' },
    ]},
    { Name: 'SystemLookups', DisplayName: 'System Lookup', Description: 'System lookup/reference values', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Lookup GUID' },
    ]},
    { Name: 'BillingProfiles', DisplayName: 'Billing Profile', Description: 'Billing/payment profiles', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Profile GUID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
];

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'GrowthZoneConnector')
export class GrowthZoneConnector extends BaseRESTIntegrationConnector {
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'GrowthZone'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return false; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return GZ_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-chart-line';
        config.CategoryDescription = 'GrowthZone association management for contacts, organizations, groups, and branches';
        config.ParentCategoryName = 'Business Apps';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ─────────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return GZ_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: obj.Name === 'Contacts' || obj.Name === 'Organizations',
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity, objectName: string, _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticObj = GZ_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
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
        const config = await this.ParseConfig(companyIntegration, contextUser);
        return { Token: config.ApiKey, TokenType: 'ApiKey', Config: config } as GZAuthContext;
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo
    ): Promise<GrowthZoneConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['ApiKey']) {
                    return {
                        ApiKey: parsed['ApiKey'],
                        BaseURL: parsed['BaseURL'] ?? 'https://app.memberzone.org',
                    };
                }
            }
        }
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return {
                ApiKey: parsed['ApiKey'] ?? '',
                BaseURL: parsed['BaseURL'] ?? 'https://app.memberzone.org',
            };
        }
        throw new Error(
            'No GrowthZone credentials found. Set ApiKey (and optionally BaseURL) in credential Values or Configuration JSON.'
        );
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as GZAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.Config.BaseURL}/api/contacts?take=1&skip=0`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as GZPagedResponse;
                const count = body.TotalRecordAvailable ?? 0;
                return { Success: true, Message: `Connected to GrowthZone — ${count} contacts available` };
            }
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ──────────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as GZAuthContext).Config.BaseURL;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        _page: number, offset: number, _cursor?: string
    ): string {
        const take = _obj.DefaultPageSize ?? GZ_DEFAULT_TAKE;
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}skip=${offset}&take=${take}`;
    }

    // ─── Response Parsing ──────────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, _responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        // GrowthZone uses ModelItems array envelope
        if (Array.isArray(body['ModelItems'])) return body['ModelItems'] as Record<string, unknown>[];
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, _currentPage: number, currentOffset: number, pageSize: number
    ): PaginationState {
        const body = rawBody as GZPagedResponse;
        const records = this.NormalizeResponse(rawBody, null);
        const total = body.TotalRecordAvailable ?? 0;
        const fetched = currentOffset + records.length;
        return { HasMore: fetched < total, NextOffset: fetched };
    }

    // ─── FetchChanges ──────────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectLower = ctx.ObjectName.toLowerCase();

        switch (objectLower) {
            case 'contacts':          return this.FetchContacts(ctx);
            case 'contactactivities': return this.FetchContactChildren(ctx, 'activities', 'ContactActivities');
            case 'contactaddresses':  return this.FetchContactChildren(ctx, 'addresses', 'ContactAddresses');
            case 'contactemails':     return this.FetchContactChildren(ctx, 'emails', 'ContactEmails');
            case 'contactphones':     return this.FetchContactChildren(ctx, 'phones', 'ContactPhones');
            case 'organizations':     return this.FetchOrganizations(ctx);
            case 'groups':            return this.FetchSimpleList(ctx, '/api/groups', 'Groups');
            case 'branches':          return this.FetchSimpleList(ctx, '/api/branches', 'Branches');
            case 'engagement':        return this.FetchEngagement(ctx);
            case 'purchases':         return this.FetchPurchases(ctx);
            default:                  return this.FetchSimpleList(ctx, `/api/${ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1/$2').toLowerCase()}`, ctx.ObjectName);
        }
    }

    private async FetchContacts(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as GZAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;

        // Use delta endpoint for incremental sync
        if (ctx.WatermarkValue) {
            const url = `${auth.Config.BaseURL}/api/contacts/delta?modifiedSince=${encodeURIComponent(ctx.WatermarkValue)}&skip=${offset}&take=${GZ_DEFAULT_TAKE}`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) {
                throw new Error(`GrowthZone contacts delta API error: ${response.Status}`);
            }
            return this.BuildPagedResult(response.Body, offset, GZ_DEFAULT_TAKE, 'Contacts', 'Id', ctx);
        }

        const url = `${auth.Config.BaseURL}/api/contacts?skip=${offset}&take=${GZ_DEFAULT_TAKE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`GrowthZone contacts API error: ${response.Status}`);
        }
        return this.BuildPagedResult(response.Body, offset, GZ_DEFAULT_TAKE, 'Contacts', 'Id', ctx);
    }

    private async FetchOrganizations(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as GZAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        let url = `${auth.Config.BaseURL}/api/organizations?skip=${offset}&take=${GZ_DEFAULT_TAKE}`;
        if (ctx.WatermarkValue) {
            url += `&modifiedSince=${encodeURIComponent(ctx.WatermarkValue)}`;
        }
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`GrowthZone organizations API error: ${response.Status}`);
        }
        return this.BuildPagedResult(response.Body, offset, GZ_DEFAULT_TAKE, 'Organizations', 'Id', ctx);
    }

    private async FetchContactChildren(
        ctx: FetchContext, childPath: string, objectType: string
    ): Promise<FetchBatchResult> {
        // Parent-child: fetch all contacts then collect child records
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as GZAuthContext;
        const headers = this.BuildHeaders(auth);

        const contactIDs = await this.FetchAllContactIDs(auth, headers);
        const allRecords: ExternalRecord[] = [];

        for (let i = 0; i < contactIDs.length; i += 5) {
            const batch = contactIDs.slice(i, i + 5);
            const results = await Promise.all(
                batch.map(id => this.FetchChildRecords(auth, headers, id, childPath, objectType))
            );
            for (const recs of results) allRecords.push(...recs);
        }

        return { Records: allRecords, HasMore: false };
    }

    private async FetchAllContactIDs(
        auth: GZAuthContext, headers: Record<string, string>
    ): Promise<string[]> {
        const ids: string[] = [];
        let offset = 0;
        while (true) {
            const url = `${auth.Config.BaseURL}/api/contacts?skip=${offset}&take=500`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) break;
            const records = this.NormalizeResponse(response.Body, null);
            for (const r of records) if (r['Id']) ids.push(String(r['Id']));
            const body = response.Body as GZPagedResponse;
            const fetched = offset + records.length;
            if (fetched >= (body.TotalRecordAvailable ?? 0)) break;
            offset = fetched;
        }
        return ids;
    }

    private async FetchChildRecords(
        auth: GZAuthContext, headers: Record<string, string>,
        contactId: string, childPath: string, objectType: string
    ): Promise<ExternalRecord[]> {
        try {
            const url = `${auth.Config.BaseURL}/api/contacts/${contactId}/${childPath}`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status !== 200) return [];
            const records = this.NormalizeResponse(response.Body, null);
            return records.map(r => ({
                ExternalID: String(r['Id'] ?? `${contactId}-${childPath}`),
                ObjectType: objectType,
                Fields: { ...r, ContactId: contactId },
            }));
        } catch {
            return [];
        }
    }

    private async FetchSimpleList(
        ctx: FetchContext, endpoint: string, objectType: string
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as GZAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.Config.BaseURL}${endpoint}?skip=${offset}&take=${GZ_DEFAULT_TAKE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`GrowthZone ${objectType} API error: ${response.Status}`);
        }
        return this.BuildPagedResult(response.Body, offset, GZ_DEFAULT_TAKE, objectType, 'Id', ctx);
    }

    private async FetchEngagement(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as GZAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.Config.BaseURL}/api/contacts/engagement?skip=${offset}&take=${GZ_DEFAULT_TAKE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            return { Records: [], HasMore: false };
        }
        return this.BuildPagedResult(response.Body, offset, GZ_DEFAULT_TAKE, 'Engagement', 'ContactId', ctx);
    }

    private async FetchPurchases(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as GZAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.Config.BaseURL}/api/purchases?skip=${offset}&take=${GZ_DEFAULT_TAKE}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            return { Records: [], HasMore: false };
        }
        return this.BuildPagedResult(response.Body, offset, GZ_DEFAULT_TAKE, 'Purchases', 'Id', ctx);
    }

    private BuildPagedResult(
        rawBody: unknown, offset: number, pageSize: number,
        objectType: string, pkField: string, _ctx: FetchContext
    ): FetchBatchResult {
        const records = this.NormalizeResponse(rawBody, null);
        const body = rawBody as GZPagedResponse;
        const total = body.TotalRecordAvailable ?? records.length;
        const fetched = offset + records.length;

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: objectType,
            Fields: r,
        }));

        let newWatermark: string | undefined;
        if (fetched >= total) {
            for (const r of records) {
                const modified = (r['ModifiedSinceUtc'] ?? r['modified_at'] ?? r['updatedAt']) as string | undefined;
                if (modified && (!newWatermark || modified > newWatermark)) newWatermark = modified;
            }
        }

        return {
            Records: externalRecords,
            HasMore: fetched < total,
            NextOffset: fetched,
            NewWatermarkValue: fetched >= total ? newWatermark : undefined,
        };
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as GZAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth.Config.BaseURL, ctx.ObjectName, ctx.Attributes, null);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return { Success: true, ExternalID: String(body['Id'] ?? ''), StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as GZAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth.Config.BaseURL, ctx.ObjectName, ctx.Attributes, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, 'PUT', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        // GrowthZone does not expose bulk DELETE on most resources
        return {
            Success: false,
            ExternalID: ctx.ExternalID,
            StatusCode: 405,
            ErrorMessage: `GrowthZone does not support DELETE for ${ctx.ObjectName}`,
        };
    }

    private CRUDEndpointURL(
        baseURL: string, objectName: string, attrs: Record<string, unknown>, externalID: string | null
    ): string {
        const lower = objectName.toLowerCase();

        if (lower === 'contactaddresses' || lower === 'contactemails' || lower === 'contactphones') {
            const contactId = attrs['ContactId'] as string ?? '';
            const childPath = lower === 'contactaddresses' ? 'addresses' : lower === 'contactemails' ? 'emails' : 'phones';
            if (externalID) return `${baseURL}/api/contacts/${contactId}/${childPath}/${externalID}`;
            return `${baseURL}/api/contacts/${contactId}/${childPath}`;
        }

        const endpointMap: Record<string, string> = {
            'contacts':      `${baseURL}/api/contacts`,
            'organizations': `${baseURL}/api/organizations`,
        };

        const base = endpointMap[lower] ?? `${baseURL}/api/${lower}`;
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
        return {
            'Authorization': `ApiKey ${auth.Token}`,
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
                console.warn('[GrowthZone] 401 — API key may be invalid, retrying once');
                continue;
            }
            if (response.status === 429) {
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000);
                console.warn(`[GrowthZone] Rate limited (429), backing off ${Math.round(delay)}ms`);
                await this.Sleep(delay);
                continue;
            }

            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
                console.warn(`[GrowthZone] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }

        throw new Error(`GrowthZone request failed after ${MAX_RETRIES} retries: ${url}`);
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
                throw new Error(`GrowthZone request timed out: ${url}`);
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
        const obj = GZ_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadGrowthZoneConnector() { /* intentionally empty */ }
