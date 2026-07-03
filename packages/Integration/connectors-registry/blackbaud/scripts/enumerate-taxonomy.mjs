#!/usr/bin/env node
// enumerate-taxonomy.mjs
// Deterministic per-family, per-taxonomy-leaf enumerator over the saved Blackbaud SKY API
// OpenAPI/Swagger specs. Distinct from floor/enumerate-catalog.mjs (which gives the flat
// deduped schema-name universe across all specs) - THIS script maps each requested taxonomy
// leaf to its concrete backing schema(s) + operations + whether it's a top-level collection
// resource or a nested access-path reached through a parent record's array property.
//
// Usage: node enumerate-taxonomy.mjs <sources/openapi dir>

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || './sources/openapi';
const files = readdirSync(dir).filter(f => f.endsWith('.swagger.json'));

const specs = {};
for (const f of files) {
    const key = f.replace('.swagger.json', '');
    specs[key] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
}

// ---- 1. Flat operation catalog: {family, path, method, operationId, tags} ----
const operations = [];
for (const [family, spec] of Object.entries(specs)) {
    for (const [p, methods] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(methods)) {
            if (!op || typeof op !== 'object' || !op.operationId) continue;
            operations.push({ family, path: p, method: method.toUpperCase(), operationId: op.operationId, summary: op.summary || '' });
        }
    }
}

// ---- 2. Flat schema catalog: {family, schemaName, propertyCount, properties} ----
const schemas = [];
for (const [family, spec] of Object.entries(specs)) {
    const defs = spec.definitions || spec.components?.schemas || {};
    for (const [name, s] of Object.entries(defs)) {
        if (!s || typeof s !== 'object') continue;
        const isObject = s.type === 'object' || !!s.properties || !!s.allOf || (!s.type && !s.enum);
        if (!isObject || s.enum) continue;
        schemas.push({ family, schemaName: name, properties: Object.keys(s.properties || {}) });
    }
}

// ---- 3. Taxonomy leaf definitions: keyword match against BOTH path segments and schema names,
//         explicit override map for known structural mappings discovered via jq inspection ----
const TAXONOMY_LEAVES = [
    {
        slug: 'constituents', label: 'Constituents',
        pathPattern: /\/constituent\/v1\/constituents(\/|$)/,
        schemaPattern: /^ConstituentApi\.Constituent(Read|Add|Edit)?$/,
        accessType: 'top-level-collection', parentOf: null,
    },
    {
        slug: 'addresses', label: 'Constituent Addresses',
        pathPattern: /\/constituent\/v1\/addresses|\/constituents\/\{constituent_id\}\/addresses/,
        schemaPattern: /^ConstituentApi\.Address(Read|Add|Edit)?$/,
        accessType: 'both', parentOf: 'constituents',
    },
    {
        slug: 'phones', label: 'Constituent Phones',
        pathPattern: /\/constituent\/v1\/phones|\/constituents\/\{constituent_id\}\/phones/,
        schemaPattern: /^ConstituentApi\.Phone(Read|Add|Edit)?$/,
        accessType: 'both', parentOf: 'constituents',
    },
    {
        slug: 'emails', label: 'Constituent Email Addresses',
        pathPattern: /\/constituent\/v1\/emailaddresses|\/constituents\/\{constituent_id\}\/emailaddresses/,
        schemaPattern: /^ConstituentApi\.EmailAddress(Read|Add|Edit)?$/,
        accessType: 'both', parentOf: 'constituents',
    },
    {
        slug: 'notes', label: 'Constituent Notes',
        pathPattern: /\/constituent\/v1\/notes|\/constituents\/\{constituent_id\}\/notes|\/nxt-data-integration\/v1\/re\/gifts\/notes/,
        schemaPattern: /^ConstituentApi\.Note(Read|Add|Edit)?$|^NXTDataIntegrationApi\..*Note/,
        accessType: 'both', parentOf: 'constituents',
    },
    {
        slug: 'gifts', label: 'Gifts',
        pathPattern: /\/gift\/v1\/gifts(\/|$)/,
        schemaPattern: /^GiftApi\.Gift(Read|Add|Edit)?$/,
        accessType: 'top-level-collection', parentOf: null,
    },
    {
        slug: 'gift-aid', label: 'Gift Aid Tax Declarations (UK Gift Aid)',
        pathPattern: /\/nxt-data-integration\/v1\/re\/giftaid/,
        schemaPattern: /^NXTDataIntegrationApi\.(TaxDeclaration|NewTaxDeclaration|CreatedTaxDeclaration|TaxDeclarationEdit)/,
        accessType: 'top-level-collection', parentOf: null,
        note: 'Also surfaced as GiftRead.gift_aid_amount / gift_aid_qualification_status fields on Gift and GiftSplit — a scalar denormalization, not a separate access path for those two fields.',
    },
    {
        slug: 'gift-batches', label: 'Gift Batches',
        pathPattern: /\/gift-batch\/v1\/giftbatches/,
        schemaPattern: /^GiftBatchApi\.(GiftBatch|CreateBatch|CreatedBatch)$/,
        accessType: 'top-level-collection', parentOf: null,
    },
    {
        slug: 'gift-splits', label: 'Gift Splits',
        pathPattern: /virtual\/giftbatches.*gifts|gift_splits/,
        schemaPattern: /^GiftApi\.(GiftSplitRead|GiftSplitAdd|Virtual\.BatchGiftSplitAdd)$/,
        accessType: 'nested-only', parentOf: 'gifts',
        note: 'No standalone top-level path; reached via GiftRead.gift_splits[] array property. Each split carries fund_id/campaign_id/appeal_id/package_id FKs.',
    },
    {
        slug: 'gift-fundraisers', label: 'Gift Fundraiser Credits',
        pathPattern: /(?!)/, // no dedicated top-level path found
        schemaPattern: /^GiftApi\.GiftFundraiserRead$/,
        accessType: 'nested-only', parentOf: 'gifts',
        note: 'Reached via GiftRead.fundraisers[] array property (GiftApi.GiftFundraiserRead). Distinct from Fundraising-API FundraiserAssignment (constituent-to-campaign) and Opportunity-API Fundraiser (constituent-to-opportunity).',
    },
    {
        slug: 'soft-credits', label: 'Gift Soft Credits',
        pathPattern: /(?!)/,
        schemaPattern: /^GiftApi\.SoftCreditRead$/,
        accessType: 'nested-only', parentOf: 'gifts',
        note: 'Reached via GiftRead.soft_credits[] array property. FK to constituent_id (the soft-credited constituent) + gift_id (parent).',
    },
    {
        slug: 'fundraising-hierarchies', label: 'Fundraiser Assignments (Campaign/Fund Hierarchy)',
        pathPattern: /fundraiserassignments/,
        schemaPattern: /FundraiserAssignment(Read|Add)?$/,
        accessType: 'both', parentOf: 'constituents',
        note: 'FundraisingApi.FundraiserAssignment* (assign a constituent as fundraiser on a campaign/fund) + ConstituentApi.FundraiserAssignmentRead (denormalized read via constituent). Distinct object from gift-fundraisers and opportunity-fundraisers.',
    },
    {
        slug: 'campaigns', label: 'Campaigns',
        pathPattern: /\/fundraising\/v1\/campaigns/,
        schemaPattern: /^FundraisingApi\.Campaign(Read|Add|Edit)?$/,
        accessType: 'top-level-collection', parentOf: null,
    },
    {
        slug: 'funds', label: 'Funds',
        pathPattern: /\/fundraising\/v1\/funds/,
        schemaPattern: /^FundraisingApi\.Fund(Read|Add|Edit)?$/,
        accessType: 'top-level-collection', parentOf: null,
    },
    {
        slug: 'appeals', label: 'Appeals',
        pathPattern: /\/fundraising\/v1\/appeals/,
        schemaPattern: /^FundraisingApi\.Appeal(Read|Add|Edit)?$/,
        accessType: 'top-level-collection', parentOf: null,
    },
    {
        slug: 'opportunities', label: 'Opportunities (Major Gift Prospect Opportunities)',
        pathPattern: /\/opportunity\/v1\/opportunities(\/|$)/,
        schemaPattern: /^OpportunityApi\.Opportunity(Read|Add|Edit)?$/,
        accessType: 'top-level-collection', parentOf: null,
    },
    {
        slug: 'opportunity-fundraisers', label: 'Opportunity Fundraisers',
        pathPattern: /(?!)/,
        schemaPattern: /^OpportunityApi\.Fundraiser$/,
        accessType: 'nested-only', parentOf: 'opportunities',
        note: 'Reached via OpportunityRead nested fundraiser assignment property; distinct schema OpportunityApi.Fundraiser (no Add/Edit variant found - read-only nested sub-object in this spec version).',
    },
    {
        slug: 'opportunity-attachments', label: 'Opportunity Attachments',
        pathPattern: /\/opportunity\/v1\/opportunities\/attachments/,
        schemaPattern: /^OpportunityApi\.OpportunityAttachment(Read|Add|Edit)?$/,
        accessType: 'both', parentOf: 'opportunities',
    },
    {
        slug: 'opportunity-custom-fields', label: 'Opportunity Custom Fields',
        pathPattern: /\/opportunity\/v1\/opportunities\/customfields/,
        schemaPattern: /^OpportunityApi\.OpportunityCustomField(Read|Add|Edit)?$/,
        accessType: 'both', parentOf: 'opportunities',
    },
    {
        slug: 'prospects', label: 'Prospect Status / Ratings (RENXT Prospect)',
        pathPattern: /\/constituents\/\{constituent_id\}\/prospectstatus|\/ratings/,
        schemaPattern: /^ConstituentApi\.(Rating|ProspectStatus)/,
        accessType: 'both', parentOf: 'constituents',
        note: 'RENXT "prospects.swagger.json" family is Ratings + ProspectStatus denormalized onto Constituent - NOT a standalone Prospect entity/collection in RENXT (that only exists in the separate Blackbaud CRM Prospect Management product, crm-prospect.swagger.json, out of scope).',
    },
];

// ---- 4. Resolve each leaf against the actual operation + schema catalogs ----
const results = TAXONOMY_LEAVES.map(leaf => {
    const matchedOps = operations.filter(o => leaf.pathPattern.test(o.path));
    const matchedSchemas = schemas.filter(s => leaf.schemaPattern.test(s.schemaName));
    const families = [...new Set([...matchedOps.map(o => o.family), ...matchedSchemas.map(s => s.family)])];
    return {
        slug: leaf.slug,
        label: leaf.label,
        accessType: leaf.accessType,
        parentOf: leaf.parentOf,
        families,
        operationCount: matchedOps.length,
        operations: matchedOps.map(o => `${o.method} ${o.path} (${o.operationId})`),
        schemaCount: matchedSchemas.length,
        schemas: matchedSchemas.map(s => `${s.family}:${s.schemaName} (${s.properties.length} fields)`),
        note: leaf.note || null,
        resolved: matchedOps.length > 0 || matchedSchemas.length > 0,
    };
});

const output = {
    totalOperationsAcrossAllSpecs: operations.length,
    totalSchemasAcrossAllSpecs: schemas.length,
    taxonomyLeafCount: results.length,
    resolvedLeafCount: results.filter(r => r.resolved).length,
    unresolvedLeaves: results.filter(r => !r.resolved).map(r => r.slug),
    leaves: results,
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
