/**
 * @fileoverview {@link PipelineProcessor} — the one generic processor every pipeline stage runs
 * behind.
 *
 * Exactly one class implements Record Set Processing's processor contract for the pipeline. It is
 * built once per run with the Record Process row's configuration in hand, so it knows which stages
 * it is running before the first record arrives. Per record it hydrates, runs the stage, commits
 * unless this is a test, and returns the outcome. That is the entire piece of glue between the
 * platform's loop and a stage.
 *
 * @module @memberjunction/content-pipeline
 */

import { IRecordProcessor, RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import {
    BasePipelineStage,
    FatalStageError,
    IsFinalAttempt,
    Outcome,
    StageContext,
    StageLogger,
    StageOutcome,
    StageScope,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { EscapeSQLString } from '@memberjunction/global';
import { GetEntityName } from './EntityFieldMap.js';
import { IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { ChildCommitDefaults, WorkingRecordCommitter } from './WorkingRecordCommitter.js';
import { WorkingRecordHydrator } from './WorkingRecordHydrator.js';
import { ContentPipelineDeleteMarker } from './ContentPipelineDeleteMarker.js';
import { ReconcileChildren } from './ChildReconciliation.js';
import { AccessResolver } from './AccessResolver.js';

/** How a {@link PipelineProcessor} was configured for this run. */
export interface PipelineProcessorConfig {
    /**
     * The stages to run, in order, by registered name.
     *
     * In production a Record Process names exactly one. A list is how a test run chains several:
     * the processor runs them on the same working record, in memory, handing each stage's output
     * straight to the next — no reload, no commit in between.
     */
    Stages: readonly string[];
    /** When true, no commit happens and the run reports what would have been written. */
    IsTest: boolean;
    /** Where this run's records come from, which decides retry semantics. */
    Scope: StageScope;
    /** Configuration carried by the source or the run, handed to each stage. */
    Configuration: Record<string, unknown>;
    /**
     * Wall-clock budget per stage, per record, in milliseconds.
     *
     * Time-boxing extends the run budget the platform already has — a record cap, a delay between
     * pages — with time. When a stage's budget runs out it stops and reports what it found, rather
     * than hanging.
     *
     * Implemented by aborting the stage's stop signal, so **every stage that already honours
     * cancellation is time-boxed without changing a line of its code**. A stage that never checks
     * its signal runs to completion either way; time cannot stop work the code does not pause for.
     */
    StageBudgetMs?: number;
}

/** Extra per-record facts the queue supplies and a filter-scoped run does not have. */
export interface PipelineRecordHints {
    Attempt?: number;
    MaxAttempts?: number;
    IsReplay?: boolean;
    Signal?: AbortSignal;
}

/**
 * Builds the two storage-touching helpers from the per-record context.
 *
 * Record Set Processing's work-type factory is handed configuration but no provider or acting user —
 * those arrive per record, on `RecordProcessorContext`. So these are resolved lazily rather than at
 * construction, and injecting them is also how the tests substitute doubles.
 */
export interface StorageFactories {
    Hydrator(provider: IMetadataProvider, contextUser: UserInfo): WorkingRecordHydrator;
    Committer(provider: IMetadataProvider, contextUser: UserInfo): WorkingRecordCommitter;
}

/** The real pair, reading and writing through MemberJunction's standard save path. */
export const DefaultStorageFactories: StorageFactories = {
    Hydrator: (provider, contextUser) => new WorkingRecordHydrator(provider, contextUser),
    Committer: (provider, contextUser) => new WorkingRecordCommitter(provider, contextUser),
};

/** One stage's stop signal on one record, and whether its time budget ran out. */
interface StageBudget {
    Signal: AbortSignal;
    Expired: boolean;
    Dispose(): void;
}

/** Reports a stage's progress while a record is still being worked on. */
export interface ProgressReporter {
    /**
     * Open status for a record about to be worked on. Awaited, so the row exists before the stage
     * starts and the stage's first progress report has somewhere to land. A rejection is swallowed
     * by the caller: losing live visibility must never stop a record being processed.
     */
    OpenRecord(key: string, stageName: string): Promise<void>;
    ReportProgress(key: string, message: string): void;
    /**
     * Record one outcome for a record the platform never handed to the processor — Discover's found
     * items, a splitting extractor's blocks. Each gets its own detail row, which is what lets a
     * Discover-into-Extract test show per-item results.
     */
    RecordChildOutcome?(
        parentRecord: RecordRef,
        childKey: string,
        result: RecordResult,
        childEntityID?: string,
    ): Promise<void>;
}

/**
 * Runs configured stages over one record at a time.
 *
 * Constructed once per run by the registered work-type factory, which resolves the stage
 * instances up front so nothing is looked up per record.
 */
export class PipelineProcessor implements IRecordProcessor {
    private readonly stages: BasePipelineStage[];

    constructor(
        private readonly config: PipelineProcessorConfig,
        private readonly storage: StorageFactories = DefaultStorageFactories,
        private readonly progress?: ProgressReporter,
    ) {
        this.stages = config.Stages.map((name) => {
            const stage = BasePipelineStage.Resolve(name);
            if (!stage) {
                throw new Error(
                    `Pipeline stage '${name}' is not registered. Check the Record Process configuration ` +
                        `and that the package registering the stage has been loaded.`,
                );
            }
            return stage;
        });
        if (this.stages.length === 0) {
            throw new Error('A pipeline Record Process must name at least one stage in its configuration.');
        }
        const last = this.stages[this.stages.length - 1];
        if (typeof last.Finalize === 'function') {
            this.ProcessBatch = (records, context) => this.processBatch(records, context);
        }
    }

    /**
     * Run the page per record, then hand everything the page produced to the last stage's finalize.
     *
     * A throw here fails every record in the page, which is Record Set Processing's contract — and
     * the right behaviour, since a bulk call that failed tells us nothing about any individual
     * record in it.
     */
    private async processBatch(
        records: RecordRef[],
        context: RecordProcessorContext,
    ): Promise<Map<string, RecordResult>> {
        const results = new Map<string, RecordResult>();
        const working = new Map<string, WorkingRecord>();
        const hydrator = this.storage.Hydrator(context.provider, context.contextUser);
        const last = this.stages[this.stages.length - 1];

        for (const record of records) {
            const hints = (record as RecordRef & { Hints?: PipelineRecordHints }).Hints ?? {};
            const started = Date.now();
            try {
                const hydrated = await hydrator.Hydrate(this.stages[0].Entity, record.RecordID);
                if (this.isPendingDelete(hydrated)) {
                    // The same gate the per-record path applies. Without it the batch path embedded
                    // records that were marked for deletion while they sat in the queue.
                    results.set(
                        record.RecordID,
                        this.toRecordResult(Outcome.Skipped('record is pending delete'), started, hints, null),
                    );
                    continue;
                }
                const outcome = await this.runStages(hydrated, context, hints, record.RecordID);
                if (outcome.Status === 'Complete') {
                    working.set(record.RecordID, hydrated);
                } else {
                    // Commit the outcome. Reporting it without writing a status left the record
                    // Pending, so the next pass selected it again, and the one after that — a record
                    // that always fails or is always skipped was reprocessed forever.
                    const committed = await this.persistFinalized(hydrated, outcome, context);
                    results.set(record.RecordID, this.toRecordResult(outcome, started, hints, committed));
                }
            } catch (error) {
                results.set(record.RecordID, this.toRecordResult(this.classify(error), started, hints, null));
            }
        }

        if (working.size > 0) {
            const finalized = await last.Finalize!([...working.values()], this.buildBatchContext(context));
            for (const { Key, Outcome: outcome } of finalized) {
                const record = working.get(Key);
                const committed = record ? await this.persistFinalized(record, outcome, context) : null;
                results.set(Key, this.toRecordResult(outcome, Date.now(), {}, committed));
            }
        }
        return results;
    }

    /** Commit a record the finalize settled, unless this is a test. */
    private async persistFinalized(
        record: WorkingRecord,
        outcome: StageOutcome,
        context: RecordProcessorContext,
    ): Promise<string[] | null> {
        if (this.config.IsTest) {
            return null;
        }
        const last = this.stages[this.stages.length - 1];
        const status = this.statusFor(outcome, {}, last);
        if (status === null) {
            return null;
        }
        const committer = this.storage.Committer(context.provider, context.contextUser);
        const result = await committer.Commit(record, last.StatusField, status);
        return [...result.ColumnsWritten];
    }

    /** A context for the finalize, which is per page rather than per record. */
    private buildBatchContext(context: RecordProcessorContext): StageContext {
        return this.buildContext(
            this.stages[this.stages.length - 1],
            context,
            {},
            'batch',
            new AbortController().signal,
        );
    }

    /** The resolved stages, in run order. */
    public get Stages(): readonly BasePipelineStage[] {
        return this.stages;
    }

    /**
     * The optional batch seam, present **only** when the last stage implements a finalize.
     *
     * Record Set Processing calls this once per page instead of once per record, which is what lets
     * a stage call an external model once for fifty texts rather than fifty times. A batch-capable
     * stage that is not last in a chained test runs per-record instead: a test needs the same
     * correctness, not the bulk efficiency.
     *
     * Declared as a property rather than a method so it is genuinely absent when it does not apply —
     * Record Set Processing decides which path to take by checking whether it exists.
     */
    public ProcessBatch?: (
        records: RecordRef[],
        context: RecordProcessorContext,
    ) => Promise<Map<string, RecordResult> | RecordResult[]>;

    /**
     * Hydrate, run the configured stages, commit unless this is a test, return the outcome.
     */
    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        const started = Date.now();
        const hints = (record as RecordRef & { Hints?: PipelineRecordHints }).Hints ?? {};
        const key = record.RecordID;

        try {
            const hydrator = this.storage.Hydrator(context.provider, context.contextUser);
            const working = await hydrator.Hydrate(this.stages[0].Entity, record.RecordID);
            if (this.isPendingDelete(working)) {
                // Every stage skips a record that is pending delete. Stages hydrate fresh, so a
                // queued message for a record marked since it was queued is harmless.
                return this.toRecordResult(
                    Outcome.Skipped('record is pending delete'),
                    started,
                    hints,
                    null,
                    0,
                    0,
                );
            }
            const outcome = await this.runStages(working, context, hints, key);
            const committed = await this.persist(working, outcome, hints, context);
            const children = outcome.Status === 'Complete'
                ? await this.persistChildren(working, record, context)
                : 0;
            return this.toRecordResult(outcome, started, hints, committed, children, working.Children.length);
        } catch (error) {
            return this.toRecordResult(this.classify(error), started, hints, null, 0, 0);
        }
    }

    /**
     * Run each configured stage, stopping at the first non-Complete.
     *
     * A chain does not always stay on the same record. Discover runs over a Content Source and
     * produces Content Items; Extract runs over a Content Item. So when the next stage works on a
     * different entity, it runs over what the previous stage just produced rather than over the
     * record that produced them — otherwise a `[Discover, Extract]` test extracts the SOURCE's own
     * URL, which is the one thing it is certainly not meant to do, and the chained scenario proves
     * nothing.
     *
     * In a test run the children exist only in memory, which is exactly the case this matters for:
     * nothing has been committed for a later stage to pick up by querying.
     */
    private async runStages(
        working: WorkingRecord,
        context: RecordProcessorContext,
        hints: PipelineRecordHints,
        key: string,
    ): Promise<StageOutcome> {
        let last: StageOutcome = Outcome.Complete();
        let current: WorkingRecord[] = [working];
        for (const stage of this.stages) {
            const targets = this.targetsFor(stage, current);
            if (targets.length === 0) {
                // The previous stage produced nothing of this stage's entity. Not a failure — a
                // source that discovered no new items has nothing to extract.
                return last;
            }
            if (targets.length > 1 || targets[0] !== working) {
                last = await this.runStageOver(stage, targets, context, hints, key);
                if (last.Status !== 'Complete') {
                    return last;
                }
                current = targets.flatMap((t) => [...t.Children]);
                continue;
            }
            await this.openStatus(key, stage.Name);
            const budget = this.startBudget(hints.Signal);
            const stageContext = this.buildContext(stage, context, hints, key, budget.Signal);
            try {
                if (stageContext.Signal.aborted) {
                    return Outcome.Retry('cancelled before the stage started');
                }
                last = await stage.Run(working, stageContext);
                if (budget.Expired && last.Status === 'Complete') {
                    // The stage finished tidily after its budget ran out, so its result is partial.
                    // Recording it as a completed pass would leave the record looking done.
                    return Outcome.Retry(`${stage.Name} ran out of its ${this.config.StageBudgetMs}ms budget`);
                }
            } catch (error) {
                return this.classify(error);
            } finally {
                budget.Dispose();
            }
            if (last.Status !== 'Complete') {
                return last;
            }
            current = [...working.Children];
        }
        return last;
    }

    /**
     * Which records this stage runs over.
     *
     * The ones matching its entity. The first stage always gets the record the run selected; a later
     * stage on the same entity continues with it, and a later stage on a different entity picks up
     * what was produced.
     */
    private targetsFor(stage: BasePipelineStage, candidates: readonly WorkingRecord[]): WorkingRecord[] {
        return candidates.filter((c) => c.Entity === stage.Entity);
    }

    /**
     * Run one stage over several produced records.
     *
     * One failure does not fail the others: a zip with one unreadable member should still yield the
     * rest. The reported outcome is the worst of them, so the parent is not marked Complete when
     * something below it was not.
     */
    private async runStageOver(
        stage: BasePipelineStage,
        targets: readonly WorkingRecord[],
        context: RecordProcessorContext,
        hints: PipelineRecordHints,
        key: string,
    ): Promise<StageOutcome> {
        let worst: StageOutcome = Outcome.Complete();
        for (const target of targets) {
            const budget = this.startBudget(hints.Signal);
            try {
                if (budget.Signal.aborted) {
                    return Outcome.Retry('cancelled before the stage started');
                }
                const outcome = await stage.Run(
                    target,
                    this.buildContext(stage, context, hints, target.Identity.Key, budget.Signal),
                );
                if (outcome.Status !== 'Complete' && worst.Status === 'Complete') {
                    worst = outcome;
                }
            } catch (error) {
                const classified = this.classify(error);
                if (worst.Status === 'Complete') {
                    worst = classified;
                }
            } finally {
                budget.Dispose();
            }
        }
        await this.openStatus(key, stage.Name);
        return worst;
    }

    /**
     * A stop signal for one stage on one record: the run's own cancellation, plus the wall-clock
     * budget when one is configured.
     *
     * Combining them here is what makes time-boxing free for every stage — the budget is simply
     * another reason the signal fires, indistinguishable from an operator pressing stop.
     */
    private startBudget(runSignal: AbortSignal | undefined): StageBudget {
        const controller = new AbortController();
        const forward = () => controller.abort(runSignal?.reason);
        if (runSignal?.aborted) {
            controller.abort(runSignal.reason);
        } else {
            runSignal?.addEventListener('abort', forward, { once: true });
        }

        const budget: StageBudget = {
            Signal: controller.signal,
            Expired: false,
            Dispose: () => {
                runSignal?.removeEventListener('abort', forward);
                if (timer) {
                    clearTimeout(timer);
                }
            },
        };

        const ms = this.config.StageBudgetMs;
        const timer = ms && ms > 0
            ? setTimeout(() => {
                  budget.Expired = true;
                  controller.abort(new Error(`stage budget of ${ms}ms exhausted`));
              }, ms)
            : null;
        return budget;
    }

    /**
     * Open the record's status row, tolerating failure.
     *
     * Live visibility is a convenience; a tracker that cannot write must not take the record down
     * with it.
     */
    private async openStatus(key: string, stageName: string): Promise<void> {
        if (!this.progress) {
            return;
        }
        try {
            await this.progress.OpenRecord(key, stageName);
        } catch (error) {
            LogError(
                `PipelineProcessor: could not open status for '${key}': ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Commit, unless this is a test.
     *
     * A live run commits each record as the stage finishes with it; a test run withholds every
     * commit and reports what would have happened instead. A stage's own code is identical either
     * way, because "test" is purely the processor skipping this step.
     */
    private async persist(
        working: WorkingRecord,
        outcome: StageOutcome,
        hints: PipelineRecordHints,
        context: RecordProcessorContext,
    ): Promise<string[] | null> {
        if (this.config.IsTest) {
            return null;
        }
        const lastStage = this.stages[this.stages.length - 1];
        const status = this.statusFor(outcome, hints, lastStage);
        if (status === null) {
            // A transient failure before the last attempt leaves the status at Pending — the record
            // is still in the queue's hands, waiting out its backoff. Committing anything here
            // would take it out of play.
            return null;
        }
        const committer = this.storage.Committer(context.provider, context.contextUser);
        const result = await committer.Commit(working, lastStage.StatusField, status);
        return [...result.ColumnsWritten];
    }

    /**
     * Commit whatever the stage produced, and report one outcome per child.
     *
     * On a test run nothing is committed, so a child is reported under its ephemeral identity — the
     * URL — which is exactly what makes a dry run of Discover readable.
     */
    private async persistChildren(
        working: WorkingRecord,
        record: RecordRef,
        context: RecordProcessorContext,
    ): Promise<number> {
        if (working.Children.length === 0) {
            return 0;
        }
        const committer = this.storage.Committer(context.provider, context.contextUser);
        const defaults = this.childDefaults(working);
        let committed = 0;

        for (const child of working.Children) {
            const outcome = await this.persistOneChild(child, working, defaults, committer);
            if (outcome.Status === 'Succeeded' && !this.config.IsTest) {
                committed++;
            }
            await this.progress?.RecordChildOutcome?.(
                record,
                child.Identity.Key,
                outcome,
                this.entityIDFor(child.Entity, context),
            );
        }

        await this.sweepOrphans(working, context);
        return committed;
    }

    /**
     * The MJ entity id for a working-record entity, so a child's detail row is filed correctly.
     *
     * Undefined when it cannot be resolved, and the caller falls back to the parent's. Failing a
     * record because a telemetry row would carry the wrong entity id would be a worse trade than
     * the mis-filing it is trying to avoid.
     */
    private entityIDFor(entity: WorkingRecordEntity, context: RecordProcessorContext): string | undefined {
        try {
            const name = GetEntityName(entity);
            return context.provider.Entities?.find((e) => e.Name === name)?.ID;
        } catch {
            return undefined;
        }
    }

    /** Commit one child and describe how it went, so a failure fails that child and not the batch. */
    private async persistOneChild(
        child: WorkingRecord,
        working: WorkingRecord,
        defaults: ChildCommitDefaults,
        committer: WorkingRecordCommitter,
    ): Promise<RecordResult> {
        try {
            if (!this.config.IsTest) {
                await committer.CommitChild(child, defaults, this.childStatusField(child), this.childStatus(child));
            }
            return {
                Status: 'Succeeded',
                AttemptCount: 1,
                ResultPayload: {
                    Stage: this.stages[this.stages.length - 1].Name,
                    ProducedBy: working.Identity.Key,
                    IsTest: this.config.IsTest,
                    URL: child.Identity.EphemeralID,
                    Complete: child.IsComplete,
                },
            };
        } catch (error) {
            return {
                Status: 'Failed',
                AttemptCount: 1,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Sweep children the re-run no longer produces.
     *
     * Reconciliation is housekeeping. A record whose stage succeeded must not be failed because the
     * orphan sweep could not run — the next re-extraction sweeps again.
     */
    private async sweepOrphans(working: WorkingRecord, context: RecordProcessorContext): Promise<void> {
        try {
            await this.removeOrphans(working, context);
        } catch (error) {
            LogError(
                `PipelineProcessor: orphan reconciliation failed for '${working.Identity.Key}': ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Mark children that the re-run no longer produces.
     *
     * Re-extracting a changed container yields a new set of blocks. A block matching an existing
     * child updated it in place above; a child whose block has *gone* is an orphan, and leaving it
     * would keep stale content — and its vectors — retrievable forever.
     *
     * Orphans are marked rather than deleted here, so removal goes through the Delete stage: that
     * is where the outside-system cleanup lives, and routing through it keeps the removal
     * idempotent and retryable rather than half-done on a crash.
     */
    private async removeOrphans(working: WorkingRecord, context: RecordProcessorContext): Promise<void> {
        if (this.config.IsTest || !working.Identity.RecordID || working.Children.length === 0) {
            return;
        }
        // A Discover run over a source is adding, not replacing, so it reconciles nothing.
        if (working.Entity !== 'Content Item') {
            return;
        }
        if (working.Children[0].Entity === 'Content Item Chunk') {
            await this.removeSupersededChunks(working, context);
            return;
        }
        if (working.Children[0].Entity !== 'Content Item') {
            return;
        }

        const rv = RunView.FromMetadataProvider(context.provider);
        const existing = await rv.RunView<{ ID: string; URL: string }>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `ParentID='${working.Identity.RecordID}' AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
            },
            context.contextUser,
        );
        if (!existing.Success) {
            return;
        }

        const plan = ReconcileChildren(
            existing.Results.map((r) => ({ RecordID: r.ID, URL: r.URL })),
            working.Children.map((c) => ({ URL: c.Identity.EphemeralID })),
        );
        if (plan.Delete.length === 0) {
            return;
        }
        const marker = new ContentPipelineDeleteMarker(context.provider, context.contextUser);
        for (const orphan of plan.Delete) {
            try {
                await marker.MarkForDeletion('MJ: Content Items', orphan.RecordID);
            } catch (error) {
                LogError(
                    `PipelineProcessor: could not mark orphaned child '${orphan.RecordID}': ` +
                        `${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
    }

    /**
     * Mark chunks a shrinking re-segmentation left behind.
     *
     * Chunks are identified by position, so re-segmenting text that now yields five chunks where it
     * yielded eight updates the first five in place and leaves three orphans. They are not visibly
     * wrong — they hold real text from the previous version of the document — which is exactly why
     * this is easy to miss: they stay searchable, and they answer questions about content that no
     * longer says what they say. The autotagger superseded them; nothing here did.
     *
     * Marked rather than deleted, so removal goes through the Delete stage like everything else and
     * takes their vectors with it.
     */
    private async removeSupersededChunks(
        working: WorkingRecord,
        context: RecordProcessorContext,
    ): Promise<void> {
        const produced = working.Children.length;
        const rv = RunView.FromMetadataProvider(context.provider);
        const leftover = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Content Item Chunks',
                ExtraFilter:
                    `ContentItemID='${EscapeSQLString(working.Identity.RecordID!)}' AND Sequence >= ${produced} ` +
                    `AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
            },
            context.contextUser,
        );
        if (!leftover.Success || leftover.Results.length === 0) {
            return;
        }
        const marker = new ContentPipelineDeleteMarker(context.provider, context.contextUser);
        for (const chunk of leftover.Results) {
            try {
                await marker.MarkForDeletion('MJ: Content Item Chunks', chunk.ID);
            } catch (error) {
                LogError(
                    `PipelineProcessor: could not mark superseded chunk '${chunk.ID}': ` +
                        `${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
    }

    /**
     * What a child inherits from the record that produced it.
     *
     * A Content Item found by walking a source belongs to that source; a block split out of a
     * Content Item belongs to the same source and names its parent.
     */
    private childDefaults(working: WorkingRecord): Record<string, unknown> {
        if (working.Entity === 'Content Source') {
            return { ContentSourceID: working.Identity.RecordID };
        }
        // A Content Item produces two kinds of record, and the committer writes only the columns
        // the child's entity actually has:
        //   * chunks, which belong to it by ContentItemID — slices of this item's own text;
        //   * child Content Items, when an artifact EXPANDS into other items: a zip extracting to
        //     files, a CSV whose rows are links that each become an item. Those carry ParentID and
        //     nest to arbitrary depth, so a zip inside a zip works without a special case.
        //
        // The distinction is whether the content is a *slice of this document* (chunk) or *a
        // different document this one contained* (child item).
        return {
            ContentItemID: working.Identity.RecordID,
            ParentID: working.Identity.RecordID,
            ContentSourceID: working.GetExtension<string>('Pipeline', 'contentSourceID'),
        };
    }

    /**
     * Whether this record is marked for removal.
     *
     * Delete itself is exempt, since skipping the record would mean never removing it.
     */
    private isPendingDelete(working: WorkingRecord): boolean {
        if (this.stages.some((s) => s.StatusField === 'DeleteStatus')) {
            return false;
        }
        return working.GetExtension<string>('Pipeline', 'deleteStatus') === 'Pending';
    }

    /** A freshly produced record starts at the beginning of its own pipeline. */
    private childStatusField(child: WorkingRecord): string {
        return child.Entity === 'Content Item Chunk' ? 'TaggingStatus' : 'ExtractionStatus';
    }

    /**
     * The status a freshly produced record starts at.
     *
     * `Pending` for something only discovered — it still needs its text. `Complete` for an item that
     * was produced *with* its text, which is the case for every item expanded out of a container:
     * re-fetching its URL would return the container it came out of, not the member.
     */
    private childStatus(child: WorkingRecord): string {
        if (child.Entity === 'Content Item Chunk') {
            return 'Pending';
        }
        const text = child.Get('Text');
        return typeof text === 'string' && text.length > 0 ? 'Complete' : 'Pending';
    }

    /**
     * The status to commit for the stage that ran, or `null` to leave it alone.
     *
     * A failure is final when it is fatal, when it is transient on the last attempt, or when the
     * run is filter-scoped — filter scope does not retry. Without the attempt number a
     * dead-lettered record would still look ready and would be queued again indefinitely.
     */
    private statusFor(outcome: StageOutcome, hints: PipelineRecordHints, stage: BasePipelineStage): string | null {
        switch (outcome.Status) {
            case 'Complete':
                return stage.CompleteStatus;
            case 'Skipped':
                return 'Skipped';
            case 'Failed':
            case 'Retry': {
                const final =
                    !outcome.IsTransient ||
                    this.config.Scope === 'Filter' ||
                    (hints.Attempt ?? 1) >= (hints.MaxAttempts ?? 1);
                return final ? 'Failed' : null;
            }
        }
    }

    /**
     * This run's access resolver.
     *
     * Lazily built and held for the life of the processor, which is the life of the run. The
     * sessions it caches are keyed per source AND per role, so two stages reading the same source as
     * the same principal share one credential exchange.
     */
    private access(context: RecordProcessorContext): AccessResolver {
        this._access ??= new AccessResolver(context.provider, context.contextUser);
        return this._access;
    }
    private _access?: AccessResolver;

    /** Build the per-record context a stage sees. */
    private buildContext(
        stage: BasePipelineStage,
        context: RecordProcessorContext,
        hints: PipelineRecordHints,
        key: string,
        signal: AbortSignal,
    ): StageContext {
        const progress = this.progress;
        const logger: StageLogger = {
            Info: (message) => LogStatus(`[${stage.Name}] ${message}`),
            Warning: (message) => LogStatus(`[${stage.Name}] WARNING: ${message}`),
            Error: (message) => LogError(`[${stage.Name}] ${message}`),
        };
        return {
            ContextUser: context.contextUser,
            Provider: context.provider,
            Configuration: this.config.Configuration,
            IsTest: this.config.IsTest,
            Scope: this.config.Scope,
            Attempt: hints.Attempt ?? 1,
            MaxAttempts: hints.MaxAttempts ?? 1,
            IsReplay: hints.IsReplay ?? false,
            Signal: signal,
            ReportProgress: (message: string) => progress?.ReportProgress(key, message),
            Log: logger,
            // One resolver for the whole run, so every stage touching the same source shares its
            // session rather than each opening its own.
            ResolveAccess: (contentSourceID: string, role?: string) =>
                this.access(context).Artifact(contentSourceID, role),
        };
    }

    /**
     * Turn a thrown error into an outcome.
     *
     * A bare `Error` is treated as fatal deliberately: a stage that has not thought about whether
     * its failure is worth retrying should not have its records retried on a guess.
     */
    private classify(error: unknown): StageOutcome {
        if (error instanceof TransientStageError) {
            return Outcome.Retry(error.message);
        }
        if (error instanceof FatalStageError) {
            return Outcome.Fatal(error.message);
        }
        return Outcome.Fatal(error instanceof Error ? error.message : String(error));
    }

    /** Translate a stage outcome into the shape Record Set Processing records. */
    private toRecordResult(
        outcome: StageOutcome,
        started: number,
        hints: PipelineRecordHints,
        committed: string[] | null,
        childrenCommitted = 0,
        childrenProduced = 0,
    ): RecordResult {
        const status = outcome.Status === 'Complete' ? 'Succeeded' : outcome.Status === 'Skipped' ? 'Skipped' : 'Failed';
        return {
            Status: status,
            DurationMs: Date.now() - started,
            AttemptCount: hints.Attempt ?? 1,
            ErrorMessage: status === 'Failed' ? (outcome.Message ?? undefined) : undefined,
            ResultPayload: {
                Stage: this.stages[this.stages.length - 1].Name,
                Stages: this.stages.map((s) => s.Name),
                Outcome: outcome.Status,
                IsTransient: outcome.IsTransient,
                IsTest: this.config.IsTest,
                CommittedColumns: committed,
                ChildrenProduced: childrenProduced,
                ChildrenCommitted: childrenCommitted,
                Message: outcome.Message,
            },
        };
    }
}
