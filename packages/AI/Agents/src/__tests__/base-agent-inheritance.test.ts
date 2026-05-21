import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import { BaseAgentActions } from '../base-agent/baseAgentActions';
import { BaseAgentOperations } from '../base-agent/baseAgentOperations';
import { BaseAgentPrompt } from '../base-agent/baseAgentPrompt';
import { BaseAgentInit } from '../base-agent/baseAgentInit';
import { BaseAgentState } from '../base-agent/baseAgentState';

// Mock all core dependencies to prevent database/network activity during instantiation or method access tests.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
        Metadata: {
            Provider: {
                GetEntity: vi.fn(),
            }
        }
    };
});

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class MockPromptRunner {}
}));

vi.mock('../PayloadManager', () => ({
    PayloadManager: class MockPayloadManager {}
}));

vi.mock('../ScratchpadManager', () => ({
    ScratchpadManager: class MockScratchpadManager {}
}));

vi.mock('../ArtifactToolManager', () => ({
    ArtifactToolManager: class MockArtifactToolManager {}
}));

vi.mock('../ClientToolRequestManager', () => ({
    ClientToolRequestManager: class MockClientToolRequestManager {}
}));

// We can define a test class that inherits from BaseAgent to test the layers.
class TestAgent extends BaseAgent {
    // Expose protected fields for testing access
    public getTestProvider() {
        return this.ProviderToUse;
    }

    public getTestValidationRetryCount() {
        return this.ValidationRetryCount;
    }

    public getTestExecutionCounts() {
        return this._executionCounts;
    }

    public getTestTimeout() {
        return this.DefaultAgentTimeoutMS;
    }

    // Expose protected methods as public helpers to verify existence
    public async testInitializeStartingPayload(params: any) {
        return this.initializeStartingPayload(params);
    }
}

describe('BaseAgent Inheritance and Layering Hierarchy', () => {
    it('should correctly inherit from all modular layers in the chain', () => {
        const agent = new TestAgent();

        // Verify the prototype chain / inheritance
        expect(agent).toBeInstanceOf(BaseAgent);
        expect(agent).toBeInstanceOf(BaseAgentActions);
        expect(agent).toBeInstanceOf(BaseAgentOperations);
        expect(agent).toBeInstanceOf(BaseAgentPrompt);
        expect(agent).toBeInstanceOf(BaseAgentInit);
        expect(agent).toBeInstanceOf(BaseAgentState);
    });

    it('should allow access to inherited state layer properties', () => {
        const agent = new TestAgent();

        expect(agent.getTestExecutionCounts()).toBeInstanceOf(Map);
        expect(agent.getTestValidationRetryCount()).toBe(0);
    });

    it('should allow access to inherited state provider accessor', () => {
        const agent = new TestAgent();

        expect(agent.getTestProvider()).toBeDefined();
    });

    it('should respect subclasses overriding default getters', () => {
        class CustomTimeoutAgent extends TestAgent {
            protected get DefaultAgentTimeoutMS(): number {
                return 5000;
            }
        }

        const agent = new CustomTimeoutAgent();
        expect(agent.getTestTimeout()).toBe(5000);
    });

    it('should inherit initialization Layer 2 methods', () => {
        const agent = new TestAgent();
        expect(agent.testInitializeStartingPayload).toBeTypeOf('function');
    });

    it('should inherit prompt Layer 3 methods', () => {
        const agent = new TestAgent();
        expect(agent.preparePromptParams).toBeTypeOf('function');
        expect(agent.attemptContextRecovery).toBeTypeOf('function');
    });

    it('should inherit operations Layer 4 methods', () => {
        const agent = new TestAgent();
        expect(agent.ExecuteSubAgent).toBeTypeOf('function');
        expect(agent.executeChatStep).toBeTypeOf('function');
    });

    it('should inherit actions Layer 5 methods', () => {
        const agent = new TestAgent();
        expect(agent.ExecuteSingleAction).toBeTypeOf('function');
    });
});
