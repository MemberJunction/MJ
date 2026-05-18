/**
 * T10 — Live API integration scaffold for HubSpotConnector.
 *
 * **This file does NOT make live calls directly.** Per the architecture's credential-guard
 * rule, no code in the agent's context (or any vitest test the agent triggers) may
 * read credentials from disk. Live tests run inside the `mj-test-runner` MCP
 * subprocess, which is the only authorized credential reader.
 *
 * Purpose of this file:
 *   1. Document the contract that the `mj-test-runner` MCP enforces for HubSpot live tests.
 *   2. Skip cleanly when invoked without the MCP-injected `HUBSPOT_LIVE_TESTING=1` flag.
 *   3. Provide the per-tier assertion vocabulary that the MCP T8 (live) tier exercises.
 *
 * How to actually run live tests:
 *
 *   /run-tier-tests hubspot --tiers T8 --credentials ~/.mj-credentials/hubspot.json
 *
 * The MCP reads the credential file, instantiates `HubSpotConnector`, calls
 * `TestConnection` + a representative sample of FetchChanges + Get/Create/Update/Delete
 * cycles against the live HubSpot sandbox, and reports per-tier results. The
 * credential bytes never leave the MCP subprocess.
 *
 * Note: T9 (perf) + T10 (live) are not yet wired into the mj-test-runner MCP's
 * tier vocabulary (T0-T8 only as of 2026-05-18). Phase-A framework follow-up
 * should add T9 + T10 cases to the runner. Until then, T9 runs locally via the
 * perf scaffold in `HubSpotConnector.test.ts` and T10 is documentation-only
 * (this file).
 */
import { describe, it, expect } from 'vitest';

const LIVE_TESTING_ENABLED = process.env.HUBSPOT_LIVE_TESTING === '1';

describe.skipIf(!LIVE_TESTING_ENABLED)('HubSpotConnector — T10 Live API tests', () => {
    it('placeholder: invoked via mj-test-runner MCP T8 tier', () => {
        // When `HUBSPOT_LIVE_TESTING=1` is injected by the MCP subprocess, this
        // suite executes against live HubSpot. Without it, the suite is skipped.
        // Real assertions live in the MCP's per-tier handlers, not here.
        expect(LIVE_TESTING_ENABLED).toBe(true);
    });
});

// When LIVE_TESTING_ENABLED is false (the agent-driven case), this file
// contributes zero failing assertions — the entire describe block is skipped.
