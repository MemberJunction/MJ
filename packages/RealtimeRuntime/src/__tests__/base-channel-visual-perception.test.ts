import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CHANNEL_INBOUND_VIDEO_TRACK, type RealtimeTrackDescriptor } from '@memberjunction/ai';
import { VideoSourceArbiter, type ChannelInboundVideoBridge } from '@memberjunction/ai-realtime-client';
import type { RealtimeChannelContext } from '../channels/base-realtime-channel-client';
import { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
import type { RealtimeChannelEvent } from '../channels/channel-contract-types';
import { makeChannelContext } from './channel-test-helpers';
import { VideoClient } from './capture-test-helpers';

/** A channel that opts into visual perception through the base class, with a frame it controls. */
class PictureChannel extends BaseRealtimeChannelClient {
    public Frame: string | null = 'frame-1';
    public Pushed: string[] = [];
    public get ChannelName(): string {
        return 'Picture';
    }
    public Enable(options: Parameters<PictureChannel['EnableVisualPerception']>[1] = {}): void {
        this.EnableVisualPerception({ GetLatestFrame: async () => this.Frame }, options);
    }
    public Edit(): Promise<void> {
        this.RecordChange({ Author: 'user', Perceive: false });
        return this.NotifyVisualChange();
    }
    public AgentEdited(): Promise<void> {
        this.RecordChange({ Author: 'agent', Perceive: false });
        return this.ConfirmVisualChange();
    }
    public InstallBridge(started: { count: number }): void {
        this.VisualVideoBridge = {
            IsActive: false,
            Start: () => {
                started.count++;
            },
            Stop: () => undefined,
            Register: () => true,
            SetSourceEnabled: () => undefined,
            PushFrame: (frame: string) => {
                this.Pushed.push(frame);
                return true;
            },
        } as unknown as ChannelInboundVideoBridge;
    }
}

function videoContext(established = true, rate?: number): RealtimeChannelContext {
    return makeChannelContext({
        Client: {
            IsTrackEstablished: (modality: string, direction: string) => established && modality === 'video' && direction === 'inbound',
            EstablishedTracks: rate ? [{ Descriptor: { Modality: 'video', Direction: 'inbound', Rate: rate } }] : [],
        } as unknown as RealtimeChannelContext['Client'],
    });
}

describe('BaseRealtimeChannelClient — visual perception', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('sources the inbound video track only once visual perception is enabled', () => {
        const channel = new PictureChannel();
        expect(channel.GetSourcedTracks()).toEqual([]);
        channel.Initialize(videoContext());
        channel.Enable();
        expect(channel.GetSourcedTracks().map((t) => `${t.Direction}:${t.Modality}`)).toEqual(['inbound:video']);
    });

    it('pushes a user-change frame and tags the frame_pushed event with the change id', async () => {
        vi.setSystemTime(50_000);
        const channel = new PictureChannel();
        channel.Initialize(videoContext());
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));

        await channel.Edit();

        expect(channel.Pushed).toEqual(['frame-1']);
        const pushed = events.find((e) => e.Name === 'frame_pushed');
        expect(pushed?.ChangeId).toBe(1);
        expect(pushed?.Payload).toMatchObject({ reason: 'change' });
    });

    it('sends the structured do-not-narrate confirmation after a successful agent edit', async () => {
        const channel = new PictureChannel();
        const ctx = videoContext();
        channel.Initialize(ctx);
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        await channel.AgentEdited();
        expect(channel.Pushed).toEqual(['frame-1']);
        const note = (ctx as unknown as { Notes: string[] }).Notes.find((n) => n.includes('frame_confirmed'));
        expect(note).toContain('[channel:Picture#1] frame_confirmed');
        expect(note).toContain('do NOT narrate');
    });

    it('uses a literal confirmation note when the channel supplies one (legacy wording preserved)', async () => {
        const channel = new PictureChannel();
        const ctx = videoContext();
        channel.Initialize(ctx);
        channel.Enable({ ConfirmationNote: '[picture] done' });
        channel.InstallBridge({ count: 0 });
        await channel.AgentEdited();
        expect((ctx as unknown as { Notes: string[] }).Notes).toContain('[picture] done');
    });

    it('starts the bridge poller only when the channel asks for the legacy behavior', () => {
        const without = new PictureChannel();
        without.Initialize(videoContext());
        without.Enable();
        const a = { count: 0 };
        without.InstallBridge(a);
        without.OnSessionStarted();
        expect(a.count).toBe(0);

        const withPoller = new PictureChannel();
        withPoller.Initialize(videoContext());
        withPoller.Enable({ StartBridgePoller: true });
        const b = { count: 0 };
        withPoller.InstallBridge(b);
        withPoller.OnSessionStarted();
        expect(b.count).toBe(1);
    });

    it('does nothing without an established inbound video track', async () => {
        const channel = new PictureChannel();
        channel.Initialize(videoContext(false));
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        await channel.Edit();
        await channel.AgentEdited();
        expect(channel.Pushed).toHaveLength(0);
    });

    it('paces frames to the negotiated cadence (floor 250ms)', async () => {
        vi.setSystemTime(100_000);
        const channel = new PictureChannel();
        channel.Initialize(videoContext(true, 20)); // 20 fps requested -> clamped to the 250ms floor
        channel.Enable();
        channel.InstallBridge({ count: 0 });
        await channel.Edit();
        channel.Frame = 'frame-2';
        vi.setSystemTime(100_100); // inside the 250ms floor
        await channel.Edit();
        expect(channel.Pushed).toEqual(['frame-1']);
        await vi.advanceTimersByTimeAsync(250);
        expect(channel.Pushed).toEqual(['frame-1', 'frame-2']);
    });

    it('NotifyVisualChange and ConfirmVisualChange are inert before visual perception is enabled', async () => {
        const channel = new PictureChannel();
        channel.Initialize(videoContext());
        await expect(channel.Edit()).resolves.toBeUndefined();
        await expect(channel.AgentEdited()).resolves.toBeUndefined();
    });
});

/**
 * The channel's own frame bridge and the session's video source arbiter, on a model that takes one video stream, with a
 * camera that the user starts and stops: the arbiter sends the model the camera while it is on, so the channel's frames
 * are refused until it stops.
 */
describe('BaseRealtimeChannelClient — visual perception on one stream shared with a camera', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** A one-stream model connection: the frames it is sent, with their source, and the arbiter's notes. */
    function oneStreamClient() {
        const frames: Array<{ Data: string; Source: string | undefined }> = [];
        const notes: string[] = [];
        const client = {
            MaxInboundVideoStreams: 1,
            InboundVideoRate: 1,
            EstablishedTracks: [{ Descriptor: { Modality: 'video', Direction: 'inbound', Rate: 1 } }],
            IsTrackEstablished: (modality: string, direction: string) => modality === 'video' && direction === 'inbound',
            SendVideoFrame: (data: string, _mimeType?: string, sourceId?: string) => {
                frames.push({ Data: data, Source: sourceId });
                return true;
            },
            SendContextNote: (text: string) => {
                notes.push(text);
            },
        };
        return { client, frames, notes };
    }

    /** A channel on that connection, its picture sent once while it is the only source. */
    async function liveChannel() {
        vi.setSystemTime(100_000);
        const { client, frames, notes } = oneStreamClient();
        const ctx = makeChannelContext({ Client: client as unknown as RealtimeChannelContext['Client'] });
        const channel = new PictureChannel();
        channel.Initialize(ctx);
        channel.Enable();
        channel.OnSessionStarted();
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        await channel.Edit();
        const arbiter = VideoSourceArbiter.ForSink(client);
        return { channel, ctx, frames, notes, events, arbiter, sent: () => frames.map((f) => f.Data) };
    }

    it('sends no confirmation note, and reports no frame, for an agent edit the camera kept from the model', async () => {
        const { channel, ctx, events, arbiter, sent } = await liveChannel();
        vi.setSystemTime(102_000);
        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });

        channel.Frame = 'frame-2';
        vi.setSystemTime(104_000);
        await channel.AgentEdited();

        expect(sent()).toEqual(['frame-1']);
        expect(ctx.Notes.some((n) => n.includes('frame_confirmed'))).toBe(false);
        expect(events.filter((e) => e.Name === 'frame_pushed').map((e) => e.Payload['reason'])).toEqual(['change']);
        channel.Dispose();
    });

    it('sends the picture the model missed when the camera stops, after the note that it can see the channel again', async () => {
        const { channel, frames, notes, arbiter } = await liveChannel();
        vi.setSystemTime(102_000);
        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });
        channel.Frame = 'frame-2';
        vi.setSystemTime(104_000);
        await channel.AgentEdited();

        vi.setSystemTime(106_000);
        arbiter.UnregisterSource('capture:camera');
        await vi.advanceTimersByTimeAsync(0);

        expect(notes).toEqual(['[You can now see: Camera]', '[You can now see: Picture]']);
        expect(frames).toEqual([
            { Data: 'frame-1', Source: 'Picture#1' },
            { Data: 'frame-2', Source: 'Picture#1' },
        ]);
        channel.Dispose();
    });

    it('sends its unchanged picture again when the camera stops: the model was looking at the camera', async () => {
        const { channel, arbiter, sent } = await liveChannel();
        vi.setSystemTime(102_000);
        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });
        vi.setSystemTime(104_000);
        arbiter.UnregisterSource('capture:camera');
        await vi.advanceTimersByTimeAsync(0);
        expect(sent()).toEqual(['frame-1', 'frame-1']);
        channel.Dispose();
    });

    it('sends nothing when the camera stops after the channel is disposed', async () => {
        const { channel, arbiter, sent } = await liveChannel();
        vi.setSystemTime(102_000);
        arbiter.RegisterSource({ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' });
        channel.Dispose();
        vi.setSystemTime(104_000);
        arbiter.UnregisterSource('capture:camera');
        await vi.advanceTimersByTimeAsync(0);
        expect(sent()).toEqual(['frame-1']);
    });
});

/** A channel opened while the call is live (`on-demand`) was not part of the call's track negotiation. */
describe('BaseRealtimeChannelClient — the inbound video track of a channel opened mid-call', () => {
    /** A connected client on a model that takes video (or not), with the tracks negotiated at connect. */
    function connected(takesVideo: boolean, requested: RealtimeTrackDescriptor[] = []) {
        const client = new VideoClient();
        client.Negotiate(takesVideo, requested);
        const channel = new PictureChannel();
        channel.Initialize(makeChannelContext({ Client: client }));
        channel.Enable();
        return { client, channel, trackIds: () => client.AllTracks.map((t) => t.TrackID) };
    }

    it('adds the track it sources, so its frames reach the model with no camera or share on', async () => {
        const { client, channel } = connected(true);
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
        channel.OnSessionStarted();
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(true);
        await channel.Edit();
        expect(client.Frames).toEqual(['frame-1']);
        channel.Dispose();
    });

    it('adds nothing when the track is already live: negotiated at connect, or added by a capture', () => {
        const { channel, trackIds } = connected(true, [CHANNEL_INBOUND_VIDEO_TRACK]);
        const before = trackIds();
        channel.OnSessionStarted();
        expect(trackIds()).toEqual(before);
        channel.Dispose();
    });

    it('adds nothing on a model that takes no video, or when the server policy rules pixels out', () => {
        const audioOnly = connected(false);
        const before = audioOnly.trackIds();
        audioOnly.channel.OnSessionStarted();
        expect(audioOnly.trackIds()).toEqual(before);
        audioOnly.channel.Dispose();

        const noPixels = connected(true);
        noPixels.channel.ApplyExposure({ Policy: 'state' });
        noPixels.channel.OnSessionStarted();
        expect(noPixels.client.IsTrackEstablished('video', 'inbound')).toBe(false);
        noPixels.channel.Dispose();
    });
});
