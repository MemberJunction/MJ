/**
 * @fileoverview In-process singleton registry coordinating cooperative safe-point pauses
 * for running agents and idempotent continuation dispatch when paused runs are resumed.
 *
 * @module @memberjunction/ai-agents
 */

import { BaseSingleton } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { RestoredCheckpointContext } from './RunawayCheckpointManager';

/** Result returned after an active in-process agent flushes and checkpoints a cooperative pause. */
export interface CooperativePauseResult {
    Paused: boolean;
    CheckpointID: string | null;
    Status: string;
    Summary: string;
}

/** Handle registered by an active `BaseAgent` run to accept safe-point pause requests. */
export interface CooperativePauseHandle {
    AgentRunID: string;
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
    private continuationDispatcher: ResumeContinuationDispatcher | null = null;
    private readonly dispatchedCheckpointKeys = new Set<string>();

    public constructor() {
        super();
    }

    /** Returns the singleton registry instance via `BaseSingleton`. */
    public static get Instance(): ActiveRunGovernanceRegistry {
        return ActiveRunGovernanceRegistry.getInstance<ActiveRunGovernanceRegistry>();
    }

    /** Registers an active in-process agent run for cooperative safe-point pause coordination. */
    public RegisterActiveRun(handle: CooperativePauseHandle): void {
        const key = this.normalizeId(handle.AgentRunID);
        if (key) {
            this.activeRuns.set(key, handle);
        }
    }

    /** Unregisters an active agent run when execution finishes or pauses. */
    public UnregisterActiveRun(agentRunId: string | null | undefined): void {
        const key = this.normalizeId(agentRunId);
        if (key) {
            this.activeRuns.delete(key);
        }
    }

    /** Looks up a live cooperative pause handle for an in-process run. */
    public GetActiveRun(agentRunId: string | null | undefined): CooperativePauseHandle | undefined {
        const key = this.normalizeId(agentRunId);
        return key ? this.activeRuns.get(key) : undefined;
    }

    /**
     * Signals an active in-process worker to flush and checkpoint at its next safe boundary.
     * Returns `null` if no in-process worker is registered for `agentRunId`.
     */
    public async RequestCooperativePause(
        agentRunId: string,
        summary?: string,
    ): Promise<CooperativePauseResult | null> {
        const handle = this.GetActiveRun(agentRunId);
        if (!handle) {
            return null;
        }
        return handle.RequestPause(summary);
    }

    /** Registers (or clears with `null`) the server continuation dispatcher hook for resumed runs. */
    public RegisterContinuationDispatcher(dispatcher: ResumeContinuationDispatcher | null): void {
        this.continuationDispatcher = dispatcher;
    }

    /** Returns the currently registered continuation dispatcher, if any. */
    public GetContinuationDispatcher(): ResumeContinuationDispatcher | null {
        return this.continuationDispatcher;
    }

    /** Clears recorded idempotency claim keys (primarily for deterministic testing). */
    public ClearDispatchedClaims(): void {
        this.dispatchedCheckpointKeys.clear();
    }

    /**
     * Invokes the registered continuation dispatcher idempotently for `(AgentRunID, CheckpointID)`.
     * Returns `null` when no external continuation dispatcher is registered.
     */
    public async DispatchContinuation(
        input: ResumeContinuationDispatchInput,
    ): Promise<ResumeContinuationDispatchResult | null> {
        if (!this.continuationDispatcher) {
            return null;
        }
        const claimKey = `${this.normalizeId(input.AgentRunID)}:${this.normalizeId(input.CheckpointID)}`;
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
            return await this.continuationDispatcher(input);
        } catch (err) {
            this.dispatchedCheckpointKeys.delete(claimKey);
            throw err;
        }
    }

    private normalizeId(id: string | null | undefined): string {
        return typeof id === 'string' ? id.trim().toLowerCase() : '';
    }
}
