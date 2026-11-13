/**
 * @fileoverview Reads labelled calibration points for {@link FitDecisionCalibrations}: from a JSONL
 * file of points, or from decision prompt runs joined to a JSONL file of labels.
 *
 * `AIDecisionRunner` writes one `MJ: AI Prompt Runs` row per decision: `Result` holds every answer
 * by question key (`DecisionAnswer` JSON), `ModelSpecificResponseDetails` holds
 * `{ "ResolvedModel": … }`, and the view's `Model` is the MJ decision model that answered. A label
 * names a run and a question, and says whether the answer's prediction held, so production runs can
 * be labelled after the fact and fitted without re-running anything.
 *
 * Pure: no I/O. The rig reads the files and the runs.
 *
 * @module @memberjunction/testing-engine
 */

import { z } from 'zod';
import { NormalizeUUID, UUIDMap } from '@memberjunction/global';
import type { CalibrationPoint } from './calibration-fit';

/** One line of a points file: a {@link CalibrationPoint} as JSON. */
export const CalibrationPointLineSchema = z.object({
    Use: z.string().min(1),
    Question: z.string().min(1),
    ModelName: z.string().min(1),
    ResolvedModel: z.string().min(1),
    RawProbability: z.number().min(0).max(1),
    Label: z.boolean(),
    Weight: z.number().int().positive().optional(),
    Fold: z.number().int().nonnegative().optional()
}).strict();

/**
 * One line of a labels file: a decision prompt run, one of its questions, and the truth.
 *
 * - `Label`: whether the answer's prediction held. For a Likelihood, whether the statement was true;
 *   for a Choice or Score, whether its chosen value was right.
 * - `ExpectedValue`: for a Choice or Score, the right value; the label is whether the answer chose it.
 *
 * Give exactly one of the two. `Use` names the decision use when the rig's `--use` does not, or
 * differs; `Fold` and `Weight` pass through to the point.
 */
export const CalibrationLabelLineSchema = z.object({
    PromptRunID: z.string().min(1),
    Question: z.string().min(1),
    Label: z.boolean().optional(),
    ExpectedValue: z.union([z.string(), z.number()]).optional(),
    Use: z.string().min(1).optional(),
    Fold: z.number().int().nonnegative().optional(),
    Weight: z.number().int().positive().optional()
}).strict().refine(line => (line.Label === undefined) !== (line.ExpectedValue === undefined), {
    message: 'give exactly one of Label and ExpectedValue'
});

/** One line of a labels file. */
export type CalibrationLabelLine = z.infer<typeof CalibrationLabelLineSchema>;

/** The fields of a decision prompt run that the points are built from. */
export interface DecisionPromptRunRow {
    ID: string;
    /** The MJ decision model that answered (the view's denormalized `Model`). */
    Model: string | null;
    /** Every answer by question key, as `AIDecisionRunner` writes it. */
    Result: string | null;
    /** `{ "ResolvedModel": … }`, as `AIDecisionRunner` writes it. */
    ModelSpecificResponseDetails: string | null;
    Success: boolean | null;
}

/** A line of a JSONL file that could not be read, by its 1-based line number. */
export interface JsonlLineError {
    Line: number;
    Reason: string;
}

/** A label that produced no point, and why. */
export interface UnusedCalibrationLabel {
    PromptRunID: string;
    Question: string;
    Reason: string;
}

/**
 * Reads a JSONL file's lines with a schema. Blank lines are ignored; a line that is not JSON or does
 * not match is reported with its line number, never thrown.
 */
function parseJsonl<T>(text: string, schema: z.ZodType<T>): { Items: T[]; Errors: JsonlLineError[] } {
    const items: T[] = [];
    const errors: JsonlLineError[] = [];
    text.split(/\r?\n/).forEach((raw, i) => {
        if (raw.trim().length === 0) {
            return;
        }
        let value: unknown;
        try {
            value = JSON.parse(raw);
        } catch (err: unknown) {
            errors.push({ Line: i + 1, Reason: `not JSON: ${err instanceof Error ? err.message : String(err)}` });
            return;
        }
        const parsed = schema.safeParse(value);
        if (parsed.success) {
            items.push(parsed.data);
        } else {
            errors.push({ Line: i + 1, Reason: parsed.error.issues.map(issue => `${issue.path.join('.') || 'line'}: ${issue.message}`).join('; ') });
        }
    });
    return { Items: items, Errors: errors };
}

/**
 * Reads a JSONL file of calibration points.
 *
 * @param text The file's text.
 */
export function ParseCalibrationPointsJsonl(text: string): { Points: CalibrationPoint[]; Errors: JsonlLineError[] } {
    const { Items, Errors } = parseJsonl(text, CalibrationPointLineSchema);
    return { Points: Items, Errors };
}

/**
 * Reads a JSONL file of labels for decision prompt runs.
 *
 * @param text The file's text.
 */
export function ParseCalibrationLabelsJsonl(text: string): { Labels: CalibrationLabelLine[]; Errors: JsonlLineError[] } {
    const { Items, Errors } = parseJsonl(text, CalibrationLabelLineSchema);
    return { Labels: Items, Errors };
}

/**
 * The distinct prompt run IDs the labels name, normalized, in first-seen order.
 *
 * @param labels The labels.
 */
export function LabelledPromptRunIDs(labels: readonly CalibrationLabelLine[]): string[] {
    return [...new Set(labels.map(l => NormalizeUUID(l.PromptRunID)))];
}

/**
 * Builds a point for each label from the decision prompt run it names. A label is left out, with
 * the reason, when its run is missing or failed, names no model or resolved model, has no answer to
 * the question, or the answer carries no probability.
 *
 * @param runs The labelled runs.
 * @param labels The labels.
 * @param defaultUse The use for labels that name none.
 */
export function BuildPointsFromPromptRuns(
    runs: readonly DecisionPromptRunRow[],
    labels: readonly CalibrationLabelLine[],
    defaultUse: string | undefined
): { Points: CalibrationPoint[]; Unused: UnusedCalibrationLabel[] } {
    const byID = new UUIDMap<DecisionPromptRunRow>();
    for (const run of runs) {
        byID.Set(run.ID, run);
    }
    const points: CalibrationPoint[] = [];
    const unused: UnusedCalibrationLabel[] = [];
    for (const label of labels) {
        const point = pointFromLabel(label, byID.Get(label.PromptRunID), defaultUse);
        if (typeof point === 'string') {
            unused.push({ PromptRunID: label.PromptRunID, Question: label.Question, Reason: point });
        } else {
            points.push(point);
        }
    }
    return { Points: points, Unused: unused };
}

/** The point a label makes with its run, or why it makes none. */
function pointFromLabel(label: CalibrationLabelLine, run: DecisionPromptRunRow | undefined, defaultUse: string | undefined): CalibrationPoint | string {
    const use = label.Use ?? defaultUse;
    if (!use) {
        return 'no use: the label names none and no default use was given';
    }
    if (!run) {
        return 'no decision prompt run with this ID';
    }
    if (run.Success === false) {
        return 'the run failed, so it has no answers';
    }
    const resolvedModel = readResolvedModel(run.ModelSpecificResponseDetails);
    if (!run.Model || !resolvedModel) {
        return `the run does not name ${run.Model ? 'the resolved model' : 'its model'}, which the calibration is keyed on`;
    }
    const read = readAnswer(run.Result, label);
    if (typeof read === 'string') {
        return read;
    }
    return {
        Use: use,
        Question: label.Question,
        ModelName: run.Model,
        ResolvedModel: resolvedModel,
        RawProbability: read.Probability,
        Label: read.Label,
        ...(label.Weight !== undefined ? { Weight: label.Weight } : {}),
        ...(label.Fold !== undefined ? { Fold: label.Fold } : {})
    };
}

/** `ResolvedModel` from the run's details, or undefined. */
function readResolvedModel(details: string | null): string | undefined {
    const parsed = parseObject(details);
    const value = parsed?.['ResolvedModel'];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * The raw probability and the label for one question's answer: a Likelihood's `Probability`, or a
 * Choice's or Score's `Confidence`, labelled by the label line. Or why there is none.
 */
function readAnswer(result: string | null, label: CalibrationLabelLine): { Probability: number; Label: boolean } | string {
    const answers = parseObject(result);
    const answer = answers && Object.hasOwn(answers, label.Question) ? answers[label.Question] : undefined;
    if (!isObject(answer)) {
        return `the run has no answer to '${label.Question}'`;
    }
    const kind = answer['Kind'];
    const probability = kind === 'Likelihood' ? answer['Probability'] : answer['Confidence'];
    if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        return `the ${String(kind)} answer to '${label.Question}' has no probability in [0, 1]`;
    }
    if (label.ExpectedValue === undefined) {
        return { Probability: probability, Label: label.Label === true };
    }
    if (kind === 'Likelihood') {
        return `'${label.Question}' is a Likelihood: label it with Label, not ExpectedValue`;
    }
    return { Probability: probability, Label: String(answer['Value']) === String(label.ExpectedValue) };
}

function parseObject(json: string | null): Record<string, unknown> | undefined {
    if (!json) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(json);
        return isObject(parsed) ? parsed : undefined;
    } catch {
        // An unreadable column is reported by the caller as a missing answer or model, with the run's ID.
        return undefined;
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
