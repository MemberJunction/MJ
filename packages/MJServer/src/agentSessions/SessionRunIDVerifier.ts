/**
 * @fileoverview Checks the run ids a realtime session keeps in its `Config` before server code
 * acts on them.
 *
 * @module @memberjunction/server
 */
import { IMetadataProvider, LogError, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

const AGENT_RUN_ENTITY = 'MJ: AI Agent Runs';
const AGENT_RUN_STEP_ENTITY = 'MJ: AI Agent Run Steps';

/**
 * Escapes a value for a single-quoted SQL literal: drops null bytes and doubles quotes. A copy of
 * `EscapeSQLString` from `@memberjunction/global` on next, which lts/5 does not have.
 */
function EscapeSQLString(value: string): string {
    return value.replace(/\0/g, '').replace(/'/g, "''");
}

/**
 * The run ids a realtime voice session keeps in its `Config` JSON. Server code reads and writes the
 * records they point at, often as an elevated user.
 */
export interface SessionRunIDs {
    /** The co-agent observability run (`MJ: AI Agent Runs`). */
    CoAgentRunID?: string;
    /** The co-agent prompt run (`MJ: AI Prompt Runs`), linked through the co-agent run's prompt step. */
    PromptRunID?: string;
    /** The co-agent run's system-prompt step (`MJ: AI Agent Run Steps`). */
    CoAgentRunStepID?: string;
    /** A delegated run (`MJ: AI Agent Runs`) that paused for the user's answer. */
    PendingFeedbackRunID?: string;
}

/** A row of the run-step lookup. */
interface RunStepRow {
    ID: string;
    StepType: string;
    TargetLogID: string | null;
}

/** A row of either lookup; the run lookup returns only `ID`. */
type LookupRow = Partial<RunStepRow> & { ID: string };

/**
 * Keeps the run ids from a session's `Config` that are records of that session.
 *
 * The session owner can edit `Config`, so its run ids are claims. A run id is kept when it is the
 * UUID of an `MJ: AI Agent Runs` row whose `AgentSessionID` is the session. The step id and the
 * prompt run id are kept when they belong to that co-agent run: the step's `AgentRunID` is the
 * co-agent run, and the prompt run is the `TargetLogID` of one of its `Prompt` steps.
 *
 * The lookups run as the system user when one is cached, else as the acting user. They are pinned
 * to the session's id and return nothing to the caller, and row-level security can hide a session's
 * own runs from its owner (a web-widget guest's delegated runs carry no `ConversationID`, which the
 * guest's run filter keys on).
 *
 * Each call reads the database again (`BypassCache`) and keeps no result, because the links can
 * change after a lookup: a run's `AgentSessionID` and a step's `AgentRunID` and `TargetLogID` are
 * updatable.
 */
export class SessionRunIDVerifier {
    /**
     * Returns the subset of `claimed` that belongs to the session now. Never throws: when a lookup
     * fails, nothing is kept.
     *
     * @param sessionID The `MJ: AI Agent Sessions` id the claims were read from. The caller must have
     *   checked that the session is the caller's own.
     * @param claimed The run ids read from the session's `Config`.
     * @param contextUser The acting user; the lookups run as it only when no system user is cached.
     * @param provider The request-scoped metadata provider.
     * @returns The claims that are records of the session.
     */
    public async Verify(
        sessionID: string,
        claimed: SessionRunIDs,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<SessionRunIDs> {
        const candidates = this.keepUUIDs(claimed);
        if (!candidates.CoAgentRunID && !candidates.PendingFeedbackRunID) {
            return {};
        }
        return (await this.lookUpOwned(sessionID.trim(), candidates, contextUser, provider)) ?? {};
    }

    /** Drops every claim that is not a UUID. The prompt run and step need a co-agent run to hang off. */
    private keepUUIDs(claimed: SessionRunIDs): SessionRunIDs {
        const coAgentRunID = this.uuidOrUndefined(claimed.CoAgentRunID);
        return {
            CoAgentRunID: coAgentRunID,
            PromptRunID: coAgentRunID ? this.uuidOrUndefined(claimed.PromptRunID) : undefined,
            CoAgentRunStepID: coAgentRunID ? this.uuidOrUndefined(claimed.CoAgentRunStepID) : undefined,
            PendingFeedbackRunID: this.uuidOrUndefined(claimed.PendingFeedbackRunID),
        };
    }

    private uuidOrUndefined(value: string | undefined): string | undefined {
        return value && IsValidUUID(value) ? value.trim() : undefined;
    }

    /** Runs the lookups; `null` when one of them fails. */
    private async lookUpOwned(
        sessionID: string,
        candidates: SessionRunIDs,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<SessionRunIDs | null> {
        const stepsQuery = this.stepsQuery(candidates);
        const queries = stepsQuery ? [this.runsQuery(sessionID, candidates), stepsQuery] : [this.runsQuery(sessionID, candidates)];
        try {
            const lookupUser = UserCache.Instance.GetSystemUser() ?? contextUser;
            const [runs, steps] = await RunView.FromMetadataProvider(provider).RunViews<LookupRow>(queries, lookupUser);
            const failed = [runs, steps].find((result) => result && !result.Success);
            if (!runs || failed) {
                LogError(`SessionRunIDVerifier: run lookup failed for session ${sessionID}: ${failed?.ErrorMessage ?? 'no result'}`);
                return null;
            }
            return this.pickOwned(candidates, runs.Results, steps?.Results ?? []);
        } catch (error) {
            LogError(`SessionRunIDVerifier: run lookup failed for session ${sessionID}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /** The claimed runs that carry this session's id. */
    private runsQuery(sessionID: string, candidates: SessionRunIDs): RunViewParams {
        const ids = [candidates.CoAgentRunID, candidates.PendingFeedbackRunID]
            .filter((id): id is string => !!id)
            .map((id) => `'${EscapeSQLString(id)}'`);
        return {
            EntityName: AGENT_RUN_ENTITY,
            ExtraFilter: `AgentSessionID='${EscapeSQLString(sessionID)}' AND ID IN (${ids.join(', ')})`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        };
    }

    /** The claimed co-agent run's steps that match the claimed step or prompt run; `null` when neither is claimed. */
    private stepsQuery(candidates: SessionRunIDs): RunViewParams | null {
        const matches: string[] = [];
        if (candidates.CoAgentRunStepID) {
            matches.push(`ID='${EscapeSQLString(candidates.CoAgentRunStepID)}'`);
        }
        if (candidates.PromptRunID) {
            matches.push(`TargetLogID='${EscapeSQLString(candidates.PromptRunID)}'`);
        }
        if (!candidates.CoAgentRunID || matches.length === 0) {
            return null;
        }
        return {
            EntityName: AGENT_RUN_STEP_ENTITY,
            ExtraFilter: `AgentRunID='${EscapeSQLString(candidates.CoAgentRunID)}' AND (${matches.join(' OR ')})`,
            Fields: ['ID', 'StepType', 'TargetLogID'],
            ResultType: 'simple',
            BypassCache: true,
        };
    }

    private pickOwned(candidates: SessionRunIDs, runs: LookupRow[], steps: LookupRow[]): SessionRunIDs {
        const isOwnedRun = (id: string | undefined): boolean => !!id && runs.some((row) => UUIDsEqual(row.ID, id));
        const coAgentRunID = isOwnedRun(candidates.CoAgentRunID) ? candidates.CoAgentRunID : undefined;
        const ownedSteps = coAgentRunID ? steps : [];
        const stepID = candidates.CoAgentRunStepID;
        const promptRunID = candidates.PromptRunID;
        return {
            CoAgentRunID: coAgentRunID,
            CoAgentRunStepID: stepID && ownedSteps.some((row) => UUIDsEqual(row.ID, stepID)) ? stepID : undefined,
            PromptRunID:
                promptRunID && ownedSteps.some((row) => row.StepType === 'Prompt' && UUIDsEqual(row.TargetLogID, promptRunID))
                    ? promptRunID
                    : undefined,
            PendingFeedbackRunID: isOwnedRun(candidates.PendingFeedbackRunID) ? candidates.PendingFeedbackRunID : undefined,
        };
    }
}
