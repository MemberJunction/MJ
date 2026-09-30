import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { OutputInsideRepoError } from '@memberjunction/testing-engine';
import {
    ComputeOperatingThresholdMetrics,
    ComputeRepeatabilityAgreement,
    EvaluateMemoryGateMeasurement,
    OutOfFoldPlattByScenario,
    ScenarioBootstrapAuc,
    ShippedVerdict,
    SummarizeTelemetry,
    type EvaluatedNote
} from '../../memory-gate-measurement/evaluator';
import {
    BuildEvaluatedNotes,
    ObservationsForDecision,
    ParseDecisionObservations,
    SerializeObservation
} from '../../memory-gate-measurement/observations';
import {
    RenderMeasurementReportMarkdown,
    WriteMeasurementReportFiles
} from '../../memory-gate-measurement/report-builder';
import type { CorpusLabel, CorpusScenario, DecisionObservation } from '../../memory-gate-measurement/corpus-types';
import { ParseArgs as ParseCorpusArgs } from '../../../rigs/generate-memory-note-corpus';
import { ParseArgs as ParseMeasurementArgs } from '../../../rigs/memory-note-gate-measurement';

/** This test's own directory: inside a git working tree, where no output may go. */
const HERE = dirname(fileURLToPath(import.meta.url));
describe('memory-gate evaluator and report builder', () => {
    const sampleEvaluatedNotes: EvaluatedNote[] = [
        {
            ScenarioId: 's1',
            NoteId: 's1-n1',
            Label: 'durable',
            IsDurable: true,
            SelfConfidence: 90,
            DecisionRawProbability: 0.85,
            ModelName: 'model-a'
        },
        {
            ScenarioId: 's1',
            NoteId: 's1-n2',
            Label: 'ephemeral',
            IsDurable: false,
            SelfConfidence: 70,
            DecisionRawProbability: 0.40,
            ModelName: 'model-a'
        },
        {
            ScenarioId: 's2',
            NoteId: 's2-n1',
            Label: 'wrong',
            IsDurable: false,
            SelfConfidence: 85, // Self confidence thought it was good
            DecisionRawProbability: 0.15, // Decision gate correctly caught it
            ModelName: 'model-a'
        },
        {
            ScenarioId: 's2',
            NoteId: 's2-n2',
            Label: 'durable',
            IsDurable: true,
            SelfConfidence: 65, // Self confidence missed it
            DecisionRawProbability: 0.75, // Decision gate caught it
            ModelName: 'model-a'
        }
    ];

    it('computes operating threshold metrics against hand-calculated values', () => {
        // At threshold 80 on selfConfidence:
        // Notes kept: s1-n1 (90, durable), s2-n1 (85, wrong)
        // total kept = 2, durable kept = 1, total durable = 2
        // Precision = 1 / 2 = 0.5
        // Recall = 1 / 2 = 0.5
        // F1 = 0.5
        // Kept share: durable = 1/2 (50%), ephemeral = 0/1 (0%), wrong = 1/1 (100%), speculative = 0/0 (0%)
        const metrics = ComputeOperatingThresholdMetrics(
            sampleEvaluatedNotes,
            80,
            n => n.SelfConfidence ?? Number.NaN
        );

        expect(metrics.Threshold).toBe(80);
        expect(metrics.Precision).toBeCloseTo(0.5, 3);
        expect(metrics.Recall).toBeCloseTo(0.5, 3);
        expect(metrics.F1).toBeCloseTo(0.5, 3);
        expect(metrics.KeptShareByLabel.durable).toBeCloseTo(0.5, 3);
        expect(metrics.KeptShareByLabel.ephemeral).toBeCloseTo(0.0, 3);
        expect(metrics.KeptShareByLabel.wrong).toBeCloseTo(1.0, 3);
        expect(metrics.KeptShareByLabel.speculative).toBe(0);
    });

    it('computes scenario-clustered bootstrap AUC confidence intervals', () => {
        const scenarios = [
            {
                ScenarioId: 's1',
                Notes: [
                    { Probability: 0.9, Positive: true },
                    { Probability: 0.2, Positive: false }
                ]
            },
            {
                ScenarioId: 's2',
                Notes: [
                    { Probability: 0.8, Positive: true },
                    { Probability: 0.1, Positive: false }
                ]
            }
        ];

        const ci = ScenarioBootstrapAuc(scenarios, 50, 42);
        expect(ci).not.toBeNull();
        expect(ci?.Low).toBeGreaterThanOrEqual(0);
        expect(ci?.High).toBeLessThanOrEqual(1);
        expect(ci?.Low).toBeLessThanOrEqual(ci?.High ?? 1);
    });

    it('computes telemetry quantiles and cost per 1k notes', () => {
        const observations: DecisionObservation[] = [
            { ScenarioId: 's1', NoteId: 'n1', Rep: 1, Outcome: 'answered', RawProbability: 0.8, ModelName: 'm', LatencyMs: 100, CostUsd: 0.001 },
            { ScenarioId: 's1', NoteId: 'n2', Rep: 1, Outcome: 'answered', RawProbability: 0.2, ModelName: 'm', LatencyMs: 200, CostUsd: 0.001 },
            { ScenarioId: 's2', NoteId: 'n3', Rep: 1, Outcome: 'answered', RawProbability: 0.9, ModelName: 'm', LatencyMs: 300, CostUsd: 0.001 }
        ];

        const tel = SummarizeTelemetry(observations);
        expect(tel.latencyP50Ms).toBe(200);
        expect(tel.costPerThousandUsd).toBeCloseTo((0.003 / 3) * 1000, 2);
    });

    it('computes repeatability agreement across repetitions', () => {
        const observations: DecisionObservation[] = [
            // Note n1: rep 1 = 0.8, rep 2 = 0.85 -> both >= 0.5 (agreement = 1.0)
            { ScenarioId: 's1', NoteId: 'n1', Rep: 1, Outcome: 'answered', RawProbability: 0.8, ModelName: 'm', LatencyMs: 100, CostUsd: 0 },
            { ScenarioId: 's1', NoteId: 'n1', Rep: 2, Outcome: 'answered', RawProbability: 0.85, ModelName: 'm', LatencyMs: 100, CostUsd: 0 },
            // Note n2: rep 1 = 0.3, rep 2 = 0.6 -> disagree across 0.5 threshold (agreement = 0.5)
            { ScenarioId: 's1', NoteId: 'n2', Rep: 1, Outcome: 'answered', RawProbability: 0.3, ModelName: 'm', LatencyMs: 100, CostUsd: 0 },
            { ScenarioId: 's1', NoteId: 'n2', Rep: 2, Outcome: 'answered', RawProbability: 0.6, ModelName: 'm', LatencyMs: 100, CostUsd: 0 }
        ];

        const agreement = ComputeRepeatabilityAgreement(observations, p => p >= 0.5);
        // Average of 1.0 and 0.5 = 0.75
        expect(agreement).toBeCloseTo(0.75, 2);
    });

    it('judges repeatability at the shipped operating point, and leaves failed or missing answers out', () => {
        const observations: DecisionObservation[] = [
            // Raw 0.80 and 0.85 straddle Jev's shipped cut (raw 0.8428): they agree at raw 0.5, not as shipped.
            { ScenarioId: 's1', NoteId: 'n1', Rep: 1, Outcome: 'answered', RawProbability: 0.8, ModelName: 'Jev', LatencyMs: 100, CostUsd: 0 },
            { ScenarioId: 's1', NoteId: 'n1', Rep: 2, Outcome: 'answered', RawProbability: 0.85, ModelName: 'Jev', LatencyMs: 100, CostUsd: 0 },
            { ScenarioId: 's1', NoteId: 'n2', Rep: 1, Outcome: 'answered', RawProbability: 0.95, ModelName: 'Jev', LatencyMs: 100, CostUsd: 0 },
            { ScenarioId: 's1', NoteId: 'n2', Rep: 2, Outcome: 'call-failed', RawProbability: null, ModelName: 'Jev', LatencyMs: 100, CostUsd: 0 }
        ];
        const shipped = ShippedVerdict({ Jev: { A: 3.6391, B: -5.7059 } });

        expect(ComputeRepeatabilityAgreement(observations, p => p >= 0.5)).toBe(1);
        expect(ComputeRepeatabilityAgreement(observations, shipped)).toBe(0.5);
        expect(shipped(0.843, 'Jev')).toBe(true);
        expect(shipped(0.842, 'Jev')).toBe(false);
        expect(shipped(0.99, 'Unfitted')).toBe(false);
    });

    it('runs full evaluation and renders markdown with NO excerpt or note content text', () => {
        const observations: DecisionObservation[] = [
            { ScenarioId: 's1', NoteId: 's1-n1', Rep: 1, Outcome: 'answered', RawProbability: 0.85, ModelName: 'model-a', LatencyMs: 150, CostUsd: 0.002 },
            { ScenarioId: 's1', NoteId: 's1-n2', Rep: 1, Outcome: 'answered', RawProbability: 0.40, ModelName: 'model-a', LatencyMs: 150, CostUsd: 0.002 },
            { ScenarioId: 's2', NoteId: 's2-n1', Rep: 1, Outcome: 'answered', RawProbability: 0.15, ModelName: 'model-a', LatencyMs: 180, CostUsd: 0.002 },
            { ScenarioId: 's2', NoteId: 's2-n2', Rep: 1, Outcome: 'answered', RawProbability: 0.75, ModelName: 'model-a', LatencyMs: 180, CostUsd: 0.002 }
        ];

        const report = EvaluateMemoryGateMeasurement(sampleEvaluatedNotes, observations, 1);
        expect(report.NoteCount).toBe(4);
        expect(report.Models).toContain('model-a');
        expect(report.FittedPlattByModel['model-a']).toBeDefined();

        const md = RenderMeasurementReportMarkdown(report);
        expect(md).toContain('# Memory Note Decision Gate Measurement Report');
        expect(md).toContain('## 1. Executive Summary: AUC Comparison');
        expect(md).toContain('model-a');

        // CRITICAL SPEC REQUIREMENT: Report must contain NO scenario excerpt or note text
        expect(md).not.toContain('Prefers TypeScript');
        expect(md).not.toContain('Project deadline is Friday');
        expect(md).not.toContain('[user]:');
        expect(md).not.toContain('[assistant]:');
    });

    it('writes report.json and report.md outside repo and refuses repo path', () => {
        const fakeRepoRoot = HERE; // inside this repository's working tree
        const sampleReport = EvaluateMemoryGateMeasurement(sampleEvaluatedNotes, [], 1);

        expect(() =>
            WriteMeasurementReportFiles(join(fakeRepoRoot, 'results'), sampleReport, [fakeRepoRoot])
        ).toThrow(OutputInsideRepoError);

        const outsideDir = join(tmpdir(), `mj-test-measurement-${Date.now()}`);
        try {
            const { jsonPath, mdPath } = WriteMeasurementReportFiles(outsideDir, sampleReport, ['/repo']);
            expect(existsSync(jsonPath)).toBe(true);
            expect(existsSync(mdPath)).toBe(true);

            const json = JSON.parse(readFileSync(jsonPath, 'utf-8'));
            expect(json.NoteCount).toBe(4);
        } finally {
            rmSync(outsideDir, { recursive: true, force: true });
        }
    });

    describe('failed and missing answers', () => {
        const scenario: Pick<CorpusScenario, 'Id' | 'Notes'> = {
            Id: 's1',
            Notes: ['s1-n1', 's1-n2', 's1-n3'].map(NoteId => ({ NoteId, type: 'Preference', content: 'x', SelfConfidence: 90 }))
        };
        const decision = { ModelName: 'Jev', LatencyMs: 120, CostUsd: 0.003, PromptRunId: 'p1' };

        it('records a failed call as failed for every note, never as a probability', () => {
            const observations = ObservationsForDecision(scenario, 1, { ...decision, Success: false, Answers: {} });
            expect(observations.map(o => [o.NoteId, o.Outcome, o.RawProbability])).toEqual([
                ['s1-n1', 'call-failed', null], ['s1-n2', 'call-failed', null], ['s1-n3', 'call-failed', null]
            ]);
            expect(observations[0].CostUsd).toBeCloseTo(0.001, 10);
        });

        it('records a missing, non-Likelihood or non-numeric answer as no answer', () => {
            const observations = ObservationsForDecision(scenario, 2, {
                ...decision,
                Success: true,
                Answers: {
                    n1: { Kind: 'Likelihood', Probability: 0.7 },
                    n2: { Kind: 'Likelihood', Probability: Number.NaN }
                }
            });
            expect(observations.map(o => [o.Outcome, o.RawProbability])).toEqual([['answered', 0.7], ['no-answer', null], ['no-answer', null]]);
        });

        it("scores each labelled note on its first usable answer, and counts the rest instead of scoring them", () => {
            const scenarios: Array<Pick<CorpusScenario, 'Id' | 'Notes'>> = [{
                Id: 's1',
                Notes: ['s1-n1', 's1-n2', 's1-n3', 's1-n4'].map((NoteId, i) => ({ NoteId, type: 'Preference', content: 'x', SelfConfidence: 60 + i }))
            }];
            const labels = new Map<string, CorpusLabel>([['s1-n1', 'durable'], ['s1-n2', 'ephemeral'], ['s1-n3', 'wrong']]);
            const observations: DecisionObservation[] = [
                { ScenarioId: 's1', NoteId: 's1-n1', Rep: 2, Outcome: 'answered', RawProbability: 0.9, ModelName: 'Jev', LatencyMs: 1, CostUsd: 0 },
                { ScenarioId: 's1', NoteId: 's1-n1', Rep: 1, Outcome: 'call-failed', RawProbability: null, ModelName: 'Jev', LatencyMs: 1, CostUsd: 0 },
                { ScenarioId: 's1', NoteId: 's1-n2', Rep: 1, Outcome: 'no-answer', RawProbability: null, ModelName: 'Jev', LatencyMs: 1, CostUsd: 0 },
                { ScenarioId: 's1', NoteId: 's1-n3', Rep: 1, Outcome: 'answered', RawProbability: 0.2, ModelName: 'Jev', LatencyMs: 1, CostUsd: 0 },
                { ScenarioId: 's1', NoteId: 's1-n4', Rep: 1, Outcome: 'answered', RawProbability: 0.4, ModelName: 'Jev', LatencyMs: 1, CostUsd: 0 }
            ];
            const set = BuildEvaluatedNotes(scenarios, labels, observations);

            // n1: rep 1 failed, so rep 2 scores it. n2: never answered. n4: no label, so not taken for a wrong note.
            expect(set.Notes.map(n => [n.NoteId, n.Label, n.DecisionRawProbability])).toEqual([['s1-n1', 'durable', 0.9], ['s1-n3', 'wrong', 0.2]]);
            expect(set.UnscoredNotes).toBe(1);
            expect(set.UnlabelledNotes).toBe(1);

            const report = EvaluateMemoryGateMeasurement(set.Notes, observations, 2, set);
            expect(report.Exclusions).toEqual({ FailedCalls: 1, NoAnswer: 1, UnscoredNotes: 1, UnlabelledNotes: 1, SelfScoreMissing: 0 });
            expect(report.NoteCount).toBe(2);
            expect(RenderMeasurementReportMarkdown(report)).toContain('**Failed decision calls:** 1');
        });

        it('leaves a note with no self-score out of the self-report arm only, where a 50 used to enter it', () => {
            const unscoredBySelf: EvaluatedNote = { ...sampleEvaluatedNotes[0], NoteId: 's1-n9', SelfConfidence: null };
            const withMissing = EvaluateMemoryGateMeasurement([...sampleEvaluatedNotes, unscoredBySelf], [], 1);
            const asFifty = EvaluateMemoryGateMeasurement([...sampleEvaluatedNotes, { ...unscoredBySelf, SelfConfidence: 50 }], [], 1);
            const without = EvaluateMemoryGateMeasurement(sampleEvaluatedNotes, [], 1);

            expect(withMissing.SelfConfidenceArm).toEqual(without.SelfConfidenceArm);
            expect(asFifty.SelfConfidenceArm).not.toEqual(without.SelfConfidenceArm);
            // The decision arms still score it.
            expect(withMissing.NoteCount).toBe(sampleEvaluatedNotes.length + 1);
            expect(withMissing.Exclusions.SelfScoreMissing).toBe(1);
            expect(RenderMeasurementReportMarkdown(withMissing)).toContain('**Notes left out of the self-report arm only, no self-score:** 1');
        });

        it('leaves a failed note out of the fit and the sweeps, where a raw 0.5 used to enter them', () => {
            const answered: DecisionObservation[] = sampleEvaluatedNotes.map(n => (
                { ScenarioId: n.ScenarioId, NoteId: n.NoteId, Rep: 1, Outcome: 'answered', RawProbability: n.DecisionRawProbability, ModelName: 'model-a', LatencyMs: 1, CostUsd: 0 }
            ));
            const scenarios: Array<Pick<CorpusScenario, 'Id' | 'Notes'>> = [
                { Id: 's1', Notes: [...sampleEvaluatedNotes.filter(n => n.ScenarioId === 's1'), { ...sampleEvaluatedNotes[0], NoteId: 's1-n9' }]
                    .map(n => ({ NoteId: n.NoteId, type: 'Preference', content: 'x', SelfConfidence: n.SelfConfidence })) },
                { Id: 's2', Notes: sampleEvaluatedNotes.filter(n => n.ScenarioId === 's2').map(n => ({ NoteId: n.NoteId, type: 'Preference', content: 'x', SelfConfidence: n.SelfConfidence })) }
            ];
            const labels = new Map<string, CorpusLabel>([...sampleEvaluatedNotes.map(n => [n.NoteId, n.Label] as const), ['s1-n9', 'durable']]);
            const failed: DecisionObservation = { ScenarioId: 's1', NoteId: 's1-n9', Rep: 1, Outcome: 'no-answer', RawProbability: null, ModelName: 'model-a', LatencyMs: 1, CostUsd: 0 };

            const withFailure = BuildEvaluatedNotes(scenarios, labels, [...answered, failed]);
            const without = EvaluateMemoryGateMeasurement(sampleEvaluatedNotes, answered, 1);
            const withReport = EvaluateMemoryGateMeasurement(withFailure.Notes, [...answered, failed], 1, withFailure);

            expect(withReport.FittedPlattByModel).toEqual(without.FittedPlattByModel);
            expect(withReport.DecisionRawArm).toEqual(without.DecisionRawArm);
            expect(withReport.Exclusions.UnscoredNotes).toBe(1);
        });

        it('records which exact model answered, and reads it back', () => {
            const observations = ObservationsForDecision(scenario, 1, {
                ...decision, ResolvedModel: 'typesafe/jev-1.13-20260917', Success: true, Answers: { n1: { Kind: 'Likelihood', Probability: 0.7 } }
            });
            expect(observations.map(o => o.ResolvedModel)).toEqual(Array(3).fill('typesafe/jev-1.13-20260917'));
            expect(ParseDecisionObservations(observations.map(SerializeObservation).join('\n')).Observations).toEqual(observations);
            // An observation recorded before the field existed still reads, with no resolved model.
            const older = ParseDecisionObservations(JSON.stringify({ ...observations[0], ResolvedModel: undefined })).Observations;
            expect(older.map(o => o.ResolvedModel)).toEqual([undefined]);
        });

        it('writes and reads observations back, skipping and counting a line that is not one', () => {
            const observations = ObservationsForDecision(scenario, 1, { ...decision, Success: true, Answers: { n1: { Kind: 'Likelihood', Probability: 0.7 } } });
            const text = [...observations.map(SerializeObservation), 'not json', JSON.stringify({ NoteId: 'x' })].join('\n');
            const parsed = ParseDecisionObservations(text);
            expect(parsed.Observations).toEqual(observations);
            expect(parsed.Skipped).toBe(2);
        });
    });

    describe('out-of-fold calibration', () => {
        it('calibrates each scenario on a fit that never saw it, with the shared Platt helpers', () => {
            const points = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e'].map((ScenarioId, i) => ({
                ScenarioId,
                Point: { Probability: i % 2 === 0 ? 0.8 : 0.3, Positive: i % 2 === 0 }
            }));
            const calibrated = OutOfFoldPlattByScenario(points, 5, 7);
            expect(calibrated).not.toBeNull();
            // Both notes of a scenario with the same raw probability get the same value: one fold, one fit.
            const byScenario = new Map<string, number[]>();
            points.forEach((p, i) => { if (p.Point.Probability === 0.8) byScenario.set(p.ScenarioId, [...(byScenario.get(p.ScenarioId) ?? []), calibrated?.[i] ?? -1]); });
            expect([...byScenario.values()].every(values => values.length === 1)).toBe(true);
        });

        it('reports no calibrated arm with too few scenarios, rather than raw probabilities as calibrated', () => {
            const oneScenario = sampleEvaluatedNotes.map(n => ({ ...n, ScenarioId: 's1' }));
            expect(OutOfFoldPlattByScenario(oneScenario.map(n => ({ ScenarioId: n.ScenarioId, Point: { Probability: n.DecisionRawProbability, Positive: n.IsDurable } })))).toBeNull();
            const report = EvaluateMemoryGateMeasurement(oneScenario, [], 1);
            expect(report.DecisionCalibratedArm).toEqual({ Name: 'decision-calibrated', Auc: null, AucBootstrapCi: null, OperatingPoints: [] });
            expect(RenderMeasurementReportMarkdown(report)).toContain('_Too few scenarios to calibrate out of fold._');
        });
    });

    describe('CLI argument parsing and dry run', () => {
        it('parses corpus generator CLI arguments', () => {
            const args = ParseCorpusArgs([
                '--out', '/tmp/corpus',
                '--scenarios', '40',
                '--model', 'gpt-4o',
                '--seed', '12',
                '--dry-run'
            ]);
            expect(args.OutDir).toBe('/tmp/corpus');
            expect(args.Scenarios).toBe(40);
            expect(args.Model).toBe('gpt-4o');
            expect(args.Seed).toBe(12);
            expect(args.DryRun).toBe(true);
        });

        it('parses measurement CLI arguments', () => {
            const args = ParseMeasurementArgs([
                '--corpus', '/tmp/corpus',
                '--out', '/tmp/measurement',
                '--reps', '3',
                '--decision-prompt', 'Custom Decision',
                '--decision-model', 'claude-3-7-sonnet',
                '--rescore', '/tmp/measurement/observations.jsonl',
                '--dry-run'
            ]);
            expect(args.CorpusDir).toBe('/tmp/corpus');
            expect(args.OutDir).toBe('/tmp/measurement');
            expect(args.Reps).toBe(3);
            expect(args.DecisionPrompt).toBe('Custom Decision');
            expect(args.DecisionModel).toBe('claude-3-7-sonnet');
            expect(args.Rescore).toBe('/tmp/measurement/observations.jsonl');
            expect(args.DryRun).toBe(true);
        });
    });
});
