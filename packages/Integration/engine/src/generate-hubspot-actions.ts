#!/usr/bin/env node
/**
 * CLI script to generate HubSpot integration action metadata files.
 *
 * Usage:
 *   npx ts-node src/generate-hubspot-actions.ts [--output-dir <path>]
 *
 * Generates mj-sync compatible metadata files for all HubSpot CRM objects
 * with their fields, creating Get/Create/Update/Delete/Search/List actions.
 *
 * Output files:
 *   <output-dir>/integration-actions-hubspot/.mj-sync.json
 *   <output-dir>/integration-actions-hubspot/.hubspot-actions.json
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    ActionMetadataGenerator,
    type ActionGeneratorConfig,
    type IntegrationObjectInfo,
    type IntegrationFieldInfo,
} from './ActionMetadataGenerator.js';

// ─── HubSpot Object Definitions ──────────────────────────────────────
// These mirror the HUBSPOT_PROPERTIES and field metadata from HubSpotConnector.
// In a future iteration, this could be auto-discovered via the HubSpot Properties API.

const HUBSPOT_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'contacts',
        DisplayName: 'Contact',
        Description: 'A person or lead in HubSpot CRM',
        SupportsWrite: true,
        Fields: [
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact email address' },
            { Name: 'firstname', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact first name' },
            { Name: 'lastname', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact last name' },
            { Name: 'phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact phone number' },
            { Name: 'mobilephone', DisplayName: 'Mobile Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact mobile phone number' },
            { Name: 'company', DisplayName: 'Company', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated company name' },
            { Name: 'jobtitle', DisplayName: 'Job Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact job title' },
            { Name: 'lifecyclestage', DisplayName: 'Lifecycle Stage', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact lifecycle stage (subscriber, lead, opportunity, customer, etc.)' },
            { Name: 'hs_lead_status', DisplayName: 'Lead Status', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead qualification status' },
            { Name: 'address', DisplayName: 'Address', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Street address' },
            { Name: 'city', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'state', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State or province' },
            { Name: 'zip', DisplayName: 'Zip', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Postal/zip code' },
            { Name: 'country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'website', DisplayName: 'Website', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact website URL' },
            { Name: 'industry', DisplayName: 'Industry', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Industry the contact works in' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the contact was created' },
            { Name: 'lastmodifieddate', DisplayName: 'Last Modified Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the contact was last modified' },
        ],
    },
    {
        Name: 'companies',
        DisplayName: 'Company',
        Description: 'A business organization in HubSpot CRM',
        SupportsWrite: true,
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
            { Name: 'numberofemployees', DisplayName: 'Number of Employees', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Number of employees' },
            { Name: 'annualrevenue', DisplayName: 'Annual Revenue', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Annual revenue' },
            { Name: 'lifecyclestage', DisplayName: 'Lifecycle Stage', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company lifecycle stage' },
            { Name: 'type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company type' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the company was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the company was last modified' },
        ],
    },
    {
        Name: 'deals',
        DisplayName: 'Deal',
        Description: 'A sales deal/opportunity in HubSpot CRM',
        SupportsWrite: true,
        Fields: [
            { Name: 'dealname', DisplayName: 'Deal Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name of the deal' },
            { Name: 'amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deal value/amount' },
            { Name: 'dealstage', DisplayName: 'Deal Stage', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Current stage in the sales pipeline' },
            { Name: 'pipeline', DisplayName: 'Pipeline', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sales pipeline the deal belongs to' },
            { Name: 'closedate', DisplayName: 'Close Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expected close date' },
            { Name: 'dealtype', DisplayName: 'Deal Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type of deal (new business, existing, etc.)' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deal description' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the deal was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the deal was last modified' },
        ],
    },
    {
        Name: 'tickets',
        DisplayName: 'Ticket',
        Description: 'A support ticket in HubSpot CRM',
        SupportsWrite: true,
        Fields: [
            { Name: 'subject', DisplayName: 'Subject', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket subject line' },
            { Name: 'content', DisplayName: 'Content', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket body/content' },
            { Name: 'hs_pipeline', DisplayName: 'Pipeline', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Support pipeline' },
            { Name: 'hs_pipeline_stage', DisplayName: 'Pipeline Stage', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Current stage in the support pipeline' },
            { Name: 'hs_ticket_priority', DisplayName: 'Priority', Type: 'enum', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket priority level' },
            { Name: 'hs_ticket_category', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Ticket category' },
            { Name: 'source_type', DisplayName: 'Source', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'How the ticket was created (email, chat, phone, etc.)' },
            { Name: 'hubspot_owner_id', DisplayName: 'Owner', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'HubSpot owner user ID' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the ticket was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the ticket was last modified' },
        ],
    },
    {
        Name: 'products',
        DisplayName: 'Product',
        Description: 'A product in the HubSpot product catalog',
        SupportsWrite: true,
        Fields: [
            { Name: 'name', DisplayName: 'Product Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product name' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product description' },
            { Name: 'price', DisplayName: 'Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product unit price' },
            { Name: 'hs_cost_of_goods_sold', DisplayName: 'Cost of Goods Sold', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Cost of goods sold' },
            { Name: 'hs_sku', DisplayName: 'SKU', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Stock keeping unit identifier' },
            { Name: 'tax', DisplayName: 'Tax', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax amount' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'HubSpot internal object ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the product was created' },
            { Name: 'hs_lastmodifieddate', DisplayName: 'Last Modified Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the product was last modified' },
        ],
    },
];

// ─── Main ────────────────────────────────────────────────────────────

function main(): void {
    const outputDirArg = process.argv.indexOf('--output-dir');
    const outputBase = outputDirArg >= 0 && process.argv[outputDirArg + 1]
        ? process.argv[outputDirArg + 1]
        : path.resolve(__dirname, '../../../../metadata');

    const outputDir = path.join(outputBase, 'integration-actions-hubspot');

    const config: ActionGeneratorConfig = {
        IntegrationName: 'HubSpot',
        CategoryName: 'HubSpot',
        IconClass: 'fa-brands fa-hubspot',
        Objects: HUBSPOT_OBJECTS,
        IncludeSearch: true,
        IncludeList: true,
    };

    const generator = new ActionMetadataGenerator();
    const result = generator.Generate(config);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Write .mj-sync.json
    const syncPath = path.join(outputDir, '.mj-sync.json');
    fs.writeFileSync(syncPath, JSON.stringify(result.SyncConfig, null, 2) + '\n');

    // Write action records
    const actionsPath = path.join(outputDir, '.hubspot-actions.json');
    fs.writeFileSync(actionsPath, JSON.stringify(result.ActionRecords, null, 2) + '\n');

    console.log(`Generated ${result.ActionRecords.length} HubSpot integration actions`);
    console.log(`  Sync config: ${syncPath}`);
    console.log(`  Action records: ${actionsPath}`);
}

main();
