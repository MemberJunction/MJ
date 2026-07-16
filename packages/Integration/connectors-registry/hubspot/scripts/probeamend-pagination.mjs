#!/usr/bin/env node
/**
 * ProbeAmend correction — RealityProbe falsified the pagination claim on contacts/companies/deals:
 *   "param 'skip' advances" → WRONG ('skip' silently ignored; no probed alternate advanced).
 *
 * ROOT CAUSE: the per-IO Configuration carried NO `pagination` hint, so reality-probe.mjs defaulted
 *   `skipParam = pag.skipParam || 'skip'` and tested `?skip=N`. HubSpot CRM object-list endpoints do
 *   NOT support offset/skip paging — they use an opaque paging CURSOR token via the `after` query
 *   param (docs: OpenAPI param `after` = "The paging cursor token of the last successfully read
 *   resource will be returned as the `paging.next.after` JSON property"; PROVENANCE lines 46-61 +
 *   sources/specs/*.json). `skip` is not a real HubSpot param → correctly ignored.
 *
 * CORRECTION (docs-sourced, no invented values): add a per-IO Configuration.pagination block declaring
 *   the docs-supported cursor param `after` (which the probe reads via `pag.skipParam`) + the cursor-
 *   token semantics from `paging.next.after`. The integration-level PaginationDefaults already declares
 *   `cursorParam: "after"` / `cursorResponsePath: "paging.next.after"` — this surfaces it per-IO so the
 *   re-probe tests `?after=N` (the docs-confirmed form) instead of the wrong `?skip=N` default.
 *
 * NEVER authors new objects/fields; only corrects the falsified pagination slot.
 */
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';
import { resolve } from 'node:path';

const REGISTRY_ROOT = resolve(process.cwd(), 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(process.cwd(), 'metadata/integrations');
const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);
const CONNECTOR = 'hubspot';

// The docs-supported pagination hint the probe reads (pag.skipParam). HubSpot CRM list endpoints:
// GET with `after` cursor token, response carries paging.next.after; exhausted when paging.next is absent.
const PAGINATION_HINT = {
    type: 'Cursor',
    skipParam: 'after',
    cursorParam: 'after',
    cursorResponsePath: 'paging.next.after',
    cursorTokenType: 'opaque-cursor-token',
    note: "HubSpot CRM object-list endpoints use the `after` paging CURSOR token (from response paging.next.after), NOT offset/`skip`. The probe's default `skip` param is not a real HubSpot param and is silently ignored — the docs-confirmed param is `after`. Corrected from the OpenAPI spec (param `after`: \"The paging cursor token of the last successfully read resource will be returned as the paging.next.after JSON property\").",
    docsSource: 'https://developers.hubspot.com/docs/api-reference/latest/crm/objects (OpenAPI param `after`; NextPage schema required:[after])',
};

// Existing per-IO Configuration for each object (preserved verbatim; UpsertIO shallow-merges the
// `Configuration` KEY, so we must pass the FULL merged object or the other keys are lost).
const objects = {
    contacts: {
        objectSlug: 'contacts',
        pkConvention: 'id (universal SimplePublicObject PK; also hs_object_id in properties)',
        incrementalMechanism: 'search-api-filter',
        watermarkFilterOperator: 'GTE',
        propertiesDiscoveryEndpoint: '/crm/properties/2026-03/contacts',
        note: 'Business fields are per-portal custom/built-in properties — discovered at runtime via the Properties API; captured here as the json `properties` column.',
    },
    companies: {
        objectSlug: 'companies',
        pkConvention: 'id (universal SimplePublicObject PK; also hs_object_id in properties)',
        incrementalMechanism: 'search-api-filter',
        watermarkFilterOperator: 'GTE',
        propertiesDiscoveryEndpoint: '/crm/properties/2026-03/companies',
        note: 'Business fields are per-portal custom/built-in properties — discovered at runtime via the Properties API; captured here as the json `properties` column.',
    },
    deals: {
        objectSlug: 'deals',
        pkConvention: 'id (universal SimplePublicObject PK; also hs_object_id in properties)',
        incrementalMechanism: 'search-api-filter',
        watermarkFilterOperator: 'GTE',
        propertiesDiscoveryEndpoint: '/crm/properties/2026-03/deals',
        note: 'Business fields are per-portal custom/built-in properties — discovered at runtime via the Properties API; captured here as the json `properties` column.',
    },
};

const applied = [];
for (const [name, existingCfg] of Object.entries(objects)) {
    const mergedConfiguration = { ...existingCfg, pagination: PAGINATION_HINT };
    // Pass ONLY Name (match key) + the corrected Configuration; UpsertIO merges other IO fields untouched.
    store.UpsertIO(CONNECTOR, { Name: name, Configuration: mergedConfiguration });
    store.AppendProvenance(CONNECTOR, {
        URL: 'https://developers.hubspot.com/docs/api-reference/latest/crm/objects',
        AccessedAt: new Date().toISOString(),
        UsedFor: `ProbeAmend correction: pagination param for '${name}' is the docs-supported cursor token \`after\` (from paging.next.after), not the probe-default \`skip\`.`,
        SourceTier: 2,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: `io.${name}.Configuration.pagination`,
        Excerpt: 'OpenAPI param `after`: "The paging cursor token of the last successfully read resource will be returned as the paging.next.after JSON property of a paged response containing more results." NextPage schema required:[after]. HubSpot CRM list endpoints do NOT support offset/skip paging.',
    });
    applied.push(name);
}

process.stdout.write(JSON.stringify({ correction: 'pagination:skip->after', applied }, null, 2) + '\n');
