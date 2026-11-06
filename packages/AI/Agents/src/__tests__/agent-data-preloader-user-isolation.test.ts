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
import type { UserInfo } from '@memberjunction/core';

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
});
