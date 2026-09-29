/**
 * types.ts — the shapes the Feature Pipeline type measurement passes between its steps.
 *
 * The measurement compares the `LLM` and `Decision` pipeline types on one enum output with objective
 * labels (plan Task 5.5). Every shape here carries record IDs and labels only. A record's text stays
 * inside the rig's live backend, which hands it to `InferProcessor` and never back to this module, so
 * nothing downstream (the metrics, the report) can leak it.
 *
 * The only MJ references are erased `import type`s. They derive the spec and result shapes from the
 * processor itself, so they track `DataFeatureSpec` and `RecordResult` without a hand-copied shape.
 */
import type { InferProcessor } from '@memberjunction/record-set-processor';
import type { RecordResult } from '@memberjunction/record-set-processor-base';

/** A Feature Pipeline spec, as `InferProcessor` takes it (`DataFeatureSpec`). */
export type MeasurementSpec = NonNullable<InferProcessor['Spec']>;

/** One output of a {@link MeasurementSpec}. */
export type MeasurementOutput = MeasurementSpec['Outputs'][number];

/** What `InferProcessor.ProcessBatch` returns for one record. */
export type MeasuredRecordResult = RecordResult;

/**
 * The two arms of the comparison. `LLM` is a spec with no `PipelineType` (which runs as LLM);
 * `Decision` names the `Decision` type. They are the rig's arm labels, not an entity value list.
 */
export type MeasuredPipelineType = 'LLM' | 'Decision';

/** Both arms, in the order a rep with an odd number runs them. */
export const MEASURED_PIPELINE_TYPES: readonly MeasuredPipelineType[] = ['LLM', 'Decision'];

/** A candidate record: its ID and its label (the label field's display value), never its text. */
export interface LabeledRecord {
    /** The record's primary key, as a compact composite-key segment. */
    RecordID: string;
    /** The label field's display value, canonicalised to one of `--values`. */
    Label: string;
}

/** The records the backend can measure, and the view column their labels came from. */
export interface CandidateSet {
    /** The view column that holds the display label (for a foreign key, its name column). */
    LabelColumn: string;
    /** Every record whose label is one of `--values`. */
    Records: LabeledRecord[];
}

/** What the rig was asked to measure, parsed from its command line. */
export interface MeasurementOptions {
    EntityName: string;
    TextFields: string[];
    LabelField: string;
    Values: string[];
    SampleSize: number;
    Reps: number;
    Seed: number;
    BatchSize: number;
    LLMPromptName: string;
    DecisionPromptName: string;
    OutDir: string;
    DryRun: boolean;
}

/** One record's answer from one pipeline type in one rep. */
export interface RecordPrediction {
    RecordID: string;
    Type: MeasuredPipelineType;
    /** 1-based rep number. */
    Rep: number;
    /** Whether the processor returned `Succeeded` for the record. */
    Succeeded: boolean;
    /** The answered value, or null when the record failed or the payload had no answer. */
    Predicted: string | null;
    /** The output's confidence (Decision only), or null. */
    Confidence: number | null;
    /** The `MJ: AI Prompt Runs` row that answered, when there is one. */
    PromptRunID: string | null;
}

/** The wall time of one `ProcessBatch` call. */
export interface BatchTiming {
    Type: MeasuredPipelineType;
    Rep: number;
    RecordCount: number;
    WallMs: number;
}

/** A prompt run's cost and latency, read after its saves have finished. */
export interface PromptRunCost {
    PromptRunID: string;
    /** `TotalCost` (own cost plus descendant cost), falling back to `Cost`; null when neither is set. */
    Cost: number | null;
    Currency: string | null;
    ExecutionTimeMS: number | null;
    /** Whether the row reached a terminal status before the rig stopped waiting for its saves. */
    Finished: boolean;
}

/** The value descriptions both pipeline types see, and the values that had no source description. */
export interface ValueDescriptionSet {
    /** One non-empty description per value. */
    Descriptions: Record<string, string>;
    /** Values with no source description, whose description is the value itself. */
    FallbackValues: string[];
}
