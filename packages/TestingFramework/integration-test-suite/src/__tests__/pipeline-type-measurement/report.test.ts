/**
 * report.test.ts — the report wires every metric through, carries the notes a reader needs, holds
 * record IDs only, and renders to markdown.
 */
import { describe, expect, it } from 'vitest';
import { BuildMeasurementReport } from '../../pipeline-type-measurement/report';
import type { ReportInput } from '../../pipeline-type-measurement/report';
import { FormatCost, FormatPercent, RenderReportMarkdown, TableCellText } from '../../pipeline-type-measurement/render';
import type { MeasurementOptions } from '../../pipeline-type-measurement/types';
import { COSTS, PREDICTIONS, RunCost, SAMPLE } from './fixtures';

const OPTIONS: MeasurementOptions = {
    EntityName: 'MJ: Actions', TextFields: ['Name', 'Description'], LabelField: 'Category', Values: ['A', 'B'],
    SampleSize: 4, Reps: 2, Seed: 7, BatchSize: 100, LLMPromptName: 'LLM prompt', DecisionPromptName: 'Default Decision',
    OutDir: '/tmp/out', DryRun: false,
};

const INPUT: ReportInput = {
    Options: OPTIONS,
    LabelColumn: 'Category',
    Sample: SAMPLE,
    Descriptions: { Descriptions: { A: 'A', B: 'About B' }, FallbackValues: ['A'] },
    Predictions: PREDICTIONS,
    Timings: [
        { Type: 'LLM', Rep: 1, RecordCount: 4, WallMs: 4000 }, { Type: 'LLM', Rep: 2, RecordCount: 4, WallMs: 4000 },
        { Type: 'Decision', Rep: 1, RecordCount: 4, WallMs: 400 }, { Type: 'Decision', Rep: 2, RecordCount: 4, WallMs: 400 },
    ],
    Costs: COSTS,
    GeneratedAt: '2026-09-29T00:00:00.000Z',
};

describe('BuildMeasurementReport', () => {
    const report = BuildMeasurementReport(INPUT);

    it('wires every metric through', () => {
        expect(report.Sample).toEqual({ Size: 4, PerValue: { A: 2, B: 2 } });
        expect(report.Types.LLM.Accuracy.Accuracy).toBe(0.75);
        expect(report.Types.Decision.Accuracy.Accuracy).toBe(0.625);
        expect(report.Types.LLM.Repeatability).toBe(0.5);
        expect(report.Types.Decision.Repeatability).toBe(0.25);
        expect(report.Agreement.Mean).toBe(0.5);
        expect(report.Calibration.ECE).toBeCloseTo(0.3125, 10);
        expect(report.Escalation).toHaveLength(10);
        // 8 s over 8 LLM answers = 1,000 s per 1,000; 0.08 USD over 8 = 10 per 1,000.
        expect(report.Types.LLM.WallTime.MsPer1000).toBe(1_000_000);
        expect(report.Types.LLM.Cost.CostPer1000).toBeCloseTo(10, 10);
        expect(report.Types.Decision.Cost.CostPer1000).toBeCloseTo(1, 10);
        expect(report.Types.LLM.Latency).toEqual({ Known: 8, P50Ms: 1000, P90Ms: 1000 });
    });

    it('notes the fallback descriptions, how each type gets the descriptions, and the missing-#4880 cost caveat', () => {
        const notes = report.Notes.join('\n');
        expect(report.FallbackDescriptionValues).toEqual(['A']);
        expect(notes).toMatch(/No source description for: A\./);
        expect(notes).toMatch(/Decision gets them as its Choice question's option descriptions/);
        expect(notes).toMatch(/constraint block .* lists each allowed value with its description/);
        expect(notes).toMatch(/only if that template renders \{\{ constraints \}\}/);
        expect(notes).not.toMatch(/LLM measurement prompt lists the same descriptions/);
        expect(notes).toMatch(/TotalCost.*falling back to Cost/);
        expect(notes).toMatch(/#4880/);
        expect(notes).not.toMatch(/lower bound/);
    });

    it('says a cost is a lower bound when some runs have none', () => {
        const partial = new Map(COSTS);
        partial.set('LLM-1-r1', RunCost('LLM-1-r1', null));
        const notes = BuildMeasurementReport({ ...INPUT, Costs: partial }).Notes.join('\n');
        expect(notes).toMatch(/LLM: 7 of 8 answers have a prompt run with a known cost/);
    });

    it('records the value descriptions both types saw', () => {
        expect(report.Setup.ValueDescriptions).toEqual({ A: 'A', B: 'About B' });
    });

    it('holds one ID-only row per answer', () => {
        expect(report.Records).toHaveLength(16);
        for (const row of report.Records) {
            expect(Object.keys(row).sort()).toEqual(
                ['Confidence', 'Correct', 'Cost', 'Label', 'LatencyMs', 'Predicted', 'PromptRunID', 'RecordID', 'Rep', 'Succeeded', 'Type']
            );
        }
        expect(report.Records.find((r) => r.Type === 'LLM' && r.Rep === 2 && r.RecordID === 'r4')).toMatchObject({ Succeeded: false, Predicted: null, Correct: false });
    });
});

describe('RenderReportMarkdown', () => {
    const markdown = RenderReportMarkdown(BuildMeasurementReport(INPUT));

    it('renders every section', () => {
        for (const heading of ['# Feature Pipeline type measurement: MJ: Actions.Category', '## Value descriptions', '## Results', '## Recall per value', '## Agreement between the types', '## Decision calibration', '## Escalation simulation (plan 5.4)', '## Notes']) {
            expect(markdown).toContain(heading);
        }
    });

    it('renders the hand-computed numbers', () => {
        expect(markdown).toContain('| Repeatability (rep 1 against rep 2) | 50.0% | 25.0% |');
        expect(markdown).toContain('| 0.60 | 87.5% | 37.5% | 4.750000 USD |');
        expect(markdown).toContain('ECE 0.3125 over 8 answers with a confidence');
    });

    it('lists each value\'s description, safe for a table cell', () => {
        expect(markdown).toContain('| A | A |');
        expect(markdown).toContain('| B | About B |');
        expect(TableCellText('Reads | writes\n  files')).toBe('Reads \\| writes files');
    });

    it('formats missing numbers as n/a', () => {
        expect(FormatPercent(null)).toBe('n/a');
        expect(FormatCost(null, ['USD'])).toBe('n/a');
        expect(FormatCost(1.5, ['USD', 'EUR'])).toBe('1.500000 (mixed: USD, EUR)');
    });
});
