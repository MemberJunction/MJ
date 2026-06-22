import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const {
    mockRunAction, mockActionsConfig, mockExecutePrompt, mockAIEngineConfig,
    mockRunView, mockEntityByName, mockPromptsArray, mockActionsArray,
    runStepSaves,
} = vi.hoisted(() => ({
    mockRunAction: vi.fn(),
    mockActionsConfig: vi.fn().mockResolvedValue(undefined),
    mockExecutePrompt: vi.fn(),
    mockAIEngineConfig: vi.fn().mockResolvedValue(undefined),
    mockRunView: vi.fn(),
    mockEntityByName: vi.fn(),
    mockPromptsArray: [] as Array<{ ID: string; Name: string }>,
    mockActionsArray: [] as Array<{ ID: string; Name: string }>,
    runStepSaves: [] as Array<{ StepNumber: number; StepType: string; StepName: string; Status: string; ErrorMessage?: string }>,
}));

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class BaseAgent {},
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RegisterClass: () => (_target: unknown) => _target,
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        Metadata: class Metadata {
            async GetEntityObject(): Promise<unknown> {
                // Each call returns a fresh "MJ: AI Agent Run Steps" stub
                // that records its state into runStepSaves[] on Save().
                const obj = {
                    AgentRunID: '', StepNumber: 0, StepType: '', StepName: '', Status: '',
                    StartedAt: new Date(), CompletedAt: undefined, Success: undefined,
                    InputData: undefined, OutputData: undefined, TargetID: undefined,
                    TargetLogID: undefined, ErrorMessage: undefined,
                    Save: vi.fn().mockImplementation(async function (this: { StepNumber: number; StepType: string; StepName: string; Status: string; ErrorMessage?: string }) {
                        runStepSaves.push({
                            StepNumber: this.StepNumber, StepType: this.StepType,
                            StepName: this.StepName, Status: this.Status, ErrorMessage: this.ErrorMessage,
                        });
                        return true;
                    }),
                };
                return obj as never;
            }
            EntityByName(name: string): { ID: string; Name: string } | undefined { return mockEntityByName(name); }
            static Provider: unknown = {};
        },
        RunView: {
            FromMetadataProvider: () => ({ RunView: mockRunView }),
        },
        LogStatus: vi.fn(),
        LogError: vi.fn(),
    };
});

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        Instance: {
            Config: mockActionsConfig,
            get Actions() { return mockActionsArray; },
            RunAction: mockRunAction,
        },
    },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class { ExecutePrompt = mockExecutePrompt; },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: mockAIEngineConfig,
            get Prompts() { return mockPromptsArray; },
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => {
    const orig = await importOriginal<Record<string, unknown>>();
    return {
        ...orig,
        AIPromptParams: class {
            prompt: unknown;
            data: unknown;
            contextUser: unknown;
            attemptJSONRepair: boolean = false;
        },
    };
});

// ─── Import after mocks ─────────────────────────────────────────────────────

import { FormBuilderBuilderAgent } from '../agents/form-builder-builder-agent.js';
import type { FormBuilderPayload } from '../interfaces.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

type TestableBuilder = {
    executeAgentInternal<P>(params: ExecuteAgentParams, config: AgentConfiguration): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
};

function makeBuilder(): TestableBuilder {
    return new FormBuilderBuilderAgent() as unknown as TestableBuilder;
}

function makeParams(payload: FormBuilderPayload): ExecuteAgentParams {
    // The provider needs both EntityByName (used for action-target resolution)
    // and GetEntityObject (used by createRunStep to write observability rows).
    // GetEntityObject returns the same stub the Metadata-class mock returns —
    // recording StepNumber/StepType/StepName/Status into runStepSaves on Save().
    const provider = {
        EntityByName: (name: string) => mockEntityByName(name),
        async GetEntityObject(): Promise<unknown> {
            const obj = {
                AgentRunID: '', StepNumber: 0, StepType: '', StepName: '', Status: '',
                StartedAt: new Date(), CompletedAt: undefined, Success: undefined,
                InputData: undefined, OutputData: undefined, TargetID: undefined,
                TargetLogID: undefined, ErrorMessage: undefined,
                Save: vi.fn().mockImplementation(async function (this: { StepNumber: number; StepType: string; StepName: string; Status: string; ErrorMessage?: string }) {
                    runStepSaves.push({
                        StepNumber: this.StepNumber, StepType: this.StepType,
                        StepName: this.StepName, Status: this.Status, ErrorMessage: this.ErrorMessage,
                    });
                    return true;
                }),
            };
            return obj;
        },
    };
    return {
        payload,
        contextUser: { ID: 'user-1' },
        agent: { ID: 'agent-1' },
        parentRun: { ID: 'run-1' },
        provider,
    } as unknown as ExecuteAgentParams;
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

const VALID_PENDING_EXISTING = {
    OverrideID: 'over-1',
    ComponentID: 'comp-1',
    CurrentVersion: '1.0.0',
    Status: 'Pending' as const,
    ComponentName: 'TestForm',
};

function seedActions(): void {
    mockActionsArray.length = 0;
    mockActionsArray.push(
        { ID: 'create-action-id', Name: 'Create Interactive Form' },
        { ID: 'modify-action-id', Name: 'Modify Interactive Form' },
    );
}

function seedPrompts(): void {
    mockPromptsArray.length = 0;
    mockPromptsArray.push({ ID: 'lint-fix-prompt-id', Name: 'Form Builder - Lint Fix' });
}

beforeEach(() => {
    vi.clearAllMocks();
    runStepSaves.length = 0;
    seedActions();
    seedPrompts();
    // Default RunView: no existing overrides (for create path).
    mockRunView.mockResolvedValue({ Success: true, Results: [] });
    // Default EntityByName: returns an entity with a known ID.
    mockEntityByName.mockReturnValue({ ID: 'entity-id-1', Name: 'MJ: Applications' });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FormBuilderBuilderAgent.executeAgentInternal', () => {
    describe('preconditions', () => {
        it('fails fast when Intent is missing', async () => {
            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Spec: VALID_SPEC }), {} as AgentConfiguration);
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.errorMessage).toContain('payload.Intent is missing');
            const newPayload = result.finalStep.newPayload as FormBuilderPayload;
            expect(newPayload.BuilderResult?.Success).toBe(false);
        });

        it('fails fast when Spec is missing', async () => {
            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT }), {} as AgentConfiguration);
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.errorMessage).toContain('payload.Spec is missing');
        });

        it('fails fast when Intent.EntityName is empty', async () => {
            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: { ...VALID_INTENT, EntityName: '' }, Spec: VALID_SPEC }),
                {} as AgentConfiguration);
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.errorMessage).toContain('EntityName');
        });
    });

    describe('create path (no existing override)', () => {
        it('calls Create Interactive Form and returns Success on SUCCESS', async () => {
            mockRunAction.mockResolvedValue({
                Success: true,
                Message: JSON.stringify({
                    ComponentID: 'new-comp', OverrideID: 'new-over',
                    Version: '1.0.0', Status: 'Pending',
                }),
                ResultCode: 'SUCCESS',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Success');
            expect(mockRunAction).toHaveBeenCalledTimes(1);
            const callArg = mockRunAction.mock.calls[0]![0]!;
            expect(callArg.Action.Name).toBe('Create Interactive Form');

            const newPayload = result.finalStep.newPayload as FormBuilderPayload;
            expect(newPayload.BuilderResult?.Success).toBe(true);
            expect(newPayload.BuilderResult?.ComponentID).toBe('new-comp');
            expect(newPayload.BuilderResult?.OverrideID).toBe('new-over');
            expect(newPayload.BuilderResult?.Version).toBe('1.0.0');
            expect(newPayload.BuilderResult?.LintAttempts).toBe(1);
        });

        it('pins componentRole=form + location=embedded on the spec', async () => {
            mockRunAction.mockResolvedValue({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            // Spec missing componentRole + location — Builder should pin them.
            const sloppySpec = { name: 'TestForm', code: 'function TestForm() {}' };
            await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: sloppySpec as never }), {} as AgentConfiguration);

            const specPassed = mockRunAction.mock.calls[0]![0]!.Params.find(
                (p: { Name: string }) => p.Name === 'Spec')!.Value as Record<string, unknown>;
            expect(specPassed.componentRole).toBe('form');
            expect(specPassed.location).toBe('embedded');
        });

        it("Intent.Operation='auto' routes to Create when no override exists", async () => {
            mockRunAction.mockResolvedValue({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            await makeBuilder().executeAgentInternal(
                makeParams({ Intent: { ...VALID_INTENT, Operation: 'auto' }, Spec: VALID_SPEC }),
                {} as AgentConfiguration);

            expect(mockRunAction.mock.calls[0]![0]!.Action.Name).toBe('Create Interactive Form');
        });
    });

    describe('modify path (existing override)', () => {
        it("Intent.Operation='modify' calls Modify with the supplied OverrideID", async () => {
            mockRunAction.mockResolvedValue({
                Success: true,
                Message: '{"ComponentID":"comp-1","OverrideID":"over-1","Version":"1.0.0","Mode":"in-place"}',
                ResultCode: 'SUCCESS',
            });

            await makeBuilder().executeAgentInternal(
                makeParams({
                    Intent: { ...VALID_INTENT, Operation: 'modify' },
                    Spec: VALID_SPEC,
                    ExistingOverride: VALID_PENDING_EXISTING,
                }),
                {} as AgentConfiguration);

            const callArg = mockRunAction.mock.calls[0]![0]!;
            expect(callArg.Action.Name).toBe('Modify Interactive Form');
            const overrideIDParam = callArg.Params.find((p: { Name: string }) => p.Name === 'OverrideID');
            expect(overrideIDParam.Value).toBe('over-1');
        });

        it('pins Spec.name to ExistingOverride.ComponentName (lineage guard)', async () => {
            mockRunAction.mockResolvedValue({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.1","Mode":"in-place"}',
                ResultCode: 'SUCCESS',
            });

            // Agent submits a spec with a different name — Builder must rewrite it.
            const renamedSpec = { ...VALID_SPEC, name: 'RenamedForm', code: 'function RenamedForm() {}' };
            await makeBuilder().executeAgentInternal(
                makeParams({
                    Intent: { ...VALID_INTENT, Operation: 'modify' },
                    Spec: renamedSpec,
                    ExistingOverride: VALID_PENDING_EXISTING,
                }),
                {} as AgentConfiguration);

            const specPassed = mockRunAction.mock.calls[0]![0]!.Params.find(
                (p: { Name: string }) => p.Name === 'Spec')!.Value as Record<string, unknown>;
            expect(specPassed.name).toBe('TestForm');
        });

        it("Operation='auto' + Pending source defaults VersionBumpKind to 'in-place'", async () => {
            mockRunAction.mockResolvedValue({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0","Mode":"in-place"}',
                ResultCode: 'SUCCESS',
            });
            mockRunView.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'discovered-over', ComponentID: 'discovered-comp', Status: 'Pending' }],
            }).mockResolvedValueOnce({
                Success: true,
                Results: [{ Name: 'TestForm', Version: '1.0.0' }],
            });

            await makeBuilder().executeAgentInternal(
                makeParams({
                    Intent: { ...VALID_INTENT, Operation: 'auto' },
                    Spec: VALID_SPEC,
                }),
                {} as AgentConfiguration);

            const bumpKindParam = mockRunAction.mock.calls[0]![0]!.Params.find(
                (p: { Name: string }) => p.Name === 'VersionBumpKind');
            expect(bumpKindParam.Value).toBe('in-place');
        });

        it("Operation='auto' + Active source defaults VersionBumpKind to 'minor'", async () => {
            mockRunAction.mockResolvedValue({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.1.0","Mode":"new-version","BumpKind":"minor"}',
                ResultCode: 'SUCCESS',
            });
            mockRunView.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'discovered-over', ComponentID: 'discovered-comp', Status: 'Active' }],
            }).mockResolvedValueOnce({
                Success: true,
                Results: [{ Name: 'TestForm', Version: '1.0.0' }],
            });

            await makeBuilder().executeAgentInternal(
                makeParams({
                    Intent: { ...VALID_INTENT, Operation: 'auto' },
                    Spec: VALID_SPEC,
                }),
                {} as AgentConfiguration);

            const bumpKindParam = mockRunAction.mock.calls[0]![0]!.Params.find(
                (p: { Name: string }) => p.Name === 'VersionBumpKind');
            expect(bumpKindParam.Value).toBe('minor');
        });

        it('honors explicit VersionBumpKind over the auto-derived default', async () => {
            mockRunAction.mockResolvedValue({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"2.0.0","Mode":"new-version","BumpKind":"major"}',
                ResultCode: 'SUCCESS',
            });

            await makeBuilder().executeAgentInternal(
                makeParams({
                    Intent: { ...VALID_INTENT, Operation: 'modify', VersionBumpKind: 'major' },
                    Spec: VALID_SPEC,
                    ExistingOverride: VALID_PENDING_EXISTING,
                }),
                {} as AgentConfiguration);

            const bumpKindParam = mockRunAction.mock.calls[0]![0]!.Params.find(
                (p: { Name: string }) => p.Name === 'VersionBumpKind');
            expect(bumpKindParam.Value).toBe('major');
        });
    });

    describe('lint-fix retry loop', () => {
        it('runs the lint-fix prompt and retries on LINT_FAILED, succeeds on attempt 2', async () => {
            // Attempt 1: fails LINT
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: '[critical] some lint error', ResultCode: 'LINT_FAILED',
            });
            // Lint-fix prompt returns a corrected spec
            mockExecutePrompt.mockResolvedValueOnce({
                success: true,
                result: { spec: { ...VALID_SPEC, code: 'function TestForm() { /* fixed */ return null; }' }, notes: 'fixed one line' },
                promptRun: { ID: 'prompt-run-1' },
            });
            // Attempt 2: succeeds
            mockRunAction.mockResolvedValueOnce({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Success');
            expect(mockRunAction).toHaveBeenCalledTimes(2);
            expect(mockExecutePrompt).toHaveBeenCalledTimes(1);
            const newPayload = result.finalStep.newPayload as FormBuilderPayload;
            expect(newPayload.BuilderResult?.LintAttempts).toBe(2);
            expect(newPayload.BuilderResult?.LintHistory?.length).toBe(1);
            expect(newPayload.BuilderResult?.LintHistory?.[0].ResultCode).toBe('LINT_FAILED');
        });

        it('recovers when the lint-fix prompt returns a ```json-fenced STRING (OutputType=string)', async () => {
            // Regression: the 'Form Builder - Lint Fix' prompt has OutputType
            // 'string', so the runner hands back the raw (fenced) text instead of
            // a parsed object. The Builder must parse it rather than discard a
            // perfectly good fix and abort the retry loop.
            mockRunAction.mockResolvedValueOnce({
                Success: false,
                Message: "[critical] runview-call-validation: Invalid property 'ResultColumns' on RunView",
                ResultCode: 'LINT_FAILED',
            });
            const fixedSpec = { ...VALID_SPEC, code: 'function TestForm() { /* uses Fields now */ return null; }' };
            mockExecutePrompt.mockResolvedValueOnce({
                success: true,
                // Note: a STRING, wrapped in a markdown fence — exactly what was observed.
                result: '```json\n' + JSON.stringify({ spec: fixedSpec, notes: 'replaced ResultColumns with Fields' }) + '\n```',
                promptRun: { ID: 'prompt-run-str' },
            });
            mockRunAction.mockResolvedValueOnce({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Success');
            expect(mockRunAction).toHaveBeenCalledTimes(2);   // retried with the parsed fix
            expect(mockExecutePrompt).toHaveBeenCalledTimes(1);
            expect((result.finalStep.newPayload as FormBuilderPayload).BuilderResult?.LintAttempts).toBe(2);
        });

        it('falls back to rawResult when result is empty but rawResult holds the fenced JSON', async () => {
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: 'lint', ResultCode: 'LINT_FAILED',
            });
            mockExecutePrompt.mockResolvedValueOnce({
                success: true,
                result: undefined,
                rawResult: '```json\n' + JSON.stringify({ spec: VALID_SPEC }) + '\n```',
            });
            mockRunAction.mockResolvedValueOnce({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Success');
            expect(mockRunAction).toHaveBeenCalledTimes(2);
        });

        it('still aborts when the lint-fix prompt returns an unparseable string', async () => {
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: 'lint', ResultCode: 'LINT_FAILED',
            });
            mockExecutePrompt.mockResolvedValueOnce({
                success: true, result: 'I could not fix this, sorry.',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            expect(mockRunAction).toHaveBeenCalledTimes(1);   // no valid fix → no retry
        });

        it('retries on LINEAGE_NAME_MISMATCH', async () => {
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: 'spec.name mismatch', ResultCode: 'LINEAGE_NAME_MISMATCH',
            });
            mockExecutePrompt.mockResolvedValueOnce({
                success: true, result: { spec: VALID_SPEC, notes: 'renamed' },
            });
            mockRunAction.mockResolvedValueOnce({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Success');
            expect(result.finalStep.newPayload as FormBuilderPayload).toBeDefined();
        });

        it('does NOT retry on non-retryable codes', async () => {
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: 'something else',
                ResultCode: 'NON_RETRYABLE_ERROR',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            expect(mockRunAction).toHaveBeenCalledTimes(1);
            expect(mockExecutePrompt).not.toHaveBeenCalled();
        });

        it('gives up after MAX_LINT_ATTEMPTS (3)', async () => {
            // All 3 attempts fail with LINT_FAILED.
            mockRunAction.mockResolvedValue({
                Success: false, Message: 'lint failure', ResultCode: 'LINT_FAILED',
            });
            // Lint-fix prompt always returns a (still-broken) spec.
            mockExecutePrompt.mockResolvedValue({
                success: true, result: { spec: VALID_SPEC, notes: 'tried' },
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            expect(mockRunAction).toHaveBeenCalledTimes(3);
            // Lint-fix runs AFTER attempts 1 and 2 (not after attempt 3 since no
            // budget remains).
            expect(mockExecutePrompt).toHaveBeenCalledTimes(2);
            const newPayload = result.finalStep.newPayload as FormBuilderPayload;
            expect(newPayload.BuilderResult?.LintAttempts).toBe(3);
            expect(newPayload.BuilderResult?.LintHistory?.length).toBe(3);
        });

        it('aborts the retry loop when the lint-fix prompt itself fails', async () => {
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: 'lint failure', ResultCode: 'LINT_FAILED',
            });
            // Lint-fix prompt fails to produce a spec.
            mockExecutePrompt.mockResolvedValueOnce({ success: false, errorMessage: 'model error' });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            // Only one action attempt — we never re-tried after the prompt failed.
            expect(mockRunAction).toHaveBeenCalledTimes(1);
            expect(mockExecutePrompt).toHaveBeenCalledTimes(1);
        });
    });

    describe('observability', () => {
        it("creates an 'Actions' run-step per persistence attempt", async () => {
            mockRunAction.mockResolvedValue({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            const actionSteps = runStepSaves.filter(s => s.StepType === 'Actions');
            expect(actionSteps.length).toBeGreaterThanOrEqual(1);
            expect(actionSteps[0].StepName).toContain('Execute Action');
        });

        it("creates a 'Prompt' run-step per lint-fix attempt", async () => {
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: 'lint', ResultCode: 'LINT_FAILED',
            });
            mockExecutePrompt.mockResolvedValueOnce({
                success: true, result: { spec: VALID_SPEC },
            });
            mockRunAction.mockResolvedValueOnce({
                Success: true, Message: '{"ComponentID":"c","OverrideID":"o","Version":"1.0.0"}',
                ResultCode: 'SUCCESS',
            });

            await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            const promptSteps = runStepSaves.filter(s => s.StepType === 'Prompt');
            expect(promptSteps.length).toBe(2);  // one "Running" then "Completed" for the same step
            expect(promptSteps.some(s => s.StepName.includes('Lint Fix Attempt 1'))).toBe(true);
        });
    });

    describe('action-not-found edge case', () => {
        it('fails gracefully when the persistence action is missing from the registry', async () => {
            mockActionsArray.length = 0;  // remove all actions

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.errorMessage).toContain("'Create Interactive Form' not registered");
        });
    });

    describe('lint-fix prompt not found', () => {
        it('does not retry when the lint-fix prompt itself is unavailable', async () => {
            mockPromptsArray.length = 0;  // remove the lint-fix prompt
            mockRunAction.mockResolvedValueOnce({
                Success: false, Message: 'lint', ResultCode: 'LINT_FAILED',
            });

            const result = await makeBuilder().executeAgentInternal(
                makeParams({ Intent: VALID_INTENT, Spec: VALID_SPEC }), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            expect(mockRunAction).toHaveBeenCalledTimes(1);
            // No retry attempted because runLintFixPrompt returned null.
        });
    });
});
