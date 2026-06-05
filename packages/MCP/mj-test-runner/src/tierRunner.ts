/**
 * Per-tier test runner. Each tier dispatches to a separate handler.
 *
 * **CRITICAL SECURITY INVARIANT**: credential file paths are read INSIDE this
 * subprocess only. They are NEVER returned in the tool result, never logged,
 * never written to a file the agent can read. The agent sees Pass/Fail and
 * non-secret error messages; it never sees credential bytes.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.19.2
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { RunTierRequest, TierResult } from './types.js';
import { ValidateInvariants } from './invariants.js';

/** Portion of a {@link TierResult} produced by an individual tier handler. */
type TierHandlerResult = Omit<TierResult, 'Tier' | 'Connector' | 'DurationMs'>;

/** Fields populated up-front before a tier handler runs. */
type TierResultBase = Pick<TierResult, 'Tier' | 'Connector' | 'DurationMs'>;

const REGISTRY_ROOT = process.env.MJ_CONNECTORS_REGISTRY ?? resolve(process.cwd(), 'packages/Integration/connectors-registry');

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
                return finish(base, runStaticValidation(request.Connector), start);
            case 'T1_InvariantValidator':
                return finish(base, runInvariantValidator(request.Connector), start);
            case 'T2_CrossProgrammaticConsistency':
                return finish(base, runCrossProgrammaticConsistency(request.Connector), start);
            case 'T3_DocStructureSelfCheck':
                return finish(base, runDocStructureSelfCheck(request.Connector), start);
            case 'T4_MockedFixture':
                return finish(base, runMockedFixture(request.Connector), start);
            case 'T5_MockHTTPServer':
                return finish(base, runMockHTTPServer(request.Connector), start);
            case 'T6_LocalSQLiteBackend':
                return finish(base, runLocalSQLiteBackend(request.Connector), start);
            case 'T7_OpenAPIValidation':
                return finish(base, runOpenAPIValidation(request.Connector), start);
            case 'T8_AuthenticatedEndpoint':
                return finish(base, runAuthenticatedEndpoint(request.Connector, request.CredentialFilePath), start);
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

// ── Tier handlers ────────────────────────────────────────────────────

function runStaticValidation(connector: string): TierHandlerResult {
    const dir = resolve(REGISTRY_ROOT, connector);
    if (!existsSync(dir)) {
        return { Status: 'Fail', Output: '', Errors: [`Connector directory missing: ${dir}`] };
    }
    const result = spawnSync('npx', ['tsc', '--noEmit'], { cwd: dir, encoding: 'utf-8' });
    return {
        Status: result.status === 0 ? 'Pass' : 'Fail',
        Output: result.stdout,
        Errors: result.stderr ? [result.stderr] : [],
    };
}

/**
 * T1 structural invariants. Runs the four deterministic checks inline (the
 * `npx mj-validate-invariants` bin never existed — the retired
 * `connector-validator` package's invariants moved into this tier per
 * `.claude/agents/testing-agent.md` §T1).
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

function runCrossProgrammaticConsistency(connector: string): TierHandlerResult {
    // LLM_COMPLETE: cross-check IO/IOF counts between extractor-script output and persisted metadata.
    // Phase 0 ships the contract; full implementation arrives with the IOIOFExtractor agent.
    return { Status: 'Skipped', Output: '', Errors: ['T2 cross-consistency check stubbed in Phase 0'], Details: { connector } };
}

function runDocStructureSelfCheck(connector: string): TierHandlerResult {
    return { Status: 'Skipped', Output: '', Errors: ['T3 doc-structure self-check stubbed in Phase 0'], Details: { connector } };
}

function runMockedFixture(connector: string): TierHandlerResult {
    const dir = resolve(REGISTRY_ROOT, connector);
    const result = spawnSync('npx', ['vitest', 'run'], { cwd: dir, encoding: 'utf-8' });
    return {
        Status: result.status === 0 ? 'Pass' : 'Fail',
        Output: result.stdout,
        Errors: result.stderr ? [result.stderr] : [],
    };
}

function runMockHTTPServer(connector: string): TierHandlerResult {
    return { Status: 'Skipped', Output: '', Errors: ['T5 mock HTTP server stubbed in Phase 0'], Details: { connector } };
}

function runLocalSQLiteBackend(connector: string): TierHandlerResult {
    return { Status: 'Skipped', Output: '', Errors: ['T6 local SQLite backend stubbed in Phase 0'], Details: { connector } };
}

function runOpenAPIValidation(connector: string): TierHandlerResult {
    return { Status: 'Skipped', Output: '', Errors: ['T7 OpenAPI validation stubbed in Phase 0'], Details: { connector } };
}

function runAuthenticatedEndpoint(connector: string, credentialFilePath?: string): TierHandlerResult {
    if (!credentialFilePath) {
        return { Status: 'Fail', Output: '', Errors: ['T8 requires CredentialFilePath but none provided'] };
    }
    if (!existsSync(credentialFilePath)) {
        return { Status: 'Fail', Output: '', Errors: ['T8 credential file does not exist on disk'] };
    }
    // SECURITY: the credential file is read INSIDE this subprocess. The actual
    // contents are passed via env var to a child runner (also inside this
    // subprocess), then discarded. The agent gets Pass/Fail only.
    //
    // LLM_COMPLETE: spawn the connector's TestConnection runner with the
    // credential bytes loaded but not returned. Phase 0 ships the security
    // contract; the per-connector test runner script is deferred.
    return {
        Status: 'Skipped',
        Output: '',
        Errors: ['T8 authenticated endpoint runner stubbed in Phase 0 (security contract present; runner deferred)'],
        Details: { connector, credentialFilePresent: true },
    };
}
