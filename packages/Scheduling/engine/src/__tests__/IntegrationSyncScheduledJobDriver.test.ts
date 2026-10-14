import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatusEx: vi.fn() };
});

vi.mock('@memberjunction/integration-engine', () => ({
    IntegrationEngine: { Instance: {} }
}));

import { IntegrationSyncScheduledJobDriver } from '../drivers/IntegrationSyncScheduledJobDriver';
import { TestContext, TestScheduledJob } from './helpers/scheduling-doubles';

describe('IntegrationSyncScheduledJobDriver.FormatNotification', () => {
    const driver = new IntegrationSyncScheduledJobDriver();
    const context = TestContext(new TestScheduledJob({ ID: 'job-1', Name: 'Nightly Sync' }));

    it('formats a numeric duration in seconds', () => {
        const n = driver.FormatNotification(context, { Success: true, Details: { Duration: 1500 } });
        expect(n.Body).toContain('Duration: 1.5s');
    });

    it('shows N/A for a duration that is not a number', () => {
        const n = driver.FormatNotification(context, { Success: true, Details: { Duration: '1500' } });
        expect(n.Body).toContain('Duration: N/A');
    });
});
