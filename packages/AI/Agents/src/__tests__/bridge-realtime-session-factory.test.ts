/**
 * Tests for `CreateBridgeRealtimeSession` — the provider-agnostic factory a bridge binds onto its
 * session-factory seam. Exercises agent resolution (by id / by name / not found), the ClassFactory
 * instantiation path, the DriverClass guard, and the delegation to `BaseAgent.StartBridgeRealtimeSession`.
 * The `AIEngine`, `MJGlobal.ClassFactory`, and `Metadata` boundaries are mocked — no DB, no models.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks: AIEngine cache, ClassFactory, Metadata ───────────────────────────────

const agents: Array<{ ID: string; Name: string; TypeID: string; DriverClass?: string }> = [
    { ID: 'AAAA0000-0000-0000-0000-000000000001', Name: 'Sage', TypeID: 'TYPE-1', DriverClass: 'SageDriver' },
    { ID: 'AAAA0000-0000-0000-0000-000000000002', Name: 'NoDriver Agent', TypeID: 'TYPE-NONE' },
];
const agentTypes: Array<{ ID: string; DriverClass?: string }> = [
    { ID: 'TYPE-1', DriverClass: 'LoopAgentType' },
    { ID: 'TYPE-NONE' }, // no driver on type either
];
const configSpy = vi.fn(async () => undefined);

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return { Agents: agents, AgentTypes: agentTypes, Config: configSpy };
        },
    },
}));

let createdDriverClass: string | null = null;
let lastStartParams: Record<string, unknown> | null = null;
let instanceToReturn: { StartBridgeRealtimeSession: (p: Record<string, unknown>) => Promise<string> } | null;

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: (_base: unknown, driverClass: string) => {
                        createdDriverClass = driverClass;
                        return instanceToReturn;
                    },
                },
            },
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, Metadata: { Provider: { __global: true } } };
});

// Import AFTER the mocks are declared.
import { CreateBridgeRealtimeSession } from '../realtime/bridge-realtime-session-factory';

describe('CreateBridgeRealtimeSession', () => {
    beforeEach(() => {
        createdDriverClass = null;
        lastStartParams = null;
        instanceToReturn = {
            StartBridgeRealtimeSession: async (p: Record<string, unknown>) => {
                lastStartParams = p;
                return 'SESSION' as unknown as string;
            },
        };
        configSpy.mockClear();
    });

    it('resolves the agent by ID, uses the agent DriverClass, and returns the started session', async () => {
        const session = await CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000001' });
        expect(session).toBe('SESSION');
        expect(createdDriverClass).toBe('SageDriver'); // agent DriverClass wins
        expect((lastStartParams?.agent as { Name: string }).Name).toBe('Sage');
        expect(configSpy).toHaveBeenCalledOnce(); // engine configured defensively
    });

    it('resolves by name (case-insensitive) when no id is given', async () => {
        await CreateBridgeRealtimeSession({ AgentName: '  sage  ' });
        expect((lastStartParams?.agent as { ID: string }).ID).toBe('AAAA0000-0000-0000-0000-000000000001');
    });

    it('falls back to the agent TYPE DriverClass when the agent has none', async () => {
        // Give the no-driver agent a type that DOES have a driver.
        agentTypes[1].DriverClass = 'TypeFallbackDriver';
        await CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000002' });
        expect(createdDriverClass).toBe('TypeFallbackDriver');
        agentTypes[1].DriverClass = undefined; // restore for other tests
    });

    it('threads the context user + provider + empty conversation into StartBridgeRealtimeSession', async () => {
        const user = { ID: 'u1' } as unknown as import('@memberjunction/core').UserInfo;
        const provider = { __req: true } as unknown as import('@memberjunction/core').IMetadataProvider;
        await CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000001', ContextUser: user, MetadataProvider: provider });
        expect(lastStartParams?.contextUser).toBe(user);
        expect(lastStartParams?.provider).toBe(provider);
        expect(lastStartParams?.conversationMessages).toEqual([]);
    });

    it('throws a clear error when the agent cannot be resolved', async () => {
        await expect(CreateBridgeRealtimeSession({ AgentID: 'missing-id' })).rejects.toThrow(/no agent found/);
    });

    it('throws when the agent has no DriverClass and its type none either', async () => {
        await expect(CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000002' })).rejects.toThrow(/no DriverClass/);
    });

    it('throws when the ClassFactory cannot instantiate the driver', async () => {
        instanceToReturn = null;
        await expect(CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000001' })).rejects.toThrow(/could not create a BaseAgent/);
    });
});
