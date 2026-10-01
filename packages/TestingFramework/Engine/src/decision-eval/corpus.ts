/**
 * @fileoverview Reads a Decision Eval corpus: `corpus.jsonl` (one decision point per line) and
 * `labels.jsonl` (one label per line, several sources per point).
 *
 * Every line is validated against its schema, and a line that doesn't match fails the whole read
 * with its file and line number. A point that silently drops out of a corpus looks exactly like a
 * point the model got right, so nothing here skips a bad line.
 *
 * The functions take the files' text, not paths, so they are pure: the suite generator reads the
 * files.
 *
 * @module @memberjunction/testing-engine
 */

import type { z } from 'zod';
import {
    DecisionCorpusLabelSchema,
    DecisionCorpusPointSchema,
    DescribeZodError,
    type DecisionCorpusLabel,
    type DecisionCorpusPoint,
    type DecisionEvalLabel
} from './types';

/** A corpus or label file that does not match its schema, with where. */
export class DecisionCorpusError extends Error {
    /**
     * @param File The file's name, as the message shows it.
     * @param Line The 1-based line number, or 0 for a problem with the file as a whole.
     * @param Detail What is wrong.
     */
    constructor(public readonly File: string, public readonly Line: number, public readonly Detail: string) {
        super(Line > 0 ? `${File} line ${Line}: ${Detail}` : `${File}: ${Detail}`);
        this.name = 'DecisionCorpusError';
    }
}

/** A parsed line, with the line it came from. */
export interface NumberedLine<T> {
    /** The 1-based line number. */
    Line: number;
    /** The parsed value. */
    Value: T;
}

/** One labelled point: a corpus point with the label the chosen source gave it. */
export interface LabelledDecisionPoint {
    /** The point. */
    Point: DecisionCorpusPoint;
    /** Its label from the chosen source. */
    Label: DecisionEvalLabel;
}

/** A corpus joined to one label source. */
export interface JoinedDecisionCorpus {
    /** The points that have a label from the source, in corpus order. */
    Cases: LabelledDecisionPoint[];
    /** IDs of points with no label from the source. */
    UnlabelledPointIds: string[];
    /** How many of the source's labels name a point the corpus doesn't have. */
    OrphanLabelCount: number;
}

/**
 * Parses `corpus.jsonl`. Blank lines are skipped. Throws a {@link DecisionCorpusError} naming the
 * line when a line is not JSON, does not match the point schema, or repeats a point ID.
 *
 * @param text The file's text.
 * @param fileName The file's name, for messages.
 */
export function ParseDecisionCorpus(text: string, fileName: string = 'corpus.jsonl'): DecisionCorpusPoint[] {
    const points = parseJsonLines(text, fileName, DecisionCorpusPointSchema);
    const firstLineById = new Map<string, number>();
    for (const { Line, Value } of points) {
        const key = Value.id.toUpperCase();
        const first = firstLineById.get(key);
        if (first !== undefined) {
            throw new DecisionCorpusError(fileName, Line, `point ${Value.id} repeats the point on line ${first}`);
        }
        firstLineById.set(key, Line);
    }
    return points.map(p => p.Value);
}

/**
 * Parses `labels.jsonl`. Blank lines are skipped. Throws a {@link DecisionCorpusError} naming the
 * line when a line is not JSON or does not match the label schema.
 *
 * @param text The file's text.
 * @param fileName The file's name, for messages.
 */
export function ParseDecisionLabels(text: string, fileName: string = 'labels.jsonl'): NumberedLine<DecisionCorpusLabel>[] {
    return parseJsonLines(text, fileName, DecisionCorpusLabelSchema);
}

/**
 * Each point's label from one source. The same label given twice is fine; two different labels
 * from the same source for one point throw, naming both lines, because either choice would be a
 * guess.
 *
 * @param labels The parsed label lines.
 * @param source The label source, such as `construction`.
 * @param fileName The label file's name, for messages.
 */
export function SelectLabelSource(
    labels: readonly NumberedLine<DecisionCorpusLabel>[],
    source: string,
    fileName: string = 'labels.jsonl'
): Map<string, DecisionEvalLabel> {
    const chosen = new Map<string, NumberedLine<DecisionEvalLabel>>();
    for (const { Line, Value } of labels) {
        if (Value.source !== source) {
            continue;
        }
        const key = Value.id.toUpperCase();
        const earlier = chosen.get(key);
        if (earlier && earlier.Value !== Value.label) {
            throw new DecisionCorpusError(fileName, Line,
                `point ${Value.id} is labelled '${Value.label}' by '${source}', but line ${earlier.Line} labels it '${earlier.Value}'`);
        }
        chosen.set(key, earlier ?? { Line, Value: Value.label });
    }
    return new Map([...chosen].map(([id, numbered]) => [id, numbered.Value]));
}

/**
 * Joins the corpus to one label source. Point IDs are compared case-insensitively.
 *
 * @param points The corpus points, in file order.
 * @param labelsById Each point's label from the source ({@link SelectLabelSource}).
 */
export function JoinDecisionCorpus(
    points: readonly DecisionCorpusPoint[],
    labelsById: ReadonlyMap<string, DecisionEvalLabel>
): JoinedDecisionCorpus {
    const cases: LabelledDecisionPoint[] = [];
    const unlabelled: string[] = [];
    const known = new Set<string>();
    for (const point of points) {
        const key = point.id.toUpperCase();
        known.add(key);
        const label = labelsById.get(key);
        if (label) {
            cases.push({ Point: point, Label: label });
        } else {
            unlabelled.push(point.id);
        }
    }
    const orphans = [...labelsById.keys()].filter(id => !known.has(id)).length;
    return { Cases: cases, UnlabelledPointIds: unlabelled, OrphanLabelCount: orphans };
}

/** Parses each non-blank line as JSON and validates it, keeping line numbers. */
function parseJsonLines<TSchema extends z.ZodTypeAny>(
    text: string,
    fileName: string,
    schema: TSchema
): NumberedLine<z.infer<TSchema>>[] {
    const parsed: NumberedLine<z.infer<TSchema>>[] = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((raw, index) => {
        if (raw.trim() === '') {
            return;
        }
        const line = index + 1;
        const json = parseJson(raw, fileName, line);
        const result = schema.safeParse(json);
        if (!result.success) {
            throw new DecisionCorpusError(fileName, line, DescribeZodError(result.error));
        }
        parsed.push({ Line: line, Value: result.data });
    });
    return parsed;
}

/** One line's JSON, or a {@link DecisionCorpusError} naming the line. */
function parseJson(raw: string, fileName: string, line: number): unknown {
    try {
        return JSON.parse(raw);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new DecisionCorpusError(fileName, line, `not valid JSON (${reason})`);
    }
}
