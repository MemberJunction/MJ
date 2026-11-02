import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunAgent } = vi.hoisted(() => ({
    mockRunAgent: vi.fn()
}));

// Mock external dependencies while keeping real UUID helpers from @memberjunction/global
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target
    };
});

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
    MJAIAgentEntityExtended: class {
        Name = 'Test Agent';
        Load = vi.fn().mockResolvedValue(true);
    }
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class MockAgentRunner {
        RunAgent = mockRunAgent;
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

const VALID_CONVERSATION_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_CONFIGURATION_UUID = '22222222-2222-4222-8222-222222222222';
const VALID_COMPANY_UUID = '33333333-3333-4333-8333-333333333333';
const VALID_MODEL_UUID = '44444444-4444-4444-8444-444444444444';

describe('AgentScheduledJobDriver', () => {
    let driver: AgentScheduledJobDriver;

    beforeEach(() => {
        driver = new AgentScheduledJobDriver();
        vi.clearAllMocks();
        mockRunAgent.mockResolvedValue({
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
                    ConversationID: VALID_CONVERSATION_UUID,
                    InitialMessage: 'Hello agent',
                    ConfigurationID: VALID_CONFIGURATION_UUID,
                    CompanyID: VALID_COMPANY_UUID,
                    OverrideModelID: VALID_MODEL_UUID
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should fail when Configuration is empty string', () => {
            const schedule = { Configuration: '' };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
        });

        it.each([
            ['ConfigurationID', 'not-a-uuid'],
            ['CompanyID', 'bad-company-id'],
            ['ConversationID', 'conv-456'],
            ['OverrideModelID', 'model-abc'],
            ['ConfigurationID', '']
        ] as const)('should reject malformed %s (%s)', (field, invalidValue) => {
            const schedule = {
                Configuration: JSON.stringify({
                    AgentID: 'agent-123',
                    [field]: invalidValue
                })
            };
            const result = driver.ValidateConfiguration(schedule);
            expect(result.Success).toBe(false);
            expect(result.Errors).toHaveLength(1);
            expect(result.Errors[0].Source).toBe(`Configuration.${field}`);
            expect(result.Errors[0].Message).toContain(`${field} must be a valid UUID`);
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
            expect(result.Details!.AgentRunID).toBe('agent-run-1');
            expect(result.Details!.TokensUsed).toBe(100);
        });

        it('should leave RunAgent params with the baseline shape when optional IDs are omitted', async () => {
            const contextUser = { ID: 'user-1' };
            const context = {
                Schedule: {
                    ID: 'schedule-minimal',
                    Configuration: JSON.stringify({
                        AgentID: 'agent-exec',
                        InitialMessage: 'Generate briefing',
                        StartingPayload: { kpi: 'mrr' }
                    })
                },
                Run: { ID: 'run-minimal' },
                ContextUser: contextUser
            };

            await driver.Execute(context as Parameters<typeof driver.Execute>[0]);

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const runParams = mockRunAgent.mock.calls[0][0] as Record<string, unknown>;
            expect(Object.keys(runParams).sort()).toEqual([
                'agent',
                'contextUser',
                'conversationMessages',
                'onProgress',
                'payload'
            ]);
            expect(runParams.conversationMessages).toEqual([{ role: 'user', content: 'Generate briefing' }]);
            expect(runParams.payload).toEqual({ kpi: 'mrr' });
            expect(runParams.contextUser).toBe(contextUser);
            expect(runParams.configurationId).toBeUndefined();
            expect(runParams.companyId).toBeUndefined();
            expect(runParams.conversationId).toBeUndefined();
            expect(runParams.override).toBeUndefined();
        });

        it('should pass ConfigurationID, CompanyID, ConversationID, and OverrideModelID to RunAgent with the expected property names and shapes', async () => {
            const contextUser = { ID: 'user-1' };
            const context = {
                Schedule: {
                    ID: 'schedule-full',
                    Configuration: JSON.stringify({
                        AgentID: 'agent-exec',
                        ConfigurationID: VALID_CONFIGURATION_UUID,
                        CompanyID: VALID_COMPANY_UUID,
                        ConversationID: VALID_CONVERSATION_UUID,
                        OverrideModelID: VALID_MODEL_UUID,
                        InitialMessage: 'Monthly KPI briefing',
                        StartingPayload: { month: '2026-10' }
                    })
                },
                Run: { ID: 'run-full' },
                ContextUser: contextUser
            };

            await driver.Execute(context as Parameters<typeof driver.Execute>[0]);

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const runParams = mockRunAgent.mock.calls[0][0] as Record<string, unknown>;
            expect(runParams.configurationId).toBe(VALID_CONFIGURATION_UUID);
            expect(runParams.companyId).toBe(VALID_COMPANY_UUID);
            expect(runParams.conversationId).toBe(VALID_CONVERSATION_UUID);
            expect(runParams.override).toEqual({ modelId: VALID_MODEL_UUID });
        });
    });
});

