#!/usr/bin/env node
/**
 * mj-test-runner MCP server. THE CREDENTIAL SAFE CHANNEL.
 *
 * Exposes one tool — `run_tier` — that runs a named test tier against a
 * connector. T0/T4 type-check / unit-test the REAL connectors package; T1 runs
 * deterministic structural invariants; T2/T3/T5/T6/T7 are REAL credential-free
 * deep tiers (cross-pass discovery consistency, doc self-check against persisted
 * metadata, mock-HTTP replay, SQLite round-trip create/update/delete, and
 * OpenAPI-spec validation). T8 is a READ-ONLY LIVE test — the only tier that
 * touches credentials; that happens INSIDE this subprocess and the credential
 * bytes never leave it. T8 performs only non-mutating ops (TestConnection /
 * DiscoverObjects / one FetchChanges page) — never write.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.19.3
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { RunTierRequestSchema } from './types.js';
import { RunTier } from './tierRunner.js';

// Trace logging — every tier call + outcome as one JSONL line. NEVER logs the
// credential file path or bytes. Logging failures are swallowed.
const TRACE_LOG = process.env.MJ_MCP_LOG ?? resolve(process.cwd(), 'logs/mcp-trace.jsonl');
function traceLog(rec: Record<string, unknown>): void {
    try {
        mkdirSync(dirname(TRACE_LOG), { recursive: true });
        appendFileSync(TRACE_LOG, JSON.stringify({ ts: new Date().toISOString(), server: 'mj-test-runner', ...rec }) + '\n');
    } catch { /* never let logging break a tool call */ }
}

const server = new Server(
    { name: 'mj-test-runner', version: '5.34.1' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'run_tier',
            description: 'Run a connector test tier (T0-T8). T0/T4 run tsc/vitest against the real connectors package; T1 runs structural invariants. T2/T3/T5/T6/T7 are REAL, credential-free deep tiers: T2 cross-pass discovery consistency, T3 doc self-check against persisted metadata, T5 mock-HTTP replay of recorded fixtures, T6 SQLite round-trip proving create/update/delete semantics, T7 OpenAPI-spec validation (Skipped only when the connector has no spec/no API paths — a legitimate not-applicable, not a stub). T8 is a READ-ONLY live test (TestConnection/DiscoverObjects/one FetchChanges page — never write); for T8 only, supply CredentialFilePath. The credential file is read inside this subprocess and its bytes never leave it.',
            inputSchema: {
                type: 'object',
                properties: {
                    Connector: { type: 'string', description: 'Connector name (registry directory name)' },
                    Tier: {
                        type: 'string',
                        enum: [
                            'T0_StaticValidation',
                            'T1_InvariantValidator',
                            'T2_CrossProgrammaticConsistency',
                            'T3_DocStructureSelfCheck',
                            'T4_MockedFixture',
                            'T5_MockHTTPServer',
                            'T6_LocalSQLiteBackend',
                            'T7_OpenAPIValidation',
                            'T8_AuthenticatedEndpoint',
                        ],
                    },
                    CredentialFilePath: {
                        type: 'string',
                        description: 'Required for T8 (read-only live) only. Absolute path to a credential JSON file on disk. The file is read by this subprocess to run non-mutating connector calls; its bytes are never returned to the caller.',
                    },
                },
                required: ['Connector', 'Tier'],
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'run_tier') {
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    const a = (args ?? {}) as Record<string, unknown>;
    // Trace: Connector + Tier only; NEVER the credential file path or bytes.
    traceLog({ phase: 'call', tool: 'run_tier', connector: a.Connector, tier: a.Tier, credentialFilePresent: typeof a.CredentialFilePath === 'string' });
    try {
        const parsed = RunTierRequestSchema.parse(args);
        const result = await RunTier(parsed);
        traceLog({ phase: 'result', tool: 'run_tier', connector: result.Connector, tier: result.Tier, status: result.Status, durationMs: result.DurationMs });
        // SECURITY: scrub any field that might carry credential bytes before returning.
        // Result types are designed to NOT include such fields; defense in depth.
        const safe = {
            Tier: result.Tier,
            Connector: result.Connector,
            Status: result.Status,
            DurationMs: result.DurationMs,
            Output: result.Output,
            Errors: result.Errors,
            Details: result.Details,
        };
        return { content: [{ type: 'text', text: JSON.stringify(safe, null, 2) }] };
    }
    catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        traceLog({ phase: 'error', tool: 'run_tier', connector: a.Connector, tier: a.Tier, error: message });
        return {
            content: [{ type: 'text', text: `Error: ${message}` }],
            isError: true,
        };
    }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
    process.stderr.write(`mj-test-runner MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
