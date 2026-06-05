/**
 * Test-runner MCP types.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.19.1
 */
import { z } from 'zod';

/**
 * Identifier for a single test tier. Covers T0–T8.
 *
 * - `T0`–`T1`, `T4` are real implementations.
 * - `T2`/`T3`/`T5`/`T6`/`T7`/`T8` are stubbed in Phase 0 and return `Status: 'Skipped'`.
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
    /** Only relevant for T8. Path on disk to the credential file. NEVER sent over the wire to agents. */
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
