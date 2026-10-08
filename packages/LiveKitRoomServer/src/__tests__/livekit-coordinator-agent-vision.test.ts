/**
 * The coordinator decides whether an agent's bot watches a meeting: the agent's setting is on (through the bound
 * resolver) AND its model session takes video. When it watches, the bot's join token carries `mj.agentWatches`, so the
 * room offers people the choice from the moment the bot joins, and the bridge is told to read the cameras and screens
 * of people who allow it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import type {
    IRealtimeSession,
    RealtimeInputFrame,
    RealtimeSessionCapabilities,
    RealtimeToolDefinition,
    RealtimeTrackDescriptor,
} from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import type { ActiveBridgeSession } from '@memberjunction/ai-bridge-server';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS, type BridgeOps } from '../livekit-agent-room-coordinator';
import { LiveKitTokenService, type MintedToken } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };
const AUDIO_IN: RealtimeTrackDescriptor = { Modality: 'audio', Direction: 'inbound' };
const VIDEO_IN: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 };

/** A model session that declares whether it takes video, and records whether it was closed. */
class FakeModelSession implements IRealtimeSession {
    public Closed = false;
    constructor(private readonly takesVideo: boolean) {}
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false, SupportedInboundTracks: this.takesVideo ? [AUDIO_IN, VIDEO_IN] : [AUDIO_IN] };
    }
    public SendInput(_frame: RealtimeInputFrame): void {
        /* not driven here */
    }
    public async RegisterTools(_tools: RealtimeToolDefinition[]): Promise<void> {
        /* not driven here */
    }
    public OnOutput(): void {
        /* not driven here */
    }
    public OnTranscript(): void {
        /* not driven here */
    }
    public OnToolCall(): void {
        /* not driven here */
    }
    public async SendToolResult(): Promise<void> {
        /* not driven here */
    }
    public OnInterruption(): void {
        /* not driven here */
    }
    public OnError(): void {
        /* not driven here */
    }
    public OnUsage(): void {
        /* not driven here */
    }
    public async Close(): Promise<void> {
        this.Closed = true;
    }
}

/** A token service whose bot-token mint fails, after the coordinator's configuration check passes. */
class FailingMintTokenService extends LiveKitTokenService {
    public override async MintBotToken(): Promise<MintedToken> {
        throw new Error('mint failed');
    }
}

/** Bridge operations that capture what the coordinator asks the engine to start. */
function makeBridgeOps(): { ops: BridgeOps; starts: Array<{ Configuration?: Record<string, unknown> }> } {
    const starts: Array<{ Configuration?: Record<string, unknown> }> = [];
    let seq = 0;
    const ops: BridgeOps = {
        Config: vi.fn(async () => undefined),
        ProviderByDriverClass: vi.fn(() => ({ ID: 'p1', DriverClass: LIVEKIT_BRIDGE_DRIVER_CLASS }) as unknown as MJAIBridgeProviderEntity),
        StartBridgeSession: vi.fn(async (params) => {
            starts.push({ Configuration: params.Configuration });
            return { SessionBridgeID: `vision-bridge-${++seq}` } as unknown as ActiveBridgeSession;
        }),
        StopBridgeSession: vi.fn(async () => true),
        ReconfigureSessionToMeeting: vi.fn(() => true),
    };
    return { ops, starts };
}

/** The attributes a minted token carries, read back through LiveKit's own verifier. */
async function tokenAttributes(token: string): Promise<Record<string, string> | undefined> {
    const claims = await new TokenVerifier(CONFIG.ApiKey, CONFIG.ApiSecret).verify(token);
    return claims.attributes;
}

describe('LiveKitAgentRoomCoordinator — whether the bot watches', () => {
    const coordinator = LiveKitAgentRoomCoordinator.Instance;
    let room = 0;
    const start = () => coordinator.StartAgentRoomSession({ AgentSessionID: `vision-${++room}`, RoomName: `vision-room-${room}`, AgentName: 'Sage' });

    beforeEach(() => {
        coordinator.SetTokenService(new LiveKitTokenService(CONFIG));
    });

    afterEach(() => {
        coordinator.SetAgentVisionResolver(undefined);
    });

    it("watches when the agent's setting is on and its session takes video: the token carries mj.agentWatches", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetSessionFactory(async () => new FakeModelSession(true));
        coordinator.SetAgentVisionResolver(() => true);

        await start();

        const config = starts[0].Configuration;
        expect(config?.AgentVision).toBe(true);
        expect(await tokenAttributes(String(config?.AccessToken))).toEqual({ 'mj.agentWatches': 'true' });
    });

    it("doesn't watch when the setting is off", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetSessionFactory(async () => new FakeModelSession(true));
        coordinator.SetAgentVisionResolver(() => false);

        await start();

        expect(starts[0].Configuration?.AgentVision).toBe(false);
        expect(await tokenAttributes(String(starts[0].Configuration?.AccessToken))).toBeUndefined();
    });

    it("doesn't watch when the session takes no video, even with the setting on", async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetSessionFactory(async () => new FakeModelSession(false));
        coordinator.SetAgentVisionResolver(() => true);

        await start();

        expect(starts[0].Configuration?.AgentVision).toBe(false);
        expect(await tokenAttributes(String(starts[0].Configuration?.AccessToken))).toBeUndefined();
    });

    it('never watches with no resolver bound', async () => {
        const { ops, starts } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        coordinator.SetSessionFactory(async () => new FakeModelSession(true));

        await start();

        expect(starts[0].Configuration?.AgentVision).toBe(false);
        expect(await tokenAttributes(String(starts[0].Configuration?.AccessToken))).toBeUndefined();
    });

    it('fails before opening a model session when LiveKit is not configured', async () => {
        const { ops } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        const factory = vi.fn(async () => new FakeModelSession(true));
        coordinator.SetSessionFactory(factory);
        coordinator.SetTokenService(new LiveKitTokenService({ ServerUrl: '', ApiKey: '', ApiSecret: '' }));

        await expect(start()).rejects.toThrow(/LiveKitTokenService is not configured/);
        expect(factory).not.toHaveBeenCalled();
    });

    it('closes the opened model session when minting the bot token fails', async () => {
        const { ops } = makeBridgeOps();
        coordinator.SetBridgeOps(ops);
        const session = new FakeModelSession(true);
        coordinator.SetSessionFactory(async () => session);
        coordinator.SetTokenService(new FailingMintTokenService(CONFIG));

        await expect(start()).rejects.toThrow('mint failed');
        expect(session.Closed).toBe(true);
        expect(ops.StartBridgeSession).not.toHaveBeenCalled();
    });
});
