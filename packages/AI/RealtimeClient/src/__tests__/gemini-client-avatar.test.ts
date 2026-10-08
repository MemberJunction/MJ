import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerContent, LiveServerMessage, Part } from '@google/genai';
import type { MediaVideoSource } from '../media/model';
import { GEMINI_AVATAR_MP4_TYPE } from '../media/videoPlayout';
import { AttachVideoSource } from '../media/attachVideoSource';
import type { GeminiClientConnectArgs, GeminiLiveClientSession } from '../drivers/geminiRealtimeClient';
import { InstallFakeDom, type FakeDom, type FakeVideoElement } from './helpers/fake-dom';
import { FakeInitSegment, FakeMediaSource, FakeTimeRanges, InstallFakeMse, type FakeSourceBuffer } from './helpers/fake-mse';
import { AvatarFragment, AvatarInitSegment, PieceToBase64, VIDEO_ONLY_MP4_TYPE } from './helpers/fmp4-pieces';
import {
    FakeGeminiSession,
    FakeMediaStream,
    FakeTrack,
    GeminiTestClient,
    makeGeminiAvatarConfig,
    makeGeminiConfig,
    STAND_IN_AVATAR_NAME,
    type GeminiAvatarConfigOptions,
} from './helpers/realtime-fakes';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** A 4-byte PCM16 part; its bytes can never be read as an MP4 box. */
function pcmPart(seed = 1): Part {
    return { inlineData: { data: btoa(String.fromCharCode(seed, 0, seed, 0)), mimeType: 'audio/pcm;rate=24000' } };
}

function videoPart(piece: ArrayBuffer, mimeType = 'video/mp4'): Part {
    return { inlineData: { data: PieceToBase64(piece), mimeType } };
}

function emit(client: GeminiTestClient, content: LiveServerContent): void {
    client.Emit({ serverContent: content } as LiveServerMessage);
}

function emitParts(client: GeminiTestClient, ...parts: Part[]): void {
    emit(client, { modelTurn: { role: 'model', parts } });
}

/** Lets the fake source buffer finish its pending operations. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

interface AvatarHarness {
    Client: GeminiTestClient;
    /** Videos handed to the host, in order. */
    Videos: MediaVideoSource[];
    /** State changes and video hand-overs (`'video'`), in the order they happened. */
    Events: string[];
}

async function connectAvatar(options: GeminiAvatarConfigOptions = {}, client = new GeminiTestClient()): Promise<AvatarHarness> {
    const videos: MediaVideoSource[] = [];
    const events: string[] = [];
    client.OnStateChange((state) => events.push(state));
    client.OnRemoteVideo((video) => {
        videos.push(video);
        events.push('video');
    });
    await client.Connect(makeGeminiAvatarConfig(options), new FakeMediaStream([new FakeTrack()]));
    return { Client: client, Videos: videos, Events: events };
}

function warnings(warn: ReturnType<typeof vi.spyOn>, text: string): number {
    return warn.mock.calls.filter((call) => String(call[0]).includes(text)).length;
}

/** A client whose seam opens a new fake socket per connection, so a test can resume the session. */
class ResumingClient extends GeminiTestClient {
    public readonly Connections: GeminiClientConnectArgs[] = [];

    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        this.Connections.push(args);
        this.LastConnectArgs = args;
        return new FakeGeminiSession();
    }

    /** Has Google announce the connection is ending after issuing a handle; the client resumes on a new one. */
    public async Resume(): Promise<void> {
        const current = this.Connections.length - 1;
        this.Connections[current].OnMessage({ sessionResumptionUpdate: { newHandle: `h${current}`, resumable: true } } as LiveServerMessage);
        this.Connections[current].OnMessage({ goAway: { timeLeft: '60s' } } as LiveServerMessage);
        await vi.advanceTimersByTimeAsync(0);
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GeminiRealtimeClient avatar playout', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let info: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        InstallFakeMse();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('connect', () => {
        it('without an avatar block: no outbound video track, no player, no video for the host', async () => {
            const client = new GeminiTestClient();
            const videos: MediaVideoSource[] = [];
            client.OnRemoteVideo((video) => videos.push(video));
            const config = makeGeminiConfig({
                model: 'gemini-3.8-live',
                config: { responseModalities: ['AUDIO'] },
                requestedTracks: [{ Modality: 'video', Direction: 'outbound' }],
            });
            await client.Connect(config, new FakeMediaStream([new FakeTrack()]));

            expect(client.IsTrackEstablished('video', 'outbound')).toBe(false);
            expect(client.AllTracks.find((t) => t.Descriptor.Direction === 'outbound' && t.Descriptor.Modality === 'video')?.State).toBe('unsupported');
            expect(client.Playouts).toHaveLength(0);
            expect(videos).toEqual([]);
            expect(client.LastConnectArgs?.Config).toEqual({ responseModalities: ['AUDIO'] });
        });

        it('granted and shown: the outbound video track is live and the host gets the video once, when connected', async () => {
            const { Client: client, Videos: videos, Events: events } = await connectAvatar();

            expect(client.IsTrackEstablished('video', 'outbound')).toBe(true);
            expect(client.Playouts).toHaveLength(1);
            expect(videos).toEqual([client.Playout.Source]);
            expect(events).toEqual(['connecting', 'connected', 'video', 'listening']);
        });

        it('connects with the avatar the server wrote: video out and the avatar config', async () => {
            const { Client: client } = await connectAvatar();
            expect(client.LastConnectArgs?.Config).toMatchObject({ responseModalities: ['VIDEO'], avatarConfig: { avatarName: STAND_IN_AVATAR_NAME } });
        });

        it("creates the player with the grant's type and voice, or the Gemini type when the grant names none", async () => {
            const custom = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';
            const first = await connectAvatar({ Encoding: custom, AudioMuxed: false });
            expect(first.Client.PlayoutOptions[0]).toMatchObject({ MimeType: custom, CarriesVoice: false });

            const second = await connectAvatar({ Encoding: null });
            expect(second.Client.PlayoutOptions[0]).toMatchObject({ MimeType: GEMINI_AVATAR_MP4_TYPE, CarriesVoice: true });
        });

        it('reads a bare avatar block as the Gemini type carrying the voice, and a block without output as no grant', async () => {
            const requestedTracks = [{ Modality: 'video', Direction: 'outbound' }];
            const bare = new GeminiTestClient();
            await bare.Connect(
                makeGeminiConfig({ model: 'gemini-3.8-live', config: {}, avatar: { output: true }, requestedTracks }),
                new FakeMediaStream([new FakeTrack()])
            );
            expect(bare.PlayoutOptions[0]).toMatchObject({ MimeType: GEMINI_AVATAR_MP4_TYPE, CarriesVoice: true });

            const off = new GeminiTestClient();
            await off.Connect(
                makeGeminiConfig({ model: 'gemini-3.8-live', config: {}, avatar: { output: false, audioMuxed: true }, requestedTracks }),
                new FakeMediaStream([new FakeTrack()])
            );
            expect(off.Playouts).toHaveLength(0);
        });

        it("routes each element the player takes over into the PCM playback's graph", async () => {
            InstallFakeDom();
            const { Client: client } = await connectAvatar();
            const first = document.createElement('video');
            const second = document.createElement('video');
            client.PlayoutOptions[0].OnElementAttached?.(first);
            client.PlayoutOptions[0].OnElementAttached?.(second);
            expect(client.Playback.ConnectedElements).toEqual([first, second]);
        });

        it('a host that shows no agent video gets an audio-only session, said once', async () => {
            const { Client: client, Videos: videos } = await connectAvatar({ RequestAgentVideo: false });

            expect(client.Playouts).toHaveLength(0);
            expect(videos).toEqual([]);
            expect(client.LastConnectArgs?.Config).toEqual({ systemInstruction: 'be the voice', responseModalities: ['AUDIO'] });
            expect(warnings(warn, `Avatar "${STAND_IN_AVATAR_NAME}" not used: the host shows no agent video`)).toBe(1);
            expect(warnings(warn, 'Reason: downgraded')).toBe(1);
        });

        it("a browser that can't play the avatar's type gets an audio-only session, said once", async () => {
            FakeMediaSource.Supported = false;
            const { Client: client, Videos: videos } = await connectAvatar();

            expect(client.AllTracks.find((t) => t.Descriptor.Direction === 'outbound' && t.Descriptor.Modality === 'video')?.State).toBe('unsupported');
            expect(client.Playouts).toHaveLength(0);
            expect(videos).toEqual([]);
            expect(client.LastConnectArgs?.Config?.responseModalities).toEqual(['AUDIO']);
            expect(client.LastConnectArgs?.Config?.avatarConfig).toBeUndefined();
            expect(warnings(warn, `cannot play ${GEMINI_AVATAR_MP4_TYPE}`)).toBe(1);
        });

        it('an audio-only session plays model output as before: video dropped, untyped parts as PCM', async () => {
            const { Client: client } = await connectAvatar({ RequestAgentVideo: false });
            emitParts(client, videoPart(AvatarInitSegment()), { inlineData: { data: PieceToBase64(AvatarFragment()) } });
            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(warnings(warn, 'only PCM audio is played')).toBe(1);
        });

        it('Disconnect disposes the player, and a new Connect disposes the one before', async () => {
            const { Client: client } = await connectAvatar();
            const first = client.Playout;
            await client.Connect(makeGeminiAvatarConfig(), new FakeMediaStream([new FakeTrack()]));
            expect(first.Disposed).toBe(true);

            const second = client.Playout;
            await client.Disconnect();
            expect(second.Disposed).toBe(true);
        });
    });

    describe('who carries the voice: the first init segment decides', () => {
        it('a muxed grant and an init with an audio track: the video carries the voice, nothing logged', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment(true)));
            expect(client.Playout.CarriesVoice).toBe(true);
            expect(warnings(warn, 'audio track')).toBe(0);
        });

        it('a muxed grant and a video-only init: separate voice for the session, the player muted, said once', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment(false)), pcmPart(1));
            expect(client.Playout.CarriesVoice).toBe(false);
            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(warnings(warn, 'has no audio track, but the session config said audioMuxed: true')).toBe(1);
        });

        it('a separate grant and an init with an audio track: the video carries the voice, said once', async () => {
            const { Client: client } = await connectAvatar({ AudioMuxed: false });
            expect(client.Playout.CarriesVoice).toBe(false);
            emitParts(client, videoPart(AvatarInitSegment(true)), pcmPart(1));
            expect(client.Playout.CarriesVoice).toBe(true);
            expect(client.Playback.Enqueued).toHaveLength(0);
            expect(warnings(warn, 'has an audio track, but the session config said audioMuxed: false')).toBe(1);
        });

        it('only the first readable init decides; later ones change nothing', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment(false)));
            emit(client, { turnComplete: true });
            emitParts(client, videoPart(AvatarInitSegment(true)), pcmPart(2));
            expect(client.Playout.CarriesVoice).toBe(false);
            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(warnings(warn, 'audio track')).toBe(1);
        });

        it('an init it cannot read leaves the decision to the next one', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(FakeInitSegment()));
            expect(client.Playout.CarriesVoice).toBe(true);
            emitParts(client, videoPart(AvatarInitSegment(false)));
            expect(client.Playout.CarriesVoice).toBe(false);
        });
    });

    describe('PCM when the video carries the voice', () => {
        it("plays PCM until the turn's first video part, which flushes it; later PCM in the turn is dropped, said once", async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, pcmPart(1));
            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(client.Playback.FlushCount).toBe(0);

            emitParts(client, videoPart(AvatarInitSegment()));
            expect(client.Playback.FlushCount).toBe(1);

            emitParts(client, pcmPart(2), pcmPart(3));
            emit(client, { turnComplete: true });
            emitParts(client, videoPart(AvatarFragment()), pcmPart(4));
            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(warnings(warn, 'Dropped PCM audio in a turn whose avatar video carries the voice')).toBe(1);
        });

        it('plays every PCM part of a turn without video, also after a turn with video', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment()), videoPart(AvatarFragment()));
            emit(client, { turnComplete: true });
            emitParts(client, pcmPart(1), pcmPart(2));
            expect(client.Playback.Enqueued).toHaveLength(2);
            expect(client.Playback.FlushCount).toBe(0);
        });

        it("flushes nothing at a turn's first video part when the turn queued no PCM", async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, pcmPart(1));
            emit(client, { turnComplete: true });
            emitParts(client, videoPart(AvatarInitSegment()));
            expect(client.Playback.FlushCount).toBe(0);
        });

        it('logs no start offset', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, pcmPart(1), videoPart(AvatarInitSegment()));
            expect(info).not.toHaveBeenCalled();
        });
    });

    describe('PCM when the voice is separate', () => {
        it('plays PCM beside the video, never flushed or dropped, and logs one start offset per turn', async () => {
            vi.useFakeTimers();
            const { Client: client } = await connectAvatar({ AudioMuxed: false });
            vi.setSystemTime(10_000);
            emitParts(client, pcmPart(1));
            vi.setSystemTime(10_120);
            emitParts(client, videoPart(AvatarInitSegment(false)), pcmPart(2), videoPart(AvatarFragment()));
            emit(client, { turnComplete: true });
            vi.setSystemTime(20_000);
            emitParts(client, videoPart(AvatarFragment(2)));
            vi.setSystemTime(20_050);
            emitParts(client, pcmPart(3));

            expect(client.Playback.Enqueued).toHaveLength(3);
            expect(client.Playback.FlushCount).toBe(0);
            expect(info.mock.calls.map((call) => String(call[0]))).toEqual([
                expect.stringContaining('the video started 120 ms after the voice'),
                expect.stringContaining('the video started 50 ms before the voice'),
            ]);
        });
    });

    describe('turns', () => {
        it("generationComplete ends the turn's video; turnComplete does not end it again", async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment()), videoPart(AvatarFragment()));
            emit(client, { generationComplete: true });
            expect(client.Playout.EndOfTurnCount).toBe(1);
            emit(client, { turnComplete: true });
            expect(client.Playout.EndOfTurnCount).toBe(1);
        });

        it("turnComplete ends the turn's video when generationComplete never came", async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment()));
            emit(client, { turnComplete: true });
            expect(client.Playout.EndOfTurnCount).toBe(1);
        });

        it('a turn without video ends nothing', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, pcmPart(1));
            emit(client, { generationComplete: true, turnComplete: true });
            expect(client.Playout.EndOfTurnCount).toBe(0);
        });

        it("a part after generationComplete reopens the turn's video, and turnComplete ends it again", async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment()));
            emit(client, { generationComplete: true });
            emitParts(client, videoPart(AvatarFragment()));
            emit(client, { turnComplete: true });
            expect(client.Playout.EndOfTurnCount).toBe(2);
        });

        it("interrupted stops the video and the voice, then drops the turn's late parts until its turnComplete", async () => {
            const { Client: client } = await connectAvatar();
            const states: string[] = [];
            client.OnStateChange((state) => states.push(state));
            emitParts(client, videoPart(AvatarInitSegment()), videoPart(AvatarFragment(1)));

            emit(client, { interrupted: true });
            expect(client.Playout.FlushCount).toBe(1);
            expect(client.Playback.FlushCount).toBe(1);

            emitParts(client, videoPart(AvatarFragment(2)), pcmPart(1), { inlineData: { data: PieceToBase64(AvatarFragment(3)) } });
            expect(client.Playout.Appended).toHaveLength(2);
            expect(client.Playback.Enqueued).toHaveLength(0);
            expect(states.at(-1)).toBe('listening');

            emit(client, { turnComplete: true });
            expect(client.Playout.EndOfTurnCount).toBe(0);
            emitParts(client, videoPart(AvatarFragment(4)));
            expect(client.Playout.Appended).toHaveLength(3);
            expect(states.at(-1)).toBe('speaking');
        });

        it('the drop window ends with a turnComplete in the same message', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment()));
            emit(client, { interrupted: true, turnComplete: true });
            emitParts(client, videoPart(AvatarFragment()));
            expect(client.Playout.Appended).toHaveLength(2);
        });

        it('CancelActiveResponse stops the video as well as the voice', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment()));
            client.CancelActiveResponse();
            expect(client.Playout.FlushCount).toBe(1);
            expect(client.Playback.FlushCount).toBe(1);
        });

        it('IsAudioPlaying follows the video, and CancelActiveResponse acts on a video that is still playing', async () => {
            const { Client: client } = await connectAvatar();
            emitParts(client, videoPart(AvatarInitSegment()));
            emit(client, { turnComplete: true });
            expect(client.IsAudioPlaying).toBe(false);

            client.Playout.IsPlaying = true;
            expect(client.IsAudioPlaying).toBe(true);
            client.CancelActiveResponse();
            expect(client.Playout.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
        });
    });

    describe('resume', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it('a turn the drop cut off plays out what arrived: ended, not flushed', async () => {
            const client = new ResumingClient();
            await connectAvatar({}, client);
            emitParts(client, videoPart(AvatarInitSegment()), videoPart(AvatarFragment(1)));
            await client.Resume();

            expect(client.Connections).toHaveLength(2);
            expect(client.Playout.EndOfTurnCount).toBe(1);
            expect(client.Playout.FlushCount).toBe(0);
            expect(client.LastConnectArgs?.Config).toMatchObject({ responseModalities: ['VIDEO'], avatarConfig: { avatarName: STAND_IN_AVATAR_NAME } });
        });

        it('a resume ends a drop window the cut turn left open', async () => {
            const client = new ResumingClient();
            await connectAvatar({}, client);
            emitParts(client, videoPart(AvatarInitSegment()));
            emit(client, { interrupted: true });
            await client.Resume();

            emitParts(client, videoPart(AvatarFragment()));
            expect(client.Playout.Appended).toHaveLength(2);
        });
    });

    describe('with the real VideoPlayout over the fake MSE and DOM', () => {
        let dom: FakeDom;

        beforeEach(() => {
            dom = InstallFakeDom();
        });

        /** Connects with the real player, attaches its video to a host element muted the way a media tile mutes it, and opens the media source. */
        async function connectAndShow(options: GeminiAvatarConfigOptions = {}): Promise<{ Client: GeminiTestClient; Element: FakeVideoElement; Buffer: FakeSourceBuffer }> {
            const client = new GeminiTestClient();
            client.UseRealPlayout = true;
            const { Videos: videos } = await connectAvatar(options, client);
            const element = document.createElement('video');
            element.muted = true;
            AttachVideoSource(videos[0], element);
            FakeMediaSource.Instances[0].Open();
            const buffer = FakeMediaSource.Instances[0].Buffers[0];
            return { Client: client, Element: dom.Videos[0], Buffer: buffer };
        }

        it('muxed: the element plays unmuted, routed into the PCM playback once, and the pieces append in order', async () => {
            const { Client: client, Element: element, Buffer: buffer } = await connectAndShow();
            const pieces = [AvatarInitSegment(), AvatarFragment(1), AvatarFragment(2)];
            emitParts(client, ...pieces.map((piece) => videoPart(piece)));
            await settle();

            expect(element.muted).toBe(false);
            expect(element.Paused).toBe(false);
            expect(client.Playback.ConnectedElements).toEqual([element]);
            expect(buffer.Type).toBe(GEMINI_AVATAR_MP4_TYPE);
            expect(buffer.TypeChanges).toEqual([]);
            expect(buffer.Appended.map((piece) => new Uint8Array(piece))).toEqual(pieces.map((piece) => new Uint8Array(piece)));
        });

        it("video only: the source buffer takes the init's codecs, the element is muted, and PCM plays", async () => {
            const { Client: client, Element: element, Buffer: buffer } = await connectAndShow();
            emitParts(client, videoPart(AvatarInitSegment(false)), pcmPart(1), videoPart(AvatarFragment()));
            await settle();

            expect(buffer.TypeChanges).toEqual([{ Type: VIDEO_ONLY_MP4_TYPE, AfterAppends: 0 }]);
            expect(element.muted).toBe(true);
            expect(client.Playback.Enqueued).toHaveLength(1);
        });

        it("generationComplete ends the stream once the turn's pieces are in", async () => {
            const { Client: client } = await connectAndShow();
            emitParts(client, videoPart(AvatarInitSegment()), videoPart(AvatarFragment()));
            emit(client, { generationComplete: true });
            await settle();
            expect(FakeMediaSource.Instances[0].EndOfStreamCalls).toBe(1);
        });

        it('interrupted pauses the element and drops what has not played; IsAudioPlaying follows the element', async () => {
            const { Client: client, Element: element, Buffer: buffer } = await connectAndShow();
            emitParts(client, videoPart(AvatarInitSegment()));
            await settle();
            buffer.buffered = new FakeTimeRanges([[0, 8]]);
            element.currentTime = 3;
            expect(client.IsAudioPlaying).toBe(true);

            emit(client, { interrupted: true });
            expect(element.Paused).toBe(true);
            expect(buffer.Removed).toEqual([[3, Infinity]]);
            expect(client.IsAudioPlaying).toBe(false);
        });
    });
});
