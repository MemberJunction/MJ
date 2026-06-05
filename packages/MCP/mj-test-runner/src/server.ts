#!/usr/bin/env node
/**
 * mj-test-runner MCP server. THE CREDENTIAL SAFE CHANNEL.
 *
 * Exposes one tool — `run_tier` — that runs a named test tier against a
 * connector. T8 (authenticated endpoint) is the only tier that touches
 * credentials; that happens INSIDE this subprocess and the credential bytes
 * never leave it.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.19.3
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { RunTierRequestSchema } from './types.js';
import { RunTier } from './tierRunner.js';

const server = new Server(
    { name: 'mj-test-runner', version: '5.34.1' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'run_tier',
            description: 'Run a connector test tier (T0-T8). For T8 only, supply CredentialFilePath; the file is read inside this subprocess and never leaves it.',
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
                        description: 'Required for T8 only. Absolute path to a credential file on disk. The path is read by this subprocess; bytes never returned to the caller.',
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
    try {
        const parsed = RunTierRequestSchema.parse(args);
        const result = await RunTier(parsed);
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
        return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
    process.stderr.write(`mj-test-runner MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
