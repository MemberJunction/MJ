/**
 * @fileoverview Feature Pipeline Version Steward: for every Active Infer Record Process, runs the golden-set evaluation
 * of a gated pipeline's unevaluated version and the one backfill of a changed version, so a version change completes
 * without a person. Every decision is returned as an outcome.
 * @module @memberjunction/feature-pipelines-engine
 */
import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, LogWarning, RunView, UserInfo } from '@memberjunction/core';
import type { MJProcessRunEntity, MJRecordProcessEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { FeaturePipelineVersionService, type FeaturePipelineStewardPlan } from '@memberjunction/feature-pipelines';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import type { ProcessRunResult, RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { TestEngine } from '@memberjunction/testing-engine';
import { InferProcessor } from '../processors/InferProcessor';

/** What the steward did for one pipeline. */
export type StewardAction = 'none' | 'evaluated' | 'backfilled' | 'held' | 'refused' | 'error';

/** One recorded steward decision (stored in the Scheduled Job Run's `Details.Outcomes`). */
export interface StewardOutcome {
    RecordProcessID: string;
    Name: string;
    /** The version the decision concerns; null when the pipeline failed before planning. */
    Version: number | null;
    Action: StewardAction;
    Detail: string;
    /** The golden-set test run the decision rests on (`evaluated`, or `held` after an earlier evaluation). */
    TestRunID?: string;
    /** The backfill's `MJ: Process Runs` row; for a deferred backfill, the run still running. */
    ProcessRunID?: string;
}

/** One steward pass. */
export interface StewardRunParams {
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /** The scheduled job run the pass belongs to; a backfill's Process Run links back to it. */
    ScheduledJobRunID?: string;
    /** Renews the scheduled job's lease; called after each pipeline and during a backfill. */
    Heartbeat?: () => void;
}

/** A plan the steward acts on (evaluate or backfill); the others are recorded as they are. */
type ActionablePlan = Extract<FeaturePipelineStewardPlan, { Kind: 'evaluate' | 'backfill' }>;

/** The fields of a golden-set test run the steward reads. */
type EvaluationRun = Pick<MJTestRunEntity, 'ID' | 'Status' | 'ErrorMessage'>;

/** The fields of a pipeline's running Process Run the steward reads. */
type RunningProcessRun = Pick<MJProcessRunEntity, 'ID' | 'StartTime' | '__mj_UpdatedAt'>;

/**
 * A `Running` run not checkpointed for this long is stale (its server stopped before settling it): the executor saves
 * the run after every batch, so a live run is updated far more often.
 */
const STALE_RUN_MS = 30 * 60_000;

/** How often a running backfill renews the pass's lease; the engine throttles effective beats itself. */
const BACKFILL_HEARTBEAT_MS = 60_000;

/**
 * The steward of Feature Pipeline version changes.
 *
 * A version is marked backfilled only by a run in which every named record was attempted and none failed; the next
 * pass re-selects the records whose latest value is still under another version, so it retries exactly the failed
 * ones. A record that fails permanently therefore keeps its version unbackfilled (the executor's circuit breaker
 * covers a systematic failure). A backfill is deferred while another non-dry run of the pipeline is still running,
 * so two runs never write the same scope at once; a `Running` run not checkpointed for 30 minutes is stale and ignored.
 */
export class FeaturePipelineVersionSteward extends BaseSingleton<FeaturePipelineVersionSteward> {
    public static get Instance(): FeaturePipelineVersionSteward {
        return super.getInstance<FeaturePipelineVersionSteward>();
    }
    protected constructor() {
        super();
    }

    /** One pass. A pipeline that throws is recorded as `error`; the others still run. */
    public async RunOnce(p: StewardRunParams): Promise<StewardOutcome[]> {
        const outcomes: StewardOutcome[] = [];
        for (const rp of await this.LoadPipelines(p)) {
            try {
                outcomes.push(...(await this.StewardPipeline(rp, p)));
            } catch (e) {
                outcomes.push(this.Outcome(rp, null, 'error', e instanceof Error ? e.message : String(e)));
            }
            p.Heartbeat?.();
        }
        return outcomes;
    }

    /**
     * Runs one steward pass for a single Active Infer Record Process by ID.
     * A pipeline that is missing or throws is recorded as an `error` outcome.
     */
    public async StewardPipelineByID(recordProcessID: string, p: StewardRunParams): Promise<StewardOutcome[]> {
        let rp: MJRecordProcessEntity | null;
        try {
            rp = await this.LoadPipelineByID(recordProcessID, p);
        } catch (e) {
            p.Heartbeat?.();
            return [{
                RecordProcessID: recordProcessID,
                Name: recordProcessID,
                Version: null,
                Action: 'error',
                Detail: e instanceof Error ? e.message : String(e),
            }];
        }
        if (!rp) {
            p.Heartbeat?.();
            return [{
                RecordProcessID: recordProcessID,
                Name: recordProcessID,
                Version: null,
                Action: 'error',
                Detail: `Active Infer Record Process '${recordProcessID}' not found`,
            }];
        }
        try {
            const outcomes = await this.StewardPipeline(rp, p);
            p.Heartbeat?.();
            return outcomes;
        } catch (e) {
            p.Heartbeat?.();
            return [this.Outcome(rp, null, 'error', e instanceof Error ? e.message : String(e))];
        }
    }

    /** Loads a single Active Infer Record Process by ID. */
    protected async LoadPipelineByID(recordProcessID: string, p: StewardRunParams): Promise<MJRecordProcessEntity | null> {
        const rv = await RunView.FromMetadataProvider(p.Provider).RunView<MJRecordProcessEntity>({
            EntityName: 'MJ: Record Processes',
            ExtraFilter: `ID='${EscapeSQLString(recordProcessID)}' AND WorkType='Infer' AND Status='Active'`,
            ResultType: 'entity_object',
            MaxRows: 1,
            SkipTotalRowCount: true,
        }, p.ContextUser);
        if (!rv.Success) {
            throw new Error(`Reading Record Process '${recordProcessID}' failed: ${rv.ErrorMessage}`);
        }
        return rv.Results?.find((r) => UUIDsEqual(r.ID, recordProcessID)) ?? rv.Results?.[0] ?? null;
    }

    /** The Active Infer Record Processes. */
    protected async LoadPipelines(p: StewardRunParams): Promise<MJRecordProcessEntity[]> {
        const rv = await RunView.FromMetadataProvider(p.Provider).RunView<MJRecordProcessEntity>({
            EntityName: 'MJ: Record Processes',
            ExtraFilter: `WorkType='Infer' AND Status='Active'`,
            OrderBy: 'Name',
            ResultType: 'entity_object', // InferProcessor.FromRecordProcess takes the entity
        }, p.ContextUser);
        if (!rv.Success) {
            throw new Error(`Reading Record Processes failed: ${rv.ErrorMessage}`);
        }
        return rv.Results || [];
    }

    /**
     * At most one evaluation and one backfill per pipeline per pass: an evaluation re-plans (a passing version moves
     * on to its backfill; a failing one is recorded `held` or `refused`). One processor serves every plan of the pass,
     * so the pipeline's lookup constraints are read once.
     */
    protected async StewardPipeline(rp: MJRecordProcessEntity, p: StewardRunParams): Promise<StewardOutcome[]> {
        const processor = InferProcessor.FromRecordProcess(rp, p.Provider);
        const out: StewardOutcome[] = [];
        let evaluated = false;
        for (;;) {
            const plan = await this.PlanFor(rp, processor, p);
            if (plan.Kind === 'none') {
                return out.length > 0 ? out : [this.Outcome(rp, plan.Version, 'none', 'nothing to do')];
            }
            if (plan.Kind === 'held' || plan.Kind === 'refused') {
                return [...out, this.Outcome(rp, plan.Version, plan.Kind, plan.Message)];
            }
            if (plan.Kind === 'backfill') {
                return [...out, await this.Backfill(rp, plan, p)];
            }
            if (evaluated) {
                return [...out, this.Outcome(rp, plan.Version, 'held',
                    `v${plan.Version} still has no golden-set result under the pipeline's Activation settings after this pass's evaluation (see its test run); it is evaluated again when the version, its Activation settings or its golden set change`)];
            }
            const evaluation = await this.Evaluate(rp, plan, p);
            out.push(evaluation);
            if (evaluation.Action !== 'evaluated') {
                return out;
            }
            evaluated = true; // re-plan: a passing version moves on to its backfill, a failing one is refused
        }
    }

    /** The registry's plan for the pipeline's current pin (registers a new pin as a Candidate). */
    protected async PlanFor(rp: MJRecordProcessEntity, processor: InferProcessor, p: StewardRunParams): Promise<FeaturePipelineStewardPlan> {
        const ctx: RecordProcessorContext = { ContextUser: p.ContextUser, Provider: p.Provider, RecordProcessID: rp.ID, EntityID: rp.EntityID, DryRun: true };
        return FeaturePipelineVersionService.Instance.PlanUnattended({
            RecordProcessID: rp.ID,
            Pin: await processor.ResolveRunPin(ctx),
            Activation: processor.Spec?.Activation,
            Unattended: processor.Spec?.Unattended,
            ContextUser: p.ContextUser,
            Provider: p.Provider,
        });
    }

    /**
     * Runs the golden-set test once per version and golden-set content; an earlier run since then is recorded `held`,
     * so an evaluation that cannot complete is not repeated every pass.
     */
    protected async Evaluate(rp: MJRecordProcessEntity, plan: Extract<ActionablePlan, { Kind: 'evaluate' }>, p: StewardRunParams): Promise<StewardOutcome> {
        await TestEngine.Instance.Config(false, p.ContextUser, p.Provider);
        const earlier = await this.EvaluationSince(plan.GoldenSetTestID, plan.Since, p);
        if (earlier) {
            const reason = earlier.ErrorMessage ? `: ${earlier.ErrorMessage}` : '';
            return {
                ...this.Outcome(rp, plan.Version, 'held',
                    `v${plan.Version} was already evaluated (test run ${earlier.ID}, ${earlier.Status}${reason}) and still has no golden-set result under the pipeline's Activation settings; it is evaluated again when the version, its Activation settings or its golden set change`),
                TestRunID: earlier.ID,
            };
        }
        const result = await TestEngine.Instance.RunTest(plan.GoldenSetTestID, { verbose: false }, p.ContextUser);
        const single = Array.isArray(result) ? result[0] : result;
        if (!single) {
            throw new Error(`Golden-set test ${plan.GoldenSetTestID} returned no result`);
        }
        return { ...this.Outcome(rp, plan.Version, 'evaluated', `golden-set test ${single.status}`), TestRunID: single.testRunId };
    }

    /**
     * The one backfill of a changed version: over the named records, without the watermark skip (a watermark written
     * before the change would skip records that need a value under this version). Only a run that attempted every
     * record with no failure marks the version backfilled; any other run is recorded `error` and its unfinished records
     * are retried on the next pass. Deferred (`held`) while another run of the pipeline is running. The lease is renewed
     * on a timer while the run is awaited, so its cadence does not depend on how long a batch takes.
     */
    protected async Backfill(rp: MJRecordProcessEntity, plan: Extract<ActionablePlan, { Kind: 'backfill' }>, p: StewardRunParams): Promise<StewardOutcome> {
        const running = await this.RunningProcessRun(rp.ID, p);
        if (running) {
            const started = running.StartTime ? new Date(running.StartTime).toISOString() : 'at an unknown time';
            return {
                ...this.Outcome(rp, plan.Version, 'held', `backfill deferred: Process Run ${running.ID} (started ${started}) is still running`),
                ProcessRunID: running.ID,
            };
        }
        const heartbeat = p.Heartbeat ? setInterval(() => p.Heartbeat?.(), BACKFILL_HEARTBEAT_MS) : null;
        let run: ProcessRunResult;
        try {
            run = await new RecordProcessExecutor().RunByID(rp.ID, {
                ContextUser: p.ContextUser,
                Provider: p.Provider,
                TriggeredBy: 'OnDemand',
                Scope: { Kind: 'records', RecordIDs: plan.RecordIDs },
                SkipUnchanged: false,
                ScheduledJobRunID: p.ScheduledJobRunID,
                OnProgress: () => p.Heartbeat?.(),
            });
        } finally {
            if (heartbeat) {
                clearInterval(heartbeat);
            }
        }
        const summary = `backfill run ${run.Status}: ${run.Processed} processed, ${run.Error} failed, ${run.Skipped} skipped${run.ErrorMessage ? ` (${run.ErrorMessage})` : ''}`;
        if (!this.AttemptedEveryRecord(run, plan.RecordIDs.length)) {
            return { ...this.Outcome(rp, plan.Version, 'error', `${summary}; retried on the next pass`), ProcessRunID: run.ProcessRunID };
        }
        if (run.Error > 0) {
            return { ...this.Outcome(rp, plan.Version, 'error', `${summary}; ${run.Error} record(s) retried on the next pass`), ProcessRunID: run.ProcessRunID };
        }
        await FeaturePipelineVersionService.Instance.MarkBackfilled(rp.ID, plan.Version, p.ContextUser, p.Provider);
        return { ...this.Outcome(rp, plan.Version, 'backfilled', summary), ProcessRunID: run.ProcessRunID };
    }

    /**
     * Whether a backfill run attempted every record: it completed, or it ended `Failed` (a failed record) after
     * processing every record. A failed run of no records failed before the first record.
     */
    protected AttemptedEveryRecord(run: ProcessRunResult, recordCount: number): boolean {
        if (run.Status === 'Completed') {
            return true;
        }
        return run.Status === 'Failed' && recordCount > 0 && run.Processed >= recordCount;
    }

    /**
     * The non-dry run of the pipeline still in progress, if any: the most recently checkpointed `Running` run, read
     * fresh. One not checkpointed within {@link STALE_RUN_MS} (so neither is any other) is stale: warned and ignored.
     */
    protected async RunningProcessRun(recordProcessID: string, p: StewardRunParams): Promise<RunningProcessRun | null> {
        const rv = await RunView.FromMetadataProvider(p.Provider).RunView<RunningProcessRun>({
            EntityName: 'MJ: Process Runs',
            ExtraFilter: `RecordProcessID='${EscapeSQLString(recordProcessID)}' AND Status='Running' AND DryRun=0`,
            OrderBy: '__mj_UpdatedAt DESC',
            Fields: ['ID', 'StartTime', '__mj_UpdatedAt'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            BypassCache: true,
        }, p.ContextUser);
        if (!rv.Success) {
            throw new Error(`Reading MJ: Process Runs failed: ${rv.ErrorMessage}`);
        }
        const run = rv.Results?.[0];
        if (!run) {
            return null;
        }
        const updated = new Date(run.__mj_UpdatedAt); // epoch milliseconds: a UTC comparison
        if (Date.now() - updated.getTime() > STALE_RUN_MS) {
            LogWarning(`FeaturePipelineVersionSteward: ignoring stale Process Run ${run.ID} (Running, last updated ${updated.toISOString()}); backfilling`);
            return null;
        }
        return run;
    }

    /**
     * The latest run of the golden-set test since the plan's date or the test's last change, whichever is later, if
     * any. Expects the test engine configured.
     */
    protected async EvaluationSince(testID: string, since: Date, p: StewardRunParams): Promise<EvaluationRun | null> {
        const test = TestEngine.Instance.GetTestByID(testID);
        const from = new Date(Math.max(since.getTime(), test?.__mj_UpdatedAt?.getTime() || 0));
        const rv = await RunView.FromMetadataProvider(p.Provider).RunView<EvaluationRun>({
            EntityName: 'MJ: Test Runs',
            ExtraFilter: `TestID='${EscapeSQLString(testID)}' AND StartedAt >= '${from.toISOString()}'`,
            OrderBy: 'StartedAt DESC',
            Fields: ['ID', 'Status', 'ErrorMessage'],
            MaxRows: 1,
            SkipTotalRowCount: true,
        }, p.ContextUser);
        if (!rv.Success) {
            throw new Error(`Reading MJ: Test Runs failed: ${rv.ErrorMessage}`);
        }
        return rv.Results?.[0] || null;
    }

    /** An outcome row for a pipeline. */
    protected Outcome(rp: MJRecordProcessEntity, version: number | null, action: StewardAction, detail: string): StewardOutcome {
        return { RecordProcessID: rp.ID, Name: rp.Name, Version: version, Action: action, Detail: detail };
    }
}
