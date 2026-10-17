import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks (following FormBuilder/core/src/__tests__/form-builder-designer-agent.test.ts) ───

interface RecordedCreatedStep {
    stepType: string;
    stepName: string;
    targetId?: string;
    inputData?: unknown;
    entity: { ID: string; TargetLogID: string | null };
}

interface RecordedFinalizedStep {
    stepEntity: { ID: string; TargetLogID: string | null };
    success: boolean;
    errorMessage?: string;
    outputData?: Record<string, unknown>;
}

vi.mock('@memberjunction/ai-agents', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-agents')>();
    return {
        ...actual,
        BaseAgent: class BaseAgent {
        public RecordedCreatedSteps: RecordedCreatedStep[] = [];
        public RecordedFinalizedSteps: RecordedFinalizedStep[] = [];
        protected ProviderToUse: unknown = undefined;

        protected async validateSuccessNextStep<P>(
            _params: unknown,
            nextStep: P,
            _currentPayload: unknown,
            _agentRun: unknown,
            _currentStep: unknown,
        ): Promise<P> {
            return nextStep;
        }

        protected async createStepEntity(opts: {
            stepType: string;
            stepName: string;
            contextUser?: unknown;
            targetId?: string;
            inputData?: unknown;
        }): Promise<{ ID: string; TargetLogID: string | null }> {
            const entity = {
                ID: `step-${this.RecordedCreatedSteps.length + 1}`,
                TargetLogID: null,
            };
            this.RecordedCreatedSteps.push({
                stepType: opts.stepType,
                stepName: opts.stepName,
                targetId: opts.targetId,
                inputData: opts.inputData,
                entity,
            });
            return entity;
        }

        protected async finalizeStepEntity(
            stepEntity: { ID: string; TargetLogID: string | null },
            success: boolean,
            errorMessage?: string,
            outputData?: Record<string, unknown>,
        ): Promise<void> {
            this.RecordedFinalizedSteps.push({
                stepEntity,
                success,
                errorMessage,
                outputData,
            });
        }
    },
    };
});

// ─── Imports after hoisted mocks ────────────────────────────────────────────

import type {
    AIPromptParams,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import type { UserInfo } from '@memberjunction/core';
import type {
    CheckIssue,
    CheckRequest,
    CheckResult,
    VideoFormat,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    FormatLintIssue,
    LoadVideoStudioMotionEngineerAgent,
    MAX_LINT_ATTEMPTS,
    MOTION_ENGINEER_LINT_FIX_PROMPT_NAME,
    type MotionEngineerLintFixOutput,
    VideoStudioMotionEngineerAgent,
} from '../agents/motion-engineer-agent.js';
import { FakeRenderDriver } from '../render/fake-render-driver.js';
import { VideoRenderEngine } from '../render/video-render-engine.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

const MOCK_USER = {
    ID: '00000000-0000-0000-0000-000000000001',
    Name: 'System',
} as unknown as UserInfo;

const LINT_FIX_PROMPT_ID = 'prompt-motion-engineer-lint-fix-0001';

interface TestableMotionEngineerAgent {
    RecordedCreatedSteps: RecordedCreatedStep[];
    RecordedFinalizedSteps: RecordedFinalizedStep[];
    CreatePromptRunner: () => AIPromptRunner;
    validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>>;
}

function makeSpec(formats: VideoFormat[] = ['16:9']): VideoGenerationSpec {
    const source: NonNullable<NonNullable<VideoGenerationSpec['Output']>['Source']> = {};
    for (const fmt of formats) {
        source[fmt] = {
            Format: fmt,
            EntryFile: 'index.html',
            AssetKeys: [],
            Files: {
                'index.html': `<!doctype html><html><body><div data-composition-id="main" data-width="1920" data-height="1080" data-fps="30" data-duration="5">${fmt}</div></body></html>`,
                'styles.css': '.frame { color: #ffffff; }',
            },
        };
    }

    return {
        Version: '1.0',
        Film: {
            Title: 'Test Film',
            DurationSec: 5,
            Fps: 30,
            Formats: formats,
        },
        Deliverables: {
            Formats: formats,
        },
        Storyboard: {
            Beats: [
                {
                    Key: 'intro',
                    Role: 'Hook',
                    DurationSec: 5,
                    StartSec: 0,
                    EndSec: 5,
                    Narration: 'Hello world',
                },
            ],
        },
        Output: {
            Source: source,
        },
    } as unknown as VideoGenerationSpec;
}

function makeIssue(overrides: Partial<CheckIssue> = {}): CheckIssue {
    return {
        Category: 'Layout',
        Severity: 'Error',
        Code: 'OVERFLOW_TEXT',
        Message: 'Headline overflows right edge by 24px',
        File: 'index.html',
        Line: 14,
        BeatKey: 'intro',
        ...overrides,
    };
}

function setPromptsInEngine(prompts: Array<{ ID: string; Name: string }>): void {
    vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
        Prompts: prompts as unknown as MJAIPromptEntityExtended[],
    } as unknown as AIEngine);
}

describe('VideoStudioMotionEngineerAgent (VS-AGT-4)', () => {
    let driver: FakeRenderDriver;

    beforeEach(() => {
        driver = new FakeRenderDriver();
        VideoRenderEngine.Instance.UseDriver(driver);
        setPromptsInEngine([
            {
                ID: LINT_FIX_PROMPT_ID,
                Name: MOTION_ENGINEER_LINT_FIX_PROMPT_NAME,
            },
        ]);
    });

    afterEach(() => {
        VideoRenderEngine.Instance.UseDriver(null);
        vi.restoreAllMocks();
    });

    it('exports MAX_LINT_ATTEMPTS = 3, FormatLintIssue, and LoadVideoStudioMotionEngineerAgent', () => {
        expect(MAX_LINT_ATTEMPTS).toBe(3);
        LoadVideoStudioMotionEngineerAgent();
        expect(
            FormatLintIssue({
                Category: 'Layout',
                Severity: 'Error',
                Code: 'CLIP_BOUNDS',
                Message: 'Clipped node',
                File: 'index.html',
                Line: 42,
                BeatKey: 'beat-1',
            }),
        ).toBe('[Layout] CLIP_BOUNDS: Clipped node (index.html:42, beat-1)');
        expect(
            FormatLintIssue({
                Category: 'Lint',
                Severity: 'Error',
                Code: 'PARSE_ERR',
                Message: 'Unclosed tag',
            }),
        ).toBe('[Lint] PARSE_ERR: Unclosed tag');
    });

    it('1. first draft fails lint on attempt 1 and passes on attempt 2: runs 1 fix prompt, merges fixed file, returns Success with Validation -> Prompt -> Validation steps', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        const issue = makeIssue();

        let checkCount = 0;
        const checkSpy = vi
            .spyOn(driver, 'Check')
            .mockImplementation(async (req: CheckRequest): Promise<CheckResult> => {
                checkCount += 1;
                if (checkCount === 1) {
                    return {
                        Passed: false,
                        BlockRender: true,
                        Issues: [issue],
                    };
                }
                // Verify the fixed file was staged into the second check bundle
                const indexHtml = req.Bundle.Files.find((f) => f.Path === 'index.html')?.Content;
                const stylesCss = req.Bundle.Files.find((f) => f.Path === 'styles.css')?.Content;
                const animationsJs = req.Bundle.Files.find((f) => f.Path === 'animations.js')?.Content;
                expect(indexHtml).toContain('FIXED_COMPOSITION');
                expect(stylesCss).toBe('.frame { color: #ffffff; }');
                expect(animationsJs).toBe('console.log("added");');
                return {
                    Passed: true,
                    BlockRender: false,
                    Issues: [],
                };
            });

        const capturedPromptParams: AIPromptParams[] = [];
        const executePromptMock = vi.fn(
            async (promptParams: AIPromptParams) => {
                capturedPromptParams.push(promptParams);
                const result: MotionEngineerLintFixOutput = {
                    Files: [
                        {
                            Path: 'index.html',
                            Content: '<!doctype html><html><body>FIXED_COMPOSITION</body></html>',
                        },
                        {
                            Path: 'animations.js',
                            Content: 'console.log("added");',
                        },
                    ],
                    Notes: 'Fixed overflow and added animations.js',
                };
                return {
                    success: true,
                    result,
                    promptRun: { ID: 'prompt-run-fix-1' },
                };
            },
        );
        vi.spyOn(agent, 'CreatePromptRunner').mockReturnValue({
            ExecutePrompt: executePromptMock,
        } as unknown as AIPromptRunner);

        const initialSpec = makeSpec(['16:9']);
        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Success');
        expect(checkSpy).toHaveBeenCalledTimes(2);
        expect(executePromptMock).toHaveBeenCalledTimes(1);

        // Prompt data assertions
        const promptData = capturedPromptParams[0].data as Record<string, unknown>;
        expect(promptData.format).toBe('16:9');
        expect(promptData.issues).toBe(
            '[Layout] OVERFLOW_TEXT: Headline overflows right edge by 24px (index.html:14, intro)',
        );
        expect(typeof promptData.files).toBe('string');
        expect(JSON.parse(promptData.files as string)).toEqual(
            initialSpec.Output!.Source!['16:9']!.Files,
        );

        // Merged files in Output.Source['16:9']
        const updatedFiles = outcome.newPayload?.Output?.Source?.['16:9']?.Files;
        expect(updatedFiles).toEqual({
            'index.html': '<!doctype html><html><body>FIXED_COMPOSITION</body></html>',
            'styles.css': '.frame { color: #ffffff; }',
            'animations.js': 'console.log("added");',
        });

        // Steps in exact order: Validation, Prompt, Validation
        expect(agent.RecordedCreatedSteps.map((s) => s.stepType)).toEqual([
            'Validation',
            'Prompt',
            'Validation',
        ]);
        expect(agent.RecordedCreatedSteps.map((s) => s.stepName)).toEqual([
            'Lint Check 1',
            'Lint Fix 1 (16:9)',
            'Lint Check 2',
        ]);
        expect(agent.RecordedCreatedSteps[1].targetId).toBe(LINT_FIX_PROMPT_ID);
        expect(agent.RecordedCreatedSteps[1].entity.TargetLogID).toBe('prompt-run-fix-1');
    });

    it('2. always failing: runs 3 checks and 2 fixes, then returns Failed with remaining issues in message', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        const issue = makeIssue({
            Code: 'PERSISTENT_ERR',
            Message: 'Still broken after fix',
        });

        const checkSpy = vi.spyOn(driver, 'Check').mockResolvedValue({
            Passed: false,
            BlockRender: true,
            Issues: [issue],
        });

        const executePromptMock = vi.fn().mockResolvedValue({
            success: true,
            result: {
                Files: [
                    {
                        Path: 'index.html',
                        Content: '<!doctype html><html><body>STILL_BROKEN</body></html>',
                    },
                ],
                Notes: 'Attempted repair',
            },
            promptRun: { ID: 'prompt-run-fix' },
        });
        vi.spyOn(agent, 'CreatePromptRunner').mockReturnValue({
            ExecutePrompt: executePromptMock,
        } as unknown as AIPromptRunner);

        const initialSpec = makeSpec(['16:9']);
        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(checkSpy).toHaveBeenCalledTimes(3);
        expect(executePromptMock).toHaveBeenCalledTimes(2);
        expect(outcome.step).toBe('Failed');
        expect(outcome.message).toContain('PERSISTENT_ERR');
        expect(outcome.message).toContain('Still broken after fix');
        expect(outcome.errorMessage).toContain('PERSISTENT_ERR');

        expect(agent.RecordedCreatedSteps.map((s) => s.stepType)).toEqual([
            'Validation',
            'Prompt',
            'Validation',
            'Prompt',
            'Validation',
        ]);
    });

    it('3. clean draft gives 1 check, no prompt, and Success', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        const checkSpy = vi.spyOn(driver, 'Check').mockResolvedValue({
            Passed: true,
            BlockRender: false,
            Issues: [],
        });
        const runnerSpy = vi.spyOn(agent, 'CreatePromptRunner');

        const initialSpec = makeSpec(['16:9']);
        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Success');
        expect(checkSpy).toHaveBeenCalledTimes(1);
        expect(runnerSpy).not.toHaveBeenCalled();
        expect(agent.RecordedCreatedSteps.map((s) => s.stepType)).toEqual(['Validation']);
    });

    it('4. only warnings give no prompt and Success', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        const warningIssue = makeIssue({
            Severity: 'Warning',
            Code: 'MINOR_CONTRAST',
            Message: 'Contrast ratio is 4.4:1 (recommended 4.5:1)',
        });
        const checkSpy = vi.spyOn(driver, 'Check').mockResolvedValue({
            Passed: true,
            BlockRender: false,
            Issues: [warningIssue],
        });
        const runnerSpy = vi.spyOn(agent, 'CreatePromptRunner');

        const initialSpec = makeSpec(['16:9']);
        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Success');
        expect(checkSpy).toHaveBeenCalledTimes(1);
        expect(runnerSpy).not.toHaveBeenCalled();
        expect(agent.RecordedCreatedSteps.map((s) => s.stepType)).toEqual(['Validation']);
        expect(agent.RecordedFinalizedSteps[0].success).toBe(true);
    });

    it('5. two formats with one failing: runs fix only for the failing format', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        const verticalError = makeIssue({
            Code: 'VERTICAL_OVERFLOW',
            Message: 'Caption clipped in 9:16',
        });

        let checkCalls = 0;
        vi.spyOn(driver, 'Check').mockImplementation(
            async (req: CheckRequest): Promise<CheckResult> => {
                checkCalls += 1;
                // On attempt 1 (calls 1 and 2), 16:9 passes and 9:16 (Height > Width) fails. On attempt 2 (calls 3 and 4), both pass.
                if (checkCalls <= 2 && req.Height > req.Width) {
                    return {
                        Passed: false,
                        BlockRender: true,
                        Issues: [verticalError],
                    };
                }
                return {
                    Passed: true,
                    BlockRender: false,
                    Issues: [],
                };
            },
        );

        const capturedPromptParams: AIPromptParams[] = [];
        const executePromptMock = vi.fn(async (promptParams: AIPromptParams) => {
            capturedPromptParams.push(promptParams);
            return {
                success: true,
                result: {
                    Files: [
                        {
                            Path: 'index.html',
                            Content: '<!doctype html><html><body>FIXED_9_16</body></html>',
                        },
                    ],
                },
                promptRun: { ID: 'prompt-run-9-16' },
            };
        });
        vi.spyOn(agent, 'CreatePromptRunner').mockReturnValue({
            ExecutePrompt: executePromptMock,
        } as unknown as AIPromptRunner);

        const initialSpec = makeSpec(['16:9', '9:16']);
        const originalHorizontalHtml = initialSpec.Output!.Source!['16:9']!.Files['index.html'];

        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Success');
        expect(executePromptMock).toHaveBeenCalledTimes(1);
        expect((capturedPromptParams[0].data as Record<string, unknown>).format).toBe('9:16');
        expect(outcome.newPayload?.Output?.Source?.['16:9']?.Files['index.html']).toBe(
            originalHorizontalHtml,
        );
        expect(outcome.newPayload?.Output?.Source?.['9:16']?.Files['index.html']).toBe(
            '<!doctype html><html><body>FIXED_9_16</body></html>',
        );
        expect(agent.RecordedCreatedSteps.map((s) => s.stepName)).toEqual([
            'Lint Check 1',
            'Lint Fix 1 (9:16)',
            'Lint Check 2',
        ]);
    });

    it('6. missing format source returns Retry with errorMessage and retryInstructions naming the format', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        const checkSpy = vi.spyOn(driver, 'Check');

        const spec = makeSpec(['16:9', '9:16']);
        delete spec.Output!.Source!['9:16'];

        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: spec,
                previousPayload: spec,
            },
            spec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Retry');
        expect(outcome.errorMessage).toBeDefined();
        expect(outcome.errorMessage).toContain('9:16');
        expect(outcome.retryInstructions).toContain('9:16');
        expect(checkSpy).not.toHaveBeenCalled();
    });

    it('7. scope: AIPromptParams handed to the runner carry configurationId, apiKeys, CredentialScope, provider, cancellationToken, and contextUser from agent params', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        let checkAttempt = 0;
        vi.spyOn(driver, 'Check').mockImplementation(async (): Promise<CheckResult> => {
            checkAttempt += 1;
            return checkAttempt === 1
                ? { Passed: false, BlockRender: true, Issues: [makeIssue()] }
                : { Passed: true, BlockRender: false, Issues: [] };
        });

        let receivedParams: AIPromptParams | undefined;
        const executePromptMock = vi.fn(async (promptParams: AIPromptParams) => {
            receivedParams = promptParams;
            return {
                success: true,
                result: {
                    Files: [{ Path: 'index.html', Content: '<html>fixed</html>' }],
                },
                promptRun: { ID: 'run-scope-check' },
            };
        });
        vi.spyOn(agent, 'CreatePromptRunner').mockReturnValue({
            ExecutePrompt: executePromptMock,
        } as unknown as AIPromptRunner);

        const abortController = new AbortController();
        const customProvider = { Name: 'ScopedMetadataProvider' };
        const customApiKeys = [{ driverClass: 'OpenAILLM', apiKey: 'sk-scoped-123' }];
        const credentialScope = { OrganizationID: 'org-42' };

        const agentParams = {
            contextUser: MOCK_USER,
            configurationId: 'config-uuid-999',
            apiKeys: customApiKeys,
            CredentialScope: credentialScope,
            provider: customProvider,
            cancellationToken: abortController.signal,
        } as unknown as ExecuteAgentParams;

        const initialSpec = makeSpec(['16:9']);
        const outcome = await agent.validateSuccessNextStep(
            agentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Success');
        expect(receivedParams).toBeDefined();
        expect(receivedParams!.configurationId).toBe('config-uuid-999');
        expect(receivedParams!.apiKeys).toBe(customApiKeys);
        expect(receivedParams!.CredentialScope).toBe(credentialScope);
        expect(receivedParams!.provider).toBe(customProvider);
        expect(receivedParams!.cancellationToken).toBe(abortController.signal);
        expect(receivedParams!.contextUser).toBe(MOCK_USER);
        expect(receivedParams!.attemptJSONRepair).toBe(true);
    });

    it('8a. missing prompt in AIEngine.Instance.Prompts keeps old files, does not throw, and ends Failed after 3rd check', async () => {
        setPromptsInEngine([]); // Prompt missing!
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;

        const seenHtmlPerCheck: string[] = [];
        vi.spyOn(driver, 'Check').mockImplementation(
            async (req: CheckRequest): Promise<CheckResult> => {
                const html = req.Bundle.Files.find((f) => f.Path === 'index.html')?.Content ?? '';
                seenHtmlPerCheck.push(html);
                return {
                    Passed: false,
                    BlockRender: true,
                    Issues: [makeIssue()],
                };
            },
        );

        const initialSpec = makeSpec(['16:9']);

        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Failed');
        expect(seenHtmlPerCheck).toHaveLength(3);
        expect(seenHtmlPerCheck[0]).toContain('16:9');
        expect(seenHtmlPerCheck[1]).toBe(seenHtmlPerCheck[0]);
        expect(seenHtmlPerCheck[2]).toBe(seenHtmlPerCheck[0]);
    });

    it('8b. failed or throwing prompt runner keeps old files, does not throw, and ends Failed after 3rd check', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;

        const seenHtmlPerCheck: string[] = [];
        vi.spyOn(driver, 'Check').mockImplementation(
            async (req: CheckRequest): Promise<CheckResult> => {
                const html = req.Bundle.Files.find((f) => f.Path === 'index.html')?.Content ?? '';
                seenHtmlPerCheck.push(html);
                return {
                    Passed: false,
                    BlockRender: true,
                    Issues: [makeIssue()],
                };
            },
        );

        let runnerCall = 0;
        const executePromptMock = vi.fn(async () => {
            runnerCall += 1;
            if (runnerCall === 1) {
                return {
                    success: false,
                    errorMessage: 'Model timeout',
                    promptRun: { ID: 'failed-prompt-run-1' },
                };
            }
            throw new Error('Unexpected network disconnect');
        });
        vi.spyOn(agent, 'CreatePromptRunner').mockReturnValue({
            ExecutePrompt: executePromptMock,
        } as unknown as AIPromptRunner);

        const initialSpec = makeSpec(['16:9']);

        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Success',
                terminate: true,
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Failed');
        expect(executePromptMock).toHaveBeenCalledTimes(2);
        expect(seenHtmlPerCheck).toHaveLength(3);
        expect(seenHtmlPerCheck[0]).toContain('16:9');
        expect(seenHtmlPerCheck[1]).toBe(seenHtmlPerCheck[0]);
        expect(seenHtmlPerCheck[2]).toBe(seenHtmlPerCheck[0]);
        // Prompt steps were finalized with success = false
        const promptFinalizations = agent.RecordedFinalizedSteps.filter(
            (f) => f.outputData?.promptName === MOTION_ENGINEER_LINT_FIX_PROMPT_NAME,
        );
        expect(promptFinalizations).toHaveLength(2);
        expect(promptFinalizations.every((f) => f.success === false)).toBe(true);
    });

    it('returns Retry unchanged when super.validateSuccessNextStep returns Retry', async () => {
        const agent = new VideoStudioMotionEngineerAgent() as unknown as TestableMotionEngineerAgent;
        const checkSpy = vi.spyOn(driver, 'Check');
        const initialSpec = makeSpec(['16:9']);

        const outcome = await agent.validateSuccessNextStep(
            { contextUser: MOCK_USER } as ExecuteAgentParams,
            {
                step: 'Retry',
                terminate: false,
                retryInstructions: 'Base class schema validation failed',
                errorMessage: 'Base class schema validation failed',
                newPayload: initialSpec,
                previousPayload: initialSpec,
            },
            initialSpec,
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended,
        );

        expect(outcome.step).toBe('Retry');
        expect(outcome.retryInstructions).toBe('Base class schema validation failed');
        expect(checkSpy).not.toHaveBeenCalled();
        expect(agent.RecordedCreatedSteps).toHaveLength(0);
    });
});
