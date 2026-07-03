#!/usr/bin/env node
/**
 * Supplemental provenance -- Eventbrite MetadataWriter round 2.
 * Adds the two Configuration claims that ARE backed by explicit vendor
 * statements but were not cited in round 1: universalPK (Tier-1 PK signal
 * confirmed across all 31 coverable leaves) and RateLimitPolicy (the smoothed
 * tokensPerSec derivation of the documented hourly ceiling).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const APIB_URL = 'https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib';
const NOW = new Date().toISOString();

async function withClient(fn) {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [SERVER_PATH],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: `${REPO_ROOT}/packages/Integration/connectors-registry`,
            MJ_METADATA_ROOT: `${REPO_ROOT}/metadata/integrations`,
        },
    });
    const client = new Client({ name: 'metadata-writer-eventbrite-r2', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try {
        return await fn(client);
    } finally {
        await client.close();
    }
}

async function callTool(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}

const entries = [
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor:
            'Establishing Configuration.universalPK (vendor-wide PK convention hint for runtime D4 SoftPKClassifier) -- every one of the 31 SOURCE_STUDY.md COVERABLE leaves has a Get-one APIPath whose trailing path parameter matches the object\'s own "id" MSON field, and the vendor\'s Basic Types section documents id as string-typed on the wire.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.universalPK',
        Excerpt:
            'GET /events/{event_id}/ <-> Event.id; GET /orders/{order_id}/ <-> Order.id; GET /venues/{venue_id}/ <-> Venue.id; GET /categories/{id}/ <-> Category.id -- pattern confirmed across all 31 coverable leaves (SOURCE_STUDY.md "Multi-source PK/FK detection inputs" -- Tier-1 PK signal). Every documented MSON object type also carries its own top-level "id (string)" field (e.g. Event MSON: "id: 3564383166 (string, required) - Event ID").',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor:
            'Establishing Configuration.RateLimitPolicy -- the smoothed per-second derivation (2000 calls / 3600 seconds) of the documented hourly ceiling, used as the connector\'s token-bucket rate for peak-aware sync throttling.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.RateLimitPolicy',
        Excerpt:
            '429 | HIT_RATE_LIMIT | Hourly rate limit has been reached for this token. Default rate limits are 2,000 calls per hour. (Same underlying statement as BatchMaxRequestCount/BatchRequestWaitTime; RateLimitPolicy additionally derives tokensPerSec = 2000/3600 = 0.5556 for the engine\'s AIMD token-bucket rate limiter. No Retry-After header format or burst allowance is documented in this source -- flagged as a soft gap in the note field.)',
    },
];

async function main() {
    await withClient(async (client) => {
        for (const entry of entries) {
            const msg = await callTool(client, 'append_provenance', { connector: CONNECTOR, entry });
            console.log('[append_provenance]', entry.TargetField, '->', msg);
        }
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
