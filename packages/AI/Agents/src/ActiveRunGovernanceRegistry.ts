/**
 * @fileoverview In-process singleton registry coordinating cooperative safe-point pauses
 * for running agents and idempotent continuation dispatch when paused runs are resumed.
 *
 * @module @memberjunction/ai-agents
 */

import { BaseSingleton } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AgentRunWatchdog } from './agent-run-watchdog';
import {
    RunawayCheckpointManager,
    type PauseRunWithCheckpointResult,
    type PendingRunawayCheckpointPersistence,
    type RestoredCheckpointContext,
} from './RunawayCheckpointManager';

/** Result returned after an active in-process agent flushes and checkpoints a cooperative pause. */
export interface CooperativePauseResult {
    Paused: boolean;
    Pending?: boolean;
    CheckpointID: string | null;
    Status: string;
    Summary: string;
}

/** Handle registered by an active `BaseAgent` run to accept safe-point pause requests. */
export interface CooperativePauseHandle {
    AgentRunID: string;
    /** Metadata provider owning this active run (CR-18 tenant/provider isolation). */
    Provider?: IMetadataProvider | null;
    /** Optional explicit tenant scope key when multiple tenants share a provider instance. */
    TenantScopeKey?: string | null;
    /** Lifecycle state of the live run handle (`Active` vs `PausePersistencePending`). */
    State?: 'Active' | 'PausePersistencePending';
    RequestPause: (summary?: string) => Promise<CooperativePauseResult | null>;
}

/** Context handed to a continuation dispatcher when `Limits.ResumePausedRun` resumes a run. */
export interface ResumeContinuationDispatchInput {
    AgentRunID: string;
    AgentID: string;
    UserID: string | null;
    RoutineID: string | null;
    CheckpointID: string;
    RestoredContext: RestoredCheckpointContext;
    Provider: IMetadataProvider;
    TenantScopeKey?: string | null;
    ContextUser: UserInfo;
}

/** Result returned by a registered continuation dispatcher hook. */
export interface ResumeContinuationDispatchResult {
    Dispatched: boolean;
    Claimed?: boolean;
    Completed?: boolean;
    Status?: string;
    Message?: string;
}

/** Callback invoked to continue executing a checkpoint-resumed agent run. */
export type ResumeContinuationDispatcher = (
    input: ResumeContinuationDispatchInput,
) => Promise<ResumeContinuationDispatchResult>;

/**
 * Coordinates live in-process `BaseAgent` pause signals and continuation dispatchers.
 */
export class ActiveRunGovernanceRegistry extends BaseSingleton<ActiveRunGovernanceRegistry> {
    private readonly activeRuns = new Map<string, CooperativePauseHandle>();
    private readonly pendingCheckpoints = new Map<string, PendingRunawayCheckpointPersistence>();
    private readonly flushingCheckpoints = new Map<string, Promise<PauseRunWithCheckpointResult>>();
    private readonly providerIds = new WeakMap<IMetadataProvider, number>();
    private nextProviderSeq = 1;
    private customDispatcher: ResumeContinuationDispatcher | null = null;
    private defaultDispatcher: ResumeContinuationDispatcher | null = null;
    private readonly dispatchedCheckpointKeys = new Set<string>();
    private readonly continuationExecutions = new Map<string, Promise<ResumeContinuationDispatchResult>>();

    public constructor() {
        super();
    }

    /** Returns the singleton registry instance via `BaseSingleton`. */
    public static get Instance(): ActiveRunGovernanceRegistry {
        return ActiveRunGovernanceRegistry.getInstance<ActiveRunGovernanceRegistry>();
    }

    /** Registers an active in-process agent run for cooperative safe-point pause coordination. */
    public RegisterActiveRun(
        handle: CooperativePauseHandle,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): void {
        const scopedHandle: CooperativePauseHandle = {
            ...handle,
            Provider: provider !== undefined ? provider : (handle.Provider ?? null),
            TenantScopeKey: tenantScopeKey !== undefined ? tenantScopeKey : (handle.TenantScopeKey ?? null),
        };
        const key = this.buildScopedRunKey(
            scopedHandle.AgentRunID,
            scopedHandle.Provider,
            scopedHandle.TenantScopeKey,
        );
        if (key) {
            this.activeRuns.set(key, scopedHandle);
        }
    }

    /** Unregisters an active agent run when execution finishes or pauses. */
    public UnregisterActiveRun(
        agentRunId: string | null | undefined,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): void {
        const key = this.buildScopedRunKey(agentRunId, provider, tenantScopeKey);
        if (key) {
            this.activeRuns.delete(key);
        }
    }

    /** Looks up a live cooperative pause handle within the exact caller provider/tenant scope. */
    public GetActiveRun(
        agentRunId: string | null | undefined,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): CooperativePauseHandle | undefined {
        const key = this.buildScopedRunKey(agentRunId, provider, tenantScopeKey);
        return key ? this.activeRuns.get(key) : undefined;
    }

    /**
     * Signals an active in-process worker matching `(agentRunId, provider, tenantScopeKey)`
     * to flush and checkpoint at its next safe boundary.
     * Returns `null` if no in-process worker is registered within that scope.
     */
    public async RequestCooperativePause(
        agentRunId: string,
        summary?: string,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): Promise<CooperativePauseResult | null> {
        const handle = this.GetActiveRun(agentRunId, provider, tenantScopeKey);
        if (!handle) {
            return null;
        }
        return handle.RequestPause(summary);
    }

    /**
     * Retains a safe-point checkpoint in memory when entity persistence fails and keeps the run
     * registered in `PausePersistencePending` state so further billable work is blocked fail-closed.
     */
    public MarkPausePersistencePending(pending: PendingRunawayCheckpointPersistence): void {
        const key = this.buildScopedRunKey(pending.AgentRunID, pending.Provider, pending.TenantScopeKey);
        if (!key) {
            return;
        }
        this.pendingCheckpoints.set(key, pending);
        const existingHandle = this.activeRuns.get(key);
        const pendingHandle: CooperativePauseHandle = existingHandle
            ? {
                ...existingHandle,
                State: 'PausePersistencePending',
            }
            : {
                AgentRunID: pending.AgentRunID,
                Provider: pending.Provider,
                TenantScopeKey: pending.TenantScopeKey ?? null,
                State: 'PausePersistencePending',
                RequestPause: async () => ({
                    Paused: false,
                    Pending: true,
                    CheckpointID: pending.Checkpoint.CheckpointID,
                    Status: 'PausePersistencePending',
                    Summary: pending.Checkpoint.Summary,
                }),
            };
        this.activeRuns.set(key, pendingHandle);
    }

    /** Returns true when `(agentRunId, provider, tenantScopeKey)` has an unpersisted safe-point checkpoint. */
    public IsPausePersistencePending(
        agentRunId: string | null | undefined,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): boolean {
        const key = this.buildScopedRunKey(agentRunId, provider, tenantScopeKey);
        return key ? this.pendingCheckpoints.has(key) : false;
    }

    /** Returns the retained in-memory pending checkpoint record for `(agentRunId, provider, tenantScopeKey)`, if any. */
    public GetPendingCheckpointPersistence(
        agentRunId: string | null | undefined,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): PendingRunawayCheckpointPersistence | undefined {
        const key = this.buildScopedRunKey(agentRunId, provider, tenantScopeKey);
        return key ? this.pendingCheckpoints.get(key) : undefined;
    }

    /** Lists all retained pending checkpoint records matching `(provider, tenantScopeKey)`. */
    public ListPendingCheckpointPersistenceForScope(
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): PendingRunawayCheckpointPersistence[] {
        const prefix = `${this.buildScopeKey(provider, tenantScopeKey)}::`;
        const matches: PendingRunawayCheckpointPersistence[] = [];
        for (const [key, entry] of this.pendingCheckpoints.entries()) {
            if (key.startsWith(prefix)) {
                matches.push(entry);
            }
        }
        return matches;
    }

    /**
     * Retries persisting a retained in-memory safe-point checkpoint for `(agentRunId, provider, tenantScopeKey)`
     * when storage recovers, transitioning the run cleanly to `Paused` and releasing ownership.
     * Returns `null` if no pending checkpoint is held for that scoped run.
     */
    public async FlushPendingCheckpointPersistence(
        agentRunId: string | null | undefined,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
        checkpointManager?: RunawayCheckpointManager,
    ): Promise<PauseRunWithCheckpointResult | null> {
        const key = this.buildScopedRunKey(agentRunId, provider, tenantScopeKey);
        if (!key) {
            return null;
        }
        const pending = this.pendingCheckpoints.get(key);
        if (!pending) {
            return null;
        }
        const existingFlush = this.flushingCheckpoints.get(key);
        if (existingFlush) {
            return existingFlush;
        }
        const manager = checkpointManager ?? new RunawayCheckpointManager();
        const flushPromise = (async (): Promise<PauseRunWithCheckpointResult> => {
            const result = await manager.FlushPendingCheckpointPersistence(pending);
            if (result.Saved) {
                this.pendingCheckpoints.delete(key);
                AgentRunWatchdog.Instance.Untrack(pending.AgentRunID);
                this.activeRuns.delete(key);
            }
            return result;
        })();
        this.flushingCheckpoints.set(key, flushPromise);
        try {
            return await flushPromise;
        } finally {
            if (this.flushingCheckpoints.get(key) === flushPromise) {
                this.flushingCheckpoints.delete(key);
            }
        }
    }

    /** Flushes every pending safe-point checkpoint belonging to `(provider, tenantScopeKey)`. */
    public async FlushAllPendingCheckpointsForScope(
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
        checkpointManager?: RunawayCheckpointManager,
    ): Promise<PauseRunWithCheckpointResult[]> {
        const entries = this.ListPendingCheckpointPersistenceForScope(provider, tenantScopeKey);
        const results: PauseRunWithCheckpointResult[] = [];
        for (const entry of entries) {
            const res = await this.FlushPendingCheckpointPersistence(
                entry.AgentRunID,
                entry.Provider,
                entry.TenantScopeKey,
                checkpointManager,
            );
            if (res) {
                results.push(res);
            }
        }
        return results;
    }

    /** Clears all pending checkpoint persistence entries (primarily for unit test isolation). */
    public ClearPendingCheckpointPersistence(): void {
        this.pendingCheckpoints.clear();
        this.flushingCheckpoints.clear();
    }

    /** Registers (or clears with `null`) a custom override continuation dispatcher hook. */
    public RegisterContinuationDispatcher(dispatcher: ResumeContinuationDispatcher | null): void {
        this.customDispatcher = dispatcher;
    }

    /** Registers the built-in default continuation dispatcher used when no custom override is set. */
    public RegisterDefaultContinuationDispatcher(dispatcher: ResumeContinuationDispatcher | null): void {
        this.defaultDispatcher = dispatcher;
    }

    /** Clears both custom and default continuation dispatchers (primarily for fail-closed tests). */
    public ClearContinuationDispatchers(): void {
        this.customDispatcher = null;
        this.defaultDispatcher = null;
        this.continuationExecutions.clear();
    }

    /** Returns true when either a custom or default continuation dispatcher is available. */
    public HasContinuationDispatcher(): boolean {
        return this.GetContinuationDispatcher() !== null;
    }

    /** Returns the effective continuation dispatcher (custom override or built-in default), if any. */
    public GetContinuationDispatcher(): ResumeContinuationDispatcher | null {
        return this.customDispatcher ?? this.defaultDispatcher;
    }

    /** Clears recorded idempotency claim keys (primarily for deterministic testing). */
    public ClearDispatchedClaims(): void {
        this.dispatchedCheckpointKeys.clear();
        this.continuationExecutions.clear();
    }

    /** Records an asynchronous continuation execution promise so callers or tests can await completion. */
    public TrackContinuationExecution(
        agentRunId: string,
        promise: Promise<ResumeContinuationDispatchResult>,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): void {
        const key = this.buildScopedRunKey(agentRunId, provider, tenantScopeKey);
        if (key) {
            this.continuationExecutions.set(key, promise);
        }
    }

    /** Awaits any tracked asynchronous continuation execution for the given scoped run ID. */
    public async WaitForContinuation(
        agentRunId: string,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): Promise<ResumeContinuationDispatchResult | null> {
        const key = this.buildScopedRunKey(agentRunId, provider, tenantScopeKey);
        if (!key) {
            return null;
        }
        const pending = this.continuationExecutions.get(key);
        return pending ? pending : null;
    }

    /**
     * Invokes the active continuation dispatcher idempotently for `(scope, AgentRunID, CheckpointID)`.
     * Returns `null` when no continuation dispatcher is available or configured.
     */
    public async DispatchContinuation(
        input: ResumeContinuationDispatchInput,
    ): Promise<ResumeContinuationDispatchResult | null> {
        const dispatcher = this.GetContinuationDispatcher();
        if (!dispatcher) {
            return null;
        }
        const scopeKey = this.buildScopeKey(input.Provider, input.TenantScopeKey);
        const claimKey = `${scopeKey}::${this.normalizeId(input.AgentRunID)}:${this.normalizeId(input.CheckpointID)}`;
        if (this.dispatchedCheckpointKeys.has(claimKey)) {
            return {
                Dispatched: true,
                Claimed: false,
                Status: 'Running',
                Message: `Continuation for checkpoint ${input.CheckpointID} was already dispatched idempotently.`,
            };
        }
        this.dispatchedCheckpointKeys.add(claimKey);
        try {
            const result = await dispatcher(input);
            if (!result || !result.Dispatched) {
                this.dispatchedCheckpointKeys.delete(claimKey);
            }
            return result;
        } catch (err) {
            this.dispatchedCheckpointKeys.delete(claimKey);
            throw err;
        }
    }

    private getProviderSeq(provider: IMetadataProvider): number {
        let seq = this.providerIds.get(provider);
        if (seq === undefined) {
            seq = this.nextProviderSeq++;
            this.providerIds.set(provider, seq);
        }
        return seq;
    }

    private buildScopeKey(provider?: IMetadataProvider | null, tenantScopeKey?: string | null): string {
        const trimmedTenant = typeof tenantScopeKey === 'string' ? tenantScopeKey.trim().toLowerCase() : '';
        if (!provider && !trimmedTenant) {
            return 'default';
        }
        const providerPart = provider ? `p#${this.getProviderSeq(provider)}` : 'no-provider';
        return trimmedTenant ? `${providerPart}:t:${trimmedTenant}` : providerPart;
    }

    private buildScopedRunKey(
        agentRunId: string | null | undefined,
        provider?: IMetadataProvider | null,
        tenantScopeKey?: string | null,
    ): string {
        const normalizedId = this.normalizeId(agentRunId);
        if (!normalizedId) {
            return '';
        }
        return `${this.buildScopeKey(provider, tenantScopeKey)}::${normalizedId}`;
    }

    private normalizeId(id: string | null | undefined): string {
        return typeof id === 'string' ? id.trim().toLowerCase() : '';
    }
}
