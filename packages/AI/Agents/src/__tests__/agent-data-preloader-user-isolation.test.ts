/**
 * The PerAgent cache of AgentDataPreloader holds rows loaded under one user's permissions. These
 * tests prove a second user is never served the first user's cached rows, and that each user still
 * gets their own cache hits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dataSources, runViewCalls } = vi.hoisted(() => ({
    dataSources: [] as Array<Record<string, unknown>>,
    runViewCalls: [] as string[],
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get AgentDataSources() { return dataSources; },
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        async RunView(_params: unknown, user: { ID: string }) {
            runViewCalls.push(user.ID);
            return { Success: true, Results: [{ VisibleTo: user.ID }] };
        }
    }
    return { ...actual, RunView: FakeRunView };
});

import { AgentDataPreloader } from '../AgentDataPreloader';
import { EntityPermissionType, IMetadataProvider, Metadata, type UserInfo } from '@memberjunction/core';

const AGENT_ID = 'agent-cache-isolation';
const USER_A = { ID: 'USER-A', Name: 'Alice' } as UserInfo;
const USER_B = { ID: 'user-b', Name: 'Bob' } as UserInfo;

function addPerAgentSource(): void {
    dataSources.length = 0;
    dataSources.push({
        AgentID: AGENT_ID,
        Name: 'Salaries',
        Status: 'Active',
        ExecutionOrder: 1,
        SourceType: 'RunView',
        EntityName: 'Employees',
        DestinationType: 'Data',
        DestinationPath: null,
        CachePolicy: 'PerAgent',
        CacheTimeoutSeconds: 300,
    });
}

describe('AgentDataPreloader PerAgent cache', () => {
    beforeEach(() => {
        AgentDataPreloader.Instance.ClearAgentCache();
        runViewCalls.length = 0;
        addPerAgentSource();
    });

    it("never serves user A's preloaded rows to user B", async () => {
        const first = await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, USER_A);
        const second = await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, USER_B);

        expect(first.data.Salaries).toEqual([{ VisibleTo: 'USER-A' }]);
        expect(second.data.Salaries).toEqual([{ VisibleTo: 'user-b' }]);
        expect(runViewCalls).toEqual(['USER-A', 'user-b']);
    });

    it('still serves a user their own cached rows, whatever the case of their ID', async () => {
        await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, USER_A);
        const again = await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, { ...USER_A, ID: 'user-a' } as UserInfo);

        expect(again.data.Salaries).toEqual([{ VisibleTo: 'USER-A' }]);
        expect(runViewCalls).toEqual(['USER-A']);
    });

    it('does not cache when there is no user to key the entry by', async () => {
        await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, { Name: 'anonymous' } as UserInfo);
        await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, USER_B);

        expect(runViewCalls).toHaveLength(2);
    });

    it('bounds the PerAgent cache: least-recently-used entries are evicted past the cap', async () => {
        const cap = AgentDataPreloader.MAX_PER_AGENT_CACHE_ENTRIES;
        const users = Array.from({ length: cap + 5 }, (_, i) => ({ ID: `user-${i}`, Name: `U${i}` }) as UserInfo);
        for (const u of users) {
            await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, u);
        }
        expect(runViewCalls).toHaveLength(cap + 5);

        // Oldest user was evicted -> reloads from the source; newest is still a cache hit.
        runViewCalls.length = 0;
        await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, users[users.length - 1]);
        expect(runViewCalls).toHaveLength(0);
        await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, users[0]);
        expect(runViewCalls).toEqual(['user-0']);
    });

    it('serves unfiltered field-scoped MJ: Entities views from Metadata.Provider without RunView when permitted and RLS-exempt', async () => {
        dataSources.length = 0;
        dataSources.push({
            AgentID: AGENT_ID,
            Name: 'ALL_ENTITIES',
            Status: 'Active',
            ExecutionOrder: 1,
            SourceType: 'RunView',
            EntityName: 'MJ: Entities',
            OrderBy: 'Name ASC',
            FieldsToRetrieve: JSON.stringify(['Name', 'Description', 'SchemaName', 'BaseTable', 'BaseView']),
            ResultType: 'simple',
            DestinationType: 'Data',
            DestinationPath: null,
            CachePolicy: 'None',
            CacheTimeoutSeconds: 0,
        });

        const fakeEntitiesMeta = {
            GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
            UserExemptFromRowLevelSecurity: vi.fn().mockReturnValue(true),
            GetUserRowLevelSecurityInfo: vi.fn().mockReturnValue([]),
            Fields: [],
        };
        const fakeEntities = [
            { Name: 'Orders', Description: 'Order rows', SchemaName: 'sales', BaseTable: 'Order', BaseView: 'vwOrders' },
            { Name: 'Accounts', Description: null, SchemaName: 'crm', BaseTable: 'Account', BaseView: 'vwAccounts' },
        ];
        const providerSpy = vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
            Entities: fakeEntities,
            EntityByName: (name: string) => (name === 'MJ: Entities' ? fakeEntitiesMeta : undefined),
        } as never);

        try {
            const userWithRoles = { ID: 'user-meta', Name: 'Meta', UserRoles: [] } as UserInfo;
            const res = await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, userWithRoles);
            expect(runViewCalls).toHaveLength(0);
            expect(res.data.ALL_ENTITIES).toEqual([
                { Name: 'Accounts', Description: null, SchemaName: 'crm', BaseTable: 'Account', BaseView: 'vwAccounts' },
                { Name: 'Orders', Description: 'Order rows', SchemaName: 'sales', BaseTable: 'Order', BaseView: 'vwOrders' },
            ]);

            // When an RLS filter applies and user is not exempt, fall back cleanly to RunView
            fakeEntitiesMeta.UserExemptFromRowLevelSecurity.mockReturnValue(false);
            fakeEntitiesMeta.GetUserRowLevelSecurityInfo.mockReturnValue([{ ID: 'rls-1' }]);
            await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, userWithRoles);
            expect(runViewCalls).toEqual(['user-meta']);

            // When ExtraFilter is set, fall back cleanly to RunView
            fakeEntitiesMeta.UserExemptFromRowLevelSecurity.mockReturnValue(true);
            dataSources[0].ExtraFilter = "SchemaName = 'sales'";
            await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, userWithRoles);
            expect(runViewCalls).toEqual(['user-meta', 'user-meta']);
            expect(fakeEntitiesMeta.UserExemptFromRowLevelSecurity).toHaveBeenCalledWith(userWithRoles, EntityPermissionType.Read);
        } finally {
            providerSpy.mockRestore();
        }
    });

    it('uses an explicit provider argument for MJ: Entities instead of global Metadata.Provider', async () => {
        dataSources.length = 0;
        dataSources.push({
            AgentID: AGENT_ID,
            Name: 'ALL_ENTITIES',
            Status: 'Active',
            ExecutionOrder: 1,
            SourceType: 'RunView',
            EntityName: 'MJ: Entities',
            OrderBy: 'Name ASC',
            FieldsToRetrieve: JSON.stringify(['Name', 'Description', 'SchemaName', 'BaseTable', 'BaseView']),
            ResultType: 'simple',
            DestinationType: 'Data',
            DestinationPath: null,
            CachePolicy: 'None',
            CacheTimeoutSeconds: 0,
        });

        const explicitEntitiesMeta = {
            GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
            UserExemptFromRowLevelSecurity: vi.fn().mockReturnValue(true),
            GetUserRowLevelSecurityInfo: vi.fn().mockReturnValue([]),
            Fields: [],
        };
        const explicitProvider = {
            Entities: [
                { Name: 'ScopedEntity', Description: 'Per-provider', SchemaName: 'custom', BaseTable: 'Scoped', BaseView: 'vwScoped' },
            ],
            EntityByName: (name: string) => (name === 'MJ: Entities' ? explicitEntitiesMeta : undefined),
        } as unknown as IMetadataProvider;
        const globalSpy = vi.spyOn(Metadata, 'Provider', 'get');

        try {
            const userWithRoles = { ID: 'user-meta', Name: 'Meta', UserRoles: [] } as UserInfo;
            const res = await AgentDataPreloader.Instance.PreloadAgentData(AGENT_ID, userWithRoles, undefined, explicitProvider);
            expect(runViewCalls).toHaveLength(0);
            expect(globalSpy).not.toHaveBeenCalled();
            expect(res.data.ALL_ENTITIES).toEqual([
                { Name: 'ScopedEntity', Description: 'Per-provider', SchemaName: 'custom', BaseTable: 'Scoped', BaseView: 'vwScoped' },
            ]);
        } finally {
            globalSpy.mockRestore();
        }
    });
});
