/**
 * Test-runner MCP types.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.19.1
 */
import { z } from 'zod';

/**
 * Identifier for a single test tier. Covers T0–T8 (no T9–T12). EVERY tier is
 * implemented — none are stubs.
 *
 * REAL tiers (run against the real `packages/Integration/connectors` package):
 * - `T0_StaticValidation`   — `tsc --noEmit` over the real connectors package.
 * - `T1_InvariantValidator` — deterministic structural-invariant checks (see {@link ./invariants}).
 * - `T2_CrossProgrammaticConsistency` — runs the connector's discovery twice and diffs the
 *   object/field/PK/FK claims; divergence → Fail. CREDENTIAL-FREE.
 * - `T3_DocStructureSelfCheck` — re-extracts via the connector's discovery and asserts the
 *   structured output is stable against persisted integration metadata; drift → Fail. CREDENTIAL-FREE.
 * - `T4_MockedFixture`      — `vitest run <ClassName>` over the connector's real test file.
 * - `T5_MockHTTPServer`     — boots a `node:http` server (or temp file for a file-feed connector)
 *   serving the connector's recorded fixtures, points the connector at it, and runs
 *   DiscoverObjects + FetchChanges for every object; no fixtures → Fail (`no-fixtures`). CREDENTIAL-FREE.
 * - `T6_LocalSQLiteBackend` — pulls via FetchChanges against the mock/fixtures and applies into a
 *   `node:sqlite` DB, asserting create/update/delete/ordering semantics; no fixtures → Fail. CREDENTIAL-FREE.
 * - `T7_OpenAPIValidation`  — validates the connector's declared API paths against an OpenAPI spec
 *   when one exists; no spec → `Skipped` (`no-openapi-spec`, a legitimate not-applicable). CREDENTIAL-FREE.
 * - `T8_AuthenticatedEndpoint` — **READ-ONLY live**. Instantiates the connector and runs
 *   only non-mutating ops (TestConnection, DiscoverObjects, one FetchChanges page). There is
 *   NO write/bidirectional tier and NO `allowWrite`; the live tier never Creates/Updates/Deletes.
 * - `T9_EndpointReality` — CREDENTIAL-FREE observe-only network probe of the connector's OWN
 *   declared endpoints: a `401/403` proves the endpoint+auth-scheme are real, `404` wrong path,
 *   `405` wrong verb; introspects `WWW-Authenticate` / `X-RateLimit-*` / `Retry-After`; OPTIONS/HEAD
 *   for verbs; TLS/DNS reachability. Sends NO credentials. `Skipped` when endpoints aren't reachable.
 * - `T10_TransportSmoke` — CREDENTIAL-FREE. Points the connector's HTTP layer at public zero-auth
 *   utility APIs (HTTPBin echo, JSONPlaceholder) to prove the generic transport machinery (auth-header
 *   injection, content-type, pagination cursor, JSON parse, non-2xx handling) over a real socket.
 * - `T11_SandboxProbe` — CREDENTIAL-FREE. When the connector declares a public sandbox/demo base URL
 *   (`Configuration.SandboxBaseURL`), runs read-only discovery+fetch against it; else `Skipped`.
 *
 * EXECUTION ORDER NOTE: the verification ladder runs tiers in its OWN array order (the whole
 * credential-free battery FIRST, the live `T8_AuthenticatedEndpoint` LAST), NOT by tier number.
 * Tier numbers are unique IDs only; T9–T11 are credential-free and execute before the live rung.
 *
 * Every tier returns an HONEST status: `Pass`/`Fail` with the specific missing input, or
 * `Skipped` with a real not-applicable reason (e.g. `no-openapi-spec`). No tier returns a
 * `not-implemented` stub.
 */
export type TierID =
    | 'T0_StaticValidation'
    | 'T1_InvariantValidator'
    | 'T2_CrossProgrammaticConsistency'
    | 'T3_DocStructureSelfCheck'
    | 'T4_MockedFixture'
    | 'T5_MockHTTPServer'
    | 'T6_LocalSQLiteBackend'
    | 'T7_OpenAPIValidation'
    | 'T8_AuthenticatedEndpoint'
    | 'T9_EndpointReality'
    | 'T10_TransportSmoke'
    | 'T11_SandboxProbe'
    | 'T12_IdempotencyReplay';

/**
 * Canonical `not-implemented` marker token. NO tier emits this anymore — every tier is
 * implemented and returns an honest `Pass`/`Fail`/`Skipped(real-reason)` status. The
 * constant is retained as a defensive sentinel: the ladder MAY still scan for it and treat
 * any `Skipped` result carrying it as red, so a future stub can never masquerade as a pass.
 * A legitimately not-applicable skip (e.g. `no-openapi-spec`) never carries this token.
 */
export const NOT_IMPLEMENTED_REASON = 'not-implemented';

/**
 * Zod schema validating the input arguments to the `run_tier` tool.
 */
export const RunTierRequestSchema = z.object({
    Connector: z.string(),
    Tier: z.enum([
        'T0_StaticValidation',
        'T1_InvariantValidator',
        'T2_CrossProgrammaticConsistency',
        'T3_DocStructureSelfCheck',
        'T4_MockedFixture',
        'T5_MockHTTPServer',
        'T6_LocalSQLiteBackend',
        'T7_OpenAPIValidation',
        'T8_AuthenticatedEndpoint',
        'T9_EndpointReality',
        'T10_TransportSmoke',
        'T11_SandboxProbe',
        'T12_IdempotencyReplay',
    ]),
    /**
     * Only relevant for T8 (read-only live). Path on disk to the credential JSON file. The file is
     * read INSIDE the subprocess and its bytes are NEVER returned to the agent or logged.
     */
    CredentialFilePath: z.string().optional(),
});

/** Parsed, validated `run_tier` request. */
export type RunTierRequest = z.infer<typeof RunTierRequestSchema>;

/**
 * Result of running a single tier. Designed to NEVER carry credential bytes.
 */
export interface TierResult {
    Tier: TierID;
    Connector: string;
    Status: 'Pass' | 'Fail' | 'Skipped';
    DurationMs: number;
    Output: string;
    Errors: string[];
    /** Tier-specific details. Never contains credential bytes. */
    Details?: Record<string, unknown>;
}
