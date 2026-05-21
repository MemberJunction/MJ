import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
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
    type FetchContext,
    type FetchBatchResult,
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
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type SourceSchemaInfo,
    type SourceFieldInfo,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed HubSpot API credentials */
interface HubSpotCredentials {
    AccessToken: string;
    ApiVersion: string;
}

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface HubSpotConnectionConfig {
    /** HubSpot Private App access token (API Key auth — Bearer header). */
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
    hidden?: boolean;
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

    // ══════════════════════════════════════════════════════════════════════
    // CRM: Goal Targets (discovered live via Properties API)
    // ══════════════════════════════════════════════════════════════════════
    {
        Name: 'goal_targets', DisplayName: 'Goal Target',
        Description: 'Target milestone or metric threshold for a goal', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_goal_name', DisplayName: 'Goal Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated goal name' },
            { Name: 'hs_target_amount', DisplayName: 'Target Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Target value to achieve' },
            { Name: 'hs_goal_target_kpi_type', DisplayName: 'KPI Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'KPI metric type' },
            { Name: 'hs_start_date', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Goal target start date' },
            { Name: 'hs_end_date', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Goal target end date' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ══════════════════════════════════════════════════════════════════════
    // Non-CRM Objects — field definitions for objects without Properties API
    // ══════════════════════════════════════════════════════════════════════

    // ── Pipelines & Stages ───────────────────────────────────────────────
    {
        Name: 'deal_pipelines', DisplayName: 'Deal Pipeline',
        Description: 'Deal pipeline definitions', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Pipeline ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Pipeline unique identifier' },
            { Name: 'label', DisplayName: 'Label', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Pipeline display label' },
            { Name: 'displayOrder', DisplayName: 'Display Order', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sort order' },
            { Name: 'archived', DisplayName: 'Archived', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether pipeline is archived' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'ticket_pipelines', DisplayName: 'Ticket Pipeline',
        Description: 'Ticket pipeline definitions', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Pipeline ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Pipeline unique identifier' },
            { Name: 'label', DisplayName: 'Label', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Pipeline display label' },
            { Name: 'displayOrder', DisplayName: 'Display Order', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sort order' },
            { Name: 'archived', DisplayName: 'Archived', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether pipeline is archived' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'deal_pipeline_stages', DisplayName: 'Deal Pipeline Stage',
        Description: 'Stages within deal pipelines', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Stage ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Stage unique identifier' },
            { Name: 'label', DisplayName: 'Label', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Stage display name' },
            { Name: 'displayOrder', DisplayName: 'Display Order', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sort order within pipeline' },
            { Name: 'metadata', DisplayName: 'Metadata', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Stage metadata JSON (probability, isClosed)' },
            { Name: 'writePermissions', DisplayName: 'Write Permissions', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Write permission setting' },
            { Name: 'archived', DisplayName: 'Archived', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether stage is archived' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'ticket_pipeline_stages', DisplayName: 'Ticket Pipeline Stage',
        Description: 'Stages within ticket pipelines', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Stage ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Stage unique identifier' },
            { Name: 'label', DisplayName: 'Label', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Stage display name' },
            { Name: 'displayOrder', DisplayName: 'Display Order', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sort order within pipeline' },
            { Name: 'metadata', DisplayName: 'Metadata', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Stage metadata JSON (ticketState)' },
            { Name: 'writePermissions', DisplayName: 'Write Permissions', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Write permission setting' },
            { Name: 'archived', DisplayName: 'Archived', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether stage is archived' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Lists Sub-Resources ──────────────────────────────────────────────
    {
        Name: 'list_memberships', DisplayName: 'List Membership',
        Description: 'Records belonging to a contact or company list', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'recordId', DisplayName: 'Record ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'CRM record ID that is a member' },
            { Name: 'listId', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'ID of the parent list' },
            { Name: 'membershipTimestamp', DisplayName: 'Membership Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the record joined the list' },
            { Name: 'listVersion', DisplayName: 'List Version', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'List version when record was added' },
        ],
    },
    {
        Name: 'list_folders', DisplayName: 'List Folder',
        Description: 'Organizational folders for grouping lists', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'folderId', DisplayName: 'Folder ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Folder unique identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Folder name' },
            { Name: 'parentFolderId', DisplayName: 'Parent Folder ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent folder ID (0 for root)' },
        ],
    },

    // ── CRM Imports & Exports ────────────────────────────────────────────
    {
        Name: 'crm_imports', DisplayName: 'CRM Import',
        Description: 'Import job history and status', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Import ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Import job identifier' },
            { Name: 'state', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Import state (STARTED, PROCESSING, DONE, FAILED, CANCELED)' },
            { Name: 'optOutImport', DisplayName: 'Opt Out Import', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether import was opt-out type' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When import was initiated' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When import status last changed' },
        ],
    },
    {
        Name: 'crm_exports', DisplayName: 'CRM Export',
        Description: 'Export job history and status', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Export ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Export task identifier' },
            { Name: 'status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Export status (PENDING, PROCESSING, COMPLETE)' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When export started' },
        ],
    },

    // ── Transactional Email ──────────────────────────────────────────────
    {
        Name: 'transactional_smtp_tokens', DisplayName: 'Transactional SMTP Token',
        Description: 'SMTP API tokens for transactional email sending', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Token ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Token unique identifier' },
            { Name: 'emailAddress', DisplayName: 'Email Address', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sender email address' },
            { Name: 'createdBy', DisplayName: 'Created By', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User who created the token' },
            { Name: 'emailCampaignId', DisplayName: 'Email Campaign ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Associated email campaign' },
            { Name: 'campaignName', DisplayName: 'Campaign Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign label for grouping' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
        ],
    },

    // ── HubDB Rows ───────────────────────────────────────────────────────
    {
        Name: 'hubdb_rows', DisplayName: 'HubDB Row',
        Description: 'Row data within a HubDB structured table', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Row ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Row unique identifier' },
            { Name: 'path', DisplayName: 'Path', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'URL path for the row' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Row display name' },
            { Name: 'childTableId', DisplayName: 'Child Table ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Nested child table reference' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Automation — Custom Coded Actions ─────────────────────────────────
    {
        Name: 'custom_coded_actions', DisplayName: 'Custom Coded Action',
        Description: 'Developer-created workflow extension action definitions', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Action ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Action definition identifier' },
            { Name: 'actionUrl', DisplayName: 'Action URL', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Webhook URL for action execution' },
            { Name: 'published', DisplayName: 'Published', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether action is published' },
            { Name: 'revisionId', DisplayName: 'Revision ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current revision identifier' },
            { Name: 'archivedAt', DisplayName: 'Archived At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When archived (null if active)' },
        ],
    },

    // ── Files — Folders ──────────────────────────────────────────────────
    {
        Name: 'file_folders', DisplayName: 'File Folder',
        Description: 'File manager folder structure', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Folder ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Folder unique identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Folder name' },
            { Name: 'path', DisplayName: 'Path', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Full path to the folder' },
            { Name: 'parentFolderId', DisplayName: 'Parent Folder ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent folder for nesting' },
            { Name: 'archived', DisplayName: 'Archived', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether folder is archived' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Account & Settings ───────────────────────────────────────────────
    {
        Name: 'account_info', DisplayName: 'Account Info',
        Description: 'HubSpot portal account details and configuration', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'portalId', DisplayName: 'Portal ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot portal (account) ID' },
            { Name: 'accountType', DisplayName: 'Account Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Account/subscription type' },
            { Name: 'timeZone', DisplayName: 'Time Zone', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Portal default time zone' },
            { Name: 'companyCurrency', DisplayName: 'Company Currency', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Default currency code' },
            { Name: 'additionalCurrencies', DisplayName: 'Additional Currencies', Type: 'text', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Enabled additional currencies' },
            { Name: 'utcOffset', DisplayName: 'UTC Offset', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'UTC offset string' },
            { Name: 'utcOffsetMilliseconds', DisplayName: 'UTC Offset (ms)', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'UTC offset in milliseconds' },
            { Name: 'uiDomain', DisplayName: 'UI Domain', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Portal UI domain' },
            { Name: 'dataHostingLocation', DisplayName: 'Data Hosting Location', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Data residency region' },
        ],
    },
    {
        Name: 'api_usage', DisplayName: 'API Usage',
        Description: 'Daily API call usage statistics', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'name', DisplayName: 'App Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Private app name' },
            { Name: 'usageCount', DisplayName: 'Usage Count', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of API calls' },
            { Name: 'currentUsage', DisplayName: 'Current Usage', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current usage for the period' },
            { Name: 'collectedAt', DisplayName: 'Collected At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When data was collected' },
            { Name: 'fetchStatus', DisplayName: 'Fetch Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status of the data fetch' },
            { Name: 'resetsAt', DisplayName: 'Resets At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When usage counter resets' },
        ],
    },
    {
        Name: 'portal_users', DisplayName: 'Portal User',
        Description: 'HubSpot portal users with role and team assignments', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'User ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'User unique identifier' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'User email address' },
            { Name: 'roleId', DisplayName: 'Role ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned role identifier' },
            { Name: 'primaryTeamId', DisplayName: 'Primary Team ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary team assignment' },
            { Name: 'superAdmin', DisplayName: 'Super Admin', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether user is a super admin' },
        ],
    },
    {
        Name: 'user_roles', DisplayName: 'User Role',
        Description: 'Portal user role definitions', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Role ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Role unique identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Role name' },
            { Name: 'requiresBillingWrite', DisplayName: 'Requires Billing Write', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether role requires billing write' },
        ],
    },
    {
        Name: 'business_units', DisplayName: 'Business Unit',
        Description: 'Business unit partitions within a portal', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Business Unit ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Business unit identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Business unit name' },
            { Name: 'logoMetadata', DisplayName: 'Logo Metadata', Type: 'text', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Logo configuration JSON' },
        ],
    },
    {
        Name: 'currencies', DisplayName: 'Currency',
        Description: 'Exchange rate and currency settings', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Exchange Rate ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Exchange rate record identifier' },
            { Name: 'fromCurrencyCode', DisplayName: 'From Currency', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Source currency code (ISO 4217)' },
            { Name: 'toCurrencyCode', DisplayName: 'To Currency', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Target currency code (ISO 4217)' },
            { Name: 'conversionRate', DisplayName: 'Conversion Rate', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Exchange rate value' },
            { Name: 'effectiveTimestamp', DisplayName: 'Effective At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When rate became effective' },
            { Name: 'visible', DisplayName: 'Visible', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether currency pair is visible' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Conversations ────────────────────────────────────────────────────
    {
        Name: 'conversation_inboxes', DisplayName: 'Conversation Inbox',
        Description: 'Conversations inbox definitions', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Inbox ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Inbox unique identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'Inbox name' },
            { Name: 'archived', DisplayName: 'Archived', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether inbox is archived' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'conversation_inbox_channels', DisplayName: 'Conversation Inbox Channel',
        Description: 'Communication channels attached to a conversations inbox', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'channelId', DisplayName: 'Channel ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Channel unique identifier' },
            { Name: 'channelAccountId', DisplayName: 'Channel Account ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Account ID for the channel' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Channel display name' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Channel type (EMAIL, CHAT, FORM)' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'conversation_custom_channels', DisplayName: 'Conversation Custom Channel',
        Description: 'Developer-registered custom communication channels', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Channel ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Custom channel identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Channel display name' },
            { Name: 'webhookUrl', DisplayName: 'Webhook URL', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Webhook URL for receiving messages' },
            { Name: 'channelAccountConnectUrl', DisplayName: 'Connect URL', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'URL for connecting channel accounts' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Timeline Events ──────────────────────────────────────────────────
    {
        Name: 'timeline_event_templates', DisplayName: 'Timeline Event Template',
        Description: 'Custom timeline event type definitions', SupportsWrite: true, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Template ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event template identifier' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Template name' },
            { Name: 'objectType', DisplayName: 'Object Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'CRM object type this event applies to' },
            { Name: 'headerTemplate', DisplayName: 'Header Template', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Handlebars template for event header' },
            { Name: 'detailTemplate', DisplayName: 'Detail Template', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Handlebars template for event detail' },
            { Name: 'createdAt', DisplayName: 'Created At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'updatedAt', DisplayName: 'Updated At', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Analytics / Legacy ───────────────────────────────────────────────
    {
        Name: 'email_campaigns_legacy', DisplayName: 'Email Campaign (Legacy)',
        Description: 'Email campaign tracking and analytics', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign unique identifier' },
            { Name: 'appId', DisplayName: 'App ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'App that created the campaign' },
            { Name: 'appName', DisplayName: 'App Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'App display name' },
            { Name: 'contentId', DisplayName: 'Content ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Associated content identifier' },
            { Name: 'subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email subject line' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign name' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign type' },
            { Name: 'numIncluded', DisplayName: 'Num Included', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of recipients included' },
            { Name: 'numQueued', DisplayName: 'Num Queued', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of emails queued' },
            { Name: 'subType', DisplayName: 'Sub Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Campaign sub-type' },
            { Name: 'lastUpdatedTime', DisplayName: 'Last Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last updated' },
        ],
    },

    // ── Missing T1 CRM objects (in STANDARD_OBJECTS but not previously listed here) ─

    {
        Name: 'leads', DisplayName: 'Lead',
        Description: 'A prospective buyer in the lead pipeline (separate from contact lifecycle stage)', SupportsWrite: true,
        Fields: [
            { Name: 'hs_lead_label', DisplayName: 'Lead Label', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Display label for the lead' },
            { Name: 'hs_is_enrolled_in_sequence', DisplayName: 'Enrolled in Sequence', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether enrolled in a sequence' },
            { Name: 'hs_lead_status', DisplayName: 'Lead Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead qualification status' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Engagement / Activity objects ────────────────────────────────────
    {
        Name: 'communications', DisplayName: 'Communication',
        Description: 'SMS, WhatsApp, and LinkedIn messages logged as CRM engagements', SupportsWrite: true,
        Fields: [
            { Name: 'hs_communication_channel_type', DisplayName: 'Channel Type', Type: 'enum', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Channel (SMS, WHATS_APP, LINKEDIN_MESSAGE)' },
            { Name: 'hs_communication_body', DisplayName: 'Body', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Message body' },
            { Name: 'hs_communication_logged_from', DisplayName: 'Logged From', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Source of the logged communication' },
            { Name: 'hs_timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'When the communication occurred' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'postal_mail', DisplayName: 'Postal Mail',
        Description: 'Physical mail logged as a CRM engagement', SupportsWrite: true,
        Fields: [
            { Name: 'hs_body_preview', DisplayName: 'Body Preview', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Preview of the mail content' },
            { Name: 'hs_timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'When the mail was sent' },
            { Name: 'hs_postal_mail_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Delivery status' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Commerce objects ─────────────────────────────────────────────────
    {
        Name: 'invoices', DisplayName: 'Invoice',
        Description: 'Billing invoice records in HubSpot Commerce', SupportsWrite: true,
        Fields: [
            { Name: 'hs_invoice_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice status (DRAFT, OUTSTANDING, PAID, VOIDED)' },
            { Name: 'hs_number', DisplayName: 'Invoice Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice number' },
            { Name: 'hs_due_date', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment due date' },
            { Name: 'hs_currency_code', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'ISO currency code' },
            { Name: 'hs_invoice_total_amount', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total invoice amount' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'subscriptions', DisplayName: 'Commerce Subscription',
        Description: 'Recurring commerce subscriptions', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Subscription status (ACTIVE, CANCELLED, PAST_DUE, etc.)' },
            { Name: 'hs_billing_start_date', DisplayName: 'Billing Start', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When billing started' },
            { Name: 'hs_recurring_billing_period', DisplayName: 'Billing Period', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Billing frequency period' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'discounts', DisplayName: 'Discount',
        Description: 'Discount line items applied to commerce transactions', SupportsWrite: true,
        Fields: [
            { Name: 'hs_label', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Discount label' },
            { Name: 'hs_discount_percentage', DisplayName: 'Discount %', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Percentage discount amount' },
            { Name: 'hs_value', DisplayName: 'Value', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Fixed discount value' },
            { Name: 'hs_type', DisplayName: 'Type', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Discount type (PERCENT or FIXED_AMOUNT)' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'fees', DisplayName: 'Fee',
        Description: 'Fee line items applied to commerce transactions', SupportsWrite: true,
        Fields: [
            { Name: 'hs_label', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Fee label' },
            { Name: 'hs_value', DisplayName: 'Value', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Fee amount' },
            { Name: 'hs_type', DisplayName: 'Type', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Fee type (PERCENT or FIXED_AMOUNT)' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'taxes', DisplayName: 'Tax',
        Description: 'Tax line items applied to commerce transactions', SupportsWrite: true,
        Fields: [
            { Name: 'hs_label', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax label' },
            { Name: 'hs_rate', DisplayName: 'Rate', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax rate percentage' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'commerce_payments', DisplayName: 'Commerce Payment',
        Description: 'Payment records for commerce transactions', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_payment_amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment amount' },
            { Name: 'hs_payment_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment status' },
            { Name: 'hs_payment_date', DisplayName: 'Payment Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When payment was made' },
            { Name: 'hs_currency_code', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ISO currency code' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'users', DisplayName: 'CRM User',
        Description: 'HubSpot user records exposed via CRM API (distinct from portal settings users)', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User email address' },
            { Name: 'hs_given_name', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First name' },
            { Name: 'hs_family_name', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last name' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'orders', DisplayName: 'Order',
        Description: 'Commerce order records', SupportsWrite: true,
        Fields: [
            { Name: 'hs_order_name', DisplayName: 'Order Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name of the order' },
            { Name: 'hs_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Order status' },
            { Name: 'hs_fulfillment_status', DisplayName: 'Fulfillment Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Fulfillment status' },
            { Name: 'hs_currency_code', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'ISO currency code' },
            { Name: 'hs_total_price', DisplayName: 'Total Price', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total order price' },
            { Name: 'hs_source_store', DisplayName: 'Source Store', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Source store/channel' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'carts', DisplayName: 'Cart',
        Description: 'Shopping cart records for commerce', SupportsWrite: true,
        Fields: [
            { Name: 'hs_cart_name', DisplayName: 'Cart Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Cart name or identifier' },
            { Name: 'hs_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Cart status (OPEN, CONVERTED, ABANDONED)' },
            { Name: 'hs_total_price', DisplayName: 'Total Price', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total cart value' },
            { Name: 'hs_currency_code', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'ISO currency code' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Marketing ────────────────────────────────────────────────────────
    {
        Name: 'marketing_events', DisplayName: 'Marketing Event',
        Description: 'Virtual or in-person events tracked in HubSpot', SupportsWrite: true,
        Fields: [
            { Name: 'eventName', DisplayName: 'Event Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name of the marketing event' },
            { Name: 'eventType', DisplayName: 'Event Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type of event (WEBINAR, CONFERENCE, etc.)' },
            { Name: 'eventOrganizer', DisplayName: 'Organizer', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event organizer name' },
            { Name: 'eventUrl', DisplayName: 'Event URL', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Link to the event' },
            { Name: 'startDateTime', DisplayName: 'Start Date/Time', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event start date and time' },
            { Name: 'endDateTime', DisplayName: 'End Date/Time', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event end date and time' },
            { Name: 'registrants', DisplayName: 'Registrants', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Number of registered attendees' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── Activatable Objects (Object Library) ─────────────────────────────
    {
        Name: 'services', DisplayName: 'Service',
        Description: 'Service offerings tracked in HubSpot (activatable object)', SupportsWrite: true,
        Fields: [
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Service name' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Service description' },
            { Name: 'price', DisplayName: 'Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Service price' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'courses', DisplayName: 'Course',
        Description: 'Educational courses tracked in HubSpot (activatable object)', SupportsWrite: true,
        Fields: [
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Course name' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Course description' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'listings', DisplayName: 'Listing',
        Description: 'Property or product listings (activatable object)', SupportsWrite: true,
        Fields: [
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Listing name' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Listing description' },
            { Name: 'price', DisplayName: 'Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Listing price' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'appointments', DisplayName: 'Appointment',
        Description: 'Scheduled appointments (activatable object)', SupportsWrite: true,
        Fields: [
            { Name: 'hs_appointment_name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Appointment name' },
            { Name: 'hs_appointment_start', DisplayName: 'Start', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Appointment start time' },
            { Name: 'hs_appointment_end', DisplayName: 'End', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Appointment end time' },
            { Name: 'hs_appointment_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Appointment status' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },

    // ── System / Other CRM ───────────────────────────────────────────────
    {
        Name: 'projects', DisplayName: 'Project',
        Description: 'Project records in HubSpot CRM', SupportsWrite: true,
        Fields: [
            { Name: 'hs_project_name', DisplayName: 'Project Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name of the project' },
            { Name: 'hs_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project status' },
            { Name: 'hs_start_date', DisplayName: 'Start Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project start date' },
            { Name: 'hs_due_date', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project due date' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'deal_splits', DisplayName: 'Deal Split',
        Description: 'Revenue split allocations across deal owners', SupportsWrite: true,
        Fields: [
            { Name: 'hs_split_percentage', DisplayName: 'Split %', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Percentage of deal revenue attributed to this split' },
            { Name: 'hs_split_amount', DisplayName: 'Split Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Calculated split amount' },
            { Name: 'hs_deal_id', DisplayName: 'Deal ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated deal ID' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Owner receiving the split credit' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'transcriptions', DisplayName: 'Transcription',
        Description: 'Call transcription records (auto-generated by HubSpot AI, read-only)', SupportsWrite: false, IncludeInActionGeneration: false,
        Fields: [
            { Name: 'hs_call_id', DisplayName: 'Call ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'ID of the associated call' },
            { Name: 'hs_transcript_text', DisplayName: 'Transcript', Type: 'text', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Full call transcript text' },
            { Name: 'hs_language', DisplayName: 'Language', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Detected transcript language' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last modified' },
        ],
    },
    {
        Name: 'contracts', DisplayName: 'Contract',
        Description: 'Contract records in HubSpot CRM', SupportsWrite: true,
        Fields: [
            { Name: 'hs_title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contract title' },
            { Name: 'hs_contract_status', DisplayName: 'Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contract status (DRAFT, SENT, SIGNED, etc.)' },
            { Name: 'hs_effective_date', DisplayName: 'Effective Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date the contract takes effect' },
            { Name: 'hs_expiration_date', DisplayName: 'Expiration Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contract expiration date' },
            { Name: 'hs_total_contract_value', DisplayName: 'Total Value', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total contract value' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Assigned owner user ID' },
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
 * Uses Bearer token authentication with a HubSpot Private App access token (API Key auth).
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

    /** Cached auth context — reused within a session to avoid redundant credential loads */
    private _cachedAuth: RESTAuthContext | null = null;

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

    // ─── Live API Discovery ─────────────────────────────────────────────

    /** Known standard HubSpot CRM object type IDs → API names. */
    /**
     * All standard CRM object type IDs → names.
     * Fields discovered live via /crm/v3/properties/{objectType}.
     * All support: GET, POST, PATCH, DELETE, search (incremental via hs_lastmodifieddate).
     */
    private static readonly STANDARD_OBJECTS: Record<string, string> = {
        // Core CRM
        '0-1': 'contacts', '0-2': 'companies', '0-3': 'deals', '0-4': 'leads',
        '0-5': 'tickets', '0-7': 'products', '0-8': 'line_items',
        // Activities
        '0-18': 'communications', '0-19': 'feedback_submissions',
        '0-27': 'tasks', '0-46': 'notes', '0-47': 'meetings',
        '0-48': 'calls', '0-49': 'emails', '0-116': 'postal_mail',
        // Commerce
        '0-14': 'quotes', '0-53': 'invoices', '0-69': 'subscriptions',
        '0-74': 'goal_targets', '0-84': 'discounts', '0-85': 'fees',
        '0-86': 'taxes', '0-101': 'commerce_payments', '0-115': 'users',
        '0-123': 'orders', '0-142': 'carts',
        // Marketing (CRM-backed)
        '0-54': 'marketing_events',
        // Activatable (Object Library)
        '0-162': 'services', '0-410': 'courses', '0-420': 'listings',
        '0-421': 'appointments',
        // System / Other CRM
        // NOTE: deal_splits (0-72), transcriptions (0-150), contracts (0-155) objectTypeIds
        // are confirmed from the HubSpot API catalog as of April 2026 but have not been
        // independently verified against a live account. partner_clients, partner_services,
        // and subscription_lifecycle have TBD objectTypeIds — discovered dynamically via schemas API.
        '0-970': 'projects', '0-72': 'deal_splits', '0-150': 'transcriptions',
        '0-155': 'contracts', '0-136': 'goals',
    };

    /**
     * Non-CRM API endpoints that don't follow the /crm/v3/objects pattern.
     * Fields cannot be discovered via /crm/v3/properties — discovered dynamically
     * by fetching one record and inferring fields from the response.
     */
    private static readonly NON_CRM_OBJECTS: Array<{
        name: string; label: string; description: string;
        apiPath: string; write: boolean; incremental: boolean;
        pkField: string; incrementalParam?: string;
        /**
         * Server-side incremental sync query parameter name.
         * When set and a watermark exists, appended as `&{param}={watermark}` to the request URL.
         * This enables server-side date filtering, which is far more efficient than client-side.
         * When set, client-side date filtering is skipped (server already filtered).
         * Common values: 'updatedAfter' (CMS/Marketing/Files endpoints), 'occurredAfter' (Events).
         */
        serverIncrementalParam?: string;
        /**
         * For parameterized endpoints (apiPath contains {placeholder}):
         * the name of the parent NON_CRM_OBJECTS entry whose records provide
         * the substitution values. The placeholder in apiPath is replaced with
         * the parent record's pkField value. When undefined, the apiPath is
         * used as-is (no placeholder substitution).
         */
        parentObject?: string;
    }> = [
        // ── CRM Config ───────────────────────────────────────────────────
        { name: 'owners', label: 'Owners', description: 'HubSpot users who own records', apiPath: '/crm/v3/owners', write: false, incremental: true, pkField: 'id', incrementalParam: 'after' },
        { name: 'deal_pipelines', label: 'Deal Pipelines', description: 'Deal pipeline definitions and stages', apiPath: '/crm/v3/pipelines/deals', write: true, incremental: false, pkField: 'id' },
        { name: 'ticket_pipelines', label: 'Ticket Pipelines', description: 'Ticket pipeline definitions and stages', apiPath: '/crm/v3/pipelines/tickets', write: true, incremental: false, pkField: 'id' },
        { name: 'forecasts', label: 'Forecasts', description: 'CRM sales forecasts', apiPath: '/crm/v3/forecasts', write: false, incremental: false, pkField: 'id' },
        // Pipeline stages — parameterized; falls back to DB fields
        { name: 'deal_pipeline_stages', label: 'Deal Pipeline Stages', description: 'Stages within deal pipelines', apiPath: '/crm/v3/pipelines/deals/{pipelineId}/stages', write: true, incremental: false, pkField: 'id', parentObject: 'deal_pipelines' },
        { name: 'ticket_pipeline_stages', label: 'Ticket Pipeline Stages', description: 'Stages within ticket pipelines', apiPath: '/crm/v3/pipelines/tickets/{pipelineId}/stages', write: true, incremental: false, pkField: 'id', parentObject: 'ticket_pipelines' },
        // Lists v3 — The legacy v1 Contact Lists API sunsets April 30, 2026.
        // This connector correctly uses the v3 endpoint which is the migration target.
        { name: 'lists', label: 'Lists', description: 'Contact and company lists', apiPath: '/crm/v3/lists', write: true, incremental: true, pkField: 'listId' },
        // List memberships — parameterized; fan-out across all lists
        { name: 'list_memberships', label: 'List Memberships', description: 'Records belonging to a list', apiPath: '/crm/v3/lists/{listId}/memberships', write: true, incremental: false, pkField: 'recordId', parentObject: 'lists' },
        { name: 'list_folders', label: 'List Folders', description: 'Organizational folders for lists', apiPath: '/crm/v3/lists/folders', write: true, incremental: false, pkField: 'id' },
        // CRM Imports & Exports
        { name: 'crm_imports', label: 'CRM Imports', description: 'Import job history and status', apiPath: '/crm/v3/imports', write: false, incremental: true, pkField: 'id' },
        { name: 'crm_exports', label: 'CRM Exports', description: 'Export job history and status', apiPath: '/crm/v3/exports/export/async', write: false, incremental: false, pkField: 'id' },

        // ── Marketing ────────────────────────────────────────────────────
        { name: 'marketing_emails', label: 'Marketing Emails', description: 'Marketing email campaigns', apiPath: '/marketing/v3/emails', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'campaigns', label: 'Campaigns', description: 'Marketing campaign tracking', apiPath: '/marketing/v3/campaigns', write: false, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        // Forms v3 — DEVELOPER_PREVIEW status in HubSpot API catalog. Use for listing/reading;
        // creating forms programmatically may not be supported in all plans.
        { name: 'forms', label: 'Forms', description: 'HubSpot forms for lead capture', apiPath: '/marketing/v3/forms', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        // Form submissions — legacy v1 endpoint; parameterized (requires formGuid); falls back to DB fields
        { name: 'form_submissions', label: 'Form Submissions', description: 'Submitted form data across all forms', apiPath: '/form-integrations/v1/submissions/forms', write: false, incremental: true, pkField: 'submittedAt' },
        // Transactional email — v3 SMTP tokens for single-send (legacy Transactional Single Send)
        { name: 'transactional_smtp_tokens', label: 'Transactional SMTP Tokens', description: 'SMTP API tokens for transactional email', apiPath: '/marketing/v3/transactional/smtp-tokens', write: true, incremental: false, pkField: 'id' },
        // Single-send v4 — separate from the v3 SMTP token endpoint; DEVELOPER_PREVIEW in catalog
        { name: 'single_send_v4', label: 'Single Send (v4)', description: 'Single-send transactional email via Marketing API v4', apiPath: '/marketing/v4/email/single-send', write: true, incremental: false, pkField: 'id' },
        // Ads
        { name: 'ad_campaigns', label: 'Ad Campaigns', description: 'Advertising campaigns across ad networks', apiPath: '/marketing/v3/ads/campaigns', write: false, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'ad_accounts', label: 'Ad Accounts', description: 'Connected advertising accounts', apiPath: '/marketing/v3/ads/accounts', write: false, incremental: false, pkField: 'id' },

        // ── CMS ──────────────────────────────────────────────────────────
        { name: 'site_pages', label: 'Site Pages', description: 'CMS website pages', apiPath: '/cms/v3/pages/site-pages', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'landing_pages', label: 'Landing Pages', description: 'CMS landing pages', apiPath: '/cms/v3/pages/landing-pages', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'blog_posts', label: 'Blog Posts', description: 'CMS blog posts', apiPath: '/cms/v3/blogs/posts', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'blog_authors', label: 'Blog Authors', description: 'CMS blog author profiles', apiPath: '/cms/v3/blogs/authors', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'blog_tags', label: 'Blog Tags', description: 'CMS blog tag taxonomy', apiPath: '/cms/v3/blogs/tags', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'blog_settings', label: 'Blog Settings', description: 'CMS blog configuration', apiPath: '/cms/v3/blogs/settings', write: false, incremental: false, pkField: 'id' },
        { name: 'domains', label: 'Domains', description: 'Connected domains', apiPath: '/cms/v3/domains', write: false, incremental: false, pkField: 'id' },
        { name: 'url_mappings', label: 'URL Mappings', description: 'CMS URL mapping rules', apiPath: '/cms/v3/url-redirects/mapping', write: true, incremental: false, pkField: 'id' },
        { name: 'url_redirects', label: 'URL Redirects', description: 'URL redirect rules', apiPath: '/cms/v3/url-redirects', write: true, incremental: false, pkField: 'id' },
        { name: 'site_search', label: 'Site Search', description: 'CMS site search index results', apiPath: '/cms/v3/site-search/search', write: false, incremental: false, pkField: 'id' },
        { name: 'source_code', label: 'Source Code', description: 'CMS theme and template source files', apiPath: '/cms/v3/source-code/environment/published', write: true, incremental: false, pkField: 'path' },
        { name: 'media_bridge', label: 'Media Bridge', description: 'External media provider bridge objects', apiPath: '/cms/v3/media-bridge/objects', write: true, incremental: false, pkField: 'id' },
        { name: 'hubdb_tables', label: 'HubDB Tables', description: 'HubDB structured data tables', apiPath: '/cms/v3/hubdb/tables', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        // HubDB rows — parameterized; fan-out across all HubDB tables
        { name: 'hubdb_rows', label: 'HubDB Rows', description: 'Row data within HubDB tables', apiPath: '/cms/v3/hubdb/tables/{tableIdOrName}/rows', write: true, incremental: false, pkField: 'id', parentObject: 'hubdb_tables' },

        // ── Automation ───────────────────────────────────────────────────
        // v3/workflows is the standard listing endpoint
        { name: 'workflows', label: 'Workflows', description: 'Automation workflows', apiPath: '/automation/v3/workflows', write: false, incremental: false, pkField: 'id' },
        // v4/actions — custom coded actions (requires appId); falls back to DB fields
        { name: 'custom_coded_actions', label: 'Custom Coded Actions', description: 'Developer-created workflow extension actions', apiPath: '/automation/v4/actions/{appId}', write: true, incremental: false, pkField: 'id' },

        // ── Events ───────────────────────────────────────────────────────
        { name: 'behavioral_events', label: 'Behavioral Events', description: 'Custom behavioral event completions', apiPath: '/events/v3/events', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'occurredAfter' },
        { name: 'event_definitions', label: 'Event Definitions', description: 'Custom event type definitions', apiPath: '/events/v3/event-definitions', write: true, incremental: false, pkField: 'name' },
        // Event completions — parameterized; fan-out across all event definitions
        { name: 'event_completions', label: 'Event Completions', description: 'Completion records for a specific custom behavioral event type', apiPath: '/events/v3/event-definitions/{eventDefinitionName}/completions', write: false, incremental: true, pkField: 'id', parentObject: 'event_definitions' },

        // ── Files ────────────────────────────────────────────────────────
        { name: 'files', label: 'Files', description: 'File manager files and documents', apiPath: '/files/v3/files', write: true, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        { name: 'file_folders', label: 'File Folders', description: 'File manager folder structure', apiPath: '/files/v3/folders', write: true, incremental: false, pkField: 'id' },

        // ── Account & Settings ───────────────────────────────────────────
        { name: 'account_info', label: 'Account Info', description: 'HubSpot portal account details', apiPath: '/account-info/v3/details', write: false, incremental: false, pkField: 'portalId' },
        { name: 'api_usage', label: 'API Usage', description: 'Daily API usage statistics', apiPath: '/account-info/v3/api-usage/daily', write: false, incremental: true, pkField: 'date' },
        { name: 'audit_logs', label: 'Audit Logs', description: 'Account activity audit trail', apiPath: '/account-info/v3/audit-logs/activity', write: false, incremental: true, pkField: 'id' },
        { name: 'portal_users', label: 'Portal Users', description: 'HubSpot portal users and permissions', apiPath: '/settings/v3/users', write: true, incremental: false, pkField: 'id' },
        { name: 'user_roles', label: 'User Roles', description: 'Portal user role definitions', apiPath: '/settings/v3/users/roles', write: false, incremental: false, pkField: 'id' },
        { name: 'business_units', label: 'Business Units', description: 'Business unit partitions within a portal', apiPath: '/business-units/v3/business-units', write: false, incremental: false, pkField: 'id' },
        { name: 'currencies', label: 'Currencies', description: 'Exchange rate and currency settings', apiPath: '/settings/v3/currencies', write: true, incremental: false, pkField: 'currencyCode' },
        { name: 'tax_rates', label: 'Tax Rates', description: 'Tax rate definitions', apiPath: '/tax-rates/v3/tax-rates', write: true, incremental: false, pkField: 'id' },

        // ── Communication Preferences ────────────────────────────────────
        { name: 'subscription_definitions', label: 'Subscription Definitions', description: 'Email subscription types', apiPath: '/communication-preferences/v4/definitions', write: true, incremental: false, pkField: 'id' },

        // ── User Provisioning (SCIM) ─────────────────────────────────────
        // Requires Enterprise + SCIM scope. Standard SCIM 2.0 schema.
        { name: 'scim_users', label: 'SCIM Users', description: 'User provisioning via SCIM 2.0', apiPath: '/scim/v2/Users', write: true, incremental: true, pkField: 'id', incrementalParam: 'startIndex' },
        { name: 'scim_groups', label: 'SCIM Groups', description: 'Group provisioning via SCIM 2.0', apiPath: '/scim/v2/Groups', write: true, incremental: false, pkField: 'id' },

        // ── Conversations ────────────────────────────────────────────────
        { name: 'conversation_inboxes', label: 'Conversation Inboxes', description: 'Conversations inbox definitions', apiPath: '/conversations/v3/conversations/inboxes', write: false, incremental: false, pkField: 'id' },
        { name: 'conversation_threads', label: 'Conversation Threads', description: 'Conversations inbox threads', apiPath: '/conversations/v3/conversations/threads', write: false, incremental: true, pkField: 'id', serverIncrementalParam: 'updatedAfter' },
        // Conversation messages — parameterized; fan-out across threads. NOTE: can be very large
        // at scale (one fetch per thread). Consider disabling for high-volume portals.
        { name: 'conversation_messages', label: 'Conversation Messages', description: 'Messages within conversation threads', apiPath: '/conversations/v3/conversations/threads/{threadId}/messages', write: false, incremental: false, pkField: 'id', parentObject: 'conversation_threads' },
        // Inbox channels — parameterized; fan-out across inboxes
        { name: 'conversation_inbox_channels', label: 'Conversation Inbox Channels', description: 'Communication channels attached to an inbox', apiPath: '/conversations/v3/conversations/inboxes/{inboxId}/channels', write: false, incremental: false, pkField: 'channelId', parentObject: 'conversation_inboxes' },
        // Custom channels (developer-registered channels)
        { name: 'conversation_custom_channels', label: 'Conversation Custom Channels', description: 'Developer-registered custom communication channels', apiPath: '/conversations/custom-channels/v3', write: true, incremental: false, pkField: 'id' },
        // Conversation channels — generic channel listing
        { name: 'conversation_channels', label: 'Conversation Channels', description: 'Communication channels for conversations', apiPath: '/conversations/v3/conversations/channels', write: false, incremental: false, pkField: 'id' },
        // Visitor identification
        { name: 'visitor_identification', label: 'Visitor Identification', description: 'Visitor identification tokens for conversations', apiPath: '/conversations/v3/visitor-identification/tokens/create', write: false, incremental: false, pkField: 'token' },

        // ── Timeline Events ──────────────────────────────────────────────
        // Timeline event templates — parameterized (requires appId); falls back to DB fields
        { name: 'timeline_event_templates', label: 'Timeline Event Templates', description: 'Custom timeline event type definitions', apiPath: '/integrators/timeline/v3/{appId}/event-templates', write: true, incremental: false, pkField: 'id' },

        // ── Automation ───────────────────────────────────────────────────
        { name: 'sequences', label: 'Sequences', description: 'Sales sequences and enrollment rules', apiPath: '/automation/v3/sequences', write: false, incremental: false, pkField: 'id' },

        // ── Scheduler ───────────────────────────────────────────────────
        { name: 'meeting_scheduler', label: 'Meeting Scheduler', description: 'Meeting booking page configurations', apiPath: '/scheduler/v3/meetings/meeting-links', write: false, incremental: false, pkField: 'id' },

        // ── Analytics / Reporting (Legacy) ───────────────────────────────
        { name: 'email_campaigns_legacy', label: 'Email Campaigns (Legacy)', description: 'Email campaign tracking and analytics', apiPath: '/email/public/v1/campaigns', write: false, incremental: true, pkField: 'id' },

        // ── Data Studio ─────────────────────────────────────────────────
        { name: 'datasource_ingestion', label: 'Datasource Ingestion', description: 'External data source ingestion (beta)', apiPath: '/data-studio/v3/datasource-ingestion', write: true, incremental: false, pkField: 'id' },
    ];

    /**
     * Association objects use the v4 per-object associations endpoint.
     * Fields are fixed (two FK columns + association_type) — no live discovery API exists.
     */
    private static readonly ASSOCIATION_OBJECTS: Array<{
        name: string; label: string; description: string;
        apiPath: string; pkFields: [string, string];
    }> = [
        { name: 'assoc_contacts_companies', label: 'Contact ↔ Company', description: 'Associations between contacts and companies', apiPath: '/crm/v4/associations/contacts/companies', pkFields: ['contact_id', 'company_id'] },
        { name: 'assoc_contacts_deals', label: 'Contact ↔ Deal', description: 'Associations between contacts and deals', apiPath: '/crm/v4/associations/contacts/deals', pkFields: ['contact_id', 'deal_id'] },
        { name: 'assoc_contacts_tickets', label: 'Contact ↔ Ticket', description: 'Associations between contacts and tickets', apiPath: '/crm/v4/associations/contacts/tickets', pkFields: ['contact_id', 'ticket_id'] },
        { name: 'assoc_contacts_calls', label: 'Contact ↔ Call', description: 'Associations between contacts and calls', apiPath: '/crm/v4/associations/contacts/calls', pkFields: ['contact_id', 'call_id'] },
        { name: 'assoc_contacts_emails', label: 'Contact ↔ Email', description: 'Associations between contacts and emails', apiPath: '/crm/v4/associations/contacts/emails', pkFields: ['contact_id', 'email_id'] },
        { name: 'assoc_contacts_meetings', label: 'Contact ↔ Meeting', description: 'Associations between contacts and meetings', apiPath: '/crm/v4/associations/contacts/meetings', pkFields: ['contact_id', 'meeting_id'] },
        { name: 'assoc_contacts_notes', label: 'Contact ↔ Note', description: 'Associations between contacts and notes', apiPath: '/crm/v4/associations/contacts/notes', pkFields: ['contact_id', 'note_id'] },
        { name: 'assoc_contacts_tasks', label: 'Contact ↔ Task', description: 'Associations between contacts and tasks', apiPath: '/crm/v4/associations/contacts/tasks', pkFields: ['contact_id', 'task_id'] },
        { name: 'assoc_contacts_feedback_submissions', label: 'Contact ↔ Feedback Submission', description: 'Associations between contacts and feedback submissions', apiPath: '/crm/v4/associations/contacts/feedback_submissions', pkFields: ['contact_id', 'feedback_submission_id'] },
        { name: 'assoc_companies_deals', label: 'Company ↔ Deal', description: 'Associations between companies and deals', apiPath: '/crm/v4/associations/companies/deals', pkFields: ['company_id', 'deal_id'] },
        { name: 'assoc_companies_tickets', label: 'Company ↔ Ticket', description: 'Associations between companies and tickets', apiPath: '/crm/v4/associations/companies/tickets', pkFields: ['company_id', 'ticket_id'] },
        { name: 'assoc_companies_calls', label: 'Company ↔ Call', description: 'Associations between companies and calls', apiPath: '/crm/v4/associations/companies/calls', pkFields: ['company_id', 'call_id'] },
        { name: 'assoc_companies_emails', label: 'Company ↔ Email', description: 'Associations between companies and emails', apiPath: '/crm/v4/associations/companies/emails', pkFields: ['company_id', 'email_id'] },
        { name: 'assoc_companies_meetings', label: 'Company ↔ Meeting', description: 'Associations between companies and meetings', apiPath: '/crm/v4/associations/companies/meetings', pkFields: ['company_id', 'meeting_id'] },
        { name: 'assoc_companies_notes', label: 'Company ↔ Note', description: 'Associations between companies and notes', apiPath: '/crm/v4/associations/companies/notes', pkFields: ['company_id', 'note_id'] },
        { name: 'assoc_companies_tasks', label: 'Company ↔ Task', description: 'Associations between companies and tasks', apiPath: '/crm/v4/associations/companies/tasks', pkFields: ['company_id', 'task_id'] },
        { name: 'assoc_deals_calls', label: 'Deal ↔ Call', description: 'Associations between deals and calls', apiPath: '/crm/v4/associations/deals/calls', pkFields: ['deal_id', 'call_id'] },
        { name: 'assoc_deals_emails', label: 'Deal ↔ Email', description: 'Associations between deals and emails', apiPath: '/crm/v4/associations/deals/emails', pkFields: ['deal_id', 'email_id'] },
        { name: 'assoc_deals_meetings', label: 'Deal ↔ Meeting', description: 'Associations between deals and meetings', apiPath: '/crm/v4/associations/deals/meetings', pkFields: ['deal_id', 'meeting_id'] },
        { name: 'assoc_deals_notes', label: 'Deal ↔ Note', description: 'Associations between deals and notes', apiPath: '/crm/v4/associations/deals/notes', pkFields: ['deal_id', 'note_id'] },
        { name: 'assoc_deals_tasks', label: 'Deal ↔ Task', description: 'Associations between deals and tasks', apiPath: '/crm/v4/associations/deals/tasks', pkFields: ['deal_id', 'task_id'] },
        { name: 'assoc_deals_quotes', label: 'Deal ↔ Quote', description: 'Associations between deals and quotes', apiPath: '/crm/v4/associations/deals/quotes', pkFields: ['deal_id', 'quote_id'] },
        { name: 'assoc_deals_line_items', label: 'Deal ↔ Line Item', description: 'Associations between deals and line items', apiPath: '/crm/v4/associations/deals/line_items', pkFields: ['deal_id', 'line_item_id'] },
        { name: 'assoc_tickets_calls', label: 'Ticket ↔ Call', description: 'Associations between tickets and calls', apiPath: '/crm/v4/associations/tickets/calls', pkFields: ['ticket_id', 'call_id'] },
        { name: 'assoc_tickets_emails', label: 'Ticket ↔ Email', description: 'Associations between tickets and emails', apiPath: '/crm/v4/associations/tickets/emails', pkFields: ['ticket_id', 'email_id'] },
        { name: 'assoc_tickets_meetings', label: 'Ticket ↔ Meeting', description: 'Associations between tickets and meetings', apiPath: '/crm/v4/associations/tickets/meetings', pkFields: ['ticket_id', 'meeting_id'] },
        { name: 'assoc_tickets_notes', label: 'Ticket ↔ Note', description: 'Associations between tickets and notes', apiPath: '/crm/v4/associations/tickets/notes', pkFields: ['ticket_id', 'note_id'] },
        { name: 'assoc_tickets_tasks', label: 'Ticket ↔ Task', description: 'Associations between tickets and tasks', apiPath: '/crm/v4/associations/tickets/tasks', pkFields: ['ticket_id', 'task_id'] },
        { name: 'assoc_tickets_feedback_submissions', label: 'Ticket ↔ Feedback Submission', description: 'Associations between tickets and feedback submissions', apiPath: '/crm/v4/associations/tickets/feedback_submissions', pkFields: ['ticket_id', 'feedback_submission_id'] },
        { name: 'assoc_quotes_contacts', label: 'Quote ↔ Contact', description: 'Associations between quotes and contacts', apiPath: '/crm/v4/associations/quotes/contacts', pkFields: ['quote_id', 'contact_id'] },
        { name: 'assoc_quotes_line_items', label: 'Quote ↔ Line Item', description: 'Associations between quotes and line items', apiPath: '/crm/v4/associations/quotes/line_items', pkFields: ['quote_id', 'line_item_id'] },
    ];

    /**
     * Discovers all HubSpot objects (standard + custom + non-CRM + associations) via live API and static lists.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const results: ExternalObjectSchema[] = [];

        // Add all known standard objects
        for (const [typeId, name] of Object.entries(HubSpotConnector.STANDARD_OBJECTS)) {
            results.push({
                Name: name,
                Label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                Description: `HubSpot ${name} (${typeId})`,
                SupportsIncrementalSync: true,
                SupportsWrite: true,
            });
        }

        // Discover custom CRM objects via /crm/v3/schemas
        try {
            const schemasUrl = `${HUBSPOT_API_BASE}/crm/v3/schemas`;
            const schemasResp = await this.MakeHTTPRequest(auth, schemasUrl, 'GET', headers);
            if (schemasResp.Status === 200) {
                const body = schemasResp.Body as { results?: Array<{ objectTypeId: string; name: string; labels?: { singular?: string } }> };
                for (const s of body.results ?? []) {
                    const name = s.name ?? s.labels?.singular ?? s.objectTypeId;
                    if (!results.some(r => r.Name === name)) {
                        results.push({
                            Name: name,
                            Label: s.labels?.singular ?? name,
                            Description: `HubSpot custom object: ${name}`,
                            SupportsIncrementalSync: true,
                            SupportsWrite: true,
                        });
                    }
                }
            }
        } catch (err) {
            console.warn(`[HubSpot] Custom object discovery failed (non-fatal): ${err instanceof Error ? err.message : err}`);
        }

        // Add non-CRM objects (Marketing, CMS, Automation, etc.)
        for (const obj of HubSpotConnector.NON_CRM_OBJECTS) {
            if (!results.some(r => r.Name === obj.name)) {
                results.push({
                    Name: obj.name,
                    Label: obj.label,
                    Description: obj.description,
                    SupportsIncrementalSync: obj.incremental,
                    SupportsWrite: obj.write,
                });
            }
        }

        // Add association objects (v4 API — fixed schema, no live field discovery)
        for (const assoc of HubSpotConnector.ASSOCIATION_OBJECTS) {
            if (!results.some(r => r.Name === assoc.name)) {
                results.push({
                    Name: assoc.name,
                    Label: assoc.label,
                    Description: assoc.description,
                    SupportsIncrementalSync: false,
                    SupportsWrite: false,
                });
            }
        }

        return results;
    }

    /**
     * Helper to check if an object name is a CRM object (has /crm/v3/properties endpoint).
     */
    private IsCRMObject(objectName: string): boolean {
        const crmNames = new Set(Object.values(HubSpotConnector.STANDARD_OBJECTS));
        // Custom objects also use CRM properties API
        return crmNames.has(objectName) || objectName.startsWith('p_') || objectName.startsWith('2-');
    }

    /**
     * Finds the non-CRM object config by name.
     */
    private GetNonCRMObject(objectName: string): typeof HubSpotConnector.NON_CRM_OBJECTS[number] | undefined {
        return HubSpotConnector.NON_CRM_OBJECTS.find(o => o.name === objectName);
    }

    /**
     * Returns association object config if objectName is an association table, null otherwise.
     */
    private GetAssociationObject(objectName: string): typeof HubSpotConnector.ASSOCIATION_OBJECTS[number] | undefined {
        return HubSpotConnector.ASSOCIATION_OBJECTS.find(a => a.name === objectName);
    }

    /**
     * Discovers all fields on a HubSpot object via the Properties API.
     * Returns field types, constraints, PKs, and read-only flags from live metadata.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);

        // Non-CRM objects have fixed schemas — return static PK field; IntrospectSchema supplements from DB
        if (!this.IsCRMObject(objectName)) {
            return this.DiscoverNonCRMFields(objectName);
        }

        // CRM objects: live field discovery via Properties API
        const url = `${HUBSPOT_API_BASE}/crm/v3/properties/${objectName}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

        if (response.Status !== 200) return [];

        const body = response.Body as { results?: HubSpotPropertyDef[] };
        const props = body.results ?? [];

        const fields: ExternalFieldSchema[] = props
            .filter(p => !p.hidden)
            .map(p => ({
                Name: p.name,
                Label: p.label || p.name,
                Description: p.description || undefined,
                DataType: this.MapHubSpotType(p.type, p.fieldType),
                IsRequired: false,
                IsUniqueKey: false, // hasUniqueValue is HubSpot field-level uniqueness, not the record PK; only hs_object_id is the true unique key
                IsReadOnly: p.modificationMetadata?.readOnlyValue === true || p.calculated,
            }));

        // Ensure hs_object_id is the unique key — HubSpot's Properties API sets
        // hasUniqueValue=false for hs_object_id even though it IS the record identifier,
        // so we must override it regardless of what the API reports.
        const pkField = fields.find(f => f.Name === 'hs_object_id');
        if (pkField) {
            pkField.IsUniqueKey = true;
            pkField.IsReadOnly = true;
        } else {
            fields.push({
                Name: 'hs_object_id',
                Label: 'Object ID',
                Description: 'HubSpot internal object ID',
                DataType: 'string',
                IsRequired: true,
                IsUniqueKey: true,
                IsReadOnly: true,
            });
        }

        return fields;
    }

    /**
     * Discovers fields for non-CRM objects by fetching the first page of results
     * and inferring field names/types from the response.
     */
    /**
     * Non-CRM and association objects have fixed, documented schemas.
     * - Association objects: return both composite PK fields from ASSOCIATION_OBJECTS config.
     * - Non-CRM objects: return the PK field from NON_CRM_OBJECTS config.
     * IntrospectSchema's DB-fallback supplements with the full field list from metadata.
     * No live API sampling needed.
     */
    private DiscoverNonCRMFields(objectName: string): ExternalFieldSchema[] {
        const assocConfig = this.GetAssociationObject(objectName);
        if (assocConfig) {
            return assocConfig.pkFields.map(pk => ({
                Name: pk,
                Label: pk,
                Description: `Key field for ${assocConfig.label}`,
                DataType: 'string',
                IsRequired: true,
                IsUniqueKey: true,
                IsReadOnly: true,
            }));
        }

        const objConfig = this.GetNonCRMObject(objectName);
        if (!objConfig) return [];
        return [{
            Name: objConfig.pkField,
            Label: objConfig.pkField,
            Description: `Primary key for ${objConfig.label}`,
            DataType: 'string',
            IsRequired: true,
            IsUniqueKey: true,
            IsReadOnly: true,
        }];
    }


    /**
     * Full schema introspection — discovers all objects and their fields from the live API.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const objects = await this.DiscoverObjects(companyIntegration, contextUser);
        const result: SourceSchemaInfo = { Objects: [] };

        for (const obj of objects) {
            try {
                const nonCrmConfig = this.GetNonCRMObject(obj.Name);
                const assocConfig = this.GetAssociationObject(obj.Name);
                const pkFieldNames: string[] = assocConfig
                    ? assocConfig.pkFields
                    : [nonCrmConfig ? nonCrmConfig.pkField : 'hs_object_id'];

                let liveFields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);

                // Fall back to DB-cached Layer 1 static metadata when live discovery is insufficient:
                // - CRM objects: Properties API returned 0 fields (403/404/non-JSON)
                // - Non-CRM objects: endpoint returned only the pkField (parameterized or scope-restricted)
                const liveIsMinimal = liveFields.length === 0 ||
                    (!this.IsCRMObject(obj.Name) && liveFields.length <= 1);
                if (liveIsMinimal) {
                    try {
                        const integrationObj = this.GetCachedObject(companyIntegration.IntegrationID, obj.Name);
                        const dbFields = this.GetCachedFields(integrationObj.ID);
                        if (dbFields.length > liveFields.length) {
                            console.log(`[HubSpot] Live discovery returned ${liveFields.length} field(s) for "${obj.Name}" — using ${dbFields.length} DB-cached fields instead`);
                            liveFields = dbFields.map(f => ({
                                Name: f.Name,
                                Label: f.DisplayName ?? f.Name,
                                Description: f.Description ?? undefined,
                                DataType: f.Type ?? 'string',
                                IsRequired: f.IsRequired ?? false,
                                IsUniqueKey: f.IsPrimaryKey || pkFieldNames.includes(f.Name),
                                IsReadOnly: false,
                            }));
                            // Guarantee PK fields are present — DB records may not include them
                            for (const pkName of pkFieldNames) {
                                if (!liveFields.some(f => f.Name === pkName)) {
                                    liveFields.unshift({
                                        Name: pkName,
                                        Label: pkName,
                                        Description: `Primary key for ${obj.Name}`,
                                        DataType: 'string',
                                        IsRequired: true,
                                        IsUniqueKey: true,
                                        IsReadOnly: true,
                                    });
                                }
                            }
                        }
                    } catch {
                        // No DB record yet — proceed with whatever live returned
                    }
                }

                const sourceFields: SourceFieldInfo[] = liveFields.map(f => ({
                    Name: f.Name,
                    Label: f.Label,
                    Description: f.Description,
                    SourceType: f.DataType,
                    IsRequired: f.IsRequired,
                    IsPrimaryKey: f.IsUniqueKey || pkFieldNames.includes(f.Name),
                    IsForeignKey: false,
                    ForeignKeyTarget: null,
                    MaxLength: null,
                    Precision: null,
                    Scale: null,
                    DefaultValue: null,
                }));

                const pkFields = sourceFields.filter(f => f.IsPrimaryKey);
                result.Objects.push({
                    ExternalName: obj.Name,
                    ExternalLabel: obj.Label ?? obj.Name,
                    Description: obj.Description,
                    Fields: sourceFields,
                    PrimaryKeyFields: pkFields.map(f => f.Name),
                    Relationships: [],
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[HubSpot] Live discovery threw for "${obj.Name}": ${msg} — trying DB-cached fields`);

                // Unexpected exception path — try DB as last resort
                try {
                    const nonCrmConfig2 = this.GetNonCRMObject(obj.Name);
                    const assocConfig2 = this.GetAssociationObject(obj.Name);
                    const pkFieldNames2: string[] = assocConfig2
                        ? assocConfig2.pkFields
                        : [nonCrmConfig2 ? nonCrmConfig2.pkField : 'hs_object_id'];
                    const integrationObj = this.GetCachedObject(companyIntegration.IntegrationID, obj.Name);
                    const dbFields = this.GetCachedFields(integrationObj.ID);
                    if (dbFields.length > 0) {
                        const sourceFields: SourceFieldInfo[] = dbFields.map(f => ({
                            Name: f.Name,
                            Label: f.DisplayName ?? f.Name,
                            Description: f.Description ?? undefined,
                            SourceType: f.Type ?? 'string',
                            IsRequired: f.IsRequired ?? false,
                            IsPrimaryKey: f.IsPrimaryKey || pkFieldNames2.includes(f.Name),
                            IsForeignKey: false,
                            ForeignKeyTarget: null,
                            MaxLength: null,
                            Precision: null,
                            Scale: null,
                            DefaultValue: null,
                        }));
                        const pkFields = sourceFields.filter(f => f.IsPrimaryKey);
                        result.Objects.push({
                            ExternalName: obj.Name,
                            ExternalLabel: obj.Label ?? obj.Name,
                            Description: obj.Description,
                            Fields: sourceFields,
                            PrimaryKeyFields: pkFields.map(f => f.Name),
                            Relationships: [],
                        });
                        console.log(`[HubSpot] Used ${dbFields.length} DB-cached fields for "${obj.Name}" after exception`);
                        continue;
                    }
                } catch {
                    // DB fallback also failed — truly skip this object
                }
                console.warn(`[HubSpot] Skipping "${obj.Name}" — no live or DB fields available`);
            }
        }

        return result;
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
     * Routes association objects to the v4 batch/create endpoint instead of v3 objects.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const assocConfig = this.GetAssociationObject(ctx.ObjectName);
        if (assocConfig) {
            return this.CreateAssociation(ctx.CompanyIntegration, ctx.ContextUser, ctx.ObjectName, ctx.Attributes, assocConfig);
        }

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
     * For association objects, re-creates the association (idempotent in HubSpot).
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const assocConfig = this.GetAssociationObject(ctx.ObjectName);
        if (assocConfig) {
            // Associations have no updatable properties — the IDs ARE the relationship.
            // Re-creating is idempotent: HubSpot ignores duplicates.
            return this.CreateAssociation(ctx.CompanyIntegration, ctx.ContextUser, ctx.ObjectName, ctx.Attributes, assocConfig);
        }

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
     * Routes association objects to the v4 batch/archive endpoint instead of v3 objects.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const assocConfig = this.GetAssociationObject(ctx.ObjectName);
        if (assocConfig) {
            return this.DeleteAssociation(ctx.CompanyIntegration, ctx.ContextUser, ctx.ObjectName, ctx.ExternalID, assocConfig);
        }

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
     * Creates an association in HubSpot using the v4 batch/create endpoint.
     * ExternalID returned is "{leftID}|{rightID}" matching the pull ExternalID format.
     */
    private async CreateAssociation(
        rawCompanyIntegration: unknown,
        rawContextUser: unknown,
        objectName: string,
        attributes: Record<string, unknown>,
        assocConfig: typeof HubSpotConnector.ASSOCIATION_OBJECTS[number]
    ): Promise<CRUDResult> {
        const companyIntegration = rawCompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = rawContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);

        const [leftField, rightField] = assocConfig.pkFields;
        const leftID = String(attributes[leftField] ?? '');
        const rightID = String(attributes[rightField] ?? '');

        if (!leftID || !rightID) {
            return {
                Success: false,
                ExternalID: '',
                StatusCode: 400,
                ErrorMessage: `CreateAssociation ${objectName}: missing PK fields '${leftField}' or '${rightField}' in attributes`,
            };
        }

        const pathParts = assocConfig.apiPath.split('/').filter(Boolean);
        const fromType = pathParts[pathParts.length - 2];
        const toType = pathParts[pathParts.length - 1];

        const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromType}/${toType}/batch/create`;
        const body = { inputs: [{ from: { id: leftID }, to: { id: rightID }, types: [] }] };
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);

        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: `${leftID}|${rightID}`, StatusCode: response.Status };
        }

        return this.BuildCRUDErrorResult(response, 'CreateAssociation', objectName);
    }

    /**
     * Removes an association in HubSpot using the v4 batch/archive endpoint.
     * ExternalID must be "{leftID}|{rightID}" — the same format stored by pull sync.
     */
    private async DeleteAssociation(
        rawCompanyIntegration: unknown,
        rawContextUser: unknown,
        objectName: string,
        externalID: string,
        assocConfig: typeof HubSpotConnector.ASSOCIATION_OBJECTS[number]
    ): Promise<CRUDResult> {
        const companyIntegration = rawCompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = rawContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);

        const pipeIndex = externalID.indexOf('|');
        if (pipeIndex < 0) {
            return {
                Success: false,
                ExternalID: externalID,
                StatusCode: 400,
                ErrorMessage: `DeleteAssociation ${objectName}: cannot parse composite ExternalID '${externalID}' — expected 'leftID|rightID'`,
            };
        }
        const leftID = externalID.substring(0, pipeIndex);
        const rightID = externalID.substring(pipeIndex + 1);

        const pathParts = assocConfig.apiPath.split('/').filter(Boolean);
        const fromType = pathParts[pathParts.length - 2];
        const toType = pathParts[pathParts.length - 1];

        const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromType}/${toType}/batch/archive`;
        const body = { inputs: [{ from: { id: leftID }, to: { id: rightID } }] };
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);

        // batch/archive returns 204 No Content on success
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: externalID, StatusCode: response.Status };
        }

        return this.BuildCRUDErrorResult(response, 'DeleteAssociation', objectName);
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
        let message: string;
        if (response.Status === 403) {
            message = `[HubSpot] 403 Forbidden — required scope missing for ${operation} on '${objectName}'. ` +
                `Add the required scope to your HubSpot app and reconnect.`;
        } else {
            message = bodyObj?.['message']
                ? String(bodyObj['message'])
                : `[HubSpot] ${operation} on ${objectName} failed (HTTP ${response.Status})`;
        }
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
        if (this._cachedAuth) return this._cachedAuth;
        console.log(`[HubSpot] Authenticating...`);
        const credentials = await this.LoadCredentials(companyIntegration, contextUser);
        const config = this.BuildConnectionConfig(credentials, companyIntegration);
        this._config = config;
        // Do NOT log credential-derived info (token length, prefix, etc.) — would leak secret-shape data into MJAPI logs.
        const auth: HubSpotAuthContext = {
            Token: credentials.AccessToken,
            Credentials: credentials,
            Config: config,
        };
        this._cachedAuth = auth;
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

            let responseBody: unknown;
            try {
                responseBody = await response.json();
            } catch {
                // Non-JSON body (e.g. HTML error page) — treat as empty object
                responseBody = {};
            }
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
            case 'json':
                // HubSpot json-type properties can be arbitrarily large objects.
                // Map to 'text' so the schema builder creates nvarchar(MAX) columns.
                return 'text';
            case 'phone_number':
                return 'string';
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

        const configJson = companyIntegration.Configuration;
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
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const creds = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (creds) return creds;
        }

        // Fallback: read from CompanyIntegration Configuration JSON
        const configJson = companyIntegration.Configuration;
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
    private async LoadFromCredentialEntity(credentialID: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<HubSpotCredentials | null> {
        const md = provider ?? new Metadata();
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

        // Add flattened properties — HubSpot uses '' to mean "no value" for all
        // property types, which causes SQL errors on datetime/numeric columns.
        // Normalize empty strings to null so nullable DB columns receive NULL.
        if (properties) {
            for (const [key, value] of Object.entries(properties)) {
                result[key] = value === '' ? null : value;
            }
        }

        // Add system fields (these override any conflicting property names)
        result['hs_object_id'] = record['id'];
        result['createdAt'] = record['createdAt'];
        result['updatedAt'] = record['updatedAt'];
        result['archived'] = record['archived'];

        return result;
    }

    // ─── Association fetch (v4 API) ───────────────────────────────────

    /**
     * Overrides FetchChanges to support three fetch strategies:
     *
     * 1. **Association objects** → v4 per-object associations endpoint
     * 2. **Incremental sync** (watermark set) → HubSpot search API with server-side
     *    `hs_lastmodifieddate >= watermark` filter
     * 3. **Full load** (no watermark / first sync) → standard list API via base class
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (obj.Category === 'Association') {
            return this.FetchAssociationChanges(ctx, obj);
        }

        // Non-CRM objects (Marketing, CMS, etc.) don't support the CRM search API.
        // Use the base class list endpoint (reads APIPath from IntegrationObject) with
        // client-side watermark filtering.
        const nonCrm = this.GetNonCRMObject(ctx.ObjectName);
        if (nonCrm) {
            return this.FetchNonCRMChanges(ctx, nonCrm);
        }

        // CRM objects: use search-based incremental sync when a watermark exists
        if (ctx.WatermarkValue) {
            return this.FetchChangesViaSearch(ctx);
        }

        // First sync (no watermark): use list API for full load.
        // Cannot use super.FetchChanges here — the base class reads raw HubSpot records
        // without flattening the nested {id, properties: {...}} envelope, so ExternalID
        // would resolve to '' (raw['hs_object_id'] is undefined at the top level).
        return this.FetchCRMFullLoad(ctx);
    }

    /**
     * Full-load path for CRM objects (first sync, no watermark).
     * Uses the CRM list endpoint with property expansion and FlattenHubSpotRecord so that
     * ExternalID is correctly built from hs_object_id (mirroring FetchChangesViaSearch).
     * The base class FetchChanges cannot be used here because it reads raw[field] without
     * flattening, causing ExternalID="" for every record.
     */
    private async FetchCRMFullLoad(ctx: FetchContext): Promise<FetchBatchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);

        const limit = Math.min(ctx.BatchSize ?? 100, 100); // HubSpot CRM list API max is 100
        const propertiesParam = this.BuildPropertiesParam(ctx.ObjectName, ctx.RequestedSourceFields);
        let url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}?limit=${limit}${propertiesParam}`;
        if (ctx.CurrentCursor) {
            url += `&after=${ctx.CurrentCursor}`;
        }

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status !== 200) {
            const body = response.Body as Record<string, unknown> | undefined;
            const msg = body?.message ?? body?.error ?? JSON.stringify(body);
            console.warn(`[HubSpot] CRM full-load failed for ${ctx.ObjectName}: HTTP ${response.Status} — ${msg}`);
            return { Records: [], HasMore: false };
        }

        const body = response.Body as {
            results?: unknown[];
            paging?: { next?: { after?: string } };
        };

        const rawResults = body.results ?? [];
        const records: ExternalRecord[] = rawResults.map(r => {
            const raw = r as Record<string, unknown>;
            const flat = this.FlattenHubSpotRecord(raw);
            return {
                ExternalID: String(flat['hs_object_id'] ?? raw['id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: flat,
            };
        });

        const nextCursor = body.paging?.next?.after;
        const hasMore = nextCursor != null;

        let newWatermark: string | undefined;
        if (!hasMore) {
            const dateField = this.GetWatermarkField(ctx.ObjectName);
            const latest = this.FindLatestDate(records, dateField);
            if (latest) newWatermark = latest;
        }

        return {
            Records: records,
            HasMore: hasMore,
            NextCursor: nextCursor,
            NewWatermarkValue: newWatermark,
        };
    }

    /**
     * Fetches all pages from a single non-CRM API endpoint URL, accumulating all records.
     * Used as a building block for both flat and parameterized endpoint fetches.
     */
    private async FetchAllPagesFromURL(
        auth: RESTAuthContext,
        baseUrl: string,
        pkField: string,
        objectName: string
    ): Promise<ExternalRecord[]> {
        const headers = this.BuildHeaders(auth);
        const allRecords: ExternalRecord[] = [];
        let cursor: string | undefined;

        do {
            const url = cursor ? `${baseUrl}&after=${encodeURIComponent(cursor)}` : baseUrl;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status !== 200) {
                const body = response.Body as Record<string, unknown> | undefined;
                const msg = body?.message ?? body?.error ?? JSON.stringify(body);
                console.warn(`[HubSpot] FetchAllPages failed for ${objectName}: HTTP ${response.Status} — ${msg}`);
                break;
            }

            const body = response.Body as Record<string, unknown>;
            const results = (body['results'] ?? body['objects'] ?? body['messages'] ?? []) as Array<Record<string, unknown>>;

            for (const raw of results) {
                const id = String(raw[pkField] ?? raw['id'] ?? '');
                const properties = raw['properties'] as Record<string, unknown> | undefined;
                const fields = properties ? { ...raw, ...properties } : raw;
                allRecords.push({ ExternalID: id, ObjectType: objectName, Fields: fields as Record<string, unknown> });
            }

            // Only follow pagination cursor when results were returned (avoid infinite loop)
            const paging = body['paging'] as { next?: { after?: string } } | undefined;
            cursor = results.length > 0 ? paging?.next?.after : undefined;
        } while (cursor);

        return allRecords;
    }

    /**
     * Handles parameterized endpoints (apiPath with {placeholder}) by fan-out:
     * fetches all parent records, then fetches children for each parent ID.
     * All child records are accumulated and returned as a single batch (HasMore: false).
     *
     * Skips objects where parentObject is not found in NON_CRM_OBJECTS (config error).
     * Skips objects with {appId} placeholder — these require Developer App configuration.
     */
    private async FetchParameterizedChanges(
        ctx: FetchContext,
        objConfig: typeof HubSpotConnector.NON_CRM_OBJECTS[number]
    ): Promise<FetchBatchResult> {
        // {appId} placeholders require developer app config — not available at runtime
        if (objConfig.apiPath.includes('{appId}')) {
            console.warn(
                `[HubSpot] ${ctx.ObjectName}: Parameterized endpoint requires {appId} (Developer App ID). ` +
                `Configure AppID in connector settings to enable this object. Returning empty batch.`
            );
            return { Records: [], HasMore: false };
        }

        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);

        // Find and validate parent config
        const parentConfig = HubSpotConnector.NON_CRM_OBJECTS.find(o => o.name === objConfig.parentObject);
        if (!parentConfig) {
            console.warn(`[HubSpot] ${ctx.ObjectName}: parentObject '${objConfig.parentObject}' not found in NON_CRM_OBJECTS`);
            return { Records: [], HasMore: false };
        }

        // Fetch all parent records
        const parentUrl = `${HUBSPOT_API_BASE}${parentConfig.apiPath}?limit=100`;
        const parentRecords = await this.FetchAllPagesFromURL(auth, parentUrl, parentConfig.pkField, parentConfig.name);
        if (parentRecords.length === 0) {
            return { Records: [], HasMore: false };
        }

        // Extract the placeholder name from the apiPath (e.g. '{pipelineId}' → 'pipelineId')
        const placeholderMatch = objConfig.apiPath.match(/\{([^}]+)\}/);
        if (!placeholderMatch) {
            return { Records: [], HasMore: false };
        }

        // Fan-out: fetch children for each parent
        const allChildren: ExternalRecord[] = [];
        for (const parent of parentRecords) {
            const parentId = String(parent.Fields[parentConfig.pkField] ?? parent.ExternalID ?? '');
            if (!parentId) continue;

            // Substitute placeholder with actual parent ID
            const childPath = objConfig.apiPath.replace(`{${placeholderMatch[1]}}`, encodeURIComponent(parentId));
            const childUrl = `${HUBSPOT_API_BASE}${childPath}?limit=100`;
            const children = await this.FetchAllPagesFromURL(auth, childUrl, objConfig.pkField, ctx.ObjectName);

            // Tag each child with its parent ID so the record is traceable
            for (const child of children) {
                child.Fields[`_parent_${parentConfig.pkField}`] = parentId;
                allChildren.push(child);
            }
        }

        // Apply watermark filtering client-side if watermark is set
        let filtered = allChildren;
        if (ctx.WatermarkValue) {
            const watermarkMs = new Date(ctx.WatermarkValue).getTime();
            filtered = allChildren.filter(r => {
                for (const key of ['updatedAt', 'updated', 'createdAt', 'hs_lastmodifieddate']) {
                    const val = r.Fields[key];
                    if (val && typeof val === 'string') {
                        const ms = new Date(val).getTime();
                        if (!isNaN(ms) && ms > watermarkMs) return true;
                    }
                }
                return false;
            });
        }

        const newWatermark = this.FindLatestDateInFields(filtered);
        return {
            Records: filtered,
            HasMore: false,
            NewWatermarkValue: newWatermark,
        };
    }

    /**
     * Fetches records from non-CRM HubSpot APIs (Marketing, CMS, Files, etc.).
     * These endpoints use standard REST list pagination, not the CRM search API.
     * Watermark filtering is client-side based on date fields in the response.
     *
     * Dispatches to FetchParameterizedChanges when apiPath contains {placeholder}.
     */
    private async FetchNonCRMChanges(
        ctx: FetchContext,
        objConfig: typeof HubSpotConnector.NON_CRM_OBJECTS[number]
    ): Promise<FetchBatchResult> {
        // Parameterized endpoints (apiPath with {placeholder}) require fan-out across parent IDs.
        // Dispatch to the specialized handler instead of building a URL with a literal placeholder.
        if (objConfig.parentObject) {
            return this.FetchParameterizedChanges(ctx, objConfig);
        }

        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);

        // Build URL with pagination — varies by endpoint type
        const limit = ctx.BatchSize || 100;
        let url: string;
        let isScimPagination = false;

        if (objConfig.incrementalParam === 'startIndex') {
            // SCIM 2.0 endpoints (scim_users, scim_groups) use offset-based pagination:
            // startIndex is 1-based, count is page size. CurrentCursor stores next startIndex as string.
            isScimPagination = true;
            const startIndex = ctx.CurrentCursor ? parseInt(ctx.CurrentCursor, 10) : 1;
            url = `${HUBSPOT_API_BASE}${objConfig.apiPath}?startIndex=${startIndex}&count=${limit}`;
        } else {
            url = `${HUBSPOT_API_BASE}${objConfig.apiPath}?limit=${limit}`;
            if (ctx.CurrentCursor) {
                url += `&after=${ctx.CurrentCursor}`;
            }
        }

        // Server-side incremental filtering (preferred over client-side)
        if (ctx.WatermarkValue && objConfig.serverIncrementalParam) {
            url += `&${objConfig.serverIncrementalParam}=${encodeURIComponent(ctx.WatermarkValue)}`;
        } else if (ctx.WatermarkValue && objConfig.incrementalParam === 'after') {
            // Legacy: owners endpoint uses incrementalParam: 'after' → maps to updatedAfter
            url += `&updatedAfter=${ctx.WatermarkValue}`;
        }

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status !== 200) {
            const body = response.Body as Record<string, unknown> | undefined;
            const msg = body?.message ?? body?.error ?? JSON.stringify(body);
            console.warn(`[HubSpot] Non-CRM fetch failed for ${ctx.ObjectName}: HTTP ${response.Status} — ${msg}`);
            return { Records: [], HasMore: false };
        }

        const body = response.Body as Record<string, unknown>;
        // SCIM responses use 'Resources' array; standard HubSpot uses 'results' or 'objects'
        const results = (body['Resources'] ?? body['results'] ?? body['objects'] ?? []) as Array<Record<string, unknown>>;

        // Build ExternalRecords
        const records: ExternalRecord[] = results.map(raw => {
            const id = String(raw[objConfig.pkField] ?? raw['id'] ?? '');
            // Flatten properties if they exist (some endpoints nest under 'properties')
            const properties = raw['properties'] as Record<string, unknown> | undefined;
            const fields = properties ? { ...raw, ...properties } : raw;
            return {
                ExternalID: id,
                ObjectType: ctx.ObjectName,
                Fields: fields as Record<string, unknown>,
            };
        });

        // Client-side watermark filtering only when no server-side param is available
        const hasServerSideFilter = !!(ctx.WatermarkValue && (objConfig.serverIncrementalParam || objConfig.incrementalParam === 'after'));
        let filteredRecords = records;
        if (ctx.WatermarkValue && !hasServerSideFilter) {
            const watermarkMs = new Date(ctx.WatermarkValue).getTime();
            filteredRecords = records.filter(r => {
                // Check common date fields
                for (const key of ['updatedAt', 'updated', 'createdAt', 'hs_lastmodifieddate']) {
                    const val = r.Fields[key];
                    if (val && typeof val === 'string') {
                        const recMs = new Date(val).getTime();
                        if (!isNaN(recMs) && recMs > watermarkMs) return true;
                    }
                }
                return false;
            });
        }

        // Pagination cursor — varies by endpoint type
        let nextCursor: string | undefined;
        if (isScimPagination) {
            // SCIM: totalResults lets us know if there are more pages.
            // Next startIndex = current startIndex + count returned.
            const totalResults = (body['totalResults'] as number | undefined) ?? 0;
            const currentStart = ctx.CurrentCursor ? parseInt(ctx.CurrentCursor, 10) : 1;
            const nextStart = currentStart + results.length;
            nextCursor = results.length > 0 && nextStart <= totalResults ? String(nextStart) : undefined;
        } else {
            // Standard HubSpot cursor pagination — only trust when results were returned.
            // Some endpoints (e.g. conversation_threads) return a next.after cursor even on
            // the last page, causing an infinite loop if followed blindly.
            const paging = body['paging'] as { next?: { after?: string } } | undefined;
            nextCursor = results.length > 0 ? paging?.next?.after : undefined;
        }

        // Set watermark from latest record
        let newWatermark: string | undefined;
        if (!nextCursor && filteredRecords.length > 0) {
            newWatermark = this.FindLatestDateInFields(filteredRecords);
        }

        return {
            Records: filteredRecords,
            HasMore: !!nextCursor,
            NextCursor: nextCursor,
            NewWatermarkValue: newWatermark,
        };
    }

    /**
     * Find the latest date value across common date fields in a set of records.
     */
    private FindLatestDateInFields(records: ExternalRecord[]): string | undefined {
        let latest = 0;
        let latestStr: string | undefined;
        const dateKeys = ['updatedAt', 'updated', 'createdAt', 'hs_lastmodifieddate', 'created', 'publishDate'];
        for (const r of records) {
            for (const key of dateKeys) {
                const val = r.Fields[key];
                if (val && typeof val === 'string') {
                    const ms = new Date(val).getTime();
                    if (!isNaN(ms) && ms > latest) {
                        latest = ms;
                        latestStr = val;
                    }
                }
            }
        }
        return latestStr;
    }

    /**
     * Fetches changed records using the HubSpot search API with server-side date filtering.
     * Much more efficient than fetching ALL records and filtering client-side.
     */
    private async FetchChangesViaSearch(ctx: FetchContext): Promise<FetchBatchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);

        const dateField = this.GetWatermarkField(ctx.ObjectName);
        const watermarkMs = new Date(ctx.WatermarkValue!).getTime();
        const properties = this.BuildEffectiveProperties(ctx.ObjectName, ctx.RequestedSourceFields);
        const pageSize = Math.min(ctx.BatchSize ?? 100, 100); // HubSpot search API max is 100

        const searchBody: Record<string, unknown> = {
            filterGroups: [{
                filters: [{
                    propertyName: dateField,
                    operator: 'GTE',
                    value: String(watermarkMs),
                }],
            }],
            sorts: [{ propertyName: dateField, direction: 'ASCENDING' }],
            properties,
            limit: pageSize,
        };

        if (ctx.CurrentCursor) {
            searchBody['after'] = ctx.CurrentCursor;
        }

        const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${ctx.ObjectName}/search`;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, searchBody);
        this.ValidateCRUDResponse(response, 'FetchChangesViaSearch', ctx.ObjectName);

        const body = response.Body as {
            results?: unknown[];
            total?: number;
            paging?: { next?: { after?: string } };
        };

        // HubSpot Search API hard limit: 10,000 results maximum per query window.
        // If total > 10K, only the oldest-modified records (sorted ASCENDING) are returned.
        // The watermark advances to the batch's max date each cycle, so subsequent syncs
        // pick up the remainder — no records are permanently lost, but multiple sync cycles
        // are needed to catch up. Log a warning so operators can monitor.
        const searchTotal = body.total ?? 0;
        if (searchTotal > 10_000) {
            console.warn(
                `[HubSpot] ${ctx.ObjectName}: Search API returned total=${searchTotal} but is capped at 10,000 results. ` +
                `Sync will require ${Math.ceil(searchTotal / 10_000)} cycles to catch up from watermark ${ctx.WatermarkValue}. ` +
                `Consider reducing the sync interval or enabling continuous sync for this object.`
            );
        }

        const rawResults = body.results ?? [];
        const records: ExternalRecord[] = rawResults.map(r => {
            const raw = r as Record<string, unknown>;
            const flat = this.FlattenHubSpotRecord(raw);
            return {
                ExternalID: String(flat['hs_object_id'] ?? raw['id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: flat,
            };
        });

        const nextCursor = body.paging?.next?.after;
        const hasMore = nextCursor != null;

        // On the final page of active records, also fetch archived (deleted) records
        // since the watermark so they flow through the engine's delete pipeline.
        if (!hasMore) {
            const archived = await this.FetchArchivedCRMChanges(
                auth, headers, ctx.ObjectName, dateField, watermarkMs, properties
            );
            if (archived.length > 0) {
                console.log(`[HubSpot] ${ctx.ObjectName}: found ${archived.length} archived (deleted) record(s) since watermark`);
                records.push(...archived);
            }
        }

        let newWatermark: string | undefined;
        if (!hasMore) {
            const latest = this.FindLatestDate(records.filter(r => !r.IsDeleted), dateField);
            if (latest) newWatermark = latest;
        }

        return {
            Records: records,
            HasMore: hasMore,
            NextCursor: nextCursor,
            NewWatermarkValue: newWatermark,
        };
    }

    /**
     * Detects archived (deleted) CRM records since the given watermark.
     *
     * Uses the HubSpot search API with `archived: true` so the same server-side
     * GTE watermark filter applies — only records archived/modified since the last
     * sync are returned. Returns them with `IsDeleted: true` so the integration
     * engine routes them through the delete pipeline.
     *
     * Falls back to empty on any API error (e.g. object type doesn't support
     * archived search) so delete detection degrades gracefully rather than
     * blocking the active-record sync.
     */
    private async FetchArchivedCRMChanges(
        auth: RESTAuthContext,
        headers: Record<string, string>,
        objectName: string,
        dateField: string,
        watermarkMs: number,
        properties: string[]
    ): Promise<ExternalRecord[]> {
        const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectName}/search`;
        const allDeleted: ExternalRecord[] = [];
        let cursor: string | undefined;

        do {
            const searchBody: Record<string, unknown> = {
                filterGroups: [{
                    filters: [{
                        propertyName: dateField,
                        operator: 'GTE',
                        value: String(watermarkMs),
                    }],
                }],
                sorts: [{ propertyName: dateField, direction: 'ASCENDING' }],
                properties,
                limit: 100,
                archived: true,
            };
            if (cursor) searchBody['after'] = cursor;

            const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, searchBody);
            if (response.Status !== 200) break; // silently skip — object may not support archived search

            const body = response.Body as { results?: unknown[]; paging?: { next?: { after?: string } } };
            const rawResults = body.results ?? [];

            for (const r of rawResults) {
                const raw = r as Record<string, unknown>;
                const flat = this.FlattenHubSpotRecord(raw);
                allDeleted.push({
                    ExternalID: String(flat['hs_object_id'] ?? raw['id'] ?? ''),
                    ObjectType: objectName,
                    Fields: flat,
                    IsDeleted: true,
                });
            }

            cursor = rawResults.length > 0 ? body.paging?.next?.after : undefined;
        } while (cursor);

        return allDeleted;
    }

    /** Returns the watermark date field name for a given object type. */
    private GetWatermarkField(objectName: string): string {
        return objectName.toLowerCase() === 'contacts' ? 'lastmodifieddate' : 'hs_lastmodifieddate';
    }

    /** Finds the latest date value across records for a given field name. */
    private FindLatestDate(records: ExternalRecord[], fieldName: string): string | undefined {
        let latest: Date | null = null;
        for (const r of records) {
            const val = r.Fields[fieldName];
            if (val == null) continue;
            const d = new Date(String(val));
            if (!isNaN(d.getTime()) && (!latest || d > latest)) {
                latest = d;
            }
        }
        return latest ? latest.toISOString() : undefined;
    }

    /**
     * Fetches association records in batches by iterating over synced parent (from-side)
     * objects and calling HubSpot's v4 per-object associations endpoint.
     *
     * Uses ctx.CurrentOffset to track parent position across batch calls, so the engine
     * can page through all parents without truncating records.
     */
    /**
     * Fetches association records using the HubSpot v4 batch/read endpoint.
     * Batches up to 100 parent IDs per request instead of one GET per parent,
     * reducing API calls from O(n) to O(n/100).
     */
    private async FetchAssociationChanges(
        ctx: FetchContext,
        obj: MJIntegrationObjectEntity
    ): Promise<FetchBatchResult> {
        const parsed = this.ParseAssociationPath(obj.APIPath);
        if (!parsed) {
            console.warn(`[HubSpot] Cannot parse association path: ${obj.APIPath}`);
            return { Records: [], HasMore: false };
        }
        const { fromType, toType } = parsed;

        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);

        // Derive PK field names from the API path object type names.
        // "companies" → "company_id", "emails" → "email_id", "contacts" → "contact_id"
        const singularize = (t: string) => t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.endsWith('s') ? t.slice(0, -1) : t;
        const leftFieldName = `${singularize(fromType)}_id`;
        const rightFieldName = `${singularize(toType)}_id`;

        const parentIDs = await this.LoadAssociationParentIDs(fromType, ctx);
        const parentOffset = ctx.CurrentOffset ?? 0;
        const BATCH_LIMIT = 100; // HubSpot v4 batch/read max inputs per request

        if (parentOffset === 0) {
            console.log(`[HubSpot] Fetching ${obj.Name}: ${parentIDs.length} parent ${fromType} via batch API (100/request)`);
        }

        const batchParentIDs = parentIDs.slice(parentOffset, parentOffset + BATCH_LIMIT);
        if (batchParentIDs.length === 0) {
            return { Records: [], HasMore: false };
        }

        const records = await this.FetchAssociationBatch(
            auth, fromType, toType, batchParentIDs, leftFieldName, rightFieldName, ctx.ObjectName
        );

        const nextOffset = parentOffset + batchParentIDs.length;
        const hasMore = nextOffset < parentIDs.length;
        console.log(`[HubSpot] ${obj.Name}: fetched ${records.length} association records (parents ${parentOffset}–${parentOffset + batchParentIDs.length - 1} of ${parentIDs.length})`);
        return { Records: records, HasMore: hasMore, NextOffset: hasMore ? nextOffset : undefined };
    }

    /**
     * Calls POST /crm/v4/associations/{fromType}/{toType}/batch/read with up to 100 parent IDs.
     * Response format: { results: [{ from: { id }, to: [{ toObjectId, associationTypes }] }] }
     */
    private async FetchAssociationBatch(
        auth: RESTAuthContext,
        fromType: string,
        toType: string,
        parentIDs: string[],
        leftFieldName: string,
        rightFieldName: string,
        objectName: string
    ): Promise<ExternalRecord[]> {
        const headers = this.BuildHeaders(auth);
        const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromType}/${toType}/batch/read`;
        const body = { inputs: parentIDs.map(id => ({ id })) };

        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);
        if (response.Status < 200 || response.Status >= 300) {
            const respBody = response.Body as Record<string, unknown> | undefined;
            const msg = respBody?.message ?? respBody?.error ?? JSON.stringify(respBody);
            console.warn(`[HubSpot] Association batch read failed for ${objectName}: HTTP ${response.Status} — ${msg}`);
            return [];
        }

        const respBody = response.Body as {
            results?: Array<{
                from: { id: string };
                to: Array<{ toObjectId: number; associationTypes: Array<{ label?: string; typeId: number; category: string }> }>;
            }>;
        };

        const records: ExternalRecord[] = [];
        for (const item of respBody.results ?? []) {
            const parentID = item.from.id;
            for (const assoc of item.to ?? []) {
                const flat = this.FlattenAssociationRecord(
                    { toObjectId: assoc.toObjectId, associationTypes: assoc.associationTypes },
                    leftFieldName,
                    parentID,
                    rightFieldName
                );
                records.push({
                    ExternalID: `${flat[leftFieldName]}|${flat[rightFieldName]}`,
                    ObjectType: objectName,
                    Fields: flat,
                });
            }
        }
        return records;
    }

    /**
     * Converts a HubSpot v4 association result item into a flat record suitable for storage.
     * v4 format: { toObjectId: number, associationTypes: [{ label, typeId, category }] }
     */
    private FlattenAssociationRecord(
        record: Record<string, unknown>,
        leftFieldName: string,
        leftValue: string,
        rightFieldName: string
    ): Record<string, unknown> {
        const assocTypes = record['associationTypes'] as Array<{ label?: string }> | undefined;
        const rightValue = String(record['toObjectId']);
        return {
            [leftFieldName]: leftValue,
            [rightFieldName]: rightValue,
            association_type: assocTypes?.[0]?.label ?? null,
        };
    }

    /**
     * Parses a v4 associations APIPath to extract from/to object type names.
     * E.g., "/crm/v4/associations/contacts/companies" → { fromType: "contacts", toType: "companies" }
     */
    private ParseAssociationPath(apiPath: string): { fromType: string; toType: string } | null {
        const match = /\/crm\/v4\/associations\/([^/?]+)\/([^/?]+)/.exec(apiPath);
        if (!match) return null;
        return { fromType: match[1], toType: match[2] };
    }

    /**
     * Loads hs_object_id values for all synced records of a given HubSpot object type
     * by finding its entity map and querying the local MJ entity.
     */
    private async LoadAssociationParentIDs(fromType: string, ctx: FetchContext): Promise<string[]> {
        const rv = new RunView();

        const entityMapResult = await rv.RunView<{ Entity: string }>({
            EntityName: 'MJ: Company Integration Entity Maps',
            ExtraFilter: `ExternalObjectName='${fromType}' AND SyncEnabled=1 AND CompanyIntegrationID='${ctx.CompanyIntegration.ID}'`,
            Fields: ['Entity'],
            MaxRows: 1,
            ResultType: 'simple',
        }, ctx.ContextUser);

        if (!entityMapResult.Success || entityMapResult.Results.length === 0) {
            console.warn(`[HubSpot] No entity map found for ${fromType} — skipping association fetch`);
            return [];
        }

        const entityName = entityMapResult.Results[0].Entity;
        const idsResult = await rv.RunView<{ hs_object_id: string }>({
            EntityName: entityName,
            Fields: ['hs_object_id'],
            ResultType: 'simple',
        }, ctx.ContextUser);

        if (!idsResult.Success) return [];
        return idsResult.Results
            .map(r => String(r['hs_object_id']))
            .filter(id => id && id !== 'undefined' && id !== 'null');
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
     * Returns the effective property list for a HubSpot CRM request.
     *
     * When `requestedFields` (from FetchContext.RequestedSourceFields) is provided it
     * contains the source fields from active field maps, including any custom properties.
     * We merge those with the essential system properties so watermark tracking always works.
     *
     * Falls back to the static HUBSPOT_OBJECTS field list when no requestedFields are given.
     *
     * Note: hs_object_id is NOT included — it's the top-level `id` field on every HubSpot
     * response and is injected by FlattenHubSpotRecord regardless of `?properties=`.
     * Essential system properties (always included):
     * - GetWatermarkField(objectName) — the per-object modified-date property (object-specific;
     *   contacts use 'lastmodifieddate', all others use 'hs_lastmodifieddate')
     * - createdate — creation timestamp
     */
    private BuildEffectiveProperties(objectName: string, requestedFields?: string[]): string[] {
        const essentialProperties = [this.GetWatermarkField(objectName), 'createdate'];
        if (requestedFields && requestedFields.length > 0) {
            const merged = new Set([...requestedFields, ...essentialProperties]);
            return [...merged];
        }
        return this.GetObjectFieldNames(objectName);
    }

    /**
     * Builds the `properties` query parameter for a HubSpot object type.
     * Accepts optional `requestedFields` from FetchContext to include custom-mapped properties.
     * Returns empty string if no properties are configured for the object.
     */
    private BuildPropertiesParam(objectName: string, requestedFields?: string[]): string {
        const properties = this.BuildEffectiveProperties(objectName, requestedFields);
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
