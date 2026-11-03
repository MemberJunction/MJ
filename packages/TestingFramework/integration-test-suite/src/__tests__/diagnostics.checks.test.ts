import { describe, it, expect } from 'vitest';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { DiagnosticsChecks } from '../checks/diagnostics.checks.js';

/** DIAG2 saves and reads session chunks in the database, so only the integration tier (IT163) runs it. */
const DATABASE_CHECK_IDS = new Set(['diagnostics.DIAG2']);

describe('DiagnosticsChecks (DIAG1, DIAG3, DIAG4)', () => {
    const mockCtx = {
        User: { ID: 'it-user-001', Email: 'diag-tester@example.com' },
    } as unknown as IntegrationCheckContext;

    for (const check of DiagnosticsChecks.filter((c) => !DATABASE_CHECK_IDS.has(c.Id))) {
        it(`${check.Id} — ${check.Name}`, async () => {
            await expect(check.Fn(mockCtx)).resolves.toBeUndefined();
        });
    }
});
