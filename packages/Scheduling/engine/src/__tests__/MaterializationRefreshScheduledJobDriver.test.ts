import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatusEx: vi.fn() };
});

// Entity classes are plain bases here; the typed doubles keep their field values in memory.
vi.mock('@memberjunction/core-entities', () => ({
    MJMaterializedResultEntity: class {},
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {}
}));

vi.mock('@memberjunction/materialization', () => ({
    MaterializationRefresher: class {}
}));

vi.mock('../CronExpressionHelper', () => ({
    CronExpressionHelper: { GetNextRunTime: vi.fn() }
}));

import { MaterializationRefreshScheduledJobDriver } from '../drivers/MaterializationRefreshScheduledJobDriver';
import { TestContext, TestScheduledJob } from './helpers/scheduling-doubles';

describe('MaterializationRefreshScheduledJobDriver.FormatNotification', () => {
    const driver = new MaterializationRefreshScheduledJobDriver();
    const context = TestContext(new TestScheduledJob({ ID: 'job-1', Name: 'Refresh' }));

    it('reports the failed count when Failed is a positive number', () => {
        const notification = driver.FormatNotification(context, { Success: false, Details: { Refreshed: 3, DueCount: 5, Failed: 2 } });
        expect(notification.Body).toBe('Refreshed 3 of 5 due materialization(s); 2 failed.');
    });

    it('does not report failures when Failed is not a number', () => {
        const notification = driver.FormatNotification(context, { Success: true, Details: { Refreshed: 5, DueCount: 5, Failed: '2' } });
        expect(notification.Body).toBe('Refreshed 5 of 5 due materialization(s).');
    });
});
