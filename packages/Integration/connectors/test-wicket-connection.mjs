/**
 * Quick test script to verify Wicket API connectivity.
 *
 * Usage:
 *   node test-wicket-connection.mjs
 *
 * Reads credentials from environment variables (set in .env):
 *   WICKET_API_JWT_SECRET  - API secret for JWT signing
 *   WICKET_ADMIN_UUID      - Admin user UUID (JWT `sub` claim)
 *   WICKET_API_URL         - Full API base URL (e.g., https://sandbox-api.staging.wicketcloud.com)
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Load .env from repo root ────────────────────────────────────────
const envPath = resolve(import.meta.dirname, '../../../.env');
try {
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex < 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
} catch {
    console.warn('Could not load .env file, using existing environment variables');
}

// ─── Read credentials ────────────────────────────────────────────────
const API_SECRET = process.env.WICKET_API_JWT_SECRET;
const ADMIN_UUID = process.env.WICKET_ADMIN_UUID;
const API_URL = process.env.WICKET_API_URL;

if (!API_SECRET || !ADMIN_UUID || !API_URL) {
    console.error('Missing required environment variables:');
    if (!API_SECRET) console.error('  - WICKET_API_JWT_SECRET');
    if (!ADMIN_UUID) console.error('  - WICKET_ADMIN_UUID');
    if (!API_URL) console.error('  - WICKET_API_URL');
    process.exit(1);
}

// ─── JWT generation ──────────────────────────────────────────────────
function base64url(input) {
    return Buffer.from(input).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlBuffer(input) {
    return input.toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateJWT() {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        exp: now + 300,
        sub: ADMIN_UUID,
        aud: API_URL,
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = createHmac('sha256', API_SECRET)
        .update(signingInput)
        .digest();

    return `${signingInput}.${base64urlBuffer(signature)}`;
}

// ─── Run tests ───────────────────────────────────────────────────────
async function main() {
    console.log('=== Wicket API Connection Test ===\n');
    console.log(`API URL: ${API_URL}`);
    console.log(`Admin UUID: ${ADMIN_UUID}`);
    console.log(`Secret: ${API_SECRET.slice(0, 8)}...${API_SECRET.slice(-4)}\n`);

    const token = generateJWT();
    console.log(`Generated JWT: ${token.slice(0, 40)}...\n`);

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/vnd.api+json',
    };

    // Test 1: Fetch 1 person
    console.log('--- Test 1: GET /people?page[size]=1 ---');
    try {
        const res = await fetch(`${API_URL}/people?page[size]=1`, { headers });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const body = await res.json();

        if (res.ok) {
            const count = body.meta?.page?.total_count ?? '?';
            const records = body.data?.length ?? 0;
            console.log(`Total people: ${count}, returned: ${records}`);
            if (body.data?.[0]) {
                const person = body.data[0];
                console.log(`First person: ${person.attributes?.given_name ?? ''} ${person.attributes?.family_name ?? ''} (${person.id})`);
            }
        } else {
            console.log(`Error: ${JSON.stringify(body).slice(0, 500)}`);
        }
    } catch (err) {
        console.error(`Failed: ${err.message}`);
    }

    // Test 2: Fetch 1 organization
    console.log('\n--- Test 2: GET /organizations?page[size]=1 ---');
    try {
        const res = await fetch(`${API_URL}/organizations?page[size]=1`, { headers });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const body = await res.json();

        if (res.ok) {
            const count = body.meta?.page?.total_count ?? '?';
            const records = body.data?.length ?? 0;
            console.log(`Total organizations: ${count}, returned: ${records}`);
            if (body.data?.[0]) {
                const org = body.data[0];
                console.log(`First org: ${org.attributes?.legal_name ?? org.attributes?.alternate_name ?? 'N/A'} (${org.id})`);
            }
        } else {
            console.log(`Error: ${JSON.stringify(body).slice(0, 500)}`);
        }
    } catch (err) {
        console.error(`Failed: ${err.message}`);
    }

    // Test 3: Fetch memberships
    console.log('\n--- Test 3: GET /memberships?page[size]=5 ---');
    try {
        const res = await fetch(`${API_URL}/memberships?page[size]=5`, { headers });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const body = await res.json();

        if (res.ok) {
            const count = body.meta?.page?.total_count ?? '?';
            console.log(`Total membership tiers: ${count}`);
            for (const tier of (body.data ?? [])) {
                console.log(`  - ${tier.attributes?.name ?? 'N/A'} (${tier.id})`);
            }
        } else {
            console.log(`Error: ${JSON.stringify(body).slice(0, 500)}`);
        }
    } catch (err) {
        console.error(`Failed: ${err.message}`);
    }

    // Test 4: Check rate limit headers
    console.log('\n--- Test 4: Rate Limit Headers ---');
    try {
        const res = await fetch(`${API_URL}/people?page[size]=1`, { headers });
        const limit = res.headers.get('ratelimit-limit');
        const remaining = res.headers.get('ratelimit-remaining');
        const reset = res.headers.get('ratelimit-reset');
        console.log(`Limit: ${limit ?? 'N/A'}`);
        console.log(`Remaining: ${remaining ?? 'N/A'}`);
        console.log(`Reset: ${reset ?? 'N/A'}`);
    } catch (err) {
        console.error(`Failed: ${err.message}`);
    }

    console.log('\n=== Done ===');
}

main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
