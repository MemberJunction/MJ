import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        UUIDsEqual: (a: string, b: string) => a?.trim().toLowerCase() === b?.trim().toLowerCase(),
    };
});

const searchSpy = vi.fn();
const permissionResolveSpy = vi.fn();
const logForbiddenSpy = vi.fn();

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            Search: (...args: unknown[]) => searchSpy(...args),
            streamSearch: vi.fn(),
            LogForbiddenSearch: (...args: unknown[]) => logForbiddenSpy(...args),
        },
    },
    GetSearchScopePermissionResolver: () => ({
        ResolveEffectivePermission: (...args: unknown[]) => permissionResolveSpy(...args),
    }),
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    SearchEngineBase: {
        Instance: {
            Config: vi.fn(async () => {}),
            GetAgentScopes: vi.fn(() => []),
            GetActiveScopeByID: vi.fn(() => undefined),
            get GlobalScope() {
                return { ID: 'global-id', Name: 'Global', IsGlobal: true };
            },
        },
    },
}));

const getEntityObjectSpy = vi.fn();
const agentLoadSpy = vi.fn(async () => true);
const skillLoadSpy = vi.fn(async () => true);

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: () => false,
    Metadata: class {
        GetEntityObject = async (entityName: string) => {
            getEntityObjectSpy(entityName);
            if (entityName === 'MJ: AI Skills') {
                return {
                    ID: '22222222-2222-4222-8222-222222222222',
                    Name: 'DB Skill',
                    SearchScopeAccess: 'All',
                    Load: skillLoadSpy,
                };
            }
            return {
                ID: '11111111-1111-4111-8111-111111111111',
                Name: 'DB Agent',
                SearchScopeAccess: 'All',
                Load: agentLoadSpy,
            };
        };
    },
    UserInfo: class {},
}));

const aiEngineConfigSpy = vi.fn(async () => {});
let cachedAgents: Array<{ ID: string; Name: string; SearchScopeAccess: string }> = [];
let cachedSkills: Array<{ ID: string; Name: string; SearchScopeAccess: string }> = [];

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: (...args: unknown[]) => aiEngineConfigSpy(...args),
            get Agents() {
                return cachedAgents;
            },
            get Skills() {
                return cachedSkills;
            },
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_p: unknown): Promise<unknown> {
            return null;
        }
    },
}));

import { ScopedSearchAction } from '../custom/search/scoped-search.action';

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const SKILL_ID = '22222222-2222-4222-8222-222222222222';

function makeRunParams(
    params: Array<{ Name: string; Value: unknown; Type?: 'Input' | 'Output' }>,
): RunActionParams {
    return {
        Action: { Name: 'Scoped Search' },
        ContextUser: { ID: 'user-1' },
        Params: params.map(p => ({ Name: p.Name, Value: p.Value, Type: p.Type ?? 'Input' })),
        Filters: [],
    } as unknown as RunActionParams;
}

async function runAction(action: ScopedSearchAction, params: RunActionParams): Promise<ActionResultSimple> {
    return (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(params);
}

describe('ScopedSearchAction — AIEngine principal cache fast path', () => {
    let action: ScopedSearchAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new ScopedSearchAction();
        cachedAgents = [];
        cachedSkills = [];
        aiEngineConfigSpy.mockResolvedValue(undefined);
        permissionResolveSpy.mockResolvedValue({
            Allowed: true,
            Level: 'Search',
            Source: 'DirectGrant',
            Reason: 'ok',
            toSqlPredicate: () => '1=1',
        });
        searchSpy.mockResolvedValue({
            Success: true,
            Results: [],
            TotalCount: 0,
            ElapsedMs: 1,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
        });
    });

    it('resolves Agent and Skill from AIEngine.Instance without calling Metadata.GetEntityObject', async () => {
        cachedAgents = [{ ID: AGENT_ID.toUpperCase(), Name: 'Cached Agent', SearchScopeAccess: 'All' }];
        cachedSkills = [{ ID: SKILL_ID.toUpperCase(), Name: 'Cached Skill', SearchScopeAccess: 'All' }];

        const res = await runAction(
            action,
            makeRunParams([
                { Name: 'Query', Value: 'refund policy' },
                { Name: 'AgentID', Value: AGENT_ID.toLowerCase() },
                { Name: 'AISkillID', Value: SKILL_ID.toLowerCase() },
            ]),
        );

        expect(res.Success).toBe(true);
        expect(getEntityObjectSpy).not.toHaveBeenCalled();
        expect(agentLoadSpy).not.toHaveBeenCalled();
        expect(skillLoadSpy).not.toHaveBeenCalled();
        expect(permissionResolveSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                Agent: expect.objectContaining({ Name: 'Cached Agent' }),
                Skill: expect.objectContaining({ Name: 'Cached Skill' }),
            }),
        );
    });

    it('falls back to Metadata.GetEntityObject.Load when Agent or Skill is absent from AIEngine cache', async () => {
        cachedAgents = [];
        cachedSkills = [];

        const res = await runAction(
            action,
            makeRunParams([
                { Name: 'Query', Value: 'refund policy' },
                { Name: 'AgentID', Value: AGENT_ID },
                { Name: 'AISkillID', Value: SKILL_ID },
            ]),
        );

        expect(res.Success).toBe(true);
        expect(getEntityObjectSpy).toHaveBeenCalledWith('MJ: AI Agents');
        expect(getEntityObjectSpy).toHaveBeenCalledWith('MJ: AI Skills');
        expect(agentLoadSpy).toHaveBeenCalledWith(AGENT_ID);
        expect(skillLoadSpy).toHaveBeenCalledWith(SKILL_ID);
    });

    it('falls back cleanly to Metadata.GetEntityObject.Load when AIEngine.Config rejects', async () => {
        aiEngineConfigSpy.mockRejectedValue(new Error('cache unavailable'));

        const res = await runAction(
            action,
            makeRunParams([
                { Name: 'Query', Value: 'refund policy' },
                { Name: 'AgentID', Value: AGENT_ID },
            ]),
        );

        expect(res.Success).toBe(true);
        expect(getEntityObjectSpy).toHaveBeenCalledWith('MJ: AI Agents');
        expect(agentLoadSpy).toHaveBeenCalledWith(AGENT_ID);
    });
});
