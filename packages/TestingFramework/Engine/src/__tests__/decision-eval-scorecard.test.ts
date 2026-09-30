/**
 * @fileoverview Turning a Decision Eval suite's runs into a scorecard, grouped by cell, with cases
 * named by ID only.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildDecisionEvalScorecard,
    ReadDecisionEvalRun,
    RenderDecisionEvalScorecard,
    SplitDecisionEvalTestName,
    type DecisionEvalRunRow
} from '../decision-eval/scorecard';
import type { DecisionEvalActualOutput, DecisionEvalLabel } from '../decision-eval/types';

const SECRET_TEXT = 'a message from the corpus that must never reach the scorecard';

function actual(probability: number | null, overrides: Partial<DecisionEvalActualOutput['Model']> = {}): DecisionEvalActualOutput {
    return {
        Decision: 'conversation-routing',
        StateLayout: 'production',
        PromptName: 'Default Decision',
        Answers: probability === null ? {} : { continues: { Kind: 'Likelihood', Probability: probability } },
        ContinuesProbability: probability,
        Route: null,
        RoutingVerdict: probability === null ? null : 'KeptContinuity',
        Model: {
            PinnedModelId: 'm1', PinnedVendorId: null, FailoverAllowed: false, AnsweredModelId: 'm1', AnsweredModelName: 'Jev',
            AnsweredVendorId: null, AnsweredVendorName: null, DriverClass: 'JevDecision', ResolvedModel: 'jev-2026-09-01',
            AnsweredByPinned: true, FailedOver: false, ...overrides
        },
        Sampling: { RequestedTemperature: 0, RequestedSeed: null, Applied: false, Note: 'not applied' },
        LatencyMs: 200,
        PromptRunId: 'prun',
        CostUSD: 0.001,
        Error: probability === null ? SECRET_TEXT : null
    };
}

function runRow(caseId: string, cell: string, label: DecisionEvalLabel, output: DecisionEvalActualOutput | null, overrides: Partial<DecisionEvalRunRow> = {}): DecisionEvalRunRow {
    return {
        TestName: `${caseId} [${cell}]`,
        Status: 'Passed',
        ExpectedOutputData: JSON.stringify({ label, labelSource: 'construction' }),
        ActualOutputData: output ? JSON.stringify(output) : null,
        ResultDetails: null,
        CostUSD: 0.5,
        PromptRunCost: 0.002,
        ...overrides
    };
}

const ROWS: DecisionEvalRunRow[] = [
    runRow('p1', 'jev · production', 'continue', actual(0.9)),
    runRow('p1', 'jev · production', 'continue', actual(0.8)),
    runRow('p2', 'jev · production', 'switch', actual(0.2)),
    runRow('p2', 'jev · production', 'switch', actual(0.3)),
    runRow('p3', 'jev · production', 'ambiguous', actual(0.6)),
    runRow('p1', 'llm-decision · production', 'continue', actual(0.4, { ResolvedModel: 'chat-model-a' })),
    runRow('p2', 'llm-decision · production', 'switch', actual(null), { Status: 'Error', PromptRunCost: null }),
    runRow('p2', 'llm-decision · production', 'switch', actual(0.1, { FailedOver: true, AnsweredByPinned: false })),
    runRow('p4', 'jev · production', 'continue', null, { Status: 'Running' }),
    { ...runRow('p5', 'x', 'continue', actual(0.5)), TestName: 'no cell here' }
];

describe('Decision Eval scorecard', () => {
    it('splits a test name into point and cell', () => {
        expect(SplitDecisionEvalTestName('abc [jev · production]')).toEqual({ CaseId: 'abc', Cell: 'jev · production' });
        expect(SplitDecisionEvalTestName('abc')).toBeNull();
    });

    it('reads a run: label from the expected outcome, probability, latency and cost from the output', () => {
        const read = ReadDecisionEvalRun(ROWS[0]);
        expect(read).toEqual({
            Cell: 'jev · production',
            Observation: { CaseId: 'p1', Label: 'continue', Probability: 0.9, LatencyMs: 200, CostUSD: 0.002, FailedOver: false, FailoverAllowed: false },
            ResolvedModel: 'jev-2026-09-01',
            SamplingRequested: true,
            SamplingApplied: false
        });
    });

    it('prefers the prompt run\'s cost, then the output\'s, then the test run\'s', () => {
        const noPromptRun = ReadDecisionEvalRun(runRow('p', 'c', 'continue', actual(0.5), { PromptRunCost: null }));
        expect('Observation' in noPromptRun && noPromptRun.Observation.CostUSD).toBe(0.001);
        const noOutput = ReadDecisionEvalRun(runRow('p', 'c', 'continue', null, { Status: 'Error', PromptRunCost: null }));
        expect('Observation' in noOutput && noOutput.Observation).toMatchObject({ Probability: null, CostUSD: 0.5 });
    });

    it('falls back to the oracle\'s probability when the output has none', () => {
        const details = JSON.stringify([{ oracleType: 'decision-label-match', passed: true, score: 1, message: '', details: { probability: 0.35, label: 'switch', positive: 0, correct: true, brier: 0.1225 } }]);
        const read = ReadDecisionEvalRun(runRow('p', 'c', 'switch', null, { ResultDetails: details }));
        expect('Observation' in read && read.Observation.Probability).toBe(0.35);
        const garbled = ReadDecisionEvalRun(runRow('p', 'c', 'switch', null, { ResultDetails: '{not json' }));
        expect('Observation' in garbled && garbled.Observation.Probability).toBeNull();
    });

    it('marks runs still in progress and unnamed runs unreadable', () => {
        expect(ReadDecisionEvalRun(ROWS[8])).toEqual({ Unreadable: 'still running' });
        expect(ReadDecisionEvalRun(ROWS[9])).toEqual({ Unreadable: 'test name has no [cell]' });
        expect(ReadDecisionEvalRun(runRow('p', 'c', 'continue', actual(0.5), { ExpectedOutputData: '{"label":"maybe"}' })))
            .toEqual({ Unreadable: 'no readable expected outcome' });
    });

    it('groups runs by cell and computes each cell\'s metrics', () => {
        const scorecard = BuildDecisionEvalScorecard(ROWS, { Suite: 'Suite', GeneratedAt: '2026-09-29T00:00:00.000Z', BootstrapResamples: 50 });
        expect(scorecard.Cells.map(c => c.Cell)).toEqual(['jev · production', 'llm-decision · production']);
        expect(scorecard).toMatchObject({ Runs: 10, UnreadableRuns: 2, UnreadableReasons: { 'still running': 1, 'test name has no [cell]': 1 } });
        const [jev, llm] = scorecard.Cells;
        expect(jev.Metrics.Raw).toMatchObject({ N: 2, Accuracy: 1, RocAuc: 1 });
        expect(jev.Metrics.Ambiguous).toEqual({ Cases: 1, KeptWithPreviousAgent: 1, Rate: 1 });
        expect(jev.ResolvedModels).toEqual({ 'jev-2026-09-01': 5 });
        expect(llm.Metrics.Counts).toMatchObject({ Runs: 3, NoProbabilityRuns: 1, FailoverRuns: 1, ExcludedFailoverRuns: 1 });
        expect(llm.Metrics.Raw).toMatchObject({ N: 1, Accuracy: 0 });
        expect(llm.SamplingRequested && !llm.SamplingApplied).toBe(true);
    });

    it('renders Markdown with the tables and case IDs, and never the corpus text', () => {
        const markdown = RenderDecisionEvalScorecard(BuildDecisionEvalScorecard(ROWS, { Suite: 'Suite', GeneratedAt: 'now', BootstrapResamples: 50 }));
        expect(markdown).toContain('# Decision Eval scorecard: Suite');
        expect(markdown).toContain('## Summary (raw probabilities)');
        expect(markdown).toContain('## Calibrated (out-of-fold Platt)');
        expect(markdown).toContain('### Reliability (10 equal-width bins)');
        expect(markdown).toContain('### Operating points (continue at or above the threshold)');
        expect(markdown).toContain('| p1 | 2 |');
        expect(markdown).toContain('requested, NOT applied');
        expect(markdown).not.toContain(SECRET_TEXT);
    });

    it('is deterministic for the same runs', () => {
        const options = { Suite: 'Suite', GeneratedAt: 'now', BootstrapResamples: 50 };
        expect(BuildDecisionEvalScorecard(ROWS, options)).toEqual(BuildDecisionEvalScorecard(ROWS, options));
    });

    it('gives an identical scorecard, JSON and Markdown, for the runs in reverse order', () => {
        // Enough cases for the folds and the bootstrap draws to matter, two resolved models and
        // two unreadable reasons, so every place the read order could leak in is exercised.
        const rows = [...ROWS, ...manyRows(80, 4)];
        const options = { Suite: 'Suite', GeneratedAt: 'now' };
        const forward = BuildDecisionEvalScorecard(rows, options);
        const reversed = BuildDecisionEvalScorecard([...rows].reverse(), options);
        expect(reversed).toEqual(forward);
        expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
        expect(RenderDecisionEvalScorecard(reversed)).toBe(RenderDecisionEvalScorecard(forward));
    });
});

/** `cases` cases of `repeats` runs each in one cell, alternately answered by two resolved models. */
function manyRows(cases: number, repeats: number): DecisionEvalRunRow[] {
    return Array.from({ length: cases }, (_, c) => {
        const label: DecisionEvalLabel = c % 3 === 0 ? 'switch' : 'continue';
        const base = label === 'continue' ? 0.55 + (c % 7) * 0.06 : 0.25 + (c % 5) * 0.12;
        return Array.from({ length: repeats }, (_, r) => runRow(`case-${(cases - c) * 37 % 101}-${c}`, 'many', label,
            actual(Math.min(0.99, base + r * 0.013), { ResolvedModel: r % 2 === 0 ? 'model-b' : 'model-a' })));
    }).flat();
}
