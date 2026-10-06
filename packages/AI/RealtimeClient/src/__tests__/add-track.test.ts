import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    CHANNEL_INBOUND_VIDEO_TRACK,
    DEFAULT_REALTIME_AUDIO_TRACKS,
    type ClientRealtimeSessionConfig,
    type JSONObject,
    type RealtimeTrack,
    type RealtimeTrackDescriptor,
} from '@memberjunction/ai';
import { FakeMediaStream, FakeTrack, GeminiTestClient } from './helpers/realtime-fakes';

/** A video-model session config with the given declarations and requested tracks (audio only by default). */
function sessionConfig(extra: JSONObject = {}, requested: JSONObject[] = []): ClientRealtimeSessionConfig {
    return {
        Provider: 'gemini',
        Model: 'gemini-3.8-live',
        EphemeralToken: 'auth_tokens/test',
        ExpiresAt: new Date(Date.now() + 60000).toISOString(),
        SessionConfig: {
            model: 'gemini-3.8-live',
            supportsInboundVideo: true,
            maxInboundVideoRate: 1,
            maxInboundVideoStreams: 1,
            requestedTracks: [...DEFAULT_REALTIME_AUDIO_TRACKS.map((t) => ({ ...t })), ...requested] as JSONObject[],
            ...extra,
        },
    };
}

const CAMERA: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 5, SourceID: 'camera', Label: 'Camera' };

describe('adding and removing tracks on a running session', () => {
    let client: GeminiTestClient;
    let events: RealtimeTrack[];

    beforeEach(() => {
        vi.useFakeTimers();
        client = new GeminiTestClient();
        events = [];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const connect = async (config: ClientRealtimeSessionConfig): Promise<void> => {
        await client.Connect(config, new FakeMediaStream([new FakeTrack()]));
        client.OnTrackStateChange((track) => events.push(track));
    };
    const videoFramesSent = () => client.Fake.RealtimeInputs.filter((input) => input.video).length;

    it('has nothing to add to before the session negotiated its tracks', () => {
        expect(client.AddTrack(CAMERA)).toBeNull();
    });

    it('adds inbound video to an audio-only session, at the model rate, and frames start reaching the model', async () => {
        await connect(sessionConfig());
        expect(client.SendVideoFrame('frame')).toBe(false);

        const track = client.AddTrack(CAMERA);
        expect(track).toMatchObject({ State: 'live', Descriptor: { SourceID: 'camera', Rate: 1 } });
        expect(events).toEqual([track]);
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(true);
        expect(client.InboundVideoRate).toBe(1);
        expect(client.SendVideoFrame('frame')).toBe(true);
        expect(videoFramesSent()).toBe(1);
    });

    it('reports a track the model cannot take as unsupported, with the reason', async () => {
        await connect(sessionConfig({ supportsInboundVideo: false, maxInboundVideoStreams: 0 }));
        const track = client.AddTrack(CAMERA);
        expect(track?.State).toBe('unsupported');
        expect(track?.Reason).toMatch(/does not support inbound video/);
        expect(client.SendVideoFrame('frame')).toBe(false);
    });

    it("counts the live video streams against the model's limit", async () => {
        await connect(sessionConfig({}, [{ ...CHANNEL_INBOUND_VIDEO_TRACK, SourceID: 'whiteboard' } as JSONObject]));
        const track = client.AddTrack(CAMERA);
        expect(track?.State).toBe('unsupported');
        expect(track?.Reason).toMatch(/at most 1 inbound video stream/);
    });

    it('returns a live track added again as it is, with no new event', async () => {
        await connect(sessionConfig());
        const first = client.AddTrack(CAMERA);
        const again = client.AddTrack({ ...CAMERA, Rate: 3 });
        expect(again).toBe(first);
        expect(events).toHaveLength(1);
    });

    it('leaves the ids of the tracks already on the session alone, and never reuses one', async () => {
        await connect(sessionConfig());
        const before = client.AllTracks.map((t) => t.TrackID);
        const camera = client.AddTrack(CAMERA);
        client.RemoveTrack(CAMERA);
        const again = client.AddTrack(CAMERA);
        expect(client.AllTracks.slice(0, before.length).map((t) => t.TrackID)).toEqual(before);
        expect(new Set([...before, camera?.TrackID, again?.TrackID]).size).toBe(before.length + 2);
    });

    it('ends a removed track: it is reported ended, leaves the session and frames stop', async () => {
        await connect(sessionConfig());
        client.AddTrack(CAMERA);
        expect(client.RemoveTrack({ Modality: 'video', Direction: 'inbound', SourceID: 'camera' })).toBe(true);
        expect(events.map((t) => t.State)).toEqual(['live', 'ended']);
        expect(client.AllTracks.some((t) => t.Descriptor.SourceID === 'camera')).toBe(false);
        expect(client.SendVideoFrame('frame')).toBe(false);
    });

    it('removes nothing that is not on the session, and never the audio floor', async () => {
        await connect(sessionConfig());
        expect(client.RemoveTrack(CAMERA)).toBe(false);
        expect(client.RemoveTrack({ Modality: 'audio', Direction: 'inbound' })).toBe(false);
        expect(client.IsTrackEstablished('audio', 'inbound')).toBe(true);
        expect(events).toEqual([]);
    });
});
