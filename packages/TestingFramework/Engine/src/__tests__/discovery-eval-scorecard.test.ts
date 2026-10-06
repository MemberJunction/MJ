/**
 * @fileoverview Turning an agent-discovery suite's runs into a scorecard: runs read and grouped by
 * cell, decision and baseline cells told apart, the on-time rate per answering model, Platt fits
 * marked when they did not converge, and cases named by ID only.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildDiscoveryEvalScorecard,
    ReadDiscoveryEvalRun,
    RenderDiscoveryEvalScorecard,
    ToDiscoveryObservation
} from '../decision-eval/discovery-scorecard';
import type { DecisionEvalRunRow } from '../decision-eval/scorecard';
import type { DiscoveryDecisionCellMetrics } from '../decision-eval/discovery-metrics';
import type { DiscoveryEvalActualOutput, DiscoveryEvalExpected } from '../decision-eval/discovery-types';

const SECRET_TEXT = 'a request from the corpus that must never reach the scorecard';
const A = 'A0000000-0000-4000-8000-000000000001';
const B = 'A0000000-0000-4000-8000-000000000002';

function decision(chosen: string | null, confidence: number, anyApplies: number, wouldInject: boolean | null): DiscoveryEvalActualOutput {
    return {
        Decision: 'agent-discovery',
        Arm: 'decision',
        PromptName: 'Default Decision',
        Options: { Count: 3, Limit: 25, CatalogSize: 3, WithoutDescription: 0, DeclaredCap: null, NarrowedFrom: null },
        LabelledAgentOffered: true,
        Answers: {},
        ChosenAgentId: chosen,
        ChosenAgentName: null,
        Confidence: chosen ? confidence : null,
        AnyApplies: chosen ? anyApplies : null,
        WouldInject: wouldInject,
        MinConfidence: 0.7,
        VerdictReason: chosen ? null : SECRET_TEXT,
        Baseline: null,
        Model: {
            PinnedModelId: 'm1', PinnedVendorId: null, FailoverAllowed: false, AnsweredModelId: 'm1', AnsweredModelName: 'Jev',
            AnsweredVendorId: null, AnsweredVendorName: null, DriverClass: 'JevDecision', ResolvedModel: 'jev-2026-09-01',
            AnsweredByPinned: true, FailedOver: false
        },
        Sampling: { RequestedTemperature: null, RequestedSeed: null, Applied: false, Note: null },
        LatencyMs: 250,
        DiscoveryLatencyMs: 300,
        WithinProductionTimeout: true,
        PromptRunId: 'prun',
        CostUSD: 0.001,
        Error: null
    };
}

function baseline(topMatch: string | null): DiscoveryEvalActualOutput {
    const candidate = topMatch ? { AgentId: topMatch, AgentName: 'Agent', Rank: 1, Score: 0.7, Semantic: 0.7, Lexical: null, PassesFloor: true } : null;
    return {
        ...decision(topMatch, 0, 0, topMatch !== null),
        Arm: 'semantic-search', PromptName: null, Options: null, Confidence: null, AnyApplies: null, MinConfidence: null, Model: null,
        DiscoveryLatencyMs: null, WithinProductionTimeout: null, PromptRunId: null, CostUSD: null, VerdictReason: null,
        Baseline: { Floor: 0.5, TopK: 15, Results: 3, TopRanked: candidate, TopMatch: candidate }
    };
}

/** A run row; its expected outcome may be one the scorecard cannot read. */
function runRow(caseId: string, cell: string, expected: DiscoveryEvalExpected | { label: string; labelSource: string }, output: DiscoveryEvalActualOutput | null, overrides: Partial<DecisionEvalRunRow> = {}): DecisionEvalRunRow {
    return {
        TestName: `${caseId} [${cell}]`,
        Status: 'Passed',
        ExpectedOutputData: JSON.stringify(expected),
        ActualOutputData: output ? JSON.stringify(output) : null,
        ResultDetails: null,
        CostUSD: 0,
        PromptRunCost: 0.002,
        ...overrides
    };
}

const AGENT_A: DiscoveryEvalExpected = { label: 'agent', agentId: A, labelSource: 'construction' };
const AGENT_B: DiscoveryEvalExpected = { label: 'agent', agentId: B, labelSource: 'construction' };
const NONE_CHAT: DiscoveryEvalExpected = { label: 'none', kind: 'chat', labelSource: 'construction' };

const ROWS: DecisionEvalRunRow[] = [
    runRow('r1', 'jev', AGENT_A, decision(A, 0.9, 0.9, true)),
    runRow('r1', 'jev', AGENT_A, decision(A, 0.8, 0.9, true)),
    runRow('r2', 'jev', AGENT_B, decision(A, 0.6, 0.8, false)),
    runRow('r3', 'jev', NONE_CHAT, decision(B, 0.5, 0.2, false)),
    runRow('r3', 'jev', NONE_CHAT, decision(null, 0, 0, null), { Status: 'Failed' }),
    runRow('r1', 'semantic-search', AGENT_A, baseline(A), { PromptRunCost: null }),
    runRow('r2', 'semantic-search', AGENT_B, baseline(null), { PromptRunCost: null }),
    runRow('r3', 'semantic-search', NONE_CHAT, baseline(null), { PromptRunCost: null }),
    runRow('r4', 'jev', AGENT_A, null, { Status: 'Running' }),
    runRow('r5', 'jev', { label: 'continue', labelSource: 'x' }, decision(A, 0.9, 0.9, true))
];

describe('Agent-discovery scorecard', () => {
    describe('ReadDiscoveryEvalRun', () => {
        it('reads a run into its cell and an observation, taking the prompt run\'s cost', () => {
            const read = ReadDiscoveryEvalRun(ROWS[0]);
            expect('Unreadable' in read).toBe(false);
            if (!('Unreadable' in read)) {
                expect(read.Cell).toBe('jev');
                expect(read.ResolvedModel).toBe('jev-2026-09-01');
                expect(read.Observation).toMatchObject({
                    CaseId: 'r1', Label: 'agent', ExpectedAgentId: A, Arm: 'decision', ChosenAgentId: A, Confidence: 0.9, CostUSD: 0.002,
                    LatencyMs: 250, DiscoveryLatencyMs: 300, WithinProductionTimeout: true
                });
            }
        });

        it('reads a run recorded before the whole discovery was timed, with no discovery latency', () => {
            const recordedBefore = decision(A, 0.9, 0.9, true);
            delete recordedBefore.DiscoveryLatencyMs;
            const read = ReadDiscoveryEvalRun(runRow('r1', 'jev', AGENT_A, null, { ActualOutputData: JSON.stringify(recordedBefore) }));
            expect('Unreadable' in read ? null : read.Observation).toMatchObject({ Arm: 'decision', DiscoveryLatencyMs: null, WithinProductionTimeout: true });
        });

        it('calls a running run, a name without a cell, and an unreadable label unreadable', () => {
            expect(ReadDiscoveryEvalRun(ROWS[8])).toEqual({ Unreadable: 'still running' });
            expect(ReadDiscoveryEvalRun({ ...ROWS[0], TestName: 'r1' })).toEqual({ Unreadable: 'test name has no [cell]' });
            expect(ReadDiscoveryEvalRun(ROWS[9])).toEqual({ Unreadable: 'no readable expected outcome' });
        });

        it('keeps a run with no output as one with no arm and no answer', () => {
            const observation = ToDiscoveryObservation('r9', NONE_CHAT, null, null);
            expect(observation).toMatchObject({ Arm: null, Kind: 'chat', ChosenAgentId: null, WouldInject: null, FailedOver: false, FailoverAllowed: true });
        });
    });

    describe('BuildDiscoveryEvalScorecard', () => {
        const scorecard = BuildDiscoveryEvalScorecard(ROWS, {
            Suite: 'Discovery', GeneratedAt: '2026-09-29T00:00:00.000Z', BootstrapResamples: 50,
            CatalogDrift: { Added: ['x'], Removed: [], Changed: ['y', 'z'] }
        });

        it('groups by cell, and tells the decision cell from the baseline', () => {
            expect(scorecard.Runs).toBe(10);
            expect(scorecard.UnreadableReasons).toEqual({ 'still running': 1, 'no readable expected outcome': 1 });
            expect(scorecard.Cells.map(c => [c.Cell, c.Metrics.Arm])).toEqual([['jev', 'decision'], ['semantic-search', 'semantic-search']]);
            const jev = scorecard.Cells[0].Metrics;
            if (jev.Arm === 'decision') {
                expect(jev.Counts).toMatchObject({ Runs: 5, UsableRuns: 4, NoAnswerRuns: 1 });
                expect(jev.Top1).toMatchObject({ N: 3, Accuracy: 2 / 3 });
            }
            const baselineCell = scorecard.Cells[1].Metrics;
            if (baselineCell.Arm === 'semantic-search') {
                expect(baselineCell.Top1).toMatchObject({ N: 2, Accuracy: 0.5 });
                expect(baselineCell.NoneBelowFloor).toEqual({ Runs: 1, BelowFloor: 1, Rate: 1 });
            }
            expect(scorecard.Cells[0].ResolvedModels).toEqual({ 'jev-2026-09-01': 5 });
            expect(scorecard.Cells[1].OnTimeByModel).toEqual({});
        });

        it('reports each answering model\'s on-time rate over its usable runs', () => {
            const late: DiscoveryEvalActualOutput = { ...decision(A, 0.9, 0.9, false), DiscoveryLatencyMs: 1700, WithinProductionTimeout: false };
            const base = decision(B, 0.9, 0.9, true);
            const other: DiscoveryEvalActualOutput = {
                ...base,
                Model: base.Model ? { ...base.Model, AnsweredModelName: 'LLM Decision', ResolvedModel: 'GPT-OSS-120B' } : null
            };
            const card = BuildDiscoveryEvalScorecard([
                runRow('r1', 'mixed', AGENT_A, decision(A, 0.9, 0.9, true)),
                runRow('r2', 'mixed', AGENT_A, late),
                runRow('r3', 'mixed', AGENT_B, other),
                runRow('r4', 'mixed', AGENT_B, decision(null, 0, 0, null), { Status: 'Failed' })
            ], { Suite: 'Discovery', GeneratedAt: '2026-09-29T00:00:00.000Z', BootstrapResamples: 10 });
            expect(card.Cells[0].OnTimeByModel).toEqual({
                'jev-2026-09-01': { Runs: 2, OnTime: 1, Rate: 0.5 },
                'GPT-OSS-120B': { Runs: 1, OnTime: 1, Rate: 1 }
            });
            const markdown = RenderDiscoveryEvalScorecard(card);
            expect(markdown).toContain('jev-2026-09-01 ×3 (on time 1/2, 50.0%)');
            expect(markdown).toContain('GPT-OSS-120B ×1 (on time 1/1, 100.0%)');
        });

        it('marks a Platt fit that did not converge', () => {
            const cell = scorecard.Cells[0];
            const metrics = cell.Metrics;
            expect(metrics.Arm).toBe('decision');
            if (metrics.Arm !== 'decision' || !metrics.AnyAppliesCalibration.Platt) {
                return;
            }
            const stalled: DiscoveryDecisionCellMetrics = {
                ...metrics,
                AnyAppliesCalibration: { ...metrics.AnyAppliesCalibration, Platt: { ...metrics.AnyAppliesCalibration.Platt, Iterations: 100, Converged: false } }
            };
            const converged = RenderDiscoveryEvalScorecard(scorecard);
            const marked = RenderDiscoveryEvalScorecard({ ...scorecard, Cells: [{ ...cell, Metrics: stalled }, ...scorecard.Cells.slice(1)] });
            expect(converged).not.toContain('not converged');
            expect(marked).toContain('(not converged after 100 iterations)');
        });

        it('renders both summaries, the injection table and the reliability tables, by ID only', () => {
            const markdown = RenderDiscoveryEvalScorecard(scorecard);
            expect(markdown).toContain('# Decision Eval scorecard (agent discovery): Discovery');
            expect(markdown).toContain('## Decision cells');
            expect(markdown).toContain("## Baseline cells (Find Candidate Agents' semantic search)");
            expect(markdown).toContain('### Injection (on time within 1500 ms, confidence ≥ T and anyApplies ≥ T)');
            expect(markdown).toContain('On time (≤ 1500 ms)');
            // Production's rule uses calibration fitted on the eval's corpus, so its columns say when they are in-sample.
            expect(markdown).toContain('On the corpus that calibration was fitted on, these columns are in-sample');
            expect(markdown).toContain('### Reliability: Choice confidence as P(correct)');
            expect(markdown).toContain('### Reliability: anyApplies as P(label is agent)');
            expect(markdown).toContain('Catalog drift since the corpus snapshot: 1 added, 0 removed, 2 changed.');
            expect(markdown).toContain('| r1 | 2 |');
            expect(markdown).not.toContain(SECRET_TEXT);
        });
    });
});
