/**
 * @fileoverview Feature Pipeline Version Steward: for every Active Infer Record Process, runs the golden-set evaluation
 * of a gated pipeline's unevaluated version and the one backfill of a changed version, so a version change completes
 * without a person. Every decision is returned as an outcome.
 * @module @memberjunction/scheduling-engine
 */
import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { FeaturePipelineVersionService, type FeaturePipelineStewardPlan } from '@memberjunction/feature-pipelines';
import { InferProcessor, RecordProcessExecutor } from '@memberjunction/record-set-processor';
import type { ProcessRunResult, RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { TestEngine } from '@memberjunction/testing-engine';

/** Every action the steward records. */
export const STEWARD_ACTIONS = ['none', 'evaluated', 'backfilled', 'held', 'refused', 'error'] as const;

/** What the steward did for one pipeline. */
export type StewardAction = typeof STEWARD_ACTIONS[number];

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
    /** The backfill's `MJ: Process Runs` row. */
    ProcessRunID?: string;
}

/** One steward pass. */
export interface StewardRunParams {
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /** Limit the pass to these pipelines (default: every Active Infer Record Process). */
    RecordProcessIDs?: string[];
    /** The scheduled job run the pass belongs to; a backfill's Process Run links back to it. */
    ScheduledJobRunID?: string;
    /** Renews the scheduled job's lease; called after each pipeline and during a backfill. */
    Heartbeat?: () => void;
}

/** A plan the steward acts on (evaluate or backfill); the others are recorded as they are. */
type ActionablePlan = Extract<FeaturePipelineStewardPlan, { Kind: 'evaluate' | 'backfill' }>;

/** The fields of a golden-set test run the steward reads. */
type EvaluationRun = Pick<MJTestRunEntity, 'ID' | 'Status' | 'ErrorMessage'>;

/** The steward of Feature Pipeline version changes. */
export class FeaturePipelineVersionSteward extends BaseSingleton<FeaturePipelineVersionSteward> {
    public static get Instance(): FeaturePipelineVersionSteward {
        return super.getInstance<FeaturePipelineVersionSteward>();
    }
    protected constructor() {
        super();
    }

    /**
     * The outcomes stored in a steward run's `Details`; values that are not outcomes are skipped.
     * @param details - a Scheduled Job Run's `Details`, read back from JSON
     */
    public static OutcomesFromDetails(details: Record<string, unknown> | undefined): StewardOutcome[] {
        const outcomes = details?.Outcomes;
        return Array.isArray(outcomes) ? outcomes.filter((o) => FeaturePipelineVersionSteward.IsOutcome(o)) : [];
    }

    /**
     * Whether a value read back from JSON is a steward outcome.
     * @param value - one element of a stored outcome list; `unknown` because it comes from JSON the steward did not
     * necessarily write (a run's Details can be edited), and is narrowed here field by field.
     */
    public static IsOutcome(value: unknown): value is StewardOutcome {
        if (typeof value !== 'object' || value === null) {
            return false;
        }
        return 'RecordProcessID' in value && typeof value.RecordProcessID === 'string'
            && 'Name' in value && typeof value.Name === 'string'
            && 'Version' in value && (value.Version === null || typeof value.Version === 'number')
            && 'Action' in value && STEWARD_ACTIONS.some((a) => a === value.Action)
            && 'Detail' in value && typeof value.Detail === 'string';
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

    /** The Active Infer Record Processes of the pass. */
    protected async LoadPipelines(p: StewardRunParams): Promise<MJRecordProcessEntity[]> {
        const ids = p.RecordProcessIDs && p.RecordProcessIDs.length > 0
            ? ` AND ID IN (${p.RecordProcessIDs.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`
            : '';
        const rv = await RunView.FromMetadataProvider(p.Provider).RunView<MJRecordProcessEntity>({
            EntityName: 'MJ: Record Processes',
            ExtraFilter: `WorkType='Infer' AND Status='Active'${ids}`,
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
        const ctx: RecordProcessorContext = { contextUser: p.ContextUser, provider: p.Provider, recordProcessID: rp.ID, entityID: rp.EntityID, DryRun: true };
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
     * Runs the golden-set test once per (version as planned, golden-set content); an earlier run since then is recorded
     * `held`, so an evaluation that cannot complete (e.g. its labels fail the label-quality check) is not repeated
     * every pass.
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
     * The one on-demand backfill of a changed version, over named records (so the pipeline's own scope, which may
     * select only records without a value, does not exclude them) and without the watermark skip (an UpdatedAt or
     * checksum watermark written before the change would skip a record whose source row did not change, and every
     * named record needs a value under this version). A run that attempted every named record marks the version
     * backfilled even when some records failed, so a failing record is retried by the next version change, not every
     * pass (its failure is in that run's `MJ: Process Run Details`). A run that did not ({@link AttemptedEveryRecord}:
     * refused, paused, or stopped by its error-rate breaker) is recorded `error` and not marked, so the next pass runs it
     * again: an ungated version is activated by that run, so marking it would leave the pipeline refused with nothing
     * left to start the run.
     */
    protected async Backfill(rp: MJRecordProcessEntity, plan: Extract<ActionablePlan, { Kind: 'backfill' }>, p: StewardRunParams): Promise<StewardOutcome> {
        const run = await new RecordProcessExecutor().RunByID(rp.ID, {
            contextUser: p.ContextUser,
            provider: p.Provider,
            triggeredBy: 'OnDemand',
            scope: { Kind: 'records', RecordIDs: plan.RecordIDs },
            SkipUnchanged: false,
            scheduledJobRunID: p.ScheduledJobRunID,
            onProgress: () => p.Heartbeat?.(),
        });
        const summary = `backfill run ${run.Status}: ${run.Processed} processed, ${run.Error} failed, ${run.Skipped} skipped${run.ErrorMessage ? ` (${run.ErrorMessage})` : ''}`;
        if (!this.AttemptedEveryRecord(run, plan.RecordIDs.length)) {
            return { ...this.Outcome(rp, plan.Version, 'error', `${summary}; retried on the next pass`), ProcessRunID: run.ProcessRunID };
        }
        await FeaturePipelineVersionService.Instance.MarkBackfilled(rp.ID, plan.Version, p.ContextUser, p.Provider);
        return { ...this.Outcome(rp, plan.Version, 'backfilled', summary), ProcessRunID: run.ProcessRunID };
    }

    /**
     * Whether a backfill run attempted every record it was given: it completed, or it ended `Failed` (a run with a
     * failed record ends so) after handing every record to the processor. `Processed` counts every record handed out,
     * the skipped ones included, so it is compared alone. A failed run of no records attempted nothing, and its failure
     * is the run's own (a refusal before the first record).
     */
    protected AttemptedEveryRecord(run: ProcessRunResult, recordCount: number): boolean {
        if (run.Status === 'Completed') {
            return true;
        }
        return run.Status === 'Failed' && recordCount > 0 && run.Processed >= recordCount;
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
