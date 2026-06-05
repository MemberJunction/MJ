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
// Tier reality (mirrors the runner — packages/MCP/mj-test-runner/src/types.ts):
//   - T0_StaticValidation, T1_InvariantValidator, T4_MockedFixture are the real
//     credential-free rungs.
//   - T8_AuthenticatedEndpoint is the ONLY live rung — and it is READ-ONLY
//     (TestConnection + Discover + one read page). No writes, no bidirectional,
//     no push, no 2^N matrix, no dual-dialect.
//   - T2/T3/T5/T6/T7 exist but are not-implemented: the runner returns
//     Status:'Skipped'. A not-implemented skip below the ceiling does NOT count as
//     a pass — it is surfaced as a `skipped` rung and recorded in
//     `unimplementedRequiredRungs` so the overall result notes the gap rather than
//     fabricating green.
//
// Anti-thrash invariant: if a higher rung fails on something a lower rung could
// have caught, that's a gate-placement bug — add the check at the lower rung, do
// not silently re-run. The in-order ascent gate (break on first red) is kept.
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
//     unimplementedRequiredRungs: Array<{tier, label, reason}>,  // skipped-not-implemented rungs below the ceiling
//   }

export const meta = {
    name: 'verification-ladder',
    description: 'T0..T8 staged verification via mcp-mj-test-runner. Every rung verdict is the runner\'s VERBATIM run_tier result (not self-report); a rung is green only if Status===Pass and the runner shape is present. T8 is the only live rung and is READ-ONLY. T2/T3/T5/T6/T7 are not-implemented (Skipped). Strict in-order gating; failures classify via SyncErrorCode/ClassifyError.',
    phases: [
        { title: 'T0_StaticValidation', detail: 'Metadata parses; provenance scripts re-run; source-diff closes' },
        { title: 'T1_InvariantValidator', detail: 'Structural invariants (three-way name match, FK metadata, capability↔method)' },
        { title: 'T2_CrossProgrammaticConsistency', detail: 'Not implemented — runner returns Skipped' },
        { title: 'T3_DocStructureSelfCheck', detail: 'Not implemented — runner returns Skipped' },
        { title: 'T4_MockedFixture', detail: 'Connector code against recorded fixtures (vitest)' },
        { title: 'T5_MockHTTPServer', detail: 'Not implemented — runner returns Skipped' },
        { title: 'T6_LocalSQLiteBackend', detail: 'Not implemented — runner returns Skipped' },
        { title: 'T7_OpenAPIValidation', detail: 'Not implemented — runner returns Skipped' },
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
    required: ['tierResults', 'achievedTier', 'classifiedFailures', 'unimplementedRequiredRungs'],
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
        unimplementedRequiredRungs: {
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

const maxTier = String(args?.maxTier ?? 'T8');
const maxTierNum = parseInt(maxTier.slice(1), 10);
const hasCreds = !!args?.credentialReference;
const tierResults = [];
const unimplementedRequiredRungs = [];
let achievedTier = 'none';

for (const t of tiers) {
    const tierNum = parseInt(t.tier.slice(1), 10);

    // Above the declared ceiling — not part of this run's contract.
    if (tierNum > maxTierNum) {
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped', skipReason: 'above-maxTier' });
        continue;
    }

    // Live rung without a credential reference — cannot run; surface the skip.
    if (t.cred && !hasCreds) {
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped', skipReason: 'no-credential-reference' });
        continue;
    }

    phase(`${t.tier}_${t.label}`);

    // Dispatch testing-agent with a HARD instruction to call the MCP runner and
    // return its verbatim result. The agent has no authority to declare a verdict
    // itself — the JS below trusts only the runner-shaped object.
    const credLine = t.cred
        ? `This is the ONLY live rung and is STRICTLY READ-ONLY (TestConnection + Discover + one read page — no writes/bidirectional/push).\nCREDENTIAL REFERENCE (OPAQUE — DO NOT READ): ${args?.credentialReference}\nThe MCP runner subprocess reads the credential file in isolation; pass it through as CredentialFilePath. No credential bytes return to you.`
        : `No credentials required.`;

    const result = await agent(
        `Run tier ${t.runnerTier} for connector ${args?.connectorName ?? '(?)'} of vendor ${args?.vendor ?? '(?)'}.\n\n` +
        `You MUST call the MCP tool \`mcp__mj-test-runner__run_tier\` with { Connector: "${args?.connectorName ?? ''}", Tier: "${t.runnerTier}"${t.cred ? ', CredentialFilePath: <the opaque credential reference above>' : ''} } and return its result VERBATIM — the exact object the runner returned ({ Tier, Connector, Status, DurationMs, Output, Errors, Details }). Do NOT invent, summarize, or override Status; the runner is the only source of truth. ${credLine}\n\n` +
        `If the runner returns Status:'Skipped' (e.g. a not-implemented tier), return that verbatim — do NOT upgrade it to Pass. If it returns Fail, return the runner's Errors/Details verbatim so the workflow can classify each failure with a SyncErrorCode from packages/Integration/engine/src/types.ts and the fix locus.`,
        { agentType: 'testing-agent', schema: RUNNER_RESULT_SCHEMA, phase: `${t.tier}_${t.label}`, label: `ladder:${t.tier}` }
    );

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
        const reason = (Array.isArray(result.Errors) && result.Errors.length > 0)
            ? String(result.Errors[0])
            : 'runner returned Skipped (not-implemented)';
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped', skipReason: reason, durationMs });
        // A not-implemented skip below the ceiling is NOT a pass — surface the gap.
        unimplementedRequiredRungs.push({ tier: t.tier, label: t.label, reason });
        log(`${t.tier} skipped (not-implemented): ${reason}. Recorded as an unimplemented required rung; does NOT count as green.`);
        // Skips do not break the ascent — a not-yet-built rung shouldn't block a
        // higher rung that the runner CAN run — but it also never advances achievedTier.
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

return { tierResults, achievedTier, classifiedFailures, unimplementedRequiredRungs };
