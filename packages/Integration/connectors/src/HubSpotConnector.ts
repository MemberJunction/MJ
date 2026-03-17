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
    type ExternalRecord,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type SearchContext,
    type SearchResult,
    type ListContext,
    type ListResult,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed HubSpot API credentials */
interface HubSpotCredentials {
    AccessToken: string;
    ApiVersion: string;
}

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface HubSpotConnectionConfig {
    /** HubSpot access token (private app key or OAuth token) */
    AccessToken: string;
    /** API version string. Default: 'v3' */
    ApiVersion: string;

    // ── Optional performance overrides (all have defaults) ──────────
    /** Maximum retries for rate-limited or failed requests. Default: 5 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests (HubSpot: 100 req/10s for private apps). Default: 100 */
    MinRequestIntervalMs?: number;
}

/** Extended auth context carrying HubSpot credentials and config */
interface HubSpotAuthContext extends RESTAuthContext {
    Credentials: HubSpotCredentials;
    Config: HubSpotConnectionConfig;
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
 * Comprehensive HubSpot object metadata — single source of truth for both
 * action generation and API property requests.
 *
 * CRM objects (contacts, companies, deals, tasks, tickets, products) generate
 * CRUD actions. Activity/ancillary objects (calls, emails, notes, meetings,
 * line_items, quotes, feedback_submissions) are included for property lookups
 * but excluded from action generation via IncludeInActionGeneration: false.
 */
const HUBSPOT_OBJECTS: IntegrationObjectInfo[] = [
    // ── CRM Objects (generate actions) ──────────────────────────────────
    {
        Name: 'contacts', DisplayName: 'Contact',
        Description: 'A person or lead in HubSpot CRM', SupportsWrite: true,
        Fields: [
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact email address' },
            { Name: 'firstname', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact first name' },
            { Name: 'lastname', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact last name' },
            { Name: 'phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact phone number' },
            { Name: 'mobilephone', DisplayName: 'Mobile Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mobile phone number' },
            { Name: 'company', DisplayName: 'Company', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated company name' },
            { Name: 'jobtitle', DisplayName: 'Job Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact job title' },
            { Name: 'lifecyclestage', DisplayName: 'Lifecycle Stage', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lifecycle stage (subscriber, lead, opportunity, customer, etc.)' },
            { Name: 'hs_lead_status', DisplayName: 'Lead Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead qualification status' },
            { Name: 'address', DisplayName: 'Address', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street address' },
            { Name: 'city', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'state', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State or province' },
            { Name: 'zip', DisplayName: 'Zip', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Postal/zip code' },
            { Name: 'country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'website', DisplayName: 'Website', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact website URL' },
            { Name: 'industry', DisplayName: 'Industry', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Industry' },
            { Name: 'annualrevenue', DisplayName: 'Annual Revenue', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Annual revenue' },
            { Name: 'numberofemployees', DisplayName: 'Number of Employees', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Number of employees' },
            { Name: 'associatedcompanyid', DisplayName: 'Associated Company ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ID of associated company' },
            { Name: 'notes_last_contacted', DisplayName: 'Last Contacted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last contacted' },
            { Name: 'notes_last_updated', DisplayName: 'Notes Last Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When notes were last updated' },
            { Name: 'hs_email_optout', DisplayName: 'Email Opt-out', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether contact has opted out of email' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the contact was created' },
            { Name: 'lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'companies', DisplayName: 'Company',
        Description: 'A business organization in HubSpot CRM', SupportsWrite: true,
        Fields: [
            { Name: 'name', DisplayName: 'Company Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company name' },
            { Name: 'domain', DisplayName: 'Domain', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company website domain' },
            { Name: 'industry', DisplayName: 'Industry', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company industry' },
            { Name: 'phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company phone number' },
            { Name: 'address', DisplayName: 'Address', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street address' },
            { Name: 'address2', DisplayName: 'Address Line 2', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address line 2' },
            { Name: 'city', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'state', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State or province' },
            { Name: 'zip', DisplayName: 'Zip', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Postal/zip code' },
            { Name: 'country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'website', DisplayName: 'Website', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company website URL' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company description' },
            { Name: 'numberofemployees', DisplayName: 'Employees', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Number of employees' },
            { Name: 'annualrevenue', DisplayName: 'Annual Revenue', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Annual revenue' },
            { Name: 'lifecyclestage', DisplayName: 'Lifecycle Stage', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company lifecycle stage' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company type' },
            { Name: 'founded_year', DisplayName: 'Founded Year', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Year the company was founded' },
            { Name: 'is_public', DisplayName: 'Is Public', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the company is publicly traded' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the company was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'deals', DisplayName: 'Deal',
        Description: 'A sales deal/opportunity in HubSpot CRM', SupportsWrite: true,
        Fields: [
            { Name: 'dealname', DisplayName: 'Deal Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name of the deal' },
            { Name: 'amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deal value/amount' },
            { Name: 'dealstage', DisplayName: 'Deal Stage', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Current stage in the sales pipeline' },
            { Name: 'pipeline', DisplayName: 'Pipeline', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sales pipeline' },
            { Name: 'closedate', DisplayName: 'Close Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expected close date' },
            { Name: 'dealtype', DisplayName: 'Deal Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type of deal' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deal description' },
            { Name: 'hs_deal_stage_probability', DisplayName: 'Stage Probability', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Probability based on deal stage' },
            { Name: 'hs_projected_amount', DisplayName: 'Projected Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Projected deal amount' },
            { Name: 'hs_priority', DisplayName: 'Priority', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deal priority level' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'notes_last_contacted', DisplayName: 'Last Contacted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last contacted' },
            { Name: 'num_associated_contacts', DisplayName: 'Associated Contacts', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of associated contacts' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the deal was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'tasks', DisplayName: 'Task',
        Description: 'A task/to-do item in HubSpot CRM', SupportsWrite: true,
        Fields: [
            { Name: 'hs_task_subject', DisplayName: 'Subject', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task subject line' },
            { Name: 'hs_task_body', DisplayName: 'Body', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task body/description' },
            { Name: 'hs_task_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task status (NOT_STARTED, IN_PROGRESS, COMPLETED, etc.)' },
            { Name: 'hs_task_priority', DisplayName: 'Priority', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task priority level' },
            { Name: 'hs_task_type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task type (TODO, CALL, EMAIL)' },
            { Name: 'hs_timestamp', DisplayName: 'Due Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task due date/timestamp' },
            { Name: 'hs_task_completion_date', DisplayName: 'Completion Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'When the task was completed' },
            { Name: 'hs_queue_membership_ids', DisplayName: 'Queue IDs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Task queue membership IDs' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the task was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'tickets', DisplayName: 'Ticket',
        Description: 'A support ticket in HubSpot CRM', SupportsWrite: true,
        Fields: [
            { Name: 'subject', DisplayName: 'Subject', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket subject line' },
            { Name: 'content', DisplayName: 'Content', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket body/content' },
            { Name: 'hs_pipeline', DisplayName: 'Pipeline', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Support pipeline' },
            { Name: 'hs_pipeline_stage', DisplayName: 'Pipeline Stage', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Current pipeline stage' },
            { Name: 'hs_ticket_priority', DisplayName: 'Priority', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket priority level' },
            { Name: 'hs_ticket_category', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket category' },
            { Name: 'source_type', DisplayName: 'Source', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'How the ticket was created' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'closed_date', DisplayName: 'Closed Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the ticket was closed' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the ticket was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'products', DisplayName: 'Product',
        Description: 'A product in the HubSpot product catalog', SupportsWrite: true,
        Fields: [
            { Name: 'name', DisplayName: 'Product Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product name' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product description' },
            { Name: 'price', DisplayName: 'Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product unit price' },
            { Name: 'hs_cost_of_goods_sold', DisplayName: 'Cost of Goods Sold', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Cost of goods sold' },
            { Name: 'hs_recurring_billing_period', DisplayName: 'Recurring Billing Period', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Recurring billing period' },
            { Name: 'hs_sku', DisplayName: 'SKU', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Stock keeping unit identifier' },
            { Name: 'tax', DisplayName: 'Tax', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax amount' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the product was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Ancillary Objects (property lookups only, no action generation) ──
    {
        Name: 'line_items', DisplayName: 'Line Item',
        Description: 'A line item on a deal or quote', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Line item name' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Line item description' },
            { Name: 'quantity', DisplayName: 'Quantity', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quantity' },
            { Name: 'price', DisplayName: 'Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Unit price' },
            { Name: 'amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total amount' },
            { Name: 'discount', DisplayName: 'Discount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Discount amount' },
            { Name: 'tax', DisplayName: 'Tax', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax amount' },
            { Name: 'hs_product_id', DisplayName: 'Product ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated product ID' },
            { Name: 'hs_line_item_currency_code', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency code' },
            { Name: 'hs_sku', DisplayName: 'SKU', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Stock keeping unit' },
            { Name: 'hs_cost_of_goods_sold', DisplayName: 'Cost of Goods Sold', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Cost of goods sold' },
            { Name: 'hs_recurring_billing_period', DisplayName: 'Recurring Billing Period', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Recurring billing period' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'quotes', DisplayName: 'Quote',
        Description: 'A sales quote in HubSpot', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quote title' },
            { Name: 'hs_expiration_date', DisplayName: 'Expiration Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quote expiration date' },
            { Name: 'hs_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quote status' },
            { Name: 'hs_quote_amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Quote total amount' },
            { Name: 'hs_currency', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency code' },
            { Name: 'hs_sender_firstname', DisplayName: 'Sender First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender first name' },
            { Name: 'hs_sender_lastname', DisplayName: 'Sender Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender last name' },
            { Name: 'hs_sender_email', DisplayName: 'Sender Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender email' },
            { Name: 'hs_sender_company_name', DisplayName: 'Sender Company', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender company name' },
            { Name: 'hs_language', DisplayName: 'Language', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quote language' },
            { Name: 'hs_locale', DisplayName: 'Locale', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quote locale' },
            { Name: 'hs_slug', DisplayName: 'Slug', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'URL slug' },
            { Name: 'hs_public_url_key', DisplayName: 'Public URL Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Public URL access key' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Activity Objects (property lookups only, no action generation) ───
    {
        Name: 'calls', DisplayName: 'Call',
        Description: 'A call activity in HubSpot', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_call_title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Call title' },
            { Name: 'hs_call_body', DisplayName: 'Body', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Call notes/body' },
            { Name: 'hs_call_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Call status' },
            { Name: 'hs_call_direction', DisplayName: 'Direction', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Inbound or outbound' },
            { Name: 'hs_call_duration', DisplayName: 'Duration', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Call duration in ms' },
            { Name: 'hs_call_from_number', DisplayName: 'From Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Caller phone number' },
            { Name: 'hs_call_to_number', DisplayName: 'To Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Recipient phone number' },
            { Name: 'hs_call_disposition', DisplayName: 'Disposition', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Call outcome disposition' },
            { Name: 'hs_call_recording_url', DisplayName: 'Recording URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Call recording URL' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'hs_timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Call timestamp' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'emails', DisplayName: 'Email',
        Description: 'An email activity in HubSpot', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_email_subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email subject' },
            { Name: 'hs_email_text', DisplayName: 'Text Body', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Plain text body' },
            { Name: 'hs_email_html', DisplayName: 'HTML Body', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HTML body' },
            { Name: 'hs_email_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email status' },
            { Name: 'hs_email_direction', DisplayName: 'Direction', Type: 'enum', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Inbound or outbound' },
            { Name: 'hs_email_sender_email', DisplayName: 'Sender Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sender email address' },
            { Name: 'hs_email_sender_firstname', DisplayName: 'Sender First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sender first name' },
            { Name: 'hs_email_sender_lastname', DisplayName: 'Sender Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sender last name' },
            { Name: 'hs_email_to_email', DisplayName: 'To Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Recipient email address' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'hs_timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email timestamp' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'notes', DisplayName: 'Note',
        Description: 'A note activity in HubSpot', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_note_body', DisplayName: 'Body', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Note body content' },
            { Name: 'hs_timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Note timestamp' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'hs_attachment_ids', DisplayName: 'Attachment IDs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Attached file IDs' },
            { Name: 'hs_body_preview', DisplayName: 'Body Preview', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Truncated body preview' },
            { Name: 'hs_body_preview_is_truncated', DisplayName: 'Preview Truncated', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether preview is truncated' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'meetings', DisplayName: 'Meeting',
        Description: 'A meeting activity in HubSpot', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_meeting_title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Meeting title' },
            { Name: 'hs_meeting_body', DisplayName: 'Body', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Meeting description' },
            { Name: 'hs_meeting_start_time', DisplayName: 'Start Time', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Meeting start time' },
            { Name: 'hs_meeting_end_time', DisplayName: 'End Time', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Meeting end time' },
            { Name: 'hs_meeting_outcome', DisplayName: 'Outcome', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Meeting outcome' },
            { Name: 'hs_meeting_location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Meeting location' },
            { Name: 'hs_meeting_external_url', DisplayName: 'External URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'External meeting URL' },
            { Name: 'hs_internal_meeting_notes', DisplayName: 'Internal Notes', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal meeting notes' },
            { Name: 'hs_activity_type', DisplayName: 'Activity Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Activity type' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'hs_timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Meeting timestamp' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'feedback_submissions', DisplayName: 'Feedback Submission',
        Description: 'A feedback survey submission in HubSpot', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_survey_id', DisplayName: 'Survey ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Survey ID' },
            { Name: 'hs_survey_name', DisplayName: 'Survey Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Survey name' },
            { Name: 'hs_survey_type', DisplayName: 'Survey Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type of survey' },
            { Name: 'hs_submission_name', DisplayName: 'Submission Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Submission name' },
            { Name: 'hs_content', DisplayName: 'Content', Type: 'text', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Submission content' },
            { Name: 'hs_response_group', DisplayName: 'Response Group', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Response group' },
            { Name: 'hs_sentiment', DisplayName: 'Sentiment', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Response sentiment' },
            { Name: 'hs_survey_channel', DisplayName: 'Channel', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Survey channel' },
            { Name: 'hs_timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Submission timestamp' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
];

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
 * Configuration JSON (on CompanyIntegration) supports optional rate limit overrides:
 * {
 *   "accessToken": "...",
 *   "MaxRetries": 5,              // optional, default: 5
 *   "RequestTimeoutMs": 30000,    // optional, default: 30000
 *   "MinRequestIntervalMs": 100   // optional, default: 100
 * }
 *
 * Supports full CRUD: Get, Create, Update, Delete, Search, and List operations
 * on all HubSpot CRM object types.
 */
@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseRESTIntegrationConnector {

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    /** Resolved config (populated after first Authenticate call) */
    private _config: HubSpotConnectionConfig | null = null;

    // ── Per-instance config accessors (fall back to module-level defaults) ──
    private get effectiveMaxRetries(): number { return this._config?.MaxRetries ?? MAX_RETRIES; }
    private get effectiveRequestTimeoutMs(): number { return this._config?.RequestTimeoutMs ?? REQUEST_TIMEOUT_MS; }
    private get effectiveMinRequestIntervalMs(): number { return this._config?.MinRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS; }

    // ─── Capability Getters ──────────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override get IntegrationName(): string { return 'HubSpot'; }

    // ─── Action Metadata ─────────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return HUBSPOT_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-brands fa-hubspot';
        config.CreateCategory = false; // HubSpot category already exists in metadata/action-categories
        return config;
    }

    // ─── CRUD Operations ─────────────────────────────────────────────────

    /**
     * Retrieves a single record by ExternalID (HubSpot object ID).
     */
    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const propertiesParam = this.BuildPropertiesParam(ctx.ObjectName);
        const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}/${ctx.ExternalID}?${propertiesParam.replace(/^&/, '')}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status === 404) return null;
        this.ValidateCRUDResponse(response, 'GetRecord', ctx.ObjectName);

        const raw = response.Body as Record<string, unknown>;
        return this.RawToExternalRecord(raw, ctx.ObjectName);
    }

    /**
     * Creates a new record in HubSpot.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}`;

        const body = { properties: ctx.Attributes };
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);

        if (response.Status >= 200 && response.Status < 300) {
            const created = response.Body as Record<string, unknown>;
            return {
                Success: true,
                ExternalID: String(created['id'] ?? ''),
                StatusCode: response.Status,
            };
        }

        return this.BuildCRUDErrorResult(response, 'CreateRecord', ctx.ObjectName);
    }

    /**
     * Updates an existing record in HubSpot by ExternalID.
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}/${ctx.ExternalID}`;

        const body = { properties: ctx.Attributes };
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, body);

        if (response.Status >= 200 && response.Status < 300) {
            const updated = response.Body as Record<string, unknown>;
            return {
                Success: true,
                ExternalID: String(updated['id'] ?? ctx.ExternalID),
                StatusCode: response.Status,
            };
        }

        return this.BuildCRUDErrorResult(response, 'UpdateRecord', ctx.ObjectName);
    }

    /**
     * Deletes (archives) a record in HubSpot by ExternalID.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}/${ctx.ExternalID}`;

        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);

        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return {
                Success: true,
                ExternalID: ctx.ExternalID,
                StatusCode: response.Status,
            };
        }

        return this.BuildCRUDErrorResult(response, 'DeleteRecord', ctx.ObjectName);
    }

    /**
     * Searches HubSpot objects using the CRM search API.
     */
    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}/search`;

        const filters = Object.entries(ctx.Filters).map(([propertyName, value]) => ({
            propertyName,
            operator: 'EQ',
            value,
        }));

        const properties = this.GetObjectFieldNames(ctx.ObjectName);
        const body = {
            filterGroups: [{ filters }],
            properties,
            limit: ctx.PageSize ?? 100,
            after: ctx.Page != null && ctx.Page > 1 ? String((ctx.Page - 1) * (ctx.PageSize ?? 100)) : undefined,
        };

        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);
        this.ValidateCRUDResponse(response, 'SearchRecords', ctx.ObjectName);

        const responseBody = response.Body as { results?: unknown[]; total?: number; paging?: { next?: { after?: string } } };
        const results = responseBody.results ?? [];
        const records = results.map(r => this.RawToExternalRecord(r as Record<string, unknown>, ctx.ObjectName));

        return {
            Records: records,
            TotalCount: responseBody.total ?? records.length,
            HasMore: responseBody.paging?.next?.after != null,
        };
    }

    /**
     * Lists records from a HubSpot object with cursor-based pagination.
     */
    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);

        const pageSize = ctx.PageSize ?? 100;
        const propertiesParam = this.BuildPropertiesParam(ctx.ObjectName);
        let url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}?limit=${pageSize}${propertiesParam}`;

        if (ctx.Cursor) {
            url += `&after=${encodeURIComponent(ctx.Cursor)}`;
        }

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateCRUDResponse(response, 'ListRecords', ctx.ObjectName);

        const responseBody = response.Body as { results?: unknown[]; total?: number; paging?: { next?: { after?: string } } };
        const results = responseBody.results ?? [];
        const records = results.map(r => this.RawToExternalRecord(r as Record<string, unknown>, ctx.ObjectName));
        const nextCursor = responseBody.paging?.next?.after;

        return {
            Records: records,
            HasMore: nextCursor != null,
            NextCursor: nextCursor ?? undefined,
            TotalCount: responseBody.total,
        };
    }

    // ─── CRUD Helpers ────────────────────────────────────────────────────

    /** Converts a raw HubSpot API object to an ExternalRecord. */
    private RawToExternalRecord(raw: Record<string, unknown>, objectType: string): ExternalRecord {
        const flat = this.FlattenHubSpotRecord(raw);
        return {
            ExternalID: String(raw['id'] ?? ''),
            ObjectType: objectType,
            Fields: flat,
            ModifiedAt: raw['updatedAt'] ? new Date(raw['updatedAt'] as string) : undefined,
        };
    }

    /** Validates a CRUD response and throws on non-2xx status. */
    private ValidateCRUDResponse(response: RESTResponse, operation: string, objectName: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            const bodyPreview = typeof response.Body === 'string'
                ? response.Body.slice(0, 500)
                : JSON.stringify(response.Body).slice(0, 500);
            throw new Error(`[HubSpot] ${operation} on ${objectName} failed (HTTP ${response.Status}): ${bodyPreview}`);
        }
    }

    /** Builds a CRUDResult for error responses. */
    private BuildCRUDErrorResult(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const bodyObj = response.Body as Record<string, unknown> | undefined;
        const message = bodyObj?.['message']
            ? String(bodyObj['message'])
            : `[HubSpot] ${operation} on ${objectName} failed (HTTP ${response.Status})`;
        return {
            Success: false,
            ErrorMessage: message,
            StatusCode: response.Status,
        };
    }

    // ─── Abstract method implementations (BaseRESTIntegrationConnector) ──

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        console.log(`[HubSpot] Authenticating...`);
        const credentials = await this.LoadCredentials(companyIntegration, contextUser);
        const config = this.BuildConnectionConfig(credentials, companyIntegration);
        this._config = config;
        console.log(`[HubSpot] Authenticated, token length: ${credentials.AccessToken?.length ?? 0}`);
        const auth: HubSpotAuthContext = {
            Token: credentials.AccessToken,
            Credentials: credentials,
            Config: config,
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
        body?: unknown
    ): Promise<RESTResponse> {
        // Throttle: ensure minimum interval between requests
        const minInterval = this.effectiveMinRequestIntervalMs;
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minInterval) {
            await this.Sleep(minInterval - elapsed);
        }

        const maxRetries = this.effectiveMaxRetries;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            if (response.status === 429) {
                const delayMs = this.CalculateRetryDelay(response, attempt);
                console.warn(
                    `[HubSpot] Rate limited (429), retrying in ${delayMs}ms ` +
                    `(attempt ${attempt + 1}/${maxRetries})`
                );
                await this.Sleep(delayMs);
                continue;
            }

            // Handle empty responses (e.g., 204 No Content from DELETE)
            if (response.status === 204) {
                return this.BuildRESTResponse(response, {});
            }

            const responseBody = await response.json() as unknown;
            return this.BuildRESTResponse(response, responseBody);
        }

        throw new Error(`HubSpot API request failed after ${maxRetries} retries: ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        const body = rawBody as Record<string, unknown>;

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

        const flattened = records.map(r => this.FlattenHubSpotRecord(r as Record<string, unknown>));
        console.log(`[HubSpot] NormalizeResponse: ${flattened.length} records flattened`);
        return flattened;
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

    // ─── Configuration parsing ────────────────────────────────────

    /**
     * Builds a HubSpotConnectionConfig from credentials and optional overrides
     * from the CompanyIntegration Configuration JSON.
     */
    private BuildConnectionConfig(
        credentials: HubSpotCredentials,
        companyIntegration: MJCompanyIntegrationEntity
    ): HubSpotConnectionConfig {
        const config: HubSpotConnectionConfig = {
            AccessToken: credentials.AccessToken,
            ApiVersion: credentials.ApiVersion,
        };

        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            this.ApplyConfigOverrides(config, configJson);
        }

        return config;
    }

    /**
     * Parses optional performance overrides from Configuration JSON and applies
     * them to the provided config object. Invalid/missing values are silently ignored.
     */
    private ApplyConfigOverrides(config: HubSpotConnectionConfig, json: string): void {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            const parseOptionalInt = (key: string): number | undefined => {
                const v = parsed[key];
                if (v == null) return undefined;
                const n = Number(v);
                return isNaN(n) ? undefined : Math.floor(n);
            };

            config.MaxRetries = parseOptionalInt('MaxRetries');
            config.RequestTimeoutMs = parseOptionalInt('RequestTimeoutMs');
            config.MinRequestIntervalMs = parseOptionalInt('MinRequestIntervalMs');
        } catch {
            // Configuration JSON may not be valid JSON or may only contain credentials — ignore
        }
    }

    // ─── Credential management ────────────────────────────────────

    /**
     * Reads credentials from CompanyIntegration.CredentialID -> Credential.Values JSON,
     * or falls back to CompanyIntegration Configuration JSON for backwards compat.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<HubSpotCredentials> {
        // Try loading from linked Credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const creds = await this.LoadFromCredentialEntity(credentialID, contextUser);
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
    private async LoadFromCredentialEntity(credentialID: string, contextUser: UserInfo): Promise<HubSpotCredentials | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
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
     * Returns the known field names for a HubSpot object type, derived from
     * the HUBSPOT_OBJECTS metadata (single source of truth).
     */
    private GetObjectFieldNames(objectName: string): string[] {
        const obj = HUBSPOT_OBJECTS.find(o => o.Name === objectName);
        return obj ? obj.Fields.map(f => f.Name) : [];
    }

    /**
     * Builds the `properties` query parameter for a HubSpot object type.
     * Returns empty string if no properties are configured for the object.
     */
    private BuildPropertiesParam(objectName: string): string {
        const properties = this.GetObjectFieldNames(objectName);
        if (properties.length > 0) {
            return `&properties=${properties.join(',')}`;
        }
        return '';
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    /** Executes an HTTP request with a timeout and optional JSON body. */
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
            const requestInit: RequestInit = { method, headers, signal: controller.signal };
            if (body !== undefined) {
                requestInit.body = JSON.stringify(body);
                (requestInit.headers as Record<string, string>)['Content-Type'] = 'application/json';
            }
            return await fetch(url, requestInit);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`HubSpot API request timed out after ${timeoutMs / 1000}s: ${url}`);
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
