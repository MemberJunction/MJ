import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    SafeJSONParse: (value: string) => {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }
}));

vi.mock('@memberjunction/core', () => ({
    ValidationResult: class {
        Success = false;
        Errors: Array<{ Source: string; Message: string; Value: unknown; Type: string }> = [];
    },
    UserInfo: class { ID = 'user-1' },
    Metadata: vi.fn().mockImplementation(() => ({
        GetEntityObject: vi.fn().mockResolvedValue({
            Load: vi.fn().mockResolvedValue(true)
        }),
        Provider: {}
    })),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
    ValidationErrorInfo: class {
        constructor(public Source: string, public Message: string, public Value: unknown, public Type: string) {}
    },
    ValidationErrorType: { Failure: 'Failure' }
}));

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Actions: [],
            ActionParams: [],
            RunAction: vi.fn().mockResolvedValue({
                Success: true,
                Message: 'Action completed',
                Result: { ResultCode: 'OK' },
                Params: []
            })
        }
    }
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SQLServerDataProvider: class {
        ExecuteSQL = vi.fn();
    }
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationContent: class {},
    ActionJobConfiguration: class {}
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class {}
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
    MJScheduledJobTypeEntity: class {}
}));

import { ActionScheduledJobDriver } from '../drivers/ActionScheduledJobDriver';

describe('ActionScheduledJobDriver', () => {
    let driver: ActionScheduledJobDriver;

    beforeEach(() => {
        driver = new ActionScheduledJobDriver();
        vi.clearAllMocks();
    });

    describe('ValidateConfiguration', () => {
        it('should return success for valid configuration with ActionID', () => {
            const schedule = {
                Configuration: JSON.stringify({ ActionID: 'action-123' })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should fail when ActionID is missing', () => {
            const schedule = {
                Configuration: JSON.stringify({})
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
            expect(result.Errors[0].Source).toBe('Configuration.ActionID');
        });

        it('should fail when Configuration is not valid JSON', () => {
            const schedule = {
                Configuration: 'not json'
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
        });

        it('should fail when Configuration is missing entirely', () => {
            const schedule = { Configuration: null };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
        });

        it('should validate Params array structure', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'Static', Value: 'test' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should fail when Params element is missing ActionParamID', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ValueType: 'Static', Value: 'test' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.some(
                (e: { Source: string }) => e.Source.includes('ActionParamID')
            )).toBe(true);
        });

        it('should fail when Params element has invalid ValueType', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'Invalid', Value: 'test' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.some(
                (e: { Source: string }) => e.Source.includes('ValueType')
            )).toBe(true);
        });

        it('should accept SQL Statement as valid ValueType', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    ActionID: 'action-123',
                    Params: [
                        { ActionParamID: 'p1', ValueType: 'SQL Statement', Value: 'SELECT 1' }
                    ]
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should succeed with no Params', () => {
            const schedule = {
                Configuration: JSON.stringify({ ActionID: 'action-123' })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });
    });

    describe('FormatNotification', () => {
        it('should format success notification correctly', () => {
            const context = {
                Schedule: { ID: 'schedule-1', Name: 'Test Job' },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: true,
                Details: { ResultCode: 'OK' }
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Subject).toContain('Completed');
            expect(notification.Subject).toContain('Test Job');
            expect(notification.Priority).toBe('Normal');
        });

        it('should format failure notification with High priority', () => {
            const context = {
                Schedule: { ID: 'schedule-1', Name: 'Failing Job' },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: false,
                ErrorMessage: 'Something went wrong',
                Details: {}
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Subject).toContain('Failed');
            expect(notification.Subject).toContain('Failing Job');
            expect(notification.Priority).toBe('High');
            expect(notification.Body).toContain('Something went wrong');
        });

        it('should include metadata in notification', () => {
            const context = {
                Schedule: { ID: 'schedule-abc', Name: 'Metadata Job' },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: true,
                Details: { ResultCode: 'SUCCESS' }
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Metadata).toBeDefined();
            expect(notification.Metadata.ScheduleID).toBe('schedule-abc');
            expect(notification.Metadata.JobType).toBe('Action');
        });
    });
});
