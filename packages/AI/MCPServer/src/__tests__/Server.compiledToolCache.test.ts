import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MCPSessionContext } from '../Server.js';
import { ClearCompiledToolCache, GetOrBuildCompiledToolConfigs } from '../Server.js';

const { aiEngineConfigMock, entitiesMock } = vi.hoisted(() => ({
    aiEngineConfigMock: vi.fn().mockResolvedValue(undefined),
    entitiesMock: [
        {
            ID: 'ent-1',
            Name: 'Users',
            ClassName: 'Users',
            SchemaName: '__mj',
            BaseTable: 'User',
            BaseView: 'vwUsers',
            Description: 'Users entity',
            Fields: [],
            PrimaryKeys: [],
        },
    ],
}));

vi.mock('@memberjunction/server', () => ({}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Loaded: true,
            Config: aiEngineConfigMock,
            Agents: [],
            Prompts: [],
            AgentTypes: [],
            Models: [],
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            static get Provider() {
                return { Entities: entitiesMock };
            }
            get Entities() {
                return entitiesMock;
            }
        },
        RunView: class {
            async RunView(_params: Record<string, unknown>, contextUser?: UserInfo) {
                return {
                    Success: true,
                    Results: [{ executedAsUserId: contextUser?.ID }],
                };
            }
        },
    };
});

describe('MCPServer compiled ToolConfig cache (MJ-AI-6)', () => {
    const systemUser = { ID: 'sys-user', Name: 'System', Email: 'sys@example.com' } as unknown as UserInfo;
    const userA = { ID: 'user-a', Name: 'Alice', Email: 'alice@example.com' } as unknown as UserInfo;
    const userB = { ID: 'user-b', Name: 'Bob', Email: 'bob@example.com' } as unknown as UserInfo;

    const sessionA: MCPSessionContext = {
        apiKey: 'key-a',
        user: userA,
        authMethod: 'apiKey',
    };
    const sessionB: MCPSessionContext = {
        apiKey: 'key-b',
        user: userB,
        authMethod: 'apiKey',
    };

    beforeEach(() => {
        ClearCompiledToolCache();
        aiEngineConfigMock.mockClear();
    });

    it('compiles ToolConfig definitions once and reuses them across sessions while preserving active session user context', async () => {
        const firstBuild = await GetOrBuildCompiledToolConfigs(systemUser, sessionA);
        const secondBuild = await GetOrBuildCompiledToolConfigs(systemUser, sessionB);

        expect(secondBuild).toBe(firstBuild);
        expect(aiEngineConfigMock).toHaveBeenCalledTimes(1);

        const listRunsTool = secondBuild.find((t) => t.name === 'List_Recent_Agent_Runs');
        expect(listRunsTool).toBeDefined();

        // Execute the cached tool under sessionA and sessionB and verify each uses its own sessionContext.user
        const outA = JSON.parse(await listRunsTool!.execute({ days: 7, limit: 5, status: 'all' }, sessionA)) as Array<{
            executedAsUserId: string;
        }>;
        const outB = JSON.parse(await listRunsTool!.execute({ days: 7, limit: 5, status: 'all' }, sessionB)) as Array<{
            executedAsUserId: string;
        }>;

        expect(outA[0].executedAsUserId).toBe('user-a');
        expect(outB[0].executedAsUserId).toBe('user-b');

        // Clearing the cache forces a fresh build
        ClearCompiledToolCache();
        const thirdBuild = await GetOrBuildCompiledToolConfigs(systemUser, sessionB);
        expect(thirdBuild).not.toBe(firstBuild);
        expect(aiEngineConfigMock).toHaveBeenCalledTimes(2);
    });
});
