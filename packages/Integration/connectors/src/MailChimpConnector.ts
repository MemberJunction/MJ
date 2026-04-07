/**
 * MailChimpConnector — Integration connector for Mailchimp email marketing platform.
 *
 * API Documentation: https://mailchimp.com/developer/marketing/api/
 *
 * Auth: HTTP Basic Auth — username=anystring, password=API key.
 *       Authorization: Basic base64("anystring:{api_key}")
 *       Data center is derived from the API key suffix: "key-us6" → dc="us6"
 * Base URL: https://{dc}.api.mailchimp.com/3.0
 * Pagination: Offset/count (offset, count params; max count=1000)
 * Rate limits: 10 concurrent connections, 120s timeout, 20 searches/min
 * Incremental: since_last_changed param on list members
 * CRUD: Full on Lists, Members, Campaigns, Stores, Products, Orders
 *
 * API Categories:
 *   - Marketing API (implemented) — lists, members, campaigns, automations, e-commerce, reports
 *   - Transactional API / Mandrill (NOT implemented) — separate product/service, different endpoint
 *   - Mobile Push API (NOT applicable) — mobile SDK, not integration-relevant
 *   - Webhooks (available) — batch completion webhooks + event collection; not implemented as receiver
 *
 * Special notes:
 *   - subscriber_hash = md5(email.toLowerCase()) used for member PUT/DELETE endpoint URLs
 *   - Members are parent-child under Lists (/lists/{list_id}/members)
 *   - E-commerce resources are parent-child under Stores
 */
import { createHash } from 'crypto';
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

export interface MailChimpConnectionConfig {
    ApiKey: string;
    DataCenter: string; // Derived from ApiKey if not explicitly set
}

interface MCAuthContext extends RESTAuthContext {
    Config: MailChimpConnectionConfig;
    BaseURL: string;
}

interface MCPaginatedResponse {
    total_items: number;
    _links: Array<{ rel: string; href: string; method: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────

const MC_DEFAULT_COUNT = 200;
const MC_MAX_COUNT = 1000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 100;

// ─── Static Object Definitions ────────────────────────────────────────────

const MC_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Lists',
        DisplayName: 'Audience (List)',
        Description: 'Mailchimp audiences (lists) — the top-level subscriber groupings',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique list identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Audience name' },
            { Name: 'contact', DisplayName: 'Contact', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Required contact information object' },
            { Name: 'permission_reminder', DisplayName: 'Permission Reminder', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Opt-in permission reminder text' },
            { Name: 'campaign_defaults', DisplayName: 'Campaign Defaults', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Default values for campaigns' },
            { Name: 'email_type_option', DisplayName: 'Email Type Option', Type: 'boolean', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Allow subscribers to choose email format' },
            { Name: 'member_count', DisplayName: 'Member Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total subscribed members' },
            { Name: 'date_created', DisplayName: 'Date Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List creation date' },
            { Name: 'list_rating', DisplayName: 'List Rating', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Engagement rating (1-5)' },
            { Name: 'subscribe_url_short', DisplayName: 'Subscribe URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Short signup form URL' },
        ],
    },
    {
        Name: 'ListMembers',
        DisplayName: 'List Member',
        Description: 'Subscribers/contacts within an audience (parent-child under Lists)',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'Subscriber Hash', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'MD5 hash of lowercase email (subscriber_hash)' },
            { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent list ID' },
            { Name: 'email_address', DisplayName: 'Email Address', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Subscriber email' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Subscription status (subscribed, unsubscribed, cleaned, pending)' },
            { Name: 'merge_fields', DisplayName: 'Merge Fields', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Merge field values (FNAME, LNAME, etc.)' },
            { Name: 'tags', DisplayName: 'Tags', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Array of tag objects' },
            { Name: 'timestamp_signup', DisplayName: 'Signup Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When member signed up' },
            { Name: 'timestamp_opt', DisplayName: 'Opt-in Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When member confirmed opt-in' },
            { Name: 'last_changed', DisplayName: 'Last Changed', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last status change time' },
            { Name: 'email_client', DisplayName: 'Email Client', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Detected email client' },
            { Name: 'location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Inferred geographic location' },
        ],
    },
    {
        Name: 'ListSegments',
        DisplayName: 'Audience Segment',
        Description: 'Segments (saved filters) within an audience',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Segment ID' },
            { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent list ID' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Segment name' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Segment type (saved, static, fuzzy)' },
            { Name: 'member_count', DisplayName: 'Member Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Members in segment' },
            { Name: 'created_at', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation time' },
            { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last update time' },
        ],
    },
    {
        Name: 'Campaigns',
        DisplayName: 'Campaign',
        Description: 'Email campaigns (regular, automated, A/B, RSS, etc.)',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign ID' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign type (regular, plaintext, absplit, rss, variate)' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign status (save, paused, schedule, sending, sent)' },
            { Name: 'settings', DisplayName: 'Settings', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Subject line, from name, reply-to, etc.' },
            { Name: 'recipients', DisplayName: 'Recipients', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Audience and segment targeting' },
            { Name: 'create_time', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign creation time' },
            { Name: 'send_time', DisplayName: 'Send Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When campaign was sent' },
            { Name: 'emails_sent', DisplayName: 'Emails Sent', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of emails sent' },
            { Name: 'archive_url', DisplayName: 'Archive URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Web archive URL' },
        ],
    },
    {
        Name: 'Automations',
        DisplayName: 'Automation',
        Description: 'Automated email workflows (classic automations)',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Automation workflow ID' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Workflow status (save, paused, sending)' },
            { Name: 'settings', DisplayName: 'Settings', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Automation settings' },
            { Name: 'start_time', DisplayName: 'Start Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When automation started' },
            { Name: 'create_time', DisplayName: 'Create Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation time' },
            { Name: 'emails_sent', DisplayName: 'Emails Sent', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total emails sent by automation' },
        ],
    },
    {
        Name: 'Reports',
        DisplayName: 'Campaign Report',
        Description: 'Campaign performance reports (read-only)',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign report ID' },
            { Name: 'campaign_title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign title' },
            { Name: 'send_time', DisplayName: 'Send Time', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When campaign was sent' },
            { Name: 'emails_sent', DisplayName: 'Emails Sent', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total sent' },
            { Name: 'opens', DisplayName: 'Opens', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Open rate metrics object' },
            { Name: 'clicks', DisplayName: 'Clicks', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Click rate metrics object' },
            { Name: 'bounces', DisplayName: 'Bounces', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Bounce metrics object' },
            { Name: 'unsubscribes', DisplayName: 'Unsubscribes', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Unsubscribe metrics' },
        ],
    },
    {
        Name: 'EcommerceStores',
        DisplayName: 'E-commerce Store',
        Description: 'E-commerce stores connected to Mailchimp',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Store ID' },
            { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Connected audience list' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Store name' },
            { Name: 'platform', DisplayName: 'Platform', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'E-commerce platform' },
            { Name: 'domain', DisplayName: 'Domain', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Store domain URL' },
            { Name: 'currency_code', DisplayName: 'Currency', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'ISO 4217 currency code' },
            { Name: 'created_at', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Store creation time' },
            { Name: 'updated_at', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last update time' },
        ],
    },
    {
        Name: 'EcommerceProducts',
        DisplayName: 'E-commerce Product',
        Description: 'Products in a connected e-commerce store (parent-child under EcommerceStores)',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product ID' },
            { Name: 'store_id', DisplayName: 'Store ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent store ID' },
            { Name: 'title', DisplayName: 'Title', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product title' },
            { Name: 'url', DisplayName: 'URL', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product URL' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product description' },
            { Name: 'image_url', DisplayName: 'Image URL', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product image' },
            { Name: 'variants', DisplayName: 'Variants', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product variants array' },
            { Name: 'published_at_foreign', DisplayName: 'Published At', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Publication time in external system' },
        ],
    },
    {
        Name: 'EcommerceOrders',
        DisplayName: 'E-commerce Order',
        Description: 'Orders in a connected e-commerce store (parent-child under EcommerceStores)',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Order ID' },
            { Name: 'store_id', DisplayName: 'Store ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Parent store ID' },
            { Name: 'customer', DisplayName: 'Customer', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer object with email and details' },
            { Name: 'order_total', DisplayName: 'Order Total', Type: 'decimal', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total order value' },
            { Name: 'lines', DisplayName: 'Line Items', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Array of order line items' },
            { Name: 'currency_code', DisplayName: 'Currency', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency code' },
            { Name: 'processed_at_foreign', DisplayName: 'Processed At', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Order processing time' },
            { Name: 'updated_at_foreign', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last update time' },
        ],
    },
    {
        Name: 'BatchOperations',
        DisplayName: 'Batch Operation',
        Description: 'Async batch job status records — POST /batches creates jobs (read status here)',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Batch operation ID' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'pending, preprocessing, started, finalizing, finished' },
            { Name: 'total_operations', DisplayName: 'Total Operations', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total operations in batch' },
            { Name: 'finished_operations', DisplayName: 'Finished', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Completed operations' },
            { Name: 'errored_operations', DisplayName: 'Errored', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Failed operations' },
            { Name: 'submitted_at', DisplayName: 'Submitted At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Batch submission time' },
            { Name: 'completed_at', DisplayName: 'Completed At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Batch completion time' },
            { Name: 'response_body_url', DisplayName: 'Results URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Tarball URL with detailed results' },
        ],
    },
    // ─── Additional MC endpoints — lean overlay (PK + key FKs + date fields) ──
    { Name: 'InterestCategories', DisplayName: 'Interest Category', Description: 'Interest groupings within lists', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Category ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'Interests', DisplayName: 'Interest', Description: 'Individual interests within categories', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Interest ID' },
        { Name: 'category_id', DisplayName: 'Category ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → InterestCategories' },
    ]},
    { Name: 'ListMergeFields', DisplayName: 'Merge Field', Description: 'Merge field definitions per list (FNAME, LNAME, etc.)', SupportsWrite: true, Fields: [
        { Name: 'merge_id', DisplayName: 'Merge ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Merge field ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListMemberNotes', DisplayName: 'Member Note', Description: 'Notes on list members (child of ListMembers)', SupportsWrite: true, Fields: [
        { Name: 'note_id', DisplayName: 'Note ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Note ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListWebhooks', DisplayName: 'List Webhook', Description: 'Webhook subscriptions per list', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Webhook ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'Tags', DisplayName: 'Tag', Description: 'Global tags for organizing contacts', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tag ID' },
    ]},
    { Name: 'Templates', DisplayName: 'Template', Description: 'Email templates', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Template ID' },
        { Name: 'date_created', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'LandingPages', DisplayName: 'Landing Page', Description: 'Landing pages for lead capture', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Page ID' },
        { Name: 'created_at', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Surveys', DisplayName: 'Survey', Description: 'Survey definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Survey ID' },
        { Name: 'created_at', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'CustomerJourneys', DisplayName: 'Customer Journey', Description: 'Automation customer journeys', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Journey ID' },
    ]},
    { Name: 'Files', DisplayName: 'File', Description: 'File manager files', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'File ID' },
        { Name: 'created_at', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Folders', DisplayName: 'Folder', Description: 'File manager folders', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Folder ID' },
    ]},
    { Name: 'ConnectedSites', DisplayName: 'Connected Site', Description: 'Websites connected to Mailchimp', SupportsWrite: true, Fields: [
        { Name: 'foreign_id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Site ID' },
    ]},
    { Name: 'Conversations', DisplayName: 'Conversation', Description: 'Inbox conversations', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Conversation ID' },
    ]},
    { Name: 'EcommerceCarts', DisplayName: 'E-commerce Cart', Description: 'Shopping carts (child of EcommerceStores)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Cart ID' },
        { Name: 'store_id', DisplayName: 'Store ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EcommerceStores' },
    ]},
    { Name: 'EcommerceCustomers', DisplayName: 'E-commerce Customer', Description: 'Store customers (child of EcommerceStores)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Customer ID' },
        { Name: 'store_id', DisplayName: 'Store ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EcommerceStores' },
    ]},
    { Name: 'EcommercePromoRules', DisplayName: 'Promo Rule', Description: 'Promo/discount rules (child of EcommerceStores)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Promo rule ID' },
        { Name: 'store_id', DisplayName: 'Store ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EcommerceStores' },
    ]},
    { Name: 'FacebookAds', DisplayName: 'Facebook Ad', Description: 'Facebook ad campaigns', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Ad ID' },
    ]},
    { Name: 'VerifiedDomains', DisplayName: 'Verified Domain', Description: 'Verified sending domains', SupportsWrite: true, Fields: [
        { Name: 'domain', DisplayName: 'Domain', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Domain name' },
    ]},
    // ─── Sub-resources and remaining endpoints ──
    // List sub-resources (child of Lists)
    { Name: 'ListAbuseReports', DisplayName: 'List Abuse Report', Description: 'Abuse reports per list', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Report ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListGrowthHistory', DisplayName: 'List Growth History', Description: 'Monthly growth stats per list', SupportsWrite: false, Fields: [
        { Name: 'month', DisplayName: 'Month', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Month (YYYY-MM)' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListSignupForms', DisplayName: 'Signup Form', Description: 'List signup form config', SupportsWrite: true, Fields: [
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Lists' },
    ]},
    { Name: 'ListMemberTags', DisplayName: 'Member Tag', Description: 'Tags on individual members (child of ListMembers)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tag assignment ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListMemberNotes2', DisplayName: 'Member Note', Description: 'Notes on members', SupportsWrite: true, Fields: [
        { Name: 'note_id', DisplayName: 'Note ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Note ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListMemberActivity', DisplayName: 'Member Activity', Description: 'Email activity per member', SupportsWrite: false, Fields: [
        { Name: 'email_id', DisplayName: 'Email ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Activity record' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListMemberEvents', DisplayName: 'Member Event', Description: 'Custom events per member', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListMemberGoals', DisplayName: 'Member Goal', Description: 'Goal tracking per member', SupportsWrite: false, Fields: [
        { Name: 'goal_id', DisplayName: 'Goal ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Goal ID' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListLocations', DisplayName: 'List Location', Description: 'Geographic distribution of list members', SupportsWrite: false, Fields: [
        { Name: 'country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Country code' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    { Name: 'ListClients', DisplayName: 'List Client', Description: 'Email client usage stats per list', SupportsWrite: false, Fields: [
        { Name: 'client', DisplayName: 'Client', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Client name' },
        { Name: 'list_id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Lists' },
    ]},
    // Campaign sub-resources
    { Name: 'CampaignContent', DisplayName: 'Campaign Content', Description: 'HTML/text content of campaign', SupportsWrite: true, Fields: [
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'FK → Campaigns' },
    ]},
    { Name: 'CampaignFeedback', DisplayName: 'Campaign Feedback', Description: 'Internal feedback/comments on campaigns', SupportsWrite: true, Fields: [
        { Name: 'feedback_id', DisplayName: 'Feedback ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Feedback ID' },
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Campaigns' },
    ]},
    // Report sub-resources (child of Reports)
    { Name: 'ReportClickDetails', DisplayName: 'Report Click Detail', Description: 'Click details per campaign report', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Click detail ID' },
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Reports' },
    ]},
    { Name: 'ReportOpenDetails', DisplayName: 'Report Open Detail', Description: 'Open details per campaign report', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Open detail ID' },
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Reports' },
    ]},
    { Name: 'ReportEmailActivity', DisplayName: 'Report Email Activity', Description: 'Per-subscriber email activity', SupportsWrite: false, Fields: [
        { Name: 'email_id', DisplayName: 'Email ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email hash' },
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Reports' },
    ]},
    { Name: 'ReportSentTo', DisplayName: 'Report Sent To', Description: 'Recipients of a campaign', SupportsWrite: false, Fields: [
        { Name: 'email_id', DisplayName: 'Email ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email hash' },
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Reports' },
    ]},
    { Name: 'ReportUnsubscribes', DisplayName: 'Report Unsubscribes', Description: 'Unsubscribers per campaign', SupportsWrite: false, Fields: [
        { Name: 'email_id', DisplayName: 'Email ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email hash' },
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Reports' },
    ]},
    { Name: 'ReportDomainPerformance', DisplayName: 'Report Domain Stats', Description: 'Performance by email domain', SupportsWrite: false, Fields: [
        { Name: 'domain', DisplayName: 'Domain', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email domain' },
        { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Reports' },
    ]},
    // Automation sub-resources
    { Name: 'AutomationEmails', DisplayName: 'Automation Email', Description: 'Emails within an automation workflow', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Email ID' },
        { Name: 'workflow_id', DisplayName: 'Automation ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Automations' },
    ]},
    // E-commerce sub-resources
    { Name: 'EcommerceProductVariants', DisplayName: 'Product Variant', Description: 'Product variant/SKU (child of EcommerceProducts)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Variant ID' },
        { Name: 'product_id', DisplayName: 'Product ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EcommerceProducts' },
    ]},
    { Name: 'EcommerceOrderLines', DisplayName: 'Order Line', Description: 'Line items on orders (child of EcommerceOrders)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Line ID' },
        { Name: 'order_id', DisplayName: 'Order ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EcommerceOrders' },
    ]},
    { Name: 'EcommerceCartLines', DisplayName: 'Cart Line', Description: 'Line items in carts (child of EcommerceCarts)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Line ID' },
        { Name: 'cart_id', DisplayName: 'Cart ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EcommerceCarts' },
    ]},
    { Name: 'EcommercePromoCodes', DisplayName: 'Promo Code', Description: 'Promo codes under rules (child of EcommercePromoRules)', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Code ID' },
        { Name: 'promo_rule_id', DisplayName: 'Rule ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EcommercePromoRules' },
    ]},
    // Survey sub-resources
    { Name: 'SurveyQuestions', DisplayName: 'Survey Question', Description: 'Questions within surveys', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Question ID' },
        { Name: 'survey_id', DisplayName: 'Survey ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Surveys' },
    ]},
    { Name: 'SurveyResponses', DisplayName: 'Survey Response', Description: 'Responses to surveys', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Response ID' },
        { Name: 'survey_id', DisplayName: 'Survey ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Surveys' },
    ]},
    // Account
    { Name: 'AuthorizedApps', DisplayName: 'Authorized App', Description: 'OAuth authorized applications', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'App ID' },
    ]},
];

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'MailChimpConnector')
export class MailChimpConnector extends BaseRESTIntegrationConnector {
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Mailchimp'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return MC_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-brands fa-mailchimp';
        config.CategoryDescription = 'Mailchimp email marketing for lists, members, campaigns, and e-commerce';
        config.ParentCategoryName = 'Marketing';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ─────────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return MC_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: obj.Name === 'ListMembers',
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as MCAuthContext;
            const headers = this.BuildHeaders(auth);
            const apiPath = objectName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
            const response = await this.MakeHTTPRequest(auth, `${auth.BaseURL}/${apiPath}?count=1&offset=0`, 'GET', headers);
            if (response.Status === 200) {
                const records = this.NormalizeResponse(response.Body, null);
                if (records.length > 0) return this.InferFieldsWithOverlay(records[0], objectName, MC_OBJECTS);
            }
        } catch { /* fall through */ }
        const staticObj = MC_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!staticObj) return [];
        return staticObj.Fields.map(f => ({ Name: f.Name, Label: f.DisplayName, Description: f.Description, DataType: f.Type, IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly }));
    }

    private InferFieldsWithOverlay(sample: Record<string, unknown>, objectName: string, allObjects: IntegrationObjectInfo[]): ExternalFieldSchema[] {
        const staticObj = allObjects.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));
        const fields: ExternalFieldSchema[] = [];
        for (const [key, value] of Object.entries(sample)) {
            if (key === '_links' || key === 'links') continue;
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
        const basicAuth = Buffer.from(`anystring:${config.ApiKey}`).toString('base64');
        const baseURL = `https://${config.DataCenter}.api.mailchimp.com/3.0`;
        return {
            Token: basicAuth,
            TokenType: 'Basic',
            Config: config,
            BaseURL: baseURL,
        } as MCAuthContext;
    }

    private ExtractDataCenter(apiKey: string): string {
        // API key format: "{key}-{dc}" e.g. "abc123def456-us6"
        const parts = apiKey.split('-');
        return parts[parts.length - 1] ?? 'us1';
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo
    ): Promise<MailChimpConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['ApiKey']) {
                    const dc = parsed['DataCenter'] ?? this.ExtractDataCenter(parsed['ApiKey']);
                    return { ApiKey: parsed['ApiKey'], DataCenter: dc };
                }
            }
        }
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            const apiKey = parsed['ApiKey'] ?? '';
            const dc = parsed['DataCenter'] ?? this.ExtractDataCenter(apiKey);
            return { ApiKey: apiKey, DataCenter: dc };
        }
        throw new Error(
            'No Mailchimp credentials found. Set ApiKey (and optionally DataCenter) in credential Values or Configuration JSON.'
        );
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as MCAuthContext;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, `${auth.BaseURL}/`, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as Record<string, unknown>;
                const name = (body['account_name'] as string | undefined) ?? 'Unknown';
                return { Success: true, Message: `Connected to Mailchimp: ${name}` };
            }
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ──────────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as MCAuthContext).BaseURL;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        _page: number, offset: number, _cursor?: string
    ): string {
        const count = Math.min(_obj.DefaultPageSize ?? MC_DEFAULT_COUNT, MC_MAX_COUNT);
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}count=${count}&offset=${offset}`;
    }

    // ─── Response Parsing ──────────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;

        if (responseDataKey && Array.isArray(body[responseDataKey])) {
            return body[responseDataKey] as Record<string, unknown>[];
        }

        // Mailchimp wraps responses in a named array matching the resource type
        for (const key of [
            'lists', 'members', 'segments', 'campaigns', 'automations', 'reports',
            'stores', 'products', 'orders', 'carts', 'batches',
        ]) {
            if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        }

        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, _currentPage: number, currentOffset: number, pageSize: number
    ): PaginationState {
        const body = rawBody as (MCPaginatedResponse & Record<string, unknown>);
        const records = this.NormalizeResponse(rawBody, null);
        const totalItems = body.total_items ?? 0;
        const fetched = currentOffset + records.length;
        return {
            HasMore: fetched < totalItems,
            NextOffset: currentOffset + records.length,
        };
    }

    // ─── FetchChanges ──────────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const objectLower = ctx.ObjectName.toLowerCase();

        switch (objectLower) {
            case 'lists':             return this.FetchLists(ctx);
            case 'listmembers':       return this.FetchListMembers(ctx);
            case 'listsegments':      return this.FetchListSegments(ctx);
            case 'campaigns':         return this.FetchCampaigns(ctx);
            case 'automations':       return this.FetchAutomations(ctx);
            case 'reports':           return this.FetchReports(ctx);
            case 'ecommercestores':   return this.FetchEcommerceStores(ctx);
            case 'ecommerceproducts': return this.FetchEcommerceProducts(ctx);
            case 'ecommerceorders':   return this.FetchEcommerceOrders(ctx);
            case 'batchoperations':   return this.FetchBatchOperations(ctx);
            default:                  return this.FetchGenericMCObject(ctx);
        }
    }

    private async FetchGenericMCObject(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        const url = `${auth.BaseURL}/${apiPath}?count=${MC_DEFAULT_COUNT}&offset=${offset}`;
        return this.ExecutePagedFetch(auth, headers, url, ctx.ObjectName, 'id', offset, ctx.BatchSize);
    }

    private async FetchLists(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.BaseURL}/lists?count=${MC_DEFAULT_COUNT}&offset=${offset}&fields=lists.id,lists.name,lists.contact,lists.permission_reminder,lists.email_type_option,lists.stats,lists.date_created,lists.list_rating,lists.subscribe_url_short,total_items`;
        return this.ExecutePagedFetch(auth, headers, url, 'Lists', 'id', offset, ctx.BatchSize);
    }

    private async FetchListMembers(ctx: FetchContext): Promise<FetchBatchResult> {
        // Members are parent-child. We iterate all lists and collect members.
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);

        const lists = await this.FetchAllListIDs(auth, headers);
        const allMembers: ExternalRecord[] = [];
        let hasMore = false;
        let totalNewWatermark: string | undefined;

        for (const listId of lists) {
            const result = await this.FetchMembersForList(auth, headers, listId, ctx);
            allMembers.push(...result.Records);
            if (result.HasMore) hasMore = true;
            if (result.NewWatermarkValue) {
                if (!totalNewWatermark || result.NewWatermarkValue > totalNewWatermark) {
                    totalNewWatermark = result.NewWatermarkValue;
                }
            }
        }

        return {
            Records: allMembers,
            HasMore: hasMore,
            NewWatermarkValue: !hasMore ? totalNewWatermark : undefined,
        };
    }

    private async FetchAllListIDs(auth: MCAuthContext, headers: Record<string, string>): Promise<string[]> {
        const listIDs: string[] = [];
        let offset = 0;
        const count = 200;

        while (true) {
            const url = `${auth.BaseURL}/lists?count=${count}&offset=${offset}&fields=lists.id,total_items`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) break;
            const body = response.Body as { lists: Array<{ id: string }>; total_items: number };
            for (const list of (body.lists ?? [])) listIDs.push(list.id);
            const fetched = offset + (body.lists?.length ?? 0);
            if (fetched >= body.total_items) break;
            offset = fetched;
        }

        return listIDs;
    }

    private async FetchMembersForList(
        auth: MCAuthContext, headers: Record<string, string>, listId: string, ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const offset = ctx.CurrentOffset ?? 0;
        let url = `${auth.BaseURL}/lists/${listId}/members?count=${Math.min(ctx.BatchSize, MC_MAX_COUNT)}&offset=${offset}`;
        if (ctx.WatermarkValue) {
            url += `&since_last_changed=${encodeURIComponent(ctx.WatermarkValue)}`;
        }

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            return { Records: [], HasMore: false };
        }

        const body = response.Body as { members: Record<string, unknown>[]; total_items: number };
        const records = body.members ?? [];
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['id'] ?? ''),
            ObjectType: 'ListMembers',
            Fields: { ...r, list_id: listId },
        }));

        const fetched = offset + records.length;
        const hasMore = fetched < (body.total_items ?? 0);

        let newWatermark: string | undefined;
        if (!hasMore) {
            for (const r of records) {
                const changed = r['last_changed'] as string | undefined;
                if (changed && (!newWatermark || changed > newWatermark)) newWatermark = changed;
            }
        }

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NextOffset: fetched,
            NewWatermarkValue: newWatermark,
        };
    }

    private async FetchListSegments(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const lists = await this.FetchAllListIDs(auth, headers);
        const allSegments: ExternalRecord[] = [];

        for (const listId of lists) {
            const url = `${auth.BaseURL}/lists/${listId}/segments?count=${MC_DEFAULT_COUNT}&offset=0`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) continue;
            const body = response.Body as { segments: Record<string, unknown>[] };
            for (const seg of (body.segments ?? [])) {
                allSegments.push({
                    ExternalID: String(seg['id'] ?? ''),
                    ObjectType: 'ListSegments',
                    Fields: { ...seg, list_id: listId },
                });
            }
        }

        return { Records: allSegments, HasMore: false };
    }

    private async FetchCampaigns(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.BaseURL}/campaigns?count=${MC_DEFAULT_COUNT}&offset=${offset}`;
        return this.ExecutePagedFetch(auth, headers, url, 'Campaigns', 'id', offset, ctx.BatchSize);
    }

    private async FetchAutomations(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.BaseURL}/automations?count=${MC_DEFAULT_COUNT}&offset=${offset}`;
        return this.ExecutePagedFetch(auth, headers, url, 'Automations', 'id', offset, ctx.BatchSize);
    }

    private async FetchReports(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.BaseURL}/reports?count=${MC_DEFAULT_COUNT}&offset=${offset}`;
        return this.ExecutePagedFetch(auth, headers, url, 'Reports', 'id', offset, ctx.BatchSize);
    }

    private async FetchEcommerceStores(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.BaseURL}/ecommerce/stores?count=${MC_DEFAULT_COUNT}&offset=${offset}`;
        return this.ExecutePagedFetch(auth, headers, url, 'EcommerceStores', 'id', offset, ctx.BatchSize);
    }

    private async FetchEcommerceProducts(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const storeIDs = await this.FetchAllStoreIDs(auth, headers);
        const allProducts: ExternalRecord[] = [];

        for (const storeId of storeIDs) {
            const url = `${auth.BaseURL}/ecommerce/stores/${storeId}/products?count=${MC_DEFAULT_COUNT}&offset=0`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) continue;
            const body = response.Body as { products: Record<string, unknown>[] };
            for (const p of (body.products ?? [])) {
                allProducts.push({
                    ExternalID: String(p['id'] ?? ''),
                    ObjectType: 'EcommerceProducts',
                    Fields: { ...p, store_id: storeId },
                });
            }
        }

        return { Records: allProducts, HasMore: false };
    }

    private async FetchEcommerceOrders(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const storeIDs = await this.FetchAllStoreIDs(auth, headers);
        const allOrders: ExternalRecord[] = [];

        for (const storeId of storeIDs) {
            const url = `${auth.BaseURL}/ecommerce/stores/${storeId}/orders?count=${MC_DEFAULT_COUNT}&offset=0`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) continue;
            const body = response.Body as { orders: Record<string, unknown>[] };
            for (const o of (body.orders ?? [])) {
                allOrders.push({
                    ExternalID: String(o['id'] ?? ''),
                    ObjectType: 'EcommerceOrders',
                    Fields: { ...o, store_id: storeId },
                });
            }
        }

        return { Records: allOrders, HasMore: false };
    }

    private async FetchAllStoreIDs(auth: MCAuthContext, headers: Record<string, string>): Promise<string[]> {
        const url = `${auth.BaseURL}/ecommerce/stores?count=200&offset=0&fields=stores.id,total_items`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return [];
        const body = response.Body as { stores: Array<{ id: string }> };
        return (body.stores ?? []).map(s => s.id);
    }

    private async FetchBatchOperations(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${auth.BaseURL}/batches?count=${MC_DEFAULT_COUNT}&offset=${offset}`;
        return this.ExecutePagedFetch(auth, headers, url, 'BatchOperations', 'id', offset, ctx.BatchSize);
    }

    private async ExecutePagedFetch(
        auth: RESTAuthContext, headers: Record<string, string>,
        url: string, objectType: string, pkField: string,
        offset: number, _batchSize: number
    ): Promise<FetchBatchResult> {
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Mailchimp ${objectType} API error: ${response.Status}`);
        }

        const records = this.NormalizeResponse(response.Body, null);
        const body = response.Body as MCPaginatedResponse;
        const totalItems = body.total_items ?? records.length;
        const fetched = offset + records.length;

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: objectType,
            Fields: r,
        }));

        return {
            Records: externalRecords,
            HasMore: fetched < totalItems,
            NextOffset: fetched,
        };
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as MCAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth.BaseURL, ctx.ObjectName, ctx.Attributes, null);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return { Success: true, ExternalID: String(body['id'] ?? ''), StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as MCAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = this.CRUDEndpointURL(auth.BaseURL, ctx.ObjectName, ctx.Attributes, ctx.ExternalID);
        // Use PUT for most; PATCH for partial updates (members use PUT by email hash, campaigns use PATCH)
        const method = ctx.ObjectName.toLowerCase() === 'campaigns' ? 'PATCH' : 'PUT';
        const response = await this.MakeHTTPRequest(auth, url, method, headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as MCAuthContext;
        const headers = this.BuildHeaders(auth);
        const url = this.CRUDEndpointURL(auth.BaseURL, ctx.ObjectName, {}, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    private CRUDEndpointURL(
        baseURL: string, objectName: string, attrs: Record<string, unknown>, externalID: string | null
    ): string {
        const lower = objectName.toLowerCase();

        // Parent-child endpoints need parent ID embedded in attributes
        if (lower === 'listmembers') {
            const listId = attrs['list_id'] as string ?? '';
            if (externalID) {
                return `${baseURL}/lists/${listId}/members/${externalID}`;
            }
            return `${baseURL}/lists/${listId}/members`;
        }

        if (lower === 'listsegments') {
            const listId = attrs['list_id'] as string ?? '';
            if (externalID) return `${baseURL}/lists/${listId}/segments/${externalID}`;
            return `${baseURL}/lists/${listId}/segments`;
        }

        if (lower === 'ecommerceproducts') {
            const storeId = attrs['store_id'] as string ?? '';
            if (externalID) return `${baseURL}/ecommerce/stores/${storeId}/products/${externalID}`;
            return `${baseURL}/ecommerce/stores/${storeId}/products`;
        }

        if (lower === 'ecommerceorders') {
            const storeId = attrs['store_id'] as string ?? '';
            if (externalID) return `${baseURL}/ecommerce/stores/${storeId}/orders/${externalID}`;
            return `${baseURL}/ecommerce/stores/${storeId}/orders`;
        }

        // Top-level resources
        const endpointMap: Record<string, string> = {
            'lists':           `${baseURL}/lists`,
            'campaigns':       `${baseURL}/campaigns`,
            'ecommercestores': `${baseURL}/ecommerce/stores`,
        };

        const base = endpointMap[lower] ?? `${baseURL}/${lower}`;
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
            'Authorization': `Basic ${auth.Token}`,
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    // ─── Utility — subscriber hash ──────────────────────────────────────

    public static SubscriberHash(email: string): string {
        return createHash('md5').update(email.toLowerCase()).digest('hex');
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
                console.warn('[Mailchimp] 401 — API key may be invalid, retrying once');
                continue;
            }
            if (response.status === 429) {
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000);
                console.warn(`[Mailchimp] Rate limited (429), backing off ${Math.round(delay)}ms`);
                await this.Sleep(delay);
                continue;
            }

            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
                console.warn(`[Mailchimp] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }

        throw new Error(`Mailchimp request failed after ${MAX_RETRIES} retries: ${url}`);
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
                throw new Error(`Mailchimp request timed out: ${url}`);
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
        const obj = MC_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadMailChimpConnector() { /* intentionally empty */ }
