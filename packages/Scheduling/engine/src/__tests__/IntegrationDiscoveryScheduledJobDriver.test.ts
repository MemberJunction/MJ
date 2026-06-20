import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies (mirrors ActionScheduledJobDriver.test.ts).
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    SafeJSONParse: (value: string) => { try { return JSON.parse(value); } catch { return null; } },
}));

const mockGetEntityObject = vi.fn();
vi.mock('@memberjunction/core', () => ({
    ValidationResult: class { Success = false; Errors: Array<{ Source: string; Message: string; Value: unknown; Type: string }> = []; },
    ValidationErrorInfo: class { constructor(public Source: string, public Message: string, public Value: unknown, public Type: string) {} },
    ValidationErrorType: { Failure: 'Failure' },
    UserInfo: class { ID = 'user-1'; },
    Metadata: { Provider: { GetEntityObject: (...a: unknown[]) => mockGetEntityObject(...a) } },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

const mockPipelineRun = vi.fn();
vi.mock('@memberjunction/integration-engine', () => ({
    IntegrationEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined) } },
    ConnectorFactory: { Resolve: vi.fn().mockReturnValue({ /* connector stub */ }) },
    IntegrationConnectorCreationPipeline: class { Run(...a: unknown[]) { return mockPipelineRun(...a); } },
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationContent: class {},
}));

import { IntegrationDiscoveryScheduledJobDriver } from '../drivers/IntegrationDiscoveryScheduledJobDriver';

describe('IntegrationDiscoveryScheduledJobDriver', () => {
    let driver: IntegrationDiscoveryScheduledJobDriver;
    const ctx = (extra: Record<string, unknown> = {}) => ({
        ContextUser: { ID: 'user-1' },
        Provider: undefined,
        Schedule: { ID: 'sched-1', Name: 'Nightly discovery', Configuration: JSON.stringify({ CompanyIntegrationID: 'ci-1' }) },
        Run: { ID: 'run-1' },
        ...extra,
    });

    beforeEach(() => { driver = new IntegrationDiscoveryScheduledJobDriver(); vi.clearAllMocks(); });

    describe('ValidateConfiguration', () => {
        it('succeeds when CompanyIntegrationID is present', () => {
            const r = driver.ValidateConfiguration({ Configuration: JSON.stringify({ CompanyIntegrationID: 'ci-1' }) });
            expect(r.Success).toBe(true);
            expect(r.Errors).toHaveLength(0);
        });
        it('fails when CompanyIntegrationID is missing', () => {
            const r = driver.ValidateConfiguration({ Configuration: JSON.stringify({}) });
            expect(r.Success).toBe(false);
            expect(r.Errors[0].Source).toBe('Configuration.CompanyIntegrationID');
        });
        it('fails on invalid JSON', () => {
            const r = driver.ValidateConfiguration({ Configuration: 'not json' });
            expect(r.Success).toBe(false);
            expect(r.Errors.length).toBeGreaterThan(0);
        });
    });

    describe('Execute', () => {
        it('returns failure (not promoted) when the CompanyIntegration is not found — and never runs the pipeline', async () => {
            mockGetEntityObject.mockResolvedValue({ Load: vi.fn().mockResolvedValue(false) });
            const res = await driver.Execute(ctx() as Parameters<typeof driver.Execute>[0]);
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('not found');
            expect(mockPipelineRun).not.toHaveBeenCalled(); // no schema work attempted against a missing connection
        });

        it('runs the refresh pipeline and maps its counts on the happy path', async () => {
            mockGetEntityObject.mockResolvedValue({ Load: vi.fn().mockResolvedValue(true), IntegrationID: 'int-1' });
            mockPipelineRun.mockResolvedValue({
                Success: true, RunID: 'r-1', UnresolvedObjects: [],
                PersistResult: { ObjectsCreated: 2, FieldsCreated: 9, ObjectsUpdated: 1, FieldsUpdated: 4 },
            });
            const res = await driver.Execute(ctx() as Parameters<typeof driver.Execute>[0]);
            expect(mockPipelineRun).toHaveBeenCalledTimes(1);
            // §13 — a scheduled discovery refresh defaults to comprehensive (DeactivateAbsent true).
            expect(mockPipelineRun.mock.calls[0][0]).toMatchObject({ TriggerType: 'Scheduled', DeactivateAbsent: true });
            expect(res.Success).toBe(true);
            expect(res.Details).toMatchObject({ ObjectsCreated: 2, FieldsCreated: 9, ObjectsUpdated: 1, FieldsUpdated: 4 });
        });

        it('honors Configuration.DeactivateAbsent=false (per-job opt-out)', async () => {
            mockGetEntityObject.mockResolvedValue({ Load: vi.fn().mockResolvedValue(true), IntegrationID: 'int-1' });
            mockPipelineRun.mockResolvedValue({ Success: true, RunID: 'r-2', UnresolvedObjects: [], PersistResult: {} });
            const c = ctx({ Schedule: { ID: 's', Name: 'd', Configuration: JSON.stringify({ CompanyIntegrationID: 'ci-1', DeactivateAbsent: false }) } });
            await driver.Execute(c as Parameters<typeof driver.Execute>[0]);
            expect(mockPipelineRun.mock.calls[0][0]).toMatchObject({ DeactivateAbsent: false });
        });
    });

    describe('FormatNotification', () => {
        it('success notification reports the discovery counts', () => {
            const n = driver.FormatNotification(ctx() as Parameters<typeof driver.FormatNotification>[0], {
                Success: true, Details: { ObjectsCreated: 2, FieldsCreated: 9, ObjectsUpdated: 1, FieldsUpdated: 4 },
            } as Parameters<typeof driver.FormatNotification>[1]);
            expect(n.Subject).toContain('Completed');
            expect(n.Body).toContain('New objects');
            expect(n.Priority).toBe('Normal');
        });
        it('failure notification surfaces the error + High priority', () => {
            const n = driver.FormatNotification(ctx() as Parameters<typeof driver.FormatNotification>[0], {
                Success: false, ErrorMessage: 'boom',
            } as Parameters<typeof driver.FormatNotification>[1]);
            expect(n.Subject).toContain('Failed');
            expect(n.Body).toContain('boom');
            expect(n.Priority).toBe('High');
        });
    });
});
