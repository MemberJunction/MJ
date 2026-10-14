import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatusEx: vi.fn() };
});

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIAgentEntityExtended: class {
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

// Entity classes are plain bases here; the typed doubles keep their field values in memory.
vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
    MJScheduledJobTypeEntity: class {},
    MJAIAgentRunEntity: class {}
}));

import { EntityInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentScheduledJobDriver } from '../drivers/AgentScheduledJobDriver';
import { TestContext, TestDatabaseProvider, TestScheduledJob } from './helpers/scheduling-doubles';

/** The agent the provider hands out (the mocked entity class loads successfully). */
class TestAgent extends MJAIAgentEntityExtended {
    constructor() {
        super(new EntityInfo());
    }
}

/** A schedule whose Configuration is `configuration`. */
function scheduleWith(configuration: string | null, values: { ID?: string; Name?: string } = {}): TestScheduledJob {
    return new TestScheduledJob({ ...values, Configuration: configuration });
}

describe('AgentScheduledJobDriver', () => {
    let driver: AgentScheduledJobDriver;

    beforeEach(() => {
        driver = new AgentScheduledJobDriver();
        vi.clearAllMocks();
    });

    describe('ValidateConfiguration', () => {
        it('should return success for valid configuration with AgentID', () => {
            const result = driver.ValidateConfiguration(scheduleWith(JSON.stringify({ AgentID: 'agent-123' })));
            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should fail when AgentID is missing', () => {
            const result = driver.ValidateConfiguration(scheduleWith(JSON.stringify({})));
            expect(result.Success).toBe(false);
            expect(result.Errors.length).toBeGreaterThan(0);
            expect(result.Errors[0].Source).toBe('Configuration.AgentID');
        });

        it('should fail when Configuration is not valid JSON', () => {
            const result = driver.ValidateConfiguration(scheduleWith('invalid-json'));
            expect(result.Success).toBe(false);
        });

        it('should fail when Configuration is null', () => {
            const result = driver.ValidateConfiguration(scheduleWith(null));
            expect(result.Success).toBe(false);
        });

        it('should accept valid StartingPayload', () => {
            const result = driver.ValidateConfiguration(scheduleWith(JSON.stringify({
                AgentID: 'agent-123',
                StartingPayload: { key: 'value' }
            })));
            expect(result.Success).toBe(true);
        });

        it('should accept configuration with optional fields', () => {
            const result = driver.ValidateConfiguration(scheduleWith(JSON.stringify({
                AgentID: 'agent-123',
                ConversationID: 'conv-456',
                InitialMessage: 'Hello agent',
                ConfigurationID: 'config-789',
                OverrideModelID: 'model-abc'
            })));
            expect(result.Success).toBe(true);
        });

        it('should fail when Configuration is empty string', () => {
            const result = driver.ValidateConfiguration(scheduleWith(''));
            expect(result.Success).toBe(false);
        });
    });

    describe('FormatNotification', () => {
        it('should format success notification with agent details', () => {
            const context = TestContext(scheduleWith(JSON.stringify({ AgentID: 'agent-1' }), { ID: 'schedule-1', Name: 'Agent Job' }));
            const notification = driver.FormatNotification(context, {
                Success: true,
                Details: { AgentRunID: 'run-1', TokensUsed: 500, Cost: 0.01 }
            });
            expect(notification.Subject).toContain('Completed');
            expect(notification.Subject).toContain('Agent Job');
            expect(notification.Priority).toBe('Normal');
            expect(notification.Body).toContain('500');
        });

        it('should format failure notification with High priority', () => {
            const context = TestContext(scheduleWith(JSON.stringify({ AgentID: 'agent-2' }), { ID: 'schedule-2', Name: 'Failed Agent Job' }));
            const notification = driver.FormatNotification(context, {
                Success: false,
                ErrorMessage: 'Agent crashed',
                Details: { AgentRunID: 'run-fail' }
            });
            expect(notification.Subject).toContain('Failed');
            expect(notification.Priority).toBe('High');
            expect(notification.Body).toContain('Agent crashed');
        });

        it('should include metadata with AgentID', () => {
            const context = TestContext(scheduleWith(JSON.stringify({ AgentID: 'agent-meta' }), { ID: 'schedule-3', Name: 'Metadata Test' }));
            const notification = driver.FormatNotification(context, { Success: true, Details: { AgentRunID: 'run-meta' } });
            expect(notification.Metadata?.JobType).toBe('Agent');
            expect(notification.Metadata?.AgentID).toBe('agent-meta');
        });

        it('shows N/A for details that do not have the expected types', () => {
            const context = TestContext(scheduleWith(JSON.stringify({ AgentID: 'agent-odd' }), { ID: 'schedule-5', Name: 'Odd Details Job' }));
            const notification = driver.FormatNotification(context, {
                Success: true,
                Details: { TokensUsed: '100', Cost: 'free', AgentRunID: 42 }
            });
            expect(notification.Body).toContain('Tokens Used: N/A');
            expect(notification.Body).toContain('Cost: $N/A');
            expect(notification.Body).toContain('Agent Run ID: undefined');
            expect(notification.Metadata?.AgentRunID).toBeUndefined();
        });

        it('should handle missing details gracefully in success notification', () => {
            const context = TestContext(scheduleWith(JSON.stringify({ AgentID: 'agent-nd' }), { ID: 'schedule-4', Name: 'No Details Job' }));
            const notification = driver.FormatNotification(context, { Success: true, Details: {} });
            expect(notification.Subject).toContain('Completed');
            expect(notification.Body).toContain('N/A');
        });
    });

    describe('Execute', () => {
        it('should execute an agent and return success result', async () => {
            const provider = new TestDatabaseProvider();
            provider.EntityObjects = [new TestAgent()];
            const context = TestContext(scheduleWith(JSON.stringify({ AgentID: 'agent-exec' }), { ID: 'schedule-exec' }), provider);
            const result = await driver.Execute(context);
            expect(provider.EntityObjectRequests).toEqual([{ EntityName: 'MJ: AI Agents', ContextUser: context.ContextUser }]);
            expect(result.Success).toBe(true);
            expect(result.Details).toBeDefined();
            expect(result.Details?.AgentRunID).toBe('agent-run-1');
            expect(result.Details?.TokensUsed).toBe(100);
        });
    });
});
