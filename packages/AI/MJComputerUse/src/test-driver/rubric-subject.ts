import type { ComputerUseExpectedOutcomes, ComputerUseTestInput } from './types.js';

/** One frame a rubric judge may look at. `data` is base64 with no data-URL prefix. */
export interface RubricSubjectImage {
    label: string;
    mimeType: string;
    data: string;
}

/** What a rubric judge reads about a computer use run: a step transcript, the run facts, and chosen frames. */
export interface RubricSubject {
    text: string;
    data: Record<string, unknown>;
    images?: RubricSubjectImage[];
}

/** The judge prompt shipped for computer use runs. */
export const COMPUTER_USE_RUBRIC_JUDGE = 'Rubric Judge - Computer Use';

const MAX_TRANSCRIPT_STEPS = 40;
const MAX_TEXT_LENGTH = 20_000;

interface StepSummary {
    stepNumber?: number;
    url?: string;
    reasoning?: string;
    actionsCount?: number;
    hadError?: boolean;
    judgeVerdict?: { Done?: boolean; Confidence?: number };
}

/** Builds the subject from the driver's actual output. The screenshot, element list and raw step history stay out. */
export function BuildRubricSubject(
    input: ComputerUseTestInput,
    expected: ComputerUseExpectedOutcomes,
    actualOutput: Record<string, unknown>,
    images?: RubricSubjectImage[]
): RubricSubject {
    const steps = Array.isArray(actualOutput.stepHistory) ? actualOutput.stepHistory as StepSummary[] : [];
    const lines = [
        `Goal: ${input.goal}`,
        `Start URL: ${input.startUrl ?? '(none)'}`,
        `Status: ${String(actualOutput.status ?? 'unknown')} (success: ${String(actualOutput.success ?? false)})`,
        `Final URL: ${String(actualOutput.finalUrl ?? '')}`,
        `Steps: ${steps.length}`,
        '',
        ...transcriptLines(steps),
    ];
    const verdict = actualOutput.finalJudgeVerdict as { Done?: boolean; Reason?: string } | undefined;
    if (verdict) lines.push('', `Judge: done=${String(verdict.Done)}. ${verdict.Reason ?? ''}`.trim());
    if (images && images.length > 0) lines.push('', `Frames attached: ${images.map(image => image.label).join(', ')}`);
    const data: Record<string, unknown> = {
        goal: input.goal,
        startUrl: input.startUrl,
        expectedOutcomes: withoutUndefined({
            judgeValidationCriteria: expected.judgeValidationCriteria,
            finalUrlPattern: expected.finalUrlPattern,
            maxSteps: expected.maxSteps,
        }),
        status: actualOutput.status,
        success: actualOutput.success,
        finalUrl: actualOutput.finalUrl,
        totalSteps: actualOutput.totalSteps,
        totalDurationMs: actualOutput.totalDurationMs,
        authDetourCount: actualOutput.authDetourCount,
        failureReason: actualOutput.failureReason,
        failureMemo: actualOutput.failureMemo,
        criteriaVerdicts: actualOutput.criteriaVerdicts,
        finalJudgeVerdict: actualOutput.finalJudgeVerdict,
        finalJudgePromptRunId: actualOutput.finalJudgePromptRunId,
        error: actualOutput.error,
    };
    const diagnostics = actualOutput.browserDiagnostics;
    if (Array.isArray(diagnostics) && diagnostics.length > 0) data.browserDiagnostics = diagnostics.slice(0, 20);
    const subject: RubricSubject = { text: fitText(lines.join('\n'), MAX_TEXT_LENGTH), data: withoutUndefined(data) };
    if (images && images.length > 0) subject.images = images;
    return subject;
}

/** Sets `evaluator` on each rubric oracle that has none. */
export function WithDefaultRubricEvaluator<T extends { oracles?: { type: string; config?: Record<string, unknown> }[] }>(config: T, evaluator: Record<string, unknown>): T {
    const oracles = (config.oracles ?? []).map(oracle =>
        oracle.type === 'rubric' && oracle.config?.evaluator === undefined
            ? { ...oracle, config: { ...oracle.config, evaluator } }
            : oracle);
    return { ...config, oracles };
}

/** Path and query of a URL. A string that is not a URL is returned as is. */
export function CompactUrl(url: string | undefined): string {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return url;
    }
}

function transcriptLines(steps: StepSummary[]): string[] {
    const line = (step: StepSummary): string => {
        const verdict = step.judgeVerdict ? ` [judge: done=${String(step.judgeVerdict.Done)}]` : '';
        const error = step.hadError ? ' [ERROR]' : '';
        return `Step ${step.stepNumber ?? '?'} [${CompactUrl(step.url)}]: ${step.reasoning || 'No reasoning'} -> ${step.actionsCount ?? 0} action(s)${error}${verdict}`;
    };
    if (steps.length <= MAX_TRANSCRIPT_STEPS) return steps.map(line);
    const half = MAX_TRANSCRIPT_STEPS / 2;
    return [
        ...steps.slice(0, half).map(line),
        `... ${steps.length - MAX_TRANSCRIPT_STEPS} step(s) omitted ...`,
        ...steps.slice(-half).map(line),
    ];
}

function fitText(text: string, room: number): string {
    if (text.length <= room) return text;
    const note = '\n[transcript cut to the prompt budget]';
    return text.slice(0, room - note.length) + note;
}

function withoutUndefined(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
