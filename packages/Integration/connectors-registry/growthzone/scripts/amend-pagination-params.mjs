#!/usr/bin/env node
// ProbeAmend (v2 S8) for GrowthZone: the credentialed RealityProbe falsified the declared
// pagination param on 6 objects ('skip' did not advance; '$skip' did — the silently-ignored-param
// class). Correction source: GrowthZone docs are OData ($-prefixed system query options); the
// probe's alternate-hint corroborates. This script applies the metadata amendment via the
// mj-metadata MCP (atomic writes + backups) — never a direct file edit.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'node', args: ['packages/MCP/mj-metadata/dist/server.js'], cwd: process.cwd() });
const client = new Client({ name: 'gz-amend-pagination', version: '1.0' }, { capabilities: {} });
await client.connect(transport);

const read = await client.callTool({ name: 'read_integration', arguments: { connector: 'growthzone' } });
const file = JSON.parse(read.content[0].text);
const root = Array.isArray(file) ? file[0] : file;
const ios = (root.relatedEntities || {})['MJ: Integration Objects'] || [];

let amended = 0;
for (const rec of ios) {
    const f = rec.fields || {};
    if (!f.Configuration || typeof f.Configuration !== 'string') continue;
    let cfg;
    try { cfg = JSON.parse(f.Configuration); } catch { continue; }
    const pag = cfg.pagination;
    if (!pag) continue;
    let changed = false;
    if (pag.skipParam === 'skip') { pag.skipParam = '$skip'; changed = true; }
    if (pag.topParam === 'top') { pag.topParam = '$top'; changed = true; }
    if (!changed) continue;
    await client.callTool({ name: 'upsert_integration_object', arguments: { connector: 'growthzone', io: { Name: f.Name, Configuration: JSON.stringify(cfg) } } });
    amended++;
}
await client.callTool({ name: 'append_provenance', arguments: { connector: 'growthzone', entry: {
    URL: 'https://claraassociation.growthzoneapp.com (credentialed RealityProbe via broker, job gz-probe-live-1781249282986)',
    AccessedAt: new Date().toISOString(),
    UsedFor: "ProbeAmend S8: declared pagination skipParam/topParam corrected 'skip'/'top' -> '$skip'/'$top' (OData system query options). Probe verdict: declared form did NOT advance past page 1 on 6 objects; '$'-prefixed form DID.",
    SourceTier: 1, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement',
    TargetField: 'io.*.Configuration.pagination',
    Excerpt: "probe: \"'skip' did NOT advance (silently-ignored-param class); alternate '$skip' DID advance\"",
} } });
console.log(JSON.stringify({ amended }));
process.exit(0);
