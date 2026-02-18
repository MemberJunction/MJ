import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target
}));

vi.mock('@memberjunction/core', () => ({
    ValidationResult: class {
        Success = false;
        Errors: Array<{ Source: string; Message: string; Value: unknown; Type: string }> = [];
    },
    UserInfo: class { ID = 'user-1' },
    Metadata: class MockMetadata {
        GetEntityObject = vi.fn().mockResolvedValue({
            Load: vi.fn().mockResolvedValue(true),
            Name: 'Test Agent'
        });
    },
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
    ValidationErrorInfo: class {
        constructor(public Source: string, public Message: string, public Value: unknown, public Type: string) {}
    },
    ValidationErrorType: { Failure: 'Failure' }
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIAgentEntityExtended: class {
        Name = 'Test Agent';
        Load = vi.fn().mockResolvedValue(true);
    }
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class MockAgentRunner {
        RunAgent = vi.fn().mockResolvedValue({
            success: true,
            agentRun: {
                ID: 'agent-run-1',
                TotalTokensUsed: 100,
                TotalCost: 0.005,
                ConversationID: 'conv-1',
                Status: 'Completed',
                ErrorMessage: null,
                ScheduledJobRunID: null,
                Save: vi.fn().mockResolvedValue(true)
            }
        });
    }
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationContent: class {},
    AgentJobConfiguration: class {}
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
    MJScheduledJobTypeEntity: class {}
}));

import { AgentScheduledJobDriver } from '../drivers/AgentScheduledJobDriver';

describe('AgentScheduledJobDriver', () => {
    let driver: AgentScheduledJobDriver;

    beforeEach(() => {
        driver = new AgentScheduledJobDriver();
        vi.clearAllMocks();
    });

    describe('ValidateConfiguration', () => {
        it('should return success for valid configuration with AgentID', () => {
            const schedule = {
                Configuration: JSON.stringify({ AgentID: 'agent-123' })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should fail when AgentID is missing', () => {
            const schedule = {
                Configuration: JSON.stringify({})
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
            expect(result.Errors[0].Source).toBe('Configuration.AgentID');
        });

        it('should fail when Configuration is not valid JSON', () => {
            const schedule = {
                Configuration: 'invalid-json'
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
        });

        it('should fail when Configuration is null', () => {
            const schedule = { Configuration: null };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
        });

        it('should accept valid StartingPayload', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    AgentID: 'agent-123',
                    StartingPayload: { key: 'value' }
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should accept configuration with optional fields', () => {
            const schedule = {
                Configuration: JSON.stringify({
                    AgentID: 'agent-123',
                    ConversationID: 'conv-456',
                    InitialMessage: 'Hello agent',
                    ConfigurationID: 'config-789',
                    OverrideModelID: 'model-abc'
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
        });

        it('should fail when Configuration is empty string', () => {
            const schedule = { Configuration: '' };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
        });
    });

    describe('FormatNotification', () => {
        it('should format success notification with agent details', () => {
            const context = {
                Schedule: {
                    ID: 'schedule-1',
                    Name: 'Agent Job',
                    Configuration: JSON.stringify({ AgentID: 'agent-1' })
                },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: true,
                Details: {
                    AgentRunID: 'run-1',
                    TokensUsed: 500,
                    Cost: 0.01
                }
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Subject).toContain('Completed');
            expect(notification.Subject).toContain('Agent Job');
            expect(notification.Priority).toBe('Normal');
            expect(notification.Body).toContain('500');
        });

        it('should format failure notification with High priority', () => {
            const context = {
                Schedule: {
                    ID: 'schedule-2',
                    Name: 'Failed Agent Job',
                    Configuration: JSON.stringify({ AgentID: 'agent-2' })
                },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: false,
                ErrorMessage: 'Agent crashed',
                Details: {
                    AgentRunID: 'run-fail'
                }
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Subject).toContain('Failed');
            expect(notification.Priority).toBe('High');
            expect(notification.Body).toContain('Agent crashed');
        });

        it('should include metadata with AgentID', () => {
            const context = {
                Schedule: {
                    ID: 'schedule-3',
                    Name: 'Metadata Test',
                    Configuration: JSON.stringify({ AgentID: 'agent-meta' })
                },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: true,
                Details: { AgentRunID: 'run-meta' }
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Metadata.JobType).toBe('Agent');
            expect(notification.Metadata.AgentID).toBe('agent-meta');
        });

        it('should handle missing details gracefully in success notification', () => {
            const context = {
                Schedule: {
                    ID: 'schedule-4',
                    Name: 'No Details Job',
                    Configuration: JSON.stringify({ AgentID: 'agent-nd' })
                },
                Run: {},
                ContextUser: {}
            };
            const result = {
                Success: true,
                Details: {}
            };
            const notification = driver.FormatNotification(
                context as Parameters<typeof driver.FormatNotification>[0],
                result as Parameters<typeof driver.FormatNotification>[1]
            );
            expect(notification.Subject).toContain('Completed');
            expect(notification.Body).toContain('N/A');
        });
    });

    describe('Execute', () => {
        it('should execute an agent and return success result', async () => {
            const context = {
                Schedule: {
                    ID: 'schedule-exec',
                    Configuration: JSON.stringify({ AgentID: 'agent-exec' })
                },
                Run: { ID: 'run-exec' },
                ContextUser: { ID: 'user-1' }
            };
            const result = await driver.Execute(
                context as Parameters<typeof driver.Execute>[0]
            );
            expect(result.Success).toBe(true);
            expect(result.Details).toBeDefined();
            expect(result.Details.AgentRunID).toBe('agent-run-1');
            expect(result.Details.TokensUsed).toBe(100);
        });
    });
});
