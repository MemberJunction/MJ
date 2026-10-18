import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';
import { BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Test harness exposing protected progress-message formatting helpers on BaseAgent.
 */
class ProgressMessageTestAgent extends BaseAgent {
    public setHierarchyForTest(depth: number, hierarchy: string[]): void {
        Reflect.set(this, '_depth', depth);
        Reflect.set(this, '_agentHierarchy', hierarchy);
    }

    public testBuildPromptProgressMessage(
        params: ExecuteAgentParams,
        previousDecision?: BaseAgentNextStep | null
    ): string {
        return this.buildPromptProgressMessage(params, previousDecision);
    }

    public testFormatHierarchicalPromptMessage(
        params: ExecuteAgentParams,
        previousDecision?: BaseAgentNextStep | null
    ): string {
        return this.formatHierarchicalMessage(this.buildPromptProgressMessage(params, previousDecision));
    }

    public testFormatHierarchicalMessage(baseMessage: string): string {
        return this.formatHierarchicalMessage(baseMessage);
    }
}

function createParams(agentName: string): ExecuteAgentParams {
    return {
        agent: { Name: agentName } as MJAIAgentEntityExtended,
        conversationMessages: [],
    };
}

describe('BaseAgent streaming progress message formatting', () => {
    describe('Root agent (_depth === 0)', () => {
        it('includes the root agent name on initial prompt', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            expect(agent.testFormatHierarchicalPromptMessage(params, null)).toBe(
                "Running Sage's initial prompt..."
            );
        });

        it('uses retryReason directly without splicing inside "Running X with context from ..."', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryReason: 'Analyzing results from 1 completed action to formulate response',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Analyzing results from 1 completed action to formulate response'
            );
        });

        it('formats "Payload change applied" as a clean continuation status', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryReason: 'Payload change applied',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Continuing after payload update...'
            );
        });

        it('uses retryInstructions when retryReason is omitted (e.g. ForEach / While loops)', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryInstructions: "Completed ForEach loop request using collection at 'items'",
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                "Completed ForEach loop request using collection at 'items'"
            );
        });

        it('falls back to "Running <Agent> with updated context..." when neither retryReason nor retryInstructions is present', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Running Sage with updated context...'
            );
        });
    });

    describe('Sub-agent (_depth > 0)', () => {
        it('does not repeat the sub-agent name on initial prompt when prefixed by hierarchy breadcrumb', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(1, ['Sage', 'Query Strategist']);
            const params = createParams('Query Strategist');

            expect(agent.testFormatHierarchicalPromptMessage(params, null)).toBe(
                'Query Strategist: Running initial prompt...'
            );
        });

        it('formats action completion retry cleanly without double agent name or "Running X with context from"', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(1, ['Sage', 'Query Strategist']);
            const params = createParams('Query Strategist');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryReason: 'Analyzing results from 1 completed action to formulate response',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Query Strategist: Analyzing results from 1 completed action to formulate response'
            );
        });

        it('formats sub-agent review retry cleanly on nested sub-agent hierarchies', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(2, ['Sage', 'Query Builder', 'Query Strategist']);
            const params = createParams('Query Strategist');

            const decision: BaseAgentNextStep = {
                step: 'Success',
                terminate: false,
                retryReason: 'Reviewing results from SQL Validator',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Query Builder → Query Strategist: Reviewing results from SQL Validator'
            );
        });

        it('falls back to "Continuing with updated context..." without repeating the sub-agent name', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(1, ['Sage', 'Query Strategist']);
            const params = createParams('Query Strategist');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Query Strategist: Continuing with updated context...'
            );
        });
    });
});
