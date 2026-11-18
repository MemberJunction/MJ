/**
 * @fileoverview Builds and reads a persisted Feature Pipeline run result (`MJ: Process Runs.ResultSummary`).
 * @module @memberjunction/feature-pipelines
 */
import { SafeJSONParse } from '@memberjunction/global';
import type { ProcessRunStatusValue, RecordResult, RunCounts } from '@memberjunction/record-set-processor-base';

/** The pin a Feature Pipeline run computed under: its pipeline version and the Feature Value key hashes. */
export interface FeaturePipelineRunPin {
    PipelineVersion: number | null;
    PromptVersionHash: string | null;
    AIModelID: string | null;
    ParametersHash: string | null;
}

/** Per-record outcome returned by `InferProcessor`, extending {@link RecordResult} with Feature Pipeline pin metadata. */
export interface FeaturePipelineRecordResult extends RecordResult {
    PipelineVersion?: number | null;
    /** Feature Pipelines: the pin the record was computed under; the run result reports it. */
    PipelinePin?: FeaturePipelineRunPin;
}

/** Result of one Feature Pipeline run; persisted as `MJ: Process Runs.ResultSummary`. */
export interface FeaturePipelineRunResult {
    RecordProcessID: string;
    /** The run's pin: the first record's, else the processor's run-level pin (a run whose records were all skipped). */
    Pin: FeaturePipelineRunPin | null;
    /** Records the run handed to the processor: every processed record except those skipped on their watermark. */
    Attempted: number;
    Upserted: number;
    Unchanged: number;
    /** Records a dry run computed: it writes nothing, so they are neither Upserted nor Unchanged. */
    Previewed: number;
    /** Records whose output failed its constraints (counted apart from {@link Failed}). */
    RejectedInvalid: number;
    /** Records with outputs withheld below their confidence floor (also counted as Upserted, Unchanged or Previewed). */
    BelowConfidence: number;
    Failed: number;
    Skipped: number;
    HumanValuesPreserved: number;
    /** `completed` only when the run completed with no failed record; else `failed`. */
    Status: 'completed' | 'failed';
    /** A dry run only: why a real run would be refused (e.g. its Feature Pipeline version is not activated). */
    WouldRefuse?: string;
}

/** Builds and reads the `ResultSummary` of a Feature Pipeline run. */
export class FeaturePipelineRunResults {
    /**
     * The run result held in a `ResultSummary`, or null when the text is empty, not JSON, or not a Feature Pipeline
     * result (recognised by its four run counts).
     * @param text - the `ResultSummary` column
     */
    public static Parse(text: string | null | undefined): FeaturePipelineRunResult | null {
        const parsed = text ? SafeJSONParse<FeaturePipelineRunResult>(text) : null;
        const isResult =
            !!parsed &&
            typeof parsed === 'object' &&
            typeof parsed.Attempted === 'number' &&
            typeof parsed.Upserted === 'number' &&
            typeof parsed.Unchanged === 'number' &&
            typeof parsed.Previewed === 'number';
        return isResult ? parsed : null;
    }

    /**
     * Builds the run's `FeaturePipelineRunResult` (and `WouldRefuse` on a dry run) from the run's counts and per-record
     * results. Records skipped on their watermark (`DurationMs === 0` with no outcome/pin) are excluded from `Attempted`.
     * The pin is the first record's `PipelinePin`, else `runPin`, so a run whose records were all skipped still names
     * the pin it ran under.
     */
    public static Build(
        recordProcessID: string,
        counts: RunCounts,
        results: ReadonlyArray<FeaturePipelineRecordResult>,
        status: ProcessRunStatusValue,
        runPin: FeaturePipelineRunPin | null,
        runRefusal: string | null,
        dryRun: boolean,
    ): { ResultSummary: FeaturePipelineRunResult; WouldRefuse?: string } {
        let upserted = 0;
        let unchanged = 0;
        let previewed = 0;
        let rejectedInvalid = 0;
        let belowConfidence = 0;
        let humanValuesPreserved = 0;
        let watermarkSkipped = 0;
        let pin: FeaturePipelineRunPin | null = null;

        for (const r of results) {
            if (r.Status === 'Skipped' && r.DurationMs === 0 && !r.Outcome && !r.PipelinePin) {
                watermarkSkipped++;
                continue;
            }
            if (r.Status === 'Succeeded') {
                if (r.DryRun === true) {
                    previewed++;
                } else if (r.Outcome === 'Unchanged') {
                    unchanged++;
                } else {
                    upserted++;
                }
                if ((r.BelowConfidenceOutputs?.length || 0) > 0) {
                    belowConfidence++;
                }
            } else if (r.Status === 'Failed' && r.FailureKind === 'RejectedInvalid') {
                rejectedInvalid++;
            }
            humanValuesPreserved += r.HumanValuesPreserved || 0;
            pin ||= r.PipelinePin || null;
        }

        const attempted = Math.max(0, counts.Processed - watermarkSkipped);
        const wouldRefuse = dryRun ? runRefusal || undefined : undefined;
        const summary: FeaturePipelineRunResult = {
            ...(wouldRefuse ? { WouldRefuse: wouldRefuse } : {}),
            RecordProcessID: recordProcessID,
            Pin: pin || runPin || null,
            Attempted: attempted,
            Upserted: upserted,
            Unchanged: unchanged,
            Previewed: previewed,
            RejectedInvalid: rejectedInvalid,
            BelowConfidence: belowConfidence,
            Failed: Math.max(0, counts.Error - rejectedInvalid),
            Skipped: counts.Skipped,
            HumanValuesPreserved: humanValuesPreserved,
            Status: status === 'Completed' && counts.Error === 0 ? 'completed' : 'failed',
        };
        return {
            ResultSummary: summary,
            ...(wouldRefuse ? { WouldRefuse: wouldRefuse } : {}),
        };
    }
}
