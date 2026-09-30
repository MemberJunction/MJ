/**
 * report.ts — assembles the measurement report (`report.json`) and renders it as `report.md`.
 *
 * Pure. The report holds record IDs, labels (values of the label field), the value descriptions both
 * arms saw, and numbers, never a measured record's text: nothing that reaches this module carries any.
 */
import { SimulateEscalation, SummarizeCalibration } from './calibration';
import type { CalibrationSummary, EscalationPoint } from './calibration';
import { PredictionCost, SummarizeCost, SummarizeLatency, SummarizeWallTime } from './cost-and-time';
import type { CostSummary, LatencySummary, WallTimeSummary } from './cost-and-time';
import { AgreementBetweenTypes, IsCorrect, PerValueRecall, PredictionIndex, Repeatability, SummarizeAccuracy } from './metrics';
import type { AccuracySummary, MetricContext, TypeAgreement, ValueRecall } from './metrics';
import { CountPerValue } from './sampling';
import { MEASURED_PIPELINE_TYPES } from './types';
import type { BatchTiming, LabeledRecord, MeasuredPipelineType, MeasurementOptions, PromptRunCost, RecordPrediction, ValueDescriptionSet } from './types';

/** Everything a report is built from. */
export interface ReportInput {
    Options: MeasurementOptions;
    LabelColumn: string;
    Sample: readonly LabeledRecord[];
    Descriptions: ValueDescriptionSet;
    Predictions: readonly RecordPrediction[];
    Timings: readonly BatchTiming[];
    Costs: ReadonlyMap<string, PromptRunCost>;
    /** ISO timestamp, passed in so the report is deterministic under test. */
    GeneratedAt: string;
}

/** One pipeline type's results. */
export interface TypeReport {
    Accuracy: AccuracySummary;
    Recall: ValueRecall[];
    Repeatability: number | null;
    WallTime: WallTimeSummary;
    Cost: CostSummary;
    Latency: LatencySummary;
}

/** One answer, by record ID. */
export interface ReportRecordRow {
    RecordID: string;
    Label: string;
    Type: MeasuredPipelineType;
    Rep: number;
    Succeeded: boolean;
    Predicted: string | null;
    Confidence: number | null;
    Correct: boolean;
    PromptRunID: string | null;
    Cost: number | null;
    LatencyMs: number | null;
}

/** The whole report, as written to `report.json`. */
export interface MeasurementReport {
    GeneratedAt: string;
    Setup: {
        EntityName: string;
        LabelField: string;
        LabelColumn: string;
        TextFields: string[];
        Values: string[];
        RequestedSampleSize: number;
        Reps: number;
        Seed: number;
        BatchSize: number;
        LLMPrompt: string;
        DecisionPrompt: string;
        /** The description each value had, as both arms saw it (the value itself for a fallback). */
        ValueDescriptions: Record<string, string>;
    };
    Sample: { Size: number; PerValue: Record<string, number> };
    FallbackDescriptionValues: string[];
    Types: Record<MeasuredPipelineType, TypeReport>;
    Agreement: TypeAgreement;
    Calibration: CalibrationSummary;
    Escalation: EscalationPoint[];
    UnfinishedPromptRuns: number;
    Notes: string[];
    Records: ReportRecordRow[];
}

/** Builds the report from the run's sample, answers, timings and costs. */
export function BuildMeasurementReport(input: ReportInput): MeasurementReport {
    const ctx: MetricContext = { Sample: input.Sample, Reps: input.Options.Reps, Index: new PredictionIndex(input.Predictions) };
    const report: MeasurementReport = {
        GeneratedAt: input.GeneratedAt,
        Setup: buildSetup(input),
        Sample: { Size: input.Sample.length, PerValue: CountPerValue(input.Sample, input.Options.Values) },
        FallbackDescriptionValues: [...input.Descriptions.FallbackValues],
        Types: { LLM: buildTypeReport(input, ctx, 'LLM'), Decision: buildTypeReport(input, ctx, 'Decision') },
        Agreement: AgreementBetweenTypes(ctx),
        Calibration: SummarizeCalibration(ctx, 'Decision'),
        Escalation: SimulateEscalation(ctx, input.Costs),
        UnfinishedPromptRuns: [...input.Costs.values()].filter((c) => !c.Finished).length,
        Notes: [],
        Records: buildRecordRows(input),
    };
    report.Notes = BuildReportNotes(report);
    return report;
}

function buildSetup(input: ReportInput): MeasurementReport['Setup'] {
    const o = input.Options;
    return {
        EntityName: o.EntityName, LabelField: o.LabelField, LabelColumn: input.LabelColumn, TextFields: [...o.TextFields], Values: [...o.Values],
        RequestedSampleSize: o.SampleSize, Reps: o.Reps, Seed: o.Seed, BatchSize: o.BatchSize, LLMPrompt: o.LLMPromptName, DecisionPrompt: o.DecisionPromptName,
        ValueDescriptions: { ...input.Descriptions.Descriptions },
    };
}

function buildTypeReport(input: ReportInput, ctx: MetricContext, type: MeasuredPipelineType): TypeReport {
    const own = input.Predictions.filter((p) => p.Type === type);
    return {
        Accuracy: SummarizeAccuracy(ctx, type, input.Options.Seed),
        Recall: PerValueRecall(ctx, type, input.Options.Values),
        Repeatability: Repeatability(ctx, type),
        WallTime: SummarizeWallTime(input.Timings, type),
        Cost: SummarizeCost(own, input.Costs),
        Latency: SummarizeLatency(own, input.Costs),
    };
}

/** One row per answer, ordered by type, rep and sample position. IDs and labels only. */
function buildRecordRows(input: ReportInput): ReportRecordRow[] {
    const index = new PredictionIndex(input.Predictions);
    const rows: ReportRecordRow[] = [];
    for (const type of MEASURED_PIPELINE_TYPES) {
        for (let rep = 1; rep <= input.Options.Reps; rep++) {
            for (const record of input.Sample) {
                const p = index.Get(type, rep, record.RecordID);
                rows.push({
                    RecordID: record.RecordID, Label: record.Label, Type: type, Rep: rep,
                    Succeeded: !!p?.Succeeded, Predicted: p?.Predicted ?? null, Confidence: p?.Confidence ?? null, Correct: IsCorrect(p, record.Label),
                    PromptRunID: p?.PromptRunID ?? null, Cost: PredictionCost(p, input.Costs),
                    LatencyMs: p?.PromptRunID ? input.Costs.get(p.PromptRunID)?.ExecutionTimeMS ?? null : null,
                });
            }
        }
    }
    return rows;
}

/** The report's notes: how it was measured, and every caveat a reader needs. */
export function BuildReportNotes(report: MeasurementReport): string[] {
    const notes = [
        'Both types get the same value descriptions (under Setup). Decision gets them as its Choice question\'s option descriptions. The LLM gets them in its prompt data: the constraint block (constraints and ConstraintBlock) lists each allowed value with its description, and valueDescriptions holds them by output. The rig cannot see the LLM prompt\'s template, so the LLM sees them only if that template renders {{ constraints }} (or valueDescriptions).',
        report.FallbackDescriptionValues.length > 0
            ? `No source description for: ${report.FallbackDescriptionValues.join(', ')}. Each of these uses the value itself as its description, because Decision needs a description for every value.`
            : 'Every value had its own source description.',
        `Prompt data, for both types: { record: { <primary key>, ${report.Setup.TextFields.join(', ')} }, constraints, ConstraintBlock }, plus valueDescriptions for the LLM. Decision receives it canonicalised as its state; the label field is never in it.`,
        'Cost is each prompt run\'s TotalCost (its own cost plus descendant cost), falling back to Cost, read after the runs\' saves finished. A Decision failover or delegated chat run is a child prompt run, and its cost reaches the parent\'s TotalCost only on branches that carry #4880. On a branch without #4880, the Decision cost can be missing that delegated cost.',
        `Wall time is measured around each ProcessBatch call (batches of up to ${report.Setup.BatchSize} records; one InferProcessor per type per rep; no caching; WritesHistory off; nothing written back). Latency is each prompt run's ExecutionTimeMS.`,
        'A failed or missing answer counts as wrong. Agreement and repeatability count a record only when both answers succeeded and match.',
        'The escalation simulation follows InferProcessor: a Decision answer below the floor (or with no confidence) takes the same rep\'s LLM answer, and a failed Decision answer fails without escalating.',
        'Records are identified by ID only. No measured record\'s text is in this report.',
    ];
    return [...notes, ...costCaveats(report)];
}

function costCaveats(report: MeasurementReport): string[] {
    const caveats: string[] = [];
    for (const type of MEASURED_PIPELINE_TYPES) {
        const cost = report.Types[type].Cost;
        if (cost.RunsWithCost < cost.Runs || cost.Runs < cost.Records) {
            caveats.push(`${type}: ${cost.RunsWithCost} of ${cost.Records} answers have a prompt run with a known cost, so its cost per 1,000 is a lower bound.`);
        }
    }
    if (report.UnfinishedPromptRuns > 0) {
        caveats.push(`${report.UnfinishedPromptRuns} prompt run(s) had not reached a final status when the rig stopped waiting; their cost may be missing.`);
    }
    return caveats;
}
