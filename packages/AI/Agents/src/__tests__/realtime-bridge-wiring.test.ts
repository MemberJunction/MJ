/**
 * Tests for the bridged-session wiring in {@link RealtimeClientSessionService.WireBridgeRealtimeSession}:
 * the CanRun filter on the delegation set, the local (host) tool handler, spoken progress during delegated
 * work, and the runtime handle a host uses to cancel delegations on barge-in.
 *
 * Collaborators (engine config, observability run creation, the delegated run itself) are stubbed on a test
 * subclass — no DB, no models.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IRealtimeSession, RealtimeToolCall, RealtimeUsage } from '@memberjunction/ai';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock('@memberjunction/ai-engine-base', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-engine-base')>();
    return { ...actual, AIAgentPermissionHelper: { HasPermission: hasPermission } };
});
vi.mock('../AgentRunner', () => ({ AgentRunner: class { RunAgent = vi.fn(); } }));

import {
    RealtimeClientSessionService,
    GetBridgeRealtimeRuntime,
    BridgeLocalToolHandler,
    ExecuteRelayedToolInput,
    RealtimeSessionParamsPrep,
    PrepareClientSessionInput,
} from '../realtime/realtime-client-session-service';
import type { RealtimeToolBroker } from '../realtime/realtime-tool-broker';
import type { RealtimeUsageRecord } from '@memberjunction/ai-engine-base';
import { BRIDGE_USAGE_FLUSH_MS } from '../realtime/bridge-realtime-usage-recorder';

const contextUser = { ID: 'user-1', Email: 'u@example.com' } as unknown as UserInfo;
const provider = {} as unknown as IMetadataProvider;

type ToolHandler = (call: RealtimeToolCall) => void | Promise<void>;

class FakeSession {
    public ToolHandler?: ToolHandler;
    public UsageHandler?: (usage: RealtimeUsage) => void;
    public readonly Results: Array<{ callID: string; output: string }> = [];
    public readonly Notes: string[] = [];
    public readonly Spoken: string[] = [];
    public Closed = false;
    SendInput(): void {}
    async RegisterTools(): Promise<void> {}
    OnOutput(): void {}
    OnTranscript(): void {}
    OnToolCall(handler: ToolHandler): void {
        this.ToolHandler = handler;
    }
    async SendToolResult(callID: string, output: string): Promise<void> {
        this.Results.push({ callID, output });
    }
    OnInterruption(): void {}
    OnUsage(handler: (usage: RealtimeUsage) => void): void {
        this.UsageHandler = handler;
    }
    OnError(): void {}
    SendContextNote(text: string): void {
        this.Notes.push(text);
    }
    RequestSpokenUpdate(instructions: string): boolean {
        this.Spoken.push(instructions);
        return true;
    }
    async Close(): Promise<void> {
        this.Closed = true;
    }
}

class WiringService extends RealtimeClientSessionService {
    public LastRelayed?: ExecuteRelayedToolInput;
    public RelayImpl: (input: ExecuteRelayedToolInput) => Promise<{ ResultJson: string; Success: boolean }> = async () => ({ ResultJson: '{"ok":true}', Success: true });
    /** The observability ids the next wiring gets; a prompt run id turns usage recording on. */
    public ObservabilityIds: { CoAgentRunID: string; PromptRunID?: string } = { CoAgentRunID: 'co-run-1' };
    /** Usage writes and finalizes, in order. */
    public readonly Events: string[] = [];
    public readonly UsageWrites: Array<{ PromptRunID: string; Input: number; Output: number; Details?: RealtimeUsageRecord }> = [];

    protected override async createCoAgentObservabilityRun(): Promise<{ CoAgentRunID: string; PromptRunID?: string } | null> {
        return { ...this.ObservabilityIds };
    }
    public override async AccumulatePromptRunUsage(
        promptRunID: string,
        inputDelta: number,
        outputDelta: number,
        _user: UserInfo,
        _provider: IMetadataProvider,
        details?: RealtimeUsageRecord,
    ): Promise<boolean> {
        this.UsageWrites.push({ PromptRunID: promptRunID, Input: inputDelta, Output: outputDelta, ...(details ? { Details: details } : {}) });
        this.Events.push(`usage:${promptRunID}`);
        return true;
    }
    public override async FinalizeCoAgentRun(_coAgentRunID: string | null, promptRunID: string | null): Promise<void> {
        this.Events.push(`finalize:${promptRunID}`);
    }
    protected override resolveCoAgentSystemPrompt() {
        return { Text: '', PromptID: null };
    }
    protected override resolveNarrationInstructionsTemplate(): string | null {
        return null;
    }
    /** Run the real in-flight registry (and abort plumbing) instead of the stubbed relay. */
    public UseRealRelay = false;
    public BrokerFactory?: (input: ExecuteRelayedToolInput) => { ExecuteToolCall: () => Promise<{ ResultJson: string; Success: boolean }> };
    protected override buildToolBroker(input: ExecuteRelayedToolInput, user: UserInfo, prov: IMetadataProvider): RealtimeToolBroker {
        return (this.BrokerFactory ? this.BrokerFactory(input) : super.buildToolBroker(input, user, prov)) as unknown as RealtimeToolBroker;
    }
    public override async ExecuteRelayedTool(
        input: ExecuteRelayedToolInput,
        user: UserInfo,
        prov: IMetadataProvider,
    ): Promise<{ ResultJson: string; Success: boolean }> {
        this.LastRelayed = input;
        return this.UseRealRelay ? super.ExecuteRelayedTool(input, user, prov) : this.RelayImpl(input);
    }
}

function makePrep(allowed: string[]): RealtimeSessionParamsPrep {
    return {
        Success: true,
        CoAgent: { ID: 'co-1', Name: 'Co-Agent' } as unknown as MJAIAgentEntityExtended,
        Resolution: { Model: {}, ModelID: 'm1', VendorID: 'v1', APIName: 'api' },
        EffectiveConfig: { realtime: { allowedAgents: allowed.map((agentId) => ({ agentId })) } },
    } as unknown as RealtimeSessionParamsPrep;
}

const input = { CoAgent: { ID: 'co-1' }, TargetAgentID: 'target-1', AgentSessionID: 'sess-1' } as unknown as PrepareClientSessionInput;

function call(name: string, id = 'c1'): RealtimeToolCall {
    return { CallID: id, ToolName: name, Arguments: '{}' };
}

let service: WiringService;
let session: FakeSession;

async function wire(allowed: string[] = []) {
    service = new WiringService();
    session = new FakeSession();
    return service.WireBridgeRealtimeSession(session as unknown as IRealtimeSession, input, makePrep(allowed), contextUser, provider);
}

beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

describe('WireBridgeRealtimeSession — delegation set', () => {
    it('narrows the colleague union to the agents the run-as user may run', async () => {
        hasPermission.mockImplementation(async (agentId: string) => agentId !== 'denied');
        await wire(['ok-1', 'denied', 'ok-2']);
        await session.ToolHandler?.(call('invoke-target-agent'));
        expect(service.LastRelayed?.AllowedAgents?.map((a) => a.agentId)).toEqual(['ok-1', 'ok-2']);
        expect(hasPermission).toHaveBeenCalledWith('denied', contextUser, 'run');
    });

    it('relays the call result back to the model', async () => {
        await wire();
        await session.ToolHandler?.(call('invoke-target-agent', 'c9'));
        expect(session.Results).toEqual([{ callID: 'c9', output: '{"ok":true}' }]);
    });
});

describe('WireBridgeRealtimeSession — local tool handler', () => {
    function handler(names: string[], result = '{"done":true}'): BridgeLocalToolHandler & { Calls: RealtimeToolCall[] } {
        const calls: RealtimeToolCall[] = [];
        return {
            Calls: calls,
            Handles: (name) => names.includes(name),
            Execute: async (c) => {
                calls.push(c);
                return result;
            },
        };
    }

    it('executes a host tool locally and never enters the delegation path', async () => {
        const runtime = await wire();
        const h = handler(['transfer_call']);
        runtime.SetLocalToolHandler(h);
        await session.ToolHandler?.(call('transfer_call', 'c2'));
        expect(h.Calls).toHaveLength(1);
        expect(service.LastRelayed).toBeUndefined();
        expect(session.Results).toEqual([{ callID: 'c2', output: '{"done":true}' }]);
    });

    it('still delegates tools the handler does not own', async () => {
        const runtime = await wire();
        runtime.SetLocalToolHandler(handler(['transfer_call']));
        await session.ToolHandler?.(call('invoke-target-agent'));
        expect(service.LastRelayed).toBeDefined();
    });

    it('reports a handler failure to the model instead of leaving the call hanging', async () => {
        const runtime = await wire();
        runtime.SetLocalToolHandler({ Handles: () => true, Execute: async () => { throw new Error('boom'); } });
        await session.ToolHandler?.(call('end_call', 'c3'));
        expect(JSON.parse(session.Results[0].output)).toEqual({ success: false, error: 'boom' });
    });

    it('stops routing locally once the handler is cleared', async () => {
        const runtime = await wire();
        const h = handler(['transfer_call']);
        runtime.SetLocalToolHandler(h);
        runtime.SetLocalToolHandler(undefined);
        await session.ToolHandler?.(call('transfer_call'));
        expect(h.Calls).toHaveLength(0);
    });
});

describe('WireBridgeRealtimeSession — runtime handle', () => {
    it('is reachable from the session alone', async () => {
        const runtime = await wire();
        expect(GetBridgeRealtimeRuntime(session as unknown as IRealtimeSession)).toBe(runtime);
        expect(GetBridgeRealtimeRuntime(new FakeSession() as unknown as IRealtimeSession)).toBeUndefined();
    });

    it("carries whether the agent watches meetings, read from the effective configuration", async () => {
        expect((await wire()).WatchesMeetingVideo).toBe(false);

        service = new WiringService();
        session = new FakeSession();
        const prep = { ...makePrep([]), EffectiveConfig: { realtime: { video: { watchMeetings: true } } } } as RealtimeSessionParamsPrep;
        const runtime = await service.WireBridgeRealtimeSession(session as unknown as IRealtimeSession, input, prep, contextUser, provider);
        expect(runtime.WatchesMeetingVideo).toBe(true);
    });

    it('CancelInFlightDelegations aborts a running delegation and reports how many', async () => {
        const runtime = await wire();
        service.UseRealRelay = true;
        let aborted = false;
        service.BrokerFactory = (relayed) => ({
            ExecuteToolCall: () =>
                new Promise((resolve) => {
                    relayed.AbortSignal?.addEventListener('abort', () => {
                        aborted = true;
                        resolve({ ResultJson: '{"cancelled":true}', Success: false });
                    });
                }),
        });
        const pending = session.ToolHandler?.(call('invoke-target-agent', 'c7'));
        await Promise.resolve();
        await Promise.resolve();
        expect(runtime.CancelInFlightDelegations()).toBe(1);
        await pending;
        expect(aborted).toBe(true);
        expect(runtime.CancelInFlightDelegations()).toBe(0);
        expect(session.Results.at(-1)).toEqual({ callID: 'c7', output: '{"cancelled":true}' });
    });

    it('returns 0 when nothing is in flight', async () => {
        const runtime = await wire();
        expect(runtime.CancelInFlightDelegations()).toBe(0);
    });

    it('CancelPendingNarration drops a queued spoken update but leaves the delegation running (the barge-in policy)', async () => {
        vi.useFakeTimers();
        const runtime = await wire();
        let aborted = false;
        service.RelayImpl = async (relayed) => {
            relayed.AbortSignal?.addEventListener('abort', () => { aborted = true; });
            relayed.OnProgress?.({ step: 'prompt_execution', message: 'Looking up your account' });
            runtime.CancelPendingNarration(); // the caller talked over the agent
            await vi.advanceTimersByTimeAsync(10000);
            return { ResultJson: '{"ok":true}', Success: true };
        };
        await session.ToolHandler?.(call('invoke-target-agent', 'c9'));

        expect(session.Spoken).toEqual([]); // the stale progress line was never voiced
        expect(aborted).toBe(false); // ...and the work the caller asked for was not killed
        expect(session.Results.at(-1)).toEqual({ callID: 'c9', output: '{"ok":true}' });
    });

    it('CancelPendingNarration is harmless with nothing pending', async () => {
        const runtime = await wire();
        expect(() => runtime.CancelPendingNarration()).not.toThrow();
    });
});

describe('WireBridgeRealtimeSession — spoken progress', () => {
    it('passes an OnProgress callback that notes progress and speaks a throttled update', async () => {
        vi.useFakeTimers();
        await wire();
        service.RelayImpl = async (relayed) => {
            relayed.OnProgress?.({ step: 'prompt_execution', message: 'Looking up your account' });
            await vi.advanceTimersByTimeAsync(6000); // first spoken update is due ~5 s into the burst
            return { ResultJson: '{"ok":true}', Success: true };
        };
        await session.ToolHandler?.(call('invoke-target-agent'));
        expect(session.Notes).toEqual(['[delegated-agent progress] Looking up your account']);
        expect(session.Spoken).toHaveLength(1);
        expect(session.Spoken[0]).toContain('Looking up your account');
    });

    it('does not speak noise steps', async () => {
        vi.useFakeTimers();
        await wire();
        service.RelayImpl = async (relayed) => {
            relayed.OnProgress?.({ step: 'initialization', message: 'starting' });
            await vi.advanceTimersByTimeAsync(10000);
            return { ResultJson: '{}', Success: true };
        };
        await session.ToolHandler?.(call('invoke-target-agent'));
        expect(session.Notes).toEqual([]);
        expect(session.Spoken).toEqual([]);
    });
});

describe('WireBridgeRealtimeSession — usage', () => {
    beforeEach(() => vi.useFakeTimers());

    /** Wires a session on `svc` whose co-agent prompt run is `promptRunID`. */
    async function wireWithPromptRun(svc: WiringService, promptRunID: string): Promise<FakeSession> {
        svc.ObservabilityIds = { CoAgentRunID: `co-${promptRunID}`, PromptRunID: promptRunID };
        const fake = new FakeSession();
        await svc.WireBridgeRealtimeSession(fake as unknown as IRealtimeSession, input, makePrep([]), contextUser, provider);
        return fake;
    }

    it("writes the session's usage to its co-agent prompt run, with the per-modality details", async () => {
        const svc = new WiringService();
        const fake = await wireWithPromptRun(svc, 'pr-1');

        fake.UsageHandler?.({
            InputTokens: 120,
            OutputTokens: 45,
            InputTokenDetails: { AudioTokens: 100, TextTokens: 20 },
            OutputTokenDetails: { AudioTokens: 45 },
        });
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);

        expect(svc.UsageWrites).toEqual([{
            PromptRunID: 'pr-1',
            Input: 120,
            Output: 45,
            Details: { Input: { AudioTokens: 100, TextTokens: 20 }, Output: { AudioTokens: 45 } },
        }]);
    });

    it('subscribes nothing when the session has no co-agent prompt run', async () => {
        const svc = new WiringService();
        const fake = new FakeSession();

        await svc.WireBridgeRealtimeSession(fake as unknown as IRealtimeSession, input, makePrep([]), contextUser, provider);

        expect(fake.UsageHandler).toBeUndefined();
    });

    it('writes the last usage before it finalizes the runs, when the bridge closes the session', async () => {
        const svc = new WiringService();
        const fake = await wireWithPromptRun(svc, 'pr-1');

        fake.UsageHandler?.({ InputTokens: 7, OutputTokens: 3 });
        await (fake as unknown as IRealtimeSession).Close();

        expect(svc.Events).toEqual(['usage:pr-1', 'finalize:pr-1']);
        expect(svc.UsageWrites).toEqual([{ PromptRunID: 'pr-1', Input: 7, Output: 3 }]);
        expect(fake.Closed).toBe(true);
    });

    it('stores nothing the session reports after it was closed', async () => {
        const svc = new WiringService();
        const fake = await wireWithPromptRun(svc, 'pr-1');

        await (fake as unknown as IRealtimeSession).Close();
        fake.UsageHandler?.({ InputTokens: 50, OutputTokens: 5 });
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);

        expect(svc.UsageWrites).toEqual([]);
        expect(svc.Events).toEqual(['finalize:pr-1']);
    });

    it("keeps a replaced session's usage on its own run; the replacement records on its own", async () => {
        const svc = new WiringService();
        const lost = await wireWithPromptRun(svc, 'pr-lost');
        const replacement = await wireWithPromptRun(svc, 'pr-new');

        lost.UsageHandler?.({ InputTokens: 10, OutputTokens: 1 });
        replacement.UsageHandler?.({ InputTokens: 20, OutputTokens: 2 });
        await (lost as unknown as IRealtimeSession).Close();

        expect(svc.UsageWrites).toEqual([{ PromptRunID: 'pr-lost', Input: 10, Output: 1 }]);
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);
        expect(svc.UsageWrites).toEqual([
            { PromptRunID: 'pr-lost', Input: 10, Output: 1 },
            { PromptRunID: 'pr-new', Input: 20, Output: 2 },
        ]);
    });

    it('registers no usage handler on the fallback runtime (no co-agent resolved)', async () => {
        const svc = new WiringService();
        const fake = new FakeSession();
        const prep = { ...makePrep([]), CoAgent: undefined } as RealtimeSessionParamsPrep;

        await svc.WireBridgeRealtimeSession(fake as unknown as IRealtimeSession, input, prep, contextUser, provider);

        expect(fake.UsageHandler).toBeUndefined();
    });
});

describe('WireBridgeRealtimeSession — the avatar status of a phone call', () => {
    const PHONE = { Requested: true, Granted: false, Reason: 'phone' };

    it("reports phone on a phone call's session, whose driver was asked for no avatar and reports none", async () => {
        const svc = new WiringService();
        const fake = new FakeSession() as unknown as IRealtimeSession;
        const prep = { ...makePrep([]), AvatarResolution: { Voice: 'Puck', Reason: 'phone' } } as RealtimeSessionParamsPrep;
        await svc.WireBridgeRealtimeSession(fake, input, prep, contextUser, provider);
        expect(fake.AvatarStatus).toEqual(PHONE);
    });

    it("keeps the driver's own status on every other session", async () => {
        const svc = new WiringService();
        const meeting = new FakeSession() as unknown as IRealtimeSession;
        const granted = { Requested: true, Granted: true };
        meeting.AvatarStatus = granted;
        await svc.WireBridgeRealtimeSession(meeting, input, { ...makePrep([]), AvatarResolution: { Avatar: { AvatarID: 'Ben' } } } as RealtimeSessionParamsPrep, contextUser, provider);
        expect(meeting.AvatarStatus).toBe(granted);

        const none = new FakeSession() as unknown as IRealtimeSession;
        await svc.WireBridgeRealtimeSession(none, input, makePrep([]), contextUser, provider);
        expect(none.AvatarStatus).toBeUndefined();
    });

    it('reports it on the fallback runtime too (no co-agent resolved)', async () => {
        const svc = new WiringService();
        const fake = new FakeSession() as unknown as IRealtimeSession;
        const prep = { ...makePrep([]), CoAgent: undefined, AvatarResolution: { Reason: 'phone' } } as RealtimeSessionParamsPrep;
        await svc.WireBridgeRealtimeSession(fake, input, prep, contextUser, provider);
        expect(fake.AvatarStatus).toEqual(PHONE);
    });
});

describe("WireBridgeRealtimeSession — the avatar status of a meeting whose prep asked for no avatar (#5319)", () => {
    /** A prep that asked the driver for no avatar, for `reason`, on a model whose driver renders avatars. */
    function prepWithoutAvatar(reason: 'no-binding' | 'unknown-avatar'): RealtimeSessionParamsPrep {
        const prep = makePrep([]);
        const model = { SupportsAvatarOutput: () => true };
        return { ...prep, Resolution: { ...prep.Resolution, Model: model }, AvatarResolution: { Reason: reason } } as unknown as RealtimeSessionParamsPrep;
    }
    const roomInput = { ...input, AvatarDelivery: 'room' } as PrepareClientSessionInput;

    it("reports the prep's reason on a session whose host publishes the avatar, so its bot can say why", async () => {
        for (const reason of ['no-binding', 'unknown-avatar'] as const) {
            const fake = new FakeSession() as unknown as IRealtimeSession;
            await new WiringService().WireBridgeRealtimeSession(fake, roomInput, prepWithoutAvatar(reason), contextUser, provider);
            expect(fake.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: reason });
        }
    });

    it('reports bridged on a session whose host publishes no avatar into a room', async () => {
        const fake = new FakeSession() as unknown as IRealtimeSession;
        await new WiringService().WireBridgeRealtimeSession(fake, input, prepWithoutAvatar('no-binding'), contextUser, provider);
        expect(fake.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'bridged' });
    });
});

describe('WireBridgeRealtimeSession — the avatar status of a meeting whose driver ignored the avatar request (#5429)', () => {
    /** A prep that asked the driver for the persona's face, on a model whose driver renders avatars or not. */
    function prepWithAvatar(driverRendersAvatars: boolean): RealtimeSessionParamsPrep {
        const prep = makePrep([]);
        const model = { SupportsAvatarOutput: () => driverRendersAvatars };
        return {
            ...prep,
            Resolution: { ...prep.Resolution, Model: model },
            AvatarResolution: { Avatar: { AvatarID: 'Ben' }, Voice: 'Puck' },
        } as unknown as RealtimeSessionParamsPrep;
    }
    const roomInput = { ...input, AvatarDelivery: 'room' } as PrepareClientSessionInput;

    afterEach(() => vi.restoreAllMocks());

    it('reports endpoint on a session whose host publishes the avatar, when its driver renders none and reported nothing', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const fake = new FakeSession() as unknown as IRealtimeSession;
        await new WiringService().WireBridgeRealtimeSession(fake, roomInput, prepWithAvatar(false), contextUser, provider);
        expect(fake.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'endpoint' });
        expect(log).toHaveBeenCalledWith('[RealtimeCoAgent] bridged session avatar: audio only (endpoint); the driver was asked for one and reported nothing.');
    });

    it('reports bridged on a session whose host publishes no avatar into a room', async () => {
        const fake = new FakeSession() as unknown as IRealtimeSession;
        await new WiringService().WireBridgeRealtimeSession(fake, input, prepWithAvatar(false), contextUser, provider);
        expect(fake.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'bridged' });
    });

    it('keeps a status the driver reported, and reports nothing when a driver that renders avatars said nothing', async () => {
        const reported = new FakeSession() as unknown as IRealtimeSession;
        const customDisabled = { Requested: true, Granted: false, Reason: 'custom-disabled' as const };
        reported.AvatarStatus = customDisabled;
        await new WiringService().WireBridgeRealtimeSession(reported, roomInput, prepWithAvatar(false), contextUser, provider);
        expect(reported.AvatarStatus).toBe(customDisabled);

        const silent = new FakeSession() as unknown as IRealtimeSession;
        await new WiringService().WireBridgeRealtimeSession(silent, roomInput, prepWithAvatar(true), contextUser, provider);
        expect(silent.AvatarStatus).toBeUndefined();
    });
});
