/**
 * Tests for the While loop's condition handling in BaseAgent (plans/typed-decision-models.md,
 * Task 0.8).
 *
 * The bug: `executeWhileIterations` treated a condition the evaluator could NOT evaluate exactly
 * like one that evaluated to false — it broke out, discarded the evaluator's error, and
 * `completeWhileLoop` finalized the step as a success, "after 0 iteration(s)". A malformed or
 * disallowed condition produced a green, zero-iteration loop with the cause visible nowhere.
 *
 * Exercises the REAL private methods on a real BaseAgent instance; only the single-iteration body
 * and step persistence are stubbed, since neither is under test here.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { BaseAgentNextStep, ExecuteAgentParams, WhileOperation } from '@memberjunction/ai-core-plus';

interface WhileLoopResults {
    results: BaseAgentNextStep[];
    errors: unknown[];
    finalPayload: BaseAgentNextStep['newPayload'];
    iterations: number;
    conditionError?: string;
}

type IterationStub = (whileOp: WhileOperation, attemptContext: object, index: number, currentPayload: Record<string, unknown>)
    => Promise<{ payload?: Record<string, unknown>; error?: { index: number; message: string }; result?: BaseAgentNextStep }>;

interface WhileInternals {
    executeWhileIterations(whileOp: WhileOperation, initialPayload: object, parentStepId: string,
                           params: ExecuteAgentParams, config: object): Promise<WhileLoopResults>;
    completeWhileLoop(whileOp: WhileOperation, loopStepEntity: object, loopResults: WhileLoopResults,
                      previousDecision: BaseAgentNextStep, params: ExecuteAgentParams): Promise<BaseAgentNextStep>;
    formatLoopErrors(errors: unknown[]): string;
    executeSingleWhileIteration: ReturnType<typeof vi.fn<IterationStub>>;
    finalizeStepEntity: ReturnType<typeof vi.fn>;
}

const PARAMS = {} as ExecuteAgentParams;
const DECISION: BaseAgentNextStep = { step: 'While', terminate: false, previousPayload: { count: 0 } };

function makeAgent(iteration?: IterationStub): WhileInternals {
    const agent = new BaseAgent() as unknown as WhileInternals;
    agent.executeSingleWhileIteration = vi.fn<IterationStub>(iteration ?? (async (_op, _ctx, _i, payload) => ({ payload, result: DECISION })));
    agent.finalizeStepEntity = vi.fn(async () => undefined);
    // completeWhileLoop reads the agent type only on the non-failing path.
    Object.defineProperty(agent, 'AgentTypeInstance', { get: () => ({ InjectLoopResultsAsMessage: false }) });
    return agent;
}

function whileOp(condition: string): WhileOperation {
    return { condition, action: { name: 'Tick', params: {} }, maxIterations: 10 } as WhileOperation;
}

/** Each iteration increments payload.count. */
const increment: IterationStub = async (_op, _ctx, _i, payload) => ({
    payload: { ...payload, count: Number(payload.count ?? 0) + 1 },
    result: DECISION,
});

describe('BaseAgent While loop — condition that cannot be evaluated', () => {
    it.each([
        ['a forbidden construct', 'payload.count = 5', 'AssignmentExpression is not allowed'],
        ['a parse error', 'payload.count ===', 'not a parseable single expression'],
    ])('records %s as a condition error instead of ending the loop silently', async (_label, condition, evaluatorError) => {
        const agent = makeAgent();
        const out = await agent.executeWhileIterations(whileOp(condition), { count: 0 }, 'parent', PARAMS, {});

        expect(out.iterations).toBe(0);
        expect(agent.executeSingleWhileIteration).not.toHaveBeenCalled();
        expect(out.conditionError).toContain(evaluatorError);
        expect(out.conditionError).toContain(condition);
        expect(out.errors).toHaveLength(1);
    });

    it('records a runtime evaluation failure that happens mid-loop, keeping earlier results', async () => {
        // Iteration 1 drops `items`, so the second evaluation throws a TypeError.
        const agent = makeAgent(async () => ({ payload: {}, result: DECISION }));
        const out = await agent.executeWhileIterations(whileOp('payload.items.length > 0'), { items: [1] }, 'parent', PARAMS, {});

        expect(out.iterations).toBe(1);
        expect(out.results).toHaveLength(1);
        expect(out.conditionError).toContain("Cannot read properties of undefined (reading 'length')");
    });

    it('fails the step when the condition could not be evaluated before the first iteration', async () => {
        const agent = makeAgent();
        const op = whileOp('payload.count ===');
        const results = await agent.executeWhileIterations(op, { count: 0 }, 'parent', PARAMS, {});
        const step = await agent.completeWhileLoop(op, {}, results, DECISION, PARAMS);

        expect(step.step).toBe('Failed');
        expect(step.errorMessage).toContain('not a parseable single expression');
        const [, success, errorMessage] = agent.finalizeStepEntity.mock.calls[0];
        expect(success).toBe(false);
        expect(errorMessage).toContain('not a parseable single expression');
        expect(errorMessage).not.toContain('[object Object]');
    });

    it('reports a mid-loop evaluation failure to the model and finalizes the step as failed', async () => {
        const agent = makeAgent(async () => ({ payload: {}, result: DECISION }));
        const op = whileOp('payload.items.length > 0');
        const results = await agent.executeWhileIterations(op, { items: [1] }, 'parent', PARAMS, {});
        const step = await agent.completeWhileLoop(op, {}, results, DECISION, PARAMS);

        expect(step.step).toBe('Retry');
        expect(step.retryInstructions).toContain('stopped after 1 iteration(s)');
        expect(step.retryInstructions).toContain('could not be evaluated');
        expect(agent.finalizeStepEntity.mock.calls[0][1]).toBe(false);
    });
});

describe('BaseAgent While loop — condition that evaluates normally (behaviour preserved)', () => {
    it('ends cleanly when the condition is false from the start', async () => {
        const agent = makeAgent(increment);
        const op = whileOp('payload.count < 0');
        const results = await agent.executeWhileIterations(op, { count: 0 }, 'parent', PARAMS, {});
        const step = await agent.completeWhileLoop(op, {}, results, DECISION, PARAMS);

        expect(results.iterations).toBe(0);
        expect(results.conditionError).toBeUndefined();
        expect(step.step).toBe('Retry');
        expect(step.retryInstructions).toBe("Completed While loop request using condition 'payload.count < 0' after 0 iteration(s)");
        expect(agent.finalizeStepEntity.mock.calls[0][1]).toBe(true);
    });

    it('iterates until the condition turns false', async () => {
        const agent = makeAgent(increment);
        const results = await agent.executeWhileIterations(whileOp('payload.count < 3'), { count: 0 }, 'parent', PARAMS, {});

        expect(results.iterations).toBe(3);
        expect(results.conditionError).toBeUndefined();
        expect(results.finalPayload).toEqual({ count: 3 });
    });
});

describe('loop error text', () => {
    it('renders iteration error objects by message, never as [object Object]', () => {
        const agent = makeAgent();
        const text = agent.formatLoopErrors([{ index: 0, item: {}, message: 'boom' }, 'plain', { index: 2 }]);

        expect(text).toBe('boom\n\nplain\n\n{"index":2}');
    });
});
