/**
 * @fileoverview Expands a labelled corpus × a matrix of cells into `MJ: Tests` records for the
 * `Decision Eval` test type, plus the suite that runs them. Pure: the generator rig
 * (`integration-test-suite/rigs/generate-decision-eval-suite.ts`) reads the files and writes the
 * output.
 *
 * One record per (point, cell), named `<point id> [<cell label>]` so the scorecard can group runs
 * by cell, with a stable ID derived from that pair so regenerating updates records rather than
 * orphaning them. The scheme is the Prompt Eval generator's.
 *
 * @module @memberjunction/testing-engine
 */

import { z } from 'zod';
import { BuildRoutingQuestions, BuildRoutingState, BuildRoutingStateStructured, CanAskRoutingDecision } from '@memberjunction/ai-core-plus';
import type { LabelledDecisionPoint } from './corpus';
import { MapPointToRoutingInput, type DecisionEvalAgentCatalog } from './point-mapping';
import { DECISION_EVAL_STATE_LAYOUTS, DescribeZodError, type DecisionCorpusPoint, type DecisionEvalConfig } from './types';

/** The test type's name, as the metadata record declares it. */
export const DECISION_EVAL_TEST_TYPE_NAME = 'Decision Eval';

/** The suite name when neither the matrix nor the command line gives one. */
export const DEFAULT_DECISION_EVAL_SUITE_NAME = 'Decision Eval — Conversation Routing';

/** Repeats per record when neither the matrix nor the command line gives a count. */
export const DEFAULT_DECISION_EVAL_REPS = 5;

/** A decision reply is a short JSON object. Reasoning models bill thinking as output, so this reads low. */
const ASSUMED_COMPLETION_TOKENS = 120;

/** What the decision prompt adds around the state and questions. A guess until measured. */
const ASSUMED_PROMPT_OVERHEAD_TOKENS = 600;

/**
 * The agents the generator resolves against, with no engine loaded: the point's own names, and a
 * stand-in conversation manager (the driver uses the engine's Sage).
 */
const OFFLINE_CATALOG: DecisionEvalAgentCatalog = {
    FindAgent: () => undefined,
    ConversationManager: { ID: '00000000-0000-4000-8000-000000000000', Name: 'Sage', Description: null }
};

/** One matrix cell: the conditions every point is observed under. */
export const DecisionEvalMatrixCellSchema = z.object({
    /** Names the cell. It becomes the bracketed part of every record's name. */
    label: z.string().min(1).refine(label => !/[[\]]/.test(label), 'must not contain [ or ]'),
    stateLayout: z.enum(DECISION_EVAL_STATE_LAYOUTS),
    promptName: z.string().min(1).optional(),
    modelId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    failover: z.boolean().optional(),
    temperature: z.number().optional(),
    seed: z.number().int().optional(),
    /** USD per million input tokens, for the cost estimate only. */
    inputPricePer1M: z.number().nonnegative().optional(),
    /** USD per million output tokens, for the cost estimate only. */
    outputPricePer1M: z.number().nonnegative().optional()
});

/** One matrix cell. */
export type DecisionEvalMatrixCell = z.infer<typeof DecisionEvalMatrixCellSchema>;

/** A matrix file. Keys it doesn't know, such as `_comment`, are ignored. */
export const DecisionEvalMatrixSchema = z.object({
    suiteName: z.string().min(1).optional(),
    reps: z.number().int().positive().optional(),
    cells: z.array(DecisionEvalMatrixCellSchema).min(1)
});

/** A matrix file. */
export type DecisionEvalMatrix = z.infer<typeof DecisionEvalMatrixSchema>;

/** An mj-sync record: its fields and its primary key. */
export interface SyncRecord {
    fields: Record<string, unknown>;  // case-violation-ok-legacy-back-compat: mj-sync's own file format
    primaryKey: { ID: string };  // case-violation-ok-legacy-back-compat: mj-sync's own file format
    relatedEntities?: Record<string, SyncRecord[]>;  // case-violation-ok-legacy-back-compat: mj-sync's own file format
}

/** The run's estimated size and cost. */
export interface DecisionEvalRunEstimate {
    PromptTokens: number;
    CompletionTokens: number;
    /** USD, or null when no cell carries prices. */
    USD: number | null;
    PerCell: Array<{ Label: string; USD: number | null }>;
}

/**
 * Parses and validates a matrix file. Throws naming the problem, and names a repeated cell label.
 *
 * @param text The file's text.
 * @param source The file's name, for messages.
 */
export function ParseDecisionEvalMatrix(text: string, source: string): DecisionEvalMatrix {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch (error) {
        throw new Error(`${source}: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
    const result = DecisionEvalMatrixSchema.safeParse(json);
    if (!result.success) {
        throw new Error(`${source}: ${DescribeZodError(result.error)}`);
    }
    const seen = new Set<string>();
    for (const cell of result.data.cells) {
        if (seen.has(cell.label)) {
            throw new Error(`${source}: cell label '${cell.label}' appears twice`);
        }
        seen.add(cell.label);
    }
    return result.data;
}

/**
 * A stable UUID for a pair of strings: FNV-1a over `a::b`, spread across a v4-shaped UUID. The same
 * scheme as the Prompt Eval generator's, so regenerating updates the same records.
 *
 * @param a The first part, such as a point ID.
 * @param b The second part, such as a cell label.
 */
export function StableEvalId(a: string, b: string): string {
    let hash = 0x811c9dc5;
    for (const char of `${a}::${b}`) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    const hex = hash.toString(16).padStart(8, '0');
    const tail = Array.from({ length: 3 }, (_, i) => (Math.imul(hash + i + 1, 0x01000193) >>> 0).toString(16).padStart(8, '0')).join('');
    return `${hex}-${tail.slice(0, 4)}-4${tail.slice(4, 7)}-a${tail.slice(7, 10)}-${tail.slice(10, 22)}`.toUpperCase();
}

/**
 * A record's name: `<point id> [<cell label>]`. The scorecard splits it back apart.
 *
 * @param pointId The point.
 * @param cellLabel The cell.
 */
export function DecisionEvalTestName(pointId: string, cellLabel: string): string {
    return `${pointId} [${cellLabel}]`;
}

/**
 * A cell's test `Configuration`. The `decision-label-match` oracle scores the `continues`
 * Likelihood against the label at 0.5.
 *
 * @param cell The cell.
 */
export function BuildDecisionEvalConfiguration(cell: DecisionEvalMatrixCell): DecisionEvalConfig {
    return {
        decision: 'conversation-routing',
        stateLayout: cell.stateLayout,
        promptName: cell.promptName,
        modelId: cell.modelId,
        vendorId: cell.vendorId,
        failover: cell.failover,
        temperature: cell.temperature,
        seed: cell.seed,
        oracles: [{
            type: 'decision-label-match',
            weight: 1,
            config: { question: 'continues', positiveLabel: 'continue', threshold: 0.5 }
        }]
    };
}

/**
 * One `MJ: Tests` record: the point as its input, its label as the expected outcome, the cell as
 * its configuration, and `RepeatCount` repeats. The description carries IDs only, never text.
 *
 * @param testCase The labelled point.
 * @param cell The cell.
 * @param reps Repeats per record.
 * @param labelSource Where the label came from.
 */
export function BuildDecisionEvalTestRecord(
    testCase: LabelledDecisionPoint,
    cell: DecisionEvalMatrixCell,
    reps: number,
    labelSource: string
): SyncRecord {
    const name = DecisionEvalTestName(testCase.Point.id, cell.label);
    return {
        fields: {
            TypeID: `@lookup:MJ: Test Types.Name=${DECISION_EVAL_TEST_TYPE_NAME}`,
            Name: name,
            Description: `Conversation-routing decision point ${testCase.Point.id} under cell '${cell.label}'. `
                + 'Generated by generate-decision-eval-suite.ts; do not hand-edit.',
            // JSON columns: mj-sync serializes the objects, so they are not pre-stringified.
            InputDefinition: { point: testCase.Point },
            ExpectedOutcomes: { label: testCase.Label, labelSource },
            Configuration: BuildDecisionEvalConfiguration(cell),
            RepeatCount: reps,
            Status: 'Active'
        },
        primaryKey: { ID: StableEvalId(testCase.Point.id, cell.label) }
    };
}

/**
 * The suite record, with a membership row per test in order.
 *
 * @param suiteName The suite's name.
 * @param testNames The tests' names, in run order.
 * @param description The suite's description.
 */
export function BuildDecisionEvalSuiteRecord(suiteName: string, testNames: readonly string[], description: string): SyncRecord {
    return {
        fields: { Name: suiteName, Description: description, Status: 'Active' },
        primaryKey: { ID: StableEvalId(suiteName, 'suite') },
        relatedEntities: {
            'MJ: Test Suite Tests': testNames.map((name, i) => ({
                fields: { SuiteID: '@parent:ID', TestID: `@lookup:MJ: Tests.Name=${name}`, Sequence: i + 1, Status: 'Active' },
                primaryKey: { ID: StableEvalId(name, 'membership') }
            }))
        }
    };
}

/**
 * Estimates the run's tokens and cost. Each call's prompt is the state and questions the builders
 * produce for the point (with the point's own agent names, since no engine is loaded offline) at
 * four characters a token, plus a fixed allowance for the prompt around them. A floor, not a
 * ceiling.
 *
 * @param cases The labelled points.
 * @param cells The matrix cells.
 * @param reps Repeats per record.
 */
export function EstimateDecisionEvalRun(
    cases: readonly LabelledDecisionPoint[],
    cells: readonly DecisionEvalMatrixCell[],
    reps: number
): DecisionEvalRunEstimate {
    const perCell = cells.map(cell => {
        const promptTokens = cases.reduce((sum, c) => sum + estimatePromptTokens(c, cell), 0) * reps;
        const completionTokens = cases.length * ASSUMED_COMPLETION_TOKENS * reps;
        const priced = cell.inputPricePer1M !== undefined && cell.outputPricePer1M !== undefined;
        return {
            Label: cell.label,
            PromptTokens: promptTokens,
            CompletionTokens: completionTokens,
            USD: priced ? (promptTokens * (cell.inputPricePer1M ?? 0) + completionTokens * (cell.outputPricePer1M ?? 0)) / 1e6 : null
        };
    });
    const priced = perCell.filter((c): c is typeof c & { USD: number } => c.USD !== null);
    return {
        PromptTokens: perCell.reduce((sum, c) => sum + c.PromptTokens, 0),
        CompletionTokens: perCell.reduce((sum, c) => sum + c.CompletionTokens, 0),
        USD: priced.length === 0 ? null : priced.reduce((sum, c) => sum + c.USD, 0),
        PerCell: perCell.map(c => ({ Label: c.Label, USD: c.USD }))
    };
}

/**
 * Whether a point has something to decide, judged offline with the point's own agents and the
 * conversation manager assumed present. False when the previous agent never answered in the
 * history: production makes no call then, and the driver records the run as an `Error`.
 *
 * @param point The corpus point.
 */
export function IsDecidableOffline(point: DecisionCorpusPoint): boolean {
    return CanAskRoutingDecision(MapPointToRoutingInput(point, OFFLINE_CATALOG));
}

/** One call's prompt tokens for a point under a cell, estimated offline. */
function estimatePromptTokens(testCase: LabelledDecisionPoint, cell: DecisionEvalMatrixCell): number {
    const input = MapPointToRoutingInput(testCase.Point, OFFLINE_CATALOG);
    const state = cell.stateLayout === 'structured' ? JSON.stringify(BuildRoutingStateStructured(input), null, 1) : BuildRoutingState(input);
    const questions = JSON.stringify(BuildRoutingQuestions(input));
    return Math.ceil((state.length + questions.length) / 4) + ASSUMED_PROMPT_OVERHEAD_TOKENS;
}
