#!/usr/bin/env node
// Completeness-diff L2 finding (v2 P9): the spec documents ApplicationCategory.path
// ("Application category path", Models.Program.ApplicationCategoryModel.path: string) and the
// emission omitted it. Amend via the mj-metadata MCP (atomic + backups).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({ command: 'node', args: ['packages/MCP/mj-metadata/dist/server.js'], cwd: process.cwd() });
const client = new Client({ name: 'ow-amend-path', version: '1.0' }, { capabilities: {} });
await client.connect(transport);
await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: 'openwater', ioName: 'ApplicationCategory', iof: {
    Name: 'path', DisplayName: 'Path', Description: 'Application category path',
    Type: 'String', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, IsUniqueKey: false,
    Status: 'Active', IntegrationObjectID: '@parent:ID', MetadataSource: 'Declared',
} } });
await client.callTool({ name: 'append_provenance', arguments: { connector: 'openwater', entry: {
    URL: 'connectors-registry/openwater/sources/openwater-openapi-v2.json#Models.Program.ApplicationCategoryModel.path',
    AccessedAt: new Date().toISOString(),
    UsedFor: 'completeness-diff L2 amend: spec documents ApplicationCategory.path (string) — emission omitted it.',
    SourceTier: 2, SourceCategory: 'OpenAPISpec', EvidenceStrength: 'ExplicitStatement',
    TargetField: 'iof.ApplicationCategory.path',
    Excerpt: '"path": {"type": "string", "description": "Application category path"}',
} } });
console.log(JSON.stringify({ amended: 'ApplicationCategory.path' }));
process.exit(0);
