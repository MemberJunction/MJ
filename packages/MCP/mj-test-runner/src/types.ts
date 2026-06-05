/**
 * Test-runner MCP types.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.19.1
 */
import { z } from 'zod';

/**
 * Identifier for a single test tier. Covers T0–T8 (no T9–T12).
 *
 * REAL tiers (run against the real `packages/Integration/connectors` package):
 * - `T0_StaticValidation`   — `tsc --noEmit` over the real connectors package.
 * - `T1_InvariantValidator` — deterministic structural-invariant checks (see {@link ./invariants}).
 * - `T4_MockedFixture`      — `vitest run <ClassName>` over the connector's real test file.
 * - `T8_AuthenticatedEndpoint` — **READ-ONLY live**. Instantiates the connector and runs
 *   only non-mutating ops (TestConnection, DiscoverObjects, one FetchChanges page). There is
 *   NO write/bidirectional tier and NO `allowWrite`; the live tier never Creates/Updates/Deletes.
 *
 * NOT-IMPLEMENTED tiers: `T2`/`T3`/`T5`/`T6`/`T7` return `Status: 'Skipped'` and carry a
 * `'<Tier> not-implemented'` entry in {@link TierResult.Errors} (see {@link NOT_IMPLEMENTED_REASON})
 * so the ladder can refuse to treat the skip as a pass. This is distinct from a legitimately
 * not-applicable skip, which would carry no such marker.
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
    | 'T8_AuthenticatedEndpoint';

/**
 * Canonical reason token a not-yet-implemented tier embeds in its `Errors` array, e.g.
 * `'T5_MockHTTPServer not-implemented'`. The ladder MUST scan for this token and refuse to
 * count such a `Skipped` result as a pass. A skip WITHOUT this token means the tier was
 * legitimately not applicable to the connector.
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
