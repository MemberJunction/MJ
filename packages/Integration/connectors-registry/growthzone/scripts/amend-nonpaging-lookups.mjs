#!/usr/bin/env node
// ProbeAmend (S8, round 2): MembershipStatusLookup + GroupCategory ignore every probed paging
// param (single-page lookup endpoints) — declaring SupportsPagination=true is unfalsifiable noise.
// Honest amendment: SupportsPagination=false. Via the mj-metadata MCP (atomic + backups).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command: 'node', args: ['packages/MCP/mj-metadata/dist/server.js'], cwd: process.cwd() });
const client = new Client({ name: 'gz-amend-nonpaging', version: '1.0' }, { capabilities: {} });
await client.connect(transport);
for (const Name of ['MembershipStatusLookup', 'GroupCategory']) {
    await client.callTool({ name: 'upsert_integration_object', arguments: { connector: 'growthzone', io: { Name, SupportsPagination: false } } });
}
await client.callTool({ name: 'append_provenance', arguments: { connector: 'growthzone', entry: {
    URL: 'credentialed RealityProbe via broker (jobs gz-probe-live-1781249282986 + gz-probe-confirm-1781249632082)',
    AccessedAt: new Date().toISOString(),
    UsedFor: 'ProbeAmend S8 round 2: MembershipStatusLookup + GroupCategory ignore all probed paging params (single-page lookup endpoints) -> SupportsPagination=false.',
    SourceTier: 1, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ImpliedFromExample',
    TargetField: 'io.MembershipStatusLookup.SupportsPagination',
    Excerpt: "probe: \"'$skip' also did not advance; no probed alternate advanced\" on both lookup endpoints",
} } });
console.log(JSON.stringify({ amended: 2 }));
process.exit(0);
