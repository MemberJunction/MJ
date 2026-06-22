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
        { title: 'EnvBringUp', detail: 'Docker SQL Server container + turbo build + local-CLI manifest + advancedGen-off + tsx MJAPI on the caller dbProfile/mjapi coords (runbook steps 0-5)' },
        { title: 'E2EMock', detail: 'connector-e2e mock mode on SQL Server — real engine, rowcount-asserted (runbook step 6)' },
        { title: 'E2ELive', detail: 'connector-e2e live mode via broker (read-only) when creds present (runbook step 6-live)' },
        { title: 'Teardown', detail: 'kill THIS run\'s MJAPI port (runbook step 7)' },
    ],
};

// The Workflow runtime may deliver `args` as a JSON-encoded STRING (not an object);
// normalize so `A?.x` reads work whether args arrives as a string or an object.
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const RUN_ID = A?.runID ?? 'unknown';
const VENDOR = A?.vendor ?? 'unknown';
const CONNECTOR = A?.connectorName ?? VENDOR;
const INTEGRATION = A?.integrationName ?? VENDOR;
const MODE = A?.mode === 'live' ? 'live' : 'mock';
// B0 cred-gating reconciliation: the LIVE full-creation-pipeline runs whenever creds are
// reachable — EITHER an opaque credentialReference OR a read-only broker plan (the same
// signal the verification-ladder's live rung uses). This makes ONE caller config —
// `{ credentialReference:null, brokerPlans:['<vendor>-readonly'] }` — drive BOTH the ladder
// live rung AND this e2e live, so "creds present → tested live everywhere" holds.
const BROKER_PLANS = Array.isArray(A?.brokerPlans) ? A.brokerPlans : [];
const HAS_BROKER_CREDS = !!A?.credentialReference || BROKER_PLANS.length > 0;
// Connector-specific live-e2e job params — supplied via args so THIS primitive stays
// connector-AGNOSTIC (no hardcoded vendor object names / tenant IDs / cred key here).
//   e2eLiveConfig: non-secret Configuration JSON the connector needs (e.g. '{"AccountID":"2019"}')
//   e2eObjects:    comma-list of streams to sync (empty → all discovered; bound to a Goldilocks
//                  stream for a timely run rather than draining huge tables — see test conventions)
//   e2eTokenKey:   the credential key the connector reads (e.g. 'Token')
const E2E_LIVE_CONFIG = typeof A?.e2eLiveConfig === 'string' ? A.e2eLiveConfig : JSON.stringify(A?.e2eLiveConfig ?? {});
const E2E_OBJECTS = A?.e2eObjects ?? '';
const E2E_TOKEN_KEY = A?.e2eTokenKey ?? 'Token';
const RUNBOOK = 'packages/Integration/connectors/test/HYBRID_E2E_ENV_RUNBOOK.md';

// ── ISOLATED-INFRA OVERRIDES (backward-compatible) ───────────────────────────
// This primitive historically HARDCODED the HubSpot loop's coords (DB MJ_SS_E2E, MJAPI :4007,
// container sql-claude). When a caller runs on DEDICATED infra (e.g. a parallel overnight
// session with its own SQL container/port/DB), those hardcodes would CLOBBER the other session
// (DROP DATABASE MJ_SS_E2E, kill :4007). So the coords are now read from the args the caller
// already passes (dbProfile + mjapi); absent → the original HubSpot defaults (no behavior change
// for existing callers). EVERY hardcoded coord below is replaced by these.
const DBP = (A?.dbProfile && typeof A.dbProfile === 'object') ? A.dbProfile : {};
const DB_NAME = DBP.name ?? 'MJ_SS_E2E';
const DB_HOST = DBP.host ?? 'localhost';
const DB_PORT = DBP.port ?? 1433;
const DB_USER = DBP.user ?? 'sa';
const DB_CONTAINER = DBP.container ?? 'sql-claude';
const GQL_PORT = (A?.mjapi && typeof A.mjapi === 'object' && A.mjapi.graphqlPort) ? A.mjapi.graphqlPort : 4007;
const GQL_URL = `http://localhost:${GQL_PORT}/`;
// A dominant, explicit isolation banner the agent must honor OVER any coords in the runbook.
const ISOLATION_OVERRIDE =
    `\n🔒 ISOLATION OVERRIDE — NON-NEGOTIABLE. This run uses ONLY these coords; they OVERRIDE any host/port/DB/container in ${RUNBOOK}:\n` +
    `   • SQL Server: container '${DB_CONTAINER}', host ${DB_HOST}, port ${DB_PORT}, DB '${DB_NAME}', user ${DB_USER}.\n` +
    `   • MJAPI GraphQL: http://localhost:${GQL_PORT}/ (port ${GQL_PORT}).\n` +
    `   • If these differ from MJ_SS_E2E / :4007 / sql-claude, a CONCURRENT session owns those — you MUST NOT touch MJ_SS_E2E, port 4007, port 1444, or the sql-claude container in ANY way (no DROP, no kill, no connect). Substitute the coords above into every runbook step.\n`;

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
        // The per-connector LIFECYCLE matrix (birth→death) from the harness result.lifecycle[]. Each entry
        // {stage, status:'pass'|'fail'|'skip', skipReason?, failDetail?}. The deterministic gate below FAILS
        // the e2e if any applicable stage is 'fail' — the full-lifecycle floor for new connectors. Return it
        // VERBATIM from the harness result.lifecycle (Create/DiscoverObj/DiscoverFields/CustomCols/ApplyAll/
        // FullSync/Incremental/Merkle/WriteBack/Maintenance/Death).
        lifecycle: { type: 'array', items: { type: 'object', properties: {
            stage: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'skip'] },
            skipReason: { type: 'string' }, failDetail: { type: 'string' },
        } } },
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
                entityMapCount: { type: 'integer' },         // setup.mapCount (token-mode discovery+mapping). 0 ⇒ reference-mode/no-discovery ⇒ FAIL.
                rowsProcessed: { type: 'integer' },          // max GetRun Processed across objects on the FULL pull. 0 (source has data) ⇒ vacuous ⇒ FAIL.
                // ── B1–B6 hardening assertions ──
                runEventsParsed: { type: 'boolean' },         // B1: structured run-event stream parsed (checkpoint/pk/retry/warnings)
                customColumnsCaptured: { type: 'boolean' },   // B3: schema-refresh minted custom tables + custom columns (advisory if none)
                idempotentThreeSync: { type: 'boolean' },     // B4: full→incr1(narrows)→incr2(0 work), rowcounts stable across all three
                referenceModeWorks: { type: 'boolean' },      // B5: pre-seeded CompanyIntegrationID + encrypted cred path ("use, never read")
                rateLimitObserved: { type: 'boolean' },       // B6: retry/backoff events present + peak-concurrency vs MaxConcurrencyHint (advisory)
                // ── v2 OUTCOME assertions (ARCHITECTURE_REFACTOR.md P3/P5/P6 — floor-check gates) ──
                firstSyncComplete: { type: 'boolean' },       // every selected object reached its FULL rowcount on the FIRST pass (an object that fills only on a later pass = door-before-child ordering defect; GZ #21/#28 — second-sync self-heal is a FAIL)
                secondSyncGrew: { type: 'boolean' },          // TRUE if ANY table's rowcount GREW between the full pull and the idempotent re-run (non-idempotent identity; GZ #22: 127→254). Two-pass zero-growth is the gate.
                captureEngaged: { type: 'boolean' },          // __mj_integration_CustomOverflow EXISTS on every created table (DB-checked) AND capture wrote customs where the source carries them (GZ #29/#31 silent no-op class). null if unverifiable.
                // ── Behavioral/write COVERAGE (no-silent-subset floor; consumed by floor-check). ──
                // These convert "verified on a convenient subset" from a silent footnote into a gate. Fill
                // them from the per-object rowcounts you ALREADY compute for forwardCompleteness — marginal
                // output, no extra work. Token-safe: the floor blocks ONLY a SILENT subset; a scoped run
                // escapes with coverageScopeReason (one line), never a forced full run.
                coveredObjects: { type: 'array', items: { type: 'string' }, description: 'object NAMES (IO.Name) that landed >=1 forward-sync row this run' },
                exercisedWrites: { type: 'array', items: { type: 'string' }, description: 'object NAMES whose write path (create/update/delete) was actually round-tripped this run' },
                skippedObjects: { type: 'array', items: { type: 'object', properties: { object: { type: 'string' }, reason: { type: 'string' } } }, description: 'objects deliberately NOT exercised, each with a one-line reason (e.g. non-enumerable by-id object, no bulk list)' },
                coverageScopeReason: { type: 'string', description: 'REQUIRED when not every active object/write was exercised: one-line justification for the scoped set (e.g. "Goldilocks-bounded: representative multi-page streams per read-style covered; remainder same read-style, unit-proven"). Its presence downgrades the remainder from a blocking silent-subset to an acknowledged, surfaced scope.' },
            },
        },
        failures: { type: 'array', items: { type: 'object' } },
        mjapiPort: { type: 'integer' },
    },
};

// ── Shared env bring-up (runbook steps 0→5) — reused by both modes. ──────────
const ENV_BRINGUP =
    `⚠ DO NOT GUESS ANY STEP. Read ${RUNBOOK} and execute its env bring-up (steps 0→5) VERBATIM, in order. It captures every gotcha. The ONLY assumption is the Docker daemon is up.\n` +
    `🔁 WARM-BASE REUSE (P0-4 — surveys: NetSuite/Nimble/the 4th, the #1 env-rebuild leak: ~300–400k tokens + ~16 min repaid every iteration). The expensive, IDEMPOTENT part of the bring-up — fresh DB → migrate → FULL codegen → turbo build → MJAPI manifest — depends ONLY on (the migration set + the framework source at HEAD), NEVER on the connector. CACHE and REUSE it:\n` +
    `  • base key = sha1 of (\`ls migrations/v*/ | sort\` + \`git rev-parse HEAD\`). Look for a warm base at /tmp/mj-warmbase-<key> (a snapshot of the migrated+codegen'd ${DB_NAME} as a .bak/dump PLUS the built dist + generated manifests).\n` +
    `  • CACHE HIT (key matches): RESTORE the base DB snapshot into ${DB_NAME} and reuse the built dist — SKIP migrate+codegen+build (the ~16 min→~2 min win).\n` +
    `  • CACHE MISS (no snapshot, or migrations/framework moved → key changed): build fresh (STEPS A→C) THEN SAVE the base snapshot under /tmp/mj-warmbase-<key> for next time. A changed key MUST invalidate (never restore a stale base) — that is the correctness guard.\n` +
    `  • 🚨 ALWAYS, hit or miss: the warm base is the BASE MJ SCHEMA ONLY — ZERO connector data. The connector \`mj sync push\` (STEP D) + ApplyAll + sync ALWAYS run FRESH on the restored base EVERY run. NEVER cache/reuse connector metadata / CompanyIntegrations / synced rows — that stale-connector reuse is the reference-mode bug this primitive guards against. Warm-base caches the framework floor; the connector is always fresh.\n` +
    ISOLATION_OVERRIDE +
    `Invariants:\n` +
    `  • TRULY FROM SCRATCH: \`DROP DATABASE\` ${DB_NAME} if it exists (or drop+recreate the Docker volume), then CREATE it empty and baseline fresh. Do NOT re-baseline OVER an existing DB — stale CompanyIntegrations/objects from a prior run cause reference-mode reuse (wrong objects synced) and in-process CodeGen corruption. A fresh DB means the connector's OWN DiscoverObjects runs (NO pre-existing connection to reuse). (Operate ONLY on ${DB_NAME} in container ${DB_CONTAINER} — never any other DB/container.)\n` +
    `  • Launch MJAPI via tsx (node_modules/.bin/tsx), NEVER ts-node / npm run start (broken on Node 24).\n` +
    `  • ERR_MODULE_NOT_FOUND on launch → \`npx turbo build\` then retry.\n` +
    `  • 🚨 CANONICAL BRING-UP SEQUENCE — DO THESE STEPS IN THIS EXACT ORDER (the full-lifecycle order the bring-up was missing; out-of-order = the mapCount=0 / MJAPI-boot failures):\n` +
    `      STEP A — FRESH BASELINE: drop+recreate ${DB_NAME} empty, baseline fresh (migrate). Base MJ schema only.\n` +
    `      STEP B — FULL CODEGEN against THIS fresh DB (BEFORE build, BEFORE sync push): \`node packages/MJCLI/bin/run.js codegen\` with the ISOLATION-OVERRIDE DB_* env (host ${DB_HOST}, port ${DB_PORT}, DB ${DB_NAME}, user ${DB_USER}) + advancedGeneration OFF. WHY FIRST: the committed generated.ts is empty/polluted with broken in-flight connector entities (e.g. salesforceAccount_/propfuel* Field lacking a GraphQL type → "NoExplicitTypeError" → MJAPI never binds). Full codegen regenerates the WHOLE generated tree (entity_subclasses incl. the IntegrationObjectEntity class WITH its MetadataSource setter, generated.ts, bootstrap manifests) to MATCH the fresh base DB — clean, base-only, self-consistent. If codegen dies importing a stale entity (e.g. MJRSUAuditLogEntity) from a polluted committed manifest, \`git checkout HEAD -- <that manifest>\` and retry. VERIFY: \`grep -ciE 'salesforce|propfuel|orcid|openwater|path_?lms|growthzone' packages/MJAPI/src/generated/generated.ts\` returns 0.\n` +
    `      STEP C — BUILD: \`npx turbo build\` to compile the freshly-regenerated tree.\n` +
    `      STEP D — MJ SYNC PUSH the connector metadata (AFTER codegen+build so the generated IntegrationObjectEntity class exists and its setters — esp. MetadataSource — actually apply; ad-hoc SQL INSERTs do NOT set the NOT-NULL MetadataSource and silently persist 0 IO rows). Use the REAL sync push with the existing metadata/integrations/.mj-sync.json config, scoped to THIS connector: \`npx mj sync push --dir metadata/integrations\` with hivebrite-only scoping (\`--include ${VENDOR}\` or an isolated temp dir mirroring metadata/integrations + only the ${VENDOR} child) — NEVER ad-hoc INSERTs, NEVER push all connectors. The sync-push pipeline sets MetadataSource=Declared. VERIFY (gate): \`SELECT COUNT(*) FROM ${DB_NAME}.__mj.IntegrationObject IO JOIN ${DB_NAME}.__mj.Integration I ON I.ID=IO.IntegrationID WHERE I.Name='${INTEGRATION}'\` MUST be > 0 — if 0, sync push failed (check MetadataSource NOT-NULL); fix before launch (a 0-IO push → mapCount=0 → vacuous e2e pass, which is a FAILURE).\n` +
    `      STEP E — MANIFEST + LAUNCH (below). The snapshot/restore reverts the committed tree afterward, so the in-place regen is safe.\n` +
    `  • MJAPI manifest via the LOCAL CLI: node packages/MJCLI/bin/run.js codegen manifest --exclude-packages @memberjunction --appDir ./packages/MJAPI --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts (global mj may be stale).\n` +
    `  • DB_* = the ISOLATION-OVERRIDE SQL Server coords above (host ${DB_HOST}, port ${DB_PORT}, DB ${DB_NAME}, user ${DB_USER}) + DB_PLATFORM=sqlserver + DB_TRUST_SERVER_CERTIFICATE=true; generate MJ_BASE_ENCRYPTION_KEY; MJAPI on :${GQL_PORT}. A non-fatal EADDRINUSE for the secondary instance-B/WS port is OK if GraphQL on :${GQL_PORT} answers.\n` +
    `  • RSU CODEGEN CREDS — MANDATORY, the setup must ALWAYS provide them (this is infra, never a variable). ApplyAll triggers an in-process Runtime-Schema-Update codegen that needs its OWN DB login; WITHOUT it MJAPI SKIPS the in-process runner (MJServer/src/index.ts:433) and falls back to a child-process codegen that logs in as '' → "Login failed for user ''" and ApplyAll fails. So at MJAPI launch ALWAYS set:\n` +
    `      - CODEGEN_DB_USERNAME + CODEGEN_DB_PASSWORD = the dedicated **MJ_CodeGen** login (it always exists; if the fresh ${DB_NAME} DB lacks it, CREATE the server login + DB user MJ_CodeGen with db_owner on ${DB_NAME} as part of step-0 setup). If a dedicated MJ_CodeGen password isn't available for the throwaway test DB, set CODEGEN_DB_* to the SAME working DB creds MJAPI itself uses (${DB_USER}) — never leave them empty. (ALSO set ALLOW_RUNTIME_SCHEMA_UPDATE=1 or ApplyAll/RSU is disabled.)\n` +
    `      - RSU_WORK_DIR = the ABSOLUTE repo root. LOCATION MATTERS: the RSU codegen reads its DB connection + output paths + additionalSchemaInfo from mj.config.cjs at RSU_WORK_DIR||process.cwd() (MJServer/src/index.ts:476). Point it at the repo root or codegen gets empty/wrong DB config wherever MJAPI happens to be launched from.\n` +
    `      Verify after launch: the MJAPI log prints \"RSU in-process CodeGen runner initialized.\" (NOT the \"will fall back to child process\" warning). If you see the fallback warning, CODEGEN_DB_* were missing — fix and relaunch BEFORE submitting the e2e job.\n` +
    `  • advancedGeneration.enableAdvancedGeneration=false in mj.config.cjs before launch.\n`;

// ── EnvBringUp + the MANDATORY run for this mode. ────────────────────────────
// When a broker credential exists, the LIVE FULL-CREATION-PIPELINE is the mandatory
// path (create instance → discover → PK-classify incl. last-resort LLM → ApplyAll → sync),
// with ONLY the credential keys + the Company as manual inputs. The credential-free MOCK
// floor (which needs authored fixtures) is the FALLBACK used only when no broker cred exists.
// ── P1-6 / P1-5: cheap, env-free PRE-FLIGHT gate (surveys: all four — "expensive e2e used as
// the discovery mechanism for cheap, local failures"). Before paying for the full bring-up
// (DROP→migrate→codegen→build→push→ApplyAll→sync, ~400k tokens + ~16 min), run near-instant
// FILE-level checks that catch the setup failures that otherwise only surface deep into a run. A
// failure here is CLASSIFIED (setup vs connector) and short-circuits to a `setup-blocked` verdict —
// a DISTINCT terminal state, NOT a connector FAIL and NOT a vacuous pass (P1-5). GUARD: only
// HARD-blocks on conditions that would CERTAINLY fail or vacuous-pass the e2e anyway (connector
// class absent; metadata has zero objects; mock-mode fixtures absent), so it can never wrongly
// block a runnable build.
phase('PreFlight');
const PREFLIGHT_SCHEMA = {
    type: 'object',
    required: ['ok'],
    properties: {
        ok: { type: 'boolean' },
        classification: { type: 'string', enum: ['ok', 'setup', 'connector'] },
        connectorFileExists: { type: 'boolean' },
        metadataObjectCount: { type: 'integer' },
        fixturesPresent: { type: 'boolean' },
        failures: { type: 'array', items: { type: 'object' } },
    },
    additionalProperties: true,
};
const preflight = await agent(
    `PRE-FLIGHT (env-free, near-instant) for connector "${CONNECTOR}" / vendor "${VENDOR}" — run BEFORE the expensive bring-up. ONLY these cheap file checks (NO DB, NO build, NO codegen):\n` +
    `  1. connectorFileExists: does packages/Integration/connectors/src/${CONNECTOR}.ts exist? (else the e2e cannot run — SETUP).\n` +
    `  2. metadataObjectCount: in metadata/integrations/${VENDOR}/.${VENDOR}.integration.json (or metadata/integrations/.${VENDOR}.json), count IntegrationObjects under relatedEntities. 0 ⇒ a push lands nothing ⇒ vacuous e2e (SETUP).\n` +
    (MODE === 'mock'
        ? `  3. fixturesPresent: does packages/Integration/connectors/test/fixtures/${VENDOR}/fixtures/fixtures.json exist AND parse with ≥1 route/object? (mock mode skips with "no-fixtures" otherwise — the exact survey setup-failure — SETUP).\n`
        : `  3. fixturesPresent: n/a in live mode → return true.\n`) +
    `Return { ok, classification ('setup' if any check failed for an env/fixture/metadata reason, else 'ok'), connectorFileExists, metadataObjectCount, fixturesPresent, failures[{rule,detail}] }. ok = connectorFileExists AND metadataObjectCount>0 AND fixturesPresent.`,
    { agentType: 'testing-agent', model: 'haiku', schema: PREFLIGHT_SCHEMA, phase: 'PreFlight', label: `preflight:${VENDOR}` }
).catch(() => null);
if (preflight && preflight.ok === false) {
    const classification = preflight.classification === 'connector' ? 'connector' : 'setup';
    const status = classification === 'connector' ? 'fail' : 'setup-blocked';
    log(`hybrid-e2e PRE-FLIGHT ${status}: ${JSON.stringify(preflight.failures ?? [])} — short-circuited BEFORE the expensive bring-up (no DROP/migrate/codegen/build/e2e paid).`);
    return {
        pass: false,
        mode: HAS_BROKER_CREDS ? 'live' : 'mock',
        status,
        steps: {},
        assertions: {},
        preflight,
        failures: (preflight.failures ?? []).map((f) => ({ rule: f.rule ?? 'preflight', detail: f.detail ?? '', classification })),
        livePhaseLog: [
            { phaseId: 'E2E.Hybrid.PreFlight', order: 0, dialect: 'sqlserver', nl: `pre-flight ${status}: ${JSON.stringify(preflight.failures ?? [])}`, json: preflight, status: classification === 'connector' ? 'fail' : 'skip', skipReason: classification === 'setup' ? 'setup-blocked-preflight' : undefined },
        ],
    };
}
log('hybrid-e2e pre-flight passed — proceeding to bring-up.');

// ── PROTECT the shared working tree's generated code (crash-safe snapshot → restore) ──
// The e2e bring-up runs `mj codegen`, which regenerates the SHARED tree's generated dirs IN
// PLACE; against a fresh/empty DB it can EMPTY them (entity_subclasses.ts, MJServer generated.ts,
// the Angular form components) and break the whole repo build. We snapshot them BEFORE the run
// and ALWAYS restore in a `finally`, so the user's working tree is byte-identical regardless of
// outcome OR crash. This makes the codegen-damages-the-tree class of failure structurally
// impossible — future e2e runs can never leave the tree broken.
const GENERATED_DIRS = 'packages/MJCoreEntities/src/generated packages/MJServer/src/generated packages/Angular/Explorer/core-entity-forms/src/lib/generated';
const GEN_SNAPSHOT = `/tmp/mj-gen-snapshot-${RUN_ID}`;
const SNAP_SCHEMA = { type: 'object', required: ['OK'], properties: { OK: { type: 'boolean' } } };
phase('ProtectGenerated');
await agent(
    `Protect the repo's committed generated code from the e2e's in-place codegen. Run EXACTLY this bash and nothing else:\n` +
    `  rm -rf ${GEN_SNAPSHOT}; for d in ${GENERATED_DIRS}; do mkdir -p "${GEN_SNAPSHOT}/$(dirname "$d")"; cp -R "$d" "${GEN_SNAPSHOT}/$d"; done; echo SNAPSHOT_OK\n` +
    `Return { OK: true } iff SNAPSHOT_OK printed.`,
    { agentType: 'testing-agent', model: 'haiku', schema: SNAP_SCHEMA, phase: 'ProtectGenerated', label: `gen-snapshot:${VENDOR}` }
);

phase('EnvBringUp');
let primaryResult;
try {
if (HAS_BROKER_CREDS) {
    phase('E2ELive');
    primaryResult = await agent(
        `Run the hybrid e2e for connector "${CONNECTOR}" (vendor ${VENDOR}, integration "${INTEGRATION}") in LIVE FULL-CREATION-PIPELINE mode on SQL Server. This is the MANDATORY path (a broker credential is present).\n\n` +
        ENV_BRINGUP +
        `\nThen run the FULL creation pipeline by SUBMITTING A JOB to the ALREADY-RUNNING credential broker. CRITICAL: the broker is ALREADY UP — DO NOT provision it, DO NOT use sudo, DO NOT touch /Users/Shared/mj-broker. You interact ONLY through the WORLD-WRITABLE mailbox (no sudo needed), exactly like the T8 ladder broker rung. The vendor token NEVER enters your context.\n` +
        `  SUBMIT: write /Users/Shared/mj-mailbox/jobs/<jobId>.json (pick a UNIQUE jobId EACH submit — the broker caches by jobId) as valid JSON = {"jobId":"<jobId>","task":"connector-e2e-live","env":{"E2E_CONNECTOR":"${VENDOR}","E2E_MODE":"live","E2E_INTEGRATION":"${INTEGRATION}","E2E_TOKEN_KEY":"${E2E_TOKEN_KEY}","E2E_LIVE_CONFIG":${JSON.stringify(E2E_LIVE_CONFIG)},"HS_LIVE_PLATFORM":"sqlserver","HS_LIVE_DB_HOST":"${DB_HOST}","HS_LIVE_DB_PORT":"${DB_PORT}","HS_LIVE_DB_NAME":"${DB_NAME}","HS_LIVE_DB_USER":"${DB_USER}","HS_LIVE_MJ_SCHEMA":"__mj","HS_LIVE_GRAPHQL_URL":"${GQL_URL}","HS_LIVE_COMPANY_ID":"<step5 Company>","HS_LIVE_CREDTYPE_ID":"<step5 CredType>","HS_LIVE_CIID":"","HS_LIVE_OBJECTS":"${E2E_OBJECTS || '<the discovered stream names — bound to ONE mid-size Goldilocks stream for a timely run, not the huge ones>'}","HS_LIVE_MAX_POLLS":"1800"}}. (E2E_LIVE_CONFIG is the connector's non-secret config JSON, already escaped above.) The broker injects the THREE secrets (CONNECTOR_API_KEY + DB_PASSWORD + MJ_API_KEY) into the runner subprocess — you never see them.\n` +
        `  TOKEN MODE IS REQUIRED — set HS_LIVE_CIID to EMPTY (as above) and do NOT pre-create or pass any CompanyIntegration ID. The run MUST do a FRESH IntegrationCreateConnection(testConnection:true, runSchemaRefresh:true) with the broker token, which runs the connector's DiscoverObjects + schema-refresh and registers entity maps. If the scrubbed result shows setup.referenceMode=true OR setup.mapCount=0 OR setup.connectionTest=null, the run reused a pre-seeded connection and skipped discovery/mapping → it WILL sync 0 rows → that is a FAILURE, not a pass. Re-run in token mode.\n` +
        `  POLL: read /Users/Shared/mj-mailbox/results/<jobId>.json until it appears (~30 min budget; the live sync runs for real). The result is SCRUBBED (counts/booleans/keys only). If it never appears, surface a broker-timeout failure. PARSE that scrubbed result and map it to the assertions below.\n` +
        `  The broker's connector-e2e-live run performs §1→§7 automatically (mirroring the gql-live-harness flow) — you ASSERT from its scrubbed result, you do NOT issue the GQL calls yourself:\n` +
        `  1. Company + IntegrationCreateConnection(testConnection:true, runSchemaRefresh:true): creates the CompanyIntegration, wires the broker-encrypted credential, tests the connection, runs schema-refresh DISCOVERY (DiscoverObjects/DiscoverFields incl. beyond-declared; SoftPKClassifier runs, deterministic/stat fallback when no LLM key — acceptable).\n` +
        `  2. IntegrationApplyAll(platform:'sqlserver'): registers entity maps + entities on SQL Server.\n` +
        `  3. SYNC + read-only verification (the run does it; vendor side STRICTLY read-only — never ack/write/delete/CRUD): full pull → tail → GetRun, then an incremental re-run + an idempotent re-run, with DB-rowcount completeness + record-map 1:1 checks, plus delta verification.\n\n` +
        `ASSERT OUTCOMES from the scrubbed result (set assertions.*). FILL THE RAW COUNTS HONESTLY: entityMapCount = setup.mapCount; rowsProcessed = the MAX forward.full counts.Processed across objects. CORE (gate pass): instanceCreated (CompanyIntegrationID returned), connectionTested (setup.connectionTest ok — NOT null), discoveryAddedObjects (schema-refresh surfaced objects/fields), entitiesRegistered (entityMapCount > 0), syncLandedRows, forwardCompleteness, idempotentZeroWork. CRITICAL ANTI-VACUOUS RULE: syncLandedRows is TRUE ONLY IF rowsProcessed > 0 AND landed DB rowcount > 0 — a run with rowsProcessed=0 / mapCount=0 / referenceMode=true did NOT actually sync data and MUST report syncLandedRows=false and status='fail' (a 0-row "completed" run is a RED FLAG, never a pass).\n` +
        `  v2 OUTCOME ASSERTIONS (compute from DB rowcounts — direct sqlcmd against ${DB_NAME}; these are floor-check gates, ARCHITECTURE_REFACTOR.md P3/P5/P6):\n` +
        `  • firstSyncComplete — record per-table rowcounts AFTER the full pull and AFTER the idempotent re-run. TRUE iff no table reached its final count only on a later pass (a table that landed rows only on the re-run is a door-before-child ordering defect — the GZ #21/#28 class; second-sync self-heal is a FAIL, set it false).\n` +
        `  • secondSyncGrew — TRUE if ANY table's rowcount GREW between the full pull and the idempotent re-run (non-idempotent identity, the GZ #22 class: 127→254). Zero-growth everywhere → false.\n` +
        `  • captureEngaged — query sys.columns: every created table in the connector's schema MUST have __mj_integration_CustomOverflow (its absence is the GZ #29/#31 silent-kill class → false); when present, true. Leave null ONLY if the DB is unreachable for the check.\n` +
        `  • COVERAGE (no-silent-subset floor) — from the per-object rowcounts you already collected, set: coveredObjects = the IO.Name list that landed >=1 row; exercisedWrites = the IO.Name list whose write you round-tripped (read-only live runs: leave empty + a skip/scope reason); skippedObjects = [{object,reason}]. If you did NOT cover every active object/write (a bounded subset is legitimate), you MUST set coverageScopeReason to a one-line justification — otherwise the floor flags a silent subset. Marginal output of data you already have; declare the scope honestly, do NOT expand the run to chase 100%.\n` +
        `  ADVISORY (set if exposed; do NOT gate): pkClassifierRan, idempotentThreeSync, runEventsParsed, customColumnsCaptured, rateLimitObserved, referenceModeWorks. status='pass' iff: instanceCreated AND connectionTested AND discoveryAddedObjects AND entitiesRegistered AND entityMapCount>0 AND rowsProcessed>0 AND syncLandedRows AND forwardCompleteness AND idempotentZeroWork AND firstSyncComplete!==false AND secondSyncGrew!==true AND captureEngaged!==false. Return phaseId='E2E.Hybrid.Live', the scrubbed steps VERBATIM in steps, the harness result.lifecycle[] array VERBATIM in lifecycle (the birth→death per-stage matrix the deterministic lifecycle gate enforces — any stage status==='fail' fails the e2e), a plain-English nl summary, and mjapiPort.`,
        { agentType: 'testing-agent', schema: E2E_RESULT_SCHEMA, phase: 'E2ELive', label: `hybrid-live:${VENDOR}` }
    );
} else {
    phase('E2EMock');
    log('hybrid-e2e: no broker credentialReference → CREDENTIAL-FREE MOCK floor (the lower ceiling). This is a loud, honest fallback, not a substitute for live proof.');
    primaryResult = await agent(
        `Run the hybrid e2e for connector "${CONNECTOR}" (vendor ${VENDOR}, integration "${INTEGRATION}") in MOCK mode on SQL Server — the CREDENTIAL-FREE fallback (no broker credential available).\n\n` +
        ENV_BRINGUP +
        `\nThen run connector-e2e (${RUNBOOK} step 6, MOCK mode, E2E_PLATFORM=sqlserver) — you MUST use the NEW full-catalog harness (packages/Integration/connectors/test/connector-e2e-hybrid.mjs + connector-e2e-harness.mjs + the RELATIONAL gen-fixture.mjs). That harness emits a hard \`coverage.all-objects\` gate step (connector-e2e-harness.mjs) that is ok=TRUE ONLY when EVERY materialized object synced rows>0 (no exemptions in mock). Generate fixtures with the RELATIONAL generator (door-embed + accessPath nesting) so nested/grandchild objects populate through the real DAG sync. MOCK mode needs RICH fixtures at packages/Integration/connectors/test/fixtures/${VENDOR}/fixtures/fixtures.json for the SHIPPED connector shape (config-driven base-URL connectors → ORIGIN mode: Transport:http, ConfigUrlKey=<the config key>, Routes mirroring the connector's real endpoints, Objects, DeltaPasses). AUTO-GENERATE these from the spec's example payloads AND the deployed schema — NEVER hand-author a thin 2-object stub. They MUST encode: an FK-connected multi-object set, multi-page pagination on a hub, custom/overflow fields, soft-DELETES, value-type variety. If fixtures are missing or are a STALE different-shape scaffold, regenerate them first (see CONNECTOR_E2E.md). Never reuse stale fixtures.\n\n` +
        `ASSERT OUTCOMES from DIRECT SQL Server rowcounts against the scratch DB (the mock is a PROGRAMMABLE vendor — it measures every outcome a live run does EXCEPT a real write round-trip + true rate behavior, which are the ONLY credential-only cells). Compute and set: applyAllRan (dest tables created over the FULL catalog — NOT a single-object apply), forwardCompleteness (rowcounts match source, no drops/dupes), syncLandedRows, idempotentZeroWork, secondSyncGrew, firstSyncComplete, captureEngaged, incrementalNarrowed, contentHashSkipped, deltaApplied. \n` +
        `  • CRITICAL ANTI-VACUOUS RULE: syncLandedRows is TRUE ONLY IF rowsProcessed > 0 AND every selected object's landed DB rowcount > 0 — the fixtures carry data, so a 0-row run is a BROKEN sync, never an empty source; set syncLandedRows=false + status='fail'. A single-object ApplyAll, a stale prior-run rowcount, or referenceMode=true is likewise a FAIL.\n` +
        `  • firstSyncComplete — per-table rowcounts after the full pull vs after the idempotent re-run; a table that fills only on a later pass = door-before-child ordering defect (FALSE).\n` +
        `  • secondSyncGrew — TRUE if any table grew between the full pull and the idempotent re-run (non-idempotent identity). captureEngaged — every created table has __mj_integration_CustomOverflow AND customs captured where the source carries them.\n` +
        `  • deltaApplied — the DeltaPass create AND update AND delete-tombstone each verified by DB state independently.\n` +
        `  • COVERAGE (MOCK = FULL, NO subset — agent-arc rule) — the mock vendor is FREE + INSTANT, so EVERY active object MUST land >=1 row and EVERY writable object's write MUST round-trip. Set coveredObjects = the IO.Name list that landed >=1 row (this MUST equal the FULL active IO set), exercisedWrites = the IO.Name list whose write round-tripped (MUST equal the FULL writable set), skippedObjects = [{object,reason}] ONLY for an object that is STRUCTURALLY impossible to mock (e.g. it has no read endpoint at all) with a CONCRETE per-object reason. A blanket coverageScopeReason / "Goldilocks subset" is REJECTED in MOCK mode — the floor FAILS behavioral-coverage-mock-incomplete / write-coverage-mock-incomplete on ANY uncovered object. Bound ROW DEPTH per object (don't generate 50k mock rows), NEVER the object SET. The fixtures MUST carry data for EVERY object so all can sync — if a fixture is missing for any object, ADD it. Cover ALL objects, not a representative few.\n` +
        `status='pass' ONLY if applyAllRan AND forwardCompleteness AND syncLandedRows AND idempotentZeroWork AND firstSyncComplete!==false AND secondSyncGrew!==true AND captureEngaged!==false AND coveredObjects equals the full active IO set (every object) AND the NEW harness's \`coverage.all-objects\` gate step reported ok=TRUE. If coverage.all-objects is not ok (any object synced 0 rows), status='fail' — fix the relational fixtures / DAG access-path so that object lands rows; do NOT scope it away. Return scrubbed steps VERBATIM in steps (INCLUDING the coverage.all-objects step), the harness result.lifecycle[] array VERBATIM in lifecycle (the birth→death per-stage matrix the deterministic lifecycle gate enforces — any stage status==='fail' fails the e2e), a plain-English nl summary, phaseId='E2E.Hybrid.Mock', and mjapiPort.`,
        { agentType: 'testing-agent', schema: E2E_RESULT_SCHEMA, phase: 'E2EMock', label: `hybrid-mock:${VENDOR}` }
    );
}
} catch (e) {
    // A thrown bring-up/e2e (e.g. a transient agent-output flake) must NOT skip the restore.
    log('hybrid-e2e bring-up/e2e threw: ' + (e && e.message ? e.message : String(e)));
    primaryResult = { status: 'fail', failures: [{ rule: 'hybrid-e2e-threw', detail: (e && e.message ? e.message : String(e)) }], assertions: {} };
} finally {
    // ALWAYS restore generated code from the snapshot — crash-safe; returns the tree byte-identical.
    phase('RestoreGenerated');
    await agent(
        `Restore the repo's committed generated code from the pre-e2e snapshot (the e2e codegen may have regenerated/emptied it in place). Run EXACTLY this bash and nothing else:\n` +
        `  for d in ${GENERATED_DIRS}; do rm -rf "$d"; mkdir -p "$(dirname "$d")"; cp -R "${GEN_SNAPSHOT}/$d" "$d"; done; rm -rf ${GEN_SNAPSHOT}; echo RESTORE_OK\n` +
        `Then verify with: git status --porcelain ${GENERATED_DIRS} | head — it should be EMPTY (tree clean). Return { OK: true } iff RESTORE_OK printed and the generated dirs are git-clean.`,
        { agentType: 'testing-agent', model: 'haiku', schema: SNAP_SCHEMA, phase: 'RestoreGenerated', label: `gen-restore:${VENDOR}` }
    );
}

// ── Teardown ─────────────────────────────────────────────────────────────────
phase('Teardown');
await agent(
    `Tear down the hybrid-e2e env per ${RUNBOOK} step 7: \`lsof -nP -iTCP:${GQL_PORT} -sTCP:LISTEN -t | xargs -r kill 2>/dev/null\` to stop THIS run's :${GQL_PORT} SQL Server MJAPI (NOT :4007 — that belongs to a concurrent session; never kill it). Leave the ${DB_CONTAINER} container running (cheap). Return { ToreDown: true }.`,
    { agentType: 'testing-agent', schema: { type: 'object', required: ['ToreDown'], properties: { ToreDown: { type: 'boolean' } } }, phase: 'Teardown', label: `hybrid-teardown:${VENDOR}` }
);

// ── JS verdict — the required assertion set depends on the mode that ran. ─────
const failures = [];
const a = primaryResult?.assertions ?? {};
if (primaryResult?.status !== 'pass') {
    failures.push({ rule: HAS_BROKER_CREDS ? 'hybrid-live-not-pass' : 'hybrid-mock-not-pass', detail: `${HAS_BROKER_CREDS ? 'live' : 'mock'} e2e status=${primaryResult?.status}; ${JSON.stringify(primaryResult?.failures ?? [])}` });
}
// ── DETERMINISTIC LIFECYCLE-STAGE GATE (the full-lifecycle floor for new connectors) ──────────────
// Beyond the agent's self-reported status, enforce the harness's birth→death matrix (result.lifecycle[])
// DIRECTLY: any APPLICABLE stage reported 'fail' fails the e2e. A 'skip' is allowed (capability not
// declared / not stageable cred-free / keyless-no-PK legitimate skip — soft keys); only a hard 'fail'
// gates. This is what makes the agent arc require the WHOLE lifecycle on every connector — discovery,
// custom columns, sync, incremental, merkle, write-back, maintenance, death — not just coverage.all-objects.
const lifecycleStages = Array.isArray(primaryResult?.lifecycle) ? primaryResult.lifecycle : [];
for (const st of lifecycleStages) {
    if (st && st.status === 'fail') {
        failures.push({ rule: 'lifecycle-stage-failed', detail: `lifecycle stage '${st.stage}' FAILED: ${st.failDetail || '(no detail)'}` });
    }
}
if (HAS_BROKER_CREDS) {
    // LIVE full-creation-pipeline is mandatory — assert the full create→discover→apply→sync set.
    if (a.instanceCreated === false) failures.push({ rule: 'instance-not-created', detail: 'CompanyIntegration instance not created' });
    if (a.connectionTested === false) failures.push({ rule: 'connection-not-tested', detail: 'TestConnection did not pass with the real credential' });
    if (a.discoveryAddedObjects === false) failures.push({ rule: 'discovery-added-nothing', detail: 'schema-refresh discovery surfaced no IO/IOF' });
    if (a.entitiesRegistered === false) failures.push({ rule: 'entities-not-registered', detail: 'ApplyAll registered no entity maps/entities on SQL Server' });
    if (a.syncLandedRows === false) failures.push({ rule: 'sync-landed-nothing', detail: 'sync landed zero rows' });
    if (a.forwardCompleteness === false) failures.push({ rule: 'forward-incomplete', detail: 'DB rowcounts did not match source (drops/dupes)' });
    // ANTI-VACUOUS GATE — reject a 0-map / 0-row "pass" regardless of the agent's booleans. A run
    // that registered no entity maps (reference-mode / no discovery) or processed no rows did NOT
    // actually exercise the live sync; a "completed" 0-row run is a RED FLAG, never proof.
    if (typeof a.entityMapCount === 'number' && a.entityMapCount <= 0) failures.push({ rule: 'no-entity-maps', detail: 'setup.mapCount=0 — reference-mode/no-discovery; token-mode CreateConnection+schema-refresh did not register maps (HS_LIVE_CIID must be empty)' });
    if (typeof a.rowsProcessed === 'number' && a.rowsProcessed <= 0) failures.push({ rule: 'zero-rows-processed', detail: 'forward.full Processed=0 — the live sync landed NO rows though source data exists; vacuous pass rejected' });
    // Idempotency is a CORE gate at the level the canned connector-e2e-live harness produces
    // (a re-run over unchanged data does ~0 net work). idempotentThreeSync is a STRENGTHENING
    // (advisory) — only the canned harness emitting a 3rd pass sets it; absence must not fail a
    // pipeline whose 2-pass idempotency held.
    if (a.idempotentZeroWork === false) failures.push({ rule: 'not-idempotent', detail: 're-run over unchanged data did non-zero work' });
    // v2 OUTCOME gates (P3/P5/P6) — explicit-false/true gates; null/undefined = unverified (the
    // floor-check's EMPIRICAL/LINT split reports unverified by name, it does not silently pass).
    if (a.firstSyncComplete === false) failures.push({ rule: 'first-sync-incomplete', detail: 'at least one table reached its full rowcount only on a later pass — door-before-child ordering defect on the fresh DB (GZ #21/#28). Second-sync self-heal is a FAIL.' });
    if (a.secondSyncGrew === true) failures.push({ rule: 'second-sync-grew', detail: 'a table GREW between the full pull and the idempotent re-run — non-idempotent identity (GZ #22: 127→254).' });
    if (a.captureEngaged === false) failures.push({ rule: 'capture-not-engaged', detail: '__mj_integration_CustomOverflow missing on created tables (or capture wrote nothing where customs exist) — the GZ #29/#31 silent no-op class.' });
    // B1/B2/B4-strengthened are ADVISORY here — the connector-e2e-live harness may not surface a
    // PK-verdict block, a parsed run-event stream, or a 3rd idempotency pass in its scrubbed result,
    // and a working live §1→§7 must not be failed for their absence. Log them for visibility.
    log(`hybrid-e2e strengthening advisories — pkClassifierRan=${a.pkClassifierRan} idempotentThreeSync=${a.idempotentThreeSync} runEventsParsed=${a.runEventsParsed}`);
    // B3/B5/B6 are ADVISORY — log but do NOT gate (a connector may have no custom columns;
    // reference-mode + rate-limit observation are environment-dependent).
    log(`hybrid-e2e advisories — customColumnsCaptured=${a.customColumnsCaptured} referenceModeWorks=${a.referenceModeWorks} rateLimitObserved=${a.rateLimitObserved}`);
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

// `assertions` MUST pass through — floor-check's v2 outcome rules (second-sync-grew /
// first-sync-incomplete / capture-not-engaged) read journal.hybridE2E.assertions.
return { pass, mode: HAS_BROKER_CREDS ? 'live' : 'mock', steps: primaryResult?.steps ?? {}, assertions: a, livePhaseLog, failures };
