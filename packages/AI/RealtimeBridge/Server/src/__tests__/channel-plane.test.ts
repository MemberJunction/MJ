import { describe, it, expect, vi, beforeEach } from 'vitest';

// RunView is used by participant tracking; mock it while leaving the rest of @memberjunction/core intact.
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { IRealtimeSession, RealtimeTranscript } from '@memberjunction/ai';
import type {
    MJAIBridgeProviderEntity,
    MJAIBridgeProviderEntity_IBridgeProviderFeatures,
} from '@memberjunction/core-entities';
import {
    IBridgeChannelHost,
    IBridgeMeetingControlsEventSource,
    BridgeChannelToolDefinition,
    BridgeChannelToolResult,
} from '@memberjunction/ai-bridge-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeBridge, RealtimeBridgeContext, BridgeConnectResult } from '@memberjunction/ai-bridge-base';
import { AIBridgeEngine, IHostInstanceIdentity, StartBridgeSessionParams } from '../ai-bridge-engine';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '../loopback-bridge';

/**
 * A loopback driver that contributes a Meeting Controls surface — registered under its OWN DriverClass
 * so the engine resolves it (with Meeting Controls already enabled at construction) exactly as it would
 * a real meeting driver. This lets the test exercise the engine's `wireChannelPlane` end-to-end.
 */
const LOOPBACK_MC_DRIVER_CLASS = 'LoopbackMeetingControlsBridge';

@RegisterClass(BaseRealtimeBridge, LOOPBACK_MC_DRIVER_CLASS)
class LoopbackMeetingControlsBridge extends LoopbackBridge {
    public override async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        // Enable the facilitator surface BEFORE the engine wires the channel plane (mirrors a real
        // meeting driver that always exposes Meeting Controls).
        this.EnableMeetingControls();
        return super.Connect(ctx);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Test doubles.
// ──────────────────────────────────────────────────────────────────────────────

/** A mock IRealtimeSession that captures perception notes fed via SendContextNote. */
class MockRealtimeSession implements IRealtimeSession {
    public readonly ContextNotes: string[] = [];
    public SendInput(): void {}
    public async RegisterTools(): Promise<void> {}
    public OnOutput(): void {}
    public OnTranscript(_h: (t: RealtimeTranscript) => void): void {}
    public OnToolCall(): void {}
    public async SendToolResult(): Promise<void> {}
    public OnInterruption(): void {}
    public OnError(): void {}
    public OnUsage(): void {}
    public async Close(): Promise<void> {}
    public SendContextNote(text: string): void {
        this.ContextNotes.push(text);
    }
}

/** A mock IRealtimeSession WITHOUT SendContextNote (provider can't inject mid-session). */
class NoPerceptionSession implements IRealtimeSession {
    public SendInput(): void {}
    public async RegisterTools(): Promise<void> {}
    public OnOutput(): void {}
    public OnTranscript(): void {}
    public OnToolCall(): void {}
    public async SendToolResult(): Promise<void> {}
    public OnInterruption(): void {}
    public OnError(): void {}
    public OnUsage(): void {}
    public async Close(): Promise<void> {}
    // No SendContextNote — optional in the interface.
}

/**
 * A fake channel host playing the role of the runner-side adapter over `RealtimeChannelServerHost` +
 * `MeetingControlsChannelServer`. It wires the driver's Meeting Controls event source to perception
 * exactly like the production agents-package adapter does (subscribing roster/speaking/hand-raise and
 * pushing a context note through the supplied sink), and contributes the facilitator tools.
 */
class FakeChannelHost implements IBridgeChannelHost {
    public Started = false;
    public Closed = false;
    public StartedSessionId?: string;
    public MeetingControls: IBridgeMeetingControlsEventSource | null = null;
    public Sink?: (text: string) => void;
    public readonly Perceptions: string[] = [];

    public async StartSessionChannels(
        sessionId: string,
        meetingControls: IBridgeMeetingControlsEventSource | null,
        sendContextNote?: (text: string) => void,
    ): Promise<void> {
        this.Started = true;
        this.StartedSessionId = sessionId;
        this.MeetingControls = meetingControls;
        this.Sink = sendContextNote;

        // Mirror MeetingControlsChannelServer.OnSessionStarted: subscribe perception streams and
        // surface a context note on each change (this is the "perception" the test asserts).
        if (meetingControls) {
            meetingControls.OnRosterChange((p) => this.emit(`roster: ${p.map((x) => x.ParticipantId).join(',')}`));
            meetingControls.OnSpeakingChange((ids) => this.emit(`speaking: ${ids.join(',')}`));
            meetingControls.OnHandRaiseChange((id, raised) => this.emit(`hand ${raised ? 'raised' : 'lowered'}: ${id}`));
        }
    }

    public GetSessionServerTools(_sessionId: string): BridgeChannelToolDefinition[] {
        if (!this.MeetingControls) {
            return [];
        }
        // The facilitator tool vocabulary the Meeting Controls channel contributes (mute included
        // because the loopback source advertises the 'Mute' capability).
        const tools: BridgeChannelToolDefinition[] = [
            { Name: 'MeetingControls_RaiseHand', Description: 'queue a hand', ParametersSchema: { type: 'object' } },
            { Name: 'MeetingControls_CallOnParticipant', Description: 'call on', ParametersSchema: { type: 'object' } },
        ];
        if (this.MeetingControls.Capabilities.includes('Mute')) {
            tools.push({ Name: 'MeetingControls_MuteParticipant', Description: 'mute', ParametersSchema: { type: 'object' } });
        }
        return tools;
    }

    public async ExecuteSessionServerTool(_sessionId: string, toolName: string, argsJson: string): Promise<BridgeChannelToolResult> {
        if (toolName === 'MeetingControls_MuteParticipant') {
            const { participantId } = JSON.parse(argsJson) as { participantId?: string };
            if (participantId && this.MeetingControls) {
                await this.MeetingControls.MuteParticipant(participantId);
                return { Success: true, Output: `muted ${participantId}` };
            }
        }
        return { Success: false, Output: `unhandled ${toolName}` };
    }

    public async CloseSessionChannels(_sessionId: string): Promise<void> {
        this.Closed = true;
    }

    private emit(text: string): void {
        this.Perceptions.push(text);
        this.Sink?.(text); // route to the realtime session perception sink, exactly like production
    }
}

interface FakeEntity {
    [key: string]: unknown;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
}

let seq = 0;
function makeBridgeRow(): FakeEntity {
    return {
        ID: `bridge-cp-${++seq}`,
        Status: 'Pending',
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
    };
}

function makeProvider(): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async () => makeBridgeRow()),
    } as unknown as IMetadataProvider;
}

function makeUser(): UserInfo {
    return { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
}

const FEATURES: MJAIBridgeProviderEntity_IBridgeProviderFeatures = {
    AudioIn: true,
    AudioOut: true,
    SpeakerDiarization: true,
};

function makeProviderEntity(driverClass: string = LOOPBACK_BRIDGE_DRIVER_CLASS): MJAIBridgeProviderEntity {
    return {
        ID: 'provider-loopback',
        Name: 'Loopback',
        DriverClass: driverClass,
        SupportedFeaturesObject: FEATURES,
    } as unknown as MJAIBridgeProviderEntity;
}

const HOST: IHostInstanceIdentity = {
    GetHostInstanceID: () => 'cphost:1:boot',
    GetHostNamePrefix: () => 'cphost:',
};

function engine(): AIBridgeEngine {
    const e = AIBridgeEngine.Instance;
    e.SetHostInstanceIdentity(HOST);
    return e;
}

function baseParams(
    session: IRealtimeSession,
    extra: Partial<StartBridgeSessionParams> = {},
): StartBridgeSessionParams {
    return {
        AgentSessionID: 'cp-session-1',
        Provider: makeProviderEntity(),
        RealtimeSession: session,
        Address: 'loopback://room',
        ContextUser: makeUser(),
        MetadataProvider: makeProvider(),
        ...extra,
    };
}

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});

// ──────────────────────────────────────────────────────────────────────────────
// Part A — channel-plane wiring.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — channel-plane wiring (Part A)', () => {
    it('wires Meeting Controls end-to-end: tools reach the runner and a hand-raise produces perception', async () => {
        const session = new MockRealtimeSession();
        const host = new FakeChannelHost();

        // The engine resolves a driver that contributes a Meeting Controls surface and wires the channel
        // plane in StartBridgeSession (the production path — no manual rewiring in the test).
        const active = await engine().StartBridgeSession(
            baseParams(session, { ChannelHost: host, Provider: makeProviderEntity(LOOPBACK_MC_DRIVER_CLASS) }),
        );

        // The host was started for this session with the driver's event source + the session perception sink.
        expect(host.Started).toBe(true);
        expect(host.StartedSessionId).toBe('cp-session-1');
        expect(host.MeetingControls).not.toBeNull();
        expect(host.Sink).toBeTypeOf('function');

        // Contributed server tools were surfaced onto the ActiveBridgeSession (what the runner registers).
        const tools = active.ServerChannelTools.map((t) => t.Name);
        expect(tools).toContain('MeetingControls_RaiseHand');
        expect(tools).toContain('MeetingControls_MuteParticipant'); // present because loopback advertises 'Mute'

        // Drive a platform hand-raise on the resolved driver's source → perception reaches the model.
        const source = (active.Bridge as LoopbackBridge).MeetingControlsSource!;
        source.EmitRoster([{ ParticipantId: 'p1', DisplayName: 'Alice', Role: 'Participant', IsAgent: false }]);
        source.EmitHandRaise('p1', true);

        expect(host.Perceptions.some((p) => p.startsWith('hand raised: p1'))).toBe(true);
        // Perception reached the realtime session's SendContextNote sink (wired by the engine).
        expect(session.ContextNotes.some((n) => n.startsWith('hand raised: p1'))).toBe(true);

        // The executor bound onto the ActiveBridgeSession routes a mute tool back to the source actuation.
        const result = await active.ExecuteServerChannelTool!('MeetingControls_MuteParticipant', JSON.stringify({ participantId: 'p1' }));
        expect(result.Success).toBe(true);
        expect(source.Muted).toContain('p1');

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
        expect(host.Closed).toBe(true); // teardown closed the channel plane
    });

    it('a driver with NO Meeting Controls surface contributes no Meeting Controls tools', async () => {
        const session = new MockRealtimeSession();
        const host = new FakeChannelHost();
        const active = await engine().StartBridgeSession(baseParams(session, { ChannelHost: host }));

        // Loopback contributes nothing by default → host wired with a null event source.
        expect(host.Started).toBe(true);
        expect(host.MeetingControls).toBeNull();
        expect(active.ServerChannelTools).toEqual([]);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('IRealtimeSession-only callers (no ChannelHost) work unchanged — no channel wiring', async () => {
        const session = new MockRealtimeSession();
        const active = await engine().StartBridgeSession(baseParams(session));
        expect(active.ChannelHost).toBeUndefined();
        expect(active.ServerChannelTools).toEqual([]);
        expect(active.ExecuteServerChannelTool).toBeUndefined();
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('passes no perception sink when the provider cannot inject mid-session (no SendContextNote)', async () => {
        const session = new NoPerceptionSession();
        const host = new FakeChannelHost();
        const active = await engine().StartBridgeSession(baseParams(session, { ChannelHost: host }));
        expect(host.Started).toBe(true);
        expect(host.Sink).toBeUndefined(); // graceful degrade — channels still start, no perception sink
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('a throwing channel host never breaks the bridged session (media plane unaffected)', async () => {
        const session = new MockRealtimeSession();
        const throwingHost: IBridgeChannelHost = {
            StartSessionChannels: vi.fn(async () => {
                throw new Error('boom');
            }),
            GetSessionServerTools: vi.fn(() => []),
            ExecuteSessionServerTool: vi.fn(async () => ({ Success: false, Output: '' })),
            CloseSessionChannels: vi.fn(async () => {}),
        };
        const active = await engine().StartBridgeSession(baseParams(session, { ChannelHost: throwingHost }));
        // Session still connected; tools empty because wiring failed, but no throw propagated.
        expect((active.Bridge as LoopbackBridge).IsConnected).toBe(true);
        expect(active.ServerChannelTools).toEqual([]);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });
});
