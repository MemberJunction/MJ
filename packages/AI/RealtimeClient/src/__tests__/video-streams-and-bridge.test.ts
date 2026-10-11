import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    CHANNEL_INBOUND_VIDEO_TRACK,
    DEFAULT_REALTIME_AUDIO_TRACKS,
    type ClientRealtimeSessionConfig,
    type JSONObject,
} from '@memberjunction/ai';
import { FakeMediaStream, FakeTrack, GeminiTestClient } from './helpers/realtime-fakes';
import { ChannelInboundVideoBridge, type IChannelFrameProvider } from '../media/channelVideoSource';
import { VideoSourceArbiter, type IVideoFrameSink } from '../media/videoSourceArbiter';

/** A video-model session config with the given per-model stream/rate declarations and requested tracks. */
function videoConfig(extra: JSONObject = {}, requested: JSONObject[] = [{ ...CHANNEL_INBOUND_VIDEO_TRACK } as JSONObject]): ClientRealtimeSessionConfig {
    return {
        Provider: 'gemini',
        Model: 'gemini-3.8-live',
        EphemeralToken: 'auth_tokens/test',
        ExpiresAt: new Date(Date.now() + 60000).toISOString(),
        SessionConfig: {
            model: 'gemini-3.8-live',
            supportsInboundVideo: true,
            maxInboundVideoRate: 1,
            requestedTracks: [...DEFAULT_REALTIME_AUDIO_TRACKS.map((t) => ({ ...t })), ...requested] as JSONObject[],
            ...extra,
        },
    };
}

const FRAME_PROVIDER: IChannelFrameProvider = { GetLatestFrame: () => 'frame' };

describe('multi-source inbound video: stream negotiation', () => {
    let client: GeminiTestClient;

    beforeEach(() => {
        vi.useFakeTimers();
        client = new GeminiTestClient();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const connect = async (config: ClientRealtimeSessionConfig): Promise<void> => {
        await client.Connect(config, new FakeMediaStream([new FakeTrack()]));
    };

    it('a one-stream model reports one stream and the negotiated rate', async () => {
        await connect(videoConfig({ maxInboundVideoStreams: 1, maxInboundVideoRate: 1 }));
        expect(client.MaxInboundVideoStreams).toBe(1);
        expect(client.InboundVideoRate).toBe(1);
    });

    it('an older mint that names no stream count is read as one stream for a video model', async () => {
        await connect(videoConfig());
        expect(client.MaxInboundVideoStreams).toBe(1);
    });

    it('a model without video support reports zero streams and no rate', async () => {
        await connect(videoConfig({ supportsInboundVideo: false, maxInboundVideoStreams: 0 }));
        expect(client.MaxInboundVideoStreams).toBe(0);
        expect(client.InboundVideoRate).toBeUndefined();
    });

    it('two requested video sources on a ONE-stream model: the second is unsupported, with the reason', async () => {
        await connect(
            videoConfig({ maxInboundVideoStreams: 1 }, [
                { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1, SourceID: 'wb', Label: 'Whiteboard' },
                { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1, SourceID: 'cam', Label: 'Camera' },
            ])
        );
        const video = client.AllTracks.filter((t) => t.Descriptor.Modality === 'video');
        expect(video.map((t) => t.State)).toEqual(['live', 'unsupported']);
        expect(video[1].Reason).toMatch(/at most 1 inbound video stream/);
        expect(client.MaxInboundVideoStreams).toBe(1);
    });

    it('two requested video sources on a TWO-stream model: both become live tracks, carrying their source', async () => {
        await connect(
            videoConfig({ maxInboundVideoStreams: 2 }, [
                { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1, SourceID: 'wb', Label: 'Whiteboard' },
                { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1, SourceID: 'cam', Label: 'Camera' },
            ])
        );
        const video = client.EstablishedTracks.filter((t) => t.Descriptor.Modality === 'video');
        expect(video.map((t) => t.Descriptor.SourceID)).toEqual(['wb', 'cam']);
        expect(video.map((t) => t.Descriptor.Label)).toEqual(['Whiteboard', 'Camera']);
        expect(client.MaxInboundVideoStreams).toBe(2);
    });

    it('descriptors that name no source still collapse to the single stream they always did', async () => {
        await connect(
            videoConfig({ maxInboundVideoStreams: 2 }, [
                { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 },
                { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 },
            ])
        );
        expect(client.AllTracks.filter((t) => t.Descriptor.Modality === 'video')).toHaveLength(1);
    });

    it('the driver backstop follows the NEGOTIATED rate: 4 fps allows a frame after 200 ms, 1 fps does not', async () => {
        await connect(videoConfig({ maxInboundVideoRate: 4 }, [{ ...CHANNEL_INBOUND_VIDEO_TRACK, Rate: 4 } as JSONObject]));
        expect(client.InboundVideoRate).toBe(4);
        expect(client.SendVideoFrame('a')).toBe(true);
        vi.advanceTimersByTime(200);
        expect(client.SendVideoFrame('b')).toBe(true);

        const slow = new GeminiTestClient();
        await slow.Connect(videoConfig({ maxInboundVideoRate: 1 }), new FakeMediaStream([new FakeTrack()]));
        expect(slow.SendVideoFrame('a')).toBe(true);
        vi.advanceTimersByTime(200);
        expect(slow.SendVideoFrame('b')).toBe(false);
    });

    it('SendVideoFrame accepts a source id and a one-stream driver ignores it', async () => {
        await connect(videoConfig());
        expect(client.SendVideoFrame('a', 'image/jpeg', 'whiteboard')).toBe(true);
        expect(client.Fake.RealtimeInputs).toHaveLength(1);
    });
});

describe('ChannelInboundVideoBridge registers with the arbiter', () => {
    let client: GeminiTestClient;

    beforeEach(async () => {
        vi.useFakeTimers();
        client = new GeminiTestClient();
        await client.Connect(videoConfig(), new FakeMediaStream([new FakeTrack()]));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Start registers the source with the client arbiter and Stop removes it', () => {
        const bridge = new ChannelInboundVideoBridge(client, FRAME_PROVIDER, { SourceID: 'wb', Label: 'Whiteboard', ChannelKey: 'Whiteboard' });
        expect(bridge.Start()).toBe(true);
        const arbiter = VideoSourceArbiter.ForSink(client);
        expect(arbiter.GetSources()).toMatchObject([{ SourceID: 'wb', Label: 'Whiteboard', ChannelKey: 'Whiteboard', Kind: 'surface' }]);
        bridge.Stop();
        expect(arbiter.GetSources()).toEqual([]);
    });

    it('PushFrame alone (a purely event-driven channel) registers the source on first use', () => {
        const bridge = new ChannelInboundVideoBridge(client, FRAME_PROVIDER, { SourceID: 'wb', Label: 'Whiteboard' });
        expect(bridge.PushFrame('f1')).toBe(true);
        expect(VideoSourceArbiter.ForSink(client).HasSource('wb')).toBe(true);
        bridge.Stop();
    });

    it('two channels share ONE arbiter: a capture takes the model view and the client is told', () => {
        const wb = new ChannelInboundVideoBridge(client, FRAME_PROVIDER, { SourceID: 'wb', Label: 'Whiteboard' });
        const cam = new ChannelInboundVideoBridge(client, FRAME_PROVIDER, { SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
        wb.PushFrame('w1');
        vi.advanceTimersByTime(1000);
        expect(cam.PushFrame('c1')).toBe(true);
        // The surface is no longer what the model sees.
        vi.advanceTimersByTime(1000);
        expect(wb.PushFrame('w2')).toBe(false);
        // The switch was announced as a context note on the model connection.
        const notes = client.Fake.ClientContents.flatMap((c) => c.turns ?? []).flatMap((t) => t.parts ?? []).map((p) => p.text);
        expect(notes).toContain('[You can now see: Camera]');
        wb.Stop();
        cam.Stop();
    });

    it('a source switched off forwards nothing, even through PushFrame, and stays off across a restart', () => {
        const bridge = new ChannelInboundVideoBridge(client, FRAME_PROVIDER, { SourceID: 'wb', Label: 'Whiteboard' });
        bridge.PushFrame('f1');
        bridge.SetSourceEnabled(false, false);
        vi.advanceTimersByTime(1000);
        expect(bridge.PushFrame('f2')).toBe(false);
        bridge.Stop();
        // A fresh start (same bridge, same decision) must not silently re-enable the source.
        bridge.Start();
        expect(VideoSourceArbiter.ForSink(client).GetSources()[0]).toMatchObject({ SourceID: 'wb', Enabled: false });
        bridge.Stop();
    });

    it('the poll interval is the negotiated rate, not a 1 fps constant', async () => {
        const fast = new GeminiTestClient();
        await fast.Connect(
            videoConfig({ maxInboundVideoRate: 2 }, [{ ...CHANNEL_INBOUND_VIDEO_TRACK, Rate: 2 } as JSONObject]),
            new FakeMediaStream([new FakeTrack()])
        );
        const bridge = new ChannelInboundVideoBridge(fast, FRAME_PROVIDER, { SourceID: 'wb' });
        bridge.Start();
        await vi.advanceTimersByTimeAsync(1050);
        // two ticks in ~1 s at 2 fps (500 ms): the second is inside the 375 ms jitter spacing only if rate were 1 fps
        expect(fast.Fake.RealtimeInputs.length).toBe(2);
        bridge.Stop();
    });

    it('the deprecated Rate option can only LOWER the poll below the negotiated rate', async () => {
        const bridge = new ChannelInboundVideoBridge(client, FRAME_PROVIDER, { SourceID: 'wb', Rate: 0.5 });
        bridge.Start();
        await vi.advanceTimersByTimeAsync(1050);
        expect(client.Fake.RealtimeInputs.length).toBe(0); // 0.5 fps: first tick at 2 s
        await vi.advanceTimersByTimeAsync(1000);
        expect(client.Fake.RealtimeInputs.length).toBe(1);
        bridge.Stop();
    });

    it('moves the source to the new arbiter when the client changes (a reconnect leaves no ghost)', async () => {
        let current = client;
        const bridge = new ChannelInboundVideoBridge(() => current, FRAME_PROVIDER, { SourceID: 'wb' });
        bridge.PushFrame('f');
        const second = new GeminiTestClient();
        await second.Connect(videoConfig(), new FakeMediaStream([new FakeTrack()]));
        current = second;
        bridge.PushFrame('g');
        expect(VideoSourceArbiter.ForSink(client).HasSource('wb')).toBe(false);
        expect(VideoSourceArbiter.ForSink(second).HasSource('wb')).toBe(true);
        bridge.Stop();
    });

    it('does nothing without a video track (tool-only fallback, no error)', () => {
        const idle = new GeminiTestClient();
        const bridge = new ChannelInboundVideoBridge(idle, FRAME_PROVIDER, { SourceID: 'wb' });
        expect(bridge.Start()).toBe(false);
        expect(bridge.PushFrame('f')).toBe(false);
    });
});

describe('ChannelInboundVideoBridge.OnSourceActivated', () => {
    /** A one-stream model connection that takes every frame it is offered. */
    const oneStreamSink = (): IVideoFrameSink & { Frames: string[]; Notes: string[] } => {
        const frames: string[] = [];
        const notes: string[] = [];
        return {
            MaxInboundVideoStreams: 1,
            InboundVideoRate: 1,
            IsTrackEstablished: (modality: string, direction: string) => modality === 'video' && direction === 'inbound',
            SendVideoFrame: (base64Image: string) => {
                frames.push(base64Image);
                return true;
            },
            SendContextNote: (text: string) => {
                notes.push(text);
            },
            Frames: frames,
            Notes: notes,
        };
    };

    it('is called when the arbiter sends the source again after a capture held the only stream, not on registration', () => {
        const sink = oneStreamSink();
        const arbiter = VideoSourceArbiter.ForSink(sink);
        const bridge = new ChannelInboundVideoBridge(sink, FRAME_PROVIDER, { SourceID: 'Whiteboard#1', Label: 'Whiteboard' });
        let activations = 0;
        bridge.OnSourceActivated(() => activations++);
        expect(bridge.Register()).toBe(true);
        expect(activations).toBe(0);

        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });
        expect(bridge.PushFrame('w1')).toBe(false);
        expect(activations).toBe(0);

        arbiter.UnregisterSource('capture:camera');
        expect(sink.Notes).toContain('[You can now see: Whiteboard]');
        expect(activations).toBe(1);
        expect(bridge.PushFrame('w1')).toBe(true);
        expect(sink.Frames).toEqual(['w1']);
        bridge.Stop();
    });

    it('is called when the source is switched back on, and when the user picks it over a capture', () => {
        const sink = oneStreamSink();
        const arbiter = VideoSourceArbiter.ForSink(sink);
        const bridge = new ChannelInboundVideoBridge(sink, FRAME_PROVIDER, { SourceID: 'Whiteboard#1', Label: 'Whiteboard' });
        let activations = 0;
        bridge.Register();
        bridge.OnSourceActivated(() => activations++);
        bridge.SetSourceEnabled(false, false);
        bridge.SetSourceEnabled(true, false);
        expect(activations).toBe(1);

        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });
        arbiter.SelectSource('Whiteboard#1');
        expect(activations).toBe(2);
        bridge.Stop();
    });

    it('stops calling a removed handler, and follows nothing once stopped', () => {
        const sink = oneStreamSink();
        const arbiter = VideoSourceArbiter.ForSink(sink);
        const bridge = new ChannelInboundVideoBridge(sink, FRAME_PROVIDER, { SourceID: 'Whiteboard#1', Label: 'Whiteboard' });
        let removed = 0;
        let kept = 0;
        bridge.Register();
        const remove = bridge.OnSourceActivated(() => removed++);
        bridge.OnSourceActivated(() => kept++);
        remove();
        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });
        arbiter.UnregisterSource('capture:camera');
        expect([removed, kept]).toEqual([0, 1]);

        bridge.Stop();
        arbiter.RegisterSource({ SourceID: 'capture:screen', Label: 'Shared screen', Kind: 'screen' });
        arbiter.UnregisterSource('capture:screen');
        expect(kept).toBe(1);
    });

    it('a throwing handler does not stop the others', () => {
        const sink = oneStreamSink();
        const arbiter = VideoSourceArbiter.ForSink(sink);
        const bridge = new ChannelInboundVideoBridge(sink, FRAME_PROVIDER, { SourceID: 'Whiteboard#1', Label: 'Whiteboard' });
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let called = 0;
        bridge.Register();
        bridge.OnSourceActivated(() => {
            throw new Error('handler failed');
        });
        bridge.OnSourceActivated(() => called++);
        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });
        arbiter.UnregisterSource('capture:camera');
        expect(called).toBe(1);
        expect(errors).toHaveBeenCalled();
        errors.mockRestore();
        bridge.Stop();
    });
});
