// LOCKED PRIMITIVE — verification-ladder
//
// Guarantee: 13-tier ladder (T0..T12). Cannot ascend without lower rungs green.
// Failures classify via `SyncErrorCode` enum + `ClassifyError` from
// `packages/Integration/engine/src/types.ts`. Anti-thrash invariant: if a higher
// rung fails on something a lower rung could have caught, that's a gate-placement
// bug — add the check at the lower rung, do not silently re-run.
//
// Credential safety: T10 + T11 are the ONLY rungs needing credentials. They run
// through `@memberjunction/mcp-mj-test-runner` MCP — agent passes opaque
// credential path; MCP subprocess reads in isolation; results return without
// credential bytes entering this conversation. PII safety enforced by
// scrub-fixture at the result boundary.
//
// Inputs:
//   {
//     vendor: string,
//     connectorName: string,
//     manifest: object,                     // minimumThoroughnessManifest
//     credentialReference?: string,         // opaque path; never read by this workflow
//     maxTier?: 'T0' | ... | 'T12',         // realistic ceiling
//   }
//
// Output:
//   {
//     tierResults: Array<{tier, label, status: 'green'|'red'|'skipped', failures?: any[]}>,
//     achievedTier: string,                 // highest green rung
//     classifiedFailures: Array<{tier, code, locus}>,
//   }

export const meta = {
    name: 'verification-ladder',
    description: 'T0..T12 staged verification via mcp-mj-test-runner. Strict gating; failures classify via SyncErrorCode/ClassifyError. T10+T11 are the only credential-required rungs.',
    phases: [
        { title: 'T0_StaticValidation', detail: 'Metadata parses; provenance scripts re-run; source-diff closes' },
        { title: 'T1_InvariantValidator', detail: 'Structural invariants formerly in connector-validator' },
        { title: 'T2_CrossProgrammaticConsistency', detail: 'Multiple extraction scripts agree' },
        { title: 'T3_DocStructureSelfCheck', detail: 'Scrape-pattern reproduces' },
        { title: 'T4_MockedFixture', detail: 'Connector code against recorded fixtures' },
        { title: 'T5_MockHTTPServer', detail: 'Connector against local HTTP server emulating vendor' },
        { title: 'T6_LocalSQLiteBackend', detail: 'Sync run against local SQLite MJ backend' },
        { title: 'T7_OpenAPIValidation', detail: 'Request/response validated against OpenAPI (when present)' },
        { title: 'T8_FailureModeInjection', detail: '429/500/timeout/bad-JSON injection' },
        { title: 'T9_PropertyBasedFuzz', detail: 'Random valid/invalid input fuzzing' },
        { title: 'T10_LiveAPIIntegration', detail: 'Real vendor calls via mj-test-runner with creds' },
        { title: 'T11_SDKDifferential', detail: 'Official SDK vs our connector; assert match' },
        { title: 'T12_CommunityFixtures', detail: 'Optional supplemental confidence' },
    ],
};

const TIER_RESULT_SCHEMA = {
    type: 'object',
    required: ['tier', 'label', 'status'],
    properties: {
        tier: { type: 'string' },
        label: { type: 'string' },
        status: { enum: ['green', 'red', 'skipped'] },
        failures: { type: 'array' },
        durationMs: { type: 'integer' },
        // T10/T11 only: the ordered live-e2e phase evidence (§1→§7 of the canonical
        // test plan). Each entry records one phase/sub-phase/cell the harness ran, in
        // order, with the dual NL+JSON+pass/fail evidence floor-check enforces against
        // `e2eLivePhases` in floor/phase0-slots.json. `dialect` distinguishes the
        // mandatory SQL Server vs Postgres runs (§7).
        livePhaseLog: {
            type: 'array',
            items: {
                type: 'object',
                required: ['phaseId', 'order', 'status'],
                properties: {
                    phaseId: { type: 'string' },     // e.g. 'E2E.PhaseB.3_1'
                    order: { type: 'integer' },      // matches e2eLivePhases declared order
                    dialect: { enum: ['sqlserver', 'postgres'] },
                    nl: { type: 'string' },          // natural-language statement of what was tested + result
                    json: {},                        // scrubbed IntegrationGetRun / DB counts / progress.jsonl evidence
                    status: { enum: ['pass', 'fail', 'skip'] },
                    skipReason: { type: 'string' },  // REQUIRED when status==='skip' (no silent omission)
                },
            },
        },
    },
};

const LADDER_RESULT_SCHEMA = {
    type: 'object',
    required: ['tierResults', 'achievedTier', 'classifiedFailures'],
    properties: {
        tierResults: { type: 'array', items: TIER_RESULT_SCHEMA },
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
    },
    additionalProperties: false,
};

const tiers = [
    { tier: 'T0', label: 'StaticValidation', cred: false },
    { tier: 'T1', label: 'InvariantValidator', cred: false },
    { tier: 'T2', label: 'CrossProgrammaticConsistency', cred: false },
    { tier: 'T3', label: 'DocStructureSelfCheck', cred: false },
    { tier: 'T4', label: 'MockedFixture', cred: false },
    { tier: 'T5', label: 'MockHTTPServer', cred: false },
    { tier: 'T6', label: 'LocalSQLiteBackend', cred: false },
    { tier: 'T7', label: 'OpenAPIValidation', cred: false },
    { tier: 'T8', label: 'FailureModeInjection', cred: false },
    { tier: 'T9', label: 'PropertyBasedFuzz', cred: false },
    { tier: 'T10', label: 'LiveAPIIntegration', cred: true },
    { tier: 'T11', label: 'SDKDifferential', cred: true },
    { tier: 'T12', label: 'CommunityFixtures', cred: false },
];

const maxTier = String(args?.maxTier ?? 'T12');
const hasCreds = !!args?.credentialReference;
const tierResults = [];
let achievedTier = 'none';

for (const t of tiers) {
    if (parseInt(t.tier.slice(1), 10) > parseInt(maxTier.slice(1), 10)) {
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped' });
        continue;
    }
    if (t.cred && !hasCreds) {
        tierResults.push({ tier: t.tier, label: t.label, status: 'skipped' });
        continue;
    }
    phase(`${t.tier}_${t.label}`);
    const result = await agent(
        `Run ${t.tier} (${t.label}) for connector ${args?.connectorName ?? '(?)'} of vendor ${args?.vendor ?? '(?)'}.\n${t.cred ? `CREDENTIAL REFERENCE (OPAQUE; DO NOT READ): ${args?.credentialReference}\nInvoke via mcp-mj-test-runner; subprocess reads credential bytes; results return without them.\n\nHARD CONTRACT — this is the live-e2e tier: drive the connector through the live e2e harness running the ORDERED §1→§7 phase skeleton declared in floor/phase0-slots.json \`e2eLivePhases\` VERBATIM and IN ORDER (env bring-up → Phase A → Phase B 2^N matrix [3.1→3.8] → Phase C → §5 generation-action/agents → §6 observability → §7 dual-dialect SQL Server THEN Postgres). Run the APPLICABLE subset for this connector's capabilities; any skipped phase/cell MUST carry a logged \`skipReason\`. Return \`livePhaseLog\`: one entry per phase/sub-phase/cell you ran (and per dialect for dualDialect phases) = { phaseId, order, dialect, nl, json, status:'pass'|'fail'|'skip', skipReason? }, with NL + JSON + explicit pass/fail per §6. floor-check rejects the run if any applicable phase is missing, reordered, unevidenced, silently-skipped, or proven on only one dialect.` : 'No credentials required.'}\n\nReturn { tier, label, status: 'green'|'red', failures?${t.cred ? ', livePhaseLog' : ''} }. On red, classify each failure with a SyncErrorCode from packages/Integration/engine/src/types.ts and the fix locus.`,
        // testing-agent owns the read-only ladder runs.
        { agentType: 'testing-agent', schema: TIER_RESULT_SCHEMA, phase: `${t.tier}_${t.label}`, label: `ladder:${t.tier}` }
    );
    tierResults.push(result);
    if (result.status === 'red') {
        log(`${t.tier} failed — anti-thrash check: could a lower rung have caught these?`);
        break;
    }
    achievedTier = t.tier;
}

const classifiedFailures = tierResults
    .filter(r => r.status === 'red')
    .flatMap(r => (r.failures ?? []).map(f => ({ tier: r.tier, code: f.code ?? 'unknown', locus: f.locus ?? 'unknown' })));

return { tierResults, achievedTier, classifiedFailures };
