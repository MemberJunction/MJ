/**
 * run.test.ts — the measurement's flow against a mock backend: the dry run plans and makes no call,
 * the repo-path refusal comes before anything else, and a full run writes a report that holds no
 * record text even though the backend's records have plenty.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlanRuns, RunMeasurement } from '../../pipeline-type-measurement/run';
import type { BatchProcessor, MeasurementBackend, MeasurementIO } from '../../pipeline-type-measurement/run';
import type { MeasurementReport } from '../../pipeline-type-measurement/report';
import type { MeasuredRecordResult, MeasurementOptions, MeasurementSpec, PromptRunCost } from '../../pipeline-type-measurement/types';

/** The mock database: each record's label and its text, which must never reach the report. */
const ROWS = Array.from({ length: 8 }, (_, i) => ({
    RecordID: `rec-${i}`,
    Label: i % 2 === 0 ? 'A' : 'B',
    Name: `SECRET-NAME-${i}`,
    Description: `SECRET-DESCRIPTION-${i}`,
}));

const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function options(overrides: Partial<MeasurementOptions> = {}): MeasurementOptions {
    const outDir = mkdtempSync(join(tmpdir(), 'pipeline-measure-run-'));
    made.push(outDir);
    return {
        EntityName: 'MJ: Actions', TextFields: ['Name', 'Description'], LabelField: 'Category', Values: ['A', 'B'],
        SampleSize: 8, Reps: 2, Seed: 7, BatchSize: 3, LLMPromptName: 'LLM prompt', DecisionPromptName: 'Default Decision',
        OutDir: join(outDir, 'report'), DryRun: false, ...overrides,
    };
}

let runCounter = 0;

/** Answers every record with its label; Decision with confidence 0.9. The prompt data would hold the text; the answer never does. */
function answer(spec: MeasurementSpec, recordID: string): MeasuredRecordResult {
    const row = ROWS.find((r) => r.RecordID === recordID);
    const type = spec.PipelineType ?? 'LLM';
    runCounter += 1;
    return {
        Status: 'Succeeded',
        ResultPayload: { Category: row?.Label },
        AIPromptRunID: `${type}-${recordID}-run-${runCounter}`,
        ...(type === 'Decision' ? { Confidence: { Category: 0.9 } } : {}),
    };
}

function mockBackend(processBatch?: (spec: MeasurementSpec, ids: readonly string[]) => Promise<Map<string, MeasuredRecordResult>>) {
    const specs: MeasurementSpec[] = [];
    const backend = {
        LoadCandidates: vi.fn<MeasurementBackend['LoadCandidates']>(async () => ({ LabelColumn: 'Category', Records: ROWS.map((r) => ({ RecordID: r.RecordID, Label: r.Label })) })),
        LoadDescriptionSources: vi.fn<MeasurementBackend['LoadDescriptionSources']>(async () => ({ A: 'About A' })),
        ResolvePromptIDs: vi.fn<MeasurementBackend['ResolvePromptIDs']>(async () => ({ LLM: 'llm-id', Decision: 'decision-id' })),
        CreateBatchProcessor: vi.fn<MeasurementBackend['CreateBatchProcessor']>((_type, spec): BatchProcessor => {
            specs.push(spec);
            const run = processBatch ?? (async (s: MeasurementSpec, ids: readonly string[]) => new Map(ids.map((id) => [id, answer(s, id)])));
            return { ProcessBatch: (ids) => run(spec, ids) };
        }),
        ReadPromptRunCosts: vi.fn<MeasurementBackend['ReadPromptRunCosts']>(async (ids) =>
            new Map(ids.map((id): [string, PromptRunCost] => [id, { PromptRunID: id, Cost: 0.001, Currency: 'USD', ExecutionTimeMS: 50, Finished: true }]))
        ),
    } satisfies MeasurementBackend;
    return { backend, specs };
}

function mockIO() {
    let clock = 0;
    const lines: string[] = [];
    const files = new Map<string, string>();
    const io: MeasurementIO = {
        Log: (line) => lines.push(line),
        Now: () => (clock += 10),
        Timestamp: () => '2026-09-29T00:00:00.000Z',
        WriteFile: (path, content) => files.set(path, content),
    };
    return { io, lines, files };
}

describe('PlanRuns', () => {
    it('runs both types every rep, alternating which goes first, in batches', () => {
        const plan = PlanRuns(['a', 'b', 'c', 'd', 'e'], 2, 2);
        expect(plan.map((run) => `${run.Rep}:${run.Type}`)).toEqual(['1:LLM', '1:Decision', '2:Decision', '2:LLM']);
        expect(plan[0].Batches).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    });
});

describe('RunMeasurement --dry-run', () => {
    it('prints the sample, the per-value counts and the planned calls, and makes none', async () => {
        const { backend } = mockBackend();
        const { io, lines, files } = mockIO();
        const outcome = await RunMeasurement(options({ DryRun: true }), backend, io);

        expect(outcome.DryRun).toBe(true);
        expect(lines[0]).toBe('Sample: 8 of 8 requested (A 4, B 4), from 8 candidate records.');
        expect(lines[1]).toBe('Descriptions: no source description for B; the value is used.');
        expect(lines.slice(2, 5)).toEqual([
            'Value descriptions (Decision: Choice option descriptions; LLM: listed in its constraint block and in valueDescriptions):',
            '  A: About A',
            '  B: B',
        ]);
        expect(lines[5]).toBe('Planned calls: 2 rep(s) x 2 types x 8 records = 32 prompt runs, in 12 ProcessBatch calls of up to 3 records.');
        expect(lines.at(-1)).toBe('--dry-run: no prompt was run.');
        expect(backend.CreateBatchProcessor).not.toHaveBeenCalled();
        expect(backend.ReadPromptRunCosts).not.toHaveBeenCalled();
        expect(files.size).toBe(0);
    });

    it('refuses an output directory inside this repository before loading anything', async () => {
        const { backend } = mockBackend();
        const insideRepo = join(dirname(fileURLToPath(import.meta.url)), 'report-out');
        await expect(RunMeasurement(options({ DryRun: true, OutDir: insideRepo }), backend, mockIO().io)).rejects.toThrow(/inside the git working tree/);
        expect(backend.LoadCandidates).not.toHaveBeenCalled();
    });
});

describe('RunMeasurement', () => {
    it('runs both specs over the sample and writes report.json and report.md', async () => {
        const { backend, specs } = mockBackend();
        const { io, files } = mockIO();
        const opts = options();
        const outcome = await RunMeasurement(opts, backend, io);

        expect(specs.map((s) => s.PipelineType ?? 'LLM')).toEqual(['LLM', 'Decision', 'Decision', 'LLM']);
        expect(backend.ReadPromptRunCosts.mock.calls[0][0]).toHaveLength(32);
        expect([...files.keys()]).toEqual([join(opts.OutDir, 'report.json'), join(opts.OutDir, 'report.md')]);

        const report = JSON.parse(files.get(join(opts.OutDir, 'report.json')) ?? '{}') as MeasurementReport;
        expect(report.Records).toHaveLength(32);
        expect(report.Types.LLM.Accuracy.Accuracy).toBe(1);
        expect(report.Types.Decision.Accuracy.Accuracy).toBe(1);
        // 3 batches of 10 ms (the mock clock) per type per rep: 60 ms over 16 answers.
        expect(report.Types.LLM.WallTime).toEqual({ Records: 16, TotalWallMs: 60, MsPer1000: 3750 });
        expect(report.Types.Decision.Cost.CostPer1000).toBeCloseTo(1, 10);
        expect(outcome.DryRun).toBe(false);
    });

    it('writes no record text to either file', async () => {
        const { backend } = mockBackend();
        const { io, files } = mockIO();
        await RunMeasurement(options(), backend, io);
        const written = [...files.values()].join('\n');
        expect(written).not.toMatch(/SECRET/);
        for (const row of ROWS) {
            expect(written).toContain(row.RecordID);
        }
    });

    it('fails the records of a batch that throws, logs it, and carries on', async () => {
        const { backend } = mockBackend(async (spec, ids) => {
            if (spec.PipelineType === 'Decision') {
                throw new Error('driver not registered');
            }
            return new Map(ids.map((id) => [id, answer(spec, id)]));
        });
        const { io, lines } = mockIO();
        const outcome = await RunMeasurement(options(), backend, io);

        expect(outcome.DryRun).toBe(false);
        if (!outcome.DryRun) {
            expect(outcome.Report.Types.Decision.Accuracy.Accuracy).toBe(0);
            expect(outcome.Report.Types.Decision.Accuracy.FailuresPerRep).toEqual([8, 8]);
            expect(outcome.Report.Types.LLM.Accuracy.Accuracy).toBe(1);
        }
        expect(lines.some((line) => line.includes('ProcessBatch threw') && line.includes('driver not registered'))).toBe(true);
    });

    it('logs how many records of a batch failed', async () => {
        const { backend } = mockBackend(async (spec, ids) =>
            new Map(ids.map((id): [string, MeasuredRecordResult] => [id, id === 'rec-1' ? { Status: 'Failed', ErrorMessage: 'Constraint violation' } : answer(spec, id)]))
        );
        const { io, lines } = mockIO();
        await RunMeasurement(options(), backend, io);
        expect(lines.some((line) => /records failed\. First \(rec-1\): Constraint violation/.test(line))).toBe(true);
    });
});
