/**
 * @fileoverview Default production continuation dispatcher for checkpoint-resumed AI agent runs.
 *
 * When an administrator or owner approves resuming a paused run via `Limits.ResumePausedRun`,
 * this dispatcher loads the target agent entity through the caller's scoped provider, constructs
 * a fresh agent worker via `CreateAgentInstance`, and continues execution asynchronously via
 * `worker.ResumePausedRun(...)` without requiring a bespoke server override hook.
 *
 * @module @memberjunction/ai-agents
 */

import { LogError, RunView } from '@memberjunction/core';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { EscapeSQLString, IsValidUUID } from '@memberjunction/global';
import {
    ActiveRunGovernanceRegistry,
    type ResumeContinuationDispatcher,
    type ResumeContinuationDispatchInput,
    type ResumeContinuationDispatchResult,
} from './ActiveRunGovernanceRegistry';
import { CreateAgentInstance } from './agent-instance';
import type { BaseAgent } from './base-agent';

async function loadAgentForContinuation(
    input: ResumeContinuationDispatchInput,
): Promise<MJAIAgentEntityExtended | null> {
    if (!input.AgentID || !IsValidUUID(input.AgentID)) {
        return null;
    }
    const rv = RunView.FromMetadataProvider(input.Provider);
    const res = await rv.RunView<MJAIAgentEntityExtended>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `ID='${EscapeSQLString(input.AgentID)}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        },
        input.ContextUser,
    );
    if (!res?.Success || res.Results.length === 0) {
        return null;
    }
    return res.Results[0];
}

async function runFreshWorkerContinuation(
    worker: BaseAgent,
    agentEntity: MJAIAgentEntityExtended,
    input: ResumeContinuationDispatchInput,
): Promise<ResumeContinuationDispatchResult> {
    try {
        const result = await worker.ResumePausedRun({
            agent: agentEntity,
            contextUser: input.ContextUser,
            userId: input.UserID ?? input.ContextUser.ID,
            provider: input.Provider,
            resumeCheckpointRunId: input.AgentRunID,
            conversationMessages: [],
        });
        const terminalStatus = result.agentRun?.Status ?? (result.success ? 'Completed' : 'Failed');
        return {
            Dispatched: true,
            Claimed: true,
            Completed: true,
            Status: terminalStatus,
            Message: result.success
                ? `Fresh worker completed resumed run ${input.AgentRunID}.`
                : `Resumed run ${input.AgentRunID} finished with status ${terminalStatus}.`,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(
            `DefaultResumeContinuationDispatcher: fresh worker continuation failed for run ${input.AgentRunID}: ${message}`,
        );
        return {
            Dispatched: true,
            Claimed: true,
            Completed: false,
            Status: 'Failed',
            Message: message,
        };
    }
}

/**
 * Creates the default production {@link ResumeContinuationDispatcher} that instantiates a fresh
 * `BaseAgent` worker via {@link CreateAgentInstance} and executes `ResumePausedRun`.
 */
export function CreateDefaultResumeContinuationDispatcher(): ResumeContinuationDispatcher {
    return async (input: ResumeContinuationDispatchInput): Promise<ResumeContinuationDispatchResult> => {
        if (!input.Provider || !input.ContextUser) {
            return {
                Dispatched: false,
                Claimed: false,
                Status: 'Paused',
                Message: 'Continuation dispatch requires both Provider and ContextUser.',
            };
        }

        let agentEntity: MJAIAgentEntityExtended | null = null;
        try {
            agentEntity = await loadAgentForContinuation(input);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Dispatched: false,
                Claimed: false,
                Status: 'Paused',
                Message: `Failed to load agent '${input.AgentID}' for continuation: ${message}`,
            };
        }

        if (!agentEntity) {
            return {
                Dispatched: false,
                Claimed: false,
                Status: 'Paused',
                Message: `Agent '${input.AgentID}' could not be loaded for resumed run ${input.AgentRunID}.`,
            };
        }

        let worker: BaseAgent;
        try {
            worker = await CreateAgentInstance(agentEntity);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                Dispatched: false,
                Claimed: false,
                Status: 'Paused',
                Message: `Unable to instantiate fresh worker for agent '${agentEntity.Name || input.AgentID}': ${message}`,
            };
        }

        const continuationPromise = runFreshWorkerContinuation(worker, agentEntity, input);
        ActiveRunGovernanceRegistry.Instance.TrackContinuationExecution(
            input.AgentRunID,
            continuationPromise,
            input.Provider,
            input.TenantScopeKey,
        );
        void continuationPromise.catch((err) => {
            LogError(
                `DefaultResumeContinuationDispatcher: unhandled continuation error for run ${input.AgentRunID}: ${err instanceof Error ? err.message : String(err)}`,
            );
        });

        return {
            Dispatched: true,
            Claimed: true,
            Status: 'Running',
            Message: `Fresh worker (${agentEntity.Name || input.AgentID}) dispatched for run ${input.AgentRunID}.`,
        };
    };
}

let defaultDispatcherInstalled = false;

/**
 * Installs the default production continuation dispatcher on {@link ActiveRunGovernanceRegistry}
 * when no default has been registered yet (or always when `force` is `true`).
 */
export function InstallDefaultResumeContinuationDispatcher(force: boolean = false): ResumeContinuationDispatcher {
    const dispatcher = CreateDefaultResumeContinuationDispatcher();
    if (force || !defaultDispatcherInstalled) {
        ActiveRunGovernanceRegistry.Instance.RegisterDefaultContinuationDispatcher(dispatcher);
        defaultDispatcherInstalled = true;
    } else if (!ActiveRunGovernanceRegistry.Instance.HasContinuationDispatcher()) {
        ActiveRunGovernanceRegistry.Instance.RegisterDefaultContinuationDispatcher(dispatcher);
    }
    return dispatcher;
}
