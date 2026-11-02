import { describe, it, expect } from 'vitest';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { DiagnosticsChecks } from '../checks/diagnostics.checks.js';

describe('DiagnosticsChecks (DIAG1–DIAG4)', () => {
    const mockCtx = {
        User: { ID: 'it-user-001', Email: 'diag-tester@example.com' },
    } as unknown as IntegrationCheckContext;

    for (const check of DiagnosticsChecks) {
        it(`${check.Id} — ${check.Name}`, async () => {
            await check.Fn(mockCtx);
            expect(true).toBe(true);
        });
    }
});
