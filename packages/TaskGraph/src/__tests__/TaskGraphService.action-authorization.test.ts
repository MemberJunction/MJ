/**
 * `TaskGraphService.Submit` accepts an Action or compensation node only when the submitter may run
 * that action (`MJ: Action Authorizations`, or an Owner-type user).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthorizationRoleType, RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { TaskGraphService } from '../TaskGraphService';

const WORKFLOW_TYPE_ID = '00000000-0000-4000-8000-0000000000aa';
const RESERVE = '11111111-1111-4111-8111-111111111111';
const RELEASE = '22222222-2222-4222-8222-222222222222';
const GRANTED_AUTHORIZATION = '44444444-4444-4444-8444-444444444444';
const ROLE = '55555555-5555-4555-8555-555555555555';
const AGENT = '33333333-3333-4333-8333-333333333333';
const AGENT_RUN = '77777777-7777-4777-8777-777777777777';
const ENTITY_ACTION = '88888888-8888-4888-8888-888888888888';

const RESTOCK = '99999999-9999-4999-8999-999999999999';
const ACTION_NAMES: Record<string, string> = { [RESERVE]: 'Reserve', [RELEASE]: 'Release', [RESTOCK]: 'Restock' };

const PLANNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OTHER_AGENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const NOT_RUNNABLE_AGENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const CHILD_RUN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const OTHER_USERS_RUN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const NOT_RUNNABLE_RUN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const OTHER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type AgentRunRow = { ID: string; AgentID: string; UserID: string; ParentRunID: string | null };
type AgentActionRow = { AgentID: string; ActionID: string; Status: 'Active' };

/** Reads used when a test gives none: one run of `AGENT` by `REGULAR_USER`, and `AGENT` bound to Reserve. */
const DEFAULT_AGENT_READS: { runs: AgentRunRow[]; agentActions: AgentActionRow[] } = {
    runs: [{ ID: AGENT_RUN, AgentID: AGENT, UserID: '66666666-6666-4666-8666-666666666666', ParentRunID: null }],
    agentActions: [{ AgentID: AGENT, ActionID: RESERVE, Status: 'Active' }],
};

/** A non-Owner user who holds `GRANTED_AUTHORIZATION` through `ROLE`. */
const REGULAR_USER = {
    ID: '66666666-6666-4666-8666-666666666666',
    Name: 'Regular User',
    Type: 'User',
    IsActive: true,
    UserRoles: [{ RoleID: ROLE }],
} as unknown as UserInfo;

type ActionAuthorizationRow = { ActionID: string; AuthorizationID: string };

/**
 * Answers the reads Submit makes. `actionAuthorizations` are the `MJ: Action Authorizations` rows;
 * `compensations` maps an action to the compensation action its metadata names. The agent run is
 * `REGULAR_USER`'s run of `AGENT`, which is bound to Reserve, and the durable entity-action binding
 * also names Reserve.
 */
function fakeRunView(
    actionAuthorizations: ActionAuthorizationRow[],
    compensations: Record<string, string> = {},
    agentReads: { runs: AgentRunRow[]; agentActions: AgentActionRow[] } = DEFAULT_AGENT_READS,
) {
    const answer = async (params: RunViewParams) => {
        const filter = params.ExtraFilter ?? '';
        const mentioned = (id: string) => filter.toLowerCase().includes(id.toLowerCase());
        switch (params.EntityName) {
            case 'MJ: Task Types':
                return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
            case 'MJ: Actions':
                if (filter.includes('Name')) {
                    return { Success: true, Results: Object.keys(ACTION_NAMES).filter((ID) => filter.includes(`'${ACTION_NAMES[ID]}'`)).map((ID) => ({ ID, Name: ACTION_NAMES[ID] })) };
                }
                return {
                    Success: true,
                    Results: Object.keys(ACTION_NAMES).filter(mentioned).map((ID) => ({
                        ID, Name: ACTION_NAMES[ID], Type: 'Custom', DriverClass: null, CompensationActionID: compensations[ID] ?? null,
                    })),
                };
            case 'MJ: Action Authorizations':
                return { Success: true, Results: actionAuthorizations.filter((r) => mentioned(r.ActionID)) };
            case 'MJ: AI Agent Runs':
                return { Success: true, Results: agentReads.runs.filter((r) => mentioned(r.ID)) };
            case 'MJ: AI Agent Actions':
                return { Success: true, Results: agentReads.agentActions.filter((r) => mentioned(r.AgentID)) };
            case 'MJ: Entity Actions':
                return { Success: true, Results: [{ ID: ENTITY_ACTION, ActionID: RESERVE, Status: 'Active', RunMode: 'Durable' }] };
            default:
                return { Success: true, Results: [] };
        }
    };
    return {
        RunView: vi.fn(answer),
        RunViews: vi.fn(async (all: RunViewParams[]) => Promise.all(all.map(answer))),
    };
}

/** A provider that records each saved row and holds one active authorization granted to `ROLE`. */
function provider(saved: string[]): IMetadataProvider {
    let counter = 0;
    return {
        Authorizations: [{ ID: GRANTED_AUTHORIZATION, Name: 'Reserve stock', IsActive: true, ParentID: null }],
        AuthorizationRoles: [{ AuthorizationID: GRANTED_AUTHORIZATION, RoleID: ROLE, AuthorizationType: () => AuthorizationRoleType.Allow }],
        GetEntityObject: vi.fn(async () => {
            const row = { ID: `00000000-0000-4000-8000-0000000003${String(++counter).padStart(2, '0')}`, NewRecord: () => undefined, Save: async () => { saved.push(row.ID); return true; } };
            return row;
        }),
    } as unknown as IMetadataProvider;
}

function spec(compensationActionId?: string): TaskGraphSpec {
    return {
        workflowName: 'Checkout',
        continuation: 'none',
        tasks: [{
            tempId: 'r',
            name: 'Reserve',
            kind: 'Action',
            configuration: { actionName: 'Reserve', ...(compensationActionId ? { compensation: { compensationActionId } } : {}) },
        }],
    } as TaskGraphSpec;
}

/** Two independent Action nodes, Reserve and `second`. */
function twoActionSpec(second = 'Release'): TaskGraphSpec {
    return {
        workflowName: 'Checkout',
        continuation: 'none',
        tasks: [
            { tempId: 'r', name: 'Reserve', kind: 'Action', configuration: { actionName: 'Reserve' } },
            { tempId: 'x', name: second, kind: 'Action', configuration: { actionName: second } },
        ],
    } as TaskGraphSpec;
}

/**
 * A run chain submitted from `CHILD_RUN` (a run of `PLANNER`, bound to nothing). Its ancestors are a
 * run of another user (agent bound to Release), a run whose agent the user may not run (agent bound
 * to Restock), and the root: a run of `AGENT`, bound to Reserve.
 */
const RUN_CHAIN = {
    runs: [
        { ID: CHILD_RUN, AgentID: PLANNER, UserID: '66666666-6666-4666-8666-666666666666', ParentRunID: OTHER_USERS_RUN },
        { ID: OTHER_USERS_RUN, AgentID: OTHER_AGENT, UserID: OTHER_USER_ID, ParentRunID: NOT_RUNNABLE_RUN },
        { ID: NOT_RUNNABLE_RUN, AgentID: NOT_RUNNABLE_AGENT, UserID: '66666666-6666-4666-8666-666666666666', ParentRunID: AGENT_RUN },
        { ID: AGENT_RUN, AgentID: AGENT, UserID: '66666666-6666-4666-8666-666666666666', ParentRunID: null },
    ],
    agentActions: [
        { AgentID: AGENT, ActionID: RESERVE, Status: 'Active' as const },
        { AgentID: OTHER_AGENT, ActionID: RELEASE, Status: 'Active' as const },
        { AgentID: NOT_RUNNABLE_AGENT, ActionID: RESTOCK, Status: 'Active' as const },
    ],
};

/** `CHILD_RUN` (a run of `PLANNER`, bound to nothing) whose parent is the run of `AGENT`, bound to Reserve. */
const PARENT_ONLY_CHAIN = {
    runs: [
        { ID: CHILD_RUN, AgentID: PLANNER, UserID: '66666666-6666-4666-8666-666666666666', ParentRunID: AGENT_RUN },
        { ID: AGENT_RUN, AgentID: AGENT, UserID: '66666666-6666-4666-8666-666666666666', ParentRunID: null },
    ],
    agentActions: [{ AgentID: AGENT, ActionID: RESERVE, Status: 'Active' as const }],
};

/** Submits `spec` from `CHILD_RUN` in `chain`; the user may run every agent but `NOT_RUNNABLE_AGENT`. */
async function submitFromRunChain(spec: TaskGraphSpec, saved: string[], chain: typeof RUN_CHAIN | typeof PARENT_ONLY_CHAIN = RUN_CHAIN) {
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView([], {}, chain) as unknown as RunView);
    vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockImplementation(async (agentID) => agentID !== NOT_RUNNABLE_AGENT);
    return new TaskGraphService().Submit(spec, { EnvironmentID: '', Provider: provider(saved), ContextUser: REGULAR_USER, AgentRunID: CHILD_RUN });
}

afterEach(() => vi.restoreAllMocks());

describe('TaskGraphService.Submit action authorization', () => {
    it('refuses, before writing anything, an Action node the submitter is not authorized to run', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView([]) as unknown as RunView);
        const saved: string[] = [];

        const outcome = await new TaskGraphService().Submit(spec(), { EnvironmentID: '', Provider: provider(saved), ContextUser: REGULAR_USER });

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RESERVE}`);
        expect(saved).toEqual([]);
    });

    it('refuses a compensation action the submitter is not authorized to run, even when the node action is authorized', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
            fakeRunView([{ ActionID: RESERVE, AuthorizationID: GRANTED_AUTHORIZATION }]) as unknown as RunView,
        );
        const saved: string[] = [];

        const outcome = await new TaskGraphService().Submit(spec(RELEASE), { EnvironmentID: '', Provider: provider(saved), ContextUser: REGULAR_USER });

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RELEASE}`);
        expect(saved).toEqual([]);
    });

    it('refuses a compensation action named by the action metadata that the submitter is not authorized to run', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
            fakeRunView([{ ActionID: RESERVE, AuthorizationID: GRANTED_AUTHORIZATION }], { [RESERVE]: RELEASE }) as unknown as RunView,
        );
        const saved: string[] = [];

        const outcome = await new TaskGraphService().Submit(spec(), { EnvironmentID: '', Provider: provider(saved), ContextUser: REGULAR_USER });

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RELEASE}`);
        expect(saved).toEqual([]);
    });

    it('accepts the actions bound to the submitting agent and refuses only the action that is not bound', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView([]) as unknown as RunView);
        vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockResolvedValue(true);
        const saved: string[] = [];

        const outcome = await new TaskGraphService().Submit(twoActionSpec(), {
            EnvironmentID: '', Provider: provider(saved), ContextUser: REGULAR_USER, AgentRunID: AGENT_RUN,
        });

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RELEASE}`);
        expect(outcome.ErrorMessage).not.toContain(RESERVE);
        expect(saved).toEqual([]);
    });

    it('accepts the action of the durable entity-action binding and refuses any other action', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView([]) as unknown as RunView);
        const saved: string[] = [];

        const outcome = await new TaskGraphService().Submit(twoActionSpec(), {
            EnvironmentID: '', Provider: provider(saved), ContextUser: REGULAR_USER, EntityActionID: ENTITY_ACTION,
        });

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RELEASE}`);
        expect(outcome.ErrorMessage).not.toContain(RESERVE);
        expect(saved).toEqual([]);
    });

    it('accepts an action bound to the agent of a parent run, and refuses only the action bound to no agent in the run chain', async () => {
        const saved: string[] = [];

        const outcome = await submitFromRunChain(twoActionSpec('Release'), saved, PARENT_ONLY_CHAIN);

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RELEASE}`);
        expect(outcome.ErrorMessage).not.toContain(RESERVE);
        expect(saved).toEqual([]);
    });

    it('gives no exemption for a parent run of another user', async () => {
        const outcome = await submitFromRunChain(twoActionSpec('Release'), []);

        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RELEASE}`);
        expect(outcome.ErrorMessage).not.toContain(RESERVE);
    });

    it('gives no exemption for a parent run whose agent the user may not run', async () => {
        const outcome = await submitFromRunChain(twoActionSpec('Restock'), []);

        expect(outcome.ErrorMessage).toContain(`not authorized to run action ${RESTOCK}`);
        expect(outcome.ErrorMessage).not.toContain(RESERVE);
    });
});
