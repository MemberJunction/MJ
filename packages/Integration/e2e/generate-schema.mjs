#!/usr/bin/env node
/**
 * Schema Generation Script
 *
 * Invokes the Integration Schema Builder using the connector's
 * GetDefaultConfiguration() + IntrospectSchema() to generate
 * Flyway migration files for YM and HubSpot target tables.
 *
 * Usage:
 *   node packages/Integration/e2e/generate-schema.mjs [ym|hubspot|all]
 */

import { SchemaBuilder, TypeMapper } from '@memberjunction/integration-schema-builder';
import { YourMembershipConnector } from '@memberjunction/integration-connectors';
import { HubSpotConnector } from '@memberjunction/integration-connectors';
import path from 'path';
import fs from 'fs';

const target = process.argv[2] || 'all';
const MJ_VERSION = '5.8';
const MIGRATIONS_DIR = 'migrations/v5';
const METADATA_DIR = 'metadata';
const ADDITIONAL_SCHEMA_INFO_PATH = 'metadata/integrations/additionalSchemaInfo.json';
const PLATFORM = 'sqlserver';

const typeMapper = new TypeMapper();

/**
 * Creates a mock CompanyIntegration entity for connectors that only need
 * static schema metadata (no live API calls).
 */
function createMockCompanyIntegration(config) {
    const configJson = JSON.stringify(config);
    return { Get: (field) => field === 'Configuration' ? configJson : null };
}

/**
 * Builds TargetTableConfig[] from a connector's default configuration
 * and its field schema (from DiscoverFields / IntrospectSchema).
 */
function buildTargetConfigs(defaultConfig, sourceSchema) {
    const configs = [];

    for (const obj of defaultConfig.DefaultObjects) {
        if (!obj.SyncEnabled) continue;

        const sourceObj = sourceSchema.Objects.find(o => o.ExternalName === obj.SourceObjectName);
        if (!sourceObj) {
            console.warn(`  Skipping ${obj.SourceObjectName}: not found in source schema`);
            continue;
        }

        const columns = sourceObj.Fields
            .map(f => ({
                SourceFieldName: f.Name,
                TargetColumnName: f.Name,
                TargetSqlType: typeMapper.MapSourceType(f.SourceType, PLATFORM, f),
                IsNullable: !f.IsRequired,
                MaxLength: f.MaxLength,
                Precision: f.Precision,
                Scale: f.Scale,
                DefaultValue: f.DefaultValue,
                Description: f.Description ?? f.Label,
            }));

        const primaryKeyFields = (sourceObj.PrimaryKeyFields || []).map(pkName => {
            const col = columns.find(c => c.SourceFieldName === pkName);
            return col ? col.TargetColumnName : pkName;
        });

        configs.push({
            SourceObjectName: obj.SourceObjectName,
            SchemaName: defaultConfig.DefaultSchemaName,
            TableName: obj.TargetTableName,
            EntityName: obj.TargetEntityName,
            Description: sourceObj.Description ?? `${obj.TargetEntityName} synced from ${defaultConfig.DefaultSchemaName}`,
            PrimaryKeyFields: primaryKeyFields,
            Columns: columns,
            SoftForeignKeys: [],
        });
    }

    return configs;
}

/**
 * Run the SchemaBuilder for a given connector and write the output files.
 */
function generateSchema(connectorName, defaultConfig, sourceSchema) {
    console.log(`\n=== Generating schema for ${connectorName} ===`);

    const targetConfigs = buildTargetConfigs(defaultConfig, sourceSchema);
    console.log(`  ${targetConfigs.length} target tables configured`);

    for (const tc of targetConfigs) {
        console.log(`    ${tc.SchemaName}.${tc.TableName} (${tc.Columns.length} columns)`);
    }

    const builder = new SchemaBuilder();
    const input = {
        SourceSchema: sourceSchema,
        TargetConfigs: targetConfigs,
        Platform: PLATFORM,
        MJVersion: MJ_VERSION,
        SourceType: connectorName,
        AdditionalSchemaInfoPath: ADDITIONAL_SCHEMA_INFO_PATH,
        MigrationsDir: MIGRATIONS_DIR,
        MetadataDir: METADATA_DIR,
        ExistingTables: [],
        EntitySettingsForTargets: {},
    };

    const output = builder.BuildSchema(input);

    if (output.Errors.length > 0) {
        console.error(`  ERRORS:`);
        for (const err of output.Errors) console.error(`    ${err}`);
        return null;
    }

    if (output.Warnings.length > 0) {
        console.warn(`  WARNINGS:`);
        for (const warn of output.Warnings) console.warn(`    ${warn}`);
    }

    // Write migration files
    console.log(`  Generated ${output.MigrationFiles.length} migration files:`);
    for (const file of output.MigrationFiles) {
        const fullPath = path.resolve(file.FilePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.Content, 'utf8');
        console.log(`    ${file.FilePath}`);
    }

    // Write additional schema info update
    if (output.AdditionalSchemaInfoUpdate) {
        const fullPath = path.resolve(output.AdditionalSchemaInfoUpdate.FilePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, output.AdditionalSchemaInfoUpdate.Content, 'utf8');
        console.log(`  Updated: ${output.AdditionalSchemaInfoUpdate.FilePath}`);
    }

    // Write metadata files
    for (const file of output.MetadataFiles) {
        const fullPath = path.resolve(file.FilePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, file.Content, 'utf8');
        console.log(`  Metadata: ${file.FilePath}`);
    }

    return output;
}

// ─── HubSpot Source Schema (static — HubSpot connector doesn't have full field schemas yet) ───

const HUBSPOT_SOURCE_SCHEMA = {
    Objects: [
        {
            ExternalName: 'contacts',
            ExternalLabel: 'HubSpot Contacts',
            Description: 'Contact records from HubSpot CRM, representing individual people with their contact details and lifecycle stage',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'email', Label: 'Email', Description: 'Primary email address of the contact', SourceType: 'string', MaxLength: 255 },
                { Name: 'firstname', Label: 'First Name', Description: 'Contact first name', SourceType: 'string', MaxLength: 200 },
                { Name: 'lastname', Label: 'Last Name', Description: 'Contact last name', SourceType: 'string', MaxLength: 200 },
                { Name: 'phone', Label: 'Phone', Description: 'Primary phone number', SourceType: 'string', MaxLength: 100 },
                { Name: 'company', Label: 'Company', Description: 'Company name associated with the contact', SourceType: 'string', MaxLength: 500 },
                { Name: 'jobtitle', Label: 'Job Title', Description: 'Professional job title', SourceType: 'string', MaxLength: 300 },
                { Name: 'lifecyclestage', Label: 'Lifecycle Stage', Description: 'CRM lifecycle stage (e.g., subscriber, lead, customer)', SourceType: 'string', MaxLength: 100 },
                { Name: 'website', Label: 'Website', Description: 'Contact personal or company website', SourceType: 'string', MaxLength: 500 },
                { Name: 'address', Label: 'Address', Description: 'Street address', SourceType: 'string', MaxLength: 500 },
                { Name: 'city', Label: 'City', Description: 'City', SourceType: 'string', MaxLength: 200 },
                { Name: 'state', Label: 'State', Description: 'State or region', SourceType: 'string', MaxLength: 200 },
                { Name: 'zip', Label: 'Zip', Description: 'Postal/ZIP code', SourceType: 'string', MaxLength: 50 },
                { Name: 'country', Label: 'Country', Description: 'Country', SourceType: 'string', MaxLength: 200 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the contact was created in HubSpot', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the contact was last modified in HubSpot', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'companies',
            ExternalLabel: 'HubSpot Companies',
            Description: 'Company records from HubSpot CRM, representing organizations with firmographic data',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'name', Label: 'Name', Description: 'Company name', SourceType: 'string', MaxLength: 500 },
                { Name: 'domain', Label: 'Domain', Description: 'Primary website domain', SourceType: 'string', MaxLength: 500 },
                { Name: 'industry', Label: 'Industry', Description: 'Industry classification', SourceType: 'string', MaxLength: 200 },
                { Name: 'phone', Label: 'Phone', Description: 'Company phone number', SourceType: 'string', MaxLength: 100 },
                { Name: 'website', Label: 'Website', Description: 'Company website URL', SourceType: 'string', MaxLength: 500 },
                { Name: 'city', Label: 'City', Description: 'City of company headquarters', SourceType: 'string', MaxLength: 200 },
                { Name: 'state', Label: 'State', Description: 'State/region of company headquarters', SourceType: 'string', MaxLength: 200 },
                { Name: 'country', Label: 'Country', Description: 'Country of company headquarters', SourceType: 'string', MaxLength: 200 },
                { Name: 'zip', Label: 'Zip', Description: 'Postal/ZIP code of company headquarters', SourceType: 'string', MaxLength: 50 },
                { Name: 'numberofemployees', Label: 'Employees', Description: 'Number of employees', SourceType: 'string', MaxLength: 100 },
                { Name: 'annualrevenue', Label: 'Revenue', Description: 'Annual revenue', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the company was created in HubSpot', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the company was last modified in HubSpot', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'deals',
            ExternalLabel: 'HubSpot Deals',
            Description: 'Deal/opportunity records from HubSpot CRM, tracking revenue pipeline with stages and amounts',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'dealname', Label: 'Deal Name', Description: 'Name of the deal or opportunity', SourceType: 'string', MaxLength: 500 },
                { Name: 'amount', Label: 'Amount', Description: 'Monetary value of the deal', SourceType: 'decimal', Precision: 18, Scale: 2 },
                { Name: 'dealstage', Label: 'Deal Stage', Description: 'Current pipeline stage of the deal', SourceType: 'string', MaxLength: 200 },
                { Name: 'pipeline', Label: 'Pipeline', Description: 'Sales pipeline the deal belongs to', SourceType: 'string', MaxLength: 200 },
                { Name: 'closedate', Label: 'Close Date', Description: 'Expected or actual close date', SourceType: 'string', MaxLength: 100 },
                { Name: 'dealtype', Label: 'Deal Type', Description: 'Classification of the deal (e.g., newbusiness, existingbusiness)', SourceType: 'string', MaxLength: 200 },
                { Name: 'hubspot_owner_id', Label: 'Owner ID', Description: 'HubSpot user ID of the deal owner', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the deal was created in HubSpot', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the deal was last modified in HubSpot', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'tickets',
            ExternalLabel: 'HubSpot Tickets',
            Description: 'Support ticket records from HubSpot Service Hub, tracking customer issues and resolutions',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'subject', Label: 'Subject', Description: 'Subject line of the ticket', SourceType: 'string', MaxLength: 500 },
                { Name: 'content', Label: 'Content', Description: 'Full description or body of the ticket', SourceType: 'text' },
                { Name: 'hs_pipeline', Label: 'Pipeline', Description: 'Service pipeline the ticket belongs to', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_pipeline_stage', Label: 'Stage', Description: 'Current stage of the ticket in its pipeline', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_ticket_priority', Label: 'Priority', Description: 'Priority level of the ticket (e.g., HIGH, MEDIUM, LOW)', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the ticket was created in HubSpot', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the ticket was last modified in HubSpot', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'products',
            ExternalLabel: 'HubSpot Products',
            Description: 'Product catalog from HubSpot CRM, defining items available for deals and quotes',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'name', Label: 'Name', Description: 'Product name', SourceType: 'string', MaxLength: 500 },
                { Name: 'description', Label: 'Description', Description: 'Product description', SourceType: 'text' },
                { Name: 'price', Label: 'Price', Description: 'Standard unit price', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_cost_of_goods_sold', Label: 'Cost of Goods Sold', Description: 'Cost of goods for this product', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_recurring_billing_period', Label: 'Billing Period', Description: 'Recurring billing period (e.g., monthly, annually)', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_sku', Label: 'SKU', Description: 'Stock keeping unit identifier', SourceType: 'string', MaxLength: 200 },
                { Name: 'tax', Label: 'Tax', Description: 'Tax amount or rate', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the product was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the product was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'line_items',
            ExternalLabel: 'HubSpot Line Items',
            Description: 'Line items from HubSpot deals and quotes, representing individual products or services in a transaction',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'name', Label: 'Name', Description: 'Line item name', SourceType: 'string', MaxLength: 500 },
                { Name: 'description', Label: 'Description', Description: 'Line item description', SourceType: 'text' },
                { Name: 'quantity', Label: 'Quantity', Description: 'Number of units', SourceType: 'string', MaxLength: 50 },
                { Name: 'price', Label: 'Price', Description: 'Unit price', SourceType: 'string', MaxLength: 100 },
                { Name: 'amount', Label: 'Amount', Description: 'Total line item amount', SourceType: 'string', MaxLength: 100 },
                { Name: 'discount', Label: 'Discount', Description: 'Applied discount amount or percentage', SourceType: 'string', MaxLength: 100 },
                { Name: 'tax', Label: 'Tax', Description: 'Tax amount', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_product_id', Label: 'Product ID', Description: 'ID of the associated product', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_sku', Label: 'SKU', Description: 'Stock keeping unit identifier', SourceType: 'string', MaxLength: 200 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the line item was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the line item was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'quotes',
            ExternalLabel: 'HubSpot Quotes',
            Description: 'Sales quotes from HubSpot CRM, representing formal price proposals sent to prospects',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'hs_title', Label: 'Title', Description: 'Quote title', SourceType: 'string', MaxLength: 500 },
                { Name: 'hs_expiration_date', Label: 'Expiration Date', Description: 'Date the quote expires', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_status', Label: 'Status', Description: 'Current quote status', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_quote_amount', Label: 'Quote Amount', Description: 'Total quote amount', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_currency', Label: 'Currency', Description: 'Currency code for the quote', SourceType: 'string', MaxLength: 20 },
                { Name: 'hs_sender_firstname', Label: 'Sender First Name', Description: 'First name of the quote sender', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_sender_lastname', Label: 'Sender Last Name', Description: 'Last name of the quote sender', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_sender_email', Label: 'Sender Email', Description: 'Email of the quote sender', SourceType: 'string', MaxLength: 255 },
                { Name: 'hs_sender_company_name', Label: 'Sender Company', Description: 'Company name of the quote sender', SourceType: 'string', MaxLength: 500 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the quote was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the quote was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'calls',
            ExternalLabel: 'HubSpot Calls',
            Description: 'Call activity logs from HubSpot CRM, tracking phone calls with contacts and companies',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'hs_call_title', Label: 'Title', Description: 'Call title or subject', SourceType: 'string', MaxLength: 500 },
                { Name: 'hs_call_body', Label: 'Body', Description: 'Call notes or description', SourceType: 'text' },
                { Name: 'hs_call_status', Label: 'Status', Description: 'Call status (e.g., COMPLETED, BUSY, NO_ANSWER)', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_call_direction', Label: 'Direction', Description: 'Call direction (INBOUND or OUTBOUND)', SourceType: 'string', MaxLength: 50 },
                { Name: 'hs_call_duration', Label: 'Duration', Description: 'Call duration in milliseconds', SourceType: 'string', MaxLength: 50 },
                { Name: 'hs_call_from_number', Label: 'From Number', Description: 'Caller phone number', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_call_to_number', Label: 'To Number', Description: 'Called phone number', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_call_disposition', Label: 'Disposition', Description: 'Call outcome disposition', SourceType: 'string', MaxLength: 200 },
                { Name: 'hubspot_owner_id', Label: 'Owner ID', Description: 'HubSpot user who made/received the call', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_timestamp', Label: 'Timestamp', Description: 'When the call occurred', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the record was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the record was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'emails',
            ExternalLabel: 'HubSpot Emails',
            Description: 'Email activity logs from HubSpot CRM, tracking email communications with contacts',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'hs_email_subject', Label: 'Subject', Description: 'Email subject line', SourceType: 'string', MaxLength: 1000 },
                { Name: 'hs_email_text', Label: 'Text Body', Description: 'Plain text email body', SourceType: 'text' },
                { Name: 'hs_email_status', Label: 'Status', Description: 'Email delivery status', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_email_direction', Label: 'Direction', Description: 'Email direction (INCOMING_EMAIL or FORWARDED_EMAIL)', SourceType: 'string', MaxLength: 50 },
                { Name: 'hs_email_sender_email', Label: 'Sender Email', Description: 'Email address of the sender', SourceType: 'string', MaxLength: 255 },
                { Name: 'hs_email_sender_firstname', Label: 'Sender First Name', Description: 'First name of the sender', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_email_sender_lastname', Label: 'Sender Last Name', Description: 'Last name of the sender', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_email_to_email', Label: 'To Email', Description: 'Recipient email address', SourceType: 'string', MaxLength: 255 },
                { Name: 'hubspot_owner_id', Label: 'Owner ID', Description: 'HubSpot user associated with the email', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_timestamp', Label: 'Timestamp', Description: 'When the email was sent/received', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the record was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the record was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'notes',
            ExternalLabel: 'HubSpot Notes',
            Description: 'Notes attached to contacts, companies, and deals in HubSpot CRM',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'hs_note_body', Label: 'Note Body', Description: 'Content of the note', SourceType: 'text' },
                { Name: 'hs_timestamp', Label: 'Timestamp', Description: 'When the note was created/logged', SourceType: 'string', MaxLength: 100 },
                { Name: 'hubspot_owner_id', Label: 'Owner ID', Description: 'HubSpot user who created the note', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_body_preview', Label: 'Body Preview', Description: 'Truncated preview of the note body', SourceType: 'string', MaxLength: 500 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the note was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the note was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'tasks',
            ExternalLabel: 'HubSpot Tasks',
            Description: 'Task records from HubSpot CRM, tracking to-do items and follow-up activities',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'hs_task_subject', Label: 'Subject', Description: 'Task subject or title', SourceType: 'string', MaxLength: 500 },
                { Name: 'hs_task_body', Label: 'Body', Description: 'Task description or notes', SourceType: 'text' },
                { Name: 'hs_task_status', Label: 'Status', Description: 'Task status (e.g., NOT_STARTED, COMPLETED)', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_task_priority', Label: 'Priority', Description: 'Task priority level', SourceType: 'string', MaxLength: 50 },
                { Name: 'hs_task_type', Label: 'Type', Description: 'Task type (e.g., TODO, CALL, EMAIL)', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_timestamp', Label: 'Timestamp', Description: 'Due date/time for the task', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_task_completion_date', Label: 'Completion Date', Description: 'Date the task was completed', SourceType: 'string', MaxLength: 100 },
                { Name: 'hubspot_owner_id', Label: 'Owner ID', Description: 'HubSpot user assigned to the task', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the task was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the task was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'meetings',
            ExternalLabel: 'HubSpot Meetings',
            Description: 'Meeting activity logs from HubSpot CRM, tracking scheduled meetings and their outcomes',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'hs_meeting_title', Label: 'Title', Description: 'Meeting title', SourceType: 'string', MaxLength: 500 },
                { Name: 'hs_meeting_body', Label: 'Body', Description: 'Meeting description or agenda', SourceType: 'text' },
                { Name: 'hs_meeting_start_time', Label: 'Start Time', Description: 'Scheduled meeting start time', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_meeting_end_time', Label: 'End Time', Description: 'Scheduled meeting end time', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_meeting_outcome', Label: 'Outcome', Description: 'Meeting outcome (e.g., SCHEDULED, COMPLETED, RESCHEDULED)', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_meeting_location', Label: 'Location', Description: 'Meeting location or URL', SourceType: 'string', MaxLength: 500 },
                { Name: 'hs_meeting_external_url', Label: 'External URL', Description: 'External meeting link (e.g., Zoom URL)', SourceType: 'string', MaxLength: 1000 },
                { Name: 'hs_internal_meeting_notes', Label: 'Internal Notes', Description: 'Internal notes about the meeting', SourceType: 'text' },
                { Name: 'hs_activity_type', Label: 'Activity Type', Description: 'Type of meeting activity', SourceType: 'string', MaxLength: 100 },
                { Name: 'hubspot_owner_id', Label: 'Owner ID', Description: 'HubSpot user who organized the meeting', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_timestamp', Label: 'Timestamp', Description: 'When the meeting occurred', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the record was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the record was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
        {
            ExternalName: 'feedback_submissions',
            ExternalLabel: 'HubSpot Feedback Submissions',
            Description: 'Customer feedback survey submissions from HubSpot Service Hub',
            Fields: [
                { Name: 'hs_object_id', Label: 'Object ID', Description: 'HubSpot unique object identifier', SourceType: 'string', IsRequired: true, IsPrimaryKey: true, MaxLength: 50 },
                { Name: 'hs_survey_id', Label: 'Survey ID', Description: 'ID of the survey', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_survey_name', Label: 'Survey Name', Description: 'Name of the survey', SourceType: 'string', MaxLength: 500 },
                { Name: 'hs_survey_type', Label: 'Survey Type', Description: 'Type of survey (NPS, CSAT, CES)', SourceType: 'string', MaxLength: 50 },
                { Name: 'hs_submission_name', Label: 'Submission Name', Description: 'Name of the respondent', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_content', Label: 'Content', Description: 'Survey response content', SourceType: 'text' },
                { Name: 'hs_response_group', Label: 'Response Group', Description: 'Response category (promoter, passive, detractor)', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_sentiment', Label: 'Sentiment', Description: 'Detected sentiment of the response', SourceType: 'string', MaxLength: 50 },
                { Name: 'hs_survey_channel', Label: 'Survey Channel', Description: 'Channel used for the survey (email, web)', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_timestamp', Label: 'Timestamp', Description: 'When the submission was received', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the record was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the record was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['hs_object_id'],
            Relationships: [],
        },
    ],
};

// Normalize fields to full SourceFieldInfo shape
function normalizeFields(fields) {
    return fields.map(f => ({
        Name: f.Name,
        Label: f.Label,
        Description: f.Description ?? f.Label,
        SourceType: f.SourceType,
        IsRequired: f.IsRequired ?? false,
        MaxLength: f.MaxLength ?? null,
        Precision: f.Precision ?? null,
        Scale: f.Scale ?? null,
        DefaultValue: null,
        IsPrimaryKey: f.IsPrimaryKey ?? false,
        IsForeignKey: f.IsForeignKey ?? false,
        ForeignKeyTarget: f.ForeignKeyTarget ?? null,
    }));
}

// Normalize HubSpot source schema (static)
for (const obj of HUBSPOT_SOURCE_SCHEMA.Objects) obj.Fields = normalizeFields(obj.Fields);

/**
 * Build the YM source schema dynamically from the connector's
 * DiscoverObjects + DiscoverFields (purely static, no API calls needed).
 */
async function buildYMSourceSchema() {
    const connector = new YourMembershipConnector();
    const mockCI = createMockCompanyIntegration({
        ClientID: '00000',
        APIKey: 'schema-gen',
        APIPassword: 'schema-gen',
    });
    const mockUser = {};

    const schema = await connector.IntrospectSchema(mockCI, mockUser);
    console.log(`  Introspected ${schema.Objects.length} YM objects from connector`);
    return schema;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('Integration Schema Generator');
    console.log(`Target: ${target}`);
    console.log(`Date: ${new Date().toISOString()}`);

    // Tables to exclude from DDL generation (already exist in database)
    const excludeArg = process.argv.find(a => a.startsWith('--exclude='));
    const excludeTables = excludeArg
        ? new Set(excludeArg.replace('--exclude=', '').split(','))
        : new Set();

    if (target === 'ym' || target === 'all') {
        const ymConnector = new YourMembershipConnector();
        const ymDefaults = ymConnector.GetDefaultConfiguration();

        // Filter out excluded tables
        if (excludeTables.size > 0) {
            ymDefaults.DefaultObjects = ymDefaults.DefaultObjects.filter(
                o => !excludeTables.has(o.TargetTableName)
            );
            console.log(`  Excluded ${excludeTables.size} existing tables, ${ymDefaults.DefaultObjects.length} remaining`);
        }

        const ymSourceSchema = await buildYMSourceSchema();
        generateSchema('YourMembership', ymDefaults, ymSourceSchema);
    }

    if (target === 'hubspot' || target === 'all') {
        const hsConnector = new HubSpotConnector();
        const hsDefaults = hsConnector.GetDefaultConfiguration();
        generateSchema('HubSpot', hsDefaults, HUBSPOT_SOURCE_SCHEMA);
    }

    console.log('\nDone. Apply migrations with sqlcmd, then run CodeGen.');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
