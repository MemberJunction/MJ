/**
 * Tests for FlowAgentType — focusing on testable logic:
 * - FlowExecutionState tracking
 * - applyActionOutputMapping (via PostProcessActionStep)
 * - InitializeAgentTypeState
 * - InjectLoopResultsAsMessage (getter)
 * - RequiresAgentLevelPrompts (getter)
 *
 * DetermineNextStep, getValidPaths, createStepForFlowNode require AIEngine.Instance
 * and entity lookups which are too heavy to mock in unit tests. Those need integration tests.
 *
 * Bug pattern focus:
 * - Data loss in hierarchical return paths (missing fields in specialized returns)
 * - Special fields ($message, $reasoning, $confidence) extraction
 * - Case-insensitive output parameter lookup
 * - Array append syntax (key[])
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowAgentType, FlowExecutionState } from '../agent-types/flow-agent-type';
import { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

// Mock AIEngine and ActionEngineServer since FlowAgentType imports them
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { GetPathsFromStep: vi.fn(() => []), GetAgentSteps: vi.fn(() => []) } },
}));
vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: { Config: { entities: [] } } },
}));

describe('FlowExecutionState', () => {
    it('should initialize with empty tracking collections', () => {
        const state = new FlowExecutionState('agent-123');
        expect(state.agentId).toBe('agent-123');
        expect(state.currentStepId).toBeUndefined();
        expect(state.completedStepIds.size).toBe(0);
        expect(state.stepResults.size).toBe(0);
        expect(state.executionPath).toEqual([]);
        expect(state.specialFields).toBeUndefined();
    });

    it('should track step completion correctly', () => {
        const state = new FlowExecutionState('agent-123');
        state.completedStepIds.add('step-1');
        state.completedStepIds.add('step-2');
        state.executionPath.push('step-1', 'step-2');
        state.stepResults.set('step-1', { Success: true });

        expect(state.completedStepIds.has('step-1')).toBe(true);
        expect(state.completedStepIds.has('step-3')).toBe(false);
        expect(state.executionPath).toEqual(['step-1', 'step-2']);
        expect(state.stepResults.get('step-1')).toEqual({ Success: true });
    });
});

describe('FlowAgentType', () => {
    let agent: FlowAgentType;

    beforeEach(() => {
        agent = new FlowAgentType();
    });

    describe('InitializeAgentTypeState', () => {
        it('should create a FlowExecutionState with the agent ID', async () => {
            const params = {
                agent: { ID: 'agent-abc-123' },
            } as ExecuteAgentParams;

            const state = await agent.InitializeAgentTypeState(params);
            expect(state).toBeInstanceOf(FlowExecutionState);
            expect((state as FlowExecutionState).agentId).toBe('agent-abc-123');
        });
    });

    describe('InjectLoopResultsAsMessage', () => {
        it('should return false (flow agents dont inject loop results as messages)', () => {
            expect(agent.InjectLoopResultsAsMessage).toBe(false);
        });
    });

    describe('RequiresAgentLevelPrompts', () => {
        it('should return false (flow agents use step-level prompts)', () => {
            expect(agent.RequiresAgentLevelPrompts).toBe(false);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // applyActionOutputMapping (private, tested via the public accessor
    // pattern — we access it through PostProcessActionStep)
    //
    // Since PostProcessActionStep needs entity lookups (AIEngine), we test
    // the output mapping logic by calling the private method directly
    // through a type assertion. This is a pragmatic choice for unit testing
    // complex private logic without heavyweight integration mocks.
    // ════════════════════════════════════════════════════════════════════

    describe('applyActionOutputMapping (internal)', () => {
        // Access private method for targeted unit testing
        function applyMapping(
            actionResult: Record<string, unknown>,
            payload: Record<string, unknown>,
            mappingConfig: string,
        ) {
            return (agent as unknown as Record<string, Function>)['applyActionOutputMapping'](
                actionResult, payload, mappingConfig,
            );
        }

        it('should map simple output parameter to payload path', () => {
            const result = applyMapping(
                { Result: 'success', Code: 200 },
                {},
                JSON.stringify({ Result: 'status', Code: 'statusCode' }),
            );
            expect(result.payloadChange).toEqual({
                updateElements: { status: 'success', statusCode: 200 },
            });
        });

        it('should use case-insensitive lookup for output parameters', () => {
            // Documented: "Case-insensitive lookup"
            const result = applyMapping(
                { RESULT: 'found-it' },
                {},
                JSON.stringify({ result: 'data' }), // lowercase in mapping
            );
            expect(result.payloadChange.updateElements.data).toBe('found-it');
        });

        it('should extract wildcard (*) as entire action result', () => {
            const actionResult = { key1: 'val1', key2: 'val2' };
            const result = applyMapping(
                actionResult,
                {},
                JSON.stringify({ '*': 'fullResult' }),
            );
            expect(result.payloadChange.updateElements.fullResult).toEqual(actionResult);
        });

        it('should extract special fields ($message, $reasoning, $confidence)', () => {
            const result = applyMapping(
                { Message: 'Done!', Score: 0.95, Notes: 'All good' },
                {},
                JSON.stringify({
                    Message: '$message',
                    Score: '$confidence',
                    Notes: '$reasoning',
                }),
            );
            expect(result.payloadChange).toBeNull(); // Special fields NOT in payload
            expect(result.specialFields.message).toBe('Done!');
            expect(result.specialFields.confidence).toBe(0.95);
            expect(result.specialFields.reasoning).toBe('All good');
        });

        it('should build nested payload paths via dot notation', () => {
            const result = applyMapping(
                { Value: 42 },
                {},
                JSON.stringify({ Value: 'analysis.metrics.score' }),
            );
            expect(result.payloadChange.updateElements.analysis.metrics.score).toBe(42);
        });

        it('should support array append syntax (key[])', () => {
            const result = applyMapping(
                { Item: 'new-entry' },
                {},
                JSON.stringify({ Item: 'results[]' }),
            );
            // Should create array and push
            expect(Array.isArray(result.payloadChange.updateElements.results)).toBe(true);
            expect(result.payloadChange.updateElements.results).toContain('new-entry');
        });

        it('should support dot notation in output param (nested source access)', () => {
            const result = applyMapping(
                { AgentSpec: { ID: 'spec-123', Name: 'TestSpec' } },
                {},
                JSON.stringify({ 'AgentSpec.ID': 'specId', 'AgentSpec.Name': 'specName' }),
            );
            expect(result.payloadChange.updateElements.specId).toBe('spec-123');
            expect(result.payloadChange.updateElements.specName).toBe('TestSpec');
        });

        it('should return null payloadChange when no mappings produce values', () => {
            const result = applyMapping(
                { Foo: 'bar' },
                {},
                JSON.stringify({ NonExistent: 'target' }),
            );
            expect(result.payloadChange).toBeNull();
        });

        it('should handle invalid JSON config gracefully', () => {
            const result = applyMapping(
                { Foo: 'bar' },
                {},
                'not valid json',
            );
            expect(result.payloadChange).toBeNull();
        });

        it('should skip undefined values (output param not found in result)', () => {
            const result = applyMapping(
                { A: 1 },
                {},
                JSON.stringify({ A: 'found', B: 'notFound' }),
            );
            // Only 'A' should be mapped
            expect(result.payloadChange.updateElements.found).toBe(1);
            expect('notFound' in result.payloadChange.updateElements).toBe(false);
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // setMappedValue (private helper — tested for array append edge cases)
    // ════════════════════════════════════════════════════════════════════

    describe('setMappedValue (internal)', () => {
        function setMappedValue(target: Record<string, unknown>, key: string, value: unknown) {
            return (agent as unknown as Record<string, Function>)['setMappedValue'](target, key, value);
        }

        it('should set simple property', () => {
            const target: Record<string, unknown> = {};
            setMappedValue(target, 'name', 'Alice');
            expect(target.name).toBe('Alice');
        });

        it('should auto-initialize and append to array with [] syntax', () => {
            const target: Record<string, unknown> = {};
            setMappedValue(target, 'items[]', 'first');
            setMappedValue(target, 'items[]', 'second');
            expect(target.items).toEqual(['first', 'second']);
        });

        it('should throw when appending to non-array with [] syntax', () => {
            const target: Record<string, unknown> = { items: 'not-an-array' };
            expect(() => setMappedValue(target, 'items[]', 'value')).toThrow('not an array');
        });
    });
});
