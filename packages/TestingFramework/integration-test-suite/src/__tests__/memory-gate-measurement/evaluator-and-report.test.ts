import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { OutputInsideRepoError } from '@memberjunction/testing-engine';
import {
    ComputeOperatingThresholdMetrics,
    ComputeRepeatabilityAgreement,
    EvaluateMemoryGateMeasurement,
    ScenarioBootstrapAuc,
    SummarizeTelemetry,
    type EvaluatedNote
} from '../../memory-gate-measurement/evaluator';
import {
    RenderMeasurementReportMarkdown,
    WriteMeasurementReportFiles
} from '../../memory-gate-measurement/report-builder';
import type { DecisionObservation } from '../../memory-gate-measurement/corpus-types';
import { ParseArgs as ParseCorpusArgs } from '../../../rigs/generate-memory-note-corpus';
import { ParseArgs as ParseMeasurementArgs } from '../../../rigs/memory-note-gate-measurement';

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
            n => n.SelfConfidence
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
            { ScenarioId: 's1', NoteId: 'n1', Rep: 1, RawProbability: 0.8, ModelName: 'm', LatencyMs: 100, CostUsd: 0.001 },
            { ScenarioId: 's1', NoteId: 'n2', Rep: 1, RawProbability: 0.2, ModelName: 'm', LatencyMs: 200, CostUsd: 0.001 },
            { ScenarioId: 's2', NoteId: 'n3', Rep: 1, RawProbability: 0.9, ModelName: 'm', LatencyMs: 300, CostUsd: 0.001 }
        ];

        const tel = SummarizeTelemetry(observations);
        expect(tel.latencyP50Ms).toBe(200);
        expect(tel.costPerThousandUsd).toBeCloseTo((0.003 / 3) * 1000, 2);
    });

    it('computes repeatability agreement across repetitions', () => {
        const observations: DecisionObservation[] = [
            // Note n1: rep 1 = 0.8, rep 2 = 0.85 -> both >= 0.5 (agreement = 1.0)
            { ScenarioId: 's1', NoteId: 'n1', Rep: 1, RawProbability: 0.8, ModelName: 'm', LatencyMs: 100, CostUsd: 0 },
            { ScenarioId: 's1', NoteId: 'n1', Rep: 2, RawProbability: 0.85, ModelName: 'm', LatencyMs: 100, CostUsd: 0 },
            // Note n2: rep 1 = 0.3, rep 2 = 0.6 -> disagree across 0.5 threshold (agreement = 0.5)
            { ScenarioId: 's1', NoteId: 'n2', Rep: 1, RawProbability: 0.3, ModelName: 'm', LatencyMs: 100, CostUsd: 0 },
            { ScenarioId: 's1', NoteId: 'n2', Rep: 2, RawProbability: 0.6, ModelName: 'm', LatencyMs: 100, CostUsd: 0 }
        ];

        const agreement = ComputeRepeatabilityAgreement(observations, 0.5);
        // Average of 1.0 and 0.5 = 0.75
        expect(agreement).toBeCloseTo(0.75, 2);
    });

    it('runs full evaluation and renders markdown with NO excerpt or note content text', () => {
        const observations: DecisionObservation[] = [
            { ScenarioId: 's1', NoteId: 's1-n1', Rep: 1, RawProbability: 0.85, ModelName: 'model-a', LatencyMs: 150, CostUsd: 0.002 },
            { ScenarioId: 's1', NoteId: 's1-n2', Rep: 1, RawProbability: 0.40, ModelName: 'model-a', LatencyMs: 150, CostUsd: 0.002 },
            { ScenarioId: 's2', NoteId: 's2-n1', Rep: 1, RawProbability: 0.15, ModelName: 'model-a', LatencyMs: 180, CostUsd: 0.002 },
            { ScenarioId: 's2', NoteId: 's2-n2', Rep: 1, RawProbability: 0.75, ModelName: 'model-a', LatencyMs: 180, CostUsd: 0.002 }
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
        const fakeRepoRoot = '/Users/colinbrockman/Projects/MJ-memory-gate';
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
                '--dry-run'
            ]);
            expect(args.CorpusDir).toBe('/tmp/corpus');
            expect(args.OutDir).toBe('/tmp/measurement');
            expect(args.Reps).toBe(3);
            expect(args.DecisionPrompt).toBe('Custom Decision');
            expect(args.DecisionModel).toBe('claude-3-7-sonnet');
            expect(args.DryRun).toBe(true);
        });
    });
});
