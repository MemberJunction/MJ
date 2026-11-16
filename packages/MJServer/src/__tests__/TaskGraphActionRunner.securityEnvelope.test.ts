/**
 * `TaskGraphActionRunner` runs a task-graph action node under its security envelope (S1, S7, S8):
 * the run scope reaches the action as `RunScope`, a tainted node may not run a `disallowWhenTainted`
 * action, and an action whose output is untrusted reports its output tainted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { mockActions, runAction, cachedUsers } = vi.hoisted(() => ({
    mockActions: [] as Array<{ ID: string; Name: string; Config_Object: { disallowWhenTainted?: boolean; outputTrustLevel?: 'Trusted' | 'SemiTrusted' | 'Untrusted' } | null }>,
    runAction: vi.fn(),
    cachedUsers: [] as Array<{ ID: string; UserRoles: Array<{ Role: string }> }>,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { get Users() { return cachedUsers; }, Refresh: vi.fn() } },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: { Instance: { Config: vi.fn(), get Actions() { return mockActions; }, RunAction: runAction } },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { TAINTED_EGRESS_BLOCKED, type TaskSecurityEnvelope } from '@memberjunction/ai-core-plus';
import type { TaskActionRunParams } from '@memberjunction/task-graph';
import { TaskGraphActionRunner, ToActionRunScope } from '../services/TaskGraphActionRunner';

const SCOPED_SEARCH = 'f0000000-0000-4000-8000-000000000001';
const SEND_EMAIL = 'f0000000-0000-4000-8000-000000000002';
const WEB_FETCH = 'f0000000-0000-4000-8000-000000000003';
const SEARCH_SCOPE = 'f0000000-0000-4000-8000-000000000004';

function runParams(actionID: string, envelope?: TaskSecurityEnvelope): TaskActionRunParams {
    return {
        TaskID: 'T1',
        ActionID: actionID,
        InputPayload: { Query: 'q' },
        DependencyOutputs: new Map(),
        Provider: {} as IMetadataProvider,
        ContextUser: { ID: 'u1' } as UserInfo,
        ...(envelope ? { SecurityEnvelope: envelope } : {}),
    };
}

describe('TaskGraphActionRunner security envelope', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockActions.length = 0;
        mockActions.push(
            { ID: SCOPED_SEARCH, Name: 'Scoped Search', Config_Object: null },
            { ID: SEND_EMAIL, Name: 'Send Email', Config_Object: { disallowWhenTainted: true } },
            { ID: WEB_FETCH, Name: 'Web Fetch', Config_Object: { outputTrustLevel: 'Untrusted' } },
        );
        runAction.mockResolvedValue({ Success: true, Params: [], Message: 'ok', ResultCode: 'SUCCESS' });
    });

    it("hands the action the run's scope as RunScope, so a Scoped Search node searches the run's tenant only", async () => {
        const runScope = { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-A', SecondaryScopes: { Region: 'eu' }, SearchScopeIDs: [SEARCH_SCOPE] };
        await new TaskGraphActionRunner().RunActionForTask(runParams(SCOPED_SEARCH, { Version: 1, IsRunTainted: false, RunScope: runScope }));
        expect(runAction.mock.calls[0][0].RunScope).toEqual(runScope);
    });

    it('passes no RunScope for a node with no scope', async () => {
        await new TaskGraphActionRunner().RunActionForTask(runParams(SCOPED_SEARCH));
        expect(runAction.mock.calls[0][0].RunScope).toBeUndefined();
    });

    it('refuses a disallowWhenTainted action on a tainted node without running it', async () => {
        const result = await new TaskGraphActionRunner().RunActionForTask(runParams(SEND_EMAIL, { Version: 1, IsRunTainted: true }));
        expect(runAction).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(TAINTED_EGRESS_BLOCKED);
    });

    it('runs that action on a node whose input is clean (no taint, or reviewed by a Human step)', async () => {
        const result = await new TaskGraphActionRunner().RunActionForTask(runParams(SEND_EMAIL, { Version: 1, IsRunTainted: false }));
        expect(runAction).toHaveBeenCalledTimes(1);
        expect(result.Success).toBe(true);
    });

    it('runs any other action on a tainted node', async () => {
        await new TaskGraphActionRunner().RunActionForTask(runParams(SCOPED_SEARCH, { Version: 1, IsRunTainted: true }));
        expect(runAction).toHaveBeenCalledTimes(1);
    });

    it("reports an untrusted action's output as tainted, and a trusted one's as not", async () => {
        const runner = new TaskGraphActionRunner();
        expect((await runner.RunActionForTask(runParams(WEB_FETCH))).IsOutputTainted).toBe(true);
        expect((await runner.RunActionForTask(runParams(SCOPED_SEARCH))).IsOutputTainted).toBe(false);
    });

    it("hands the action the audience's hydrated users, found the way a run's audience is", async () => {
        const reader = { ID: 'READER-1', UserRoles: [{ Role: 'UI' }] };
        cachedUsers.splice(0, cachedUsers.length, reader);
        await new TaskGraphActionRunner().RunActionForTask(runParams(SCOPED_SEARCH, { Version: 1, IsRunTainted: false, Audience: { ReaderUserIDs: ['reader-1'] } }));
        expect(runAction.mock.calls[0][0].Audience).toEqual({ Readers: [reader] });
    });

    it('refuses a node whose audience names a user that does not exist, instead of running with a stand-in (M3)', async () => {
        cachedUsers.splice(0, cachedUsers.length, { ID: 'READER-1', UserRoles: [] });
        const result = await new TaskGraphActionRunner().RunActionForTask(
            runParams(SCOPED_SEARCH, { Version: 1, IsRunTainted: false, Audience: { ReaderUserIDs: ['reader-1', 'ghost-reader'] } }),
        );
        expect(runAction).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('match no user');
    });

    it('copies the scope rather than sharing arrays with the envelope', () => {
        const scope = { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'org-A', SecondaryScopes: { Tags: ['a'] }, SearchScopeIDs: [SEARCH_SCOPE] };
        const copy = ToActionRunScope(scope);
        expect(copy).toEqual(scope);
        expect(copy.SearchScopeIDs).not.toBe(scope.SearchScopeIDs);
    });
});

/**
 * The gate is only as good as the metadata that turns it on: the actions MJ ships in `metadata/actions`
 * that send data out or change data carry `Config.disallowWhenTainted`, so the runner refuses them on a
 * tainted node, while read-only actions still run.
 */
describe('TaskGraphActionRunner taint gate on the shipped action metadata', () => {
    const actionsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../metadata/actions');

    type ShippedAction = { fields: { Name: string; Config?: Record<string, unknown> }; relatedEntities?: { 'MJ: Actions'?: ShippedAction[] } };
    function shippedAction(file: string, name: string): ShippedAction['fields'] {
        const all: ShippedAction[] = [];
        const collect = (r: ShippedAction): void => { all.push(r); (r.relatedEntities?.['MJ: Actions'] ?? []).forEach(collect); };
        (JSON.parse(readFileSync(join(actionsDir, file), 'utf8')) as ShippedAction[]).forEach(collect);
        const found = all.filter((r) => r.fields.Name === name);
        expect(found, `${file}: "${name}"`).toHaveLength(1);
        return found[0].fields;
    }
    function load(file: string, name: string): string {
        const fields = shippedAction(file, name);
        const id = `f1000000-0000-4000-8000-${String(mockActions.length + 1).padStart(12, '0')}`;
        mockActions.push({ ID: id, Name: name, Config_Object: (fields.Config ?? null) as (typeof mockActions)[number]['Config_Object'] });
        return id;
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mockActions.length = 0;
        runAction.mockResolvedValue({ Success: true, Params: [], Message: 'ok', ResultCode: 'SUCCESS' });
    });

    it.each([
        ['.actions.json', 'Send Single Message'],
        ['.additional-core-actions.json', 'Slack Webhook'],
        ['.additional-core-actions.json', 'Teams Webhook'],
        ['.lists-actions.json', 'Send To Audience'],
        ['.additional-core-actions.json', 'HTTP Request'],
        ['.additional-core-actions.json', 'GraphQL Query'],
        ['.mcp-actions.json', 'Execute MCP Tool'],
        ['.actions.json', 'Create Record'],
        ['.actions.json', 'Update Record'],
        ['.actions.json', 'Delete Record'],
        ['.write-entity-fields.json', 'Write Entity Field(s)'],
        ['.execute-agent.json', 'Execute Agent'],
        ['.file-storage-operations.json', 'File Storage: Delete Object'],
        ['.biz-apps-social.json', 'Create Post (LinkedIn)'],
    ])('refuses %s "%s" on a tainted node without running it', async (file, name) => {
        const id = load(file, name);
        const result = await new TaskGraphActionRunner().RunActionForTask(runParams(id, { Version: 1, IsRunTainted: true }));
        expect(runAction).not.toHaveBeenCalled();
        expect(result.ResultCode).toBe(TAINTED_EGRESS_BLOCKED);
    });

    it.each([
        ['.actions.json', 'Get Record'],
        ['.actions.json', 'Web Search'],
        ['.scoped-search.json', 'Scoped Search'],
    ])('still runs the read-only %s "%s" on a tainted node', async (file, name) => {
        const id = load(file, name);
        const result = await new TaskGraphActionRunner().RunActionForTask(runParams(id, { Version: 1, IsRunTainted: true }));
        expect(runAction).toHaveBeenCalledTimes(1);
        expect(result.Success).toBe(true);
    });
});
