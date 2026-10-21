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

    public testBuildInitializationProgressMessage(params: ExecuteAgentParams): string {
        return this.buildInitializationProgressMessage(params);
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
        it('emits "Getting ready..." on initialization', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            expect(agent.testBuildInitializationProgressMessage(params)).toBe('Getting ready...');
        });

        it('uses user-friendly "thinking" phrasing with the root agent name on initial turn', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            expect(agent.testFormatHierarchicalPromptMessage(params, null)).toBe(
                'Sage is thinking...'
            );
        });

        it('uses retryReason directly without splicing inside "Running X with context from ..."', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryReason: 'Analyzing results from 1 completed action',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Analyzing results from 1 completed action'
            );
        });

        it('translates internal "Payload change applied" retryReason into user-friendly thinking phrasing', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryReason: 'Payload change applied',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Sage is thinking through the next steps...'
            );
        });

        it('translates internal "Context recovery" retryReason into user-friendly thinking phrasing', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryReason: 'Context recovery successful - 1200 tokens freed',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Sage is thinking...'
            );
        });

        it('translates internal loop retryInstructions into user-friendly batch review phrasing', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryInstructions: "Completed ForEach loop request using collection at 'items'",
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Sage is reviewing batch results...'
            );
        });

        it('falls back to "<Agent> is thinking through the next steps..." when neither retryReason nor retryInstructions is present', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(0, ['Sage']);
            const params = createParams('Sage');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Sage is thinking through the next steps...'
            );
        });
    });

    describe('Sub-agent (_depth > 0)', () => {
        it('emits "Starting <SubAgentName>..." on direct sub-agent initialization and includes parent breadcrumb when nested', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(1, ['Sage', 'Query Strategist']);
            const params = createParams('Query Strategist');

            expect(agent.testBuildInitializationProgressMessage(params)).toBe(
                'Starting Query Strategist...'
            );

            agent.setHierarchyForTest(2, ['Sage', 'Query Builder', 'Query Strategist']);
            expect(agent.testBuildInitializationProgressMessage(params)).toBe(
                'Query Builder: Starting Query Strategist...'
            );
        });

        it('emits "<SubAgent>: Thinking..." without repeating the sub-agent name on initial turn', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(1, ['Sage', 'Query Strategist']);
            const params = createParams('Query Strategist');

            expect(agent.testFormatHierarchicalPromptMessage(params, null)).toBe(
                'Query Strategist: Thinking...'
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

        it('translates internal "Payload change applied" into "<SubAgent>: Thinking through the next steps..."', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(1, ['Sage', 'Query Strategist']);
            const params = createParams('Query Strategist');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
                retryReason: 'Payload change applied',
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Query Strategist: Thinking through the next steps...'
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

        it('falls back to "Thinking through the next steps..." without repeating the sub-agent name', () => {
            const agent = new ProgressMessageTestAgent();
            agent.setHierarchyForTest(1, ['Sage', 'Query Strategist']);
            const params = createParams('Query Strategist');

            const decision: BaseAgentNextStep = {
                step: 'Retry',
                terminate: false,
            };

            expect(agent.testFormatHierarchicalPromptMessage(params, decision)).toBe(
                'Query Strategist: Thinking through the next steps...'
            );
        });
    });
});
