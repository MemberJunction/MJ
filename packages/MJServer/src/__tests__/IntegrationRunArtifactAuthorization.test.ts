import { describe, it, expect } from 'vitest';
import type { IntegrationRunManifest } from '@memberjunction/integration-progress-artifacts';
import { AuthorizeRunArtifact } from '../integration/RunArtifactAuthorization.js';

/**
 * Who may read a run artifact.
 *
 * This is a security boundary, not plumbing. A run artifact is one undivided event stream carrying
 * migration descriptions, affected table names and error text; an RSU batch can span several
 * connections, and there is no mechanism to serve a caller a partial view of one. So the rule is
 * AND — authorized for EVERY connection the run touched — because "any one of them" would hand
 * connection A's schema-change descriptions to a user who only holds rights on connection B.
 *
 * The per-connection check itself (a RunView under the caller's context, so the provider applies
 * row-level security) is exercised elsewhere; these tests stub it to an allowlist and lock the
 * COMBINING rule, which is the part that changed.
 */

/**
 * A per-connection check that answers from `allowed` and records what it was asked, so the tests can
 * assert the short-circuit as well as the verdict. Memoization lives in the resolver's cache, so a
 * shared `asked` list across calls shows exactly how many lookups the rule performed.
 */
function checkFor(allowed: string[]): { canRead: (id: string) => Promise<boolean>; asked: string[] } {
    const asked: string[] = [];
    const seen = new Map<string, boolean>();
    return {
        asked,
        canRead: async (companyIntegrationID: string): Promise<boolean> => {
            const cached = seen.get(companyIntegrationID);
            if (cached !== undefined) return cached;
            asked.push(companyIntegrationID);
            const verdict = allowed.includes(companyIntegrationID);
            seen.set(companyIntegrationID, verdict);
            return verdict;
        },
    };
}

function manifestOf(over: Partial<IntegrationRunManifest>): IntegrationRunManifest {
    return { runID: 'r1', runKind: 'RSU', startedAt: new Date().toISOString(), ...over };
}

describe('run-artifact authorization', () => {
    it('authorizes a single-connection run for a caller who holds that connection', async () => {
        const { canRead } = checkFor(['CI-1']);
        const result = await AuthorizeRunArtifact(
            manifestOf({ companyIntegrationID: 'CI-1', companyIntegrationIDs: ['CI-1'] }),
            canRead
        );
        expect(result.Authorized).toBe(true);
    });

    it('authorizes an RSU run at all — the manifest identity is what unblocks it', async () => {
        // Regression guard for the original defect: an RSU manifest carried no connection, the check
        // returned false on the missing field, and every RSU run answered "not authorized" to
        // IntegrationGetRun and IntegrationTailRunEvents.
        const { canRead } = checkFor(['CI-1']);
        const withIdentity = await AuthorizeRunArtifact(manifestOf({ companyIntegrationIDs: ['CI-1'] }), canRead);
        const withoutIdentity = await AuthorizeRunArtifact(manifestOf({}), canRead);
        expect(withIdentity.Authorized).toBe(true);
        expect(withoutIdentity.Authorized).toBe(false);
    });

    it('requires EVERY connection of a multi-connection batch — AND, not any', async () => {
        // The leak this prevents: a user with rights only on CI-2 reading CI-1's schema-change
        // descriptions out of the shared batch stream.
        const { canRead } = checkFor(['CI-2']);
        const result = await AuthorizeRunArtifact(manifestOf({ companyIntegrationIDs: ['CI-1', 'CI-2'] }), canRead);
        expect(result.Authorized).toBe(false);
        expect(result.DeniedCompanyIntegrationID).toBe('CI-1');
    });

    it('denies the batch even when the caller holds all but one of its connections', async () => {
        const { canRead } = checkFor(['CI-1', 'CI-2']);
        const result = await AuthorizeRunArtifact(manifestOf({ companyIntegrationIDs: ['CI-1', 'CI-2', 'CI-3'] }), canRead);
        expect(result.Authorized).toBe(false);
        expect(result.DeniedCompanyIntegrationID).toBe('CI-3');
    });

    it('authorizes a multi-connection batch only for a caller who holds all of them', async () => {
        const { canRead } = checkFor(['CI-1', 'CI-2']);
        const result = await AuthorizeRunArtifact(manifestOf({ companyIntegrationIDs: ['CI-1', 'CI-2'] }), canRead);
        expect(result.Authorized).toBe(true);
    });

    it('stops at the first denial, so a caller cannot probe what else a run covers', async () => {
        const { canRead, asked } = checkFor([]);
        const result = await AuthorizeRunArtifact(manifestOf({ companyIntegrationIDs: ['CI-1', 'CI-2', 'CI-3'] }), canRead);
        expect(result.DeniedCompanyIntegrationID).toBe('CI-1');
        expect(asked).toEqual(['CI-1']);
    });

    it('denies a run with no connection identity at all, without asking anything', async () => {
        // Non-tenant-scoped artifacts are not exposed through the per-company endpoints, and an
        // identity-less run must not become readable as a side effect of runs gaining a set field.
        const { canRead, asked } = checkFor(['CI-1']);
        for (const manifest of [{}, { companyIntegrationIDs: [] }]) {
            const result = await AuthorizeRunArtifact(manifestOf(manifest), canRead);
            expect(result.Authorized).toBe(false);
            expect(result.DeniedCompanyIntegrationID).toBeUndefined();
        }
        expect(asked).toEqual([]);
    });

    it('falls back to the singular field for runs written before the set existed', async () => {
        // Every sync/discovery run carries only `companyIntegrationID`; those must keep working.
        const { canRead } = checkFor(['CI-9']);
        const ok = await AuthorizeRunArtifact(manifestOf({ runKind: 'SyncRun', companyIntegrationID: 'CI-9' }), canRead);
        const denied = await AuthorizeRunArtifact(manifestOf({ runKind: 'SyncRun', companyIntegrationID: 'CI-8' }), canRead);
        expect(ok.Authorized).toBe(true);
        expect(denied.Authorized).toBe(false);
        expect(denied.DeniedCompanyIntegrationID).toBe('CI-8');
    });

    it('prefers the set over the singular field when both are present', async () => {
        // A batch that also happens to carry a singular value must still be judged on the whole set.
        const { canRead } = checkFor(['CI-1']);
        const result = await AuthorizeRunArtifact(
            manifestOf({ companyIntegrationID: 'CI-1', companyIntegrationIDs: ['CI-1', 'CI-2'] }),
            canRead
        );
        expect(result.Authorized).toBe(false);
        expect(result.DeniedCompanyIntegrationID).toBe('CI-2');
    });
});
