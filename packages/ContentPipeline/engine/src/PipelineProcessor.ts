/**
 * @fileoverview {@link PipelineProcessor} — the one Record Set Processing processor every pipeline stage
 * runs behind. Per record it hydrates, runs the configured stage(s), commits unless this is a test, and
 * returns the outcome.
 *
 * @module @memberjunction/content-pipeline
 */

import { IRecordProcessor, RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import {
    BasePipelineStage,
    DEFAULT_ACCESS_ROLE,
    FatalStageError,
    Outcome,
    ResolvedPipelineTuning,
    ResolveTuning,
    StageContext,
    StageLogger,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';
import { NormalizeUUID, UUIDMap } from '@memberjunction/global';
import { IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { AccessResolver } from './AccessResolver.js';
import { GetEntityName } from './EntityFieldMap.js';
import { ChildCommitDefaults, WorkingRecordCommitter } from './WorkingRecordCommitter.js';
import { WorkingRecordHydrator } from './WorkingRecordHydrator.js';
import { ContentPipelineDeleteMarker } from './ContentPipelineDeleteMarker.js';
import { ContentSourceConfigurationResolver } from './ContentSourceConfigurationResolver.js';
import { DISCOVER_STAGE, IsSyncMode } from './stages/DiscoverStage.js';
import { WhereEqual } from './Filters.js';

/** How a {@link PipelineProcessor} is configured for one run. */
export interface PipelineProcessorConfig {
    /** Stage names, in order. Production runs name one; a test run may chain several in memory. */
    Stages: readonly string[];
    /** When true nothing is committed; the run reports what would have been written. */
    IsTest: boolean;
    /** Configuration handed to every stage. */
    Configuration: Record<string, unknown>;
    /** Per-stage, per-record wall-clock budget in ms. Enforced by aborting the stage's signal. */
    StageBudgetMs?: number;
}

/** Builds the two storage-touching helpers per record; tests substitute doubles. */
export interface StorageFactories {
    Hydrator(provider: IMetadataProvider, contextUser: UserInfo): WorkingRecordHydrator;
    Committer(provider: IMetadataProvider, contextUser: UserInfo): WorkingRecordCommitter;
}

/** The real pair, reading and writing through the standard save path. */
export const DefaultStorageFactories: StorageFactories = {
    Hydrator: (provider, contextUser) => new WorkingRecordHydrator(provider, contextUser),
    Committer: (provider, contextUser) => new WorkingRecordCommitter(provider, contextUser),
};

/** Live per-record status, implemented by `PipelineProcessRunTracker`. */
export interface ProgressReporter {
    /** Open a record's status row before its stage starts. Failures are logged, never fatal. */
    OpenRecord(key: string, stageName: string): Promise<void>;
    ReportProgress(key: string, message: string): void;
    /** One detail row for a record the platform never handed us (Discover's items, an archive's members). */
    RecordChildOutcome?(parentRecord: RecordRef, childKey: string, result: RecordResult, childEntityID?: string): Promise<void>;
}

interface StageBudget {
    Signal: AbortSignal;
    Expired: boolean;
    Dispose(): void;
}

/** Runs the configured stages over one record at a time. Built once per run. */
export class PipelineProcessor implements IRecordProcessor {
    private readonly stages: BasePipelineStage[];

    /** Present only when the last stage has a `Finalize`; Record Set Processing checks for it. */
    public ProcessBatch?: (records: RecordRef[], context: RecordProcessorContext) => Promise<Map<string, RecordResult>>;

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
        if (typeof this.lastStage.Finalize === 'function') {
            this.ProcessBatch = (records, context) => this.processBatch(records, context);
        }
    }

    /** The resolved stages, in run order. */
    public get Stages(): readonly BasePipelineStage[] {
        return this.stages;
    }

    private get lastStage(): BasePipelineStage {
        return this.stages[this.stages.length - 1];
    }

    /** Hydrate, run the stages, commit children then the record (unless a test), return the outcome. */
    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        const started = Date.now();
        try {
            const working = await this.storage.Hydrator(context.provider, context.contextUser).Hydrate(this.stages[0].Entity, record.RecordID);
            if (this.isPendingDelete(working)) {
                return this.toRecordResult(Outcome.Skipped('record is pending delete'), started, null);
            }
            let outcome = await this.runStages(working, context, record.RecordID);
            let syncOrphans: Orphan[] = [];
            if (outcome.Status === 'Complete' && working.Entity === 'Content Source' && IsSyncMode(this.config.Configuration)) {
                const syncCheck = await this.evaluateSyncWalk(working, context);
                if (syncCheck.Failure) {
                    outcome = syncCheck.Failure;
                } else {
                    syncOrphans = syncCheck.Orphans;
                }
            }
            // Children before the parent: the parent's commit says "done" (Discover clears ForceDiscovery),
            // so a child that failed must leave the parent to be retried. Child commits are idempotent.
            let children = 0;
            if (outcome.Status === 'Complete') {
                const persisted = await this.persistChildren(working, record, context);
                children = persisted.Committed;
                if (persisted.Failed > 0) {
                    outcome = Outcome.Retry(`${persisted.Failed} of ${working.Children.length} produced record(s) could not be committed`);
                } else if (syncOrphans.length > 0 && !this.config.IsTest) {
                    await this.markOrphansForDeletion(syncOrphans, context);
                }
            } else if (outcome.Status === 'Skipped') {
                await this.sweepOrphans(working, context);
            }
            const committed = await this.persist(working, outcome, context);
            return this.toRecordResult(outcome, started, committed, children, working.Children.length);
        } catch (error) {
            return this.toRecordResult(this.classify(error), started, null);
        }
    }

    /** Run the page per record, then hand the completed records to the last stage's `Finalize` in one call. */
    private async processBatch(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult>> {
        const results = new Map<string, RecordResult>();
        const ready = new UUIDMap<{ RecordID: string; Working: WorkingRecord }>();
        const hydrator = this.storage.Hydrator(context.provider, context.contextUser);
        for (const record of records) {
            const started = Date.now();
            try {
                const working = await hydrator.Hydrate(this.stages[0].Entity, record.RecordID);
                if (this.isPendingDelete(working)) {
                    results.set(record.RecordID, this.toRecordResult(Outcome.Skipped('record is pending delete'), started, null));
                    continue;
                }
                const outcome = await this.runStages(working, context, record.RecordID);
                if (outcome.Status === 'Complete') {
                    ready.Set(record.RecordID, { RecordID: record.RecordID, Working: working });
                } else {
                    // Commit the non-Complete status too, or the record stays Pending and is selected forever.
                    results.set(record.RecordID, this.toRecordResult(outcome, started, await this.persist(working, outcome, context)));
                }
            } catch (error) {
                results.set(record.RecordID, this.toRecordResult(this.classify(error), started, null));
            }
        }
        if (ready.Size > 0) {
            await this.finalizeBatch(ready, results, context);
        }
        return results;
    }

    private async finalizeBatch(
        ready: UUIDMap<{ RecordID: string; Working: WorkingRecord }>,
        results: Map<string, RecordResult>,
        context: RecordProcessorContext,
    ): Promise<void> {
        const started = Date.now();
        const budget = this.startBudget();
        try {
            const workingList = [...ready.Values()].map((entry) => entry.Working);
            const finalized = await this.lastStage.Finalize!(workingList, this.buildContext(this.lastStage, context, 'batch', budget.Signal));
            for (const { Key, Outcome: rawOutcome } of finalized) {
                const entry = ready.Get(Key);
                const outcome =
                    budget.Expired && rawOutcome.Status === 'Complete'
                        ? Outcome.Retry(`${this.lastStage.Name} ran out of its ${this.config.StageBudgetMs}ms budget`)
                        : rawOutcome;
                const committed = entry ? await this.persist(entry.Working, outcome, context) : null;
                results.set(entry?.RecordID ?? Key, this.toRecordResult(outcome, started, committed));
            }
        } catch (error) {
            const outcome = this.classify(error);
            for (const entry of ready.Values()) {
                const committed = await this.persist(entry.Working, outcome, context).catch(() => null);
                results.set(entry.RecordID, this.toRecordResult(outcome, started, committed));
            }
        } finally {
            budget.Dispose();
        }
    }

    /**
     * Run each stage in order, stopping at the first non-Complete. A stage on the same entity continues over
     * the in-place record (or its expanded same-entity children for archives/multi-block items); a stage on a
     * different entity runs over the children produced by earlier stages.
     */
    private async runStages(working: WorkingRecord, context: RecordProcessorContext, key: string): Promise<StageOutcome> {
        let last: StageOutcome = Outcome.Complete();
        let current: WorkingRecord[] = [working];
        for (const stage of this.stages) {
            const targets = current.filter((c) => c.Entity === stage.Entity);
            if (targets.length === 0) {
                return last; // nothing of this entity was produced — not a failure
            }
            await this.openStatus(key, stage.Name);
            last = await this.runStageOver(stage, targets, context, key);
            if (last.Status !== 'Complete') {
                return last;
            }
            current = targets.flatMap((t) =>
                t.Children.some((c) => c.Entity === t.Entity) ? [...t.Children] : [t, ...t.Children],
            );
        }
        return last;
    }

    /**
     * Run one stage over several records; one failure does not stop the rest, and the worst outcome is
     * reported. Progress goes to the run's record (`key`), the only one with an open status row.
     */
    private async runStageOver(
        stage: BasePipelineStage,
        targets: readonly WorkingRecord[],
        context: RecordProcessorContext,
        key: string,
    ): Promise<StageOutcome> {
        let worst: StageOutcome = Outcome.Complete();
        for (const target of targets) {
            const outcome = await this.runOne(stage, target, context, key);
            if (outcome.Status !== 'Complete' && worst.Status === 'Complete') {
                worst = outcome;
            }
        }
        return worst;
    }

    private async runOne(stage: BasePipelineStage, target: WorkingRecord, context: RecordProcessorContext, key: string): Promise<StageOutcome> {
        const budget = this.startBudget();
        try {
            const outcome = await stage.Run(target, this.buildContext(stage, context, key, budget.Signal));
            // Finishing tidily after the budget ran out is a partial result, not a completed pass.
            return budget.Expired && outcome.Status === 'Complete'
                ? Outcome.Retry(`${stage.Name} ran out of its ${this.config.StageBudgetMs}ms budget`)
                : outcome;
        } catch (error) {
            return this.classify(error);
        } finally {
            budget.Dispose();
        }
    }

    /** A stop signal that fires when the configured per-stage budget runs out. */
    private startBudget(): StageBudget {
        const controller = new AbortController();
        const ms = this.config.StageBudgetMs;
        const budget: StageBudget = { Signal: controller.signal, Expired: false, Dispose: () => clearTimeout(timer) };
        const timer = ms && ms > 0
            ? setTimeout(() => {
                  budget.Expired = true;
                  controller.abort(new Error(`stage budget of ${ms}ms exhausted`));
              }, ms)
            : undefined;
        return budget;
    }

    private async openStatus(key: string, stageName: string): Promise<void> {
        try {
            await this.progress?.OpenRecord(key, stageName);
        } catch (error) {
            LogError(`PipelineProcessor: could not open status for '${key}': ${messageOf(error)}`);
        }
    }

    /** Commit the record's status for the last stage, unless this is a test or the stage removed the row. */
    private async persist(working: WorkingRecord, outcome: StageOutcome, context: RecordProcessorContext): Promise<string[] | null> {
        if (this.config.IsTest) {
            return null;
        }
        if (working.GetExtension<boolean>('Pipeline', 'purged')) {
            return [];
        }
        const status = this.statusFor(outcome);
        if (status === null) {
            return null;
        }
        const committer = this.storage.Committer(context.provider, context.contextUser);
        const result = await committer.Commit(working, this.lastStage.StatusField, status, outcome.Status === 'Complete');
        return [...result.ColumnsWritten];
    }

    /** Commit what the stage produced and report one outcome per child. A test reports children by URL. */
    private async persistChildren(
        working: WorkingRecord,
        record: RecordRef,
        context: RecordProcessorContext,
    ): Promise<{ Committed: number; Failed: number }> {
        if (working.Children.length === 0) {
            await this.sweepOrphans(working, context);
            return { Committed: 0, Failed: 0 };
        }
        const committer = this.storage.Committer(context.provider, context.contextUser);
        const defaults = this.childDefaults(working);
        let committed = 0;
        let failed = 0;
        for (const child of working.Children) {
            const outcome = await this.persistOneChild(child, working, defaults, committer);
            if (outcome.Status === 'Failed') {
                failed++;
            } else if (!this.config.IsTest) {
                committed++;
            }
            await this.progress?.RecordChildOutcome?.(record, child.Identity.Key, outcome, this.entityIDFor(child.Entity, context));
            if (outcome.Status !== 'Failed' && child.Children.length > 0) {
                if (typeof defaults.ContentSourceID === 'string' && !child.GetExtension<string>('Pipeline', 'contentSourceID')) {
                    child.SetExtension('Pipeline', 'contentSourceID', defaults.ContentSourceID);
                }
                const nested = await this.persistChildren(child, record, context);
                committed += nested.Committed;
                failed += nested.Failed;
            }
        }
        if (failed === 0) {
            // Only a complete set of children says what no longer exists.
            await this.sweepOrphans(working, context);
        }
        return { Committed: committed, Failed: failed };
    }

    /**
     * Evaluate a Sync walk against the source's live top-level items that existed when the walk started.
     * Enforces the zero-yield and `MaxSyncRemovalShare` safeguards before anything is committed or marked.
     */
    private async evaluateSyncWalk(
        working: WorkingRecord,
        context: RecordProcessorContext,
    ): Promise<{ Failure?: StageOutcome; Orphans: Orphan[] }> {
        if (this.config.IsTest || !working.Identity.RecordID) {
            return { Orphans: [] };
        }
        const live = await RunView.FromMetadataProvider(context.provider).RunView<{
            ID: string;
            URL: string;
            __mj_CreatedAt?: Date | string;
        }>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: WhereEqual({ ContentSourceID: working.Identity.RecordID, ParentID: null, DeleteStatus: null }),
                Fields: ['ID', 'URL', '__mj_CreatedAt'],
                ResultType: 'simple',
            },
            context.contextUser,
        );
        if (!live.Success) {
            return {
                Failure: Outcome.Fatal(
                    `Sync reconciliation could not query live items for source '${working.Identity.RecordID}': ${live.ErrorMessage}`,
                ),
                Orphans: [],
            };
        }
        const tuning =
            working.GetExtension<ResolvedPipelineTuning>(DISCOVER_STAGE, 'tuning') ?? ResolveTuning(this.config.Configuration);
        return this.reconcileSyncOrphans(working, live.Results, tuning);
    }

    private reconcileSyncOrphans(
        working: WorkingRecord,
        liveRows: readonly { ID: string; URL: string; __mj_CreatedAt?: Date | string }[],
        tuning: ResolvedPipelineTuning,
    ): { Failure?: StageOutcome; Orphans: Orphan[] } {
        const walkStartedAt = working.GetExtension<Date>(DISCOVER_STAGE, 'walkStartedAt');
        const existingBeforeWalk = liveRows.filter((row) => {
            if (!walkStartedAt || !row.__mj_CreatedAt) {
                return true;
            }
            const createdMs = row.__mj_CreatedAt instanceof Date ? row.__mj_CreatedAt.getTime() : new Date(row.__mj_CreatedAt).getTime();
            return Number.isNaN(createdMs) || createdMs <= walkStartedAt.getTime() - tuning.ClockSkewOverlapMs;
        });
        if (existingBeforeWalk.length === 0) {
            return { Orphans: [] };
        }
        if (working.Children.length === 0) {
            return {
                Failure: Outcome.Fatal(
                    `Sync walk returned 0 items for source '${working.Identity.RecordID}' which has ${existingBeforeWalk.length} live item(s); refusing to mark existing items for deletion`,
                ),
                Orphans: [],
            };
        }
        const produced = new Set(working.Children.map((c) => c.Identity.EphemeralID));
        const missing = existingBeforeWalk.filter((r) => !produced.has(r.URL));
        const maxShare = tuning.MaxSyncRemovalShare;
        const share = missing.length / existingBeforeWalk.length;
        if (share > maxShare) {
            return {
                Failure: Outcome.Fatal(
                    `Sync walk would remove ${missing.length} of ${existingBeforeWalk.length} live item(s) (${(share * 100).toFixed(1)}%), exceeding MaxSyncRemovalShare (${(maxShare * 100).toFixed(1)}%); refusing to mark items for deletion`,
                ),
                Orphans: [],
            };
        }
        return { Orphans: missing.map((r) => ({ Entity: 'MJ: Content Items' as const, ID: r.ID })) };
    }

    private async markOrphansForDeletion(orphans: readonly Orphan[], context: RecordProcessorContext): Promise<void> {
        const marker = new ContentPipelineDeleteMarker(context.provider, context.contextUser);
        for (const orphan of orphans) {
            await marker.MarkForDeletion(orphan.Entity, orphan.ID);
        }
    }

    /** The MJ entity id for a child's detail row; undefined falls back to the parent's. */
    private entityIDFor(entity: WorkingRecordEntity, context: RecordProcessorContext): string | undefined {
        return context.provider.EntityByName(GetEntityName(entity))?.ID;
    }

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
                    Stage: this.lastStage.Name,
                    ProducedBy: working.Identity.Key,
                    IsTest: this.config.IsTest,
                    URL: child.Identity.EphemeralID,
                    Complete: child.IsComplete,
                },
            };
        } catch (error) {
            return { Status: 'Failed', AttemptCount: 1, ErrorMessage: messageOf(error) };
        }
    }

    /** Housekeeping: a failed sweep must not fail a record whose stage succeeded; the next run sweeps again. */
    private async sweepOrphans(working: WorkingRecord, context: RecordProcessorContext): Promise<void> {
        if (this.config.IsTest || !working.Identity.RecordID || working.Entity !== 'Content Item') {
            return; // Discover over a source adds; Sync over a source reconciles via evaluateSyncWalk.
        }
        if (typeof (context.provider as { RunView?: unknown })?.RunView !== 'function') {
            return;
        }
        try {
            const firstEntity = working.Children[0]?.Entity;
            const isSegment = firstEntity === 'Content Item Chunk' || (!firstEntity && this.lastStage.StatusField === 'SegmentationStatus');
            const isExtract = firstEntity === 'Content Item' || (!firstEntity && this.lastStage.StatusField === 'ExtractionStatus');
            if (!isSegment && !isExtract) {
                return;
            }
            const orphans = isSegment
                ? await this.supersededChunks(working, context)
                : await this.orphanedItems(working, context);
            await this.markOrphansForDeletion(orphans, context);
        } catch (error) {
            LogError(`PipelineProcessor: orphan reconciliation failed for '${working.Identity.Key}': ${messageOf(error)}`);
        }
    }

    /** Child items a re-extraction no longer produces, matched by URL. */
    private async orphanedItems(working: WorkingRecord, context: RecordProcessorContext): Promise<Orphan[]> {
        const existing = await RunView.FromMetadataProvider(context.provider).RunView<{ ID: string; URL: string }>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `${WhereEqual({ ParentID: working.Identity.RecordID })} AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                Fields: ['ID', 'URL'],
                ResultType: 'simple',
            },
            context.contextUser,
        );
        if (!existing.Success) {
            return [];
        }
        const produced = new Set(working.Children.map((c) => c.Identity.EphemeralID));
        return existing.Results.filter((r) => !produced.has(r.URL)).map((r) => ({ Entity: 'MJ: Content Items' as const, ID: r.ID }));
    }

    /**
     * Every live chunk a re-segmentation replaced. Re-segmenting mints fresh chunks rather than overwriting
     * by position, so nothing that recorded chunk N ends up pointing at text it never saw.
     */
    private async supersededChunks(working: WorkingRecord, context: RecordProcessorContext): Promise<Orphan[]> {
        const current = new Set(
            working.Children.map((c) => c.Identity.RecordID).filter((id): id is string => !!id).map(NormalizeUUID),
        );
        const live = await RunView.FromMetadataProvider(context.provider).RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Content Item Chunks',
                ExtraFilter: WhereEqual({ ContentItemID: working.Identity.RecordID, DeleteStatus: null }),
                Fields: ['ID'],
                ResultType: 'simple',
            },
            context.contextUser,
        );
        if (!live.Success) {
            return [];
        }
        return live.Results.filter((c) => !current.has(NormalizeUUID(c.ID))).map((c) => ({ Entity: 'MJ: Content Item Chunks' as const, ID: c.ID }));
    }

    /**
     * What a child inherits. An item found under a source belongs to it; a record produced from a Content
     * Item is either a chunk (a slice of it, by ContentItemID) or a child item (a document it contained, by
     * ParentID) — the committer writes only the columns the child's entity has.
     */
    private childDefaults(working: WorkingRecord): Record<string, unknown> {
        if (working.Entity === 'Content Source') {
            return { ContentSourceID: working.Identity.RecordID };
        }
        return {
            ContentItemID: working.Identity.RecordID,
            ParentID: working.Identity.RecordID,
            ContentSourceID: working.GetExtension<string>('Pipeline', 'contentSourceID'),
        };
    }

    /** Every stage but Delete skips a record that is pending delete. */
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
     * Pending when it still needs its text; Complete when it was produced with it (an archive member —
     * re-fetching its URL would return the archive); Skipped when marked complete with nothing to read.
     */
    private childStatus(child: WorkingRecord): string {
        if (child.Entity === 'Content Item Chunk') {
            return 'Pending';
        }
        const text = child.Get('Text');
        if (typeof text === 'string' && text.length > 0) {
            return 'Complete';
        }
        return child.IsComplete ? 'Skipped' : 'Pending';
    }

    /** The status to commit for the last stage, or `null` to leave it alone. */
    private statusFor(outcome: StageOutcome): string | null {
        switch (outcome.Status) {
            case 'Complete':
                return this.lastStage.CompleteStatus;
            case 'Skipped':
                return this.lastStage.StatusForOutcome('Skipped');
            default:
                return this.lastStage.StatusForOutcome('Failed');
        }
    }

    /**
     * One {@link AccessResolver} per run, built lazily so a run that never asks for access never
     * constructs one. Every stage in the run shares it, so a session opened by Discover is reused by
     * Extract rather than opened a second time.
     */
    private access(context: RecordProcessorContext): AccessResolver {
        this._access ??= new AccessResolver(
            context.provider,
            context.contextUser,
            new ContentSourceConfigurationResolver(context.provider, context.contextUser),
            this.config.Configuration,
        );
        return this._access;
    }
    private _access: AccessResolver | null = null;

    /** Build the per-record context a stage sees. */
    private buildContext(stage: BasePipelineStage, context: RecordProcessorContext, key: string, signal: AbortSignal): StageContext {
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
            Signal: signal,
            ReportProgress: (message: string) => this.progress?.ReportProgress(key, message),
            Log: logger,
            ResolveAccess: (contentSourceID: string) => this.access(context).Artifact(contentSourceID, DEFAULT_ACCESS_ROLE),
        };
    }

    /** A bare `Error` is fatal: a stage that never said its failure is worth retrying is not retried on a guess. */
    private classify(error: unknown): StageOutcome {
        if (error instanceof TransientStageError) {
            return Outcome.Retry(error.message);
        }
        if (error instanceof FatalStageError) {
            return Outcome.Fatal(error.message);
        }
        return Outcome.Fatal(messageOf(error));
    }

    private toRecordResult(
        outcome: StageOutcome,
        started: number,
        committed: string[] | null,
        childrenCommitted = 0,
        childrenProduced = 0,
    ): RecordResult {
        const status = outcome.Status === 'Complete' ? 'Succeeded' : outcome.Status === 'Skipped' ? 'Skipped' : 'Failed';
        return {
            Status: status,
            DurationMs: Date.now() - started,
            AttemptCount: 1,
            ErrorMessage: status === 'Failed' ? (outcome.Message ?? undefined) : undefined,
            ResultPayload: {
                Stage: this.lastStage.Name,
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

interface Orphan {
    Entity: 'MJ: Content Items' | 'MJ: Content Item Chunks';
    ID: string;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
