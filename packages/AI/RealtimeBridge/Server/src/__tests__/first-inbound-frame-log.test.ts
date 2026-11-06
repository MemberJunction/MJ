/**
 * The engine's verbose first-frame log: once per bridge, it says what the first inbound frame that reached the model
 * shows. A camera or screen frame means the agent can see it; audio means the agent hears you. It used to say "HEARING"
 * for every track, so a meeting whose first frame was a camera read as the agent hearing the room.
 *
 * The engine remembers which bridges have logged their first inbound frame and their first outbound audio. It forgets a
 * bridge when the bridge ends; it used to keep every bridge id for the life of the process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, LogStatusOptions, UserInfo } from '@memberjunction/core';

const mocks = vi.hoisted(() => ({
    RunView: vi.fn(),
    LogStatusEx: vi.fn<(options: LogStatusOptions | string) => void>(),
}));

// Participant tracking + the janitor use RunView.FromMetadataProvider; the log goes through LogStatusEx. Mock both and
// keep the rest of core intact.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatusEx: mocks.LogStatusEx,
        RunView: { FromMetadataProvider: () => ({ RunView: mocks.RunView }) },
    };
});

import type { IRealtimeSession, RealtimeInputFrame, RealtimeSessionCapabilities, RealtimeTrackDescriptor } from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine, type ActiveBridgeSession, type IHostInstanceIdentity } from '../ai-bridge-engine';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '../loopback-bridge';

const AUDIO_IN: RealtimeTrackDescriptor = { Modality: 'audio', Direction: 'inbound' };
const VIDEO_IN: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 };

/** A model session that declares whether it takes inbound video, keeps what reached it, and can speak. */
class MediaSession implements IRealtimeSession {
    public readonly Heard: RealtimeInputFrame[] = [];
    private outputHandler?: (chunk: ArrayBuffer) => void;
    constructor(private readonly takesVideo: boolean) {}
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false, SupportedInboundTracks: this.takesVideo ? [AUDIO_IN, VIDEO_IN] : [AUDIO_IN] };
    }
    public SendInput(frame: RealtimeInputFrame): void {
        this.Heard.push(frame);
    }
    public SendContextNote(): void {
        /* the notes naming a source are not under test here */
    }
    public async RegisterTools(): Promise<void> {
        /* not driven here */
    }
    public OnOutput(handler: (chunk: ArrayBuffer) => void): void {
        this.outputHandler = handler;
    }
    /** Sends one chunk of the agent's speech through the handler the engine registered. */
    public Speak(chunk: ArrayBuffer): void {
        this.outputHandler?.(chunk);
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
        /* not driven here */
    }
}

let rowSeq = 0;
const provider = {
    GetEntityObject: vi.fn(async () => ({
        ID: `bridge-first-frame-${++rowSeq}`,
        Status: 'Pending',
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
    })),
} as unknown as IMetadataProvider;
const user = { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
const providerEntity = {
    ID: 'provider-loopback',
    Name: 'Loopback',
    DriverClass: LOOPBACK_BRIDGE_DRIVER_CLASS,
    SupportedFeaturesObject: { AudioIn: true, AudioOut: true, VideoIn: true, ScreenIn: true, SpeakerDiarization: true },
} as unknown as MJAIBridgeProviderEntity;
const HOST: IHostInstanceIdentity = { GetHostInstanceID: () => 'testhost:1:boot', GetHostNamePrefix: () => 'testhost:' };

function engine(): AIBridgeEngine {
    const e = AIBridgeEngine.Instance;
    e.SetHostInstanceIdentity(HOST);
    return e;
}

async function seat(session: MediaSession, agentSessionId = 'session-first-frame'): Promise<ActiveBridgeSession> {
    return engine().StartBridgeSession({
        AgentSessionID: agentSessionId,
        Provider: providerEntity,
        RealtimeSession: session,
        Address: 'loopback://first-frame-room',
        ContextUser: user,
        MetadataProvider: provider,
    });
}

function loopback(active: ActiveBridgeSession): LoopbackBridge {
    return active.Bridge as LoopbackBridge;
}

function bytes(...values: number[]): ArrayBuffer {
    return new Uint8Array(values).buffer;
}

/** Every message the engine logged through `LogStatusEx`, in order. */
function loggedMessages(): string[] {
    return mocks.LogStatusEx.mock.calls.map(([options]) => (typeof options === 'string' ? options : options.message));
}

/** The first-frame lines the engine logged, in order. */
function firstFrameLines(): string[] {
    return loggedMessages().filter((message) => message.includes('FIRST inbound media frame'));
}

/** The first-outbound-audio lines the engine logged, in order. */
function firstOutboundLines(): string[] {
    return loggedMessages().filter((message) => message.includes('FIRST outbound audio'));
}

/**
 * The engine's two private sets of bridge ids that have logged their first inbound frame and their first outbound
 * audio. Read by name (TypeScript allows bracket access to a private member), since what they keep is under test.
 */
function diagnosticIds(): { Inbound: ReadonlySet<string>; Outbound: ReadonlySet<string> } {
    const e = engine();
    return { Inbound: e['diagInbound'], Outbound: e['diagOutbound'] };
}

beforeEach(() => {
    mocks.LogStatusEx.mockClear();
    mocks.RunView.mockReset();
    mocks.RunView.mockResolvedValue({ Success: true, Results: [] });
});

afterEach(async () => {
    for (const active of engine().ActiveSessions) {
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    }
});

describe('AIBridgeEngine — the first inbound frame log', () => {
    it('says the agent can see your camera when the first frame is a camera frame, not that it hears you', async () => {
        const active = await seat(new MediaSession(true));

        loopback(active).EmitInbound({ Track: 'video-in', Bytes: bytes(0xff, 0xd8), MimeType: 'image/jpeg' });

        expect(firstFrameLines()).toEqual([
            `[AIBridgeEngine][diag] FIRST inbound media frame reached the agent (bridge ${active.SessionBridgeID}, track=video-in). The agent can SEE your camera.`,
        ]);
    });

    it('says the agent can see your screen when the first frame is a shared screen', async () => {
        const active = await seat(new MediaSession(true));

        loopback(active).EmitInbound({ Track: 'screen-in', Bytes: bytes(0xff, 0xd8), MimeType: 'image/jpeg' });

        expect(firstFrameLines()).toEqual([
            `[AIBridgeEngine][diag] FIRST inbound media frame reached the agent (bridge ${active.SessionBridgeID}, track=screen-in). The agent can SEE your screen.`,
        ]);
    });

    it('says the agent is hearing you when the first frame is audio, in the same words as before, verbose only', async () => {
        const active = await seat(new MediaSession(true));

        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });

        expect(mocks.LogStatusEx).toHaveBeenCalledWith({
            message: `[AIBridgeEngine][diag] FIRST inbound media frame reached the agent (bridge ${active.SessionBridgeID}, track=audio-in). The agent is HEARING you.`,
            verboseOnly: true,
        });
        expect(firstFrameLines()).toHaveLength(1);
    });

    it('logs once per bridge: the frames after the first add no line', async () => {
        const active = await seat(new MediaSession(true));

        loopback(active).EmitInbound({ Track: 'video-in', Bytes: bytes(0xff, 0xd8), MimeType: 'image/jpeg' });
        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        loopback(active).EmitInbound({ Track: 'screen-in', Bytes: bytes(0xff, 0xd8), MimeType: 'image/jpeg' });

        expect(firstFrameLines()).toHaveLength(1);
        expect(firstFrameLines()[0]).toContain('The agent can SEE your camera.');
    });

    it('counts only a frame that reached the model: a camera frame dropped for a session without video logs nothing', async () => {
        const session = new MediaSession(false);
        const active = await seat(session);

        loopback(active).EmitInbound({ Track: 'video-in', Bytes: bytes(0xff, 0xd8), MimeType: 'image/jpeg' });
        expect(firstFrameLines()).toEqual([]);

        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        expect(session.Heard.map((frame) => frame.Kind)).toEqual(['audio']);
        expect(firstFrameLines()).toEqual([
            `[AIBridgeEngine][diag] FIRST inbound media frame reached the agent (bridge ${active.SessionBridgeID}, track=audio-in). The agent is HEARING you.`,
        ]);
    });
});

describe('AIBridgeEngine — the first-frame diagnostics when a bridge ends', () => {
    it('forgets the bridge: once it ends, its id is in neither the inbound nor the outbound set', async () => {
        const session = new MediaSession(true);
        const active = await seat(session);
        const id = active.SessionBridgeID;
        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        session.Speak(bytes(4, 5, 6));
        expect(diagnosticIds().Inbound.has(id)).toBe(true);
        expect(diagnosticIds().Outbound.has(id)).toBe(true);

        await engine().StopBridgeSession(id, 'Explicit');

        expect(diagnosticIds().Inbound.has(id)).toBe(false);
        expect(diagnosticIds().Outbound.has(id)).toBe(false);
    });

    it('adds no id back for a frame that arrives after the bridge ended, and logs no first frame for it', async () => {
        const onMedia = vi.spyOn(LoopbackBridge.prototype, 'OnMedia');
        const session = new MediaSession(true);
        const active = await seat(session);
        // The engine's inbound handler, kept past the driver's teardown, as a driver that delivers a late frame would.
        const deliverInbound = onMedia.mock.calls[0][0];
        onMedia.mockRestore();
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
        mocks.LogStatusEx.mockClear();

        deliverInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        session.Speak(bytes(4, 5, 6)); // this session keeps its output handler after Close

        expect(diagnosticIds().Inbound.has(active.SessionBridgeID)).toBe(false);
        expect(diagnosticIds().Outbound.has(active.SessionBridgeID)).toBe(false);
        expect(firstFrameLines()).toEqual([]);
        expect(firstOutboundLines()).toEqual([]);
    });

    it('a bridge that starts after another ended logs its first inbound frame and its first outbound audio, once each', async () => {
        const endedSession = new MediaSession(true);
        const ended = await seat(endedSession);
        loopback(ended).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        endedSession.Speak(bytes(4, 5, 6));
        await engine().StopBridgeSession(ended.SessionBridgeID, 'Explicit');
        mocks.LogStatusEx.mockClear();

        const session = new MediaSession(true);
        const active = await seat(session);
        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: bytes(4, 5, 6) });
        session.Speak(bytes(7, 8, 9));
        session.Speak(bytes(10, 11, 12));

        expect(firstFrameLines()).toEqual([
            `[AIBridgeEngine][diag] FIRST inbound media frame reached the agent (bridge ${active.SessionBridgeID}, track=audio-in). The agent is HEARING you.`,
        ]);
        expect(firstOutboundLines()).toEqual([
            `[AIBridgeEngine][diag] FIRST outbound audio from the agent (bridge ${active.SessionBridgeID}). The agent is SPEAKING into the room.`,
        ]);
    });

    it('leaves the other bridges alone: when one agent leaves a room, the one that stays logs no first frame again', async () => {
        const leaving = await seat(new MediaSession(true), 'session-first-frame-leaving');
        const stayingSession = new MediaSession(true);
        const staying = await seat(stayingSession, 'session-first-frame-staying');
        loopback(leaving).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        loopback(staying).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });
        stayingSession.Speak(bytes(4, 5, 6));

        await engine().StopBridgeSession(leaving.SessionBridgeID, 'Explicit');
        mocks.LogStatusEx.mockClear();
        loopback(staying).EmitInbound({ Track: 'audio-in', Bytes: bytes(7, 8, 9) });
        stayingSession.Speak(bytes(10, 11, 12));

        expect(firstFrameLines()).toEqual([]);
        expect(firstOutboundLines()).toEqual([]);
        expect(diagnosticIds().Inbound.has(staying.SessionBridgeID)).toBe(true);
        expect(diagnosticIds().Outbound.has(staying.SessionBridgeID)).toBe(true);
    });
});
