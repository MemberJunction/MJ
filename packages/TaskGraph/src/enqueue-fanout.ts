/**
 * @fileoverview Coordinates `Enqueue` steps, early-completion reconciliation, bounded WorkQueue
 * fan-out publishing (`ForEach` + `Enqueue`), idempotent deduplication, and bounded isolated
 * runner execution pools.
 *
 * @module @memberjunction/task-graph
 */
import {
    IMetadataProvider,
    LimitsConfigResolver,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { MJTaskEntity } from '@memberjunction/core-entities';
import {
    BuildEnqueueCorrelationKey,
    GetValueFromPath,
    type ForEachEnqueueOperation,
    type ForEachOperation,
} from '@memberjunction/ai-core-plus';
import { BaseSingleton, EscapeSQLString } from '@memberjunction/global';
import type { TaskStepConfiguration } from './decision-node';
import { TaskClaimStore } from './TaskClaimStore';
import { KickTaskGraphDispatchers } from './task-graph-kick';
import {
    ComposeWaitingStepOutput,
    ParseStepConfiguration,
    PayloadAtStartOf,
    WAITING_STEP_MARKER,
    WaitingStepOutputTaint,
} from './waiting-steps';
import {
    TaskGraphCallerNotificationService,
    TaskGraphQueueRegistry,
    ResolveServiceUser,
    SaveTaskWithAuthority,
    type TaskGraphEnqueueFanOutItemPayload,
    type TaskGraphWorkQueuePublishRequest,
} from './queue-dispatch';

/** Early completion entry buffered when a completion arrives before waiting-state persistence finishes. */
export interface EarlyCompletionEntry {
    CorrelationKey: string;
    ItemIndex?: number;
    Status: 'Complete' | 'Failed';
    Payload?: Record<string, unknown> | null;
    ErrorMessage?: string | null;
    ReceivedAt: string;
}

/** Result of processing one `ForEach` + `Enqueue` fan-out item completion. */
export interface FanOutItemCompletionOutcome {
    Success: boolean;
    DuplicateIgnored: boolean;
    FanOutSettled: boolean;
    FanOutStatus?: 'Complete' | 'Failed';
    ErrorMessage?: string;
}

/** Compact bitset stored as lowercase hex so 10,000 items occupy only ~2.5 KB in JSON. */
export class CompactCompletionBitmap {
    private readonly bytes: Uint8Array;

    public constructor(public readonly TotalBits: number, hex?: string) {
        const byteLen = Math.max(0, Math.ceil(TotalBits / 8));
        this.bytes = new Uint8Array(byteLen);
        if (hex && hex.length > 0) {
            const limit = Math.min(byteLen, Math.floor(hex.length / 2));
            for (let i = 0; i < limit; i++) {
                const parsed = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
                if (Number.isFinite(parsed)) {
                    this.bytes[i] = parsed;
                }
            }
        }
    }

    /** Returns `true` if bit `index` was unset and is now marked `1`, or `false` if already set (duplicate). */
    public Mark(index: number): boolean {
        if (index < 0 || index >= this.TotalBits) return false;
        const byteIdx = index >> 3;
        const mask = 1 << (index & 7);
        if ((this.bytes[byteIdx] & mask) !== 0) {
            return false;
        }
        this.bytes[byteIdx] |= mask;
        return true;
    }

    /** Checks whether bit `index` is currently marked `1`. */
    public Has(index: number): boolean {
        if (index < 0 || index >= this.TotalBits) return false;
        return (this.bytes[index >> 3] & (1 << (index & 7))) !== 0;
    }

    /** Serializes the bitmap as compact lowercase hex. */
    public ToHex(): string {
        let out = '';
        for (let i = 0; i < this.bytes.length; i++) {
            out += this.bytes[i].toString(16).padStart(2, '0');
        }
        return out;
    }
}

/**
 * Host-wide bounded concurrency gate ensuring high-volume WorkQueue fan-outs never spawn
 * unbounded simultaneous isolated workers/runners.
 */
export class BoundedRunnerSemaphore extends BaseSingleton<BoundedRunnerSemaphore> {
    private activeCount = 0;
    private peakCount = 0;
    private queue: Array<() => void> = [];

    public constructor() {
        super();
    }

    public static get Instance(): BoundedRunnerSemaphore {
        return super.getInstance<BoundedRunnerSemaphore>();
    }

    /** Maximum concurrent executions observed since last {@link ResetMetrics}. */
    public get PeakActiveCount(): number {
        return this.peakCount;
    }

    /** Current active isolated runner executions. */
    public get ActiveCount(): number {
        return this.activeCount;
    }

    /** Resets instrumentation counters (for tests). */
    public ResetMetrics(): void {
        this.peakCount = this.activeCount;
    }

    /** Runs `work` once an execution slot below the resolved runner ceiling is available. */
    public async RunBounded<T>(requestedLimit: number | undefined, work: () => Promise<T>): Promise<T> {
        const limit = EffectiveIsolatedRunnerLimit(requestedLimit);
        await this.acquire(limit);
        try {
            return await work();
        } finally {
            this.release();
        }
    }

    private acquire(limit: number): Promise<void> {
        if (this.activeCount < limit) {
            this.activeCount++;
            if (this.activeCount > this.peakCount) this.peakCount = this.activeCount;
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.activeCount++;
                if (this.activeCount > this.peakCount) this.peakCount = this.activeCount;
                resolve();
            });
        });
    }

    private release(): void {
        this.activeCount = Math.max(0, this.activeCount - 1);
        const next = this.queue.shift();
        if (next) next();
    }
}

/** Resolves effective bounded isolated runner concurrency against configured ceiling. */
export function EffectiveIsolatedRunnerLimit(requested?: number): number {
    const ceiling = LimitsConfigResolver.Resolve().Limits.TaskGraphQueue.MaxConcurrentIsolatedRunners;
    if (typeof requested === 'number' && Number.isInteger(requested) && requested >= 1) {
        return Math.min(requested, ceiling);
    }
    return ceiling;
}

/** Resolves effective publish concurrency for `ForEach` + `Enqueue` against configured ceiling. */
export function EffectivePublishConcurrency(requested?: number): number {
    const ceiling = LimitsConfigResolver.Resolve().Limits.TaskGraphQueue.MaxEnqueuePublishConcurrency;
    if (typeof requested === 'number' && Number.isInteger(requested) && requested >= 1) {
        return Math.min(requested, ceiling);
    }
    return ceiling;
}

/**
 * Coordinates durable waiting registration, early-completion reconciliation, bounded 10k-item
 * WorkQueue batch publishing, and idempotent item settlement for `ForEach` + `Enqueue`.
 */
export class ForEachEnqueueCoordinator extends BaseSingleton<ForEachEnqueueCoordinator> {
    private earlyByKey = new Map<string, EarlyCompletionEntry[]>();
    private taskLocks = new Map<string, Promise<void>>();
    private activeStates = new Map<
        string,
        {
            state: NonNullable<NonNullable<TaskStepConfiguration['runtime']>['enqueueFanOut']>;
            config: TaskStepConfiguration;
            completedBmp: CompactCompletionBitmap;
            failedBmp: CompactCompletionBitmap;
            dirtySinceFlush: number;
            task: MJTaskEntity;
        }
    >();
    private peakPublishConcurrency = 0;

    public constructor() {
        super();
    }

    public static get Instance(): ForEachEnqueueCoordinator {
        return super.getInstance<ForEachEnqueueCoordinator>();
    }

    /** Highest concurrent batch publish count observed across fan-out operations. */
    public get PeakPublishConcurrency(): number {
        return this.peakPublishConcurrency;
    }

    /** Clears in-memory early-completion buffers and instrumentation counters (for tests). */
    public ResetState(): void {
        this.earlyByKey.clear();
        this.taskLocks.clear();
        this.activeStates.clear();
        this.peakPublishConcurrency = 0;
    }

    /** Buffers an early completion arriving before waiting-state persistence or publish finishes. */
    public BufferEarlyCompletion(entry: EarlyCompletionEntry): void {
        const list = this.earlyByKey.get(entry.CorrelationKey) ?? [];
        list.push(entry);
        this.earlyByKey.set(entry.CorrelationKey, list);
    }

    /** Consumes and returns buffered early completions for `correlationKey` (empty array when none). */
    public ConsumeEarlyCompletions(correlationKey: string): EarlyCompletionEntry[] {
        const list = this.earlyByKey.get(correlationKey) ?? [];
        this.earlyByKey.delete(correlationKey);
        return list;
    }

    /**
     * Parses a per-item correlation key formatted as `<baseKey>:item:<index>` into `{ BaseKey, ItemIndex }`,
     * or returns `null` when the key is not a fan-out item key.
     */
    public ParseFanOutItemCorrelationKey(correlationKey: string): { BaseKey: string; ItemIndex: number } | null {
        const marker = ':item:';
        const idx = correlationKey.lastIndexOf(marker);
        if (idx <= 0) return null;
        const baseKey = correlationKey.slice(0, idx);
        const rawIndex = correlationKey.slice(idx + marker.length);
        const itemIndex = Number(rawIndex);
        if (!Number.isInteger(itemIndex) || itemIndex < 0) return null;
        return { BaseKey: baseKey, ItemIndex: itemIndex };
    }

    /**
     * Initiates bounded `ForEach` + `Enqueue` fan-out when a `ForEach` step with `enqueue` is reached:
     * registers durable fan-out state BEFORE publishing items, publishes in bounded batches, and
     * reconciles any early completions that arrived before waiting registration or mid-publish.
     */
    public async StartFanOut(params: {
        Task: MJTaskEntity;
        Payload: Record<string, unknown>;
        InputTainted: boolean;
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
    }): Promise<boolean> {
        const config = ParseStepConfiguration(params.Task.Configuration);
        const forEach = config.forEach as ForEachOperation | undefined;
        const enqueue = forEach?.enqueue;
        if (!forEach || !enqueue) {
            return false;
        }

        const queueLimits = LimitsConfigResolver.Resolve().Limits.TaskGraphQueue;
        const items = resolveCollectionItems(forEach.collectionPath, params.Payload);
        if (items.length > queueLimits.MaxEnqueueItemsPerFanOut) {
            return this.failFanOutStep(
                params.Provider,
                params.Task,
                params.ContextUser,
                `ForEach + Enqueue collection length (${items.length}) exceeds MaxEnqueueItemsPerFanOut (${queueLimits.MaxEnqueueItemsPerFanOut}).`,
            );
        }

        const graphRunID = params.Task.ParentID ?? params.Task.ID;
        const correlationKey = resolveBaseCorrelationKey(graphRunID, params.Task.ID, enqueue.correlationKey, params.Payload);
        const topic = enqueue.topic?.trim() || queueLimits.DefaultEnqueueTopicName;
        const maxRetries = resolveMaxRetries(enqueue.maxRetries, queueLimits.MaxEnqueueRedeliveryAttempts);

        await this.persistInitialFanOutState(
            params.Task,
            config,
            {
                correlationKey,
                topic,
                totalItems: items.length,
                completedCount: 0,
                failedCount: 0,
                publishBatchCount: 0,
                peakPublishConcurrency: 0,
                completedBitmapHex: new CompactCompletionBitmap(items.length).ToHex(),
                failedBitmapHex: new CompactCompletionBitmap(items.length).ToHex(),
                status: 'Publishing',
                startedAt: new Date().toISOString(),
            },
            params.Payload,
            params.InputTainted,
            params.ContextUser,
        );

        if (items.length === 0) {
            return this.completeZeroItemFanOut(params.Provider, params.Task, config, params.Payload, correlationKey, params.ContextUser);
        }

        const publishResult = await this.publishFanOutItemsBounded(
            params.Task,
            forEach,
            enqueue,
            items,
            graphRunID,
            correlationKey,
            topic,
            maxRetries,
            params.Payload,
            params.ContextUser,
            params.Provider,
        );
        if (!publishResult.Success) {
            return this.failFanOutStep(
                params.Provider,
                params.Task,
                params.ContextUser,
                publishResult.ErrorMessage ?? 'Failed publishing queued fan-out items.',
            );
        }

        await this.markPublishFinished(params.Task.ID, publishResult.BatchCount, publishResult.PeakConcurrency, params.Provider, params.ContextUser);
        await this.reconcileEarlyCompletions(params.Task.ID, correlationKey, items.length, params.Provider, params.ContextUser);
        return true;
    }

    /**
     * Records completion or failure of one item in a `ForEach` + `Enqueue` fan-out idempotently.
     * Duplicate deliveries and repeated `CompleteWaitingStep` calls with the same item index are
     * deduplicated via the durable bitmap so `completedCount` is never double-counted.
     */
    public async RecordItemCompletion(params: {
        TaskID?: string;
        CorrelationKey?: string;
        ItemIndex?: number;
        Status: 'Complete' | 'Failed';
        Payload?: Record<string, unknown> | null;
        ErrorMessage?: string | null;
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
    }): Promise<FanOutItemCompletionOutcome> {
        const resolved = await this.resolveTargetTask(params);
        if (!resolved) {
            if (params.CorrelationKey) {
                const parsed = this.ParseFanOutItemCorrelationKey(params.CorrelationKey);
                this.BufferEarlyCompletion({
                    CorrelationKey: parsed ? parsed.BaseKey : params.CorrelationKey,
                    ItemIndex: params.ItemIndex ?? parsed?.ItemIndex,
                    Status: params.Status,
                    Payload: params.Payload,
                    ErrorMessage: params.ErrorMessage,
                    ReceivedAt: new Date().toISOString(),
                });
                return { Success: true, DuplicateIgnored: false, FanOutSettled: false };
            }
            return { Success: false, DuplicateIgnored: false, FanOutSettled: false, ErrorMessage: 'Fan-out task could not be located.' };
        }

        const itemIndex = resolved.ItemIndex ?? params.ItemIndex;
        if (itemIndex === undefined || !Number.isInteger(itemIndex) || itemIndex < 0) {
            return { Success: false, DuplicateIgnored: false, FanOutSettled: false, ErrorMessage: 'ItemIndex could not be determined.' };
        }

        return this.withTaskLock(resolved.TaskID, async () => {
            const serviceUser = ResolveServiceUser(params.ContextUser);
            let cached = this.activeStates.get(resolved.TaskID);
            if (!cached) {
                const loadedTask = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', serviceUser);
                if (!(await loadedTask.Load(resolved.TaskID))) {
                    return { Success: false, DuplicateIgnored: false, FanOutSettled: false, ErrorMessage: 'Fan-out task disappeared.' };
                }
                const loadedConfig = ParseStepConfiguration(loadedTask.Configuration);
                const loadedState = loadedConfig.runtime?.enqueueFanOut;
                if (!loadedState) {
                    this.BufferEarlyCompletion({
                        CorrelationKey: params.CorrelationKey ?? `${loadedTask.ParentID ?? loadedTask.ID}:${loadedTask.ID}`,
                        ItemIndex: itemIndex,
                        Status: params.Status,
                        Payload: params.Payload,
                        ErrorMessage: params.ErrorMessage,
                        ReceivedAt: new Date().toISOString(),
                    });
                    return { Success: true, DuplicateIgnored: false, FanOutSettled: false };
                }
                cached = {
                    task: loadedTask,
                    config: loadedConfig,
                    state: loadedState,
                    completedBmp: new CompactCompletionBitmap(loadedState.totalItems, loadedState.completedBitmapHex),
                    failedBmp: new CompactCompletionBitmap(loadedState.totalItems, loadedState.failedBitmapHex),
                    dirtySinceFlush: 0,
                };
                this.activeStates.set(resolved.TaskID, cached);
            }

            const { task, config, state, completedBmp, failedBmp } = cached;
            if (task.Status !== 'Pending' || state.status === 'Complete' || state.status === 'Failed') {
                return {
                    Success: true,
                    DuplicateIgnored: true,
                    FanOutSettled: true,
                    FanOutStatus: state.status === 'Failed' ? 'Failed' : 'Complete',
                };
            }

            if (completedBmp.Has(itemIndex) || failedBmp.Has(itemIndex)) {
                return { Success: true, DuplicateIgnored: true, FanOutSettled: false };
            }

            const continueOnError = Boolean((config.forEach as ForEachOperation | undefined)?.continueOnError);
            if (params.Status === 'Failed') {
                failedBmp.Mark(itemIndex);
                state.failedCount += 1;
                state.failedDetails = [
                    ...(state.failedDetails ?? []).slice(-19),
                    { itemIndex, errorMessage: params.ErrorMessage ?? 'Queued item failed.' },
                ];
                if (!continueOnError) {
                    state.failedBitmapHex = failedBmp.ToHex();
                    state.status = 'Failed';
                    state.completedAt = new Date().toISOString();
                    state.errorMessage = params.ErrorMessage ?? `Fan-out item ${itemIndex} failed.`;
                    task.Configuration = JSON.stringify({ ...config, runtime: { ...(config.runtime ?? {}), enqueueFanOut: state } });
                    await SaveTaskWithAuthority(task, serviceUser);
                    this.activeStates.delete(resolved.TaskID);
                    await this.settleWaitingFanOutTask(params.Provider, task, config, 'Failed', null, state.errorMessage, params.ContextUser);
                    return { Success: true, DuplicateIgnored: false, FanOutSettled: true, FanOutStatus: 'Failed' };
                }
            } else {
                completedBmp.Mark(itemIndex);
                state.completedCount += 1;
            }

            cached.dirtySinceFlush += 1;
            const settledCount = state.completedCount + state.failedCount;
            const allDone = settledCount >= state.totalItems;
            const flushInterval = state.totalItems <= 100 ? 1 : 100;

            if (allDone) {
                state.completedBitmapHex = completedBmp.ToHex();
                state.failedBitmapHex = failedBmp.ToHex();
                state.status = 'Complete';
                state.completedAt = new Date().toISOString();
                task.Configuration = JSON.stringify({ ...config, runtime: { ...(config.runtime ?? {}), enqueueFanOut: state } });
                await SaveTaskWithAuthority(task, serviceUser);
                this.activeStates.delete(resolved.TaskID);

                const summaryOutput = {
                    fanOutCorrelationKey: state.correlationKey,
                    totalItems: state.totalItems,
                    completedItems: state.completedCount,
                    failedItems: state.failedCount,
                    lastPayload: params.Payload ?? null,
                };
                await this.settleWaitingFanOutTask(
                    params.Provider,
                    task,
                    config,
                    'Complete',
                    summaryOutput,
                    null,
                    params.ContextUser,
                );
                return { Success: true, DuplicateIgnored: false, FanOutSettled: true, FanOutStatus: 'Complete' };
            }

            if (cached.dirtySinceFlush >= flushInterval) {
                state.completedBitmapHex = completedBmp.ToHex();
                state.failedBitmapHex = failedBmp.ToHex();
                task.Configuration = JSON.stringify({ ...config, runtime: { ...(config.runtime ?? {}), enqueueFanOut: state } });
                await SaveTaskWithAuthority(task, serviceUser);
                cached.dirtySinceFlush = 0;
            }

            return { Success: true, DuplicateIgnored: false, FanOutSettled: false };
        });
    }

    private async persistInitialFanOutState(
        task: MJTaskEntity,
        config: TaskStepConfiguration,
        initialState: NonNullable<NonNullable<TaskStepConfiguration['runtime']>['enqueueFanOut']>,
        payload: Record<string, unknown>,
        inputTainted: boolean,
        contextUser: UserInfo,
    ): Promise<void> {
        const serviceUser = ResolveServiceUser(contextUser);
        const nextConfig: TaskStepConfiguration = {
            ...config,
            runtime: {
                ...(config.runtime ?? {}),
                payloadAtStart: payload,
                isInputTainted: inputTainted,
                enqueueFanOut: initialState,
            },
        };
        task.Configuration = JSON.stringify(nextConfig);
        if (!(await SaveTaskWithAuthority(task, serviceUser))) {
            throw new Error(`Could not persist initial ForEach fan-out state for '${task.ID}'.`);
        }
    }

    private async completeZeroItemFanOut(
        provider: IMetadataProvider,
        task: MJTaskEntity,
        config: TaskStepConfiguration,
        payload: Record<string, unknown>,
        correlationKey: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        await this.settleWaitingFanOutTask(
            provider,
            task,
            config,
            'Complete',
            { fanOutCorrelationKey: correlationKey, totalItems: 0, completedItems: 0, failedItems: 0 },
            null,
            contextUser,
            payload,
        );
        return true;
    }

    private async publishFanOutItemsBounded(
        task: MJTaskEntity,
        forEach: ForEachOperation,
        enqueue: ForEachEnqueueOperation,
        items: unknown[],
        graphRunID: string,
        correlationKey: string,
        topic: string,
        maxRetries: number,
        payload: Record<string, unknown>,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<{ Success: boolean; BatchCount: number; PeakConcurrency: number; ErrorMessage?: string }> {
        const limits = LimitsConfigResolver.Resolve().Limits.TaskGraphQueue;
        const publishConcurrency = EffectivePublishConcurrency(enqueue.publishConcurrency);
        const batchSize = Math.max(1, limits.EnqueuePublishBatchSize);
        const itemVar = forEach.itemVariable?.trim() || 'item';
        const handlerKey = enqueue.handlerKey?.trim() || 'TaskGraph.EnqueueItem';
        const publishedAt = new Date().toISOString();
        // Omit the fanned-out collection array from per-item messages so 10,000 items NEVER
        // multiply into 10,000 x 10,000 = 100M objects or blow broker payload ceilings.
        const itemBasePayload = {
            ...stripCollectionRoot(payload, forEach.collectionPath),
            ...(enqueue.payloadTemplate ?? {}),
        };

        const batches: Array<TaskGraphWorkQueuePublishRequest<TaskGraphEnqueueFanOutItemPayload>[]> = [];
        for (let start = 0; start < items.length; start += batchSize) {
            const end = Math.min(items.length, start + batchSize);
            const batch: TaskGraphWorkQueuePublishRequest<TaskGraphEnqueueFanOutItemPayload>[] = [];
            for (let i = start; i < end; i++) {
                const itemCorrelationKey = BuildEnqueueCorrelationKey(graphRunID, task.ID, correlationKey, i);
                batch.push({
                    Topic: topic,
                    HandlerKey: handlerKey,
                    CorrelationId: itemCorrelationKey,
                    IdempotencyKey: itemCorrelationKey,
                    SubjectType: 'MJ: Tasks',
                    SubjectId: task.ID,
                    MaxAttempts: maxRetries + 1,
                    Payload: {
                        Kind: 'TaskGraph.EnqueueFanOutItem',
                        GraphRunID: graphRunID,
                        StepInvocationID: task.ID,
                        TaskID: task.ID,
                        TaskName: task.Name,
                        CorrelationKey: correlationKey,
                        ItemCorrelationKey: itemCorrelationKey,
                        ItemIndex: i,
                        ItemKey: String(i),
                        ItemVariable: itemVar,
                        IndexVariable: forEach.indexVariable,
                        ItemValue: items[i],
                        Topic: topic,
                        HandlerKey: enqueue.handlerKey,
                        ActionName: enqueue.actionName,
                        SubAgentName: enqueue.subAgentName,
                        ContinueOnError: Boolean(forEach.continueOnError),
                        Payload: itemBasePayload,
                        MaxRetries: maxRetries,
                        PublishedAt: publishedAt,
                    },
                });
            }
            batches.push(batch);
        }

        let active = 0;
        let peak = 0;
        let nextIdx = 0;
        let publishError: string | undefined;

        const worker = async (): Promise<void> => {
            while (!publishError) {
                const current = nextIdx++;
                if (current >= batches.length) return;
                active++;
                if (active > peak) peak = active;
                if (peak > this.peakPublishConcurrency) this.peakPublishConcurrency = peak;
                try {
                    await TaskGraphQueueRegistry.Instance.PublishWithRetry(batches[current], contextUser, provider);
                } catch (err) {
                    publishError = err instanceof Error ? err.message : String(err);
                    return;
                } finally {
                    active--;
                }
            }
        };

        const workerCount = Math.min(publishConcurrency, batches.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        if (publishError) {
            return { Success: false, BatchCount: batches.length, PeakConcurrency: peak, ErrorMessage: publishError };
        }
        return { Success: true, BatchCount: batches.length, PeakConcurrency: peak };
    }

    private async markPublishFinished(
        taskID: string,
        batchCount: number,
        peakConcurrency: number,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        await this.withTaskLock(taskID, async () => {
            const serviceUser = ResolveServiceUser(contextUser);
            const cached = this.activeStates.get(taskID);
            if (cached) {
                if (cached.state.status === 'Publishing') {
                    cached.state.status = 'Waiting';
                }
                cached.state.publishBatchCount = batchCount;
                cached.state.peakPublishConcurrency = peakConcurrency;
                cached.task.Configuration = JSON.stringify({ ...cached.config, runtime: { ...(cached.config.runtime ?? {}), enqueueFanOut: cached.state } });
                await SaveTaskWithAuthority(cached.task, serviceUser);
                return;
            }
            const task = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', serviceUser);
            if (!(await task.Load(taskID))) return;
            const cfg = ParseStepConfiguration(task.Configuration);
            if (!cfg.runtime?.enqueueFanOut) return;
            if (cfg.runtime.enqueueFanOut.status === 'Publishing') {
                cfg.runtime.enqueueFanOut.status = 'Waiting';
            }
            cfg.runtime.enqueueFanOut.publishBatchCount = batchCount;
            cfg.runtime.enqueueFanOut.peakPublishConcurrency = peakConcurrency;
            task.Configuration = JSON.stringify(cfg);
            await SaveTaskWithAuthority(task, serviceUser);
        });
    }

    private async reconcileEarlyCompletions(
        taskID: string,
        correlationKey: string,
        totalItems: number,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        const earlyEntries: EarlyCompletionEntry[] = [
            ...this.ConsumeEarlyCompletions(correlationKey),
        ];
        for (let i = 0; i < totalItems; i++) {
            const itemKey = `${correlationKey}:item:${i}`;
            earlyEntries.push(...this.ConsumeEarlyCompletions(itemKey));
        }
        for (const entry of earlyEntries) {
            await this.RecordItemCompletion({
                TaskID: taskID,
                CorrelationKey: correlationKey,
                ItemIndex: entry.ItemIndex,
                Status: entry.Status,
                Payload: entry.Payload,
                ErrorMessage: entry.ErrorMessage,
                Provider: provider,
                ContextUser: contextUser,
            });
        }
    }

    private async settleWaitingFanOutTask(
        provider: IMetadataProvider,
        task: MJTaskEntity,
        config: TaskStepConfiguration,
        status: 'Complete' | 'Failed',
        ownOutput: Record<string, unknown> | null,
        errorMessage: string | null,
        contextUser: UserInfo,
        explicitStartPayload?: Record<string, unknown>,
    ): Promise<void> {
        const claims = new TaskClaimStore('enqueue-fanout', 0);
        const startPayload = explicitStartPayload ?? PayloadAtStartOf(config);
        const outputJson = status === 'Complete'
            ? JSON.stringify(ComposeWaitingStepOutput(startPayload, ownOutput))
            : null;
        const serviceUser = ResolveServiceUser(contextUser);
        const outcome = await claims.TryCompleteWaitingStep(
            provider,
            task.ID,
            WAITING_STEP_MARKER,
            status,
            outputJson,
            status === 'Failed' ? (errorMessage ?? 'Fan-out failed.') : null,
            '{}',
            WaitingStepOutputTaint(config, ownOutput),
            serviceUser,
        );
        if (outcome === 'Completed') {
            KickTaskGraphDispatchers();
            if (status === 'Failed' && task.ParentID) {
                LogStatus(`[ForEachEnqueue] Fan-out task '${task.ID}' failed terminally: ${errorMessage ?? 'unknown error'}`);
            }
        }
    }

    private async failFanOutStep(
        provider: IMetadataProvider,
        task: MJTaskEntity,
        contextUser: UserInfo,
        message: string,
    ): Promise<boolean> {
        LogError(`[ForEachEnqueue] ${message}`);
        const claims = new TaskClaimStore('enqueue-fanout', 0);
        await claims.TryCompleteWaitingStep(
            provider,
            task.ID,
            WAITING_STEP_MARKER,
            'Failed',
            null,
            message,
            '{}',
            true,
            ResolveServiceUser(contextUser),
        );
        KickTaskGraphDispatchers();
        if (task.ParentID) {
            // Best-effort durable caller notification if parent graph has no downstream recovery edge
            // will be finalized on dispatcher rollup as well.
            void TaskGraphCallerNotificationService.Instance;
        }
        return true;
    }

    private async resolveTargetTask(params: {
        TaskID?: string;
        CorrelationKey?: string;
        ItemIndex?: number;
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
    }): Promise<{ TaskID: string; ItemIndex?: number } | null> {
        if (params.TaskID) {
            return { TaskID: params.TaskID, ItemIndex: params.ItemIndex };
        }
        if (!params.CorrelationKey) return null;
        const parsed = this.ParseFanOutItemCorrelationKey(params.CorrelationKey);
        const lookupKey = parsed ? parsed.BaseKey : params.CorrelationKey;
        const serviceUser = ResolveServiceUser(params.ContextUser);
        const res = await RunView.FromMetadataProvider(params.Provider).RunView<MJTaskEntity>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `CorrelationKey='${EscapeSQLString(lookupKey)}' AND StepType='ForEach' AND Status='Pending'`,
                MaxRows: 1,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            serviceUser,
        );
        const found = res.Success ? res.Results?.[0] : undefined;
        if (!found) return null;
        return { TaskID: found.ID, ItemIndex: params.ItemIndex ?? parsed?.ItemIndex };
    }

    private async withTaskLock<T>(taskID: string, fn: () => Promise<T>): Promise<T> {
        const prior = this.taskLocks.get(taskID) ?? Promise.resolve();
        const next = prior.then(fn, fn);
        const tail = next.then(() => undefined, () => undefined);
        this.taskLocks.set(taskID, tail);
        try {
            return await next;
        } finally {
            if (this.taskLocks.get(taskID) === tail) {
                this.taskLocks.delete(taskID);
            }
        }
    }
}

function resolveCollectionItems(collectionPath: string, payload: Record<string, unknown>): unknown[] {
    const trimmed = collectionPath.trim();
    const cleaned = trimmed.startsWith('payload.') ? trimmed.slice('payload.'.length) : trimmed;
    const raw = cleaned ? GetValueFromPath(payload, cleaned) : undefined;
    const candidate = raw ?? (trimmed !== cleaned ? GetValueFromPath(payload, trimmed) : undefined);
    return Array.isArray(candidate) ? candidate : [];
}

function stripCollectionRoot(payload: Record<string, unknown>, collectionPath: string): Record<string, unknown> {
    const trimmed = collectionPath.trim();
    const cleaned = trimmed.startsWith('payload.') ? trimmed.slice('payload.'.length) : trimmed;
    const topKey = cleaned.split('.')[0];
    if (!topKey || !(topKey in payload)) {
        return { ...payload };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
        if (k !== topKey) out[k] = v;
    }
    return out;
}

function resolveBaseCorrelationKey(
    graphRunID: string,
    stepInvocationID: string,
    configured: string | undefined,
    payload: Record<string, unknown>,
): string {
    const raw = configured?.trim();
    if (!raw) {
        return BuildEnqueueCorrelationKey(graphRunID, stepInvocationID);
    }
    if (raw.startsWith('payload.')) {
        const val = GetValueFromPath(payload, raw.slice('payload.'.length));
        if (val !== undefined && val !== null && String(val).trim().length > 0) {
            return String(val).trim();
        }
    }
    return BuildEnqueueCorrelationKey(graphRunID, stepInvocationID, raw);
}

function resolveMaxRetries(requested: number | undefined, ceiling: number): number {
    if (typeof requested === 'number' && Number.isInteger(requested) && requested >= 0) {
        return Math.min(requested, ceiling);
    }
    return ceiling;
}
