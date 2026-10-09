/**
 * The kit's building blocks: the recorders and their timeline, the microphone, the video fixtures in each frame kind (the
 * fMP4 ones as Core's reader reads them), the stream a session sends, and the host's track request the kit adds to a mint.
 */
import { describe, expect, it } from 'vitest';
import { Fmp4VideoSeconds, ReadFmp4Init, SniffFmp4Piece, type ClientRealtimeSessionConfig } from '@memberjunction/ai';
import {
    CONFORMANCE_FMP4_FRAME_SECONDS,
    ConformanceChunkFrames,
    ConformanceFmp4AudioFragment,
    ConformanceFmp4InitSegment,
    ConformanceFmp4VideoFragment,
    ConformanceImageFrame,
    ConformancePcm,
    CreateConformanceMicrophone,
    RealtimeVideoConformanceTimeline,
    RecordingPcmPlayback,
    RecordingVideoPlayout,
} from '../../testing';
import { Fmp4Frame } from '../../testing/conformanceFixtures';
import { ConformanceVideoStream, SecondsOfVideo } from '../../testing/conformanceVideoStream';
import { WithHostTrackRequest } from '../../testing/realtimeVideoConformanceSession';

describe('RecordingVideoPlayout', () => {
    it('records what the driver does, in order, with its number and options', () => {
        const timeline = new RealtimeVideoConformanceTimeline();
        const options = { MimeType: 'video/mp4', CarriesVoice: false };
        const player = new RecordingVideoPlayout(options, timeline, 2);
        const frame = Fmp4Frame(ConformanceFmp4VideoFragment());

        player.Append(frame);
        player.CarriesVoice = true;
        player.EndOfTurn();
        player.Flush();
        player.Dispose();

        expect(timeline.Entries).toEqual([
            { Kind: 'player-created', Player: 2, Options: options },
            { Kind: 'player-append', Player: 2, Frame: frame },
            { Kind: 'player-carries-voice', Player: 2, CarriesVoice: true },
            { Kind: 'player-end-of-turn', Player: 2 },
            { Kind: 'player-flush', Player: 2 },
            { Kind: 'player-dispose', Player: 2 },
        ]);
    });

    it('plays from the first piece until a flush, a dispose or the end of what it was given; an end of turn plays on', () => {
        const player = new RecordingVideoPlayout({});
        expect(player.IsPlaying).toBe(false);
        player.Append(Fmp4Frame(ConformanceFmp4InitSegment()));
        player.EndOfTurn();
        expect(player.IsPlaying).toBe(true);
        player.Flush();
        expect(player.IsPlaying).toBe(false);
        player.Append(ConformanceImageFrame(1));
        player.FinishPlaying();
        expect(player.IsPlaying).toBe(false);
        player.Append(ConformanceChunkFrames(1)[0]);
        player.Dispose();
        expect(player.IsPlaying).toBe(false);
    });

    it('carries the voice unless created muted, and keeps one source to hand over', () => {
        expect(new RecordingVideoPlayout({}).CarriesVoice).toBe(true);
        const muted = new RecordingVideoPlayout({ CarriesVoice: false });
        expect(muted.CarriesVoice).toBe(false);
        expect(muted.Source).toBe(muted.Source);
        expect(muted.Source.Kind).toBe('element');
        expect(muted.Timeline.Entries.map((e) => e.Kind)).toEqual(['player-created']);
        expect(typeof muted.OnProblem(() => undefined)).toBe('function');
    });
});

describe('RecordingPcmPlayback', () => {
    it('records enqueues, flushes and the close; plays from an enqueue until a flush, a close or the end of the queue', () => {
        const voice = new RecordingPcmPlayback();
        const pcm = ConformancePcm(3);
        voice.Enqueue(pcm);
        expect(voice.IsPlaying).toBe(true);
        voice.Flush();
        expect(voice.IsPlaying).toBe(false);
        voice.Enqueue(pcm);
        voice.FinishPlaying();
        expect(voice.IsPlaying).toBe(false);
        voice.Enqueue(pcm);
        voice.Close();
        expect(voice.IsPlaying).toBe(false);
        expect(voice.Timeline.Entries.map((e) => e.Kind)).toEqual(['voice-enqueue', 'voice-flush', 'voice-enqueue', 'voice-enqueue', 'voice-close']);
    });

    it('records the media time a chunk was queued at, and none for an untimed chunk', () => {
        const voice = new RecordingPcmPlayback();
        voice.Enqueue(ConformancePcm(1), 125);
        voice.Enqueue(ConformancePcm(2));
        voice.Enqueue(ConformancePcm(3), 0);
        expect(voice.Timeline.Of('voice-enqueue').map((e) => e.MediaTimeMs)).toEqual([125, undefined, 0]);
        expect('MediaTimeMs' in voice.Timeline.Of('voice-enqueue')[1]).toBe(false);
    });

    it("is a clock that reads the last timed chunk's media time while the voice plays", () => {
        const voice = new RecordingPcmPlayback();
        expect(voice.CurrentTimeMs).toBeNull();
        voice.Enqueue(ConformancePcm(1), 250);
        expect(voice.CurrentTimeMs).toBe(250);
        voice.Enqueue(ConformancePcm(2));
        expect(voice.CurrentTimeMs).toBeNull();
        voice.Enqueue(ConformancePcm(3), 0);
        expect(voice.CurrentTimeMs).toBe(0);
        voice.FinishPlaying();
        expect(voice.CurrentTimeMs).toBeNull();
        voice.Enqueue(ConformancePcm(4), 500);
        voice.Flush();
        expect(voice.CurrentTimeMs).toBeNull();
        voice.Enqueue(ConformancePcm(5), 750);
        voice.Close();
        expect(voice.CurrentTimeMs).toBeNull();
    });
});

describe('RealtimeVideoConformanceTimeline', () => {
    it('reads events by kind from a mark', () => {
        const timeline = new RealtimeVideoConformanceTimeline();
        timeline.Record({ Kind: 'interruption' });
        const mark = timeline.Mark();
        timeline.Record({ Kind: 'voice-flush' });
        timeline.Record({ Kind: 'interruption' });

        expect(mark).toBe(1);
        expect(timeline.Since(mark)).toEqual([{ Kind: 'voice-flush' }, { Kind: 'interruption' }]);
        expect(timeline.Of('interruption')).toHaveLength(2);
        expect(timeline.Of('interruption', mark)).toHaveLength(1);
    });
});

describe('CreateConformanceMicrophone', () => {
    it('is a stream with one live audio track, which stop ends', () => {
        const microphone = CreateConformanceMicrophone();
        const [track] = microphone.getAudioTracks();
        expect(microphone.getTracks()).toEqual([track]);
        expect(microphone.getVideoTracks()).toEqual([]);
        expect(track.kind).toBe('audio');
        expect(track.readyState).toBe('live');
        expect(microphone.getTrackById(track.id)).toBe(track);
        expect(track.clone()).not.toBe(track);
        track.stop();
        expect(track.readyState).toBe('ended');
    });
});

describe('the fMP4 and PCM fixtures, as Core reads them', () => {
    it('an init segment names H.264 video and, unless without the voice, AAC-LC audio', () => {
        expect(ReadFmp4Init(ConformanceFmp4InitSegment())?.Tracks.map((t) => [t.Handler, t.Codec])).toEqual([
            ['vide', 'avc1.42c01f'],
            ['soun', 'mp4a.40.2'],
        ]);
        expect(ReadFmp4Init(ConformanceFmp4InitSegment(false))?.Tracks.map((t) => t.Handler)).toEqual(['vide']);
        expect(SniffFmp4Piece(ConformanceFmp4InitSegment())).toBe('init');
    });

    it('a video fragment lasts its frames at 1/24 s each; an audio fragment adds no video', () => {
        const init = ReadFmp4Init(ConformanceFmp4InitSegment());
        expect(init).not.toBeNull();
        expect(CONFORMANCE_FMP4_FRAME_SECONDS).toBe(1 / 24);
        expect(Fmp4VideoSeconds(ConformanceFmp4VideoFragment(3), init!)).toBeCloseTo(3 / 24, 12);
        expect(Fmp4VideoSeconds(ConformanceFmp4AudioFragment(), init!)).toBe(0);
        expect(SniffFmp4Piece(ConformanceFmp4VideoFragment())).toBe('fragment');
    });

    it('makes each fragment and PCM chunk distinct by its number; a PCM chunk never reads as MP4', () => {
        expect(new Uint8Array(ConformanceFmp4VideoFragment(1, 1))).not.toEqual(new Uint8Array(ConformanceFmp4VideoFragment(1, 2)));
        expect(new Uint8Array(ConformancePcm(1))).toEqual(new Uint8Array([1, 0, 1, 0]));
        expect(new Uint8Array(ConformancePcm(2))).not.toEqual(new Uint8Array(ConformancePcm(1)));
        expect(SniffFmp4Piece(ConformancePcm(9))).toBeNull();
    });
});

describe('the chunk and image fixtures', () => {
    it('times chunks at 24 fps on one timeline, a key frame every 24, with distinct bytes and an H.264 type', () => {
        const chunks = ConformanceChunkFrames(3, { FirstIndex: 23 });
        expect(chunks.map((c) => [c.Kind, c.PresentationTimeMs, c.KeyFrame])).toEqual([
            ['chunk', 23 * (1000 / 24), false],
            ['chunk', 24 * (1000 / 24), true],
            ['chunk', 25 * (1000 / 24), false],
        ]);
        expect(chunks[0].MimeType).toBe('video/h264; codecs="avc1.42e01f"');
        expect(new Set(chunks.map((c) => new Uint8Array(c.Data).join(','))).size).toBe(3);
        expect(ConformanceChunkFrames(1)[0]).toMatchObject({ PresentationTimeMs: 0, KeyFrame: true });
        expect(ConformanceChunkFrames(1, { MimeType: 'video/vp8' })[0].MimeType).toBe('video/vp8');
    });

    it('makes images JPEGs, timed on the same timeline, each one a key frame', () => {
        const image = ConformanceImageFrame(2);
        expect(image).toMatchObject({ Kind: 'image', MimeType: 'image/jpeg', PresentationTimeMs: 2 * (1000 / 24), KeyFrame: true });
        const bytes = new Uint8Array(image.Data);
        expect([bytes[0], bytes[1], bytes.at(-2), bytes.at(-1)]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
        expect(new Uint8Array(ConformanceImageFrame(3).Data)).not.toEqual(bytes);
    });
});

describe('the video a session sends', () => {
    it('as fMP4: an init segment with the voice when the video carries it, then one-frame fragments', () => {
        const muxed = new ConformanceVideoStream('fmp4', true);
        const init = muxed.Start();
        expect(init).toMatchObject({ Kind: 'fmp4', Piece: 'init', MimeType: 'video/mp4' });
        expect(ReadFmp4Init(init.Data)?.Tracks.map((t) => t.Handler)).toEqual(['vide', 'soun']);
        expect(ReadFmp4Init(new ConformanceVideoStream('fmp4', false).Start().Data)?.Tracks.map((t) => t.Handler)).toEqual(['vide']);
        const fragments = muxed.Frames(2);
        expect(fragments.map((f) => (f.Kind === 'fmp4' ? f.Piece : f.Kind))).toEqual(['fragment', 'fragment']);
        expect(new Uint8Array(fragments[0].Data)).not.toEqual(new Uint8Array(fragments[1].Data));
        expect(SecondsOfVideo([init, ...fragments])).toBeCloseTo(2 / 24, 12);
    });

    it('as chunks: from a key frame, each call going on where the last stopped, and the voice timed at the next frame', () => {
        const stream = new ConformanceVideoStream('chunk', false);
        expect(stream.NextTimeMs).toBe(0);
        const first = stream.Start();
        expect(first).toMatchObject({ Kind: 'chunk', PresentationTimeMs: 0, KeyFrame: true });
        expect(stream.NextTimeMs).toBeCloseTo(1000 / 24, 9);
        const next = stream.Frames(2);
        expect(next.map((f) => f.PresentationTimeMs)).toEqual([1000 / 24, 2 * (1000 / 24)]);
        expect(SecondsOfVideo([first, ...next])).toBeCloseTo(3 / 24, 12);
    });

    it('as images', () => {
        const stream = new ConformanceVideoStream('image', false);
        expect([stream.Start(), ...stream.Frames(1)].map((f) => [f.Kind, f.PresentationTimeMs])).toEqual([
            ['image', 0],
            ['image', 1000 / 24],
        ]);
    });
});

describe('the host track request the kit adds to a mint', () => {
    const mint = (sessionConfig: ClientRealtimeSessionConfig['SessionConfig']): ClientRealtimeSessionConfig => ({
        Provider: 'synthetic',
        Model: 'm',
        EphemeralToken: 't',
        ExpiresAt: '2026-01-01T00:00:00.000Z',
        SessionConfig: sessionConfig,
    });

    it("asks for the audio floor and the agent's outbound video, as the runtime does for the Avatar channel", () => {
        expect(WithHostTrackRequest(mint({ model: 'm' }), true).SessionConfig).toEqual({
            model: 'm',
            requestedTracks: [
                { Modality: 'audio', Direction: 'inbound' },
                { Modality: 'audio', Direction: 'outbound' },
                { Modality: 'video', Direction: 'outbound' },
            ],
        });
    });

    it('keeps what the mint requested, one track each', () => {
        const minted = mint({ requestedTracks: [{ Modality: 'video', Direction: 'inbound', Rate: 1 }, { Modality: 'Audio', Direction: 'inbound', Encoding: 'pcm' }] });
        expect(WithHostTrackRequest(minted, true).SessionConfig['requestedTracks']).toEqual([
            { Modality: 'Audio', Direction: 'inbound', Encoding: 'pcm' },
            { Modality: 'audio', Direction: 'outbound' },
            { Modality: 'video', Direction: 'inbound', Rate: 1 },
            { Modality: 'video', Direction: 'outbound' },
        ]);
    });

    it('leaves the mint as it is when the host shows no agent video', () => {
        const config = mint({ model: 'm' });
        expect(WithHostTrackRequest(config, false)).toBe(config);
    });
});
