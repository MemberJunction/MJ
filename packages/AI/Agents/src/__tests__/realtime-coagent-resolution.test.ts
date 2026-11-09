/**
 * Tests for the shared co-agent resolution chain and CanRun filter that BOTH the browser resolver and every
 * server-bridged host (telephony, LiveKit) call. The AI metadata caches are mocked — no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

interface FakeAgent {
    ID: string;
    Name: string;
    Status: string;
    TypeID: string | null;
    DefaultCoAgentID?: string | null;
}

const REALTIME_TYPE = 'type-realtime';
const LOOP_TYPE = 'type-loop';

const state = vi.hoisted(() => ({
    agents: [] as FakeAgent[],
    agentTypes: [] as Array<{ ID: string; Name: string }>,
    coAgentRows: [] as Array<{ Type: string; Status: string; TargetAgentTypeID: string | null; CoAgentID: string; IsDefault: boolean; Sequence: number }>,
    hasPermission: vi.fn(),
    throwOnTypeRows: false,
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return { Agents: state.agents, AgentTypes: state.agentTypes, Config: async () => undefined };
        },
    },
}));
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: { HasPermission: state.hasPermission },
    AIEngineBase: {
        GetProviderInstance: () => ({
            Config: async () => undefined,
            get AgentCoAgents() {
                if (state.throwOnTypeRows) {
                    throw new Error('cache unavailable');
                }
                return state.coAgentRows;
            },
        }),
    },
}));

import { ResolveRealtimeCoAgentID, FilterAllowedAgentsByCanRun, FindValidCoAgent } from '../realtime/realtime-coagent-resolution';

const user = { ID: 'u1' } as unknown as UserInfo;
const provider = {} as unknown as IMetadataProvider;

function coAgent(id: string, overrides: Partial<FakeAgent> = {}): FakeAgent {
    return { ID: id, Name: id, Status: 'Active', TypeID: REALTIME_TYPE, ...overrides };
}

beforeEach(() => {
    state.throwOnTypeRows = false;
    state.agentTypes = [{ ID: REALTIME_TYPE, Name: 'Realtime' }, { ID: LOOP_TYPE, Name: 'Loop' }];
    state.coAgentRows = [];
    state.agents = [
        { ID: 'target', Name: 'Sage', Status: 'Active', TypeID: LOOP_TYPE },
        coAgent('global', { Name: 'Realtime Co-Agent' }),
    ];
    state.hasPermission.mockReset();
});

describe('ResolveRealtimeCoAgentID', () => {
    it('uses the explicit co-agent when it is valid', async () => {
        state.agents.push(coAgent('explicit'));
        await expect(ResolveRealtimeCoAgentID('target', 'EXPLICIT', user, provider)).resolves.toBe('explicit');
    });

    it('throws on an invalid explicit co-agent (no silent fallback)', async () => {
        state.agents.push(coAgent('inactive', { Status: 'Disabled' }));
        await expect(ResolveRealtimeCoAgentID('target', 'inactive', user, provider)).rejects.toThrow(/not Active/);
        await expect(ResolveRealtimeCoAgentID('target', 'missing', user, provider)).rejects.toThrow(/no agent with that ID/);
    });

    it("uses the target agent's DefaultCoAgentID", async () => {
        state.agents.push(coAgent('persona'));
        state.agents[0].DefaultCoAgentID = 'persona';
        await expect(ResolveRealtimeCoAgentID('target', undefined, user, provider)).resolves.toBe('persona');
    });

    it('falls through a stale per-agent default to the type default', async () => {
        state.agents[0].DefaultCoAgentID = 'gone';
        state.agents.push(coAgent('type-default'));
        state.coAgentRows = [{ Type: 'CoAgent', Status: 'Active', TargetAgentTypeID: LOOP_TYPE, CoAgentID: 'type-default', IsDefault: true, Sequence: 1 }];
        await expect(ResolveRealtimeCoAgentID('target', undefined, user, provider)).resolves.toBe('type-default');
    });

    it('prefers IsDefault, then the lowest Sequence, among type-level rows', async () => {
        state.agents.push(coAgent('a'), coAgent('b'), coAgent('c'));
        state.coAgentRows = [
            { Type: 'CoAgent', Status: 'Active', TargetAgentTypeID: LOOP_TYPE, CoAgentID: 'a', IsDefault: false, Sequence: 1 },
            { Type: 'CoAgent', Status: 'Active', TargetAgentTypeID: LOOP_TYPE, CoAgentID: 'c', IsDefault: true, Sequence: 9 },
            { Type: 'CoAgent', Status: 'Active', TargetAgentTypeID: LOOP_TYPE, CoAgentID: 'b', IsDefault: true, Sequence: 2 },
            { Type: 'CoAgent', Status: 'Inactive', TargetAgentTypeID: LOOP_TYPE, CoAgentID: 'a', IsDefault: true, Sequence: 0 },
        ];
        await expect(ResolveRealtimeCoAgentID('target', undefined, user, provider)).resolves.toBe('b');
    });

    it('falls through to the global co-agent when the type-row cache cannot be read', async () => {
        state.throwOnTypeRows = true;
        await expect(ResolveRealtimeCoAgentID('target', undefined, user, provider)).resolves.toBe('global');
    });

    it('resolves the global Realtime Co-Agent when nothing else is configured', async () => {
        await expect(ResolveRealtimeCoAgentID('target', undefined, user, provider)).resolves.toBe('global');
    });

    it('accepts the deprecated Voice Co-Agent name', async () => {
        state.agents = state.agents.filter((a) => a.ID !== 'global');
        state.agents.push(coAgent('legacy', { Name: 'Voice Co-Agent' }));
        await expect(ResolveRealtimeCoAgentID('target', undefined, user, provider)).resolves.toBe('legacy');
    });

    it('throws when no co-agent exists at all', async () => {
        state.agents = state.agents.filter((a) => a.ID !== 'global');
        await expect(ResolveRealtimeCoAgentID('target', undefined, user, provider)).rejects.toThrow(/not configured/);
    });

    it('resolves with no target (the global default)', async () => {
        await expect(ResolveRealtimeCoAgentID(undefined, undefined, user, provider)).resolves.toBe('global');
    });
});

describe('FindValidCoAgent', () => {
    it('rejects an agent of the wrong type', () => {
        expect(FindValidCoAgent('target').problem).toMatch(/not of the 'Realtime' agent type/);
    });
    it('reports a missing Realtime type', () => {
        state.agentTypes = [];
        expect(FindValidCoAgent('global').problem).toMatch(/not configured/);
    });
});

describe('FilterAllowedAgentsByCanRun', () => {
    it('returns an absent or empty set untouched', async () => {
        await expect(FilterAllowedAgentsByCanRun(undefined, user)).resolves.toBeUndefined();
        await expect(FilterAllowedAgentsByCanRun([], user)).resolves.toEqual([]);
        expect(state.hasPermission).not.toHaveBeenCalled();
    });

    it('keeps only the agents the user may run, preserving order', async () => {
        state.hasPermission.mockImplementation(async (id: string) => id !== 'b');
        const result = await FilterAllowedAgentsByCanRun([{ agentId: 'a' }, { agentId: 'b' }, { agentId: 'c' }], user);
        expect(result?.map((a) => a.agentId)).toEqual(['a', 'c']);
        expect(state.hasPermission).toHaveBeenCalledWith('b', user, 'run');
    });
});
