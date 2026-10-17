import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type {
    CheckIssue,
    VideoFormat,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import { LoadDataSnapshotValues } from '../data/data-snapshot.js';
import { BuildCheckRequest, BuildRenderBundle } from '../render/bundle.js';
import { VideoRenderEngine } from '../render/video-render-engine.js';
import { VideoStudioAgentBase } from './video-studio-agent-base.js';

/**
 * Maximum number of lint check attempts per Motion Engineer completion turn (up to 3 checks and 2 fix prompts).
 */
export const MAX_LINT_ATTEMPTS = 3;

/**
 * Prompt name invoked by {@link VideoStudioMotionEngineerAgent} to repair lint errors per format.
 */
export const MOTION_ENGINEER_LINT_FIX_PROMPT_NAME = 'Video Studio - Motion Engineer Lint Fix';

/**
 * Structured output returned by the `Video Studio - Motion Engineer Lint Fix` prompt.
 */
export interface MotionEngineerLintFixOutput {
    Files?: Array<{ Path: string; Content: string }> | Record<string, string>;
    Notes?: string;
}

function cloneSpec<T>(value: T): T {
    if (value === undefined || value === null) {
        return {} as T;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Formats a {@link CheckIssue} as a single plain line for the Motion Engineer lint-fix prompt:
 * `[Category] Code: Message (File:Line, Beat)` (omitting absent location metadata).
 */
export function FormatLintIssue(issue: CheckIssue): string {
    const base = `[${issue.Category}] ${issue.Code}: ${issue.Message}`;
    const locationParts: string[] = [];
    if (issue.File) {
        locationParts.push(
            typeof issue.Line === 'number' ? `${issue.File}:${issue.Line}` : issue.File,
        );
    }
    if (issue.BeatKey) {
        locationParts.push(issue.BeatKey);
    }
    if (locationParts.length > 0) {
        return `${base} (${locationParts.join(', ')})`;
    }
    return base;
}

function resolveDeliverableFormats(spec: Partial<VideoGenerationSpec>): VideoFormat[] {
    if (
        Array.isArray(spec.Deliverables?.Formats) &&
        spec.Deliverables.Formats.length > 0
    ) {
        return [...spec.Deliverables.Formats];
    }
    if (Array.isArray(spec.Film?.Formats) && spec.Film.Formats.length > 0) {
        return [...spec.Film.Formats];
    }
    return ['16:9'];
}

function mergeLintFixFiles(
    existingFiles: Record<string, string>,
    fixOutput: MotionEngineerLintFixOutput | null | undefined,
): Record<string, string> {
    const merged: Record<string, string> = { ...existingFiles };
    if (!fixOutput || !fixOutput.Files) {
        return merged;
    }

    if (Array.isArray(fixOutput.Files)) {
        for (const entry of fixOutput.Files) {
            if (
                entry &&
                typeof entry.Path === 'string' &&
                entry.Path.trim().length > 0 &&
                typeof entry.Content === 'string'
            ) {
                merged[entry.Path.trim()] = entry.Content;
            }
        }
        return merged;
    }

    if (typeof fixOutput.Files === 'object') {
        for (const [filePath, content] of Object.entries(fixOutput.Files)) {
            if (filePath.trim().length > 0 && typeof content === 'string') {
                merged[filePath.trim()] = content;
            }
        }
    }

    return merged;
}

/**
 * Custom driver for the `Video Studio - Motion Engineer` stage (`DriverClass = 'VideoStudioMotionEngineerAgent'`).
 *
 * Intercepts `validateSuccessNextStep` to run a bounded lint-and-fix loop (up to {@link MAX_LINT_ATTEMPTS} = 3
 * validation checks and 2 targeted lint-fix prompt calls per failing deliverable format) before allowing
 * the stage to report `Success`.
 */
@RegisterClass(BaseAgent, 'VideoStudioMotionEngineerAgent')
export class VideoStudioMotionEngineerAgent extends VideoStudioAgentBase {
    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        const baseResult = await super.validateSuccessNextStep(
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep,
        );
        if (baseResult.step === 'Retry') {
            return baseResult;
        }

        const candidateSpec = (nextStep.newPayload ??
            baseResult.newPayload ??
            currentPayload ??
            params.payload ??
            {}) as Partial<VideoGenerationSpec>;
        const workingSpec = cloneSpec(candidateSpec);
        const formats = resolveDeliverableFormats(workingSpec);

        for (const fmt of formats) {
            const sourceEntry = workingSpec.Output?.Source?.[fmt];
            const hasFiles =
                Boolean(sourceEntry) &&
                typeof sourceEntry?.Files === 'object' &&
                sourceEntry.Files !== null &&
                Object.keys(sourceEntry.Files).length > 0;
            if (!hasFiles) {
                const msg = `Missing Output.Source entry for deliverable format "${fmt}". Populate Output.Source["${fmt}"].Files before completing the Motion Engineer stage.`;
                return {
                    ...baseResult,
                    step: 'Retry',
                    terminate: false,
                    retryInstructions: msg,
                    errorMessage: msg,
                };
            }
        }

        const contextUser = params.contextUser as UserInfo;
        const driver = VideoRenderEngine.Instance.Driver;

        let loadedValues: Record<string, unknown> | undefined = undefined;
        if (workingSpec.DataSnapshot) {
            try {
                loadedValues = await LoadDataSnapshotValues(workingSpec.DataSnapshot, {
                    ContextUser: contextUser,
                    Provider: this.ProviderToUse,
                });
            } catch {
                loadedValues = undefined;
            }
        }

        let lastIssuesByFormat: Partial<Record<VideoFormat, CheckIssue[]>> = {};
        let lastFailingFormats: VideoFormat[] = [];

        for (let attempt = 1; attempt <= MAX_LINT_ATTEMPTS; attempt++) {
            const checkStep = await this.createStepEntity({
                stepType: 'Validation',
                stepName: `Lint Check ${attempt}`,
                contextUser,
                inputData: {
                    Attempt: attempt,
                    Formats: formats,
                },
            });

            const issuesByFormat: Partial<Record<VideoFormat, CheckIssue[]>> = {};
            const failingFormats: VideoFormat[] = [];

            for (const fmt of formats) {
                const bundle = await BuildRenderBundle(
                    workingSpec as VideoGenerationSpec,
                    fmt,
                    {
                        ContextUser: contextUser,
                        Provider: this.ProviderToUse,
                        ...(loadedValues !== undefined ? { Values: loadedValues } : {}),
                    },
                );
                const checkRequest = BuildCheckRequest(
                    workingSpec as VideoGenerationSpec,
                    fmt,
                    bundle,
                    loadedValues ?? {},
                );
                const checkResult = await driver.Check(
                    checkRequest,
                    params.cancellationToken,
                );
                const fmtIssues = Array.isArray(checkResult?.Issues)
                    ? checkResult.Issues
                    : [];
                issuesByFormat[fmt] = fmtIssues;

                const hasError = fmtIssues.some((issue) => issue.Severity === 'Error');
                if (hasError || checkResult?.BlockRender) {
                    failingFormats.push(fmt);
                }
            }

            const allPassed = failingFormats.length === 0;
            const checkErrorSummary = allPassed
                ? undefined
                : `Lint Check ${attempt} failed for format(s): ${failingFormats.join(', ')}`;

            await this.finalizeStepEntity(
                checkStep,
                allPassed,
                checkErrorSummary,
                {
                    Attempt: attempt,
                    Passed: allPassed,
                    Issues: issuesByFormat,
                    IssuesByFormat: issuesByFormat,
                    ...issuesByFormat,
                },
            );

            if (allPassed) {
                return {
                    ...baseResult,
                    step: 'Success',
                    newPayload: workingSpec as unknown as P,
                };
            }

            lastIssuesByFormat = issuesByFormat;
            lastFailingFormats = failingFormats;

            if (attempt < MAX_LINT_ATTEMPTS) {
                for (const fmt of failingFormats) {
                    const fmtIssues = issuesByFormat[fmt] ?? [];
                    const errorIssues = fmtIssues.filter((i) => i.Severity === 'Error');
                    const issuesForPrompt =
                        errorIssues.length > 0 ? errorIssues : fmtIssues;
                    const issueLines = issuesForPrompt.map(FormatLintIssue).join('\n');
                    const currentSource = workingSpec.Output!.Source![fmt]!;

                    const fixOutcome = await this.RunStudioPrompt<MotionEngineerLintFixOutput>(
                        params,
                        MOTION_ENGINEER_LINT_FIX_PROMPT_NAME,
                        `Lint Fix ${attempt} (${fmt})`,
                        {
                            format: fmt,
                            issues: issueLines,
                            files: JSON.stringify(currentSource.Files, null, 2),
                        },
                    );

                    if (fixOutcome.Result) {
                        currentSource.Files = mergeLintFixFiles(
                            currentSource.Files,
                            fixOutcome.Result,
                        );
                    }
                }
            }
        }

        const failureSections: string[] = [];
        for (const fmt of lastFailingFormats) {
            const fmtIssues = lastIssuesByFormat[fmt] ?? [];
            const errorIssues = fmtIssues.filter((i) => i.Severity === 'Error');
            const issuesToList = (errorIssues.length > 0 ? errorIssues : fmtIssues)
                .slice(0, 10)
                .map((issue) => `- ${FormatLintIssue(issue)}`);
            failureSections.push(
                `Format ${fmt} (${issuesToList.length} issue(s)):\n${issuesToList.join('\n')}`,
            );
        }

        const message = `Motion Engineer lint checks failed after ${MAX_LINT_ATTEMPTS} attempts.\n${failureSections.join('\n\n')}`;
        return {
            ...baseResult,
            step: 'Failed',
            message,
            errorMessage: message,
        };
    }
}

/**
 * Tree-shaking guard to ensure `VideoStudioMotionEngineerAgent` is registered with `MJGlobal`.
 */
export function LoadVideoStudioMotionEngineerAgent(): void {
    if (false as boolean) {
        const _keep: unknown = VideoStudioMotionEngineerAgent;
    }
}
