/**
 * Personify360Connector — Integration connector for Personify360 AMS (Novus REST APIs).
 *
 * API Documentation: https://support.higherlogic.com/hc/en-us/articles/360033048791-Personify-Integration-Guide
 *
 * Auth: OAuth 2.0 Client Credentials (Bearer token) against the Personify auth service.
 *       Token endpoint: https://{tenant}.personifycloud.com/oauth2/token
 *
 * Multi-Service Architecture:
 *   - Vault service:        https://{tenant}.personifycloud.com/vault/api/v1     — member/contact data
 *   - Provisioning service: https://{tenant}.personifycloud.com/provisioning/api/v1 — security/users
 *   - Gateway service:      https://{tenant}.personifycloud.com/gateway/api/v1   — orders/transactions
 *
 * Pagination: Offset-based (pageNumber + pageSize)
 * Rate limits: Not documented; conservative 200ms throttle applied
 * Incremental: modifiedAfter timestamp filter on supported endpoints
 * CRUD: Full Create/Read/Update; soft-delete via status update
 *
 * API Categories:
 *   - Vault API (implemented) — organizations, individuals, memberships, addresses
 *   - Provisioning API (implemented) — user accounts, security groups, permissions
 *   - Gateway API (implemented) — orders, transactions, products
 *   - Real Magnet Universal Webservice (NOT implemented) — legacy email API, superseded
 *   - Personify Reports API (NOT implemented) — custom report engine, separate product
 *   - Webhooks (NOT implemented) — contact Personify support to configure webhooks
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

export interface Personify360ConnectionConfig {
    TenantID: string;    // e.g. "yourorg" in yourorg.personifycloud.com
    ClientID: string;
    ClientSecret: string;
}

interface P360AuthContext extends RESTAuthContext {
    Config: Personify360ConnectionConfig;
    VaultURL: string;
    ProvisioningURL: string;
    GatewayURL: string;
    TokenURL: string;
}

interface CachedToken {
    AccessToken: string;
    ExpiresAt: number;
}

interface P360PagedResponse {
    data: Record<string, unknown>[];
    meta?: { totalCount: number; pageNumber: number; pageSize: number };
    // Some endpoints use different envelope shapes
    items?: Record<string, unknown>[];
    totalCount?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

const P360_PAGE_SIZE = 200;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 200;

// ─── Static Object Definitions ────────────────────────────────────────────

const P360_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Organizations',
        DisplayName: 'Organization',
        Description: 'Member organizations (companies) in Personify360 Vault',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Organization UUID' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization name' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization type' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active/Inactive status' },
            { Name: 'website', DisplayName: 'Website', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization website' },
            { Name: 'phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email' },
            { Name: 'createdOn', DisplayName: 'Created On', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Record creation timestamp' },
            { Name: 'modifiedOn', DisplayName: 'Modified On', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
        ],
    },
    {
        Name: 'Individuals',
        DisplayName: 'Individual (Member)',
        Description: 'Individual member and contact records in Personify360 Vault',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Individual UUID' },
            { Name: 'firstName', DisplayName: 'First Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'First name' },
            { Name: 'lastName', DisplayName: 'Last Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last name' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email' },
            { Name: 'phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone' },
            { Name: 'organizationId', DisplayName: 'Organization ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated organization UUID' },
            { Name: 'membershipStatus', DisplayName: 'Membership Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current membership status' },
            { Name: 'personifyId', DisplayName: 'Personify ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Legacy Personify member ID' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active/Inactive/Deceased' },
            { Name: 'createdOn', DisplayName: 'Created On', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Record creation timestamp' },
            { Name: 'modifiedOn', DisplayName: 'Modified On', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
        ],
    },
    {
        Name: 'Memberships',
        DisplayName: 'Membership',
        Description: 'Membership records linking individuals/organizations to membership types',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership UUID' },
            { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Individual or Organization UUID' },
            { Name: 'membershipTypeId', DisplayName: 'Membership Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Membership type UUID' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active/Expired/Lapsed/Pending' },
            { Name: 'beginDate', DisplayName: 'Begin Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Membership start date' },
            { Name: 'endDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Membership expiration date' },
            { Name: 'paidThruDate', DisplayName: 'Paid Through', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Paid-through date' },
        ],
    },
    {
        Name: 'Addresses',
        DisplayName: 'Address',
        Description: 'Addresses for individuals and organizations',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Address UUID' },
            { Name: 'ownerId', DisplayName: 'Owner ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Individual or Organization UUID' },
            { Name: 'addressType', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address type (Home, Business, etc.)' },
            { Name: 'street1', DisplayName: 'Street 1', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street line 1' },
            { Name: 'street2', DisplayName: 'Street 2', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street line 2' },
            { Name: 'city', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'state', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State/province' },
            { Name: 'postalCode', DisplayName: 'Postal Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'ZIP/postal code' },
            { Name: 'country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country code' },
            { Name: 'isPrimary', DisplayName: 'Primary', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary address flag' },
        ],
    },
    {
        Name: 'Events',
        DisplayName: 'Event',
        Description: 'Events in Personify360',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event UUID' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event name' },
            { Name: 'eventCode', DisplayName: 'Event Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Short event code' },
            { Name: 'startDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event start' },
            { Name: 'endDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event end' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event status' },
            { Name: 'capacity', DisplayName: 'Capacity', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Maximum attendees' },
        ],
    },
    {
        Name: 'Orders',
        DisplayName: 'Order / Transaction',
        Description: 'Purchase orders and transactions in Personify360 Gateway',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Order UUID' },
            { Name: 'orderNumber', DisplayName: 'Order Number', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Display order number' },
            { Name: 'customerId', DisplayName: 'Customer ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Individual or Organization UUID' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Order status' },
            { Name: 'totalAmount', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Order total' },
            { Name: 'currency', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Currency code' },
            { Name: 'orderDate', DisplayName: 'Order Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date order was placed' },
            { Name: 'createdOn', DisplayName: 'Created On', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Record creation timestamp' },
        ],
    },
    {
        Name: 'UserAccounts',
        DisplayName: 'User Account',
        Description: 'User login accounts (Provisioning service)',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'User account UUID' },
            { Name: 'username', DisplayName: 'Username', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Login username' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Account email' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active/Inactive/Locked' },
            { Name: 'personId', DisplayName: 'Person ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Linked Individual UUID' },
            { Name: 'lastLoginOn', DisplayName: 'Last Login', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Most recent login time' },
        ],
    },
    // ─── Additional P360 Novus API endpoints — lean overlay ──
    // Events
    { Name: 'EventRegistrations', DisplayName: 'Event Registration', Description: 'Event registrations', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration UUID' },
        { Name: 'eventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
        { Name: 'modifiedOn', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Sessions', DisplayName: 'Event Session', Description: 'Sessions within events', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Session UUID' },
        { Name: 'eventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'Speakers', DisplayName: 'Speaker', Description: 'Event speakers', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Speaker UUID' },
    ]},
    // Fundraising
    { Name: 'Donations', DisplayName: 'Donation', Description: 'Donation/gift records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
        { Name: 'modifiedOn', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'P360Pledges', DisplayName: 'Pledge', Description: 'Pledge commitments', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Pledge UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'P360Campaigns', DisplayName: 'Campaign', Description: 'Fundraising campaigns', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign UUID' },
    ]},
    { Name: 'P360Funds', DisplayName: 'Fund', Description: 'Fund/appeal codes', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Fund UUID' },
    ]},
    // Governance
    { Name: 'Committees', DisplayName: 'Committee', Description: 'Committees and boards', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Committee UUID' },
    ]},
    { Name: 'CommitteeMembers', DisplayName: 'Committee Member', Description: 'Committee membership', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership UUID' },
        { Name: 'committeeId', DisplayName: 'Committee ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Committees' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    // Education / Certification
    { Name: 'Certifications', DisplayName: 'Certification', Description: 'Certification records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Cert UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'ContinuingEducation', DisplayName: 'CE Credit', Description: 'Continuing education credits', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'CE UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    // Commerce
    { Name: 'P360Products', DisplayName: 'Product', Description: 'Product catalog', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product UUID' },
    ]},
    { Name: 'P360Payments', DisplayName: 'Payment', Description: 'Payment transactions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Payment UUID' },
        { Name: 'modifiedOn', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'P360Invoices', DisplayName: 'Invoice', Description: 'Invoice records', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invoice UUID' },
    ]},
    // Constituent
    { Name: 'Communications', DisplayName: 'Communication', Description: 'Email/phone/fax records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Comm UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'Relationships', DisplayName: 'Relationship', Description: 'Constituent relationships', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Relationship UUID' },
    ]},
    // Lookup
    { Name: 'MembershipCategories', DisplayName: 'Membership Category', Description: 'Membership type definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category UUID' },
    ]},
    // ─── Remaining P360 sub-resources ──
    { Name: 'SessionRegistrations', DisplayName: 'Session Registration', Description: 'Session-level registrations', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Reg UUID' },
        { Name: 'sessionId', DisplayName: 'Session ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Sessions' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'Exhibitors', DisplayName: 'Exhibitor', Description: 'Event exhibitors', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Exhibitor UUID' },
        { Name: 'eventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'Venues', DisplayName: 'Venue', Description: 'Event venues', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Venue UUID' },
    ]},
    { Name: 'GiftHistory', DisplayName: 'Gift History', Description: 'Historical giving summary view', SupportsWrite: false, Fields: [
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Individuals' },
    ]},
    { Name: 'Receipts', DisplayName: 'Receipt', Description: 'Donation receipts', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Receipt UUID' },
        { Name: 'modifiedOn', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'P360Education', DisplayName: 'Education', Description: 'Education/degree records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Education UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'Exams', DisplayName: 'Exam', Description: 'Exam records for certifications', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Exam UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'OrderDetails', DisplayName: 'Order Detail', Description: 'Order line items', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Detail UUID' },
        { Name: 'orderId', DisplayName: 'Order ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Orders' },
    ]},
    { Name: 'ShoppingCarts', DisplayName: 'Shopping Cart', Description: 'Active shopping cart records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Cart UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'Dues', DisplayName: 'Dues', Description: 'Dues billing records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Dues UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
        { Name: 'modifiedOn', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Subscriptions', DisplayName: 'Subscription', Description: 'Publication subscriptions', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sub UUID' },
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Individuals' },
    ]},
    { Name: 'P360MembershipTypes', DisplayName: 'Membership Type', Description: 'Membership subtype definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type UUID' },
    ]},
    { Name: 'Demographics', DisplayName: 'Demographics', Description: 'Demographic data', SupportsWrite: true, Fields: [
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Individuals' },
    ]},
    { Name: 'Preferences', DisplayName: 'Preference', Description: 'Communication preferences', SupportsWrite: true, Fields: [
        { Name: 'memberId', DisplayName: 'Member ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Individuals' },
    ]},
    { Name: 'CustomerInfos', DisplayName: 'Customer Info', Description: 'Customer master info records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Info UUID' },
        { Name: 'modifiedOn', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Lookups
    { Name: 'Countries', DisplayName: 'Country', Description: 'Country code lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Country code' },
    ]},
    { Name: 'States', DisplayName: 'State', Description: 'State/province code lookup', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'State code' },
    ]},
    { Name: 'CodeTables', DisplayName: 'Code Table', Description: 'Generic code table values', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Code ID' },
    ]},
    { Name: 'P360CustomFields', DisplayName: 'Custom Field Def', Description: 'Custom field definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Field UUID' },
    ]},
];

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'Personify360Connector')
export class Personify360Connector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Personify360'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return false; } // Soft-delete via status update

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return P360_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-building';
        config.CategoryDescription = 'Personify360 AMS for members, organizations, events, orders, and transactions';
        config.ParentCategoryName = 'Business Apps';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ─────────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return P360_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: ['Organizations', 'Individuals', 'Memberships', 'Orders'].includes(obj.Name),
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as P360AuthContext;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, `${auth.VaultURL}/${objectName.toLowerCase()}?pageSize=1&pageNumber=1`, 'GET', headers);
            if (response.Status === 200) {
                const records = this.NormalizeResponse(response.Body, null);
                if (records.length > 0) return this.InferFieldsWithOverlay(records[0], objectName, P360_OBJECTS);
            }
        } catch { /* fall through */ }
        const staticObj = P360_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!staticObj) return [];
        return staticObj.Fields.map(f => ({ Name: f.Name, Label: f.DisplayName, Description: f.Description, DataType: f.Type, IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly }));
    }

    private InferFieldsWithOverlay(sample: Record<string, unknown>, objectName: string, allObjects: IntegrationObjectInfo[]): ExternalFieldSchema[] {
        const staticObj = allObjects.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));
        const fields: ExternalFieldSchema[] = [];
        for (const [key, value] of Object.entries(sample)) {
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
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            return this.BuildAuthContext(this.tokenCache.AccessToken, config);
        }
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const token = await this.ObtainToken(config);
        this.tokenCache = token;
        return this.BuildAuthContext(token.AccessToken, config);
    }

    private BuildAuthContext(accessToken: string, config: Personify360ConnectionConfig): P360AuthContext {
        const base = `https://${config.TenantID}.personifycloud.com`;
        return {
            Token: accessToken,
            TokenType: 'Bearer',
            Config: config,
            VaultURL: `${base}/vault/api/v1`,
            ProvisioningURL: `${base}/provisioning/api/v1`,
            GatewayURL: `${base}/gateway/api/v1`,
            TokenURL: `${base}/oauth2/token`,
        } as P360AuthContext;
    }

    private async ObtainToken(config: Personify360ConnectionConfig): Promise<CachedToken> {
        const base = `https://${config.TenantID}.personifycloud.com`;
        const tokenURL = `${base}/oauth2/token`;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.ClientID,
            client_secret: config.ClientSecret,
        });

        const response = await fetch(tokenURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`Personify360 token request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        return {
            AccessToken: data.access_token,
            ExpiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000),
        };
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo
    ): Promise<Personify360ConnectionConfig> {
        // Use typed properties — never .Get()/.Set() on entity-typed objects (CLAUDE.md §2b).
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['TenantID'] && parsed['ClientID']) {
                    return {
                        TenantID: parsed['TenantID'],
                        ClientID: parsed['ClientID'],
                        ClientSecret: parsed['ClientSecret'] ?? '',
                    };
                }
            }
        }
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return {
                TenantID: parsed['TenantID'] ?? '',
                ClientID: parsed['ClientID'] ?? '',
                ClientSecret: parsed['ClientSecret'] ?? '',
            };
        }
        throw new Error(
            'No Personify360 credentials found. Set TenantID, ClientID, ClientSecret in credential Values or Configuration JSON.'
        );
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as P360AuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.VaultURL}/organizations?pageSize=1&pageNumber=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as P360PagedResponse;
                const count = body.meta?.totalCount ?? 0;
                return { Success: true, Message: `Connected to Personify360 — ${count} organizations` };
            }
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ──────────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as P360AuthContext).VaultURL;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        page: number, _offset: number, _cursor?: string
    ): string {
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}pageSize=${P360_PAGE_SIZE}&pageNumber=${page + 1}`;
    }

    // ─── Response Parsing ──────────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, _responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        if (Array.isArray(body['data'])) return body['data'] as Record<string, unknown>[];
        if (Array.isArray(body['items'])) return body['items'] as Record<string, unknown>[];
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, currentPage: number, currentOffset: number, pageSize: number
    ): PaginationState {
        const body = rawBody as P360PagedResponse;
        const records = this.NormalizeResponse(rawBody, null);
        const total = body.meta?.totalCount ?? body.totalCount ?? 0;
        const fetched = currentOffset + records.length;
        return {
            HasMore: fetched < total,
            NextOffset: fetched,
        };
    }

    // ─── FetchChanges ──────────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectLower = ctx.ObjectName.toLowerCase();

        switch (objectLower) {
            case 'organizations': return this.FetchVaultList(ctx, 'organizations', 'Organizations', 'id');
            case 'individuals':   return this.FetchVaultList(ctx, 'individuals', 'Individuals', 'id');
            case 'memberships':   return this.FetchVaultList(ctx, 'memberships', 'Memberships', 'id');
            case 'addresses':     return this.FetchVaultList(ctx, 'addresses', 'Addresses', 'id');
            case 'events':        return this.FetchVaultList(ctx, 'events', 'Events', 'id');
            case 'orders':        return this.FetchGatewayList(ctx, 'orders', 'Orders', 'id');
            case 'useraccounts':  return this.FetchProvisioningList(ctx, 'useraccounts', 'UserAccounts', 'id');
            default:              return this.FetchVaultList(ctx, ctx.ObjectName.toLowerCase(), ctx.ObjectName, 'id');
        }
    }

    private async FetchVaultList(
        ctx: FetchContext, endpoint: string, objectType: string, pkField: string
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as P360AuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const page = Math.floor(offset / P360_PAGE_SIZE) + 1;
        let url = `${auth.VaultURL}/${endpoint}?pageSize=${P360_PAGE_SIZE}&pageNumber=${page}`;
        if (ctx.WatermarkValue) {
            url += `&modifiedAfter=${encodeURIComponent(ctx.WatermarkValue)}`;
        }
        return this.ExecutePageFetch(auth, headers, url, objectType, pkField, offset, ctx);
    }

    private async FetchGatewayList(
        ctx: FetchContext, endpoint: string, objectType: string, pkField: string
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as P360AuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const page = Math.floor(offset / P360_PAGE_SIZE) + 1;
        let url = `${auth.GatewayURL}/${endpoint}?pageSize=${P360_PAGE_SIZE}&pageNumber=${page}`;
        if (ctx.WatermarkValue) {
            url += `&createdAfter=${encodeURIComponent(ctx.WatermarkValue)}`;
        }
        return this.ExecutePageFetch(auth, headers, url, objectType, pkField, offset, ctx);
    }

    private async FetchProvisioningList(
        ctx: FetchContext, endpoint: string, objectType: string, pkField: string
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as P360AuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const page = Math.floor(offset / P360_PAGE_SIZE) + 1;
        const url = `${auth.ProvisioningURL}/${endpoint}?pageSize=${P360_PAGE_SIZE}&pageNumber=${page}`;
        return this.ExecutePageFetch(auth, headers, url, objectType, pkField, offset, ctx);
    }

    private async ExecutePageFetch(
        auth: RESTAuthContext, headers: Record<string, string>,
        url: string, objectType: string, pkField: string,
        offset: number, _ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Personify360 ${objectType} API error: ${response.Status}`);
        }

        const body = response.Body as P360PagedResponse;
        const records = this.NormalizeResponse(response.Body, null);
        const total = body.meta?.totalCount ?? body.totalCount ?? records.length;
        const fetched = offset + records.length;

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: objectType,
            Fields: r,
        }));

        const hasMore = fetched < total;
        let newWatermark: string | undefined;
        if (!hasMore) {
            for (const r of records) {
                const modified = (r['modifiedOn'] ?? r['createdOn']) as string | undefined;
                if (modified && (!newWatermark || modified > newWatermark)) newWatermark = modified;
            }
        }

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NextOffset: fetched,
            NewWatermarkValue: !hasMore ? newWatermark : undefined,
        };
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as P360AuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth, ctx.ObjectName, null);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return { Success: true, ExternalID: String(body['id'] ?? ''), StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as P360AuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth, ctx.ObjectName, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, 'PUT', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        // Personify360 uses soft-delete via status field — update status to Inactive
        const softDeleteAttrs = { id: ctx.ExternalID, status: 'Inactive' };
        const updateCtx = { ...ctx, Attributes: softDeleteAttrs } as UpdateRecordContext;
        return this.UpdateRecord(updateCtx);
    }

    private CRUDEndpointURL(auth: P360AuthContext, objectName: string, externalID: string | null): string {
        const lower = objectName.toLowerCase();
        let baseURL = auth.VaultURL;
        let path = lower;

        if (lower === 'useraccounts') {
            baseURL = auth.ProvisioningURL;
            path = 'useraccounts';
        } else if (lower === 'orders') {
            baseURL = auth.GatewayURL;
            path = 'orders';
        }

        const base = `${baseURL}/${path}`;
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
            'Authorization': `Bearer ${auth.Token}`,
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
                console.warn('[Personify360] 401 — clearing token cache for retry');
                continue;
            }

            if (response.status === 429) {
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000);
                console.warn(`[Personify360] Rate limited (429), backing off ${Math.round(delay)}ms`);
                await this.Sleep(delay);
                continue;
            }

            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
                console.warn(`[Personify360] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }

        throw new Error(`Personify360 request failed after ${MAX_RETRIES} retries: ${url}`);
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
                throw new Error(`Personify360 request timed out: ${url}`);
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
        const obj = P360_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadPersonify() { /* intentionally empty */ }
