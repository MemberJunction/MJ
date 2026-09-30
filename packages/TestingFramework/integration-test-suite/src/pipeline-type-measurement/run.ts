/**
 * run.ts — the measurement's flow: refuse a repo output path, sample, build the two specs, plan the
 * calls, and then (unless it is a dry run) run every batch, read the costs and models, and write the
 * report. With `--require-model`, an answer from a model other than the arm's expected one stops the
 * run: after each arm's first batch (before most of the budget is spent), and again at the end.
 *
 * Everything that touches MJ sits behind {@link MeasurementBackend}, which the rig implements with
 * `RunView`, `AIEngine` and `InferProcessor`. The backend keeps each record's text to itself: it hands
 * this module IDs and labels, and takes IDs back. That keeps the flow unit-testable against a mock
 * backend, dry run included, and keeps record text out of everything this module writes.
 */
import { join } from 'node:path';
import { DistinctPromptRunIDs } from './cost-and-time';
import { AssertModelsToRequire, FormatExpectedModel, FormatModelCounts, ModelMismatch, ResolveExpectedModels, SummarizeArmModels } from './models';
import { BuildMeasurementReport } from './report';
import type { MeasurementReport } from './report';
import { RenderReportMarkdown } from './render';
import { AssertOutputOutsideRepo } from './repo-guard';
import { CountPerValue, StratifiedSample } from './sampling';
import { BuildMeasurementSpecs, BuildValueDescriptions, ReadPrediction } from './spec';
import { MEASURED_PIPELINE_TYPES } from './types';
import type {
    ArmPrompt, BatchTiming, CandidateSet, ExpectedModel, LabeledRecord, MeasuredPipelineType, MeasuredRecordResult, MeasurementOptions,
    MeasurementSpec, PromptRunCost, RecordPrediction, ValueDescriptionSet,
} from './types';

/** Runs batches through one processor (one type, one rep), as `InferProcessor.ProcessBatch` does. */
export interface BatchProcessor {
    ProcessBatch(recordIDs: readonly string[]): Promise<Map<string, MeasuredRecordResult>>;
}

/** Everything the measurement needs from MJ. The rig implements it live; tests mock it. */
export interface MeasurementBackend {
    /** The records whose label is one of `--values`: IDs and labels only. */
    LoadCandidates(): Promise<CandidateSet>;
    /** Each value's own description, where the metadata has one. */
    LoadDescriptionSources(values: readonly string[]): Promise<Record<string, string | null>>;
    /** The prompt each type runs, resolved from its name, with the model its bindings try first. */
    ResolvePrompts(): Promise<Record<MeasuredPipelineType, ArmPrompt>>;
    /** A processor for one type in one rep (the rig's is `CreateMeasurementProcessor`'s). */
    CreateBatchProcessor(type: MeasuredPipelineType, spec: MeasurementSpec): BatchProcessor;
    /** Each prompt run's cost, latency and model, once its saves have finished. */
    ReadPromptRunCosts(promptRunIDs: readonly string[]): Promise<Map<string, PromptRunCost>>;
}

/** The measurement's side effects, injected so tests control the clock and the files. */
export interface MeasurementIO {
    Log(line: string): void;
    /** Milliseconds, for wall time. */
    Now(): number;
    /** ISO timestamp for the report. */
    Timestamp(): string;
    /** Writes a file, creating its directory. */
    WriteFile(path: string, content: string): void;
}

/** One type's pass over the sample in one rep. */
export interface PlannedRun {
    Rep: number;
    Type: MeasuredPipelineType;
    Batches: string[][];
}

/** What the measurement prepared before any prompt runs. */
export interface MeasurementSetup {
    LabelColumn: string;
    CandidateCount: number;
    Sample: LabeledRecord[];
    Descriptions: ValueDescriptionSet;
    Specs: Record<MeasuredPipelineType, MeasurementSpec>;
    /** The model each arm is meant to measure. */
    ExpectedModels: Record<MeasuredPipelineType, ExpectedModel>;
    Plan: PlannedRun[];
}

/** A dry run's plan, or a live run's report and where it was written. */
export type MeasurementOutcome =
    | { DryRun: true; Setup: MeasurementSetup }
    | { DryRun: false; Setup: MeasurementSetup; Report: MeasurementReport; ReportPaths: string[] };

/**
 * The run order: every rep runs both types over the whole sample, in batches of `batchSize`. Odd reps
 * run LLM first and even reps Decision first, so neither type always gets the warm or the cold start.
 */
export function PlanRuns(recordIDs: readonly string[], reps: number, batchSize: number): PlannedRun[] {
    const batches: string[][] = [];
    for (let i = 0; i < recordIDs.length; i += batchSize) {
        batches.push(recordIDs.slice(i, i + batchSize));
    }
    const plan: PlannedRun[] = [];
    for (let rep = 1; rep <= reps; rep++) {
        const order: MeasuredPipelineType[] = rep % 2 === 1 ? ['LLM', 'Decision'] : ['Decision', 'LLM'];
        for (const type of order) {
            plan.push({ Rep: rep, Type: type, Batches: batches.map((batch) => [...batch]) });
        }
    }
    return plan;
}

/** Loads the candidates, samples them, resolves the descriptions and prompts, and builds the specs and plan. */
export async function PrepareMeasurement(options: MeasurementOptions, backend: MeasurementBackend): Promise<MeasurementSetup> {
    const candidates = await backend.LoadCandidates();
    const sample = StratifiedSample(candidates.Records, options.Values, options.SampleSize, options.Seed);
    if (sample.length === 0) {
        throw new Error(`No ${options.EntityName} records have a ${options.LabelField} in: ${options.Values.join(', ')}.`);
    }
    const descriptions = BuildValueDescriptions(options.Values, await backend.LoadDescriptionSources(options.Values));
    const prompts = await backend.ResolvePrompts();
    const expectedModels = ResolveExpectedModels(options, prompts);
    if (options.RequireModel) {
        AssertModelsToRequire(expectedModels);
    }
    const specs = BuildMeasurementSpecs({
        EntityName: options.EntityName, LabelColumn: candidates.LabelColumn, TextFields: options.TextFields,
        Values: options.Values, Descriptions: descriptions.Descriptions, PromptIDs: { LLM: prompts.LLM.PromptID, Decision: prompts.Decision.PromptID },
    });
    const plan = PlanRuns(sample.map((r) => r.RecordID), options.Reps, options.BatchSize);
    return {
        LabelColumn: candidates.LabelColumn, CandidateCount: candidates.Records.length, Sample: sample, Descriptions: descriptions,
        Specs: specs, ExpectedModels: expectedModels, Plan: plan,
    };
}

/**
 * The lines a run prints before it starts (and all a dry run prints): the sample, the value
 * descriptions both arms see, and the planned calls.
 */
export function FormatPlan(setup: MeasurementSetup, options: MeasurementOptions): string[] {
    const perValue = Object.entries(CountPerValue(setup.Sample, options.Values)).map(([value, count]) => `${value} ${count}`).join(', ');
    const calls = setup.Plan.reduce((sum, run) => sum + run.Batches.reduce((n, batch) => n + batch.length, 0), 0);
    const batchCalls = setup.Plan.reduce((sum, run) => sum + run.Batches.length, 0);
    const fallback = setup.Descriptions.FallbackValues;
    return [
        `Sample: ${setup.Sample.length} of ${options.SampleSize} requested (${perValue}), from ${setup.CandidateCount} candidate records.`,
        fallback.length > 0 ? `Descriptions: no source description for ${fallback.join(', ')}; the value is used.` : 'Descriptions: every value has its own.',
        'Value descriptions (Decision: Choice option descriptions; LLM: listed in its constraint block and in valueDescriptions):',
        ...options.Values.map((value) => `  ${value}: ${setup.Descriptions.Descriptions[value]}`),
        ...MEASURED_PIPELINE_TYPES.map((type) => `${type} model expected: ${FormatExpectedModel(setup.ExpectedModels[type])}.`),
        options.RequireModel
            ? '--require-model: an answer from another model stops the run (checked after each arm\'s first batch, and at the end).'
            : 'Models are not required: an answer from another model is reported as a warning (pass --require-model to stop instead).',
        `Planned calls: ${options.Reps} rep(s) x 2 types x ${setup.Sample.length} records = ${calls} prompt runs, in ${batchCalls} ProcessBatch calls of up to ${options.BatchSize} records.`,
        ...setup.Plan.map((run) => `  rep ${run.Rep}: ${run.Type} (${run.Batches.length} batch(es))`),
    ];
}

/**
 * Runs the measurement. A dry run prints the sample and the planned calls and makes none.
 * @throws Error when `--out` is inside a git working tree (checked before anything else), or no record
 * matches; with `--require-model`, when an arm has no expected model, or an answer came from another
 * model (after its first batch, or at the end, once the report is written).
 */
export async function RunMeasurement(options: MeasurementOptions, backend: MeasurementBackend, io: MeasurementIO): Promise<MeasurementOutcome> {
    const outDir = AssertOutputOutsideRepo(options.OutDir);
    const setup = await PrepareMeasurement(options, backend);
    FormatPlan(setup, options).forEach((line) => io.Log(line));
    if (options.DryRun) {
        io.Log('--dry-run: no prompt was run.');
        return { DryRun: true, Setup: setup };
    }
    const { Predictions, Timings } = await executePlan(setup, backend, io, options.RequireModel);
    const runIDs = DistinctPromptRunIDs(Predictions);
    io.Log(`Reading cost and model for ${runIDs.length} prompt run(s) once their saves finish...`);
    const costs = await backend.ReadPromptRunCosts(runIDs);
    const report = BuildMeasurementReport({
        Options: options, LabelColumn: setup.LabelColumn, Sample: setup.Sample, Descriptions: setup.Descriptions,
        Predictions, Timings, Costs: costs, ExpectedModels: setup.ExpectedModels, GeneratedAt: io.Timestamp(),
    });
    const paths = writeReport(report, outDir, io);
    report.Warnings.forEach((warning) => io.Log(`WARNING: ${warning}`));
    if (options.RequireModel) {
        assertExpectedModelsAnswered(report, paths);
    }
    return { DryRun: false, Setup: setup, Report: report, ReportPaths: paths };
}

/** Writes `report.json` and `report.md` to `outDir`, and returns their paths. */
function writeReport(report: MeasurementReport, outDir: string, io: MeasurementIO): string[] {
    const paths = [join(outDir, 'report.json'), join(outDir, 'report.md')];
    io.WriteFile(paths[0], JSON.stringify(report, null, 2) + '\n');
    io.WriteFile(paths[1], RenderReportMarkdown(report));
    paths.forEach((path) => io.Log(`Wrote ${path}`));
    return paths;
}

/** `--require-model` at the end: fails when any arm was answered by another model. */
function assertExpectedModelsAnswered(report: MeasurementReport, paths: readonly string[]): void {
    const mismatches = MEASURED_PIPELINE_TYPES.map((type) => ModelMismatch(type, report.Types[type].Models)).filter((m): m is string => m !== null);
    if (mismatches.length > 0) {
        throw new Error(`--require-model: ${mismatches.join(' ')} The report was written, with this warning at the top: ${paths.join(', ')}.`);
    }
}

/**
 * Runs every planned batch: a new processor per type per rep, timed around each `ProcessBatch` call.
 * With `requireModel`, each arm's first batch is checked for its expected model before the run goes on.
 */
async function executePlan(
    setup: MeasurementSetup,
    backend: MeasurementBackend,
    io: MeasurementIO,
    requireModel: boolean
): Promise<{ Predictions: RecordPrediction[]; Timings: BatchTiming[] }> {
    const predictions: RecordPrediction[] = [];
    const timings: BatchTiming[] = [];
    const checked = new Set<MeasuredPipelineType>();
    for (const run of setup.Plan) {
        const processor = backend.CreateBatchProcessor(run.Type, setup.Specs[run.Type]);
        for (const [i, batch] of run.Batches.entries()) {
            const outcome = await runBatch(processor, run, batch, setup.LabelColumn, io);
            predictions.push(...outcome.Predictions);
            timings.push(outcome.Timing);
            io.Log(`${run.Type} rep ${run.Rep} batch ${i + 1}/${run.Batches.length}: ${batch.length} records in ${(outcome.Timing.WallMs / 1000).toFixed(1)} s`);
            if (requireModel && !checked.has(run.Type)) {
                checked.add(run.Type);
                await assertFirstBatchModel(run.Type, outcome.Predictions, setup.ExpectedModels[run.Type], backend, io);
            }
        }
    }
    return { Predictions: predictions, Timings: timings };
}

/** `--require-model` after an arm's first batch: reads its prompt runs' models and stops on another model. */
async function assertFirstBatchModel(
    type: MeasuredPipelineType,
    predictions: readonly RecordPrediction[],
    expected: ExpectedModel,
    backend: MeasurementBackend,
    io: MeasurementIO
): Promise<void> {
    const costs = await backend.ReadPromptRunCosts(DistinctPromptRunIDs(predictions));
    const summary = SummarizeArmModels(predictions, costs, expected);
    io.Log(`${type} first batch answered by: ${FormatModelCounts(summary.Answered)}.`);
    const mismatch = ModelMismatch(type, summary);
    if (mismatch) {
        throw new Error(`--require-model: ${mismatch} Stopped after the first ${type} batch; no report was written.`);
    }
}

/** One timed `ProcessBatch` call. A batch that throws fails its records; the measurement goes on. */
async function runBatch(processor: BatchProcessor, run: PlannedRun, batch: readonly string[], outputName: string, io: MeasurementIO): Promise<{ Predictions: RecordPrediction[]; Timing: BatchTiming }> {
    const start = io.Now();
    let results = new Map<string, MeasuredRecordResult>();
    try {
        results = await processor.ProcessBatch(batch);
    } catch (e) {
        io.Log(`${run.Type} rep ${run.Rep}: ProcessBatch threw, failing its ${batch.length} records: ${e instanceof Error ? e.message : String(e)}`);
    }
    const wallMs = io.Now() - start;
    logFailures(run, batch, results, io);
    const predictions = batch.map((id) => ({ RecordID: id, Type: run.Type, Rep: run.Rep, ...ReadPrediction(results.get(id), outputName) }));
    return { Predictions: predictions, Timing: { Type: run.Type, Rep: run.Rep, RecordCount: batch.length, WallMs: wallMs } };
}

/** Logs how many records in a batch failed, with the first failure's message, to the console only. */
function logFailures(run: PlannedRun, batch: readonly string[], results: Map<string, MeasuredRecordResult>, io: MeasurementIO): void {
    const failed = batch.filter((id) => results.get(id)?.Status !== 'Succeeded');
    if (failed.length === 0) {
        return;
    }
    const first = results.get(failed[0])?.ErrorMessage ?? 'no result returned';
    io.Log(`${run.Type} rep ${run.Rep}: ${failed.length} of ${batch.length} records failed. First (${failed[0]}): ${first.slice(0, 300)}`);
}
