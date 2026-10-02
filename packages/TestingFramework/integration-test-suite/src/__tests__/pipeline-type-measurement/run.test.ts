/**
 * run.test.ts — the measurement's flow against a mock backend: the dry run plans and makes no call,
 * the repo-path refusal comes before anything else, a full run writes a report that holds no record
 * text even though the backend's records have plenty, and an arm answered by another model is warned
 * of, or with `--require-model` stops the run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlanRuns, RunMeasurement } from '../../pipeline-type-measurement/run';
import type { BatchProcessor, MeasurementBackend, MeasurementIO } from '../../pipeline-type-measurement/run';
import type { MeasurementReport } from '../../pipeline-type-measurement/report';
import type { MeasuredPipelineType, MeasuredRecordResult, MeasurementOptions, MeasurementSpec, PromptRunCost } from '../../pipeline-type-measurement/types';

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
        LLMModelName: null, DecisionModelName: null, RequireModel: false, AllowDatabase: null, OutDir: join(outDir, 'report'), DryRun: false, ...overrides,
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

/** What a mock backend does: how batches are answered, and which model answered each prompt run. */
interface MockBehaviour {
    ProcessBatch?: (spec: MeasurementSpec, ids: readonly string[]) => Promise<Map<string, MeasuredRecordResult>>;
    /** The model a prompt run's row names; by default `Chat Model` for LLM runs and `Jev` for Decision runs. */
    ModelOf?: (promptRunID: string) => string | null;
    /** Each prompt's first-choice model; by default `Chat Model` and `Jev`. */
    FirstChoice?: Partial<Record<MeasuredPipelineType, string | null>>;
}

function defaultModelOf(promptRunID: string): string {
    return promptRunID.startsWith('Decision') ? 'Jev' : 'Chat Model';
}

function mockBackend(behaviour: MockBehaviour = {}) {
    const specs: MeasurementSpec[] = [];
    const modelOf = behaviour.ModelOf ?? defaultModelOf;
    const firstChoice = { LLM: 'Chat Model', Decision: 'Jev', ...behaviour.FirstChoice };
    const backend = {
        LoadCandidates: vi.fn<MeasurementBackend['LoadCandidates']>(async () => ({ LabelColumn: 'Category', Records: ROWS.map((r) => ({ RecordID: r.RecordID, Label: r.Label })) })),
        LoadDescriptionSources: vi.fn<MeasurementBackend['LoadDescriptionSources']>(async () => ({ A: 'About A' })),
        ResolvePrompts: vi.fn<MeasurementBackend['ResolvePrompts']>(async () => ({
            LLM: { PromptID: 'llm-id', FirstChoiceModel: firstChoice.LLM },
            Decision: { PromptID: 'decision-id', FirstChoiceModel: firstChoice.Decision },
        })),
        CreateBatchProcessor: vi.fn<MeasurementBackend['CreateBatchProcessor']>((_type, spec): BatchProcessor => {
            specs.push(spec);
            const run = behaviour.ProcessBatch ?? (async (s: MeasurementSpec, ids: readonly string[]) => new Map(ids.map((id) => [id, answer(s, id)])));
            return { ProcessBatch: (ids) => run(spec, ids) };
        }),
        ReadPromptRunCosts: vi.fn<MeasurementBackend['ReadPromptRunCosts']>(async (ids) =>
            new Map(ids.map((id): [string, PromptRunCost] => [id, { PromptRunID: id, Cost: 0.001, Currency: 'USD', ExecutionTimeMS: 50, Model: modelOf(id), Vendor: 'Vendor', Finished: true }]))
        ),
    } satisfies MeasurementBackend;
    return { backend, specs };
}

function mockIO() {
    let clock = 0;
    const lines: string[] = [];
    const files = new Map<string, string>();
    const prepared: string[] = [];
    const io: MeasurementIO = {
        Log: (line) => lines.push(line),
        Now: () => (clock += 10),
        Timestamp: () => '2026-09-29T00:00:00.000Z',
        WriteFile: (path, content) => files.set(path, content),
        PrepareOutputDirectory: (dir) => prepared.push(dir),
    };
    return { io, lines, files, prepared };
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
        expect(lines.slice(5, 8)).toEqual([
            'LLM model expected: Chat Model (from prompt \'LLM prompt\').',
            'Decision model expected: Jev (from prompt \'Default Decision\').',
            'Models are not required: an answer from another model is reported as a warning (pass --require-model to stop instead).',
        ]);
        expect(lines[8]).toBe('Planned calls: 2 rep(s) x 2 types x 8 records = 32 prompt runs, in 12 ProcessBatch calls of up to 3 records.');
        expect(lines.at(-1)).toBe('--dry-run: no prompt was run.');
        expect(backend.CreateBatchProcessor).not.toHaveBeenCalled();
        expect(backend.ReadPromptRunCosts).not.toHaveBeenCalled();
        expect(files.size).toBe(0);
    });

    it('prepares the output directory before loading anything', async () => {
        const { backend } = mockBackend();
        const { io, prepared } = mockIO();
        const opts = options({ DryRun: true });
        await RunMeasurement(opts, backend, io);
        expect(prepared).toEqual([opts.OutDir]);
    });

    it('stops before loading anything when the output directory cannot be written', async () => {
        const { backend } = mockBackend();
        const { io } = mockIO();
        const unwritable: MeasurementIO = { ...io, PrepareOutputDirectory: () => { throw new Error('--out \'/x\' cannot be written: ENOTDIR'); } };
        await expect(RunMeasurement(options(), backend, unwritable)).rejects.toThrow(/cannot be written/);
        expect(backend.LoadCandidates).not.toHaveBeenCalled();
        expect(backend.CreateBatchProcessor).not.toHaveBeenCalled();
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
        const { backend } = mockBackend({
            ProcessBatch: async (spec, ids) => {
                if (spec.PipelineType === 'Decision') {
                    throw new Error('driver not registered');
                }
                return new Map(ids.map((id) => [id, answer(spec, id)]));
            },
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
        const { backend } = mockBackend({
            ProcessBatch: async (spec, ids) =>
                new Map(ids.map((id): [string, MeasuredRecordResult] => [id, id === 'rec-1' ? { Status: 'Failed', ErrorMessage: 'Constraint violation' } : answer(spec, id)])),
        });
        const { io, lines } = mockIO();
        await RunMeasurement(options(), backend, io);
        expect(lines.some((line) => /records failed\. First \(rec-1\): Constraint violation/.test(line))).toBe(true);
    });
});

describe('RunMeasurement: the model that answered', () => {
    /** Decision runs answered by LLM Decision, as with no OpenRouter key. */
    const llmDecision = (id: string): string => (id.startsWith('Decision') ? 'LLM Decision' : 'Chat Model');

    it('records each arm\'s models, and warns of nothing when each arm got its expected model', async () => {
        const { backend } = mockBackend();
        const { io, files } = mockIO();
        const outcome = await RunMeasurement(options(), backend, io);
        expect(outcome.DryRun).toBe(false);
        if (!outcome.DryRun) {
            expect(outcome.Report.Types.Decision.Models.Answered).toEqual([{ Model: 'Jev', Answers: 16 }]);
            expect(outcome.Report.Types.LLM.Models.Answered).toEqual([{ Model: 'Chat Model', Answers: 16 }]);
            expect(outcome.Report.Warnings).toEqual([]);
            expect(outcome.Report.Records.every((r) => r.Model === (r.Type === 'Decision' ? 'Jev' : 'Chat Model'))).toBe(true);
        }
        expect([...files.values()].join('\n')).not.toContain('**Warning:**');
    });

    it('warns at the top of both reports and on the console when Decision was answered by another model', async () => {
        const { backend } = mockBackend({ ModelOf: llmDecision });
        const { io, lines, files } = mockIO();
        const opts = options({ DecisionModelName: 'Jev' });
        const outcome = await RunMeasurement(opts, backend, io);

        const expected = 'The Decision arm was meant to measure Jev (from --decision-model), but 16 of its 16 answers came from another model: LLM Decision (16).';
        expect(outcome.DryRun).toBe(false);
        if (!outcome.DryRun) {
            expect(outcome.Report.Warnings[0]).toContain(expected);
        }
        const markdown = files.get(join(opts.OutDir, 'report.md')) ?? '';
        expect(markdown.split('\n\n')[2]).toContain(`> **Warning:** ${expected}`);
        expect(lines.some((line) => line.startsWith(`WARNING: ${expected}`))).toBe(true);
    });

    it('--require-model stops after the first Decision batch when another model answered it, and writes nothing', async () => {
        const { backend } = mockBackend({ ModelOf: llmDecision });
        const { io, lines, files } = mockIO();
        await expect(RunMeasurement(options({ RequireModel: true }), backend, io)).rejects.toThrow(
            /^--require-model: The Decision arm was meant to measure Jev \(from prompt 'Default Decision'\), but 3 of its 3 answers came from another model: LLM Decision \(3\)\..* Stopped after the first Decision batch/
        );
        expect(backend.CreateBatchProcessor.mock.calls.map(([type]) => type)).toEqual(['LLM', 'Decision']);
        expect(lines.filter((line) => line.startsWith('Decision rep'))).toEqual([expect.stringMatching(/^Decision rep 1 batch 1\/3/)]);
        expect(lines).toContain('LLM first batch answered by: Chat Model (3).');
        expect(files.size).toBe(0);
    });

    it('--require-model writes the report and then fails when a later batch was answered by another model', async () => {
        let decisionBatches = 0;
        const { backend } = mockBackend({
            ProcessBatch: async (spec, ids) => {
                decisionBatches += spec.PipelineType === 'Decision' ? 1 : 0;
                const failedOver = spec.PipelineType === 'Decision' && decisionBatches === 4;
                return new Map(ids.map((id): [string, MeasuredRecordResult] => {
                    const result = answer(spec, id);
                    return [id, failedOver ? { ...result, AIPromptRunID: `failover-${result.AIPromptRunID}` } : result];
                }));
            },
            ModelOf: (id) => (id.startsWith('failover-') ? 'LLM Decision' : defaultModelOf(id)),
        });
        const { io, files } = mockIO();
        const opts = options({ RequireModel: true });
        await expect(RunMeasurement(opts, backend, io)).rejects.toThrow(/--require-model: The Decision arm .* came from another model: LLM Decision \(3\)\..* The report was written/);
        const report = JSON.parse(files.get(join(opts.OutDir, 'report.json')) ?? '{}') as MeasurementReport;
        expect(report.Types.Decision.Models.UnexpectedAnswers).toBe(3);
        expect(report.Warnings).toHaveLength(1);
    });

    it('--require-model passes, checking each arm\'s first batch, when every answer came from the expected model', async () => {
        const { backend } = mockBackend();
        const { io, lines } = mockIO();
        const outcome = await RunMeasurement(options({ RequireModel: true }), backend, io);
        expect(outcome.DryRun).toBe(false);
        expect(lines).toContain('Decision first batch answered by: Jev (3).');
        // One read per arm's first batch, and one for the whole run.
        expect(backend.ReadPromptRunCosts).toHaveBeenCalledTimes(3);
    });

    it('--require-model refuses an arm with no model to require before running anything', async () => {
        const { backend } = mockBackend({ FirstChoice: { LLM: null } });
        await expect(RunMeasurement(options({ RequireModel: true, DryRun: true }), backend, mockIO().io)).rejects.toThrow(/--require-model needs a model .* pass --llm-model for the LLM arm/);
        expect(backend.CreateBatchProcessor).not.toHaveBeenCalled();
    });
});
