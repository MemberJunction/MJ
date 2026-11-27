/**
 * @fileoverview Builds and reads a persisted Feature Pipeline run result (`MJ: Process Runs.ResultSummary`).
 * @module @memberjunction/feature-pipelines
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJProcessRunEntity } from '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import type { ProcessRunStatusValue, RecordResult, RunCounts } from '@memberjunction/record-set-processor-base';
import type { RederivationEstimate } from './rederivation-estimator.js';

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
    /**
     * A stale value this run did not re-derive: outside its budgeted slice, over its budget, or the lease is held by
     * another run (PR 5 D5-14, D5-41). The record is `Skipped` with no prompt call and no watermark, so a later run
     * continues with it.
     */
    RederivationDeferred?: boolean;
}

/**
 * What a run did about the values a version change made stale (PR 5 §5.2.4, D5-14, D5-31): its estimate, stored before
 * its first prompt call, and its budgeted slice. Present only on a run of a pipeline that had stale values.
 */
export interface FeaturePipelineRederivationResult {
    /** The estimate the run computed before its first prompt call. */
    Estimate: RederivationEstimate;
    /** Stale values this run re-derived. */
    Rederived: number;
    /** Stale values left for later runs (stale when the run started, less what it re-derived). */
    Remaining: number;
    /** Budget reserved by calls still in flight (0 once the run ended). */
    ReservedUsd: number;
    /** What the run's re-derivation calls cost. */
    SpentUsd: number;
    /** True when another run held the lease, so this run re-derived no stale value. */
    Yielded: boolean;
    /** True when the run lost its lease mid-slice (a renewal failed), so it made no further call. */
    LeaseLost: boolean;
    /** The budget the slice ran under. */
    Budget: { maxUsdPerRun: number; maxValuesPerRun: number };  // case-violation-ok-legacy-back-compat: the Record Process configuration's own keys (D5-14)
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
    /**
     * `completed` only when the run completed with no failed record; else `failed`. `running` only on the interim
     * summary a re-derivation run stores before its first prompt call ({@link FeaturePipelineRunResults.StoreInterim}).
     */
    Status: 'completed' | 'failed' | 'running';
    /** A dry run only: why a real run would be refused (e.g. its Feature Pipeline version is not activated). */
    WouldRefuse?: string;
    /** The run's re-derivation estimate and slice, when the pipeline had stale values (PR 5 D5-14, D5-31). */
    Rederivation?: FeaturePipelineRederivationResult;
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
            if (r.Status === 'Skipped' && r.DurationMs === 0 && !r.Outcome && !r.PipelinePin && r.RederivationDeferred !== true) {
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

    /** The summary a re-derivation run stores before its first prompt call: no record counted yet, its estimate. Pure. */
    public static Interim(recordProcessID: string, pin: FeaturePipelineRunPin | null, rederivation: FeaturePipelineRederivationResult): FeaturePipelineRunResult {
        return {
            RecordProcessID: recordProcessID, Pin: pin, Attempted: 0, Upserted: 0, Unchanged: 0, Previewed: 0, RejectedInvalid: 0, BelowConfidence: 0,
            Failed: 0, Skipped: 0, HumanValuesPreserved: 0, Status: 'running', Rederivation: rederivation,
        };
    }

    /**
     * Stores `summary` as the run's own `MJ: Process Runs.ResultSummary` now, so a run killed after its first prompt call
     * still carries its estimate (PR 5 attack 5, D5-31). The run tracker re-reads the row before each checkpoint save
     * and writes the final summary at the run's end, so neither overwrites it with an older value.
     * @throws Error when the run row cannot be loaded or saved
     */
    public static async StoreInterim(processRunID: string, summary: FeaturePipelineRunResult, provider: IMetadataProvider, contextUser: UserInfo): Promise<void> {
        const run = await provider.GetEntityObject<MJProcessRunEntity>('MJ: Process Runs', contextUser);
        if (!(await run.Load(processRunID))) {
            throw new Error(`FeaturePipelineRunResults: Process Run '${processRunID}' could not be loaded to store its re-derivation estimate: ${run.LatestResult?.CompleteMessage ?? 'not found'}`);
        }
        run.ResultSummary = JSON.stringify(summary);
        if (!(await run.Save())) {
            throw new Error(`FeaturePipelineRunResults: storing the re-derivation estimate on Process Run '${processRunID}' failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
}
