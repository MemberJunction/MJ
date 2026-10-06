import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RealtimeTrackDirection } from '@memberjunction/ai';
import {
    DEFAULT_VIDEO_SOURCE_POLICY,
    IsVideoCaptureKind,
    VideoSourceArbiter,
    type IVideoFrameSink,
} from '../media/videoSourceArbiter';
import { MinVideoFrameSpacingMs, NominalVideoFrameIntervalMs } from '../media/videoPacing';

interface SentFrame {
    Data: string;
    Mime: string | undefined;
    Source: string | undefined;
}

/** A fake model connection with a configurable stream count and rate. */
class FakeSink implements IVideoFrameSink {
    public MaxInboundVideoStreams: number;
    public InboundVideoRate: number | undefined;
    public Frames: SentFrame[] = [];
    public Notes: string[] = [];
    public VideoLive = true;
    public AcceptFrames = true;

    constructor(streams = 1, rate: number | undefined = 1) {
        this.MaxInboundVideoStreams = streams;
        this.InboundVideoRate = rate;
    }

    public IsTrackEstablished(modality: string, direction: RealtimeTrackDirection): boolean {
        return modality === 'video' && direction === 'inbound' && this.VideoLive;
    }

    public SendVideoFrame(base64Image: string, mimeType?: string, sourceId?: string): boolean {
        if (!this.AcceptFrames) {
            return false;
        }
        this.Frames.push({ Data: base64Image, Mime: mimeType, Source: sourceId });
        return true;
    }

    public SendContextNote(text: string): void {
        this.Notes.push(text);
    }
}

describe('VideoSourceArbiter', () => {
    let sink: FakeSink;
    let clock: number;
    let arbiter: VideoSourceArbiter;

    /** Advances the fake clock past the pacing interval, so a following frame is not throttled. */
    const tick = (ms = 2000): void => {
        clock += ms;
    };

    beforeEach(() => {
        sink = new FakeSink(1, 1);
        clock = 1_000_000;
        arbiter = new VideoSourceArbiter(sink, { Now: () => clock });
    });

    describe('one-stream model (every Live model today)', () => {
        it('forwards a lone source untouched and sends NO switch note', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(arbiter.PushFrame('wb', 'FRAME1')).toBe(true);
            expect(sink.Frames).toEqual([{ Data: 'FRAME1', Mime: 'image/jpeg', Source: 'wb' }]);
            expect(sink.Notes).toEqual([]);
        });

        it('policy order is user pick, then most recent capture, then focused surface, then newest', () => {
            expect([...DEFAULT_VIDEO_SOURCE_POLICY]).toEqual(['user-pick', 'recent-capture', 'focused', 'recent']);
        });

        it('a capture beats a surface, and a note says what the agent now sees', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            expect(arbiter.GetActiveSourceIDs()).toEqual(['cam']);
            expect(sink.Notes).toEqual(['[The agent is now viewing: Camera]']);
            expect(arbiter.PushFrame('wb', 'W')).toBe(false); // the surface is not what the model sees now
            expect(arbiter.PushFrame('cam', 'C')).toBe(true);
            expect(sink.Frames.map((f) => f.Source)).toEqual(['cam']);
        });

        it('the most recently STARTED capture wins among captures', () => {
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            arbiter.RegisterSource({ SourceID: 'scr', Label: 'Screen', Kind: 'screen' });
            expect(arbiter.GetActiveSourceIDs()).toEqual(['scr']);
            expect(sink.Notes.at(-1)).toBe('[The agent is now viewing: Screen]');
        });

        it('an explicit user pick beats a newer capture', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            expect(arbiter.SelectSource('wb')).toBe(true);
            expect(arbiter.GetActiveSourceIDs()).toEqual(['wb']);
            expect(sink.Notes.at(-1)).toBe('[The agent is now viewing: Whiteboard]');
        });

        it('with no capture, the focused surface wins over a newer unfocused one', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'rb', Label: 'Browser' });
            expect(arbiter.GetActiveSourceIDs()).toEqual(['rb']); // newest, nothing focused
            arbiter.SetFocusedSource('wb');
            expect(arbiter.GetActiveSourceIDs()).toEqual(['wb']);
            expect(sink.Notes.at(-1)).toBe('[The agent is now viewing: Whiteboard]');
        });

        it('focusing a CHANNEL focuses its sources, including one that registers afterwards, and clearing it releases them', () => {
            arbiter.RegisterSource({ SourceID: 'rb#1', Label: 'Browser', ChannelKey: 'RemoteBrowser' });
            arbiter.RegisterSource({ SourceID: 'media#1', Label: 'Media', ChannelKey: 'Media' });
            arbiter.SetFocusedChannel('RemoteBrowser');
            expect(arbiter.GetActiveSourceIDs()).toEqual(['rb#1']);
            // A source of the focused channel that registers later is focused straight away, though it is not the newest.
            arbiter.UnregisterSource('rb#1');
            arbiter.RegisterSource({ SourceID: 'rb#2', Label: 'Browser', ChannelKey: 'RemoteBrowser' });
            arbiter.RegisterSource({ SourceID: 'wb#1', Label: 'Whiteboard', ChannelKey: 'Whiteboard' });
            expect(arbiter.GetActiveSourceIDs()).toEqual(['rb#2']);
            arbiter.SetFocusedChannel(null);
            expect(arbiter.GetActiveSourceIDs()).toEqual(['wb#1']);
        });

        it('focusing the channel that is already focused changes nothing and tells nobody', () => {
            arbiter.RegisterSource({ SourceID: 'rb#1', Label: 'Browser', ChannelKey: 'RemoteBrowser' });
            arbiter.SetFocusedChannel('RemoteBrowser');
            const seen = vi.fn();
            arbiter.OnChange(seen);
            arbiter.SetFocusedChannel('RemoteBrowser');
            expect(seen).not.toHaveBeenCalled();
        });

        it('stopping the active capture falls back to the surface and says so', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            sink.Notes.length = 0;
            arbiter.UnregisterSource('cam');
            expect(arbiter.GetActiveSourceIDs()).toEqual(['wb']);
            expect(sink.Notes).toEqual(['[The agent is now viewing: Whiteboard]']);
        });

        it('the last source leaving after arbitration is silent (there is nothing to switch to)', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            arbiter.UnregisterSource('wb');
            sink.Notes.length = 0;
            arbiter.UnregisterSource('cam');
            expect(sink.Notes).toEqual([]);
            expect(arbiter.GetActiveSourceIDs()).toEqual([]);
        });

        it('a lone source leaving is silent (nothing was switched)', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.UnregisterSource('wb');
            expect(sink.Notes).toEqual([]);
        });

        it('the policy is overridable data: a host can put the focused surface first', () => {
            const custom = new VideoSourceArbiter(sink, { Policy: ['focused', 'recent'], Now: () => clock });
            custom.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            custom.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            custom.SetFocusedSource('wb');
            expect(custom.GetActiveSourceIDs()).toEqual(['wb']);
        });

        it('a trimmed policy may leave a source out of view entirely', () => {
            const custom = new VideoSourceArbiter(sink, { Policy: ['user-pick'], Now: () => clock });
            custom.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(custom.GetActiveSourceIDs()).toEqual([]);
            expect(custom.PushFrame('wb', 'X')).toBe(false);
        });

        it('uses custom note formatters', () => {
            const custom = new VideoSourceArbiter(sink, {
                Now: () => clock,
                FormatSwitchNote: (labels) => `Now looking at ${labels.join('+')}`,
            });
            custom.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            custom.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            expect(sink.Notes).toEqual(['Now looking at Camera']);
        });

        it('a formatter returning null sends nothing', () => {
            const custom = new VideoSourceArbiter(sink, { Now: () => clock, FormatSwitchNote: () => null });
            custom.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            custom.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            expect(sink.Notes).toEqual([]);
        });
    });

    describe('two-stream model (pass-through)', () => {
        beforeEach(() => {
            sink = new FakeSink(2, 1);
            arbiter = new VideoSourceArbiter(sink, { Now: () => clock });
        });

        it('passes BOTH sources through untouched, each tagged with its source id, and sends no note', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            expect(arbiter.GetActiveSourceIDs().sort()).toEqual(['cam', 'wb']);
            expect(arbiter.PushFrame('wb', 'W')).toBe(true);
            expect(arbiter.PushFrame('cam', 'C')).toBe(true);
            expect(sink.Frames).toEqual([
                { Data: 'W', Mime: 'image/jpeg', Source: 'wb' },
                { Data: 'C', Mime: 'image/jpeg', Source: 'cam' },
            ]);
            expect(sink.Notes).toEqual([]);
        });

        it('arbitrates again once sources outnumber the streams, naming everything in view', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            arbiter.RegisterSource({ SourceID: 'scr', Label: 'Screen', Kind: 'screen' });
            expect(arbiter.GetActiveSourceIDs()).toEqual(['scr', 'cam']);
            expect(sink.Notes.at(-1)).toBe('[The agent is now viewing: Screen, Camera]');
            expect(arbiter.PushFrame('wb', 'W')).toBe(false);
        });
    });

    describe('pacing and track gating', () => {
        it('paces each source by the NEGOTIATED rate, not a constant', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(arbiter.PushFrame('wb', 'A')).toBe(true);
            tick(500);
            expect(arbiter.PushFrame('wb', 'B')).toBe(false); // < 750 ms at 1 fps
            tick(300);
            expect(arbiter.PushFrame('wb', 'C')).toBe(true);

            sink.InboundVideoRate = 4; // a faster model: 4 fps, spacing 187 ms
            tick(200);
            expect(arbiter.PushFrame('wb', 'D')).toBe(true);
            tick(100);
            expect(arbiter.PushFrame('wb', 'E')).toBe(false);
            tick(100);
            expect(arbiter.PushFrame('wb', 'F')).toBe(true);
        });

        it('derives spacing from the rate: 750 ms at 1 fps, 187 ms at 4 fps, and a 1 fps default', () => {
            expect(MinVideoFrameSpacingMs(1)).toBe(750);
            expect(MinVideoFrameSpacingMs(4)).toBe(187);
            expect(MinVideoFrameSpacingMs(undefined)).toBe(750);
            expect(NominalVideoFrameIntervalMs(2)).toBe(500);
            expect(NominalVideoFrameIntervalMs(0)).toBe(1000);
        });

        it('forwards nothing without a live inbound video track', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            sink.VideoLive = false;
            expect(arbiter.PushFrame('wb', 'X')).toBe(false);
        });

        it('forwards nothing for an unregistered source or a sink without SendVideoFrame', () => {
            expect(arbiter.PushFrame('ghost', 'X')).toBe(false);
            const noVideo: IVideoFrameSink = {
                MaxInboundVideoStreams: 1,
                InboundVideoRate: 1,
                IsTrackEstablished: () => true,
                SendContextNote: () => undefined,
            };
            const inert = new VideoSourceArbiter(noVideo, { Now: () => clock });
            inert.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(inert.PushFrame('wb', 'X')).toBe(false);
        });

        it('reads a sink that predates MaxInboundVideoStreams as one stream while video is live', () => {
            const frames: string[] = [];
            const legacy = {
                IsTrackEstablished: () => true,
                SendVideoFrame: (data: string) => {
                    frames.push(data);
                    return true;
                },
                SendContextNote: () => undefined,
            } as unknown as IVideoFrameSink;
            const a = new VideoSourceArbiter(legacy, { Now: () => clock });
            a.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(a.PushFrame('wb', 'X')).toBe(true);
            expect(frames).toEqual(['X']);
        });

        it('re-derives the active set at push time, so a stream count that grows after registration is honored', () => {
            sink.MaxInboundVideoStreams = 0; // track not negotiated yet
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(arbiter.PushFrame('wb', 'A')).toBe(false);
            sink.MaxInboundVideoStreams = 1;
            expect(arbiter.PushFrame('wb', 'A')).toBe(true);
        });

        it('a dropped frame (sink refused) does not advance pacing', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            sink.AcceptFrames = false;
            expect(arbiter.PushFrame('wb', 'A')).toBe(false);
            sink.AcceptFrames = true;
            expect(arbiter.PushFrame('wb', 'A')).toBe(true);
        });

        it('reports a throwing sink instead of throwing into the caller', () => {
            const onError = vi.fn();
            const throwing = new FakeSink(1, 1);
            throwing.SendVideoFrame = () => {
                throw new Error('socket closed');
            };
            const a = new VideoSourceArbiter(throwing, { Now: () => clock, OnError: onError });
            a.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(a.PushFrame('wb', 'X')).toBe(false);
            expect(onError).toHaveBeenCalledTimes(1);
        });
    });

    describe('user control: turning a source off', () => {
        it('a disabled source sends nothing and the model is told it was turned off', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            expect(arbiter.SetSourceEnabled('wb', false)).toBe(true);
            expect(sink.Notes).toEqual(["[The user turned off the agent's view of: Whiteboard]"]);
            expect(arbiter.PushFrame('wb', 'X')).toBe(false);
            expect(arbiter.GetSources()[0]).toMatchObject({ Enabled: false, Active: false });
        });

        it('turning it back on resumes and tells the model', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.SetSourceEnabled('wb', false);
            sink.Notes.length = 0;
            arbiter.SetSourceEnabled('wb', true);
            expect(sink.Notes).toEqual(['[The agent can see Whiteboard again]']);
            expect(arbiter.PushFrame('wb', 'X')).toBe(true);
        });

        it('turning the active capture off hands the view to the next source and does not double-note', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            sink.Notes.length = 0;
            arbiter.SetSourceEnabled('cam', false);
            expect(arbiter.GetActiveSourceIDs()).toEqual(['wb']);
            expect(sink.Notes).toEqual(["[The user turned off the agent's view of: Camera]"]);
        });

        it('registers a source the agent may not see yet disabled: it is no candidate and the model hears nothing', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            sink.Notes.length = 0;
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera', ChannelKey: 'Camera', Enabled: false });
            expect(arbiter.GetActiveSourceIDs()).toEqual(['wb']);
            expect(arbiter.PushFrame('cam', 'X')).toBe(false);
            expect(sink.Notes).toEqual([]);
            expect(arbiter.GetSources().find((s) => s.SourceID === 'cam')).toMatchObject({ Enabled: false, ChannelKey: 'Camera' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera', Enabled: true });
            expect(arbiter.GetSources().find((s) => s.SourceID === 'cam')?.Enabled).toBe(false); // an update keeps the state
        });

        it('notify:false lets a caller send its own note without the model hearing it twice', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.SetSourceEnabled('wb', false, false);
            expect(sink.Notes).toEqual([]);
        });

        it('is idempotent and returns false for an unknown source', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.SetSourceEnabled('wb', false);
            sink.Notes.length = 0;
            expect(arbiter.SetSourceEnabled('wb', false)).toBe(true);
            expect(sink.Notes).toEqual([]);
            expect(arbiter.SetSourceEnabled('ghost', false)).toBe(false);
        });

        it('cannot pick a disabled or unknown source; disabling a picked source clears the pick', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            expect(arbiter.SelectSource('ghost')).toBe(false);
            arbiter.SelectSource('wb');
            arbiter.SetSourceEnabled('wb', false);
            arbiter.SetSourceEnabled('wb', true);
            expect(arbiter.GetActiveSourceIDs()).toEqual(['cam']); // the pick did not survive being disabled
            arbiter.SetSourceEnabled('wb', false);
            expect(arbiter.SelectSource('wb')).toBe(false);
        });

        it('a pick can be cleared with null', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            arbiter.SelectSource('wb');
            arbiter.SelectSource(null);
            expect(arbiter.GetActiveSourceIDs()).toEqual(['cam']);
        });
    });

    describe('registration and observation', () => {
        it('re-registering an id updates its label without resetting its recency or enabled state', () => {
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Whiteboard' });
            arbiter.RegisterSource({ SourceID: 'cam', Label: 'Camera', Kind: 'camera' });
            arbiter.SetSourceEnabled('wb', false);
            arbiter.RegisterSource({ SourceID: 'wb', Label: 'Board' });
            const wb = arbiter.GetSources().find((s) => s.SourceID === 'wb');
            expect(wb).toMatchObject({ Label: 'Board', Enabled: false });
        });

        it('rejects a source without an id', () => {
            expect(() => arbiter.RegisterSource({ SourceID: '', Label: 'x' })).toThrow(/SourceID/);
        });

        it('lists sources in registration order with their forwarded counts', () => {
            arbiter.RegisterSource({ SourceID: 'a', Label: 'A' });
            arbiter.RegisterSource({ SourceID: 'b', Label: 'B' });
            arbiter.PushFrame('b', 'x');
            const states = arbiter.GetSources();
            expect(states.map((s) => s.SourceID)).toEqual(['a', 'b']);
            expect(states[1]).toMatchObject({ FramesSent: 1, Active: true });
            expect(states[0]).toMatchObject({ FramesSent: 0, Active: false });
        });

        it('notifies subscribers of structural changes and stops after unsubscribe', () => {
            const handler = vi.fn();
            const off = arbiter.OnChange(handler);
            arbiter.RegisterSource({ SourceID: 'a', Label: 'A' });
            arbiter.SetSourceEnabled('a', false);
            arbiter.UnregisterSource('a');
            expect(handler).toHaveBeenCalledTimes(3);
            off();
            arbiter.RegisterSource({ SourceID: 'b', Label: 'B' });
            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('a throwing change handler is reported, not propagated', () => {
            const onError = vi.fn();
            const a = new VideoSourceArbiter(sink, { Now: () => clock, OnError: onError });
            a.OnChange(() => {
                throw new Error('ui blew up');
            });
            expect(() => a.RegisterSource({ SourceID: 'a', Label: 'A' })).not.toThrow();
            expect(onError).toHaveBeenCalled();
        });

        it('ForSink returns ONE arbiter per sink (a single writer) and distinct ones for distinct sinks', () => {
            const one = VideoSourceArbiter.ForSink(sink);
            expect(VideoSourceArbiter.ForSink(sink)).toBe(one);
            expect(VideoSourceArbiter.ForSink(new FakeSink())).not.toBe(one);
        });

        it('Dispose drops every source', () => {
            arbiter.RegisterSource({ SourceID: 'a', Label: 'A' });
            arbiter.Dispose();
            expect(arbiter.GetSources()).toEqual([]);
        });

        it('classifies capture kinds', () => {
            expect(IsVideoCaptureKind('camera')).toBe(true);
            expect(IsVideoCaptureKind('screen')).toBe(true);
            expect(IsVideoCaptureKind('surface')).toBe(false);
            expect(IsVideoCaptureKind(undefined)).toBe(false);
            expect(IsVideoCaptureKind('avatar')).toBe(false);
        });
    });
});
