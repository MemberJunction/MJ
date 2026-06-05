/**
 * Per-tier test runner. Each tier dispatches to a separate handler. Every tier
 * is REAL — there are no `not-implemented` stubs:
 *
 *   - T0 `tsc --noEmit` + T4 `vitest run <ClassName>` over the REAL connectors package.
 *   - T1 deterministic structural invariants (see {@link ./invariants}).
 *   - T2 cross-programmatic consistency, T3 doc-structure self-check, T5 mock-HTTP
 *     server, T6 local-SQLite backend — all CREDENTIAL-FREE and SHAPE-AGNOSTIC
 *     (driven through the connector's abstract methods; REST + file-feed alike).
 *     Implemented in `./tiers/*`.
 *   - T7 OpenAPI validation — `Skipped` (`no-openapi-spec`) when not applicable.
 *   - T8 READ-ONLY live (the only tier that touches credentials).
 *
 * **CRITICAL SECURITY INVARIANT**: credential file paths are read INSIDE this
 * subprocess only (T8). They are NEVER returned in the tool result, never logged,
 * never written to a file the agent can read. The agent sees Pass/Fail and
 * non-secret error messages (counts, status codes, object names); it never sees
 * credential bytes. The offline tiers (T2/T3/T5/T6/T7) never receive credentials.
 *
 * **LADDER CWD**: the tiers that instantiate or build the connector (T0 tsc, T4
 * vitest, T2/T3/T5/T6 child runners, T8 live) run against the REAL connectors
 * package `packages/Integration/connectors` — NOT a registry mirror — so they
 * exercise the shipping connector code. The registry root resolves per-connector
 * metadata (ClassName), fixtures, OpenAPI specs, and the T1 invariant inputs.
 *
 * **LIVE TESTING IS READ-ONLY ONLY**. T8 may ONLY do non-mutating operations:
 * `TestConnection`, `DiscoverObjects`, and ONE `FetchChanges` page. It never
 * Creates/Updates/Deletes/upserts/pushes. The offline tiers run against mocks /
 * SQLite and likewise never mutate any real external system. There is no
 * write/bidirectional tier and no `allowWrite` switch.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.19.2
 * @see ./tiers/childRunner.ts (shared offline-tier infrastructure)
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { RunTierRequest, TierResult } from './types.js';
import { ValidateInvariants } from './invariants.js';
import {
    REGISTRY_ROOT,
    REPO_ROOT,
    CONNECTORS_PKG_DIR,
    CONNECTORS_SRC_DIR,
    resolveConnectorIdentity as resolveConnectorIdentityShared,
    resolveTsxBin,
    type ConnectorIdentity,
} from './tiers/childRunner.js';
import { runT2CrossConsistency } from './tiers/t2CrossConsistency.js';
import { runT3DocSelfCheck } from './tiers/t3DocSelfCheck.js';
import { runT5MockHttp } from './tiers/t5MockHttp.js';
import { runT6Sqlite } from './tiers/t6Sqlite.js';
import { runT7OpenApi } from './tiers/t7OpenApi.js';

/** Portion of a {@link TierResult} produced by an individual tier handler. */
type TierHandlerResult = Omit<TierResult, 'Tier' | 'Connector' | 'DurationMs'>;

/** Fields populated up-front before a tier handler runs. */
type TierResultBase = Pick<TierResult, 'Tier' | 'Connector' | 'DurationMs'>;

/** Sentinel prefix the live-runner child emits on the single stdout line that carries its result. */
const LIVE_RESULT_SENTINEL = '__MJ_T8_RESULT__';

/**
 * Run a single test tier against a connector and return its result.
 *
 * @param request the validated tier request (connector, tier, optional credential file path)
 * @returns a {@link TierResult} describing pass/fail/skipped plus non-secret output
 */
export async function RunTier(request: RunTierRequest): Promise<TierResult> {
    const start = Date.now();
    const base: TierResultBase = {
        Tier: request.Tier,
        Connector: request.Connector,
        DurationMs: 0,
    };

    try {
        switch (request.Tier) {
            case 'T0_StaticValidation':
                return finish(base, runStaticValidation(), start);
            case 'T1_InvariantValidator':
                return finish(base, runInvariantValidator(request.Connector), start);
            case 'T2_CrossProgrammaticConsistency':
                return finish(base, withIdentity(request.Connector, (id) => runT2CrossConsistency(request.Connector, id)), start);
            case 'T3_DocStructureSelfCheck':
                return finish(base, withIdentity(request.Connector, (id) => runT3DocSelfCheck(request.Connector, id)), start);
            case 'T4_MockedFixture':
                return finish(base, runMockedFixture(request.Connector), start);
            case 'T5_MockHTTPServer':
                return finish(base, withIdentity(request.Connector, (id) => runT5MockHttp(request.Connector, id)), start);
            case 'T6_LocalSQLiteBackend':
                return finish(base, withIdentity(request.Connector, (id) => runT6Sqlite(request.Connector, id)), start);
            case 'T7_OpenAPIValidation':
                return finish(base, withIdentity(request.Connector, (id) => runT7OpenApi(request.Connector, id)), start);
            case 'T8_AuthenticatedEndpoint':
                return finish(base, runReadOnlyLive(request.Connector, request.CredentialFilePath), start);
            default:
                return {
                    ...base,
                    Status: 'Skipped',
                    Output: '',
                    Errors: [`Unknown tier: ${String(request.Tier)}`],
                    DurationMs: Date.now() - start,
                };
        }
    }
    catch (err) {
        return {
            ...base,
            Status: 'Fail',
            Output: '',
            Errors: [err instanceof Error ? err.message : String(err)],
            DurationMs: Date.now() - start,
        };
    }
}

function finish(base: TierResultBase, r: TierHandlerResult, start: number): TierResult {
    return { ...base, ...r, DurationMs: Date.now() - start };
}

/**
 * Resolve the connector's class/source identity once, then invoke a tier handler
 * with it. When the connector class can't be resolved, return a single honest
 * `Fail` (not a silent skip) so the missing input is visible — the offline tiers
 * all need to instantiate or read the connector.
 */
function withIdentity(connector: string, handler: (identity: ConnectorIdentity) => TierHandlerResult): TierHandlerResult {
    const identity = resolveConnectorIdentityShared(connector);
    if (!identity) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`Could not resolve a connector class for "${connector}" (no registry ClassName and no matching <name>Connector.ts under ${CONNECTORS_SRC_DIR}).`],
            Details: { connector },
        };
    }
    return handler(identity);
}

// ── Tier handlers ────────────────────────────────────────────────────

/**
 * T0 — type-check the REAL connectors package with `tsc --noEmit`. Running in
 * `packages/Integration/connectors` (not a registry mirror) means we type-check
 * the actual shipping connector code per the LADDER CWD convention.
 */
function runStaticValidation(): TierHandlerResult {
    if (!existsSync(CONNECTORS_PKG_DIR)) {
        return { Status: 'Fail', Output: '', Errors: [`Connectors package missing: ${CONNECTORS_PKG_DIR}`] };
    }
    const result = spawnSync('npx', ['tsc', '--noEmit'], { cwd: CONNECTORS_PKG_DIR, encoding: 'utf-8' });
    return {
        Status: result.status === 0 ? 'Pass' : 'Fail',
        Output: result.stdout ?? '',
        Errors: result.stderr ? [result.stderr] : [],
        Details: { cwd: CONNECTORS_PKG_DIR },
    };
}

/**
 * T1 structural invariants. Runs the four deterministic checks inline (the
 * `npx mj-validate-invariants` bin never existed — the retired
 * `connector-validator` package's invariants moved into this tier per
 * `.claude/agents/testing-agent.md` §T1). Reads from the registry root.
 */
function runInvariantValidator(connector: string): TierHandlerResult {
    const result = ValidateInvariants(connector, REGISTRY_ROOT);
    return {
        Status: result.Status,
        Output: result.Output,
        Errors: result.Errors,
        Details: result.Details,
    };
}

/**
 * T4 — run the connector's vitest suite in the REAL connectors package, filtered
 * to that connector's own test file via `vitest run <ClassName>` (the test files
 * are named `<ClassName>.test.ts`). This runs only that connector's tests, not
 * the whole suite, per the LADDER CWD convention.
 */
function runMockedFixture(connector: string): TierHandlerResult {
    if (!existsSync(CONNECTORS_PKG_DIR)) {
        return { Status: 'Fail', Output: '', Errors: [`Connectors package missing: ${CONNECTORS_PKG_DIR}`] };
    }
    const identity = resolveConnectorIdentityShared(connector);
    if (!identity) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`Could not resolve a connector class for "${connector}" under ${CONNECTORS_SRC_DIR} (no registry ClassName and no matching <name>Connector.ts).`],
        };
    }
    // `vitest run <pattern>` treats the arg as a filename filter; the ClassName
    // matches the `<ClassName>.test.ts` file name, so this targets exactly one suite.
    const result = spawnSync('npx', ['vitest', 'run', identity.ClassName], { cwd: CONNECTORS_PKG_DIR, encoding: 'utf-8' });
    return {
        Status: result.status === 0 ? 'Pass' : 'Fail',
        Output: result.stdout ?? '',
        Errors: result.stderr ? [result.stderr] : [],
        Details: { cwd: CONNECTORS_PKG_DIR, testFilter: identity.ClassName },
    };
}

// ── T8: read-only live ───────────────────────────────────────────────

/** Non-secret outcome of a single read-only call inside the live runner. */
interface LiveCallOutcome {
    success?: boolean;
    error?: string;
    [key: string]: unknown;
}

/** Non-secret shape the live-runner child emits on the sentinel line. */
interface LiveRunnerOutput {
    ok: boolean;
    reason?: string;
    integrationName?: string;
    calls?: Record<string, LiveCallOutcome>;
}

/**
 * T8 — REAL read-only live test. Reads the credential JSON INSIDE this subprocess,
 * then spawns a short-lived `tsx` child (in the real connectors package, so the
 * `@memberjunction/*` workspace deps resolve) that:
 *   1. imports the connector's `.ts` source directly (no build needed — `tsx`
 *      transpiles on the fly),
 *   2. instantiates it via `new <Class>()`,
 *   3. builds an IN-MEMORY `MJCompanyIntegrationEntity`-shaped object whose
 *      `Configuration` field holds the credential JSON (the connector's documented
 *      no-DB credential path — `CredentialID` is left null so it never touches the
 *      database / Metadata provider),
 *   4. calls ONLY `TestConnection`, `DiscoverObjects`, and ONE `FetchChanges` page.
 *
 * The credential bytes are handed to the child via env var and NEVER printed by the
 * child or returned to the agent. The child returns counts / status / object names
 * only. There is no write path — none of Create/Update/Delete is ever invoked.
 *
 * Connector instantiation uses the same `@RegisterClass`-backed connector classes
 * that {@link import('@memberjunction/integration-engine').ConnectorFactory} resolves
 * at runtime; here we import the class by source path + `ClassName` directly rather
 * than going through ClassFactory, because the MCP runs without an MJ metadata
 * provider and the connector's `Configuration` credential path needs no provider.
 */
function runReadOnlyLive(connector: string, credentialFilePath?: string): TierHandlerResult {
    if (!credentialFilePath) {
        return { Status: 'Fail', Output: '', Errors: ['T8 (read-only live) requires CredentialFilePath but none provided'] };
    }
    if (!existsSync(credentialFilePath)) {
        return { Status: 'Fail', Output: '', Errors: ['T8 credential file does not exist on disk'] };
    }

    const identity = resolveConnectorIdentityShared(connector);
    if (!identity) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`Could not resolve a connector class for "${connector}" (no registry ClassName and no matching <name>Connector.ts under ${CONNECTORS_SRC_DIR}).`],
        };
    }
    if (!existsSync(identity.SourcePath)) {
        return { Status: 'Fail', Output: '', Errors: [`Connector source not found: ${identity.SourcePath}`] };
    }

    const tsx = resolveTsxBin();
    if (!tsx) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`Could not locate the 'tsx' runner under ${REPO_ROOT}/node_modules/.bin — cannot run the read-only live connector test.`],
        };
    }

    // SECURITY: read the credential bytes HERE, inside this subprocess. They are
    // passed to the child via env only; never logged, never returned.
    const credJson = readFileSync(credentialFilePath, 'utf-8');

    return runLiveChild(tsx, identity, credJson, connector);
}

/**
 * Spawn the `tsx` child runner with the credential bytes in env, parse only its
 * sentinel result line, and map it to a tier result. Cleans up the temp runner
 * script regardless of outcome.
 */
function runLiveChild(tsx: string, identity: ConnectorIdentity, credJson: string, connector: string): TierHandlerResult {
    const scriptDir = mkdtempSync(resolve(tmpdir(), 'mj-t8-'));
    const scriptPath = resolve(scriptDir, 'runner.mts');
    try {
        writeFileSync(scriptPath, LIVE_RUNNER_SOURCE, 'utf-8');
        const result = spawnSync(tsx, [scriptPath], {
            cwd: CONNECTORS_PKG_DIR,
            encoding: 'utf-8',
            env: {
                ...process.env,
                // Credential bytes — child reads from here, never echoes them.
                MJ_T8_CRED_JSON: credJson,
                MJ_T8_CONNECTOR_SOURCE: identity.SourcePath,
                MJ_T8_CONNECTOR_CLASS: identity.ClassName,
                MJ_T8_INTEGRATION_NAME: identity.IntegrationName ?? identity.ClassName,
                MJ_T8_RESULT_SENTINEL: LIVE_RESULT_SENTINEL,
            },
        });
        return interpretLiveResult(result.stdout ?? '', result.stderr ?? '', result.status, connector, identity);
    }
    finally {
        // Best-effort cleanup of the temp runner; never let it block the result.
        try { rmSync(scriptDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

/**
 * Parse the child's stdout for the single sentinel result line and translate it
 * into a Pass/Fail tier result. A live test PASSES when `TestConnection` reports
 * success; otherwise it fails with the non-secret error surfaced by the connector.
 * stdout/stderr noise (connector `console.log`s) is dropped — only the sentinel
 * line is trusted, and it never carries credential bytes.
 */
function interpretLiveResult(
    stdout: string,
    stderr: string,
    exitStatus: number | null,
    connector: string,
    identity: ConnectorIdentity,
): TierHandlerResult {
    const parsed = extractSentinelResult(stdout);
    if (!parsed) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                `Read-only live runner did not emit a result for "${connector}" (exit=${String(exitStatus)}).`,
                ...(stderr.trim() ? [scrubLine(stderr.trim()).slice(0, 500)] : []),
            ],
            Details: { connector, class: identity.ClassName },
        };
    }

    if (!parsed.ok) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [parsed.reason ? `Read-only live setup failed: ${parsed.reason}` : 'Read-only live setup failed.'],
            Details: { connector, class: identity.ClassName },
        };
    }

    const calls = parsed.calls ?? {};
    const testConn = calls['TestConnection'];
    const passed = testConn?.success === true;
    const summary = summarizeCalls(parsed.integrationName ?? identity.ClassName, calls);
    const errors = collectCallErrors(calls);

    return {
        Status: passed ? 'Pass' : 'Fail',
        Output: summary,
        Errors: passed ? [] : (errors.length > 0 ? errors : ['TestConnection did not report success.']),
        Details: {
            connector,
            class: identity.ClassName,
            integrationName: parsed.integrationName,
            readOnly: true,
            calls,
        },
    };
}

/** Find the sentinel-prefixed result line and JSON-parse it. */
function extractSentinelResult(stdout: string): LiveRunnerOutput | null {
    const lines = stdout.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const idx = line.indexOf(LIVE_RESULT_SENTINEL);
        if (idx < 0) continue;
        const json = line.slice(idx + LIVE_RESULT_SENTINEL.length);
        try {
            return JSON.parse(json) as LiveRunnerOutput;
        } catch {
            return null;
        }
    }
    return null;
}

/** One-line-per-call non-secret human summary for the tier `Output`. */
function summarizeCalls(integrationName: string, calls: Record<string, LiveCallOutcome>): string {
    const lines = [`READ-ONLY LIVE ${integrationName}`];
    for (const [name, outcome] of Object.entries(calls)) {
        const status = outcome.success === true ? 'OK' : (outcome.error ? 'ERR' : 'INFO');
        const detail = Object.entries(outcome)
            .filter(([k]) => k !== 'success' && k !== 'error')
            .map(([k, v]) => `${k}=${formatScalar(v)}`)
            .join(' ');
        lines.push(`  ${status} ${name}${detail ? ` (${detail})` : ''}`);
    }
    return lines.join('\n');
}

/** Flatten error fields across all calls into the tier `Errors` array. */
function collectCallErrors(calls: Record<string, LiveCallOutcome>): string[] {
    const errors: string[] = [];
    for (const [name, outcome] of Object.entries(calls)) {
        if (typeof outcome.error === 'string' && outcome.error.length > 0) {
            errors.push(`[${name}] ${outcome.error}`);
        }
    }
    return errors;
}

/** Render a primitive/array value compactly for the summary line (objects → JSON). */
function formatScalar(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((v) => String(v)).join(',')}]`;
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Last-line defense: never echo anything that looks like the credential env value. */
function scrubLine(line: string): string {
    const cred = process.env.MJ_T8_CRED_JSON;
    return cred && cred.length > 0 ? line.split(cred).join('[REDACTED]') : line;
}

// ── Connector identity resolution ────────────────────────────────────
// Resolution (registry ClassName → `<ClassName>.ts`, with a filename fallback)
// and the `tsx` bin locator now live in `./tiers/childRunner.ts` so every tier
// shares one implementation. T4/T8 below use the imported `resolveConnectorIdentity`.

/**
 * Source of the short-lived child runner executed via `tsx`. Written to a temp
 * file at run time (NOT a tracked source file). It reads the connector source +
 * credential bytes from env, performs ONLY read-only operations, and prints a
 * single sentinel-prefixed JSON line of NON-SECRET results.
 *
 * SECURITY: the child never prints `MJ_T8_CRED_JSON`; it only emits counts,
 * status codes, success flags, and object names.
 */
const LIVE_RUNNER_SOURCE = `/* eslint-disable */
// Auto-generated read-only live connector runner (T8). NEVER prints credential bytes.
const SENTINEL = process.env.MJ_T8_RESULT_SENTINEL || '${LIVE_RESULT_SENTINEL}';
const SOURCE = process.env.MJ_T8_CONNECTOR_SOURCE;
const CLASS = process.env.MJ_T8_CONNECTOR_CLASS;
const INTEGRATION_NAME = process.env.MJ_T8_INTEGRATION_NAME;
const CRED_JSON = process.env.MJ_T8_CRED_JSON;

function emit(obj) { process.stdout.write('\\n' + SENTINEL + JSON.stringify(obj) + '\\n'); }
function clip(v, n) { const s = v == null ? String(v) : String(v); return s.length > n ? s.slice(0, n) : s; }

async function main() {
  if (!SOURCE || !CLASS) { emit({ ok: false, reason: 'missing connector source/class env' }); return; }
  let mod;
  try { mod = await import(SOURCE); }
  catch (e) { emit({ ok: false, reason: 'import failed: ' + clip(e && e.message ? e.message : e, 200) }); return; }
  const Ctor = mod[CLASS];
  if (typeof Ctor !== 'function') { emit({ ok: false, reason: 'class ' + CLASS + ' not exported from source' }); return; }

  let connector;
  try { connector = new Ctor(); }
  catch (e) { emit({ ok: false, reason: 'instantiation failed: ' + clip(e && e.message ? e.message : e, 200) }); return; }

  // In-memory CompanyIntegration: credential JSON via the no-DB Configuration path.
  // CredentialID is left null so the connector never touches the MJ metadata provider / database.
  const companyIntegration = {
    ID: 'live-test', IntegrationID: 'live-test',
    Name: INTEGRATION_NAME || CLASS,
    CredentialID: null,
    Configuration: CRED_JSON || '',
  };
  const contextUser = { ID: 'live-test', Email: 'live-test@local', Name: 'live-test' };

  const out = { ok: true, integrationName: connector.IntegrationName, calls: {} };

  // 1) READ-ONLY: TestConnection
  try {
    const tc = await connector.TestConnection(companyIntegration, contextUser);
    out.calls.TestConnection = { success: !!(tc && tc.Success), message: clip(tc && tc.Message, 240), serverVersion: tc && tc.ServerVersion };
  } catch (e) { out.calls.TestConnection = { success: false, error: clip(e && e.message ? e.message : e, 240) }; }

  // 2) READ-ONLY: DiscoverObjects
  let firstObject;
  try {
    const objs = await connector.DiscoverObjects(companyIntegration, contextUser);
    const list = Array.isArray(objs) ? objs : [];
    firstObject = list.length > 0 ? list[0].Name : undefined;
    out.calls.DiscoverObjects = { success: true, objectCount: list.length, sampleObjects: list.slice(0, 8).map((o) => o && o.Name) };
  } catch (e) { out.calls.DiscoverObjects = { success: false, error: clip(e && e.message ? e.message : e, 240) }; }

  // 3) READ-ONLY: ONE FetchChanges page (single batch, no watermark advance persisted).
  if (firstObject) {
    try {
      const ctx = {
        CompanyIntegration: companyIntegration,
        ObjectName: firstObject,
        WatermarkValue: null,
        BatchSize: 1,
        ContextUser: contextUser,
      };
      const fb = await connector.FetchChanges(ctx);
      const records = fb && Array.isArray(fb.Records) ? fb.Records : [];
      out.calls.FetchChanges = { success: true, object: firstObject, recordCount: records.length, hasMore: !!(fb && fb.HasMore) };
    } catch (e) { out.calls.FetchChanges = { success: false, object: firstObject, error: clip(e && e.message ? e.message : e, 240) }; }
  }

  emit(out);
}

main().catch((e) => { emit({ ok: false, reason: 'runner crashed: ' + clip(e && e.message ? e.message : e, 200) }); });
`;
