// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVE: hybrid-e2e
//
// Guarantee: a connector is proven through the REAL MJ engine into a REAL SQL Server
// DB — ApplyAll → sync → upsert → contentHash → incremental → delta-CRUD → idempotent
// (credential-free MOCK mode), and (when broker creds exist) the live vendor read path.
// This is the §1→§7 deep e2e the T0..T8 ladder does NOT cover (the ladder only exercises
// the connector class in isolation; this exercises it through MJAPI + a database).
//
// ⚠ THE ENV BRING-UP IS FULLY SCRIPTED — THE AGENT MUST NOT GUESS.
// Every step + every failure-mode fix is in:
//   packages/Integration/connectors/test/HYBRID_E2E_ENV_RUNBOOK.md   (the recipe)
//   packages/Integration/connectors/test/CONNECTOR_E2E.md            (the e2e contract)
// The ONLY assumption is: the Docker daemon is up. Everything else (SQL Server container,
// repo build, MJAPI manifest, advancedGen-off, tsx launch, Company creation, coords) is
// brought up by the runbook. This primitive hands the agent the runbook and the verbatim
// commands; the agent executes them in order and returns the runner's scrubbed result.
//
// Note: the §1→§7 env bring-up runs on SQL Server (the connectors-registry SS-primary
// dialect). Postgres fresh-DB codegen is suspended pending the PG-baseline fix.
//
// Args:
//   { runID, vendor, connectorName, integrationName, mode?: 'mock'|'live',
//     credentialReference?, brokerPlans? }
// Returns:
//   { pass, mode, steps, livePhaseLog, failures }
// ─────────────────────────────────────────────────────────────────────────────

export const meta = {
    name: 'hybrid-e2e',
    description: 'Deep §1→§7 e2e: stand up a SQL Server MJAPI (per HYBRID_E2E_ENV_RUNBOOK.md — no guessing) and run connector-e2e (mock floor, live when broker creds) → assert ApplyAll/upsert/contentHash/incremental/delta-CRUD/idempotent by SQL Server rowcounts. Outcome-asserted, not status-asserted.',
    phases: [
        { title: 'EnvBringUp', detail: 'Docker SQL Server container + turbo build + local-CLI manifest + advancedGen-off + tsx MJAPI on :4007 (runbook steps 0-5)' },
        { title: 'E2EMock', detail: 'connector-e2e mock mode on SQL Server — real engine, rowcount-asserted (runbook step 6)' },
        { title: 'E2ELive', detail: 'connector-e2e live mode via broker (read-only) when creds present (runbook step 6-live)' },
        { title: 'Teardown', detail: 'kill the :4007 MJAPI (runbook step 7)' },
    ],
};

const RUN_ID = args?.runID ?? 'unknown';
const VENDOR = args?.vendor ?? 'unknown';
const CONNECTOR = args?.connectorName ?? VENDOR;
const INTEGRATION = args?.integrationName ?? VENDOR;
const MODE = args?.mode === 'live' ? 'live' : 'mock';
const HAS_BROKER_CREDS = !!args?.credentialReference;
const RUNBOOK = 'packages/Integration/connectors/test/HYBRID_E2E_ENV_RUNBOOK.md';

const E2E_RESULT_SCHEMA = {
    type: 'object',
    required: ['ok', 'phaseId', 'status'],
    properties: {
        ok: { type: 'boolean' },
        phaseId: { type: 'string' },
        status: { type: 'string', enum: ['pass', 'fail', 'skip'] },
        skipReason: { type: 'string' },
        // The connector-e2e scrubbed steps result (setup/forward/delta/idempotent/teardown).
        steps: { type: 'object' },
        // Per-phase NL + JSON evidence the floor reads (§6 observability contract).
        nl: { type: 'string' },
        assertions: {
            type: 'object',
            properties: {
                applyAllRan: { type: 'boolean' },
                forwardCompleteness: { type: 'boolean' },   // rowcounts match, no drops/dupes
                incrementalNarrowed: { type: 'boolean' },    // 2nd pass did less work
                contentHashSkipped: { type: 'boolean' },     // unchanged rows skipped
                deltaApplied: { type: 'boolean' },           // create/update/delete (mock)
                idempotentZeroWork: { type: 'boolean' },     // 2nd sync = 0 row delta
                // ── LIVE full-creation-pipeline assertions (mandatory when broker creds exist) ──
                instanceCreated: { type: 'boolean' },        // CompanyIntegration row created (only keys+company manual)
                connectionTested: { type: 'boolean' },       // TestConnection passed with the real broker credential
                discoveryAddedObjects: { type: 'boolean' },  // schema-refresh surfaced IO/IOF (DiscoverObjects/Fields ran, incl. new beyond declared)
                pkClassifierRan: { type: 'boolean' },        // SoftPKClassifier cascade ran; LLM last-resort tier fired for residual PK-less objects when a key was present
                entitiesRegistered: { type: 'boolean' },     // ApplyAll registered entity maps/entities on SQL Server
                syncLandedRows: { type: 'boolean' },         // sync landed rows (GetRun rowcounts > 0, forward-complete)
            },
        },
        failures: { type: 'array', items: { type: 'object' } },
        mjapiPort: { type: 'integer' },
    },
};

// ── Shared env bring-up (runbook steps 0→5) — reused by both modes. ──────────
const ENV_BRINGUP =
    `⚠ DO NOT GUESS ANY STEP. Read ${RUNBOOK} and execute its env bring-up (steps 0→5) VERBATIM, in order. It captures every gotcha. The ONLY assumption is the Docker daemon is up. Invariants:\n` +
    `  • Launch MJAPI via tsx (node_modules/.bin/tsx), NEVER ts-node / npm run start (broken on Node 24).\n` +
    `  • ERR_MODULE_NOT_FOUND on launch → \`npx turbo build\` then retry.\n` +
    `  • MJAPI manifest via the LOCAL CLI: node packages/MJCLI/bin/run.js codegen manifest --exclude-packages @memberjunction --appDir ./packages/MJAPI --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts (global mj may be stale).\n` +
    `  • DB_* = SQL Server coords + DB_PLATFORM=sqlserver; generate MJ_BASE_ENCRYPTION_KEY; MJAPI on :4007. A non-fatal EADDRINUSE for the secondary instance-B/WS port is OK if GraphQL on :4007 answers.\n` +
    `  • advancedGeneration.enableAdvancedGeneration=false in mj.config.cjs before launch.\n`;

// ── EnvBringUp + the MANDATORY run for this mode. ────────────────────────────
// When a broker credential exists, the LIVE FULL-CREATION-PIPELINE is the mandatory
// path (create instance → discover → PK-classify incl. last-resort LLM → ApplyAll → sync),
// with ONLY the credential keys + the Company as manual inputs. The credential-free MOCK
// floor (which needs authored fixtures) is the FALLBACK used only when no broker cred exists.
phase('EnvBringUp');
let primaryResult;

if (HAS_BROKER_CREDS) {
    phase('E2ELive');
    primaryResult = await agent(
        `Run the hybrid e2e for connector "${CONNECTOR}" (vendor ${VENDOR}, integration "${INTEGRATION}") in LIVE FULL-CREATION-PIPELINE mode on SQL Server. This is the MANDATORY path (a broker credential is present).\n\n` +
        ENV_BRINGUP +
        `\nThen run the FULL creation pipeline through MJAPI via the broker (${RUNBOOK} step 6-live; task 'connector-e2e-live' so the vendor token NEVER enters your context; broker plans: ${JSON.stringify(args?.brokerPlans ?? [])}). The ONLY manual inputs are the credential keys (via broker) + the Company; EVERYTHING below is automatic, mirroring the gql-live-harness flow:\n` +
        `  1. create a Company → IntegrationCreateConnection(testConnection:true, runSchemaRefresh:true): creates the CompanyIntegration instance, wires the broker-encrypted credential, tests the connection, and runs schema-refresh DISCOVERY (DiscoverObjects/DiscoverFields incl. objects/fields beyond declared; SoftPKClassifier runs, incl. its last-resort LLM tier for residual PK-less objects WHEN an AI model+key are configured — no key → deterministic-only, which is acceptable).\n` +
        `  2. IntegrationApplyAll(platform:'sqlserver'): registers entity maps + entities on SQL Server.\n` +
        `  3. IntegrationStartSync → tail to completion → IntegrationGetRun: assert by REAL SQL Server rowcounts. Vendor side STRICTLY read-only (never ack/write).\n\n` +
        `ASSERT OUTCOMES (set assertions.*): instanceCreated (CompanyIntegrationID returned), connectionTested (ConnectionTestSuccess), discoveryAddedObjects (schema-refresh ObjectsCreated/FieldsCreated > 0), pkClassifierRan (PK verdicts present for discovered objects; LLM tier fired for residual PK-less objects when a key was configured), entitiesRegistered (ApplyAll EntityMaps > 0), syncLandedRows (GetRun landed rowcounts > 0), forwardCompleteness (DB rowcounts match source, no drops/dupes), idempotentZeroWork (2nd sync 0 row delta). status='pass' ONLY if instanceCreated AND connectionTested AND discoveryAddedObjects AND entitiesRegistered AND syncLandedRows AND forwardCompleteness AND idempotentZeroWork. Return phaseId='E2E.Hybrid.Live', the scrubbed steps VERBATIM in steps, a plain-English nl summary, and mjapiPort.`,
        { agentType: 'testing-agent', schema: E2E_RESULT_SCHEMA, phase: 'E2ELive', label: `hybrid-live:${VENDOR}` }
    );
} else {
    phase('E2EMock');
    log('hybrid-e2e: no broker credentialReference → CREDENTIAL-FREE MOCK floor (the lower ceiling). This is a loud, honest fallback, not a substitute for live proof.');
    primaryResult = await agent(
        `Run the hybrid e2e for connector "${CONNECTOR}" (vendor ${VENDOR}, integration "${INTEGRATION}") in MOCK mode on SQL Server — the CREDENTIAL-FREE fallback (no broker credential available).\n\n` +
        ENV_BRINGUP +
        `\nThen run connector-e2e (${RUNBOOK} step 6, MOCK mode, E2E_PLATFORM=sqlserver). MOCK mode needs CORRECT fixtures at packages/Integration/connectors/test/fixtures/${VENDOR}/fixtures/fixtures.json for the SHIPPED connector shape (config-driven base-URL connectors → ORIGIN mode: Transport:http, ConfigUrlKey=<the config key>, Routes mirroring the connector's real endpoints, Objects, DeltaPasses). If fixtures are missing or are a STALE different-shape scaffold, AUTHOR correct ones first (see CONNECTOR_E2E.md). Never reuse stale fixtures.\n\n` +
        `ASSERT OUTCOMES: applyAllRan (dest tables created), forwardCompleteness (rowcounts match source, no drops/dupes), incrementalNarrowed, contentHashSkipped, deltaApplied, idempotentZeroWork. status='pass' ONLY if applyAllRan AND forwardCompleteness AND idempotentZeroWork hold. Return scrubbed steps VERBATIM in steps, a plain-English nl summary, phaseId='E2E.Hybrid.Mock', and mjapiPort.`,
        { agentType: 'testing-agent', schema: E2E_RESULT_SCHEMA, phase: 'E2EMock', label: `hybrid-mock:${VENDOR}` }
    );
}

// ── Teardown ─────────────────────────────────────────────────────────────────
phase('Teardown');
await agent(
    `Tear down the hybrid-e2e env per ${RUNBOOK} step 7: \`lsof -nP -iTCP:4007 -sTCP:LISTEN -t | xargs -r kill 2>/dev/null\` to stop the :4007 SQL Server MJAPI. Leave the sql-claude container running (cheap). Return { ToreDown: true }.`,
    { agentType: 'testing-agent', schema: { type: 'object', required: ['ToreDown'], properties: { ToreDown: { type: 'boolean' } } }, phase: 'Teardown', label: `hybrid-teardown:${VENDOR}` }
);

// ── JS verdict — the required assertion set depends on the mode that ran. ─────
const failures = [];
const a = primaryResult?.assertions ?? {};
if (primaryResult?.status !== 'pass') {
    failures.push({ rule: HAS_BROKER_CREDS ? 'hybrid-live-not-pass' : 'hybrid-mock-not-pass', detail: `${HAS_BROKER_CREDS ? 'live' : 'mock'} e2e status=${primaryResult?.status}; ${JSON.stringify(primaryResult?.failures ?? [])}` });
}
if (HAS_BROKER_CREDS) {
    // LIVE full-creation-pipeline is mandatory — assert the full create→discover→apply→sync set.
    if (a.instanceCreated === false) failures.push({ rule: 'instance-not-created', detail: 'CompanyIntegration instance not created' });
    if (a.connectionTested === false) failures.push({ rule: 'connection-not-tested', detail: 'TestConnection did not pass with the real credential' });
    if (a.discoveryAddedObjects === false) failures.push({ rule: 'discovery-added-nothing', detail: 'schema-refresh discovery surfaced no IO/IOF' });
    if (a.entitiesRegistered === false) failures.push({ rule: 'entities-not-registered', detail: 'ApplyAll registered no entity maps/entities on SQL Server' });
    if (a.syncLandedRows === false) failures.push({ rule: 'sync-landed-nothing', detail: 'sync landed zero rows' });
    if (a.forwardCompleteness === false) failures.push({ rule: 'forward-incomplete', detail: 'DB rowcounts did not match source (drops/dupes)' });
    if (a.idempotentZeroWork === false) failures.push({ rule: 'not-idempotent', detail: '2nd sync over unchanged data did non-zero work' });
} else {
    // CREDENTIAL-FREE mock floor (lower ceiling).
    if (a.applyAllRan === false) failures.push({ rule: 'apply-all-did-not-run', detail: 'dest tables not created by ApplyAll' });
    if (a.forwardCompleteness === false) failures.push({ rule: 'forward-incomplete', detail: 'rowcounts did not match source (drops/dupes)' });
    if (a.idempotentZeroWork === false) failures.push({ rule: 'not-idempotent', detail: '2nd sync over unchanged data did non-zero work' });
}

// livePhaseLog: the mode that ran is the real evidence; the other is a loud skip.
const livePhaseLog = HAS_BROKER_CREDS
    ? [
        { phaseId: 'E2E.Hybrid.Mock', order: 0, dialect: 'sqlserver', nl: 'mock floor skipped — broker credential present, live full-creation-pipeline used instead', json: {}, status: 'skip', skipReason: 'broker-credential-present-live-path-mandatory' },
        { phaseId: 'E2E.Hybrid.Live', order: 1, dialect: 'sqlserver', nl: primaryResult?.nl ?? '', json: primaryResult?.steps ?? {}, status: primaryResult?.status ?? 'fail' },
      ]
    : [
        { phaseId: 'E2E.Hybrid.Mock', order: 0, dialect: 'sqlserver', nl: primaryResult?.nl ?? '', json: primaryResult?.steps ?? {}, status: primaryResult?.status ?? 'fail' },
        { phaseId: 'E2E.Hybrid.Live', order: 1, dialect: 'sqlserver', nl: 'live mode skipped — no broker credentialReference', json: {}, status: 'skip', skipReason: 'no-broker-credential' },
      ];

const pass = failures.length === 0;
log(`hybrid-e2e: pass=${pass} mode=${HAS_BROKER_CREDS ? 'live-full-pipeline' : 'mock-floor'} status=${primaryResult?.status} failures=${failures.length}`);

return { pass, mode: HAS_BROKER_CREDS ? 'live' : 'mock', steps: primaryResult?.steps ?? {}, livePhaseLog, failures };
