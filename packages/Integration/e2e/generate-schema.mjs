#!/usr/bin/env node
/**
 * Schema Generation Script
 *
 * Invokes the Integration Schema Builder using the connector's
 * GetDefaultConfiguration() + static field metadata to generate
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
const ADDITIONAL_SCHEMA_INFO_PATH = 'config/additionalSchemaInfo.json';
const PLATFORM = 'sqlserver';

const typeMapper = new TypeMapper();

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
            .filter(f => !f.IsPrimaryKey) // PK is tracked in SourceRecordID
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

        configs.push({
            SourceObjectName: obj.SourceObjectName,
            SchemaName: defaultConfig.DefaultSchemaName,
            TableName: obj.TargetTableName,
            EntityName: obj.TargetEntityName,
            Description: sourceObj.Description ?? `${obj.TargetEntityName} synced from ${defaultConfig.DefaultSchemaName}`,
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

// ─── Source Schema Definitions with Descriptions ─────────────────────

const YM_SOURCE_SCHEMA = {
    Objects: [
        {
            ExternalName: 'Members',
            ExternalLabel: 'YM Members',
            Description: 'Individual member profiles from the YourMembership AMS, including contact info, membership status, and key dates',
            Fields: [
                { Name: 'ProfileID', Label: 'Profile ID', Description: 'Unique member profile identifier in YourMembership', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'FirstName', Label: 'First Name', Description: 'Member first name', SourceType: 'string', MaxLength: 200 },
                { Name: 'LastName', Label: 'Last Name', Description: 'Member last name', SourceType: 'string', MaxLength: 200 },
                { Name: 'EmailAddr', Label: 'Email', Description: 'Primary email address', SourceType: 'string', MaxLength: 255 },
                { Name: 'MemberTypeCode', Label: 'Member Type Code', Description: 'Code identifying the membership type/tier', SourceType: 'string', MaxLength: 200 },
                { Name: 'Status', Label: 'Status', Description: 'Current membership status (e.g., Active, Expired, Suspended)', SourceType: 'string', MaxLength: 100 },
                { Name: 'Organization', Label: 'Organization', Description: 'Member organization or employer name', SourceType: 'string', MaxLength: 500 },
                { Name: 'Phone', Label: 'Phone', Description: 'Primary phone number', SourceType: 'string', MaxLength: 100 },
                { Name: 'Address1', Label: 'Address Line 1', Description: 'Primary street address line 1', SourceType: 'string', MaxLength: 500 },
                { Name: 'Address2', Label: 'Address Line 2', Description: 'Primary street address line 2', SourceType: 'string', MaxLength: 500 },
                { Name: 'City', Label: 'City', Description: 'City for primary address', SourceType: 'string', MaxLength: 200 },
                { Name: 'State', Label: 'State', Description: 'State/province for primary address', SourceType: 'string', MaxLength: 200 },
                { Name: 'PostalCode', Label: 'Postal Code', Description: 'ZIP or postal code for primary address', SourceType: 'string', MaxLength: 50 },
                { Name: 'Country', Label: 'Country', Description: 'Country for primary address', SourceType: 'string', MaxLength: 200 },
                { Name: 'Title', Label: 'Title', Description: 'Professional title or job title', SourceType: 'string', MaxLength: 300 },
                { Name: 'JoinDate', Label: 'Join Date', Description: 'Date the member first joined the organization', SourceType: 'string', MaxLength: 100 },
                { Name: 'RenewalDate', Label: 'Renewal Date', Description: 'Next membership renewal date', SourceType: 'string', MaxLength: 100 },
                { Name: 'ExpirationDate', Label: 'Expiration Date', Description: 'Date the current membership period expires', SourceType: 'string', MaxLength: 100 },
                { Name: 'MemberSinceDate', Label: 'Member Since', Description: 'Original date of continuous membership', SourceType: 'string', MaxLength: 100 },
                { Name: 'WebsiteUrl', Label: 'Website URL', Description: 'Member personal or company website URL', SourceType: 'string', MaxLength: 500 },
            ],
            PrimaryKeyFields: ['ProfileID'],
            Relationships: [],
        },
        {
            ExternalName: 'Events',
            ExternalLabel: 'YM Events',
            Description: 'Events and meetings managed in YourMembership, including dates, locations, and registration details',
            Fields: [
                { Name: 'EventId', Label: 'Event ID', Description: 'Unique event identifier in YourMembership', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'Name', Label: 'Event Name', Description: 'Title of the event', SourceType: 'string', MaxLength: 500 },
                { Name: 'Active', Label: 'Active', Description: 'Whether the event is currently active and visible', SourceType: 'string', MaxLength: 20 },
                { Name: 'StartDate', Label: 'Start Date', Description: 'Date the event begins', SourceType: 'string', MaxLength: 100 },
                { Name: 'EndDate', Label: 'End Date', Description: 'Date the event ends', SourceType: 'string', MaxLength: 100 },
                { Name: 'StartTime', Label: 'Start Time', Description: 'Time the event begins', SourceType: 'string', MaxLength: 100 },
                { Name: 'EndTime', Label: 'End Time', Description: 'Time the event ends', SourceType: 'string', MaxLength: 100 },
                { Name: 'IsVirtual', Label: 'Is Virtual', Description: 'Whether this is a virtual/online event', SourceType: 'string', MaxLength: 20 },
                { Name: 'VirtualMeetingType', Label: 'Virtual Meeting Type', Description: 'Platform type for virtual events (e.g., Zoom, Teams)', SourceType: 'string', MaxLength: 200 },
            ],
            PrimaryKeyFields: ['EventId'],
            Relationships: [],
        },
        {
            ExternalName: 'MemberTypes',
            ExternalLabel: 'YM Member Types',
            Description: 'Membership type/tier definitions from YourMembership, used for categorizing members',
            Fields: [
                { Name: 'ID', Label: 'Type ID', Description: 'Unique identifier for the membership type', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'TypeCode', Label: 'Type Code', Description: 'Short code for the membership type', SourceType: 'string', MaxLength: 100 },
                { Name: 'Name', Label: 'Name', Description: 'Display name of the membership type', SourceType: 'string', MaxLength: 255 },
                { Name: 'IsDefault', Label: 'Is Default', Description: 'Whether this is the default membership type for new members', SourceType: 'string', MaxLength: 20 },
                { Name: 'PresetType', Label: 'Preset Type', Description: 'System preset category for this type', SourceType: 'string', MaxLength: 100 },
                { Name: 'SortOrder', Label: 'Sort Order', Description: 'Display order for this membership type', SourceType: 'string', MaxLength: 20 },
            ],
            PrimaryKeyFields: ['ID'],
            Relationships: [],
        },
        {
            ExternalName: 'Memberships',
            ExternalLabel: 'YM Memberships',
            Description: 'Membership plan definitions from YourMembership, defining dues structures and billing options',
            Fields: [
                { Name: 'Id', Label: 'Membership ID', Description: 'Unique identifier for the membership plan', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'Code', Label: 'Code', Description: 'Short code for the membership plan', SourceType: 'string', MaxLength: 100 },
                { Name: 'Name', Label: 'Name', Description: 'Display name of the membership plan', SourceType: 'string', MaxLength: 255 },
                { Name: 'DuesAmount', Label: 'Dues Amount', Description: 'Standard dues amount for this membership', SourceType: 'string', MaxLength: 100 },
                { Name: 'ProRatedDues', Label: 'Pro-Rated Dues', Description: 'Whether dues are pro-rated for mid-term joins', SourceType: 'string', MaxLength: 20 },
                { Name: 'AllowMultipleOpenInvoices', Label: 'Allow Multiple Invoices', Description: 'Whether multiple open invoices are permitted', SourceType: 'string', MaxLength: 20 },
            ],
            PrimaryKeyFields: ['Id'],
            Relationships: [],
        },
        {
            ExternalName: 'Groups',
            ExternalLabel: 'YM Groups',
            Description: 'Groups and committees from YourMembership, organized by group type',
            Fields: [
                { Name: 'Id', Label: 'Group ID', Description: 'Unique identifier for the group', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'Name', Label: 'Group Name', Description: 'Display name of the group', SourceType: 'string', MaxLength: 500 },
                { Name: 'GroupTypeName', Label: 'Group Type', Description: 'Name of the parent group type category', SourceType: 'string', MaxLength: 200 },
                { Name: 'GroupTypeId', Label: 'Group Type ID', Description: 'ID of the parent group type', SourceType: 'string', MaxLength: 50 },
            ],
            PrimaryKeyFields: ['Id'],
            Relationships: [],
        },
        {
            ExternalName: 'Products',
            ExternalLabel: 'YM Products',
            Description: 'Store products from YourMembership, including pricing and availability details',
            Fields: [
                { Name: 'id', Label: 'Product ID', Description: 'Unique identifier for the product', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'description', Label: 'Description', Description: 'Product description', SourceType: 'string', MaxLength: 1000 },
                { Name: 'amount', Label: 'Amount', Description: 'Product price amount', SourceType: 'string', MaxLength: 100 },
                { Name: 'weight', Label: 'Weight', Description: 'Product weight for shipping', SourceType: 'string', MaxLength: 50 },
                { Name: 'taxRate', Label: 'Tax Rate', Description: 'Applicable tax rate', SourceType: 'string', MaxLength: 50 },
                { Name: 'quantity', Label: 'Quantity', Description: 'Available quantity', SourceType: 'string', MaxLength: 50 },
                { Name: 'ProductActive', Label: 'Active', Description: 'Whether the product is currently active', SourceType: 'string', MaxLength: 20 },
                { Name: 'IsFeatured', Label: 'Is Featured', Description: 'Whether the product is featured in the store', SourceType: 'string', MaxLength: 20 },
                { Name: 'ListInStore', Label: 'List In Store', Description: 'Whether the product is listed in the online store', SourceType: 'string', MaxLength: 20 },
                { Name: 'taxable', Label: 'Taxable', Description: 'Whether the product is taxable', SourceType: 'string', MaxLength: 20 },
            ],
            PrimaryKeyFields: ['id'],
            Relationships: [],
        },
        {
            ExternalName: 'DonationFunds',
            ExternalLabel: 'YM Donation Funds',
            Description: 'Donation fund definitions from YourMembership for charitable giving programs',
            Fields: [
                { Name: 'fundId', Label: 'Fund ID', Description: 'Unique identifier for the donation fund', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'fundName', Label: 'Fund Name', Description: 'Display name of the donation fund', SourceType: 'string', MaxLength: 500 },
                { Name: 'fundOptionsCount', Label: 'Options Count', Description: 'Number of giving options available for this fund', SourceType: 'string', MaxLength: 20 },
            ],
            PrimaryKeyFields: ['fundId'],
            Relationships: [],
        },
        {
            ExternalName: 'Certifications',
            ExternalLabel: 'YM Certifications',
            Description: 'Professional certification programs from YourMembership with CEU requirements',
            Fields: [
                { Name: 'CertificationID', Label: 'Certification ID', Description: 'Unique identifier for the certification', SourceType: 'string', IsRequired: true, IsPrimaryKey: true },
                { Name: 'ID', Label: 'ID', Description: 'Alternate ID for the certification', SourceType: 'string', MaxLength: 100 },
                { Name: 'Name', Label: 'Name', Description: 'Name of the certification program', SourceType: 'string', MaxLength: 500 },
                { Name: 'IsActive', Label: 'Is Active', Description: 'Whether the certification is currently offered', SourceType: 'string', MaxLength: 20 },
                { Name: 'CEUsRequired', Label: 'CEUs Required', Description: 'Number of continuing education units required', SourceType: 'string', MaxLength: 50 },
                { Name: 'Code', Label: 'Code', Description: 'Short code for the certification', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: ['CertificationID'],
            Relationships: [],
        },
    ],
};

const HUBSPOT_SOURCE_SCHEMA = {
    Objects: [
        {
            ExternalName: 'contacts',
            ExternalLabel: 'HubSpot Contacts',
            Description: 'Contact records from HubSpot CRM, representing individual people with their contact details and lifecycle stage',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'companies',
            ExternalLabel: 'HubSpot Companies',
            Description: 'Company records from HubSpot CRM, representing organizations with firmographic data',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'deals',
            ExternalLabel: 'HubSpot Deals',
            Description: 'Deal/opportunity records from HubSpot CRM, tracking revenue pipeline with stages and amounts',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'tickets',
            ExternalLabel: 'HubSpot Tickets',
            Description: 'Support ticket records from HubSpot Service Hub, tracking customer issues and resolutions',
            Fields: [
                { Name: 'subject', Label: 'Subject', Description: 'Subject line of the ticket', SourceType: 'string', MaxLength: 500 },
                { Name: 'content', Label: 'Content', Description: 'Full description or body of the ticket', SourceType: 'text' },
                { Name: 'hs_pipeline', Label: 'Pipeline', Description: 'Service pipeline the ticket belongs to', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_pipeline_stage', Label: 'Stage', Description: 'Current stage of the ticket in its pipeline', SourceType: 'string', MaxLength: 200 },
                { Name: 'hs_ticket_priority', Label: 'Priority', Description: 'Priority level of the ticket (e.g., HIGH, MEDIUM, LOW)', SourceType: 'string', MaxLength: 100 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the ticket was created in HubSpot', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the ticket was last modified in HubSpot', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'products',
            ExternalLabel: 'HubSpot Products',
            Description: 'Product catalog from HubSpot CRM, defining items available for deals and quotes',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'line_items',
            ExternalLabel: 'HubSpot Line Items',
            Description: 'Line items from HubSpot deals and quotes, representing individual products or services in a transaction',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'quotes',
            ExternalLabel: 'HubSpot Quotes',
            Description: 'Sales quotes from HubSpot CRM, representing formal price proposals sent to prospects',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'calls',
            ExternalLabel: 'HubSpot Calls',
            Description: 'Call activity logs from HubSpot CRM, tracking phone calls with contacts and companies',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'emails',
            ExternalLabel: 'HubSpot Emails',
            Description: 'Email activity logs from HubSpot CRM, tracking email communications with contacts',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'notes',
            ExternalLabel: 'HubSpot Notes',
            Description: 'Notes attached to contacts, companies, and deals in HubSpot CRM',
            Fields: [
                { Name: 'hs_note_body', Label: 'Note Body', Description: 'Content of the note', SourceType: 'text' },
                { Name: 'hs_timestamp', Label: 'Timestamp', Description: 'When the note was created/logged', SourceType: 'string', MaxLength: 100 },
                { Name: 'hubspot_owner_id', Label: 'Owner ID', Description: 'HubSpot user who created the note', SourceType: 'string', MaxLength: 100 },
                { Name: 'hs_body_preview', Label: 'Body Preview', Description: 'Truncated preview of the note body', SourceType: 'string', MaxLength: 500 },
                { Name: 'createdate', Label: 'Created Date', Description: 'Date the note was created', SourceType: 'string', MaxLength: 100 },
                { Name: 'lastmodifieddate', Label: 'Last Modified Date', Description: 'Date the note was last modified', SourceType: 'string', MaxLength: 100 },
            ],
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'tasks',
            ExternalLabel: 'HubSpot Tasks',
            Description: 'Task records from HubSpot CRM, tracking to-do items and follow-up activities',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'meetings',
            ExternalLabel: 'HubSpot Meetings',
            Description: 'Meeting activity logs from HubSpot CRM, tracking scheduled meetings and their outcomes',
            Fields: [
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
            PrimaryKeyFields: [],
            Relationships: [],
        },
        {
            ExternalName: 'feedback_submissions',
            ExternalLabel: 'HubSpot Feedback Submissions',
            Description: 'Customer feedback survey submissions from HubSpot Service Hub',
            Fields: [
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
            PrimaryKeyFields: [],
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
        IsForeignKey: false,
        ForeignKeyTarget: null,
    }));
}

// Normalize all source schemas
for (const obj of YM_SOURCE_SCHEMA.Objects) obj.Fields = normalizeFields(obj.Fields);
for (const obj of HUBSPOT_SOURCE_SCHEMA.Objects) obj.Fields = normalizeFields(obj.Fields);

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('Integration Schema Generator');
    console.log(`Target: ${target}`);
    console.log(`Date: ${new Date().toISOString()}`);

    if (target === 'ym' || target === 'all') {
        const ymConnector = new YourMembershipConnector();
        const ymDefaults = ymConnector.GetDefaultConfiguration();
        generateSchema('YourMembership', ymDefaults, YM_SOURCE_SCHEMA);
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
