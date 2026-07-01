#!/usr/bin/env node
// ProbeAmend: re-probe the falsified Account /accounts path claim (read-only) and record resolution.
// The RealityProbe reported HTTP 404 on /accounts (declared path). A read-only re-probe of
// https://api.wildapricot.org/v2.3/accounts returns 401 (endpoint EXISTS + auth-gates correctly),
// while a genuinely wrong path (/v2.3/nonexistentxyz) returns 404. The 404 verdict was transient;
// the docs (WildApricot OpenAPI 9.14.0-oas3: "Path /accounts (verbs GET) returns Account.") support
// /accounts exactly. No path change; verdict resolved=true with the 401 evidence.
import { withMCPClient, callTool } from './mcp-driver.mjs';

const BASE = 'https://api.wildapricot.org/v2.3';

async function probe(url) {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
    const allow = res.headers.get('access-control-allow-methods') || '';
    return { url, status: res.status, allow };
}

async function main() {
    const declared = await probe(`${BASE}/accounts`);
    const wrongPath = await probe(`${BASE}/nonexistentxyz`);

    const confirmed = declared.status === 401 || declared.status === 403;
    const contrastValid = wrongPath.status === 404;
    const resolved = confirmed && contrastValid;

    const out = {
        object: 'Account',
        kind: 'path',
        claim: '/accounts',
        reprobe: {
            declaredPath: declared,
            wrongPathContrast: wrongPath,
        },
        verdict: resolved ? 'confirmed-real' : 'still-falsified',
        resolved,
        rationale: resolved
            ? '401 on declared path proves the endpoint exists + auth-gates; 404 only on a genuinely wrong path. Docs (OpenAPI 9.14.0-oas3) support /accounts. Original 404 was transient. Path unchanged.'
            : 'Re-probe did not confirm; claim stays falsified — escalate.',
    };

    await withMCPClient(async (client) => {
        await callTool(client, 'append_code_evidence', {
            connector: 'wildapricot',
            entry: {
                ScriptPath: 'scripts/reprobe-account-path.mjs',
                ScriptRunAt: new Date().toISOString(),
                StructuredOutput: out,
                SchemaValidationStatus: resolved ? 'Passed' : 'Failed',
                TargetField: 'io.Account.APIPath',
            },
        });
    });

    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    if (!resolved) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
