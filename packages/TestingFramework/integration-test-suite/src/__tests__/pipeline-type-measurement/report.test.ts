/**
 * report.test.ts — the report wires every metric through, carries the notes a reader needs, holds
 * record IDs only, and renders to markdown.
 */
import { describe, expect, it } from 'vitest';
import { BuildMeasurementReport } from '../../pipeline-type-measurement/report';
import type { ReportInput } from '../../pipeline-type-measurement/report';
import { FormatCost, FormatPercent, RenderReportMarkdown, TableCellText } from '../../pipeline-type-measurement/render';
import type { MeasurementOptions, PromptRunCost } from '../../pipeline-type-measurement/types';
import { COSTS, EXPECTED_MODELS, PREDICTIONS, RunCost, SAMPLE } from './fixtures';

const OPTIONS: MeasurementOptions = {
    EntityName: 'MJ: Actions', TextFields: ['Name', 'Description'], LabelField: 'Category', Values: ['A', 'B'],
    SampleSize: 4, Reps: 2, Seed: 7, BatchSize: 100, LLMPromptName: 'LLM prompt', DecisionPromptName: 'Default Decision',
    LLMModelName: null, DecisionModelName: 'Jev', RequireModel: false, AllowDatabase: null, OutDir: '/tmp/out', DryRun: false,
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
    ExpectedModels: EXPECTED_MODELS,
    CandidateCount: 4,
    GeneratedAt: '2026-09-29T00:00:00.000Z',
};

/** The costs with some Decision runs answered by `LLM Decision` instead of Jev. */
function decisionAnsweredBy(model: string, runIDs: readonly string[]): Map<string, PromptRunCost> {
    const costs = new Map(COSTS);
    for (const id of runIDs) {
        costs.set(id, RunCost(id, 0.02, 500, model));
    }
    return costs;
}

describe('BuildMeasurementReport', () => {
    const report = BuildMeasurementReport(INPUT);

    it('wires every metric through', () => {
        expect(report.Sample).toEqual({ Size: 4, PerValue: { A: 2, B: 2 }, Candidates: 4, Balanced: false });
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

    it('says the sample is the population when it took every candidate', () => {
        expect(report.Sample).toMatchObject({ Candidates: 4, Balanced: false });
        expect(report.Notes.join('\n')).toMatch(/every one of the 4 candidate records/);
        expect(RenderReportMarkdown(report)).toContain('| Accuracy against labels | 75.0% (95% CI');
    });

    it('says accuracy is over a balanced sample when the sample is smaller than the candidates', () => {
        const balanced = BuildMeasurementReport({ ...INPUT, CandidateCount: 10 });
        expect(balanced.Sample).toMatchObject({ Size: 4, Candidates: 10, Balanced: true });
        expect(balanced.Notes.join('\n')).toMatch(/4 of 10 candidate records, drawn as evenly per value as the data allows, so accuracy is over that balanced mix/);
        const markdown = RenderReportMarkdown(balanced);
        expect(markdown).toContain('| Accuracy against labels (sample balanced per value) | 75.0% (95% CI');
        expect(markdown).toContain('from 10 candidates, balanced per value');
    });

    it('records the value descriptions both types saw', () => {
        expect(report.Setup.ValueDescriptions).toEqual({ A: 'A', B: 'About B' });
    });

    it('records which model answered, per arm and per record, and warns of nothing when each arm got its model', () => {
        expect(report.Types.LLM.Models).toMatchObject({ Answered: [{ Model: 'Chat Model', Answers: 8 }], AnswersWithRun: 8, UnexpectedAnswers: 0 });
        expect(report.Types.Decision.Models).toMatchObject({ Expected: EXPECTED_MODELS.Decision, Answered: [{ Model: 'Jev', Answers: 8 }], UnexpectedAnswers: 0 });
        expect(report.Records.filter((r) => r.Type === 'Decision').every((r) => r.Model === 'Jev')).toBe(true);
        expect(report.Warnings).toEqual([]);
        expect(report.Notes.join('\n')).toMatch(/The rig does not pin models/);
    });

    it('warns when the Decision arm was answered by another model', () => {
        const failedOver = BuildMeasurementReport({ ...INPUT, Costs: decisionAnsweredBy('LLM Decision', ['Decision-1-r1', 'Decision-2-r3']) });
        expect(failedOver.Types.Decision.Models).toMatchObject({ Answered: [{ Model: 'Jev', Answers: 6 }, { Model: 'LLM Decision', Answers: 2 }], UnexpectedAnswers: 2 });
        expect(failedOver.Warnings).toEqual([
            'The Decision arm was meant to measure Jev (from --decision-model), but 2 of its 8 answers came from another model: LLM Decision (2). ' +
            'Read the Decision column as that model\'s results, not Jev\'s.',
        ]);
        expect(failedOver.Records.find((r) => r.Type === 'Decision' && r.Rep === 1 && r.RecordID === 'r1')?.Model).toBe('LLM Decision');
    });

    it('holds one ID-only row per answer', () => {
        expect(report.Records).toHaveLength(16);
        for (const row of report.Records) {
            expect(Object.keys(row).sort()).toEqual(
                ['Confidence', 'Correct', 'Cost', 'Label', 'LatencyMs', 'Model', 'Predicted', 'PromptRunID', 'RecordID', 'Rep', 'Succeeded', 'Type']
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

    it('names the expected and answering models', () => {
        expect(markdown).toContain('| Decision model expected | Jev (from --decision-model) |');
        expect(markdown).toContain('| LLM model expected | Chat Model (from prompt \'LLM prompt\') |');
        expect(markdown).toContain('| Answered by (answers) | Chat Model (8) | Jev (8) |');
        expect(markdown).not.toContain('**Warning:**');
    });

    it('leads with the warning when an arm was answered by another model', () => {
        const allLLMDecision = PREDICTIONS.filter((p) => p.Type === 'Decision').map((p) => p.PromptRunID ?? '');
        const lines = RenderReportMarkdown(BuildMeasurementReport({ ...INPUT, Costs: decisionAnsweredBy('LLM Decision', allLLMDecision) })).split('\n\n');
        expect(lines[2]).toMatch(/^> \*\*Warning:\*\* The Decision arm was meant to measure Jev .* 8 of its 8 answers came from another model: LLM Decision \(8\)/);
    });

    it('lists each value\'s description, safe for a table cell', () => {
        expect(markdown).toContain('| A | A |');
        expect(markdown).toContain('| B | About B |');
        expect(TableCellText('Reads | writes\n  files')).toBe('Reads \\| writes files');
        // A backslash is escaped before the pipe, so `\|` in the text cannot un-escape the pipe.
        expect(TableCellText('C:\\temp\\| x')).toBe('C:\\\\temp\\\\\\| x');
    });

    it('formats missing numbers as n/a', () => {
        expect(FormatPercent(null)).toBe('n/a');
        expect(FormatCost(null, ['USD'])).toBe('n/a');
        expect(FormatCost(1.5, ['USD', 'EUR'])).toBe('1.500000 (mixed: USD, EUR)');
    });
});
