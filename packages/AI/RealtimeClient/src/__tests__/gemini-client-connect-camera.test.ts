import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { VideoSourceArbiter } from '../media/videoSourceArbiter';
import { FakeMediaStream, FakeTrack, GeminiTestClient, makeGeminiConfig } from './helpers/realtime-fakes';
import { FAKE_FRAME_BASE64, InstallFakeDom, type FakeDom } from './helpers/fake-dom';

const AUDIO_TRACKS: JSONObject[] = [
    { Modality: 'audio', Direction: 'inbound' },
    { Modality: 'audio', Direction: 'outbound' },
];

/** A video-model session config whose inbound video track negotiates at `rate` frames per second. */
function videoConfig(rate: number): ClientRealtimeSessionConfig {
    return makeGeminiConfig({
        model: 'gemini-3.8-live',
        supportsInboundVideo: true,
        maxInboundVideoRate: rate,
        requestedTracks: [...AUDIO_TRACKS, { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: rate }],
    });
}

describe('GeminiRealtimeClient: the camera passed to Connect', () => {
    let client: GeminiTestClient;
    let dom: FakeDom;
    let cameraTrack: FakeTrack;

    async function connect(config: ClientRealtimeSessionConfig): Promise<void> {
        cameraTrack = new FakeTrack();
        await client.Connect(config, new FakeMediaStream([new FakeTrack()]), new FakeMediaStream([cameraTrack]));
        dom.Videos[0]?.SetFrameSize(640, 480);
    }

    function videoFramesSent(): number {
        return client.Fake.RealtimeInputs.filter((input) => input.video).length;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        dom = InstallFakeDom();
        client = new GeminiTestClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('is sampled at the negotiated rate, not 1 fps, and its frames reach the model as video', async () => {
        await connect(videoConfig(2));
        vi.advanceTimersByTime(1000);

        expect(client.InboundVideoRate).toBe(2);
        expect(videoFramesSent()).toBe(2);
        expect(client.Fake.RealtimeInputs.find((input) => input.video)?.video).toEqual({ data: FAKE_FRAME_BASE64, mimeType: 'image/jpeg' });
    });

    it('feeds the arbiter as a camera source, so the arbiter stays the only writer', async () => {
        await connect(videoConfig(1));
        vi.advanceTimersByTime(1000);

        const sources = VideoSourceArbiter.ForSink(client).GetSources();
        expect(sources).toHaveLength(1);
        expect(sources[0]).toMatchObject({ SourceID: 'connect-camera', Label: 'Camera', Kind: 'camera', Active: true, FramesSent: 1 });
    });

    it('with a whiteboard also live, wins as a capture, tells the model, and holds the whiteboard back', async () => {
        const arbiter = VideoSourceArbiter.ForSink(client);
        arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
        await connect(videoConfig(1));

        expect(arbiter.GetActiveSourceIDs()).toEqual(['connect-camera']);
        const notes = client.Fake.ClientContents.flatMap((content) => content.turns ?? []).flatMap((turn) => turn.parts ?? []).map((part) => part.text);
        expect(notes).toContain('[The agent is now viewing: Camera]');
        expect(arbiter.PushFrame('wb', FAKE_FRAME_BASE64)).toBe(false);
    });

    it('stops sampling and leaves the arbiter on Disconnect', async () => {
        await connect(videoConfig(1));
        vi.advanceTimersByTime(1000);
        await client.Disconnect();
        vi.advanceTimersByTime(3000);

        expect(videoFramesSent()).toBe(1);
        expect(VideoSourceArbiter.ForSink(client).HasSource('connect-camera')).toBe(false);
        expect(cameraTrack.Stopped).toBe(true);
    });

    it('is ignored by a model without video: no source and no sampling', async () => {
        await connect(makeGeminiConfig());
        vi.advanceTimersByTime(2000);

        expect(VideoSourceArbiter.ForSink(client).HasSource('connect-camera')).toBe(false);
        expect(dom.Videos).toHaveLength(0);
        expect(videoFramesSent()).toBe(0);
    });
});
