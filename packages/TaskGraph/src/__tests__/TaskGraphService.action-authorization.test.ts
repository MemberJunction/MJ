/**
 * `TaskGraphService.Submit` accepts an Action or compensation node only when the submitter may run
 * that action (`MJ: Action Authorizations`, or an Owner-type user).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthorizationRoleType, RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { TaskGraphService } from '../TaskGraphService';

const WORKFLOW_TYPE_ID = '00000000-0000-4000-8000-0000000000aa';
const RESERVE = '11111111-1111-4111-8111-111111111111';
const RELEASE = '22222222-2222-4222-8222-222222222222';
const GRANTED_AUTHORIZATION = '44444444-4444-4444-8444-444444444444';
const ROLE = '55555555-5555-4555-8555-555555555555';

const ACTION_NAMES: Record<string, string> = { [RESERVE]: 'Reserve', [RELEASE]: 'Release' };

/** A non-Owner user who holds `GRANTED_AUTHORIZATION` through `ROLE`. */
const REGULAR_USER = {
    ID: '66666666-6666-4666-8666-666666666666',
    Name: 'Regular User',
    Type: 'User',
    IsActive: true,
    UserRoles: [{ RoleID: ROLE }],
} as unknown as UserInfo;

type ActionAuthorizationRow = { ActionID: string; AuthorizationID: string };

/** Answers the reads Submit makes. `actionAuthorizations` are the `MJ: Action Authorizations` rows. */
function fakeRunView(actionAuthorizations: ActionAuthorizationRow[]) {
    const answer = async (params: RunViewParams) => {
        const filter = params.ExtraFilter ?? '';
        const mentioned = (id: string) => filter.toLowerCase().includes(id.toLowerCase());
        switch (params.EntityName) {
            case 'MJ: Task Types':
                return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
            case 'MJ: Actions':
                if (filter.includes('Name')) {
                    return { Success: true, Results: [{ ID: RESERVE, Name: 'Reserve' }] };
                }
                return {
                    Success: true,
                    Results: Object.keys(ACTION_NAMES).filter(mentioned).map((ID) => ({ ID, Name: ACTION_NAMES[ID], Type: 'Custom', DriverClass: null })),
                };
            case 'MJ: Action Authorizations':
                return { Success: true, Results: actionAuthorizations.filter((r) => mentioned(r.ActionID)) };
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
});
