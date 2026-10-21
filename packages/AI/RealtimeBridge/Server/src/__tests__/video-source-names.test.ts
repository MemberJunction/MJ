/**
 * How the engine names a camera or screen in the notes it sends the model. A source whose driver gave no label gets
 * `@memberjunction/ai`'s name for an unnamed source, the one the LiveKit bridge gives a person with no display name. The
 * note that a source ended names it as the model was told with the source's first frame, even when the driver names it
 * differently by then: the person was renamed, or had no name yet when the first frame was read. Naming it by the end
 * event's label gave the model a name it had never been told.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const mocks = vi.hoisted(() => ({ RunView: vi.fn() }));

// Participant tracking and the janitor use RunView.FromMetadataProvider; mock it and keep the rest of core intact.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: { FromMetadataProvider: () => ({ RunView: mocks.RunView }) } };
});

// The name for an unnamed source is wrapped, with its own behaviour, so a test can show the engine takes it from
// @memberjunction/ai.
vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return { ...actual, UnnamedVideoSourceLabel: vi.fn(actual.UnnamedVideoSourceLabel) };
});

import {
    UnnamedVideoSourceLabel,
    type IRealtimeSession,
    type RealtimeInputFrame,
    type RealtimeSessionCapabilities,
    type RealtimeTrackDescriptor,
} from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine, type ActiveBridgeSession, type IHostInstanceIdentity } from '../ai-bridge-engine';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '../loopback-bridge';

const AUDIO_IN: RealtimeTrackDescriptor = { Modality: 'audio', Direction: 'inbound' };
const VIDEO_IN: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 };

/** A model session that takes inbound video and keeps, in order, the frames and notes that reached it. */
class VideoSession implements IRealtimeSession {
    /** `video frame` for each frame, and each note's text. */
    public readonly Log: string[] = [];
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false, SupportedInboundTracks: [AUDIO_IN, VIDEO_IN] };
    }
    public SendInput(frame: RealtimeInputFrame): void {
        this.Log.push(`${frame.Kind} frame`);
    }
    public SendContextNote(text: string): void {
        this.Log.push(text);
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
        ID: `bridge-source-names-${++rowSeq}`,
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

async function seat(session: VideoSession): Promise<LoopbackBridge> {
    const active: ActiveBridgeSession = await engine().StartBridgeSession({
        AgentSessionID: 'session-source-names',
        Provider: providerEntity,
        RealtimeSession: session,
        Address: 'loopback://source-names-room',
        ContextUser: user,
        MetadataProvider: provider,
    });
    return active.Bridge as LoopbackBridge;
}

/** A JPEG's first two bytes: enough for the engine to send it on. */
function jpeg(): ArrayBuffer {
    return new Uint8Array([0xff, 0xd8]).buffer;
}

beforeEach(() => {
    vi.mocked(UnnamedVideoSourceLabel).mockReset();
    mocks.RunView.mockReset();
    mocks.RunView.mockResolvedValue({ Success: true, Results: [] });
});

afterEach(async () => {
    for (const active of engine().ActiveSessions) {
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    }
});

describe("AIBridgeEngine — a video source's name in the notes to the model", () => {
    it("names a camera or screen its driver gave no label with @memberjunction/ai's name for an unnamed source", async () => {
        vi.mocked(UnnamedVideoSourceLabel).mockImplementation((kind) => `unnamed ${kind}`);
        const session = new VideoSession();
        const loopback = await seat(session);

        loopback.EmitInbound({ Track: 'screen-in', Bytes: jpeg(), MimeType: 'image/jpeg', SourceID: 'participant:ada:screen' });
        loopback.EmitInbound({ Track: 'video-in', Bytes: jpeg(), MimeType: 'image/jpeg', SourceID: 'participant:bob:camera' });
        loopback.EmitVideoSourceEnded({ Track: 'screen-in', SourceID: 'participant:ada:screen' });

        expect(session.Log).toEqual([
            '[You can now see: unnamed screen]',
            'video frame',
            '[You can now see: unnamed camera]',
            'video frame',
            '[You can no longer see: unnamed screen]',
        ]);
        expect(vi.mocked(UnnamedVideoSourceLabel).mock.calls).toEqual([['screen'], ['camera']]);
    });

    it('after the person is renamed, says the source ended by the name the model was told', async () => {
        const session = new VideoSession();
        const loopback = await seat(session);
        const camera = { Track: 'video-in', SourceID: 'participant:ada:camera' } as const;

        loopback.EmitInbound({ ...camera, Bytes: jpeg(), MimeType: 'image/jpeg', SourceLabel: "Ada's camera" });
        loopback.EmitInbound({ ...camera, Bytes: jpeg(), MimeType: 'image/jpeg', SourceLabel: "Ada Lovelace's camera" });
        loopback.EmitVideoSourceEnded({ ...camera, SourceLabel: "Ada Lovelace's camera" });
        // Seen again after it ended, it is new to the model, which learns the new name.
        loopback.EmitInbound({ ...camera, Bytes: jpeg(), MimeType: 'image/jpeg', SourceLabel: "Ada Lovelace's camera" });

        expect(session.Log).toEqual([
            "[You can now see: Ada's camera]",
            'video frame',
            'video frame',
            "[You can no longer see: Ada's camera]",
            "[You can now see: Ada Lovelace's camera]",
            'video frame',
        ]);
    });

    it('when the first frame had no name, says the source ended by the name the model was told, not the one it ends with', async () => {
        const session = new VideoSession();
        const loopback = await seat(session);
        const screen = { Track: 'screen-in', SourceID: 'participant:ada:screen' } as const;

        loopback.EmitInbound({ ...screen, Bytes: jpeg(), MimeType: 'image/jpeg' });
        loopback.EmitVideoSourceEnded({ ...screen, SourceLabel: "Ada's screen" });

        expect(session.Log).toEqual([
            "[You can now see: a participant's screen]",
            'video frame',
            "[You can no longer see: a participant's screen]",
        ]);
    });
});
