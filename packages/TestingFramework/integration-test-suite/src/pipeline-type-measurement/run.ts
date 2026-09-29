/**
 * run.ts — the measurement's flow: refuse a repo output path, sample, build the two specs, plan the
 * calls, and then (unless it is a dry run) run every batch, read the costs and write the report.
 *
 * Everything that touches MJ sits behind {@link MeasurementBackend}, which the rig implements with
 * `RunView`, `AIEngine` and `InferProcessor`. The backend keeps each record's text to itself: it hands
 * this module IDs and labels, and takes IDs back. That keeps the flow unit-testable against a mock
 * backend, dry run included, and keeps record text out of everything this module writes.
 */
import { join } from 'node:path';
import { BuildMeasurementReport } from './report';
import type { MeasurementReport } from './report';
import { RenderReportMarkdown } from './render';
import { AssertOutputOutsideRepo } from './repo-guard';
import { CountPerValue, StratifiedSample } from './sampling';
import { BuildMeasurementSpecs, BuildValueDescriptions, ReadPrediction } from './spec';
import type {
    BatchTiming, CandidateSet, LabeledRecord, MeasuredPipelineType, MeasuredRecordResult, MeasurementOptions,
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
    /** The prompt each type runs, resolved from its name. */
    ResolvePromptIDs(): Promise<Record<MeasuredPipelineType, string>>;
    /** A processor for one type in one rep. */
    CreateBatchProcessor(spec: MeasurementSpec): BatchProcessor;
    /** Each prompt run's cost and latency, once its saves have finished. */
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
    const specs = BuildMeasurementSpecs({
        EntityName: options.EntityName, LabelColumn: candidates.LabelColumn, TextFields: options.TextFields,
        Values: options.Values, Descriptions: descriptions.Descriptions, PromptIDs: await backend.ResolvePromptIDs(),
    });
    const plan = PlanRuns(sample.map((r) => r.RecordID), options.Reps, options.BatchSize);
    return { LabelColumn: candidates.LabelColumn, CandidateCount: candidates.Records.length, Sample: sample, Descriptions: descriptions, Specs: specs, Plan: plan };
}

/** The lines a run prints before it starts (and all a dry run prints): the sample and the planned calls. */
export function FormatPlan(setup: MeasurementSetup, options: MeasurementOptions): string[] {
    const perValue = Object.entries(CountPerValue(setup.Sample, options.Values)).map(([value, count]) => `${value} ${count}`).join(', ');
    const calls = setup.Plan.reduce((sum, run) => sum + run.Batches.reduce((n, batch) => n + batch.length, 0), 0);
    const batchCalls = setup.Plan.reduce((sum, run) => sum + run.Batches.length, 0);
    const fallback = setup.Descriptions.FallbackValues;
    return [
        `Sample: ${setup.Sample.length} of ${options.SampleSize} requested (${perValue}), from ${setup.CandidateCount} candidate records.`,
        fallback.length > 0 ? `Descriptions: no source description for ${fallback.join(', ')}; the value is used.` : 'Descriptions: every value has its own.',
        `Planned calls: ${options.Reps} rep(s) x 2 types x ${setup.Sample.length} records = ${calls} prompt runs, in ${batchCalls} ProcessBatch calls of up to ${options.BatchSize} records.`,
        ...setup.Plan.map((run) => `  rep ${run.Rep}: ${run.Type} (${run.Batches.length} batch(es))`),
    ];
}

/**
 * Runs the measurement. A dry run prints the sample and the planned calls and makes none.
 * @throws Error when `--out` is inside a git working tree (checked before anything else), or no record matches.
 */
export async function RunMeasurement(options: MeasurementOptions, backend: MeasurementBackend, io: MeasurementIO): Promise<MeasurementOutcome> {
    const outDir = AssertOutputOutsideRepo(options.OutDir);
    const setup = await PrepareMeasurement(options, backend);
    FormatPlan(setup, options).forEach((line) => io.Log(line));
    if (options.DryRun) {
        io.Log('--dry-run: no prompt was run.');
        return { DryRun: true, Setup: setup };
    }
    const { Predictions, Timings } = await executePlan(setup, backend, io);
    const runIDs = [...new Set(Predictions.map((p) => p.PromptRunID).filter((id): id is string => !!id))];
    io.Log(`Reading cost for ${runIDs.length} prompt run(s) once their saves finish...`);
    const costs = await backend.ReadPromptRunCosts(runIDs);
    const report = BuildMeasurementReport({
        Options: options, LabelColumn: setup.LabelColumn, Sample: setup.Sample, Descriptions: setup.Descriptions,
        Predictions, Timings, Costs: costs, GeneratedAt: io.Timestamp(),
    });
    const paths = [join(outDir, 'report.json'), join(outDir, 'report.md')];
    io.WriteFile(paths[0], JSON.stringify(report, null, 2) + '\n');
    io.WriteFile(paths[1], RenderReportMarkdown(report));
    paths.forEach((path) => io.Log(`Wrote ${path}`));
    return { DryRun: false, Setup: setup, Report: report, ReportPaths: paths };
}

/** Runs every planned batch: a new processor per type per rep, timed around each `ProcessBatch` call. */
async function executePlan(setup: MeasurementSetup, backend: MeasurementBackend, io: MeasurementIO): Promise<{ Predictions: RecordPrediction[]; Timings: BatchTiming[] }> {
    const predictions: RecordPrediction[] = [];
    const timings: BatchTiming[] = [];
    for (const run of setup.Plan) {
        const processor = backend.CreateBatchProcessor(setup.Specs[run.Type]);
        for (const [i, batch] of run.Batches.entries()) {
            const outcome = await runBatch(processor, run, batch, setup.LabelColumn, io);
            predictions.push(...outcome.Predictions);
            timings.push(outcome.Timing);
            io.Log(`${run.Type} rep ${run.Rep} batch ${i + 1}/${run.Batches.length}: ${batch.length} records in ${(outcome.Timing.WallMs / 1000).toFixed(1)} s`);
        }
    }
    return { Predictions: predictions, Timings: timings };
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
