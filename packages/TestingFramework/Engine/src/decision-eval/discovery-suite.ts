/**
 * @fileoverview Expands a labelled agent-discovery corpus × a matrix of cells into `MJ: Tests`
 * records for the `Decision Eval` test type. Pure: the generator rig
 * (`integration-test-suite/rigs/generate-decision-eval-suite.ts --decision agent-discovery`) reads
 * the files and writes the output.
 *
 * It follows the routing suite (`suite.ts`): one record per (request, cell), named
 * `<request id> [<cell label>]`, with a stable ID from that pair. A cell either asks the decision
 * (with its model pinned, or not) or runs a baseline, which makes no decision call.
 *
 * @module @memberjunction/testing-engine
 */

import { z } from 'zod';
import { BuildDecisionDiscoveryQuestions, DECISION_DISCOVERY_MAX_OPTIONS } from '@memberjunction/ai-agents';
import { NormalizeUUID } from '@memberjunction/global';
import type { LabelledDiscoveryRequest } from './discovery-corpus';
import { DiscoveryDecisionState } from './discovery-mapping';
import {
    DISCOVERY_EVAL_BASELINES,
    type DiscoveryCatalogAgent,
    type DiscoveryEvalConfig,
    type DiscoveryEvalExpected
} from './discovery-types';
import {
    DECISION_EVAL_TEST_TYPE_NAME,
    DecisionEvalCellLabelSchema,
    DecisionEvalTestName,
    ParseEvalMatrixFile,
    StableEvalId,
    type DecisionEvalRunEstimate,
    type SyncRecord
} from './suite';

/** The oracle every discovery record runs. */
export const DISCOVERY_LABEL_MATCH_ORACLE = 'discovery-label-match';

/** A Choice's reply carries its distribution over the options, so it reads longer than routing's. A guess until measured. */
const ASSUMED_COMPLETION_TOKENS = 200;

/** What the decision prompt adds around the state and questions: the routing estimate's allowance. */
const ASSUMED_PROMPT_OVERHEAD_TOKENS = 600;

/** One matrix cell: the decision under a model pinning, or a baseline. */
export const DiscoveryEvalMatrixCellSchema = z.object({
    /** Names the cell. It becomes the bracketed part of every record's name. */
    label: DecisionEvalCellLabelSchema,
    /** Runs this baseline instead of the decision. The model settings then do not apply. */
    baseline: z.enum(DISCOVERY_EVAL_BASELINES).optional(),
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

/** One discovery matrix cell. */
export type DiscoveryEvalMatrixCell = z.infer<typeof DiscoveryEvalMatrixCellSchema>;

/** A discovery matrix file. Keys it doesn't know, such as `_comment`, are ignored. */
export const DiscoveryEvalMatrixSchema = z.object({
    suiteName: z.string().min(1).optional(),
    reps: z.number().int().positive().optional(),
    cells: z.array(DiscoveryEvalMatrixCellSchema).min(1)
});

/** A discovery matrix file. */
export type DiscoveryEvalMatrix = z.infer<typeof DiscoveryEvalMatrixSchema>;

/**
 * The matrix used when none is given: the decision as the decision prompt selects its model, and
 * the `semantic-search` baseline. Pin models by passing a matrix.
 */
export const DEFAULT_DISCOVERY_EVAL_MATRIX: DiscoveryEvalMatrix = {
    cells: [
        { label: 'decision' },
        { label: 'semantic-search', baseline: 'semantic-search' }
    ]
};

/** How a catalog differs from the snapshot a corpus was generated from, by agent ID. */
export interface DiscoveryCatalogDrift {
    /** Agents in the current catalog that the snapshot doesn't have. */
    Added: string[];
    /** Agents in the snapshot that the current catalog doesn't have. */
    Removed: string[];
    /** Agents in both whose name or description changed. */
    Changed: string[];
}

/**
 * Parses and validates a discovery matrix file. Throws naming the problem, and names a repeated
 * cell label.
 *
 * @param text The file's text.
 * @param source The file's name, for messages.
 */
export function ParseDiscoveryEvalMatrix(text: string, source: string): DiscoveryEvalMatrix {
    return ParseEvalMatrixFile(text, source, DiscoveryEvalMatrixSchema);
}

/**
 * A cell's test `Configuration`, scored by the `discovery-label-match` oracle.
 *
 * @param cell The cell.
 */
export function BuildDiscoveryEvalConfiguration(cell: DiscoveryEvalMatrixCell): DiscoveryEvalConfig {
    return {
        decision: 'agent-discovery',
        baseline: cell.baseline,
        promptName: cell.promptName,
        modelId: cell.modelId,
        vendorId: cell.vendorId,
        failover: cell.failover,
        temperature: cell.temperature,
        seed: cell.seed,
        oracles: [{ type: DISCOVERY_LABEL_MATCH_ORACLE, weight: 1 }]
    };
}

/**
 * The repeats a cell's records run: `reps` for the decision, and one for a baseline, whose search
 * gives the same ranking every time and makes no model call.
 *
 * @param cell The cell.
 * @param reps Repeats per decision record.
 */
export function DiscoveryCellRepeats(cell: DiscoveryEvalMatrixCell, reps: number): number {
    return cell.baseline ? 1 : reps;
}

/**
 * One `MJ: Tests` record: the request as its input, its label as the expected outcome, the cell as
 * its configuration. The description carries IDs only, never text.
 *
 * @param testCase The labelled request.
 * @param cell The cell.
 * @param reps Repeats per decision record.
 * @param labelSource Where the label came from.
 */
export function BuildDiscoveryEvalTestRecord(
    testCase: LabelledDiscoveryRequest,
    cell: DiscoveryEvalMatrixCell,
    reps: number,
    labelSource: string
): SyncRecord {
    const expected: DiscoveryEvalExpected = { ...testCase.Label, labelSource };
    return {
        fields: {
            TypeID: `@lookup:MJ: Test Types.Name=${DECISION_EVAL_TEST_TYPE_NAME}`,
            Name: DecisionEvalTestName(testCase.Request.id, cell.label),
            Description: `Agent-discovery request ${testCase.Request.id} under cell '${cell.label}'. `
                + 'Generated by generate-decision-eval-suite.ts; do not hand-edit.',
            // JSON columns: mj-sync serializes the objects, so they are not pre-stringified.
            InputDefinition: { request: testCase.Request.request },
            ExpectedOutcomes: expected,
            Configuration: BuildDiscoveryEvalConfiguration(cell),
            RepeatCount: DiscoveryCellRepeats(cell, reps),
            Status: 'Active'
        },
        primaryKey: { ID: StableEvalId(testCase.Request.id, cell.label) }
    };
}

/**
 * Estimates the run's tokens and cost. A decision call's prompt is the request and the questions
 * over the catalog snapshot's agents (at most {@link DECISION_DISCOVERY_MAX_OPTIONS}), at four
 * characters a token, plus a fixed allowance. A baseline cell makes no model call. A floor, not a
 * ceiling.
 *
 * @param cases The labelled requests.
 * @param cells The matrix cells.
 * @param reps Repeats per decision record.
 * @param catalog The agents the corpus was generated from (`agents.json`), or none.
 */
export function EstimateDiscoveryEvalRun(
    cases: readonly LabelledDiscoveryRequest[],
    cells: readonly DiscoveryEvalMatrixCell[],
    reps: number,
    catalog: readonly DiscoveryCatalogAgent[]
): DecisionEvalRunEstimate {
    const options = catalog.slice(0, DECISION_DISCOVERY_MAX_OPTIONS);
    const questionChars = JSON.stringify(BuildDecisionDiscoveryQuestions(options)).length;
    const promptTokensPerRep = cases.reduce((sum, c) =>
        sum + Math.ceil((DiscoveryDecisionState(c.Request.request).length + questionChars) / 4) + ASSUMED_PROMPT_OVERHEAD_TOKENS, 0);
    const perCell = cells.map(cell => {
        const calls = cell.baseline ? 0 : reps;
        const promptTokens = promptTokensPerRep * calls;
        const completionTokens = cases.length * ASSUMED_COMPLETION_TOKENS * calls;
        const priced = cell.baseline !== undefined || (cell.inputPricePer1M !== undefined && cell.outputPricePer1M !== undefined);
        return {
            Label: cell.label,
            PromptTokens: promptTokens,
            CompletionTokens: completionTokens,
            USD: priced ? (promptTokens * (cell.inputPricePer1M ?? 0) + completionTokens * (cell.outputPricePer1M ?? 0)) / 1e6 : null
        };
    });
    // A baseline costs nothing, so the total is unpriced only when a decision cell is unpriced.
    const decisionCells = perCell.filter((_, i) => !cells[i].baseline);
    const pricedDecisionCells = decisionCells.filter((c): c is typeof c & { USD: number } => c.USD !== null);
    return {
        PromptTokens: perCell.reduce((sum, c) => sum + c.PromptTokens, 0),
        CompletionTokens: perCell.reduce((sum, c) => sum + c.CompletionTokens, 0),
        USD: pricedDecisionCells.length < decisionCells.length ? null : pricedDecisionCells.reduce((sum, c) => sum + c.USD, 0),
        PerCell: perCell.map(c => ({ Label: c.Label, USD: c.USD }))
    };
}

/**
 * How the current catalog differs from the snapshot a corpus was generated from. IDs compare
 * UUID-safely; names and descriptions compare trimmed.
 *
 * @param snapshot The snapshot's agents (`agents.json`).
 * @param current The discoverable agents now.
 */
export function CompareDiscoveryCatalog(
    snapshot: readonly DiscoveryCatalogAgent[],
    current: readonly DiscoveryCatalogAgent[]
): DiscoveryCatalogDrift {
    const before = new Map(snapshot.map(a => [NormalizeUUID(a.ID), a]));
    const after = new Map(current.map(a => [NormalizeUUID(a.ID), a]));
    const same = (a: DiscoveryCatalogAgent, b: DiscoveryCatalogAgent): boolean =>
        a.Name.trim() === b.Name.trim() && a.Description.trim() === b.Description.trim();
    return {
        Added: current.filter(a => !before.has(NormalizeUUID(a.ID))).map(a => a.ID),
        Removed: snapshot.filter(a => !after.has(NormalizeUUID(a.ID))).map(a => a.ID),
        Changed: current.filter(a => {
            const earlier = before.get(NormalizeUUID(a.ID));
            return earlier !== undefined && !same(earlier, a);
        }).map(a => a.ID)
    };
}
