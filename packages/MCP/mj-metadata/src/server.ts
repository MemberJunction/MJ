#!/usr/bin/env node
/**
 * mj-metadata MCP server.
 *
 * Exposes 7 tools so agents can read/write connector metadata atomically
 * without raw filesystem access:
 *
 *   read_integration                — returns the integration file shape
 *   upsert_integration_fields       — merge root-level integration fields (hot-path columns)
 *   upsert_integration_object       — upsert an IO row
 *   upsert_integration_object_field — upsert an IOF row
 *   append_provenance               — append a PROVENANCE.json entry
 *   append_code_evidence            — append a CODE_EVIDENCE.json entry
 *   list_connectors                 — list connectors-registry entries
 *
 * Invoked via `.mcp.json`:
 *   { "mcpServers": { "mj-metadata": { "command": "mj-metadata-mcp" } } }
 *
 * @see INTEGRATION-AGENT-TODO.md §2.18.3
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readdirSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MetadataFileStore } from './MetadataFileStore.js';
import {
    IntegrationObjectSchema,
    IntegrationObjectFieldSchema,
    IntegrationRootFieldsSchema,
    ProvenanceEntrySchema,
    CodeEvidenceEntrySchema,
} from './types.js';

const REGISTRY_ROOT = process.env.MJ_CONNECTORS_REGISTRY ?? resolve(process.cwd(), 'packages/Integration/connectors-registry');
const store = new MetadataFileStore(REGISTRY_ROOT);

// ── Trace logging ────────────────────────────────────────────────────────
// Every tool call + outcome is appended as one JSONL line so a build run is
// fully traceable (MCP calls are otherwise a black box). Failures here are
// swallowed — logging must never break a tool call.
const TRACE_LOG = process.env.MJ_MCP_LOG ?? resolve(process.cwd(), 'logs/mcp-trace.jsonl');
function traceLog(rec: Record<string, unknown>): void {
    try {
        mkdirSync(dirname(TRACE_LOG), { recursive: true });
        appendFileSync(TRACE_LOG, JSON.stringify({ ts: new Date().toISOString(), server: 'mj-metadata', ...rec }) + '\n');
    } catch { /* never let logging break a tool call */ }
}
// Safe, credential-free summary of a call's args (names/keys only, no payloads).
function summarizeArgs(a: Record<string, unknown>): Record<string, unknown> {
    const s: Record<string, unknown> = {};
    if (typeof a?.connector === 'string') s.connector = a.connector;
    if (typeof a?.ioName === 'string') s.ioName = a.ioName;
    const io = a?.io as Record<string, unknown> | undefined;
    if (io && typeof io.Name === 'string') s.io = io.Name;
    const iof = a?.iof as Record<string, unknown> | undefined;
    if (iof && typeof iof.Name === 'string') s.iof = iof.Name;
    const fields = a?.fields as Record<string, unknown> | undefined;
    if (fields) s.fieldKeys = Object.keys(fields);
    const entry = a?.entry as Record<string, unknown> | undefined;
    if (entry) s.entryKeys = Object.keys(entry);
    return s;
}

const server = new Server(
    { name: 'mj-metadata', version: '5.34.1' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'read_integration',
            description: 'Read the metadata file for a connector. Returns the IntegrationMetadataFile shape (or null if the file does not exist).',
            inputSchema: {
                type: 'object',
                properties: { connector: { type: 'string', description: 'Connector name (registry directory name)' } },
                required: ['connector'],
            },
        },
        {
            name: 'upsert_integration_fields',
            description: 'Merge a set of root-level integration fields (the `fields` block on the metadata file) for a connector. Used to populate Phase 0 hot-path columns: CredentialTypeID, APIBaseURL, APIBaseURLMode, TokenRefreshStrategy, AuthHeaderPattern, Pagination* params, IncrementalSyncCapability, WebhooksAvailable, BulkOperationsAvailable, CustomObjectMarkerPattern, FKNamingConvention, APIVersioningStrategy, etc. Existing fields are preserved; keys present in payload overwrite. Accepts arbitrary string/number/boolean/null/nested-object values.',
            inputSchema: {
                type: 'object',
                properties: {
                    connector: { type: 'string', description: 'Connector name (registry directory name)' },
                    fields: { type: 'object', description: 'Map of root-level field names to values to merge into the integration `fields` block.' },
                },
                required: ['connector', 'fields'],
            },
        },
        {
            name: 'upsert_integration_object',
            description: 'Insert or update an Integration Object row in the connector metadata file. Match key: io.Name (case-insensitive).',
            inputSchema: {
                type: 'object',
                properties: {
                    connector: { type: 'string' },
                    io: { type: 'object' },
                },
                required: ['connector', 'io'],
            },
        },
        {
            name: 'upsert_integration_object_field',
            description: 'Insert or update an Integration Object Field row under a given IO. Creates the IO if it does not exist.',
            inputSchema: {
                type: 'object',
                properties: {
                    connector: { type: 'string' },
                    ioName: { type: 'string' },
                    iof: { type: 'object' },
                },
                required: ['connector', 'ioName', 'iof'],
            },
        },
        {
            name: 'append_provenance',
            description: 'Append a provenance entry to <connector>/PROVENANCE.json. Required for Invariant 1 (no reasoning-only emissions).',
            inputSchema: {
                type: 'object',
                properties: { connector: { type: 'string' }, entry: { type: 'object' } },
                required: ['connector', 'entry'],
            },
        },
        {
            name: 'append_code_evidence',
            description: 'Append a code-evidence entry to <connector>/CODE_EVIDENCE.json. Records the output of an extractor script.',
            inputSchema: {
                type: 'object',
                properties: { connector: { type: 'string' }, entry: { type: 'object' } },
                required: ['connector', 'entry'],
            },
        },
        {
            name: 'list_connectors',
            description: 'List connectors present in the registry root.',
            inputSchema: { type: 'object', properties: {} },
        },
    ],
}));

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

async function handleTool(name: string, a: Record<string, unknown>): Promise<ToolResult> {
    {
        switch (name) {
            case 'read_integration': {
                const file = store.ReadIntegration(a.connector as string);
                return { content: [{ type: 'text', text: JSON.stringify(file, null, 2) }] };
            }
            case 'upsert_integration_fields': {
                const fields = IntegrationRootFieldsSchema.parse(a.fields);
                store.UpsertIntegrationFields(a.connector as string, fields);
                const keys = Object.keys(fields);
                return { content: [{ type: 'text', text: `Upserted ${keys.length} root-level field(s) for ${a.connector as string}: ${keys.join(', ')}` }] };
            }
            case 'upsert_integration_object': {
                const io = IntegrationObjectSchema.parse(a.io);
                store.UpsertIO(a.connector as string, io);
                return { content: [{ type: 'text', text: `Upserted IO '${io.Name}' for ${a.connector as string}` }] };
            }
            case 'upsert_integration_object_field': {
                const iof = IntegrationObjectFieldSchema.parse(a.iof);
                store.UpsertIOF(a.connector as string, a.ioName as string, iof);
                return { content: [{ type: 'text', text: `Upserted IOF '${a.ioName as string}.${iof.Name}' for ${a.connector as string}` }] };
            }
            case 'append_provenance': {
                const entry = ProvenanceEntrySchema.parse(a.entry);
                store.AppendProvenance(a.connector as string, entry);
                return { content: [{ type: 'text', text: `Appended provenance entry for ${a.connector as string}` }] };
            }
            case 'append_code_evidence': {
                const entry = CodeEvidenceEntrySchema.parse(a.entry);
                store.AppendCodeEvidence(a.connector as string, entry);
                return { content: [{ type: 'text', text: `Appended code-evidence entry for ${a.connector as string}` }] };
            }
            case 'list_connectors': {
                const entries = existsSync(REGISTRY_ROOT) ? readdirSync(REGISTRY_ROOT).filter((d) => !d.startsWith('.') && !d.endsWith('.md')) : [];
                return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] };
            }
            default:
                return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
        }
    }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = args as Record<string, unknown>;
    const summary = summarizeArgs(a);
    traceLog({ phase: 'call', tool: name, ...summary });
    try {
        const out = await handleTool(name, a);
        traceLog({ phase: 'result', tool: name, ok: !out.isError, ...summary });
        return out;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        traceLog({ phase: 'error', tool: name, error: message, ...summary });
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
    process.stderr.write(`mj-metadata MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
