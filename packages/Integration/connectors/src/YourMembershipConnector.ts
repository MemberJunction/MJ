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
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type SourceSchemaInfo,
    type SourceRelationshipInfo,
} from '@memberjunction/integration-engine';

// ─── Configuration & Session Types ──────────────────────────────

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface YMConnectionConfig {
    /** YM client/site identifier (integer) */
    ClientID: string;
    /** YM API key (used as UserName for session auth) */
    APIKey: string;
    /** YM API password (used as Password for session auth) */
    APIPassword: string;
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

// ─── Endpoint Registry ──────────────────────────────────────────

/** Configuration for a YM API endpoint/object */
interface YMObjectConfig {
    /** API path segment (e.g., 'MemberList') */
    Path: string;
    /** Human-readable label */
    Label: string;
    /** Human-readable description of this object for metadata */
    Description: string;
    /** JSON key containing the data array in the response. Null for raw array responses. */
    ResponseDataKey: string | null;
    /** Primary key field name(s) in the response records */
    PKFields: string[];
    /** Whether the endpoint supports PageSize/PageNumber pagination */
    SupportsPagination: boolean;
    /** Default page size */
    DefaultPageSize: number;
    /** Additional query params to always include */
    DefaultQueryParams?: Record<string, string>;
    /** Whether the endpoint supports incremental date filtering */
    SupportsIncrementalSync: boolean;
    /**
     * Detail endpoint path template for fetching full record data.
     * Use `{PK}` as placeholder for the record's primary key value.
     * When set, the connector will call this endpoint per-record to enrich
     * the sparse list data with full field values.
     */
    DetailPath?: string;
    /** JSON key containing the detail record in the detail endpoint response. Null for root-level. */
    DetailResponseKey?: string | null;
    /**
     * Whether this endpoint uses OffSet-based pagination instead of PageNumber.
     * When true, the watermark tracks the current offset position.
     * Max PageSize for OffSet endpoints is 100.
     */
    UsesOffSetPagination?: boolean;
    /** Foreign key relationships to other YM objects */
    Relationships?: SourceRelationshipInfo[];
    /**
     * For per-parent endpoints (e.g., EventRegistrations per Event, MemberGroups per Member).
     * When set, FetchChanges iterates over all parent records and calls this endpoint
     * with the parent ID substituted into the Path template.
     */
    ParentObject?: {
        /** YM_OBJECTS key for the parent (e.g., 'Events', 'Members') */
        ParentObjectKey: string;
        /** PK field name on the parent used to substitute into Path */
        ParentPKField: string;
        /** Field name injected into each child record to track the parent FK */
        ParentFKFieldName: string;
    };
}

/** All supported YM objects */
const YM_OBJECTS: Record<string, YMObjectConfig> = {
    Members: {
        Path: 'MemberList',
        Label: 'Members',
        Description: 'Organization members with profile, contact, and membership details',
        ResponseDataKey: 'Members',
        PKFields: ['ProfileID'],
        SupportsPagination: true,
        DefaultPageSize: 200,
        DefaultQueryParams: {
            FieldSelection: [
                'ProfileID', 'FirstName', 'LastName', 'EmailAddr', 'MemberTypeCode',
                'Status', 'Organization', 'Phone', 'Address1', 'Address2', 'City',
                'State', 'PostalCode', 'Country', 'JoinDate', 'RenewalDate',
                'ExpirationDate', 'MemberSinceDate', 'Title', 'WebsiteUrl',
            ].join(','),
        },
        SupportsIncrementalSync: false,
        DetailPath: 'Members/{PK}',
        DetailResponseKey: null,
    },
    Events: {
        Path: 'Events',
        Label: 'Events',
        Description: 'Events including conferences, webinars, and meetings with dates and virtual meeting info',
        ResponseDataKey: 'EventsList',
        PKFields: ['EventId'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { Active: 'true' },
        SupportsIncrementalSync: false,
    },
    MemberTypes: {
        Path: 'MemberTypes',
        Label: 'Member Types',
        Description: 'Classification types for members (e.g., Individual, Corporate, Student)',
        ResponseDataKey: 'MemberTypes',
        PKFields: ['ID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Memberships: {
        Path: 'Memberships',
        Label: 'Memberships',
        Description: 'Membership plans with dues amounts, proration rules, and invoice settings',
        ResponseDataKey: 'membershipList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Groups: {
        Path: 'Groups',
        Label: 'Groups',
        Description: 'Committees, chapters, sections, and other organizational groups',
        ResponseDataKey: 'GroupTypeList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Products: {
        Path: 'Products',
        Label: 'Products',
        Description: 'Store products available for purchase with pricing, inventory, and tax info',
        ResponseDataKey: null,
        PKFields: ['id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    DonationFunds: {
        Path: 'DonationFunds',
        Label: 'Donation Funds',
        Description: 'Donation fund definitions for directing charitable contributions',
        ResponseDataKey: 'fundList',
        PKFields: ['fundId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Certifications: {
        Path: 'Certifications',
        Label: 'Certifications',
        Description: 'Professional certifications and continuing education programs',
        ResponseDataKey: 'CertificationList',
        PKFields: ['CertificationID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        SupportsIncrementalSync: false,
    },
    InvoiceItems: {
        Path: 'InvoiceItems',
        Label: 'Invoice Items',
        Description: 'Individual line items from invoices including dues, events, store purchases, and donations',
        ResponseDataKey: 'InvoiceItemsList',
        PKFields: ['LineItemID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { DateFrom: '2000-01-01', InvoiceItemType: 'All', OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
        Relationships: [
            { FieldName: 'WebSiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    DuesTransactions: {
        Path: 'DuesTransactions',
        Label: 'Dues Transactions',
        Description: 'Membership dues payment transactions with status, amounts, and membership details',
        ResponseDataKey: 'DuesTransactionsList',
        PKFields: ['TransactionID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { DateFrom: '2000-01-01', OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
        Relationships: [
            { FieldName: 'WebsiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },

    // ─── Per-Event child endpoints ──────────────────────────────
    EventRegistrations: {
        Path: 'Event/{ParentID}/EventRegistrants',
        Label: 'Event Registrations',
        Description: 'Event registration records with attendee details, status, badge numbers, and attendance tracking',
        ResponseDataKey: 'EventRegistrantsList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Events', ParentPKField: 'EventId', ParentFKFieldName: 'EventId' },
        Relationships: [
            { FieldName: 'EventId', TargetObject: 'Events', TargetField: 'EventId' },
            { FieldName: 'ProfileID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    EventSessions: {
        Path: 'Event/{ParentID}/Sessions',
        Label: 'Event Sessions',
        Description: 'Breakout sessions within events including presenter, schedule, and CEU eligibility',
        ResponseDataKey: 'Sessions',
        PKFields: ['SessionId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Events', ParentPKField: 'EventId', ParentFKFieldName: 'EventId' },
        Relationships: [
            { FieldName: 'EventId', TargetObject: 'Events', TargetField: 'EventId' },
        ],
    },
    EventTickets: {
        Path: 'Event/{ParentID}/Tickets',
        Label: 'Event Tickets',
        Description: 'Ticket types for events with pricing, quantity limits, and categories',
        ResponseDataKey: 'Tickets',
        PKFields: ['TicketId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Events', ParentPKField: 'EventId', ParentFKFieldName: 'EventId' },
        Relationships: [
            { FieldName: 'EventId', TargetObject: 'Events', TargetField: 'EventId' },
        ],
    },
    EventCategories: {
        Path: 'EventCategories',
        Label: 'Event Categories',
        Description: 'Categories for organizing and classifying events',
        ResponseDataKey: 'EventCategoryList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },

    // ─── Per-Member child endpoints ─────────────────────────────
    MemberGroups: {
        Path: 'Member/{ParentID}/Groups',
        Label: 'Member Groups',
        Description: 'Association between members and their group/committee memberships',
        ResponseDataKey: 'GroupTypeList',
        PKFields: ['MemberGroupId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Members', ParentPKField: 'ProfileID', ParentFKFieldName: 'ProfileID' },
        Relationships: [
            { FieldName: 'ProfileID', TargetObject: 'Members', TargetField: 'ProfileID' },
            { FieldName: 'GroupId', TargetObject: 'Groups', TargetField: 'Id' },
        ],
    },
    Connections: {
        Path: 'Member/{ParentID}/Connections',
        Label: 'Connections',
        Description: 'Networking connections between members including contact info and connection status',
        ResponseDataKey: 'ConnectionsList',
        PKFields: ['ConnectionId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        DefaultQueryParams: { Status: 'All' },
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Members', ParentPKField: 'ProfileID', ParentFKFieldName: 'ProfileID' },
        Relationships: [
            { FieldName: 'ProfileID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    DonationHistory: {
        Path: 'Member/{ParentID}/DonationHistory',
        Label: 'Donation History',
        Description: 'Individual donation records per member with amounts, funds, and payment methods',
        ResponseDataKey: 'Donations',
        PKFields: ['intDonationId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Members', ParentPKField: 'ProfileID', ParentFKFieldName: 'ProfileID' },
        Relationships: [
            { FieldName: 'ProfileID', TargetObject: 'Members', TargetField: 'ProfileID' },
            { FieldName: 'strFundName', TargetObject: 'DonationFunds', TargetField: 'fundName' },
        ],
    },
    EngagementScores: {
        Path: 'Member/{ParentID}/EngagementScores',
        Label: 'Engagement Scores',
        Description: 'Member engagement scoring metrics tracking participation and activity levels',
        ResponseDataKey: null,
        PKFields: ['ProfileID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Members', ParentPKField: 'ProfileID', ParentFKFieldName: 'ProfileID' },
        Relationships: [
            { FieldName: 'ProfileID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },

    // ─── Standalone list endpoints ──────────────────────────────
    GroupTypes: {
        Path: 'GroupTypes',
        Label: 'Group Types',
        Description: 'Classification types for groups (e.g., Committee, Chapter, Section)',
        ResponseDataKey: 'GroupTypeList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    DonationTransactions: {
        Path: 'DonationTransactions',
        Label: 'Donation Transactions',
        Description: 'Donation payment transactions with member, fund, and payment details. DateFrom must be within 90 days.',
        ResponseDataKey: 'DonationTransactionsList',
        PKFields: ['TransactionID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
        Relationships: [
            { FieldName: 'WebsiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    StoreOrders: {
        Path: 'StoreOrders',
        Label: 'Store Orders',
        Description: 'Online store order headers with order date, status, and shipping info',
        ResponseDataKey: 'StoreOrderIDList',
        PKFields: ['OrderID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        DefaultQueryParams: { StartDate: '2000-01-01' },
        SupportsIncrementalSync: true,
        Relationships: [
            { FieldName: 'WebsiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    StoreOrderDetails: {
        Path: 'StoreOrderDetails',
        Label: 'Store Order Details',
        Description: 'Individual line items within store orders with product, pricing, and quantity details',
        ResponseDataKey: 'StoreOrderDetailsList',
        PKFields: ['OrderDetailID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { DateFrom: '2000-01-01', OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
        Relationships: [
            { FieldName: 'WebsiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    CertificationsJournals: {
        Path: 'CertificationsJournals',
        Label: 'Certification Journals',
        Description: 'Continuing education journal entries tracking CEU credits earned by members',
        ResponseDataKey: 'CertificationsJournalList',
        PKFields: ['EntryID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { DateFrom: '2000-01-01', OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
        Relationships: [
            { FieldName: 'CertificationName', TargetObject: 'Certifications', TargetField: 'Name' },
        ],
    },
    CertificationCreditTypes: {
        Path: 'CertificationCreditTypes',
        Label: 'Certification Credit Types',
        Description: 'Types of continuing education credits (e.g., CEU, CPE) with expiration rules',
        ResponseDataKey: 'CreditTypeList',
        PKFields: ['ID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    ProductCategories: {
        Path: 'ProductCategories',
        Label: 'Product Categories',
        Description: 'Categories for organizing store products',
        ResponseDataKey: 'Categories',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    CareerOpenings: {
        Path: 'CareerOpenings',
        Label: 'Career Openings',
        Description: 'Job board postings with position, organization, salary, and contact details',
        ResponseDataKey: 'CareerOpeningsList',
        PKFields: ['CareerOpeningID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { DateFrom: '2000-01-01', OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
    },
    Campaigns: {
        Path: 'Campaigns',
        Label: 'Campaigns',
        Description: 'Email marketing campaigns with scheduling, sender, and delivery status',
        ResponseDataKey: 'Campaigns',
        PKFields: ['CampaignId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    GLCodes: {
        Path: 'GLCodes',
        Label: 'GL Codes',
        Description: 'General ledger codes for financial reporting and accounting integration',
        ResponseDataKey: 'GLCodeList',
        PKFields: ['GLCodeId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },

    // ─── Tier 1: High-value data endpoints ──────────────────────
    MembersProfiles: {
        Path: 'MembersProfiles',
        Label: 'Member Profiles',
        Description: 'Comprehensive member profile data including custom fields, richer than basic member list',
        ResponseDataKey: 'MembersProfilesList',
        PKFields: ['ProfileID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { FilterByDateTime: '2000-01-01' },
        SupportsIncrementalSync: true,
    },
    PeopleIDs: {
        Path: 'PeopleIDs',
        Label: 'People IDs',
        Description: 'Member and non-member identity records for data synchronization with timestamp support',
        ResponseDataKey: 'IDList',
        PKFields: ['ID'],
        SupportsPagination: true,
        DefaultPageSize: 200,
        DefaultQueryParams: { UserType: 'All' },
        SupportsIncrementalSync: true,
    },
    MembersGroupsBulk: {
        Path: 'MembersGroups',
        Label: 'Members Groups (Bulk)',
        Description: 'Bulk member-to-group assignments with group codes and primary group designation',
        ResponseDataKey: 'MembersGroupsList',
        PKFields: ['WebSiteMemberID', 'GroupID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        SupportsIncrementalSync: true,
        Relationships: [
            { FieldName: 'WebSiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
            { FieldName: 'GroupID', TargetObject: 'Groups', TargetField: 'Id' },
        ],
    },
    FinanceBatches: {
        Path: 'FinanceBatches',
        Label: 'Finance Batches',
        Description: 'Financial processing batches grouping transactions by commerce type and close date',
        ResponseDataKey: 'FinanceBatchList',
        PKFields: ['BatchID'],
        SupportsPagination: true,
        DefaultPageSize: 500,
        DefaultQueryParams: { Timestamp: '2000-01-01', PageSize: '500', PageNumber: '1' },
        SupportsIncrementalSync: true,
    },
    FinanceBatchDetails: {
        Path: 'FinanceBatchDetails',
        Label: 'Finance Batch Details',
        Description: 'Detailed invoice and payment records within financial processing batches',
        ResponseDataKey: 'FinanceBatchDetailsList',
        PKFields: ['DetailID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { OffSet: '0' },
        SupportsIncrementalSync: false,
        UsesOffSetPagination: true,
    },
    AllCampaigns: {
        Path: 'AllCampaigns',
        Label: 'All Campaigns',
        Description: 'Extended campaign data with scheduling, processing counts, categories, and version info',
        ResponseDataKey: 'Campaigns',
        PKFields: ['CampaignId'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        SupportsIncrementalSync: false,
    },
    CampaignEmailLists: {
        Path: 'CampaignEmailLists',
        Label: 'Campaign Email Lists',
        Description: 'Email distribution lists for campaigns with totals, bounces, and opt-out metrics',
        ResponseDataKey: 'CampaignEmailLists',
        PKFields: ['ListId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    EventAttendeeTypes: {
        Path: 'Event/{ParentID}/AttendeeTypes',
        Label: 'Event Attendee Types',
        Description: 'Attendee type definitions per event (e.g., Member, Non-Member, Speaker)',
        ResponseDataKey: 'EventAttendeeTypeList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Events', ParentPKField: 'EventId', ParentFKFieldName: 'EventId' },
        Relationships: [
            { FieldName: 'EventId', TargetObject: 'Events', TargetField: 'EventId' },
        ],
    },
    EventSessionGroups: {
        Path: 'Event/{ParentID}/EventSessionGroups',
        Label: 'Event Session Groups',
        Description: 'Logical groupings of sessions within events (e.g., tracks, time slots)',
        ResponseDataKey: 'Sessions',
        PKFields: ['SessionGroupId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Events', ParentPKField: 'EventId', ParentFKFieldName: 'EventId' },
        Relationships: [
            { FieldName: 'EventId', TargetObject: 'Events', TargetField: 'EventId' },
        ],
    },
    EventCEUAwards: {
        Path: 'Event/{ParentID}/CEUAwards',
        Label: 'Event CEU Awards',
        Description: 'Continuing education credit awards linked to events and certifications',
        ResponseDataKey: 'List',
        PKFields: ['AwardID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Events', ParentPKField: 'EventId', ParentFKFieldName: 'EventId' },
        Relationships: [
            { FieldName: 'EventId', TargetObject: 'Events', TargetField: 'EventId' },
            { FieldName: 'CertificationID', TargetObject: 'Certifications', TargetField: 'CertificationID' },
        ],
    },
    EventRegistrationForms: {
        Path: 'EventRegistrationForms',
        Label: 'Event Registration Forms',
        Description: 'Registration form definitions for events with auto-approval settings',
        ResponseDataKey: 'FormsList',
        PKFields: ['FormId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    EventIDs: {
        Path: 'EventIDs',
        Label: 'Event IDs',
        Description: 'Lightweight event identifier list for sync with last-modified date filtering',
        ResponseDataKey: 'EventIDList',
        PKFields: ['EventId'],
        SupportsPagination: true,
        DefaultPageSize: 200,
        SupportsIncrementalSync: true,
    },
    GroupMembershipLogs: {
        Path: 'GroupMembershipLogs',
        Label: 'Group Membership Logs',
        Description: 'Audit trail of group membership changes with member details and timestamps',
        ResponseDataKey: 'Items',
        PKFields: ['ItemID'],
        SupportsPagination: true,
        DefaultPageSize: 1000,
        SupportsIncrementalSync: false,
        DefaultQueryParams: { PageSize: '1000', PageNumber: '1' },
    },
    DuesRules: {
        Path: 'DuesRules',
        Label: 'Dues Rules',
        Description: 'Dues calculation rules with names, descriptions, and amount modifiers',
        ResponseDataKey: 'Rules',
        PKFields: ['ID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    MemberReferrals: {
        Path: 'MemberReferrals',
        Label: 'Member Referrals',
        Description: 'Member-to-member referral tracking records',
        ResponseDataKey: 'ReferralList',
        PKFields: ['ReferralId'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        SupportsIncrementalSync: false,
    },
    MemberSubAccounts: {
        Path: 'MemberSubAccounts',
        Label: 'Member Sub-Accounts',
        Description: 'Sub-account relationships linking dependent members to primary accounts',
        ResponseDataKey: 'Members',
        PKFields: ['ID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: true,
        Relationships: [
            { FieldName: 'ParentID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },

    // ─── Tier 2: Reference/lookup data ──────────────────────────
    Countries: {
        Path: 'Countries',
        Label: 'Countries',
        Description: 'Country reference list with default country designation',
        ResponseDataKey: 'countryList',
        PKFields: ['countryId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Locations: {
        Path: 'Locations/{ParentID}',
        Label: 'Locations',
        Description: 'States, provinces, and regions within countries with tax GL codes',
        ResponseDataKey: 'locationList',
        PKFields: ['locationCode'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Countries', ParentPKField: 'countryId', ParentFKFieldName: 'countryId' },
        Relationships: [
            { FieldName: 'countryId', TargetObject: 'Countries', TargetField: 'countryId' },
        ],
    },
    ShippingMethods: {
        Path: 'ShippingMethods',
        Label: 'Shipping Methods',
        Description: 'Shipping method definitions with base pricing and weight-based rates',
        ResponseDataKey: 'shippingMethods',
        PKFields: ['id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    PaymentProcessors: {
        Path: 'PaymentProcessors',
        Label: 'Payment Processors',
        Description: 'Configured payment processors with active/primary status and card order types',
        ResponseDataKey: 'PaymentProcessorList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    CustomTaxLocations: {
        Path: 'CustomTaxLocations',
        Label: 'Custom Tax Locations',
        Description: 'Locations with custom tax rate overrides for commerce transactions',
        ResponseDataKey: 'CustomTaxLocations',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    QBClasses: {
        Path: 'QBClasses',
        Label: 'QuickBooks Classes',
        Description: 'QuickBooks class definitions for accounting integration and financial categorization',
        ResponseDataKey: 'List',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    MembershipModifiers: {
        Path: 'MembershipModifiers/{ParentID}',
        Label: 'Membership Modifiers',
        Description: 'Price modifier rules per membership plan (discounts, surcharges)',
        ResponseDataKey: 'ModifierList',
        PKFields: ['ID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Memberships', ParentPKField: 'Id', ParentFKFieldName: 'MembershipID' },
        Relationships: [
            { FieldName: 'MembershipID', TargetObject: 'Memberships', TargetField: 'Id' },
        ],
    },
    MembershipPromoCodes: {
        Path: 'MembershipPromoCodes/{ParentID}',
        Label: 'Membership Promo Codes',
        Description: 'Promotional discount codes per membership plan with usage limits and expiration',
        ResponseDataKey: 'PromoCodeList',
        PKFields: ['PromoCodeId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Memberships', ParentPKField: 'Id', ParentFKFieldName: 'MembershipID' },
        Relationships: [
            { FieldName: 'MembershipID', TargetObject: 'Memberships', TargetField: 'Id' },
        ],
    },

    // ─── Tier 3: Community/social/admin data ────────────────────
    Announcements: {
        Path: 'Announcements',
        Label: 'Announcements',
        Description: 'Admin announcements with title, text, publication dates, and active status',
        ResponseDataKey: 'AnnouncementList',
        PKFields: ['AnnouncementId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    EmailSuppressionList: {
        Path: 'EmailSuppressionList',
        Label: 'Email Suppression List',
        Description: 'Email addresses suppressed from delivery with bounce counts and health rates',
        ResponseDataKey: 'SuppressionList',
        PKFields: ['Email'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        SupportsIncrementalSync: false,
    },
    SponsorRotators: {
        Path: 'SponsorRotators',
        Label: 'Sponsor Rotators',
        Description: 'Sponsor advertisement rotator configurations with display settings',
        ResponseDataKey: 'SponsorRotators',
        PKFields: ['RotatorId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },

    // ─── Per-member social/community endpoints ──────────────────
    MemberNetworks: {
        Path: 'Member/{ParentID}/Networks',
        Label: 'Member Networks',
        Description: 'Social network profile links for members (LinkedIn, Twitter, etc.)',
        ResponseDataKey: 'NetworkList',
        PKFields: ['NetworkId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Members', ParentPKField: 'ProfileID', ParentFKFieldName: 'ProfileID' },
        Relationships: [
            { FieldName: 'ProfileID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    MemberFavorites: {
        Path: 'Member/{ParentID}/Favorites',
        Label: 'Member Favorites',
        Description: 'Bookmarked/favorited items per member for personalization tracking',
        ResponseDataKey: 'FavoritesList',
        PKFields: ['FavoriteId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
        ParentObject: { ParentObjectKey: 'Members', ParentPKField: 'ProfileID', ParentFKFieldName: 'ProfileID' },
        Relationships: [
            { FieldName: 'ProfileID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    TimeZones: {
        Path: 'TimeZones',
        Label: 'Time Zones',
        Description: 'Time zone reference data with GMT offsets and display names',
        ResponseDataKey: 'zoneList',
        PKFields: ['fullName'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
};

/** Field definitions for known YM objects. Used by DiscoverFields. */
const YM_FIELD_SCHEMAS: Record<string, ExternalFieldSchema[]> = {
    Members: [
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EmailAddr', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'MemberTypeCode', Label: 'Member Type Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Phone', Label: 'Phone', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Address1', Label: 'Address 1', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Address2', Label: 'Address 2', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'City', Label: 'City', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'State', Label: 'State', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'PostalCode', Label: 'Postal Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Country', Label: 'Country', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Title', Label: 'Title', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'JoinDate', Label: 'Join Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'RenewalDate', Label: 'Renewal Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ExpirationDate', Label: 'Expiration Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'MemberSinceDate', Label: 'Member Since', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebsiteUrl', Label: 'Website URL', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Events: [
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Event Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Active', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'StartDate', Label: 'Start Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EndDate', Label: 'End Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'StartTime', Label: 'Start Time', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EndTime', Label: 'End Time', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsVirtual', Label: 'Is Virtual', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'VirtualMeetingType', Label: 'Virtual Meeting Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MemberTypes: [
        { Name: 'ID', Label: 'Type ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'TypeCode', Label: 'Type Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsDefault', Label: 'Is Default', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'PresetType', Label: 'Preset Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'SortOrder', Label: 'Sort Order', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Memberships: [
        { Name: 'Id', Label: 'Membership ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Code', Label: 'Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'DuesAmount', Label: 'Dues Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ProRatedDues', Label: 'Pro-Rated Dues', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'AllowMultipleOpenInvoices', Label: 'Allow Multiple Invoices', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Groups: [
        { Name: 'Id', Label: 'Group ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Group Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'GroupTypeName', Label: 'Group Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GroupTypeId', Label: 'Group Type ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    Products: [
        { Name: 'id', Label: 'Product ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'weight', Label: 'Weight', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'taxRate', Label: 'Tax Rate', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'quantity', Label: 'Quantity', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ProductActive', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsFeatured', Label: 'Is Featured', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ListInStore', Label: 'List In Store', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'taxable', Label: 'Taxable', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    DonationFunds: [
        { Name: 'fundId', Label: 'Fund ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'fundName', Label: 'Fund Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'fundOptionsCount', Label: 'Options Count', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    Certifications: [
        { Name: 'CertificationID', Label: 'Certification ID', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ID', Label: 'ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsActive', Label: 'Is Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'CEUsRequired', Label: 'CEUs Required', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Code', Label: 'Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    InvoiceItems: [
        { Name: 'LineItemID', Label: 'Line Item ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'InvoiceNo', Label: 'Invoice Number', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceType', Label: 'Invoice Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebSiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ConstituentID', Label: 'Constituent ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceNameFirst', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceNameLast', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'EmailAddress', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemType', Label: 'Line Item Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemDescription', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemDate', Label: 'Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemDateEntered', Label: 'Date Entered', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemAmount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemQuantity', Label: 'Quantity', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineTotal', Label: 'Line Total', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'OutstandingBalance', Label: 'Outstanding Balance', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentTerms', Label: 'Payment Terms', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GLCodeItemName', Label: 'GL Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'QBClassItemName', Label: 'QB Class', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentOption', Label: 'Payment Option', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    DuesTransactions: [
        { Name: 'TransactionID', Label: 'Transaction ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'InvoiceNumber', Label: 'Invoice Number', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebsiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ConstituentID', Label: 'Constituent ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Email', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'BalanceDue', Label: 'Balance Due', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentType', Label: 'Payment Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateSubmitted', Label: 'Date Submitted', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateProcessed', Label: 'Date Processed', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'MembershipRequested', Label: 'Membership Requested', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'CurrentMembership', Label: 'Current Membership', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'CurrentMembershipExpDate', Label: 'Membership Expiration', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'MemberType', Label: 'Member Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateMemberSignup', Label: 'Member Signup Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceDate', Label: 'Invoice Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ClosedBy', Label: 'Closed By', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    EventRegistrations: [
        { Name: 'Id', Label: 'Registrant ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'RegistrationID', Label: 'Registration ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DisplayName', Label: 'Display Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'HeadShotImage', Label: 'Head Shot Image', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateRegistered', Label: 'Date Registered', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'IsPrimary', Label: 'Is Primary', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'BadgeNumber', Label: 'Badge Number', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    EventSessions: [
        { Name: 'SessionId', Label: 'Session ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Name', Label: 'Session Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Presenter', Label: 'Presenter', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'StartDate', Label: 'Start Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'StartTime', Label: 'Start Time', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EndDate', Label: 'End Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EndTime', Label: 'End Time', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'MaxRegistrants', Label: 'Max Registrants', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'AllowCEUs', Label: 'Allow CEUs', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    EventTickets: [
        { Name: 'TicketId', Label: 'Ticket ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Name', Label: 'Ticket Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Quantity', Label: 'Quantity', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'UnitPrice', Label: 'Unit Price', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Type', Label: 'Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Category', Label: 'Category', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Active', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    EventCategories: [
        { Name: 'Id', Label: 'Category ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Category Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MemberGroups: [
        { Name: 'MemberGroupId', Label: 'Member Group ID', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GroupId', Label: 'Group ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GroupName', Label: 'Group Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GroupTypeName', Label: 'Group Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GroupTypeId', Label: 'Group Type ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    Connections: [
        { Name: 'ConnectionId', Label: 'Connection ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WorkTitle', Label: 'Work Title', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'City', Label: 'City', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'State', Label: 'State', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Email', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    DonationHistory: [
        { Name: 'intDonationId', Label: 'Donation ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DatDonation', Label: 'Donation Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'dblDonation', Label: 'Donation Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'strStatus', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'strFundName', Label: 'Fund Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'strDonorName', Label: 'Donor Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'strPaymentMethod', Label: 'Payment Method', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    EngagementScores: [
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'EngagementScore', Label: 'Engagement Score', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastUpdated', Label: 'Last Updated', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    GroupTypes: [
        { Name: 'Id', Label: 'Group Type ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'TypeName', Label: 'Type Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'SortIndex', Label: 'Sort Index', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    DonationTransactions: [
        { Name: 'TransactionID', Label: 'Transaction ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'WebsiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ConstituentID', Label: 'Constituent ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'FundName', Label: 'Fund Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateSubmitted', Label: 'Date Submitted', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentType', Label: 'Payment Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    StoreOrderDetails: [
        { Name: 'OrderDetailID', Label: 'Order Detail ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'OrderID', Label: 'Order ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebsiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ProductName', Label: 'Product Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Quantity', Label: 'Quantity', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'UnitPrice', Label: 'Unit Price', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'TotalPrice', Label: 'Total Price', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'OrderDate', Label: 'Order Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ShippingMethod', Label: 'Shipping Method', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    StoreOrders: [
        { Name: 'OrderID', Label: 'Order ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'WebsiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'OrderDate', Label: 'Order Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'TotalAmount', Label: 'Total Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ShippingMethod', Label: 'Shipping Method', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'TrackingNumber', Label: 'Tracking Number', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    CertificationsJournals: [
        { Name: 'EntryID', Label: 'Entry ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'CertificationName', Label: 'Certification Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'CEUsEarned', Label: 'CEUs Earned', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'EntryDate', Label: 'Entry Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebsiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    CertificationCreditTypes: [
        { Name: 'ID', Label: 'Credit Type ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Code', Label: 'Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsDefault', Label: 'Is Default', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'CreditsExpire', Label: 'Credits Expire', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    ProductCategories: [
        { Name: 'Id', Label: 'Category ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Category Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    CareerOpenings: [
        { Name: 'CareerOpeningID', Label: 'Career Opening ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Position', Label: 'Position', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'City', Label: 'City', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'State', Label: 'State', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Salary', Label: 'Salary', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DatePosted', Label: 'Date Posted', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ContactEmail', Label: 'Contact Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    Campaigns: [
        { Name: 'CampaignId', Label: 'Campaign ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'CampaignName', Label: 'Campaign Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Subject', Label: 'Subject', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'SenderEmail', Label: 'Sender Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateScheduled', Label: 'Date Scheduled', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateSent', Label: 'Date Sent', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    GLCodes: [
        { Name: 'GLCodeId', Label: 'GL Code ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'GLCodeName', Label: 'GL Code Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MembersProfiles: [
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true, Description: 'Unique member identifier' },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EmailAddress', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Title', Label: 'Title', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'MemberTypeCode', Label: 'Member Type Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'JoinDate', Label: 'Join Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ExpirationDate', Label: 'Expiration Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastModifiedDate', Label: 'Last Modified', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    PeopleIDs: [
        { Name: 'ID', Label: 'Person ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true, Description: 'Unique person identifier' },
        { Name: 'UserType', Label: 'User Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, Description: 'Member or Non-Member' },
        { Name: 'DateRegistered', Label: 'Date Registered', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    MembersGroupsBulk: [
        { Name: 'WebSiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: true, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Members' },
        { Name: 'GroupID', Label: 'Group ID', DataType: 'integer', IsRequired: true, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Groups' },
        { Name: 'GroupCode', Label: 'Group Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GroupName', Label: 'Group Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PrimaryGroup', Label: 'Primary Group', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    FinanceBatches: [
        { Name: 'BatchID', Label: 'Batch ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'CommerceType', Label: 'Commerce Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, Description: 'Type of transactions in batch' },
        { Name: 'ItemCount', Label: 'Item Count', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ClosedDate', Label: 'Closed Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'CreateDateTime', Label: 'Created', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    FinanceBatchDetails: [
        { Name: 'DetailID', Label: 'Detail ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'BatchID', Label: 'Batch ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'FinanceBatches' },
        { Name: 'InvoiceNumber', Label: 'Invoice Number', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentType', Label: 'Payment Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'TransactionDate', Label: 'Transaction Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    AllCampaigns: [
        { Name: 'CampaignId', Label: 'Campaign ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'CampaignName', Label: 'Campaign Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Subject', Label: 'Subject', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Category', Label: 'Category', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Type', Label: 'Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateScheduled', Label: 'Date Scheduled', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateSent', Label: 'Date Sent', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ProcessingCount', Label: 'Processing Count', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    CampaignEmailLists: [
        { Name: 'ListId', Label: 'List ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ListType', Label: 'List Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ListSize', Label: 'List Size', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ListName', Label: 'List Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ListArea', Label: 'List Area', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateCreated', Label: 'Date Created', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateModified', Label: 'Date Modified', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateLastUpdated', Label: 'Date Last Updated', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    EventAttendeeTypes: [
        { Name: 'Id', Label: 'Attendee Type ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Events' },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Active', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    EventSessionGroups: [
        { Name: 'SessionGroupId', Label: 'Session Group ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Events' },
        { Name: 'Name', Label: 'Group Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    EventCEUAwards: [
        { Name: 'AwardID', Label: 'Award ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Events' },
        { Name: 'CertificationID', Label: 'Certification ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Certifications' },
        { Name: 'CreditTypeID', Label: 'Credit Type ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'CertificationCreditTypes' },
        { Name: 'Credits', Label: 'Credits', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    EventRegistrationForms: [
        { Name: 'FormId', Label: 'Form ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'FormName', Label: 'Form Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'AutoApprove', Label: 'Auto Approve', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    EventIDs: [
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Events' },
        { Name: 'LastModifiedDate', Label: 'Last Modified', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    GroupMembershipLogs: [
        { Name: 'ItemID', Label: 'Item ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ID', Label: 'ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Members' },
        { Name: 'NamePrefix', Label: 'Name Prefix', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'MiddleName', Label: 'Middle Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Suffix', Label: 'Suffix', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Nickname', Label: 'Nickname', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'EmployerName', Label: 'Employer Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WorkTitle', Label: 'Work Title', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Date', Label: 'Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    DuesRules: [
        { Name: 'ID', Label: 'Rule ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Rule Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Selected', Label: 'Selected', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MemberReferrals: [
        { Name: 'ReferralId', Label: 'Referral ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ReferrerID', Label: 'Referrer Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Members' },
        { Name: 'ReferredID', Label: 'Referred Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Members' },
        { Name: 'ReferralDate', Label: 'Referral Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    MemberSubAccounts: [
        { Name: 'ID', Label: 'Sub-Account ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ParentID', Label: 'Parent Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Members' },
        { Name: 'DateRegistered', Label: 'Date Registered', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    Countries: [
        { Name: 'countryId', Label: 'Country ID', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'countryName', Label: 'Country Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'countryCode', Label: 'Country Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Locations: [
        { Name: 'locationCode', Label: 'Location Code', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'countryId', Label: 'Country ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Countries' },
        { Name: 'locationName', Label: 'Location Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'taxGLCode', Label: 'Tax GL Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'taxQBClass', Label: 'Tax QB Class', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    ShippingMethods: [
        { Name: 'id', Label: 'Shipping Method ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'method', Label: 'Method Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'basePrice', Label: 'Base Price', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'pricePerWeightUnit', Label: 'Price Per Weight Unit', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'isDefault', Label: 'Is Default', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    PaymentProcessors: [
        { Name: 'Id', Label: 'Processor ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Processor Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Active', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Primary', Label: 'Primary', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'CardOrderType', Label: 'Card Order Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    CustomTaxLocations: [
        { Name: 'Id', Label: 'Tax Location ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'CountryLabel', Label: 'Country', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Location', Label: 'Location', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'TaxRate', Label: 'Tax Rate', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    QBClasses: [
        { Name: 'Id', Label: 'QB Class ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'QB Class Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MembershipModifiers: [
        { Name: 'ID', Label: 'Modifier ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'MembershipID', Label: 'Membership ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Memberships' },
        { Name: 'Name', Label: 'Modifier Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MembershipPromoCodes: [
        { Name: 'PromoCodeId', Label: 'Promo Code ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'MembershipID', Label: 'Membership ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Memberships' },
        { Name: 'FriendlyName', Label: 'Friendly Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'DiscountAmount', Label: 'Discount Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ExpirationDate', Label: 'Expiration Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'UsageLimit', Label: 'Usage Limit', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Announcements: [
        { Name: 'AnnouncementId', Label: 'Announcement ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Title', Label: 'Title', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Text', Label: 'Text', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'StartDate', Label: 'Start Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EndDate', Label: 'End Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Active', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    EmailSuppressionList: [
        { Name: 'Email', Label: 'Email Address', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'SuppressionType', Label: 'Suppression Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'BounceCount', Label: 'Bounce Count', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'HealthRate', Label: 'Health Rate', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    SponsorRotators: [
        { Name: 'RotatorId', Label: 'Rotator ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'AutoScroll', Label: 'Auto Scroll', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Random', Label: 'Random', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'DateAdded', Label: 'Date Added', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Mode', Label: 'Mode', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Orientation', Label: 'Orientation', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'SchoolId', Label: 'School ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Speed', Label: 'Speed', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Title', Label: 'Title', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ClientId', Label: 'Client ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Heading', Label: 'Heading', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Height', Label: 'Height', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MemberNetworks: [
        { Name: 'NetworkId', Label: 'Network ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Members' },
        { Name: 'NetworkType', Label: 'Network Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, Description: 'Social network type (LinkedIn, Twitter, etc.)' },
        { Name: 'ProfileUrl', Label: 'Profile URL', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    MemberFavorites: [
        { Name: 'FavoriteId', Label: 'Favorite ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true, IsForeignKey: true, ForeignKeyTarget: 'Members' },
        { Name: 'ItemType', Label: 'Item Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ItemId', Label: 'Item ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateAdded', Label: 'Date Added', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    TimeZones: [
        { Name: 'fullName', Label: 'Full Name', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'gmtOffset', Label: 'GMT Offset', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
};

// ─── Connector Implementation ───────────────────────────────────

/**
 * Connector for the YourMembership (YM) AMS REST API.
 *
 * Auth flow:
 *   1. POST /Ams/Authenticate with credentials + ClientID
 *   2. Receive SessionId
 *   3. Pass SessionId as X-SS-ID header on all data requests
 *
 * Configuration JSON: { "ClientID": "25363", "APIKey": "...", "APIPassword": "..." }
 */
@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends BaseIntegrationConnector {
    /** Session cache keyed by ClientID */
    private sessionCache = new Map<string, YMSession>();

    // ─── Configuration parsing ───────────────────────────────────

    /**
     * Parses credentials from CompanyIntegration.CredentialID (preferred) or
     * falls back to CompanyIntegration.Configuration JSON for backwards compat.
     */
    protected async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<YMConnectionConfig> {
        // Try loading from linked Credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID && contextUser) {
            const config = await this.loadFromCredential(credentialID, contextUser);
            if (config) return config;
        }

        // Fallback: read from CompanyIntegration Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            return this.parseConfigJson(configJson);
        }

        throw new Error('No YM credentials found. Attach a credential with ClientID, APIKey, and APIPassword, or set Configuration JSON on the CompanyIntegration.');
    }

    private async loadFromCredential(credentialID: string, contextUser: UserInfo): Promise<YMConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            return this.parseConfigJson(credential.Values);
        } catch {
            return null; // Credential values don't match expected format
        }
    }

    private parseConfigJson(json: string): YMConnectionConfig {
        const parsed = JSON.parse(json) as Record<string, string>;
        // Support both PascalCase (Configuration JSON) and camelCase (Credential entity schema)
        const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
        const apiKey = parsed['APIKey'] || parsed['apiKey'] || parsed['ApiKey'];
        const apiPassword = parsed['APIPassword'] || parsed['apiPassword'] || parsed['ApiPassword'];

        if (!clientId || !apiKey || !apiPassword) {
            throw new Error('Configuration JSON must contain ClientID, APIKey, and APIPassword (any casing)');
        }

        return { ClientID: String(clientId), APIKey: apiKey, APIPassword: apiPassword };
    }

    // ─── Session management ──────────────────────────────────────

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

    // ─── HTTP helper ─────────────────────────────────────────────

    /**
     * Makes a GET request to a YM API endpoint using session auth.
     * Retries once on 401 (session expiry).
     */
    protected async MakeRequest(
        config: YMConnectionConfig,
        endpoint: string,
        queryParams?: Record<string, string>
    ): Promise<Record<string, unknown>> {
        const maxRetries = 5;
        const sessionId = await this.GetSession(config);
        const url = this.BuildUrl(config.ClientID, endpoint, queryParams);

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let response = await this.FetchWithSession(url, sessionId);

            if (response.status === 401) {
                this.InvalidateSession(config.ClientID);
                const newSessionId = await this.GetSession(config);
                response = await this.FetchWithSession(url, newSessionId);
            }

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') ?? '0', 10);
                const delayMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 30000);
                console.warn(`YM rate limited (429) on ${endpoint}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                await this.Sleep(delayMs);
                continue;
            }

            if (!response.ok) {
                throw new Error(`YM API error for ${endpoint}: ${response.status} ${response.statusText}`);
            }

            const json = await response.json() as Record<string, unknown>;
            this.CheckResponseError(json, endpoint);
            return json;
        }

        throw new Error(`YM API error for ${endpoint}: 429 Too Many Requests (exceeded ${maxRetries} retries)`);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async FetchWithSession(url: string, sessionId: string): Promise<Response> {
        return fetch(url, {
            method: 'GET',
            headers: { 'X-SS-ID': sessionId, 'Accept': 'application/json' },
        });
    }

    private BuildUrl(clientId: string, endpoint: string, queryParams?: Record<string, string>): string {
        const base = `${YM_API_BASE}/Ams/${clientId}/${endpoint}`;
        if (!queryParams || Object.keys(queryParams).length === 0) {
            return base;
        }
        const qs = new URLSearchParams(queryParams).toString();
        return `${base}?${qs}`;
    }

    private CheckResponseError(json: Record<string, unknown>, endpoint: string): void {
        const rs = json['ResponseStatus'] as { ErrorCode?: string; Message?: string } | undefined;
        if (rs?.ErrorCode && rs.ErrorCode !== 'None' && rs.ErrorCode !== '') {
            throw new Error(`YM API error for ${endpoint}: ${rs.Message ?? rs.ErrorCode}`);
        }
    }

    // ─── BaseIntegrationConnector implementation ─────────────────

    /** Tests connectivity by authenticating and fetching ClientConfig. */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            await this.GetSession(config);
            const clientConfig = await this.MakeRequest(config, 'ClientConfig');
            const siteUrl = (clientConfig['SiteUrl'] as string) ?? 'Unknown';

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

    /** Returns all known YM object types available for integration. */
    public async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return Object.entries(YM_OBJECTS).map(([name, cfg]) => ({
            Name: name,
            Label: cfg.Label,
            Description: cfg.Description,
            SupportsIncrementalSync: cfg.SupportsIncrementalSync,
            SupportsWrite: false,
        }));
    }

    /**
     * Override IntrospectSchema to populate Relationships from YM_OBJECTS config.
     * This enables the Schema Builder to generate soft FK entries in additionalSchemaInfo.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const schema = await super.IntrospectSchema(companyIntegration, contextUser);

        // Inject relationships from our object registry
        for (const obj of schema.Objects) {
            const config = YM_OBJECTS[obj.ExternalName];
            if (config?.Relationships) {
                obj.Relationships = config.Relationships;
                // Also mark FK fields on the field list
                for (const rel of config.Relationships) {
                    const field = obj.Fields.find(f => f.Name === rel.FieldName);
                    if (field) {
                        field.IsForeignKey = true;
                        field.ForeignKeyTarget = rel.TargetObject;
                    }
                }
            }
        }

        return schema;
    }

    /** Returns the known field schema for a YM object. */
    public async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        return YM_FIELD_SCHEMAS[objectName] ?? [];
    }

    /**
     * Fetches a batch of records from a YM API endpoint.
     *
     * For paginated endpoints (Members, Events, Certifications), uses
     * PageSize/PageNumber. The watermark tracks the current page number
     * for resuming large fetches across batches.
     *
     * For non-paginated endpoints (MemberTypes, Memberships, Groups, Products),
     * fetches all data in one call.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const config = await this.ParseConfig(ctx.CompanyIntegration, ctx.ContextUser);
        const objectConfig = YM_OBJECTS[ctx.ObjectName];

        if (!objectConfig) {
            throw new Error(`Unknown YourMembership object: ${ctx.ObjectName}`);
        }

        if (ctx.ObjectName === 'Groups' || ctx.ObjectName === 'GroupTypes') {
            return this.FetchGroups(config, ctx, ctx.ObjectName === 'GroupTypes');
        }

        if (objectConfig.ParentObject) {
            return this.FetchPerParent(config, ctx, objectConfig);
        }

        if (objectConfig.ResponseDataKey === null) {
            return this.FetchRawArray(config, ctx, objectConfig);
        }

        if (objectConfig.UsesOffSetPagination) {
            return this.FetchWithOffSet(config, ctx, objectConfig);
        }

        if (objectConfig.SupportsPagination) {
            return this.FetchPaginated(config, ctx, objectConfig);
        }

        return this.FetchAll(config, ctx, objectConfig);
    }

    /** Fetches data from a paginated YM endpoint. Watermark = page number. */
    private async FetchPaginated(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const pageNumber = ctx.WatermarkValue ? Number(ctx.WatermarkValue) : 1;
        const pageSize = Math.min(ctx.BatchSize, objectConfig.DefaultPageSize);

        const queryParams: Record<string, string> = {
            PageSize: String(pageSize),
            PageNumber: String(pageNumber),
            ...(objectConfig.DefaultQueryParams ?? {}),
        };

        const json = await this.MakeRequest(config, objectConfig.Path, queryParams);
        const dataArray = json[objectConfig.ResponseDataKey!];

        if (!dataArray || !Array.isArray(dataArray)) {
            return { Records: [], HasMore: false };
        }

        let records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        // Enrich with detail endpoint if available
        records = await this.EnrichRecordsWithDetails(config, records, objectConfig);

        const hasMore = records.length >= pageSize;
        const newWatermark = hasMore ? String(pageNumber + 1) : undefined;

        return { Records: records, HasMore: hasMore, NewWatermarkValue: newWatermark };
    }

    /** Fetches all data from a non-paginated endpoint in a single request. */
    private async FetchAll(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const json = await this.MakeRequest(config, objectConfig.Path, objectConfig.DefaultQueryParams);
        const dataArray = json[objectConfig.ResponseDataKey!];

        if (!dataArray || !Array.isArray(dataArray)) {
            return { Records: [], HasMore: false };
        }

        let records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        // Enrich with detail endpoint if available
        records = await this.EnrichRecordsWithDetails(config, records, objectConfig);

        return { Records: records, HasMore: false };
    }

    /**
     * Fetches data using OffSet-based pagination (InvoiceItems, DuesTransactions).
     * These YM endpoints use OffSet instead of PageNumber, with max PageSize of 100.
     * Watermark tracks the current offset position.
     */
    private async FetchWithOffSet(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const offset = ctx.WatermarkValue ? Number(ctx.WatermarkValue) : 0;
        const pageSize = Math.min(ctx.BatchSize, objectConfig.DefaultPageSize, 100);

        const queryParams: Record<string, string> = {
            ...(objectConfig.DefaultQueryParams ?? {}),
            PageSize: String(pageSize),
            PageNumber: '1',
            OffSet: String(offset),
        };

        // DonationTransactions requires DateFrom within the last 90 days
        if (ctx.ObjectName === 'DonationTransactions' && !queryParams['DateFrom']) {
            const d = new Date();
            d.setDate(d.getDate() - 89);
            queryParams['DateFrom'] = d.toISOString().split('T')[0];
        }

        const json = await this.MakeRequest(config, objectConfig.Path, queryParams);
        const dataArray = json[objectConfig.ResponseDataKey!];

        if (!dataArray || !Array.isArray(dataArray)) {
            return { Records: [], HasMore: false };
        }

        const records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        const hasMore = records.length >= pageSize;
        const newWatermark = hasMore ? String(offset + records.length) : undefined;

        return { Records: records, HasMore: hasMore, NewWatermarkValue: newWatermark };
    }

    /** Fetches endpoints that return a raw JSON array (e.g., Products). */
    private async FetchRawArray(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const sessionId = await this.GetSession(config);
        const url = this.BuildUrl(config.ClientID, objectConfig.Path, objectConfig.DefaultQueryParams);

        const response = await this.FetchWithSession(url, sessionId);
        if (!response.ok) {
            throw new Error(`YM API error for ${objectConfig.Path}: ${response.status}`);
        }

        const data = await response.json() as unknown;
        if (!Array.isArray(data)) {
            return { Records: [], HasMore: false };
        }

        let records = (data as Record<string, unknown>[]).map((item) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        // Enrich with detail endpoint if available
        records = await this.EnrichRecordsWithDetails(config, records, objectConfig);

        return { Records: records, HasMore: false };
    }

    /**
     * Fetches Groups or GroupTypes, which have a nested structure: GroupTypeList → Groups.
     * When typesOnly=false: Flattens into individual group records with the GroupType name attached.
     * When typesOnly=true: Returns just the GroupType entries without expanding child groups.
     */
    private async FetchGroups(
        config: YMConnectionConfig,
        ctx: FetchContext,
        typesOnly: boolean
    ): Promise<FetchBatchResult> {
        const json = await this.MakeRequest(config, 'Groups');
        const typeList = json['GroupTypeList'] as GroupTypeListItem[] | undefined;

        if (!typeList || !Array.isArray(typeList)) {
            return { Records: [], HasMore: false };
        }

        if (typesOnly) {
            const records = typeList.map((gt) => ({
                ExternalID: String(gt.Id ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: { Id: gt.Id, TypeName: gt.TypeName, SortIndex: gt.SortIndex } as Record<string, unknown>,
            }));
            return { Records: records, HasMore: false };
        }

        const records: ExternalRecord[] = [];
        for (const groupType of typeList) {
            const typeName = groupType.TypeName ?? '';
            for (const group of groupType.Groups ?? []) {
                records.push({
                    ExternalID: String(group.Id),
                    ObjectType: ctx.ObjectName,
                    Fields: { ...group, GroupTypeName: typeName, GroupTypeId: groupType.Id },
                });
            }
        }

        return { Records: records, HasMore: false };
    }

    /**
     * Fetches data from per-parent endpoints by iterating over all parent records.
     * For example, EventRegistrations requires calling /Event/{EventId}/EventRegistrations
     * for each Event, and MemberGroups requires calling /Member/{ProfileID}/Groups per member.
     *
     * The watermark tracks: `{parentIndex}:{childOffset}` to resume across batches.
     */
    private async FetchPerParent(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const parentConfig = objectConfig.ParentObject!;
        const parentObjConfig = YM_OBJECTS[parentConfig.ParentObjectKey];
        if (!parentObjConfig) {
            throw new Error(`Unknown parent object: ${parentConfig.ParentObjectKey}`);
        }

        // First, fetch all parent IDs
        const parentIds = await this.FetchAllParentIds(config, parentConfig.ParentObjectKey, parentConfig.ParentPKField);
        if (parentIds.length === 0) {
            return { Records: [], HasMore: false };
        }

        // Parse watermark: parentIndex (which parent we're on)
        const startIndex = ctx.WatermarkValue ? Number(ctx.WatermarkValue) : 0;
        const allRecords: ExternalRecord[] = [];
        const concurrency = 5;

        // Process parents in batches of concurrency, starting from watermark
        for (let i = startIndex; i < parentIds.length; i += concurrency) {
            const batch = parentIds.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map(parentId => this.FetchChildRecords(config, ctx, objectConfig, parentId, parentConfig))
            );

            for (const records of batchResults) {
                allRecords.push(...records);
            }

            // If we've collected enough, return with watermark for next batch
            if (allRecords.length >= ctx.BatchSize && i + concurrency < parentIds.length) {
                return {
                    Records: allRecords,
                    HasMore: true,
                    NewWatermarkValue: String(i + concurrency),
                };
            }
        }

        return { Records: allRecords, HasMore: false };
    }

    /** Fetches all parent IDs for a given parent object type. */
    private async FetchAllParentIds(
        config: YMConnectionConfig,
        parentObjectKey: string,
        parentPKField: string
    ): Promise<string[]> {
        const parentObjConfig = YM_OBJECTS[parentObjectKey];
        if (!parentObjConfig) return [];

        const allIds: string[] = [];

        if (parentObjConfig.SupportsPagination) {
            let pageNumber = 1;
            let hasMore = true;
            while (hasMore) {
                const queryParams: Record<string, string> = {
                    PageSize: String(parentObjConfig.DefaultPageSize),
                    PageNumber: String(pageNumber),
                    ...(parentObjConfig.DefaultQueryParams ?? {}),
                };
                const json = await this.MakeRequest(config, parentObjConfig.Path, queryParams);
                const dataArray = json[parentObjConfig.ResponseDataKey!];
                if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
                    hasMore = false;
                } else {
                    for (const item of dataArray as Record<string, unknown>[]) {
                        const id = item[parentPKField];
                        if (id != null) allIds.push(String(id));
                    }
                    hasMore = dataArray.length >= parentObjConfig.DefaultPageSize;
                    pageNumber++;
                }
            }
        } else {
            // Non-paginated parent — fetch all at once
            const json = await this.MakeRequest(config, parentObjConfig.Path, parentObjConfig.DefaultQueryParams);
            const dataArray = json[parentObjConfig.ResponseDataKey!];
            if (dataArray && Array.isArray(dataArray)) {
                for (const item of dataArray as Record<string, unknown>[]) {
                    const id = item[parentPKField];
                    if (id != null) allIds.push(String(id));
                }
            }
        }

        return allIds;
    }

    /** Fetches child records for a single parent and injects the parent FK. */
    private async FetchChildRecords(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig,
        parentId: string,
        parentConfig: NonNullable<YMObjectConfig['ParentObject']>
    ): Promise<ExternalRecord[]> {
        const endpoint = objectConfig.Path.replace('{ParentID}', parentId);

        try {
            const json = await this.MakeRequest(config, endpoint, objectConfig.DefaultQueryParams);

            // Special handling for MemberGroups (nested GroupTypeList → Groups)
            if (ctx.ObjectName === 'MemberGroups') {
                return this.FlattenMemberGroups(json, parentId, ctx.ObjectName);
            }

            // Special handling for EngagementScores (single object response, not array)
            if (ctx.ObjectName === 'EngagementScores') {
                return this.BuildEngagementScoreRecord(json, parentId, ctx.ObjectName);
            }

            // Standard array response
            let dataArray: unknown[];
            if (objectConfig.ResponseDataKey) {
                const raw = json[objectConfig.ResponseDataKey];
                if (!raw || !Array.isArray(raw)) return [];
                dataArray = raw;
            } else {
                // Raw response — check if json itself is array-like
                if (Array.isArray(json)) {
                    dataArray = json;
                } else {
                    return [];
                }
            }

            return (dataArray as Record<string, unknown>[]).map(item => {
                const fields = { ...item, [parentConfig.ParentFKFieldName]: parentId };
                const externalId = objectConfig.PKFields.map(pk => String(fields[pk] ?? '')).join('|');
                return { ExternalID: externalId, ObjectType: ctx.ObjectName, Fields: fields };
            });
        } catch (err: unknown) {
            // If one parent fails (e.g., 404), skip it and continue
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Failed to fetch ${ctx.ObjectName} for parent ${parentId}: ${message}`);
            return [];
        }
    }

    /** Flattens MemberGroups nested GroupTypeList response into flat records. */
    private FlattenMemberGroups(
        json: Record<string, unknown>,
        profileId: string,
        objectType: string
    ): ExternalRecord[] {
        const typeList = json['GroupTypeList'] as GroupTypeListItem[] | undefined;
        if (!typeList || !Array.isArray(typeList)) return [];

        const records: ExternalRecord[] = [];
        for (const groupType of typeList) {
            const typeName = groupType.TypeName ?? '';
            for (const group of groupType.Groups ?? []) {
                const compositeId = `${profileId}|${group.Id}`;
                records.push({
                    ExternalID: compositeId,
                    ObjectType: objectType,
                    Fields: {
                        MemberGroupId: compositeId,
                        ProfileID: profileId,
                        GroupId: group.Id,
                        GroupName: group.Name,
                        GroupTypeName: typeName,
                        GroupTypeId: groupType.Id,
                    },
                });
            }
        }
        return records;
    }

    /** Builds a single EngagementScore record from the per-member response. */
    private BuildEngagementScoreRecord(
        json: Record<string, unknown>,
        profileId: string,
        objectType: string
    ): ExternalRecord[] {
        const filtered = this.FilterMetadataKeys(json);
        if (Object.keys(filtered).length === 0) return [];
        return [{
            ExternalID: profileId,
            ObjectType: objectType,
            Fields: { ...filtered, ProfileID: profileId },
        }];
    }

    // ─── Default field mappings ──────────────────────────────────

    /** Returns suggested default field mappings for YM objects to MJ entities. */
    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'YourMembership',
            DefaultObjects: Object.entries(YM_OBJECTS).map(([name, cfg]) => ({
                SourceObjectName: name,
                TargetTableName: cfg.Label.replace(/[^A-Za-z0-9_]/g, ''),
                TargetEntityName: `YM ${cfg.Label}`,
                SyncEnabled: true,
                FieldMappings: this.GetDefaultFieldMappings(name, cfg.Label),
            })),
        };
    }

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

    // ─── Record building ─────────────────────────────────────────

    private BuildRecord(
        item: Record<string, unknown>,
        pkFields: string[],
        objectType: string
    ): ExternalRecord {
        const externalId = pkFields.map(pk => String(item[pk] ?? '')).join('|');
        return {
            ExternalID: externalId,
            ObjectType: objectType,
            Fields: { ...item },
        };
    }

    // ─── Detail enrichment ───────────────────────────────────────

    /**
     * Enriches a batch of records by fetching full detail data for each record
     * via the object's detail endpoint. List endpoints often return sparse data;
     * detail endpoints return all available fields for a record.
     *
     * Records are enriched in parallel with a concurrency limit to avoid
     * overwhelming the API.
     */
    private async EnrichRecordsWithDetails(
        config: YMConnectionConfig,
        records: ExternalRecord[],
        objectConfig: YMObjectConfig
    ): Promise<ExternalRecord[]> {
        if (!objectConfig.DetailPath || records.length === 0) {
            return records;
        }

        const concurrency = 10;
        const enriched: ExternalRecord[] = [];

        for (let i = 0; i < records.length; i += concurrency) {
            const batch = records.slice(i, i + concurrency);
            const results = await Promise.all(
                batch.map(record => this.EnrichSingleRecord(config, record, objectConfig))
            );
            enriched.push(...results);
        }

        return enriched;
    }

    /**
     * Fetches full detail data for a single record and merges it with
     * the existing list data. Detail fields override list fields.
     */
    private async EnrichSingleRecord(
        config: YMConnectionConfig,
        record: ExternalRecord,
        objectConfig: YMObjectConfig
    ): Promise<ExternalRecord> {
        try {
            const detailPath = objectConfig.DetailPath!.replace('{PK}', record.ExternalID);
            const json = await this.MakeRequest(config, detailPath);

            const detailData = objectConfig.DetailResponseKey != null
                ? json[objectConfig.DetailResponseKey] as Record<string, unknown> | undefined
                : json;

            if (detailData && typeof detailData === 'object') {
                const normalized = this.NormalizeDetailFields(detailData, objectConfig);
                record.Fields = { ...record.Fields, ...normalized };
            }
        } catch {
            // If detail fetch fails for one record, keep the list data
            // and continue — don't fail the entire batch
        }

        return record;
    }

    /**
     * Normalizes detail response fields to match our expected field names.
     * The YM detail endpoints use camelCase and nested objects,
     * while our schema uses PascalCase and flat structure.
     */
    private NormalizeDetailFields(
        detail: Record<string, unknown>,
        objectConfig: YMObjectConfig
    ): Record<string, unknown> {
        if (objectConfig.Path === 'MemberList') {
            return this.NormalizeMemberDetail(detail);
        }
        // For other object types, just filter out metadata keys
        return this.FilterMetadataKeys(detail);
    }

    /**
     * Maps the Members detail endpoint response to our flat PascalCase schema.
     * Detail endpoint returns: { firstName, lastName, emailAddress, primaryAddress: { ... } }
     * We need:                 { FirstName, LastName, EmailAddr, Phone, Address1, ... }
     */
    private NormalizeMemberDetail(detail: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const addr = detail['primaryAddress'] as Record<string, unknown> | undefined;

        // Direct field mappings (detail camelCase → our PascalCase)
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
                if (detailKey === 'isMember') {
                    result[ourKey] = value ? 'Active' : 'Inactive';
                } else {
                    result[ourKey] = value;
                }
            }
        }

        // Address fields (nested → flat)
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

    /** Filters out YM API metadata keys that shouldn't be stored as field data. */
    private FilterMetadataKeys(data: Record<string, unknown>): Record<string, unknown> {
        const metadataKeys = new Set([
            'ResponseStatus', 'UsingRedis', 'AppInitTime', 'ServerID',
            'ClientID', 'BypassCache', 'DateCached', 'Device',
        ]);
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
            if (!metadataKeys.has(key)) {
                result[key] = value;
            }
        }
        return result;
    }
}

/** Shape of a GroupType entry from the Groups endpoint */
interface GroupTypeListItem {
    Id?: number;
    TypeName?: string;
    SortIndex?: number;
    Groups?: Array<{ Id: number; Name: string; [key: string]: unknown }>;
}
