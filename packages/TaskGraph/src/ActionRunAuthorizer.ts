/**
 * @fileoverview Decides whether a task graph's user may run its actions.
 *
 * An action passes when the user may run it (`CheckActionRunAuthorization`), or when it is bound to
 * what submitted the graph: the agent of the submitting agent run, or the durable entity-action
 * binding. Both come from records read here, never from a list of action IDs a caller supplies.
 *
 * @module @memberjunction/task-graph
 */
import { CheckActionRunAuthorization, type ActionRunRefusal } from '@memberjunction/actions-base';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentActionEntity,
    MJAIAgentRunEntity,
    MJAIAgentStepEntity,
    MJEntityActionEntity,
} from '@memberjunction/core-entities';
import { IsValidUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';

/** What submitted a graph. Set only by server code: the agent framework or the durable entity-action submitter. */
export type ActionRunGrant = {
    /** The agent run that submitted the graph. */
    AgentRunID?: string | null;
    /** The `MJ: Entity Actions` binding whose durable dispatch submitted the graph. */
    EntityActionID?: string | null;
};

type AgentRunRow = Pick<MJAIAgentRunEntity, 'ID' | 'AgentID' | 'UserID'>;
type BoundActionRow = Pick<MJAIAgentActionEntity | MJAIAgentStepEntity, 'ActionID'>;
type EntityActionRow = Pick<MJEntityActionEntity, 'ID' | 'ActionID' | 'Status' | 'RunMode'>;

/**
 * Checks a graph's actions for one user. The bound actions are read once, on the first refusal, and
 * reused for later checks.
 */
export class ActionRunAuthorizer {
    private boundActions: Promise<UUIDSet> | null = null;

    /**
     * @param grant what submitted the graph
     * @param user the user the actions run as
     * @param provider the provider to read through
     * @param readUser the user the rows are read as: a server user when the caller has one, else `user`
     */
    constructor(
        private readonly grant: ActionRunGrant,
        private readonly user: UserInfo,
        private readonly provider: IMetadataProvider,
        private readonly readUser: UserInfo = user,
    ) {}

    /** The first action the user may not run and that is not bound to the graph's submitter, or null. */
    public async Refusal(actionIDs: readonly string[]): Promise<ActionRunRefusal | null> {
        const refusal = await CheckActionRunAuthorization(actionIDs, this.user, this.provider, this.readUser);
        if (!refusal) return null;
        const bound = await this.loadBoundActions();
        const unbound = actionIDs.filter((id) => !bound.Has(id));
        if (unbound.length === actionIDs.length) return refusal;
        return CheckActionRunAuthorization(unbound, this.user, this.provider, this.readUser);
    }

    private loadBoundActions(): Promise<UUIDSet> {
        this.boundActions ??= this.readBoundActions().catch((e: unknown) => {
            LogError(`[ActionRunAuthorizer] Could not read the bound actions: ${e instanceof Error ? e.message : String(e)}`);
            return new UUIDSet();
        });
        return this.boundActions;
    }

    private async readBoundActions(): Promise<UUIDSet> {
        const [agentActions, entityAction] = await Promise.all([this.agentBoundActions(), this.entityActionBoundAction()]);
        return new UUIDSet([...agentActions, ...entityAction]);
    }

    /**
     * The actions bound to the agent of the submitting run: its active `MJ: AI Agent Actions` rows and
     * the actions of its active `MJ: AI Agent Steps`. None unless the run exists, belongs to the user,
     * and the user may run its agent.
     */
    private async agentBoundActions(): Promise<string[]> {
        const runID = this.grant.AgentRunID;
        if (!runID || !IsValidUUID(runID)) return [];
        const agentID = await this.agentOfUsersRun(runID);
        if (!agentID) return [];
        const [actions, steps] = await RunView.FromMetadataProvider(this.provider).RunViews(
            [
                { EntityName: 'MJ: AI Agent Actions', ExtraFilter: `AgentID='${agentID}' AND Status='Active'`, Fields: ['ActionID'], ResultType: 'simple' },
                {
                    EntityName: 'MJ: AI Agent Steps',
                    ExtraFilter: `AgentID='${agentID}' AND Status='Active' AND ActionID IS NOT NULL`,
                    Fields: ['ActionID'],
                    ResultType: 'simple',
                },
            ],
            this.readUser,
        );
        if (!actions?.Success || !steps?.Success) return [];
        return [...(actions.Results ?? []), ...(steps.Results ?? [])]
            .map((row) => (row as BoundActionRow).ActionID)
            .filter((id): id is string => !!id);
    }

    /** The agent of the run, when the run belongs to the user and the user may run that agent; else null. */
    private async agentOfUsersRun(runID: string): Promise<string | null> {
        const result = await RunView.FromMetadataProvider(this.provider).RunView<AgentRunRow>(
            { EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${runID}'`, Fields: ['ID', 'AgentID', 'UserID'], ResultType: 'simple' },
            this.readUser,
        );
        const run = result.Success ? result.Results?.[0] : undefined;
        if (!run?.AgentID || !IsValidUUID(run.AgentID) || !UUIDsEqual(run.UserID, this.user.ID)) return null;
        return (await this.userMayRunAgent(run.AgentID)) ? run.AgentID : null;
    }

    private async userMayRunAgent(agentID: string): Promise<boolean> {
        try {
            return await AIAgentPermissionHelper.HasPermission(agentID, this.user, 'run');
        } catch (e) {
            LogError(`[ActionRunAuthorizer] Could not read the permissions of agent ${agentID}: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** The action of the durable entity-action binding, when the binding is active and durable. */
    private async entityActionBoundAction(): Promise<string[]> {
        const bindingID = this.grant.EntityActionID;
        if (!bindingID || !IsValidUUID(bindingID)) return [];
        const result = await RunView.FromMetadataProvider(this.provider).RunView<EntityActionRow>(
            {
                EntityName: 'MJ: Entity Actions',
                ExtraFilter: `ID='${bindingID}'`,
                Fields: ['ID', 'ActionID', 'Status', 'RunMode'],
                ResultType: 'simple',
            },
            this.readUser,
        );
        const binding = result.Success ? result.Results?.[0] : undefined;
        return binding && binding.Status === 'Active' && binding.RunMode === 'Durable' ? [binding.ActionID] : [];
    }
}
