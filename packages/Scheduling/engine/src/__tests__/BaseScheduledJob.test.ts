import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
    ValidationResult: class ValidationResult {
        Success = false;
        Errors: { Source: string; Message: string }[] = [];
    },
    Metadata: vi.fn().mockImplementation(() => ({
        GetEntityObject: vi.fn().mockResolvedValue({
            Load: vi.fn().mockResolvedValue(true)
        })
    })),
    UserInfo: class UserInfo {},
    ValidationErrorInfo: class ValidationErrorInfo {
        constructor(public Source: string, public Message: string, public Value: string, public Type: string) {}
    },
    ValidationErrorType: { Failure: 'Failure', Warning: 'Warning' }
}));

vi.mock('@memberjunction/core-entities', () => ({
    ScheduledJobEntity: class {},
    ScheduledJobRunEntity: class {},
    ScheduledJobTypeEntity: class {}
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    ScheduledJobConfiguration: class {},
    NotificationContent: class {}
}));

import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { LogError, LogStatusEx } from '@memberjunction/core';

const mockedLogStatusEx = vi.mocked(LogStatusEx);
const mockedLogError = vi.mocked(LogError);

// Concrete test implementation
class TestScheduledJob extends BaseScheduledJob {
    async Execute(context: ScheduledJobExecutionContext) {
        return { Success: true, ErrorMessage: undefined, Details: {} };
    }

    ValidateConfiguration(schedule: { Configuration?: string }) {
        const result = { Success: true, Errors: [] as { Source: string; Message: string }[] };
        return result as ReturnType<BaseScheduledJob['ValidateConfiguration']>;
    }

    FormatNotification(context: ScheduledJobExecutionContext, result: { Success: boolean }) {
        return { Subject: 'Test', Body: 'Test body', Priority: 'Normal' as const, Metadata: {} };
    }

    // Expose protected methods for testing
    public testParseConfiguration<T>(schedule: { Configuration?: string | null }): T {
        return this.parseConfiguration<T>(schedule as Parameters<typeof this.parseConfiguration>[0]);
    }

    public testLog(message: string, verboseOnly?: boolean): void {
        this.log(message, verboseOnly);
    }

    public testLogError(message: string, error?: unknown): void {
        this.logError(message, error);
    }
}

describe('BaseScheduledJob', () => {
    let job: TestScheduledJob;

    beforeEach(() => {
        job = new TestScheduledJob();
        vi.clearAllMocks();
    });

    describe('parseConfiguration', () => {
        it('should parse valid JSON configuration', () => {
            const schedule = { Configuration: '{"key": "value", "count": 42}' };
            const result = job.testParseConfiguration<{ key: string; count: number }>(schedule);
            expect(result).toEqual({ key: 'value', count: 42 });
        });

        it('should throw when configuration is missing (null)', () => {
            const schedule = { Configuration: null };
            expect(() => job.testParseConfiguration(schedule)).toThrow('Configuration is required for job type');
        });

        it('should throw when configuration is undefined', () => {
            const schedule = { Configuration: undefined };
            expect(() => job.testParseConfiguration(schedule)).toThrow('Configuration is required for job type');
        });

        it('should throw when configuration is empty string', () => {
            // empty string is falsy, so it should throw
            const schedule = { Configuration: '' };
            expect(() => job.testParseConfiguration(schedule)).toThrow('Configuration is required for job type');
        });

        it('should throw for invalid JSON', () => {
            const schedule = { Configuration: 'not valid json {' };
            expect(() => job.testParseConfiguration(schedule)).toThrow('Invalid Configuration JSON');
        });

        it('should parse nested configuration objects', () => {
            const config = { ActionID: 'abc-123', Params: [{ name: 'p1', value: 'v1' }] };
            const schedule = { Configuration: JSON.stringify(config) };
            const result = job.testParseConfiguration<typeof config>(schedule);
            expect(result.ActionID).toBe('abc-123');
            expect(result.Params).toHaveLength(1);
            expect(result.Params[0].name).toBe('p1');
        });

        it('should parse configuration with special characters', () => {
            const config = { message: 'Hello "world" & <test>' };
            const schedule = { Configuration: JSON.stringify(config) };
            const result = job.testParseConfiguration<typeof config>(schedule);
            expect(result.message).toBe('Hello "world" & <test>');
        });

        it('should parse configuration with numeric values', () => {
            const config = { timeout: 30000, retries: 3, ratio: 0.5 };
            const schedule = { Configuration: JSON.stringify(config) };
            const result = job.testParseConfiguration<typeof config>(schedule);
            expect(result.timeout).toBe(30000);
            expect(result.retries).toBe(3);
            expect(result.ratio).toBe(0.5);
        });
    });

    describe('log', () => {
        it('should call LogStatusEx with formatted message', () => {
            job.testLog('Test message');
            expect(mockedLogStatusEx).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Test message'),
                    verboseOnly: false
                })
            );
        });

        it('should include class name in log message', () => {
            job.testLog('Test message');
            expect(mockedLogStatusEx).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('[TestScheduledJob]')
                })
            );
        });

        it('should pass verboseOnly flag', () => {
            job.testLog('Verbose message', true);
            expect(mockedLogStatusEx).toHaveBeenCalledWith(
                expect.objectContaining({
                    verboseOnly: true
                })
            );
        });

        it('should default verboseOnly to false', () => {
            job.testLog('Default verbose');
            expect(mockedLogStatusEx).toHaveBeenCalledWith(
                expect.objectContaining({
                    verboseOnly: false
                })
            );
        });
    });

    describe('logError', () => {
        it('should call LogError with formatted message', () => {
            job.testLogError('Error occurred');
            expect(mockedLogError).toHaveBeenCalledWith(
                expect.stringContaining('Error occurred'),
                undefined,
                undefined
            );
        });

        it('should include class name in error message', () => {
            job.testLogError('Something failed');
            expect(mockedLogError).toHaveBeenCalledWith(
                expect.stringContaining('[TestScheduledJob]'),
                undefined,
                undefined
            );
        });

        it('should pass error object to LogError', () => {
            const error = new Error('test error');
            job.testLogError('Failed', error);
            expect(mockedLogError).toHaveBeenCalledWith(
                expect.stringContaining('Failed'),
                undefined,
                error
            );
        });
    });

    describe('abstract method implementation', () => {
        it('should have Execute method that returns a ScheduledJobResult', async () => {
            const context = {
                Schedule: {},
                Run: {},
                ContextUser: {}
            } as ScheduledJobExecutionContext;
            const result = await job.Execute(context);
            expect(result).toHaveProperty('Success');
            expect(result.Success).toBe(true);
        });

        it('should have ValidateConfiguration method', () => {
            const schedule = { Configuration: '{}' };
            const result = job.ValidateConfiguration(schedule as Parameters<typeof job.ValidateConfiguration>[0]);
            expect(result).toHaveProperty('Success');
        });

        it('should have FormatNotification method', () => {
            const context = {} as ScheduledJobExecutionContext;
            const jobResult = { Success: true };
            const notification = job.FormatNotification(context, jobResult);
            expect(notification).toHaveProperty('Subject');
            expect(notification).toHaveProperty('Body');
            expect(notification).toHaveProperty('Priority');
        });
    });
});
