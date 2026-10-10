/**
 * The engine's verbose first-frame log: once per bridge, it says what the first inbound frame that reached the model
 * shows. A camera or screen frame means the agent can see it; audio means the agent hears you. It used to say "HEARING"
 * for every track, so a meeting whose first frame was a camera read as the agent hearing the room.
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

/** A model session that declares whether it takes inbound video, and keeps what reached it. */
class MediaSession implements IRealtimeSession {
    public readonly Heard: RealtimeInputFrame[] = [];
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

async function seat(session: MediaSession): Promise<ActiveBridgeSession> {
    return engine().StartBridgeSession({
        AgentSessionID: 'session-first-frame',
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

/** The first-frame lines the engine logged, in order. */
function firstFrameLines(): string[] {
    return mocks.LogStatusEx.mock.calls
        .map(([options]) => (typeof options === 'string' ? options : options.message))
        .filter((message) => message.includes('FIRST inbound media frame'));
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
