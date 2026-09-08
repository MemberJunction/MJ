/**
 * Tests for `CreateBridgeRealtimeSession` — the provider-agnostic factory a bridge binds onto its
 * session-factory seam. Exercises agent resolution (by id / by name / not found), the ClassFactory
 * instantiation path, and the delegation to `BaseAgent.StartBridgeRealtimeSession`.
 * The `AIEngine`, `MJGlobal.ClassFactory`, `Metadata` and `BaseAgent` boundaries are mocked — no DB,
 * no models.
 *
 * ## What #4111 changed here, and why three of these cases inverted
 *
 * The factory used to fall back to `agentType.DriverClass` when an agent declared none. That key
 * names a **BaseAgentType** subclass, while the key this call needs is a **BaseAgent** one — two
 * different ClassFactory registries, matched by exact key, with no overlap. So the fallback matched
 * nothing, and `CreateInstance` (which never returns null for an unmatched key) handed back an
 * instance of the BASE: every such seat silently ran plain `BaseAgent`, dropping the subclass
 * behaviour it was configured for.
 *
 * These specs previously PINNED that behaviour — "falls back to the agent TYPE DriverClass" was
 * asserting the defect, and "throws when the agent has no DriverClass" was asserting a guard that
 * could never fire. Both are inverted below, because an absent `DriverClass` is the common, correct
 * case: it is what makes an agent data rather than code.
 *
 * Note what the no-driver specs assert, and why it is a call COUNT rather than only the key: the
 * factory must construct `new BaseAgent()` directly, not `CreateInstance(BaseAgent, null)`. A null
 * key makes `GetAllRegistrations` skip its key filter, so the factory would return the
 * highest-priority registered subclass — an arbitrary agent. Asserting only "the key was null"
 * cannot tell those two apart; asserting the factory was never called can.
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

type StartableAgent = { StartBridgeRealtimeSession: (p: Record<string, unknown>) => Promise<string> };

/** The driver key the factory asked the ClassFactory for, or `null` when it asked for nothing. */
let createdDriverClass: string | null = null;
/** How many times the ClassFactory was consulted — distinguishes "not called" from "called with null". */
let tryCreateInstanceCalls = 0;
let lastStartParams: Record<string, unknown> | null = null;
let instanceToReturn: StartableAgent | null;

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    // The factory resolves through TryCreateInstance, not CreateInstance, precisely so an
                    // unresolvable key is an ERROR rather than a hollow anchor-base object that answers
                    // plausibly and wrongly. `Resolved: false` is what an unregistered key looks like.
                    TryCreateInstance: (_base: unknown, driverClass: string) => {
                        tryCreateInstanceCalls++;
                        createdDriverClass = driverClass;
                        return instanceToReturn
                            ? { Resolved: true, Instance: instanceToReturn }
                            : { Resolved: false, Instance: null, Reason: 'not registered' };
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

// BaseAgent is mocked because the no-DriverClass path CONSTRUCTS one directly (`new BaseAgent()`),
// and a real one builds an AIPromptRunner, which reaches for live metadata. This file tests the
// factory's resolution logic, not BaseAgent's construction.
vi.mock('../base-agent', () => ({
    BaseAgent: class {
        public StartBridgeRealtimeSession(p: Record<string, unknown>): Promise<string> {
            lastStartParams = p;
            return Promise.resolve('SESSION');
        }
    },
}));

// Import AFTER the mocks are declared.
import { CreateBridgeRealtimeSession } from '../realtime/bridge-realtime-session-factory';

describe('CreateBridgeRealtimeSession', () => {
    beforeEach(() => {
        createdDriverClass = null;
        tryCreateInstanceCalls = 0;
        lastStartParams = null;
        // Restored HERE rather than at the end of the one test that sets it: a spec that fails
        // mid-body would otherwise leak the value into every test after it.
        agentTypes[1].DriverClass = undefined;
        agents[1].DriverClass = undefined;
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

    it('NEVER borrows the agent TYPE DriverClass — it names a BaseAgentType, a different registry', async () => {
        // The regression this closes. `LoopAgentType` and friends are registered against
        // BaseAgentType; asking the BaseAgent registry for one matches nothing, and the old
        // CreateInstance call then handed back an unrelated agent instead of failing.
        agentTypes[1].DriverClass = 'TypeFallbackDriver';

        const session = await CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000002' });

        expect(session).toBe('SESSION');
        // A COUNT, not just the key: `CreateInstance(BaseAgent, null)` would also leave the key null
        // while quietly returning the highest-priority registered subclass. Only "never consulted"
        // proves the factory was bypassed in favour of `new BaseAgent()`.
        expect(tryCreateInstanceCalls).toBe(0);
    });

    it('runs an agent that declares no DriverClass on the plain BaseAgent — the common, correct case', async () => {
        // Most agents declare no DriverClass; that is what makes them data rather than code. The old
        // `no DriverClass` throw was unreachable only because the wrong-registry fallback satisfied it.
        const session = await CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000002' });

        expect(session).toBe('SESSION');
        expect(tryCreateInstanceCalls).toBe(0);
        expect((lastStartParams?.agent as { Name: string }).Name).toBe('NoDriver Agent');
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

    it('treats a whitespace-only DriverClass as none, not as a key', async () => {
        // Every other externally-sourced string in the factory is trimmed. Untrimmed, ' ' is a
        // truthy key that reaches the ClassFactory and fails with a confusing quoted-blank message,
        // when the row plainly means "no driver".
        agents[1].DriverClass = '   ';

        const session = await CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000002' });

        expect(session).toBe('SESSION');
        expect(tryCreateInstanceCalls).toBe(0);
        agents[1].DriverClass = undefined;
    });

    it('throws — rather than falling back — when the agent DECLARES a driver that is not registered', async () => {
        // The one case that must still fail loudly: the agent named a driver and it is missing. The
        // base-class fallback here would run a different agent in this agent's voice, which is the
        // exact failure being fixed, so refusing is the point.
        instanceToReturn = null;
        await expect(CreateBridgeRealtimeSession({ AgentID: 'AAAA0000-0000-0000-0000-000000000001' }))
            .rejects.toThrow(/no BaseAgent subclass is registered as 'SageDriver'/);
    });
});
