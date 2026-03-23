import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { RunSyncAction } from '../RunSyncAction.js';

// --- Mocks ---

let mockRunSyncFn: ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;

vi.mock('@memberjunction/integration-engine', () => {
    const mockInstance = {
        RunSync: (...args: unknown[]) => mockRunSyncFn(...args),
        Config: vi.fn().mockResolvedValue(undefined),
    };
    return {
        IntegrationEngine: {
            Instance: mockInstance,
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
    };
});

// --- Helpers ---

function makeUser(id = 'user-1'): UserInfo {
    return { ID: id, Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

function makeParams(inputs: Record<string, string | number | boolean>): RunActionParams {
    const params = new RunActionParams();
    params.ContextUser = makeUser();
    params.Params = Object.entries(inputs).map(([Name, Value]) => {
        const p = new ActionParam();
        p.Name = Name;
        p.Type = 'Input';
        p.Value = Value;
        return p;
    });
    params.Filters = [];
    return params;
}

function makeSyncResult(overrides: Partial<{
    Success: boolean;
    RecordsProcessed: number;
    RecordsCreated: number;
    RecordsUpdated: number;
    RecordsDeleted: number;
    RecordsErrored: number;
    RecordsSkipped: number;
    Errors: Array<{ ExternalID: string; ErrorMessage: string; ErrorCode: string; ChangeType: string; Severity: string }>;
}> = {}) {
    return {
        Success: true,
        RecordsProcessed: 10,
        RecordsCreated: 5,
        RecordsUpdated: 3,
        RecordsDeleted: 1,
        RecordsErrored: 0,
        RecordsSkipped: 1,
        Errors: [],
        ...overrides
    };
}

// --- Tests ---

describe('RunSyncAction', () => {
    let action: RunSyncAction;

    beforeEach(() => {
        action = new RunSyncAction();
        mockRunSyncFn = vi.fn();
    });

    describe('Parameter validation', () => {
        it('returns MISSING_PARAMETER when CompanyIntegrationID is absent', async () => {
            const params = makeParams({});
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
            expect(result.Message).toContain('CompanyIntegrationID');
        });

        it('returns MISSING_PARAMETER when CompanyIntegrationID is empty string', async () => {
            const params = makeParams({ CompanyIntegrationID: '' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
        });
    });

    describe('Successful sync', () => {
        it('calls RunSync with correct CompanyIntegrationID and default trigger type', async () => {
            const syncResult = makeSyncResult();
            mockRunSyncFn.mockResolvedValue(syncResult);

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            await action['InternalRunAction'](params);

            expect(mockRunSyncFn).toHaveBeenCalledWith(
                'ci-001',
                expect.objectContaining({ ID: 'user-1' }),
                'Manual',
                undefined,  // onProgress
                undefined,  // onNotification
                {}          // options (empty IntegrationSyncOptions)
            );
        });

        it('returns SUCCESS result code when sync succeeds', async () => {
            mockRunSyncFn.mockResolvedValue(makeSyncResult());

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('SUCCESS');
        });

        it('includes record counts in Message', async () => {
            mockRunSyncFn.mockResolvedValue(makeSyncResult({
                RecordsProcessed: 20,
                RecordsCreated: 10,
                RecordsUpdated: 8,
                RecordsDeleted: 2,
                RecordsErrored: 0,
                RecordsSkipped: 0,
            }));

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            expect(result.Message).toContain('20');
            expect(result.Message).toContain('10');
            expect(result.Message).toContain('8');
        });

        it('adds output params with record counts', async () => {
            mockRunSyncFn.mockResolvedValue(makeSyncResult({
                RecordsProcessed: 15,
                RecordsCreated: 7,
                RecordsUpdated: 5,
                RecordsDeleted: 2,
                RecordsErrored: 0,
                RecordsSkipped: 1,
            }));

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            const outputNames = result.Params?.map(p => p.Name) ?? [];
            expect(outputNames).toContain('RecordsProcessed');
            expect(outputNames).toContain('RecordsCreated');
            expect(outputNames).toContain('RecordsUpdated');
            expect(outputNames).toContain('RecordsDeleted');
            expect(outputNames).toContain('RecordsErrored');
            expect(outputNames).toContain('RecordsSkipped');

            const processed = result.Params?.find(p => p.Name === 'RecordsProcessed');
            expect(processed?.Value).toBe(15);
        });
    });

    describe('Sync with errors', () => {
        it('returns SYNC_COMPLETED_WITH_ERRORS when sync has record errors', async () => {
            mockRunSyncFn.mockResolvedValue(makeSyncResult({
                Success: false,
                RecordsErrored: 3,
                Errors: [
                    { ExternalID: 'ext-1', ErrorMessage: 'Validation failed', ErrorCode: 'VALIDATION_ERROR', ChangeType: 'Create', Severity: 'Warning' }
                ],
            }));

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('SYNC_COMPLETED_WITH_ERRORS');
        });

        it('adds ErrorSummary output param when errors exist', async () => {
            const errors = [
                { ExternalID: 'ext-1', ErrorMessage: 'Fail', ErrorCode: 'VALIDATION_ERROR', ChangeType: 'Create', Severity: 'Warning' }
            ];
            mockRunSyncFn.mockResolvedValue(makeSyncResult({
                Success: false,
                RecordsErrored: 1,
                Errors: errors,
            }));

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            const errorSummary = result.Params?.find(p => p.Name === 'ErrorSummary');
            expect(errorSummary).toBeDefined();
            const parsed = JSON.parse(errorSummary?.Value as string);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].ExternalID).toBe('ext-1');
        });
    });

    describe('TriggerType parameter', () => {
        it.each([
            ['Scheduled', 'Scheduled'],
            ['Webhook', 'Webhook'],
            ['Manual', 'Manual'],
            [undefined, 'Manual'],
            ['InvalidValue', 'Manual'],
        ])('maps TriggerType %s → %s', async (input, expected) => {
            mockRunSyncFn.mockResolvedValue(makeSyncResult());
            const inputs: Record<string, string> = { CompanyIntegrationID: 'ci-001' };
            if (input !== undefined) inputs['TriggerType'] = input;

            const params = makeParams(inputs);
            await action['InternalRunAction'](params);

            expect(mockRunSyncFn).toHaveBeenCalledWith(
                expect.any(String),
                expect.anything(),
                expected,
                undefined,  // onProgress
                undefined,  // onNotification
                expect.any(Object)  // options
            );
        });
    });

    describe('Error handling', () => {
        it('returns UNEXPECTED_ERROR when RunSync throws', async () => {
            mockRunSyncFn.mockRejectedValue(new Error('Database connection lost'));

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
            expect(result.Message).toContain('Database connection lost');
        });

        it('handles non-Error thrown values', async () => {
            mockRunSyncFn.mockRejectedValue('string error');

            const params = makeParams({ CompanyIntegrationID: 'ci-001' });
            const result = await action['InternalRunAction'](params);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
            expect(result.Message).toBe('string error');
        });
    });

    describe('Parameter name case insensitivity', () => {
        it('accepts companyintegrationid (lowercase)', async () => {
            mockRunSyncFn.mockResolvedValue(makeSyncResult());

            const params = new RunActionParams();
            params.ContextUser = makeUser();
            params.Filters = [];
            const p = new ActionParam();
            p.Name = 'companyintegrationid';
            p.Type = 'Input';
            p.Value = 'ci-lowercase';
            params.Params = [p];

            await action['InternalRunAction'](params);
            expect(mockRunSyncFn).toHaveBeenCalledWith(
                'ci-lowercase',
                expect.anything(),
                'Manual',
                undefined,
                undefined,
                {}
            );
        });
    });
});
