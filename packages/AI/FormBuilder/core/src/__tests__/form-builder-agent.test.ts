import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BaseAgentNextStep } from '@memberjunction/ai-core-plus';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

// Sentinel returned by the mocked base executeNextStep so tests can prove the
// orchestrator delegated actual sub-agent execution to the base class.
const SUPER_EXECUTE_SENTINEL = vi.fn();

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class BaseAgent {
        protected async determineNextStep<P>(
            _params: unknown, _agentType: unknown, _promptResult: unknown, currentPayload: P,
        ): Promise<BaseAgentNextStep<P>> {
            // Base "fallback" implementation — orchestrator tests verify the
            // forced-transition intercepts override THIS.
            return { terminate: false, step: 'Success' as const, newPayload: currentPayload };
        }
        // Base step dispatcher. The real one runs the agent's prompt or the
        // requested sub-agent; here we just record the call and echo a result so
        // tests can assert the orchestrator delegated 'Sub-Agent' steps to it.
        protected async executeNextStep<P>(
            _params: unknown, _config: unknown, previousDecision: BaseAgentNextStep<P> | null,
        ): Promise<BaseAgentNextStep<P>> {
            SUPER_EXECUTE_SENTINEL(previousDecision);
            return { terminate: false, step: 'Success' as const, newPayload: previousDecision?.newPayload as P };
        }
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: unknown) => _target,
}));

vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { FormBuilderAgent } from '../agents/form-builder-agent.js';
import type { FormBuilderPayload } from '../interfaces.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

type TestableOrchestrator = {
    determineNextStep<P>(
        params: unknown, agentType: unknown, promptResult: unknown, currentPayload: P,
    ): Promise<BaseAgentNextStep<P>>;
    executeNextStep<P>(
        params: unknown, config: unknown, previousDecision: BaseAgentNextStep<P> | null, stepCount?: number,
    ): Promise<BaseAgentNextStep<P>>;
};

const orchestrator = new FormBuilderAgent() as unknown as TestableOrchestrator;

async function step(payload: FormBuilderPayload): Promise<BaseAgentNextStep<FormBuilderPayload>> {
    return orchestrator.determineNextStep({}, {}, {}, payload);
}

async function dispatch(
    previousDecision: BaseAgentNextStep<FormBuilderPayload> | null,
    payload?: FormBuilderPayload,
): Promise<BaseAgentNextStep<FormBuilderPayload>> {
    return orchestrator.executeNextStep({ payload }, {}, previousDecision);
}

const VALID_SPEC = {
    name: 'TestForm',
    componentRole: 'form' as const,
    location: 'embedded' as const,
    code: 'function TestForm() { return null; }',
};

const VALID_INTENT = {
    Operation: 'create' as const,
    EntityName: 'MJ: Applications',
    UserPromptSummary: 'Make a form',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FormBuilderAgent.determineNextStep', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('Intercept 1 — BuilderResult present (terminate)', () => {
        it('terminates with Success when BuilderResult.Success === true', async () => {
            const next = await step({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                BuilderResult: {
                    Success: true,
                    Mode: 'create',
                    ComponentID: 'c-1',
                    OverrideID: 'o-1',
                    Version: '1.0.0',
                    LintAttempts: 1,
                },
            });
            expect(next.terminate).toBe(true);
            expect(next.step).toBe('Success');
            expect(next.reasoning).toContain('Created a Pending v1.0.0');
            expect(next.errorMessage).toBeUndefined();
        });

        it('terminates with Failed when BuilderResult.Success === false', async () => {
            const next = await step({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                BuilderResult: {
                    Success: false,
                    Mode: 'create',
                    LintAttempts: 3,
                    ErrorMessage: 'persistence failed after 3 attempts',
                },
            });
            expect(next.terminate).toBe(true);
            expect(next.step).toBe('Failed');
            expect(next.errorMessage).toContain('persistence failed after 3 attempts');
            expect(next.reasoning).toContain('Could not save');
        });

        it('Success summary tag is "in-place" for in-place modify', async () => {
            const next = await step({
                Intent: { ...VALID_INTENT, Operation: 'modify' },
                Spec: VALID_SPEC,
                BuilderResult: {
                    Success: true, Mode: 'in-place', Version: '1.0.0', LintAttempts: 1,
                },
            });
            expect(next.reasoning).toContain('in place');
            expect(next.reasoning).toContain('v1.0.0');
        });

        it('Success summary tag is "Saved a Pending" for new-version modify', async () => {
            const next = await step({
                Intent: { ...VALID_INTENT, Operation: 'modify' },
                Spec: VALID_SPEC,
                BuilderResult: {
                    Success: true, Mode: 'new-version', Version: '1.1.0',
                    BumpKind: 'minor', LintAttempts: 1,
                },
            });
            expect(next.reasoning).toContain('Saved a Pending v1.1.0');
            expect(next.reasoning).toContain('Activate');
        });

        it('mentions lint-attempt count when retries happened', async () => {
            const next = await step({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                BuilderResult: { Success: true, Mode: 'create', Version: '1.0.0', LintAttempts: 2 },
            });
            expect(next.reasoning).toContain('2 lint attempts');
        });

        it('omits attempt counts when LintAttempts === 1', async () => {
            const next = await step({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                BuilderResult: { Success: true, Mode: 'create', Version: '1.0.0', LintAttempts: 1 },
            });
            expect(next.reasoning).not.toContain('lint attempts');
        });
    });

    describe('Intercept 2 — Designer output ready (route to Builder)', () => {
        it('routes to "Form Builder - Builder" when Intent + Spec are populated', async () => {
            const next = await step({ Intent: VALID_INTENT, Spec: VALID_SPEC });
            expect(next.step).toBe('Sub-Agent');
            expect(next.terminate).toBe(false);
            expect(next.subAgent?.name).toBe('Form Builder - Builder');
            expect(next.subAgent?.terminateAfter).toBe(true);
        });

        it('forwards the payload to the Builder unchanged', async () => {
            const payload = { Intent: VALID_INTENT, Spec: VALID_SPEC };
            const next = await step(payload);
            expect(next.newPayload).toEqual(payload);
        });

        it('does NOT route to Builder when Spec.name is missing', async () => {
            const next = await step({
                Intent: VALID_INTENT,
                Spec: { ...VALID_SPEC, name: '' } as never,
            });
            // Falls through to Intercept 3 (no Spec).
            expect(next.subAgent?.name).toBe('Form Builder - Designer');
        });

        it('does NOT route to Builder when Intent.EntityName is empty', async () => {
            const next = await step({
                Intent: { ...VALID_INTENT, EntityName: '' },
                Spec: VALID_SPEC,
            });
            // Falls through — invalid Designer output.
            expect(next.subAgent?.name).toBe('Form Builder - Designer');
        });
    });

    describe('Intercept 3 — No Designer output (route to Designer)', () => {
        it('routes to "Form Builder - Designer" on an empty payload', async () => {
            const next = await step({});
            expect(next.step).toBe('Sub-Agent');
            expect(next.terminate).toBe(false);
            expect(next.subAgent?.name).toBe('Form Builder - Designer');
            expect(next.subAgent?.terminateAfter).toBe(false);
        });

        it('routes to Designer when only Intent is set', async () => {
            const next = await step({ Intent: VALID_INTENT });
            expect(next.subAgent?.name).toBe('Form Builder - Designer');
        });

        it('routes to Designer when only Spec is set', async () => {
            const next = await step({ Spec: VALID_SPEC });
            expect(next.subAgent?.name).toBe('Form Builder - Designer');
        });
    });

    describe('Designer attempt budget', () => {
        it('increments DesignerAttemptCount on each Designer routing', async () => {
            const next1 = await step({});
            expect((next1.newPayload as FormBuilderPayload).DesignerAttemptCount).toBe(1);

            const next2 = await step({ DesignerAttemptCount: 1 });
            expect((next2.newPayload as FormBuilderPayload).DesignerAttemptCount).toBe(2);

            const next3 = await step({ DesignerAttemptCount: 2 });
            expect((next3.newPayload as FormBuilderPayload).DesignerAttemptCount).toBe(3);
            expect(next3.subAgent?.name).toBe('Form Builder - Designer');
        });

        it('terminates with Failed once the budget (3) is exhausted', async () => {
            const next = await step({ DesignerAttemptCount: 3 });
            expect(next.terminate).toBe(true);
            expect(next.step).toBe('Failed');
            expect(next.errorMessage).toContain('Designer failed to produce a valid spec after 3 attempts');
            expect(next.subAgent).toBeUndefined();
        });

        it('does NOT enforce the budget when Designer output is already valid', async () => {
            // Even with an over-budget attempt count, if the payload is good
            // we route to Builder (the Designer is no longer in play).
            const next = await step({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                DesignerAttemptCount: 5,
            });
            expect(next.subAgent?.name).toBe('Form Builder - Builder');
        });
    });

    describe('Intercept precedence', () => {
        it('BuilderResult presence wins over Intent + Spec', async () => {
            const next = await step({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                BuilderResult: { Success: true, Mode: 'create', Version: '1.0.0', LintAttempts: 1 },
            });
            expect(next.terminate).toBe(true);
            expect(next.step).toBe('Success');
        });

        it('Designer output ready wins when no BuilderResult', async () => {
            const next = await step({ Intent: VALID_INTENT, Spec: VALID_SPEC });
            expect(next.subAgent?.name).toBe('Form Builder - Builder');
        });
    });
});

// The orchestrator has NO agent-level prompt. These tests lock in the fix that
// makes it prompt-free: executeNextStep must route deterministically (never run
// a prompt) and only delegate actual sub-agent execution to the base class.
describe('FormBuilderAgent.executeNextStep (prompt-free routing)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('initial step (no previous decision) routes to the Designer without delegating to the base prompt path', async () => {
        const next = await dispatch(null, {});
        expect(next.step).toBe('Sub-Agent');
        expect(next.subAgent?.name).toBe('Form Builder - Designer');
        // Crucially, the base dispatcher (which would run the missing prompt) was NOT called.
        expect(SUPER_EXECUTE_SENTINEL).not.toHaveBeenCalled();
    });

    it("after the Designer returns ('Success' with Intent + Spec) it routes to the Builder, no prompt", async () => {
        const designerReturn: BaseAgentNextStep<FormBuilderPayload> = {
            step: 'Success',
            terminate: false,
            newPayload: { Intent: VALID_INTENT, Spec: VALID_SPEC },
        };
        const next = await dispatch(designerReturn);
        expect(next.step).toBe('Sub-Agent');
        expect(next.subAgent?.name).toBe('Form Builder - Builder');
        expect(SUPER_EXECUTE_SENTINEL).not.toHaveBeenCalled();
    });

    it("delegates actual 'Sub-Agent' steps to the base implementation", async () => {
        const subAgentStep: BaseAgentNextStep<FormBuilderPayload> = {
            step: 'Sub-Agent',
            terminate: false,
            newPayload: { Intent: VALID_INTENT },
            subAgent: { name: 'Form Builder - Designer', message: 'go', terminateAfter: false },
        };
        await dispatch(subAgentStep);
        expect(SUPER_EXECUTE_SENTINEL).toHaveBeenCalledTimes(1);
        expect(SUPER_EXECUTE_SENTINEL).toHaveBeenCalledWith(subAgentStep);
    });

    it('terminates once a BuilderResult is present, no prompt', async () => {
        const builderReturn: BaseAgentNextStep<FormBuilderPayload> = {
            step: 'Success',
            terminate: false,
            newPayload: {
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                BuilderResult: { Success: true, Mode: 'create', Version: '1.0.0', LintAttempts: 1 },
            },
        };
        const next = await dispatch(builderReturn);
        expect(next.terminate).toBe(true);
        expect(next.step).toBe('Success');
        expect(SUPER_EXECUTE_SENTINEL).not.toHaveBeenCalled();
    });
});
