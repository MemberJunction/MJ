/**
 * The coordinator decides whether an agent's model session may render its avatar in a meeting: it asks the native room
 * module (`describeAvatarVideo`) BEFORE the model session opens, passes `AvatarDelivery: 'room'` only when the bot can
 * publish it, puts the outcome on the bot's token (`mj.agentAvatar`), and gives the engine an audio-only replacement
 * for when the bot takes the avatar down mid-meeting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import type { IRealtimeSession, RealtimeAvatarStatus, RealtimeSessionCapabilities } from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { RegisterNativeRoomModule, type NativeAvatarVideoSupport, type NativeRoomClient, type NativeRoomModule } from '@memberjunction/ai-bridge-livekit';
import type { ActiveBridgeSession, BridgeRealtimeSessionRecovery, StartBridgeSessionParams } from '@memberjunction/ai-bridge-server';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, type BridgeOps, type RealtimeSessionStartContext } from '../livekit-agent-room-coordinator';
import { LiveKitTokenService } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

/** A model session reporting what became of its avatar request. */
class AvatarModelSession implements IRealtimeSession {
    constructor(public readonly AvatarStatus?: RealtimeAvatarStatus) {}
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false };
    }
    public SendInput(): void { /* not driven here */ }
    public async RegisterTools(): Promise<void> { /* not driven here */ }
    public OnOutput(): void { /* not driven here */ }
    public OnTranscript(): void { /* not driven here */ }
    public OnToolCall(): void { /* not driven here */ }
    public async SendToolResult(): Promise<void> { /* not driven here */ }
    public OnInterruption(): void { /* not driven here */ }
    public OnError(): void { /* not driven here */ }
    public OnUsage(): void { /* not driven here */ }
    public async Close(): Promise<void> { /* not driven here */ }
}

/** Registers a native module answering the avatar probe as given (or not at all, or failing), and returns its specifier. */
let moduleSeq = 0;
function registerModule(support: NativeAvatarVideoSupport | 'no-probe' | 'probe-fails', calls: string[] = []): string {
    const specifier = `test-avatar-module-${++moduleSeq}`;
    const module: NativeRoomModule = { createRoomClient: () => ({}) as NativeRoomClient };
    if (support !== 'no-probe') {
        module.describeAvatarVideo = async () => {
            calls.push('describe');
            if (support === 'probe-fails') {
                throw new Error('the probe broke');
            }
            return support;
        };
    }
    RegisterNativeRoomModule(specifier, module);
    return specifier;
}

/** Bridge operations that capture the parameters the coordinator starts the bridge with. */
function makeBridgeOps(): { ops: BridgeOps; starts: StartBridgeSessionParams[] } {
    const starts: StartBridgeSessionParams[] = [];
    let seq = 0;
    const ops: BridgeOps = {
        Config: vi.fn(async () => undefined),
        ProviderByDriverClass: vi.fn(() => ({ ID: 'p1', DriverClass: LIVEKIT_BRIDGE_DRIVER_CLASS }) as unknown as MJAIBridgeProviderEntity),
        StartBridgeSession: vi.fn(async (params: StartBridgeSessionParams) => {
            starts.push(params);
            return { SessionBridgeID: `avatar-bridge-${++seq}` } as unknown as ActiveBridgeSession;
        }),
        StopBridgeSession: vi.fn(async () => true),
        ReconfigureSessionToMeeting: vi.fn(() => true),
    };
    return { ops, starts };
}

async function tokenAttributes(token: unknown): Promise<Record<string, string> | undefined> {
    const claims = await new TokenVerifier(CONFIG.ApiKey, CONFIG.ApiSecret).verify(String(token));
    return claims.attributes;
}

describe('LiveKitAgentRoomCoordinator — the agent\'s avatar in a meeting', () => {
    const coordinator = LiveKitAgentRoomCoordinator.Instance;
    let room = 0;
    let contexts: RealtimeSessionStartContext[];
    const start = () => coordinator.StartAgentRoomSession({ AgentSessionID: `avatar-${++room}`, RoomName: `avatar-room-${room}`, AgentName: 'Sage' });

    /** The session factory hands out these sessions in order, recording each context. */
    function sessions(...made: AvatarModelSession[]): void {
        coordinator.SetSessionFactory(async (ctx) => {
            contexts.push(ctx);
            return made[Math.min(contexts.length - 1, made.length - 1)];
        });
    }

    beforeEach(() => {
        contexts = [];
        coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
    });

    afterEach(() => {
        coordinator.SetNativeModuleSpecifier(undefined);
        coordinator.SetAgentVisionResolver(undefined);
    });

    it('asks the native module before the model session opens, and passes a room delivery when the bot can publish', async () => {
        const calls: string[] = [];
        coordinator.SetNativeModuleSpecifier(registerModule({ Supported: true }, calls));
        coordinator.SetSessionFactory(async (ctx) => {
            calls.push('open');
            contexts.push(ctx);
            return new AvatarModelSession({ Requested: true, Granted: true });
        });
        coordinator.SetBridgeOps(makeBridgeOps().ops);
        await start();
        expect(calls).toEqual(['describe', 'open']);
        expect(contexts[0].AvatarDelivery).toBe('room');
    });

    it("puts 'on' on the bot's token when the avatar is granted, and gives the engine an audio-only replacement", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetNativeModuleSpecifier(registerModule({ Supported: true }));
        const audioOnly = new AvatarModelSession({ Requested: true, Granted: false, Reason: 'bridged' });
        sessions(new AvatarModelSession({ Requested: true, Granted: true }), audioOnly);
        await start();
        expect(await tokenAttributes(starts[0].Configuration?.AccessToken)).toEqual({ 'mj.agentAvatar': 'on' });

        const replace = starts[0].RecoverRealtimeSessionWithoutAvatar as BridgeRealtimeSessionRecovery;
        const replacement = await replace({ PriorTranscript: 'User: hi', Attempt: 1, Reason: 'the avatar could not be shown (decoder-failed)' });
        expect(replacement).toBe(audioOnly);
        expect(contexts[1].AvatarDelivery).toBeUndefined();
        expect(contexts[1].PriorTranscript).toBe('User: hi');
    });

    it('re-opens a recovered session without the avatar once it was taken down', async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetNativeModuleSpecifier(registerModule({ Supported: true }));
        sessions(new AvatarModelSession({ Requested: true, Granted: true }));
        await coordinator.StartAgentRoomSession({ AgentSessionID: 'avatar-host', RoomName: 'avatar-host-room', AgentName: 'Sage', Host: { RecoverModelSession: true } });
        await starts[0].RecoverRealtimeSession!({ PriorTranscript: '', Attempt: 1, Reason: 'drop' });
        expect(contexts[1].AvatarDelivery).toBe('room');
        await starts[0].RecoverRealtimeSessionWithoutAvatar!({ PriorTranscript: '', Attempt: 1, Reason: 'decoder-failed' });
        await starts[0].RecoverRealtimeSession!({ PriorTranscript: '', Attempt: 1, Reason: 'drop' });
        expect(contexts.map((c) => c.AvatarDelivery)).toEqual(['room', 'room', undefined, undefined]);
    });

    it("passes no delivery when the host has no decoder, and names that on the token instead of 'bridged'", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetNativeModuleSpecifier(registerModule({ Supported: false, Reason: 'decoder-missing', Detail: 'ffmpeg could not be run' }));
        sessions(new AvatarModelSession({ Requested: true, Granted: false, Reason: 'bridged' }));
        await start();
        expect(contexts[0].AvatarDelivery).toBeUndefined();
        expect(await tokenAttributes(starts[0].Configuration?.AccessToken)).toEqual({ 'mj.agentAvatar': 'audio-only:decoder-missing' });
        expect(starts[0].RecoverRealtimeSessionWithoutAvatar).toBeUndefined();
    });

    it("treats a native module without the probe as one that publishes no avatars ('bridged')", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetNativeModuleSpecifier(registerModule('no-probe'));
        sessions(new AvatarModelSession({ Requested: true, Granted: false, Reason: 'bridged' }));
        await start();
        expect(contexts[0].AvatarDelivery).toBeUndefined();
        expect(await tokenAttributes(starts[0].Configuration?.AccessToken)).toEqual({ 'mj.agentAvatar': 'audio-only:bridged' });
    });

    it("treats a probe that fails, or a module that cannot be loaded, as a host that publishes no avatars ('bridged')", async () => {
        for (const specifier of [registerModule('probe-fails'), 'test-avatar-module-never-registered']) {
            const { ops, starts } = makeBridgeOps();
            coordinator.SetBridgeOps(ops);
            coordinator.SetNativeModuleSpecifier(specifier);
            contexts = [];
            sessions(new AvatarModelSession({ Requested: true, Granted: false, Reason: 'bridged' }));
            await start();
            expect(contexts[0].AvatarDelivery).toBeUndefined();
            expect(await tokenAttributes(starts[0].Configuration?.AccessToken)).toEqual({ 'mj.agentAvatar': 'audio-only:bridged' });
        }
        expect((await coordinator.DescribeAvatarVideo()).Supported).toBe(false);
    });

    it("keeps the model's own refusal over the host's missing decoder: only 'bridged' is replaced", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetNativeModuleSpecifier(registerModule({ Supported: false, Reason: 'decoder-missing' }));
        sessions(new AvatarModelSession({ Requested: true, Granted: false, Reason: 'custom-disabled' }));
        await start();
        expect(await tokenAttributes(starts[0].Configuration?.AccessToken)).toEqual({ 'mj.agentAvatar': 'audio-only:custom-disabled' });
    });

    it("keeps the model's own reason when the host could publish but the model won't render it", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetNativeModuleSpecifier(registerModule({ Supported: true }));
        sessions(new AvatarModelSession({ Requested: true, Granted: false, Reason: 'endpoint' }));
        await start();
        expect(await tokenAttributes(starts[0].Configuration?.AccessToken)).toEqual({ 'mj.agentAvatar': 'audio-only:endpoint' });
        expect(starts[0].RecoverRealtimeSessionWithoutAvatar).toBeUndefined();
    });

    it('carries no avatar attribute when the agent asked for none, and keeps mj.agentWatches beside one when it did', async () => {
        const first = makeBridgeOps();
        coordinator.SetBridgeOps(first.ops);
        coordinator.SetNativeModuleSpecifier(registerModule({ Supported: true }));
        sessions(new AvatarModelSession());
        await start();
        expect(await tokenAttributes(first.starts[0].Configuration?.AccessToken)).toBeUndefined();

        const second = makeBridgeOps();
        coordinator.SetBridgeOps(second.ops);
        coordinator.SetAgentVisionResolver(() => true);
        const watching = new AvatarModelSession({ Requested: true, Granted: true });
        Object.defineProperty(watching, 'Capabilities', {
            get: () => ({ CanReconfigureTurnMode: false, SupportedInboundTracks: [{ Modality: 'audio', Direction: 'inbound' }, { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 }] }),
        });
        sessions(watching);
        await start();
        expect(await tokenAttributes(second.starts[0].Configuration?.AccessToken)).toEqual({ 'mj.agentWatches': 'true', 'mj.agentAvatar': 'on' });
    });
});
