#!/usr/bin/env node
// Amends the OpenWater Integration row, which shipped THIN (Name+ClassName only) —
// every other hard-constraint slot (Description, ImportPath, NavigationBaseURL,
// CredentialTypeID) was missing, which blocks `mj sync push` deployment and the
// hybrid-e2e CreateConnection. Values are doc-provable (see provenance entries
// appended alongside). Writes go through the mj-metadata MCP (atomic + backups).
//
// Usage (from the repo root that owns the target metadata tree):
//   node packages/Integration/connectors-registry/openwater/scripts/amend-integration-row.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

const REPO = process.cwd();
// The mj-metadata MCP server ships on the agentic tooling branch, not connector branches —
// point MJ_METADATA_SERVER at a checkout that has packages/MCP/mj-metadata/dist built.
const SERVER = process.env.MJ_METADATA_SERVER ?? resolve(REPO, 'packages/MCP/mj-metadata/dist/server.js');
const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER],
    env: {
        ...process.env,
        MJ_CONNECTORS_REGISTRY: resolve(REPO, 'packages/Integration/connectors-registry'),
        MJ_METADATA_ROOT: resolve(REPO, 'metadata', 'integrations'),
    },
});
const client = new Client({ name: 'amend-integration-row', version: '1.0' }, { capabilities: {} });
await client.connect(transport);

const FIELDS = {
    Description:
        'OpenWater awards / grants / abstracts / fellowship management platform connector — syncs programs, ' +
        'applications, users, invoices, judges, rounds and their nested review objects via the OpenWater ' +
        'Public API v2 (REST, ClientKey + ApiKey header pair). Pull-centric; nested objects are reached ' +
        'through per-IO AccessPath door descents from /v2/Programs and /v2/Applications.',
    ImportPath: '@memberjunction/connector-openwater',
    NavigationBaseURL: 'https://api.getopenwater.com',
    CredentialTypeID: '@lookup:MJ: Credential Types.Name=OpenWater API',
};

const up = await client.callTool({ name: 'upsert_integration_fields', arguments: { connector: 'openwater', fields: FIELDS } });
console.log('upsert:', JSON.stringify(up.content?.[0] ?? up).slice(0, 200));

const now = new Date().toISOString();
for (const [field, why, url, excerpt] of [
    ['integration.Description', 'Product nature from the vendor site + connector source-study', 'https://www.getopenwater.com', 'OpenWater is an awards / grants / abstracts management platform'],
    ['integration.NavigationBaseURL', 'Default API host hard-coded as DEFAULT_BASE_URL in the OpenAPI-documented v2 surface', 'https://api.getopenwater.com', 'https://api.getopenwater.com (OpenWater Public API v2 base)'],
    ['integration.CredentialTypeID', 'OpenWater authenticates with the X-ClientKey + X-ApiKey header pair; matches the seeded "OpenWater API" credential type', 'https://api.getopenwater.com', 'ClientKey / ApiKey header pair (OpenWater API credential type)'],
]) {
    await client.callTool({ name: 'append_provenance', arguments: { connector: 'openwater', entry: {
        URL: url, AccessedAt: now, UsedFor: why, SourceTier: 1, SourceCategory: 'OfficialDocs',
        EvidenceStrength: 'ExplicitStatement', TargetField: field, Excerpt: excerpt,
    } } });
}
console.log('provenance appended (3 entries)');
process.exit(0);
