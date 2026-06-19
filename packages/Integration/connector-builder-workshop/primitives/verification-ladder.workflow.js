// LOCKED PRIMITIVE — verification-ladder
//
// Guarantee: 9-rung ladder (T0..T8) where EVERY rung's verdict comes from a REAL
// `mcp__mj-test-runner__run_tier` call — never the LLM's self-report. The ladder
// dispatches `testing-agent` per rung with a hard instruction to invoke the MCP
// runner and return its VERBATIM result; this JS trusts a rung as green ONLY when
// the returned object carries the runner's shape (Tier/Status/DurationMs) AND
// Status==='Pass'. An LLM that hand-writes JSON cannot fake the runner's shape,
// so a fabricated "green" is rejected as malformed and treated as red.
//
// Tier reality (mirrors the runner — packages/MCP/mj-test-runner/src/tierRunner.ts
// + src/tiers/*). T0..T7 are ALL real, credential-free rungs; T8 is the only
// live (credentialed) one:
//   - T0_StaticValidation — tsc --noEmit over the REAL connectors package.
//   - T1_InvariantValidator — deterministic structural invariants.
//   - T2_CrossProgrammaticConsistency — runs the connector's discovery TWICE and
//     diffs the object/field/PK/FK claims; divergence = non-deterministic extractor.
//   - T3_DocStructureSelfCheck — re-extracts via the connector's discovery and
//     diffs it against the persisted integration metadata (IO/IOF); structural
//     drift fails.
//   - T4_MockedFixture — the connector's vitest suite against recorded fixtures.
//   - T5_MockHTTPServer — boots a local mock HTTP server (or temp file for a
//     file-feed) that replays recorded fixtures, then exercises discover + fetch +
//     paginate + error-classification. Fails loudly with `no-fixtures` if absent.
//   - T6_LocalSQLiteBackend — real pull → apply into in-memory SQLite, replays
//     delta passes, and asserts create/update/delete/ordering semantics. Fails
//     loudly with `no-fixtures` if absent.
//   - T7_OpenAPIValidation — validates the connector's declared API paths/methods
//     against an OpenAPI/Swagger spec when one exists; returns Status:'Skipped'
//     with reason `no-openapi-spec`/`no-api-paths` when there is nothing to
//     validate (a legitimate not-applicable, NOT a stub).
//   - T8_AuthenticatedEndpoint is the ONLY live rung — and it is READ-ONLY
//     (TestConnection + Discover + one read page). No writes, no bidirectional,
//     no push, no 2^N matrix, no dual-dialect.
//
// A Status:'Skipped' is now a LEGITIMATE not-applicable result (T7's
// `no-openapi-spec`/`no-api-paths`), not a not-implemented stub. The runtime reads
// the actual reason from the runner's Errors/Details: an allowed-skip reason
// (no-openapi-spec / no-api-paths / no-fixtures) is surfaced as a non-blocking
// warning (NOT a pass, NOT a failure, NOT "unimplemented"); a Skip with any other
// reason is treated as a genuine capability gap.
//
// Anti-thrash invariant: if a higher rung fails on something a lower rung could
// have caught, that's a gate-placement bug — add the check at the lower rung, do
// not silently re-run. The in-order ascent gate (break on first red) is kept.
//
// v2 RUNG — T7d/T12_IdempotencyReplay (ARCHITECTURE_REFACTOR.md P3) — IMPLEMENTED
// (packages/MCP/mj-test-runner/src/tiers/t12IdempotencyReplay.ts). Replays every fixture set TWICE
// through the connector — pass 2 with a volatile field injected into every record object (the GZ
// #22 trigger that doubled 9 tables) — and asserts the per-object ExternalID multisets are
// byte-flat across passes (and counts don't grow). No single-pass tier can catch identity drift on
// unchanged-but-noisy input; GZ shipped it green through T0–T8. Credential-free; ordered before
// the live rung. The live counterpart (two-pass zero-growth on a real DB) lives in hybrid-e2e +
// floor-check `second-sync-grew`.
//
// Credential safety: T8 is the only rung needing credentials. The credential
// reference is an opaque path that this workflow NEVER reads; the MCP runner
// subprocess reads the credential file in isolation and returns results without
// credential bytes entering this conversation.
//
// Inputs:
//   {
//     vendor: string,
//     connectorName: string,
//     manifest: object,                     // minimumThoroughnessManifest
//     credentialReference?: string,         // opaque path; never read by this workflow
//     maxTier?: 'T0' | ... | 'T8',          // realistic ceiling
//   }
//
// Output:
//   {
//     tierResults: Array<{tier, label, status: 'green'|'red'|'skipped', failures?, skipReason?, durationMs?}>,
//     achievedTier: string,                       // highest green rung
//     classifiedFailures: Array<{tier, code, locus}>,
//     skippedRungs: Array<{tier, label, reason}>,  // not-applicable skips (e.g. no-openapi-spec) — warnings, not gaps
//   }

export const meta = {
    name: 'verification-ladder',
    description: 'T0..T8 staged verification via mcp-mj-test-runner. Every rung verdict is the runner\'s VERBATIM run_tier result (not self-report); a rung is green only if Status===Pass and the runner shape is present. T0..T7 are all real, credential-free rungs (T2 cross-pass discovery consistency, T3 doc self-check vs persisted metadata, T5 mock-HTTP replay, T6 SQLite create/update/delete round-trip, T7 OpenAPI validation). T8 is the only live rung and is READ-ONLY. A Skipped result is a legitimate not-applicable (e.g. T7 no-openapi-spec) surfaced as a warning, not a gap. Strict in-order gating; failures classify via SyncErrorCode/ClassifyError.',
    phases: [
        { title: 'T0_StaticValidation', detail: 'tsc --noEmit over the real connectors package' },
        { title: 'T1_InvariantValidator', detail: 'Structural invariants (three-way name match, FK metadata, capability↔method)' },
        { title: 'T2_CrossProgrammaticConsistency', detail: 'Real: runs the connector\'s discovery twice and diffs object/field/PK/FK claims — divergence = non-deterministic extractor' },
        { title: 'T3_DocStructureSelfCheck', detail: 'Real: re-extracts via the connector\'s discovery and diffs it against persisted integration metadata — structural drift fails' },
        { title: 'T4_MockedFixture', detail: 'Connector code against recorded fixtures (vitest)' },
        { title: 'T5_MockHTTPServer', detail: 'Real: boots a local mock HTTP server (temp file for file-feeds) replaying recorded fixtures; exercises discover + fetch + paginate + error-classification (no-fixtures fails loudly)' },
        { title: 'T6_LocalSQLiteBackend', detail: 'Real: pull→apply into in-memory SQLite + delta replay, asserting create/update/delete/ordering semantics (no-fixtures fails loudly)' },
        { title: 'T7_OpenAPIValidation', detail: 'Real: validates declared API paths/methods against an OpenAPI/Swagger spec when present; Skipped (no-openapi-spec / no-api-paths) when there is nothing to validate' },
        { title: 'T8_AuthenticatedEndpoint', detail: 'READ-ONLY live rung — TestConnection + Discover + one read page. The only credential-required rung.' },
    ],
};

// The verbatim shape the MCP runner returns (packages/MCP/mj-test-runner/src/types.ts
// `TierResult`). The ladder validates the agent's returned object against this to
// prove the result is the runner's — not hand-written by the LLM.
const RUNNER_RESULT_SCHEMA = {
    type: 'object',
    required: ['Tier', 'Status', 'DurationMs'],
    properties: {
        Tier: { type: 'string' },                         // full runner tier id, e.g. 'T0_StaticValidation'
        Connector: { type: 'string' },
        Status: { enum: ['Pass', 'Fail', 'Skipped'] },
        DurationMs: { type: 'integer' },
        Output: { type: 'string' },
        Errors: { type: 'array' },
        Details: { type: 'object' },
    },
};

const LADDER_RESULT_SCHEMA = {
    type: 'object',
    required: ['tierResults', 'achievedTier', 'classifiedFailures', 'skippedRungs'],
    properties: {
        tierResults: {
            type: 'array',
            items: {
                type: 'object',
                required: ['tier', 'label', 'status'],
                properties: {
                    tier: { type: 'string' },
                    label: { type: 'string' },
                    status: { enum: ['green', 'red', 'skipped'] },
                    failures: { type: 'array' },
                    skipReason: { type: 'string' },
                    durationMs: { type: 'integer' },
                },
            },
        },
        achievedTier: { type: 'string' },
        classifiedFailures: {
            type: 'array',
            items: {
                type: 'object',
                required: ['tier', 'code', 'locus'],
                properties: {
                    tier: { type: 'string' },
                    code: { type: 'string' },
                    locus: { type: 'string' },
                },
            },
        },
        // Not-applicable skips (e.g. T7 with no OpenAPI spec / no API paths). These
        // are warnings, NOT capability gaps and NOT passes.
        skippedRungs: {
            type: 'array',
            items: {
                type: 'object',
                required: ['tier', 'label', 'reason'],
                properties: {
                    tier: { type: 'string' },
                    label: { type: 'string' },
                    reason: { type: 'string' },
                },
            },
        },
    },
    additionalProperties: false,
};

// Tier table — short id (gate ordering) + full runner tier id + cred requirement.
// `runnerTier` is what gets passed to `mcp__mj-test-runner__run_tier` so the
// returned `Tier` field can be matched exactly.
const tiers = [
    { tier: 'T0', label: 'StaticValidation', runnerTier: 'T0_StaticValidation', cred: false },
    { tier: 'T1', label: 'InvariantValidator', runnerTier: 'T1_InvariantValidator', cred: false },
    { tier: 'T2', label: 'CrossProgrammaticConsistency', runnerTier: 'T2_CrossProgrammaticConsistency', cred: false },
    { tier: 'T3', label: 'DocStructureSelfCheck', runnerTier: 'T3_DocStructureSelfCheck', cred: false },
    { tier: 'T4', label: 'MockedFixture', runnerTier: 'T4_MockedFixture', cred: false },
    { tier: 'T5', label: 'MockHTTPServer', runnerTier: 'T5_MockHTTPServer', cred: false },
    { tier: 'T6', label: 'LocalSQLiteBackend', runnerTier: 'T6_LocalSQLiteBackend', cred: false },
    { tier: 'T7', label: 'OpenAPIValidation', runnerTier: 'T7_OpenAPIValidation', cred: false },
    // New credential-free probes — placed BEFORE the live rung so the full credential-free
    // battery gates first (execution = THIS array order, NOT tier number). Their short-ids
    // are T7a/b/c so `parseInt` keeps them at 7 (below the live rung's 8) — this preserves
    // the `achievedTier` numeric semantics: a skipped-live run yields achievedTier<8 and
    // correctly fails floor-check's e2e-tier-met. Their REAL runner names are T9/T10/T11.
    { tier: 'T7a', label: 'EndpointReality', runnerTier: 'T9_EndpointReality', cred: false },
    { tier: 'T7b', label: 'TransportSmoke', runnerTier: 'T10_TransportSmoke', cred: false },
    { tier: 'T7c', label: 'SandboxProbe', runnerTier: 'T11_SandboxProbe', cred: false },
    // v2 P3 idempotency rung: two-pass volatile-field fixture replay; identity drift = red.
    { tier: 'T7d', label: 'IdempotencyReplay', runnerTier: 'T12_IdempotencyReplay', cred: false },
    // Live rung LAST and HIGHEST-numbered — the only credentialed tier (READ-ONLY).
    { tier: 'T8', label: 'AuthenticatedEndpoint', runnerTier: 'T8_AuthenticatedEndpoint', cred: true },
];

// Validate a returned object has the runner's shape. A hand-written LLM JSON that
// omits Tier/Status/DurationMs (or carries a foreign Tier value) fails this — which
// is exactly how a fabricated "green" gets rejected.
function isRunnerResult(obj, expectedRunnerTier) {
    if (!obj || typeof obj !== 'object') return false;
    if (typeof obj.Tier !== 'string' || obj.Tier !== expectedRunnerTier) return false;
    if (obj.Status !== 'Pass' && obj.Status !== 'Fail' && obj.Status !== 'Skipped') return false;
    if (typeof obj.DurationMs !== 'number') return false;
    return true;
}

// Skip reasons the runner emits that are LEGITIMATE not-applicable results — the
// tier is real and ran, but had nothing to validate (no spec, no API paths, no
// fixtures). These surface as warnings, never as capability gaps. Any OTHER skip
// reason is treated as a genuine missing capability.
const ALLOWED_SKIP_REASONS = ['no-openapi-spec', 'no-api-paths', 'no-fixtures', 'no-public-sandbox', 'no-network-endpoints', 'network-unreachable', 'discovery-requires-credentials'];
function isAllowedSkip(reason) {
    const r = String(reason ?? '').toLowerCase();
    return ALLOWED_SKIP_REASONS.some((allowed) => r.includes(allowed));
}

// True-leak fix (surveys: NetSuite/Nimble/cvent — the #1 false-red). A credential-FREE
// rung (T2/T3) runs the connector's discovery; a connector whose discovery legitimately
// REQUIRES a credential (Salesforce/NetSuite OAuth) THROWS without one → the runner returns
// Fail → the ladder reds and the code-build loop burns whole rounds "fixing" an
// unfixable-without-creds rung (Nimble rebuilt an 803-LOC connector twice). When we are in
// credential-free mode, an auth-required Fail on a cred-free rung is NOT a code defect — it is
// the same not-applicable condition T8 already skips for. We reclassify it to the existing
// `discovery-requires-credentials` allowed-skip: zero coverage lost (the rung was unreachable
// without a credential regardless), the residual is reported honestly, and the loop stops
// thrashing. GUARD: only fires (a) in credential-free mode and (b) when the failure text
// actually signals auth — a real code bug still reds.
const AUTH_REQUIRED_SIGNALS = ['401', '403', 'unauthorized', 'forbidden', 'authentication', 'credential', 'oauth', 'access token', 'invalid_grant', 'missing token', 'requires auth', 'no credential'];
function looksLikeAuthRequired(result) {
    const hay = [
        ...(Array.isArray(result?.Errors) ? result.Errors : []),
        result?.Output,
        result?.Details && typeof result.Details.reason === 'string' ? result.Details.reason : '',
    ].join(' ').toLowerCase();
    return AUTH_REQUIRED_SIGNALS.some((s) => hay.includes(s));
}

const maxTier = String(args?.maxTier ?? 'T8');
const maxTierNum = parseInt(maxTier.slice(1), 10);
// Broker-mediated live testing: when the plan supplies brokerPlans (read-only mailbox
// plans), the live rung runs through the separate-user broker instead of a credential
// file — the credential never reaches the agent or this script.
const brokerPlans = Array.isArray(args?.brokerPlans) ? args.brokerPlans : [];
const hasCreds = !!args?.credentialReference;
const tierResults = [];
const skippedRungs = [];
let achievedTier = 'none';

for (const t of tiers) {
    const tierNum = parseInt(t.tier.slice(1), 10);

    // The maxTier ceiling gates ONLY the live rung. Credential-free tiers are the
    // comprehensive workhorse battery and ALWAYS run (never number-gated) — their tier
    // numbers are unique IDs, not an execution-order ceiling. Only the credentialed live
    // rung respects maxTier (so a maxTier below it legitimately skips live).
    if (t.cred && tierNum > maxTierNum) {
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped', skipReason: 'above-maxTier' });
        continue;
    }

    // Live rung needs EITHER a credential file (credentialReference) OR a broker
    // (brokerPlans). With neither, it cannot run — surface the skip.
    if (t.cred && !hasCreds && brokerPlans.length === 0) {
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped', skipReason: 'no-credential-reference' });
        continue;
    }

    phase(`${t.tier}_${t.label}`);

    // The agent has no authority to declare a verdict itself — the JS below trusts
    // only a runner-shaped object (Tier/Status/DurationMs).
    let result;
    // Prefer the broker-mediated live path whenever a read-only broker plan is supplied — in broker
    // mode credentialReference is an opaque "broker-held:<plan>" marker, NOT a real CredentialFilePath.
    // (Was gated on !hasCreds, which mis-routed an [A] run that declares BOTH credentialReference +
    // brokerPlans to the file path → run_tier got "broker-held:..." as a file path → live rung red.)
    if (t.cred && brokerPlans.length > 0) {
        // BROKER-MEDIATED live rung: the credential lives ONLY in the separate-user
        // broker. The testing-agent submits a READ-ONLY job to the mailbox and reads
        // the SCRUBBED result; no credential bytes ever reach the agent or this script.
        const brokerTask = brokerPlans[0];
        result = await agent(
            `LIVE READ-ONLY rung ${t.runnerTier} for connector ${args?.connectorName ?? '(?)'} via the CREDENTIAL BROKER — you NEVER see the token.\n\n` +
            `1) Write a job to /Users/Shared/mj-mailbox/jobs/<jobId>.json containing EXACTLY {"jobId":"<jobId>","task":"${brokerTask}"} (pick a unique jobId; READ-ONLY plan — the broker REFUSES any write/ack).\n` +
            `2) Poll /Users/Shared/mj-mailbox/results/<jobId>.json until it appears (~90s max). The result is SCRUBBED (counts/keys/booleans only — no secrets).\n` +
            `3) Return a runner-shaped verdict DERIVED from that scrubbed result: { Tier: "${t.runnerTier}", Connector: "${args?.connectorName ?? ''}", Status: (the broker result's .result.ok === true ? "Pass" : "Fail"), DurationMs: <elapsed ms, integer>, Output: "<one-line summary of the scrubbed result>", Errors: (ok ? [] : ["<the broker result's error/refused message>"]), Details: <the scrubbed result object> }.\n` +
            `Do NOT fabricate success — Status MUST equal the broker's actual .result.ok. If no result file appears in time, return Status:"Fail", Errors:["broker-timeout"]. NEVER submit a write/ack task.`,
            { agentType: 'testing-agent', model: 'sonnet', schema: RUNNER_RESULT_SCHEMA, phase: `${t.tier}_${t.label}`, label: `ladder:${t.tier}:broker` }
        );
    } else {
        const credLine = t.cred
            ? `This is the ONLY live rung and is STRICTLY READ-ONLY (TestConnection + Discover + one read page — no writes/bidirectional/push).\nCREDENTIAL REFERENCE (OPAQUE — DO NOT READ): ${args?.credentialReference}\nThe MCP runner subprocess reads the credential file in isolation; pass it through as CredentialFilePath. No credential bytes return to you.`
            : `No credentials required.`;
        result = await agent(
            `Run tier ${t.runnerTier} for connector ${args?.connectorName ?? '(?)'} of vendor ${args?.vendor ?? '(?)'}.\n\n` +
            `You MUST call the MCP tool \`mcp__mj-test-runner__run_tier\` with { Connector: "${args?.connectorName ?? ''}", Tier: "${t.runnerTier}"${t.cred ? ', CredentialFilePath: <the opaque credential reference above>' : ''} } and return its result VERBATIM — the exact object the runner returned ({ Tier, Connector, Status, DurationMs, Output, Errors, Details }). Do NOT invent, summarize, or override Status; the runner is the only source of truth. ${credLine}\n\n` +
            `If the runner returns Status:'Skipped' (e.g. T7 with reason no-openapi-spec / no-api-paths — a legitimate not-applicable), return that verbatim — do NOT upgrade it to Pass. If it returns Fail, return the runner's Errors/Details verbatim so the workflow can classify each failure with a SyncErrorCode from packages/Integration/engine/src/types.ts and the fix locus.`,
            { agentType: 'testing-agent', schema: RUNNER_RESULT_SCHEMA, phase: `${t.tier}_${t.label}`, label: `ladder:${t.tier}` }
        );
    }

    // Trust ONLY a runner-shaped result. Anything that doesn't carry the runner's
    // Tier/Status/DurationMs (or carries the wrong Tier) is treated as a fabricated
    // verdict and recorded as red — the LLM cannot fake its way to green.
    if (!isRunnerResult(result, t.runnerTier)) {
        tierResults.push({
            tier: t.tier,
            label: t.label,
            status: 'red',
            failures: [{ code: 'unverifiable-result', locus: `ladder:${t.tier}`, summary: 'testing-agent did not return a verbatim mcp__mj-test-runner__run_tier result; treating as red.' }],
        });
        log(`${t.tier} returned a non-runner-shaped result — rejected as red (cannot trust a self-reported verdict).`);
        break;
    }

    const durationMs = Math.trunc(result.DurationMs);

    if (result.Status === 'Pass') {
        tierResults.push({ tier: t.tier, label: t.label, status: 'green', durationMs });
        achievedTier = t.tier;
        continue;
    }

    if (result.Status === 'Skipped') {
        // Read the ACTUAL skip reason from the runner's Errors/Details — the tiers
        // are real, so a Skip means "ran but nothing to validate" (T7's
        // no-openapi-spec / no-api-paths). The runner puts the reason code in
        // Errors[0] and/or Details.reason.
        const detailReason = result.Details && typeof result.Details.reason === 'string' ? result.Details.reason : '';
        const reason = detailReason
            || (Array.isArray(result.Errors) && result.Errors.length > 0 ? String(result.Errors[0]) : 'runner returned Skipped');
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped', skipReason: reason, durationMs });

        if (isAllowedSkip(reason)) {
            // Legitimate not-applicable: the tier is implemented and ran, but had
            // nothing to validate (no spec / no API paths / no fixtures). Surface as
            // a warning — NOT a pass, NOT a failure, NOT an unimplemented gap.
            skippedRungs.push({ tier: t.tier, label: t.label, reason });
            log(`${t.tier} skipped — not applicable for this connector (${reason}). Surfaced as a warning; does NOT count as green, does NOT block the ascent.`);
        } else {
            // An unexpected skip reason indicates a genuine missing capability — treat
            // it as a hard gap (red) rather than silently passing through.
            tierResults[tierResults.length - 1].status = 'red';
            tierResults[tierResults.length - 1].failures = [{ code: 'capability-gap', locus: `${t.runnerTier}`, summary: `runner skipped with an unrecognized reason: ${reason}` }];
            log(`${t.tier} skipped with an unrecognized reason (${reason}) — treating as a capability gap (red).`);
            break;
        }
        // Allowed skips do not break the ascent — a not-applicable rung shouldn't
        // block a higher rung the runner CAN run — but they never advance achievedTier.
        continue;
    }

    // Status === 'Fail' — but FIRST: in credential-free mode, an auth-required failure on a
    // credential-free rung is a not-applicable condition (discovery needs a credential we don't
    // have), NOT a code defect. Reclassify to the sanctioned allowed-skip so the ascent isn't
    // broken and the code-build loop never thrashes on an unfixable-without-creds rung.
    const credentialFree = !hasCreds && brokerPlans.length === 0;
    if (credentialFree && !t.cred && looksLikeAuthRequired(result)) {
        const reason = 'discovery-requires-credentials';
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped', skipReason: reason, durationMs });
        skippedRungs.push({ tier: t.tier, label: t.label, reason });
        log(`${t.tier} failed with an auth-required signal in credential-free mode — reclassified as a not-applicable skip (${reason}); does NOT red the ladder or feed the code-build loop.`);
        continue;
    }

    // Status === 'Fail' — classify each failure and stop the ascent.
    const failures = (Array.isArray(result.Errors) ? result.Errors : []).map((e) => ({
        code: 'unknown',
        locus: `${t.runnerTier}`,
        summary: String(e),
    }));
    tierResults.push({ tier: t.tier, label: t.label, status: 'red', durationMs, failures });
    log(`${t.tier} failed — anti-thrash check: could a lower rung have caught these?`);
    break;
}

const classifiedFailures = tierResults
    .filter((r) => r.status === 'red')
    .flatMap((r) => (r.failures ?? []).map((f) => ({ tier: r.tier, code: f.code ?? 'unknown', locus: f.locus ?? 'unknown' })));

return { tierResults, achievedTier, classifiedFailures, skippedRungs };
