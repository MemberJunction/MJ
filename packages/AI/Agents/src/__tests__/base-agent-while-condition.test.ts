/**
 * Tests for the While loop's condition handling in BaseAgent (plans/typed-decision-models.md,
 * Task 0.8).
 *
 * The bug: `executeWhileIterations` treated a condition the evaluator could NOT evaluate exactly
 * like one that evaluated to false — it broke out, discarded the evaluator's error, and
 * `completeWhileLoop` finalized the step as a success, "after 0 iteration(s)". A malformed or
 * disallowed condition produced a green, zero-iteration loop with the cause visible nowhere.
 *
 * The follow-up: when the loop fails before it has run, a Loop agent's model must be TOLD why. A
 * Loop agent answers a Failed step by prompting again, and nothing on that path reads the step's
 * errorMessage — only the loop-results message injected into `params.conversationMessages` reaches
 * the model. That applies to every loop that fails before its first iteration: a While condition
 * that cannot be evaluated, an invalid While/ForEach configuration, a ForEach collection that is
 * not an array.
 *
 * Exercises the REAL private methods on a real BaseAgent instance; only the single-iteration body
 * and step persistence are stubbed, since neither is under test here.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { AgentChatMessage, BaseAgentNextStep, ExecuteAgentParams, ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';

/** Structural mirror of base-agent.ts's module-private LoopIterationError. */
interface LoopIterationError {
    index: number;
    message: string;
    item?: unknown;
}

interface WhileLoopResults {
    results: BaseAgentNextStep[];
    errors: LoopIterationError[];
    finalPayload: BaseAgentNextStep['newPayload'];
    iterations: number;
    conditionError?: string;
}

type IterationStub = (whileOp: WhileOperation, attemptContext: object, index: number, currentPayload: Record<string, unknown>)
    => Promise<{ payload?: Record<string, unknown>; error?: LoopIterationError; result?: BaseAgentNextStep }>;

interface WhileInternals {
    executeWhileIterations(whileOp: WhileOperation, initialPayload: object, parentStepId: string,
                           params: ExecuteAgentParams, config: object): Promise<WhileLoopResults>;
    completeWhileLoop(whileOp: WhileOperation, loopStepEntity: object, loopResults: WhileLoopResults,
                      previousDecision: BaseAgentNextStep, params: ExecuteAgentParams): Promise<BaseAgentNextStep>;
    executeWhileLoop(params: ExecuteAgentParams, config: object, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    executeForEachLoop(params: ExecuteAgentParams, config: object, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    formatLoopErrors(errors: LoopIterationError[]): string;
    executeSingleWhileIteration: ReturnType<typeof vi.fn<IterationStub>>;
    finalizeStepEntity: ReturnType<typeof vi.fn>;
    resolveLoopExpirationMetadata: ReturnType<typeof vi.fn>;
}

const PARAMS = {} as ExecuteAgentParams;
const DECISION: BaseAgentNextStep = { step: 'While', terminate: false, previousPayload: { count: 0 } };

/**
 * @param injectLoopResults the agent type's InjectLoopResultsAsMessage: true for a Loop agent (the
 *   default on BaseAgentType), false for a Flow agent.
 */
function makeAgent(iteration?: IterationStub, injectLoopResults = false): WhileInternals {
    const agent = new BaseAgent() as unknown as WhileInternals;
    agent.executeSingleWhileIteration = vi.fn<IterationStub>(iteration ?? (async (_op, _ctx, _i, payload) => ({ payload, result: DECISION })));
    agent.finalizeStepEntity = vi.fn(async () => undefined);
    // Looks up the loop action's expiration settings in the AI/Action engines — a metadata boundary.
    agent.resolveLoopExpirationMetadata = vi.fn(() => ({ turnAdded: 0, messageType: 'loop-result' }));
    Object.defineProperty(agent, 'AgentTypeInstance', { get: () => ({ InjectLoopResultsAsMessage: injectLoopResults }) });
    return agent;
}

/** Params whose conversation the loop can write into — what the model is shown on its next turn. */
function conversationParams(): ExecuteAgentParams & { conversationMessages: AgentChatMessage[] } {
    return { conversationMessages: [] } as unknown as ExecuteAgentParams & { conversationMessages: AgentChatMessage[] };
}

/** The text of every message the loop added to the conversation. */
function addedMessages(params: ExecuteAgentParams): string[] {
    return params.conversationMessages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
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

describe('BaseAgent loops — the model is told why a loop failed before its first iteration', () => {
    it('injects the evaluator\'s message for a Loop agent when the condition fails before the first iteration', async () => {
        const agent = makeAgent(undefined, true);
        const params = conversationParams();
        const op = whileOp('payload.count =');
        const results = await agent.executeWhileIterations(op, { count: 0 }, 'parent', params, {});
        const step = await agent.completeWhileLoop(op, {}, results, DECISION, params);

        expect(step.step).toBe('Failed');
        const messages = addedMessages(params);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("While condition 'payload.count =' could not be evaluated");
        expect(messages[0]).toContain('not a parseable single expression');
        expect(messages[0]).toContain('**Processed:** 0, **Errors:** 1');
    });

    it('injects nothing for a Flow agent, which navigates paths instead of re-prompting', async () => {
        const agent = makeAgent(undefined, false);
        const params = conversationParams();
        const op = whileOp('payload.count =');
        const results = await agent.executeWhileIterations(op, { count: 0 }, 'parent', params, {});
        const whileStep = await agent.completeWhileLoop(op, {}, results, DECISION, params);
        const forEachStep = await agent.executeForEachLoop(params, {}, {
            step: 'ForEach', terminate: false, previousPayload: { items: 'not a list' },
            forEach: { collectionPath: 'payload.items', itemVariable: 'item' } as ForEachOperation,
        });

        expect(whileStep.step).toBe('Failed');
        expect(forEachStep.step).toBe('Failed');
        expect(addedMessages(params)).toEqual([]);
    });

    it('injects the error for a While whose configuration is invalid', async () => {
        const agent = makeAgent(undefined, true);
        const params = conversationParams();
        // No itemVariable: validateWhileOperation rejects it before any step is created.
        const decision: BaseAgentNextStep = { ...DECISION, while: { condition: 'payload.count < 3' } as WhileOperation };
        const step = await agent.executeWhileLoop(params, {}, decision);

        expect(step.step).toBe('Failed');
        expect(step.errorMessage).toBe('While configuration invalid: Item variable is required');
        expect(addedMessages(params)).toEqual([expect.stringContaining('• ✗ While configuration invalid: Item variable is required')]);
    });

    it('injects the error for a ForEach whose collection is not an array', async () => {
        const agent = makeAgent(undefined, true);
        const params = conversationParams();
        const decision: BaseAgentNextStep = {
            step: 'ForEach', terminate: false, previousPayload: { items: 'not a list' },
            forEach: { collectionPath: 'payload.items', itemVariable: 'item' } as ForEachOperation,
        };
        const step = await agent.executeForEachLoop(params, {}, decision);

        expect(step.step).toBe('Failed');
        expect(step.errorMessage).toBe('Collection path "payload.items" not an array');
        const messages = addedMessages(params);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('**Collection:** payload.items');
        expect(messages[0]).toContain('• ✗ Collection path "payload.items" not an array');
    });

    it('injects the error for a ForEach whose configuration is invalid', async () => {
        const agent = makeAgent(undefined, true);
        const params = conversationParams();
        const decision: BaseAgentNextStep = {
            step: 'ForEach', terminate: false, previousPayload: { items: [1] },
            forEach: { collectionPath: 'payload.items', itemVariable: '' } as ForEachOperation,
        };
        const step = await agent.executeForEachLoop(params, {}, decision);

        expect(step.step).toBe('Failed');
        expect(addedMessages(params)).toEqual([expect.stringContaining('• ✗ ForEach configuration invalid: Item variable is required')]);
    });
});

describe('loop error text', () => {
    it('renders iteration error objects by message, never as [object Object]', () => {
        const agent = makeAgent();
        const text = agent.formatLoopErrors([{ index: 0, item: {}, message: 'boom' }, { index: 1, message: 'second' }]);

        expect(text).toBe('boom\n\nsecond');
    });

    it('falls back to the error as JSON when it carries no message (an iteration threw a non-Error)', () => {
        const agent = makeAgent();

        expect(agent.formatLoopErrors([{ index: 2, message: '' }])).toBe('{"index":2,"message":""}');
    });
});
