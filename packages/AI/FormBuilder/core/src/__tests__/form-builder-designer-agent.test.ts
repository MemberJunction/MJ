import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class BaseAgent {
        // Stub base validateSuccessNextStep that just passes through (no retry).
        protected async validateSuccessNextStep<P>(
            _params: unknown,
            nextStep: P,
            _currentPayload: unknown,
            _agentRun: unknown,
            _currentStep: unknown,
        ): Promise<P> {
            return nextStep;
        }
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: unknown) => _target,
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn(),
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { FormBuilderDesignerAgent } from '../agents/form-builder-designer-agent.js';
import type { FormBuilderPayload } from '../interfaces.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

type TestableDesigner = {
    validateSuccessNextStep<P>(
        params: unknown,
        nextStep: { step: string; newPayload?: P; retryInstructions?: string },
        currentPayload: P,
        agentRun: unknown,
        currentStep: unknown,
    ): Promise<{ step: string; retryInstructions?: string; newPayload?: P }>;
};

const designer = new FormBuilderDesignerAgent() as unknown as TestableDesigner;

async function run(payload: FormBuilderPayload): Promise<{ step: string; retryInstructions?: string }> {
    return designer.validateSuccessNextStep(
        { contextUser: { ID: 'u-1' } },
        { step: 'Success' as const, newPayload: payload },
        {} as FormBuilderPayload,
        {} as unknown,
        {} as unknown,
    );
}

const VALID_SPEC = {
    name: 'TestForm',
    componentRole: 'form' as const,
    location: 'embedded' as const,
    code: 'function TestForm() { return null; }',
};

const VALID_INTENT = {
    Operation: 'modify' as const,
    EntityName: 'MJ: Applications',
    UserPromptSummary: 'Tidy up the form',
    VersionBumpKind: 'auto' as const,
};

const VALID_EXISTING = {
    OverrideID: 'over-1',
    ComponentID: 'comp-1',
    CurrentVersion: '1.0.0',
    Status: 'Pending' as const,
    ComponentName: 'TestForm',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FormBuilderDesignerAgent.validateSuccessNextStep', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('happy path', () => {
        it('passes Success through when Intent + Spec are well-formed', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                ExistingOverride: VALID_EXISTING,
            });
            expect(result.step).toBe('Success');
            expect(result.retryInstructions).toBeUndefined();
        });

        it("accepts Operation='create' without ExistingOverride", async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, Operation: 'create' },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Success');
        });

        it("accepts Operation='auto' without ExistingOverride", async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, Operation: 'auto' },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Success');
        });
    });

    describe('Intent envelope rules', () => {
        it('Retries when Intent is missing entirely', async () => {
            const result = await run({ Spec: VALID_SPEC });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('payload.Intent is missing');
        });

        it('Retries when Operation is missing', async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, Operation: undefined as never },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('Operation is missing');
        });

        it('Retries on unrecognized Operation', async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, Operation: 'delete' as never },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain("Operation='delete'");
        });

        it('Retries when EntityName is empty', async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, EntityName: '   ' },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('EntityName is missing');
        });

        it('Retries when UserPromptSummary is empty', async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, UserPromptSummary: '' },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('UserPromptSummary is missing');
        });

        it('Retries on unrecognized VersionBumpKind', async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, VersionBumpKind: 'rewrite' as never },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain("VersionBumpKind='rewrite'");
        });
    });

    describe('Spec structural rules', () => {
        it('Retries when Spec is missing', async () => {
            const result = await run({ Intent: VALID_INTENT });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('payload.Spec is missing');
        });

        it('Retries when Spec.name is missing', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: { ...VALID_SPEC, name: '' } as never,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('Spec.name is missing');
        });

        it('Retries when Spec.code is missing', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: { ...VALID_SPEC, code: '' } as never,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('Spec.code is missing');
        });

        it("Retries when Spec.componentRole !== 'form'", async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: { ...VALID_SPEC, componentRole: 'dashboard' as never },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain("componentRole must be exactly 'form'");
        });

        it('Retries when function declaration is missing from code', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: { ...VALID_SPEC, code: 'const TestForm = () => null;' },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('top-level function');
        });

        it('Retries when function name does not match Spec.name', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: { ...VALID_SPEC, code: 'function OtherName() { return null; }' },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('function OtherName');
            expect(result.retryInstructions).toContain('Spec.name is "TestForm"');
        });
    });

    describe('Lineage guard', () => {
        it('Retries when Spec.name differs from ExistingOverride.ComponentName', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: { ...VALID_SPEC, name: 'RenamedForm', code: 'function RenamedForm() { return null; }' },
                ExistingOverride: { ...VALID_EXISTING, ComponentName: 'TestForm' },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('Lineage mismatch');
        });

        it('Allows Spec.name match against ExistingOverride.ComponentName', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: VALID_SPEC,
                ExistingOverride: { ...VALID_EXISTING, ComponentName: 'TestForm' },
            });
            expect(result.step).toBe('Success');
        });
    });

    describe('Hallucinated API detection', () => {
        it("Retries on RunView({Filters: [...]})", async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: {
                    ...VALID_SPEC,
                    code: `function TestForm() { utilities.rv.RunView({ EntityName: 'X', Filters: [{ Field: 'Y' }] }); return null; }`,
                },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('Filters: [...]');
        });

        it("Retries on RunView({Filter: '...'}) without ExtraFilter", async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: {
                    ...VALID_SPEC,
                    code: `function TestForm() { utilities.rv.RunView({ EntityName: 'X', Filter: 'A=1' }); return null; }`,
                },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('Filter: ...');
        });

        it("Retries on utilities.React fabrication", async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: {
                    ...VALID_SPEC,
                    code: `function TestForm() { const React = utilities.React; return null; }`,
                },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('utilities.React');
        });

        it('Retries on top-level import statements', async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: {
                    ...VALID_SPEC,
                    code: `import { foo } from 'bar';\nfunction TestForm() { return null; }`,
                },
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain('Top-level `import`');
        });

        it("Does NOT flag RunView when ExtraFilter is properly used", async () => {
            const result = await run({
                Intent: VALID_INTENT,
                Spec: {
                    ...VALID_SPEC,
                    code: `function TestForm() { utilities.rv.RunView({ EntityName: 'X', ExtraFilter: 'A=1' }); return null; }`,
                },
                ExistingOverride: VALID_EXISTING,  // VALID_INTENT.Operation='modify' requires this
            });
            expect(result.step).toBe('Success');
        });
    });

    describe('Operation/ExistingOverride consistency', () => {
        it("Retries when Operation='modify' but ExistingOverride is missing", async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, Operation: 'modify' },
                Spec: VALID_SPEC,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain("Operation='modify' requires payload.ExistingOverride");
        });

        it("Retries when Operation='create' but ExistingOverride is set", async () => {
            const result = await run({
                Intent: { ...VALID_INTENT, Operation: 'create' },
                Spec: VALID_SPEC,
                ExistingOverride: VALID_EXISTING,
            });
            expect(result.step).toBe('Retry');
            expect(result.retryInstructions).toContain("Operation='create' but payload.ExistingOverride is set");
        });
    });

    describe('Retry message format', () => {
        it('Lists numbered errors with the no-actions reminder', async () => {
            const result = await run({ Intent: VALID_INTENT, Spec: undefined });
            expect(result.retryInstructions).toContain('1.');
            expect(result.retryInstructions).toContain('you do NOT call Create / Modify actions');
        });
    });
});
