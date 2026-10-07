import { describe, it, expect } from 'vitest';
import { CHANNEL_INBOUND_VIDEO_TRACK, type RealtimeTrackDescriptor } from '@memberjunction/ai';
import { VideoSourceArbiter, type MediaDevice, type SampledFrame } from '@memberjunction/ai-realtime-client';
import {
    RealtimeCaptures,
    type RealtimeCaptureAdmission,
    type RealtimeCaptureKind,
    type RealtimeCapturesOptions,
    type RealtimeFrameSamplerFactory,
} from '../session/realtime-captures';
import type { IRealtimeMediaHost } from '../hosts/IRealtimeMediaHost';
import { FakeController, FakeShare, ShareHost, VideoClient, stream } from './capture-test-helpers';

/** A sampler that takes no frames by itself; the test pushes them. */
interface FakeSampler {
    Stream: MediaStream;
    Rate: number;
    Push(frame: string): void;
    Running: boolean;
}

function harness(
    takesVideo = true,
    requested: RealtimeTrackDescriptor[] = [],
    admit?: (kind: RealtimeCaptureKind) => RealtimeCaptureAdmission,
    extra: Pick<RealtimeCapturesOptions, 'CameraCheck'> = {}
) {
    const client = new VideoClient();
    client.Negotiate(takesVideo, requested);
    const controller = new FakeController();
    const host = new ShareHost();
    const samplers: FakeSampler[] = [];
    const createSampler: RealtimeFrameSamplerFactory = (s, rate, onFrame) => {
        const sampler: FakeSampler = {
            Stream: s,
            Rate: rate,
            Running: false,
            Push: (data) => onFrame({ Data: data, MimeType: 'image/jpeg', Width: 1, Height: 1, TimestampMs: Date.now() } satisfies SampledFrame),
        };
        samplers.push(sampler);
        return {
            Start: () => (sampler.Running = true),
            Stop: () => {
                sampler.Running = false;
            },
        };
    };
    const captures = new RealtimeCaptures({ Client: client, LocalMedia: controller, Host: host, CreateSampler: createSampler, Admit: admit, ...extra });
    const sources = () => VideoSourceArbiter.ForSink(client).GetSources().map((s) => ({ SourceID: s.SourceID, Label: s.Label, Kind: s.Kind }));
    return { client, controller, host, samplers, captures, sources };
}

describe('RealtimeCaptures', () => {
    it('starts the camera on a model that takes video: adds the track, opens the camera, shows it at the model rate', async () => {
        const { client, controller, samplers, captures, sources } = harness();
        const state = await captures.Start('camera', { DeviceID: 'cam-2' });
        expect(state).toEqual({ Status: 'on', Stream: controller.CameraStream, DeviceID: 'cam-2', Devices: [] });
        expect(controller.StartCalls).toEqual([['camera', 'cam-2']]);
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(true);
        expect(sources()).toEqual([{ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' }]);
        expect(samplers[0]).toMatchObject({ Stream: controller.CameraStream, Rate: 2, Running: true });
        samplers[0].Push('frame-1');
        expect(client.Frames).toEqual(['frame-1']);
    });

    it('refuses on a model that takes no video, before asking for the camera', async () => {
        const { controller, captures } = harness(false);
        const state = await captures.Start('camera');
        expect(state).toMatchObject({ Status: 'failed', Failure: 'unsupported' });
        expect(state.Message).toMatch(/does not support inbound video/);
        expect(controller.StartCalls).toEqual([]);
    });

    it('stopping takes back everything it added: the frames, the source, the camera and the track', async () => {
        const { client, controller, samplers, captures, sources } = harness();
        await captures.Start('camera');
        captures.Stop('camera');
        expect(captures.States.Camera).toEqual({ Status: 'off' });
        expect(samplers[0].Running).toBe(false);
        expect(sources()).toEqual([]);
        expect(controller.StopCalls).toEqual(['camera']);
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
    });

    it('uses the video track the session was minted with, and leaves it there', async () => {
        const { client, captures } = harness(true, [{ ...CHANNEL_INBOUND_VIDEO_TRACK }]);
        const before = client.AllTracks.map((t) => t.TrackID);
        await captures.Start('camera');
        captures.Stop('camera');
        expect(client.AllTracks.map((t) => t.TrackID)).toEqual(before);
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(true);
    });

    it('keeps the track it added while the other capture is still on', async () => {
        const { client, captures } = harness();
        await captures.Start('camera');
        await captures.Start('screen');
        captures.Stop('camera');
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(true);
        captures.Stop('screen');
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
    });

    it('reports a refused camera with its reason, and gives the track back', async () => {
        const { client, controller, captures } = harness();
        controller.NextFailure = { Reason: 'denied', Message: 'Camera permission was denied.' };
        const state = await captures.Start('camera');
        expect(state).toEqual({ Status: 'failed', Failure: 'denied', Message: 'Camera permission was denied.' });
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
    });

    it('stops when the camera goes away', async () => {
        const { client, controller, captures, sources } = harness();
        await captures.Start('camera');
        controller.LoseCamera();
        expect(captures.States.Camera).toEqual({ Status: 'off' });
        expect(sources()).toEqual([]);
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
    });

    it('a second start while on returns the state without opening again', async () => {
        const { controller, captures } = harness();
        await captures.Start('camera');
        const again = await captures.Start('camera');
        expect(again.Status).toBe('on');
        expect(controller.StartCalls).toHaveLength(1);
    });

    it('a stop while the camera opens lets go of it once it has opened', async () => {
        const { client, controller, captures } = harness();
        controller.HoldStart();
        const starting = captures.Start('camera');
        expect(captures.States.Camera.Status).toBe('starting');
        captures.Stop('camera');
        controller.Release();
        expect(await starting).toEqual({ Status: 'off' });
        expect(controller.StopCalls).toEqual(['camera']);
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
    });

    it('shares a screen with the picker hint, reports what is shared, and stops when the browser ends it', async () => {
        const { host, captures, sources } = harness();
        const share = new FakeShare('window');
        host.Next = { Status: 'started', Capture: share };
        const state = await captures.Start('screen', { PreferredSurface: 'window' });
        expect(host.Requests).toEqual([{ PreferredSurface: 'window' }]);
        expect(state).toEqual({ Status: 'on', Stream: share.Stream, Surface: 'window' });
        expect(sources()).toEqual([{ SourceID: 'capture:screen', Label: 'Shared screen', Kind: 'screen' }]);
        share.EndFromBrowser();
        expect(captures.States.Screen).toEqual({ Status: 'off' });
        expect(sources()).toEqual([]);
    });

    it('stops the share itself when the user stops it in the app', async () => {
        const { host, captures } = harness();
        const share = new FakeShare('screen');
        host.Next = { Status: 'started', Capture: share };
        await captures.Start('screen');
        captures.Stop('screen');
        expect(share.Stopped).toBe(true);
    });

    it('reports a closed picker as cancelled, and a refused one with its reason', async () => {
        const { host, captures } = harness();
        host.Next = { Status: 'cancelled' };
        expect(await captures.Start('screen')).toMatchObject({ Status: 'failed', Failure: 'cancelled' });
        host.Next = { Status: 'failed', Reason: 'denied', Message: 'Screen sharing is blocked.' };
        expect(await captures.Start('screen')).toEqual({ Status: 'failed', Failure: 'denied', Message: 'Screen sharing is blocked.' });
    });

    it('cannot capture what the host cannot open', async () => {
        const client = new VideoClient();
        client.Negotiate(true);
        const host: IRealtimeMediaHost = { AcquireMicrophone: async () => stream('mic') };
        const captures = new RealtimeCaptures({ Client: client, LocalMedia: null, Host: host });
        expect(await captures.Start('camera')).toMatchObject({ Status: 'failed', Failure: 'unsupported', Message: 'This app cannot open a camera.' });
        expect(await captures.Start('screen')).toMatchObject({ Status: 'failed', Failure: 'unsupported', Message: 'This app cannot share a screen.' });
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
    });

    describe("the session's policy", () => {
        it('refuses a capture the policy does not admit, before adding a track or asking for anything', async () => {
            const { client, controller, host, captures } = harness(true, [], () => ({ Admitted: false, Message: 'The camera is not part of this call.' }));
            expect(await captures.Start('camera')).toEqual({ Status: 'failed', Failure: 'policy', Message: 'The camera is not part of this call.' });
            expect(await captures.Start('screen')).toMatchObject({ Status: 'failed', Failure: 'policy' });
            expect(captures.States.Camera).toMatchObject({ Status: 'failed', Failure: 'policy' });
            expect(controller.StartCalls).toEqual([]);
            expect(host.Requests).toEqual([]);
            expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
        });

        it("marks the capture as its channel's, and keeps it from the agent while the policy says so", async () => {
            const { client, samplers, captures } = harness(true, [], () => ({ Admitted: true, ChannelKey: 'Camera', VisibleToAgent: false }));
            await captures.Start('camera');
            const arbiter = VideoSourceArbiter.ForSink(client);
            expect(arbiter.GetSources()).toMatchObject([{ SourceID: 'capture:camera', ChannelKey: 'Camera', Enabled: false }]);
            samplers[0].Push('frame-1');
            expect(client.Frames).toEqual([]);
            expect(client.Notes).toEqual([]);
        });

        it('shows a running capture to the agent, or hides it, when its channel changes, without a note of its own', async () => {
            const { client, samplers, captures } = harness(true, [], () => ({ Admitted: true, ChannelKey: 'Camera', VisibleToAgent: true }));
            await captures.Start('camera');
            const notes = client.Notes.length;
            captures.SetVisibleToAgent('camera', false);
            samplers[0].Push('hidden');
            captures.SetVisibleToAgent('camera', true);
            samplers[0].Push('seen');
            expect(client.Frames).toEqual(['seen']);
            expect(client.Notes).toHaveLength(notes);
        });

        it('applies a change made while the capture is still opening', async () => {
            const { client, controller, captures } = harness(true, [], () => ({ Admitted: true, ChannelKey: 'Camera', VisibleToAgent: true }));
            controller.HoldStart();
            const starting = captures.Start('camera');
            captures.SetVisibleToAgent('camera', false);
            controller.Release();
            await starting;
            expect(VideoSourceArbiter.ForSink(client).GetSources()[0].Enabled).toBe(false);
        });
    });

    describe('the camera check', () => {
        /** Captures whose first camera start waits for the user's check, under the given policy. */
        const checked = (admit?: (kind: RealtimeCaptureKind) => RealtimeCaptureAdmission) => harness(true, [], admit, { CameraCheck: true });

        it('opens the camera for the user only: starting, checking, with the stream, and nothing for the agent', async () => {
            const { client, controller, samplers, captures, sources } = checked();
            const state = await captures.Start('camera', { DeviceID: 'cam-2' });
            expect(state).toEqual({ Status: 'starting', Checking: true, Stream: controller.CameraStream, DeviceID: 'cam-2', Devices: [] });
            expect(captures.States.Camera).toEqual(state);
            expect(controller.StartCalls).toEqual([['camera', 'cam-2']]);
            expect(sources()).toEqual([]);
            expect(samplers).toEqual([]);
            expect(client.Frames).toEqual([]);
            expect(client.Notes).toEqual([]);
        });

        it('shows the camera to the agent once the user confirms, and skips the check on the next start', async () => {
            const { client, controller, samplers, captures, sources } = checked();
            await captures.Start('camera');
            expect(captures.ConfirmCamera()).toEqual({ Status: 'on', Stream: controller.CameraStream, DeviceID: 'default', Devices: [] });
            expect(sources()).toEqual([{ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' }]);
            expect(samplers[0]).toMatchObject({ Stream: controller.CameraStream, Rate: 2, Running: true });
            samplers[0].Push('frame-1');
            expect(client.Frames).toEqual(['frame-1']);
            captures.Stop('camera');
            expect(await captures.Start('camera')).toEqual({ Status: 'on', Stream: controller.CameraStream, DeviceID: 'default', Devices: [] });
        });

        it('a stop during the check (the user said not now) lets go of the camera and the track, and the next start checks again', async () => {
            const { client, controller, captures, sources } = checked();
            await captures.Start('camera');
            captures.Stop('camera');
            expect(captures.States.Camera).toEqual({ Status: 'off' });
            expect(controller.StopCalls).toEqual(['camera']);
            expect(sources()).toEqual([]);
            expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
            expect(await captures.Start('camera')).toMatchObject({ Status: 'starting', Checking: true });
        });

        it('confirms nothing unless the camera waits for its check', async () => {
            const plain = harness();
            expect(plain.captures.ConfirmCamera()).toEqual({ Status: 'off' });
            await plain.captures.Start('camera');
            plain.captures.ConfirmCamera();
            expect(plain.samplers).toHaveLength(1);
            const { captures, samplers } = checked();
            expect(captures.ConfirmCamera()).toEqual({ Status: 'off' });
            await captures.Start('camera');
            captures.ConfirmCamera();
            captures.ConfirmCamera();
            expect(samplers).toHaveLength(1);
        });

        it('a start during the check returns the check without opening the camera again', async () => {
            const { controller, captures } = checked();
            await captures.Start('camera');
            expect(await captures.Start('camera')).toMatchObject({ Status: 'starting', Checking: true });
            expect(controller.StartCalls).toHaveLength(1);
        });

        it('applies a policy change made during the check when the user confirms', async () => {
            const { client, samplers, captures } = checked(() => ({ Admitted: true, ChannelKey: 'Camera', VisibleToAgent: true }));
            await captures.Start('camera');
            captures.SetVisibleToAgent('camera', false);
            captures.ConfirmCamera();
            expect(VideoSourceArbiter.ForSink(client).GetSources()).toMatchObject([{ SourceID: 'capture:camera', ChannelKey: 'Camera', Enabled: false }]);
            samplers[0].Push('hidden');
            expect(client.Frames).toEqual([]);
        });

        it('stops the check when the camera goes away', async () => {
            const { client, controller, captures } = checked();
            await captures.Start('camera');
            controller.LoseCamera();
            expect(captures.States.Camera).toEqual({ Status: 'off' });
            expect(captures.ConfirmCamera()).toEqual({ Status: 'off' });
            expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
        });

        it('never holds a screen share', async () => {
            const { captures } = checked();
            expect(await captures.Start('screen')).toMatchObject({ Status: 'on', Surface: 'window' });
        });

        it('Dispose during the check lets go of the camera', async () => {
            const { controller, captures } = checked();
            await captures.Start('camera');
            captures.Dispose();
            expect(controller.StopCalls).toEqual(['camera']);
            expect(captures.States.Camera).toEqual({ Status: 'off' });
        });
    });

    describe("the camera's devices", () => {
        const CAMERAS: MediaDevice[] = [
            { DeviceID: 'cam-1', Kind: 'camera', Label: 'Front camera', GroupID: 'laptop' },
            { DeviceID: 'cam-2', Kind: 'camera', Label: 'Desk camera', GroupID: 'desk' },
        ];
        const MICROPHONE: MediaDevice = { DeviceID: 'mic-1', Kind: 'microphone', Label: 'Headset', GroupID: 'headset' };

        it('an open camera names the camera in use and lists the cameras, following the names and the list as they change', async () => {
            const { controller, captures } = harness();
            const unnamed = CAMERAS.map((d) => ({ ...d, Label: '' }));
            controller.SetDevices([...unnamed, MICROPHONE]);
            expect(await captures.Start('camera', { DeviceID: 'cam-1' })).toMatchObject({ Status: 'on', DeviceID: 'cam-1', Devices: unnamed });
            controller.SetDevices([...CAMERAS, MICROPHONE]);
            expect(captures.States.Camera.Devices).toEqual(CAMERAS);
            const plugged: MediaDevice = { DeviceID: 'cam-3', Kind: 'camera', Label: 'USB camera', GroupID: 'usb' };
            controller.SetDevices([...CAMERAS, plugged, MICROPHONE]);
            expect(captures.States.Camera).toMatchObject({ Status: 'on', DeviceID: 'cam-1', Devices: [...CAMERAS, plugged] });
        });

        it('publishes the camera only when its device or its list changes', async () => {
            const { controller, captures } = harness();
            controller.SetDevices(CAMERAS);
            await captures.Start('camera', { DeviceID: 'cam-1' });
            const published: Array<string | undefined> = [];
            captures.States$.subscribe((s) => published.push(s.Camera.DeviceID));
            controller.SetDevices([...CAMERAS, MICROPHONE]);
            await captures.SwitchCamera('cam-2');
            expect(published).toEqual(['cam-1', 'cam-2']);
        });

        it('lists the cameras during the check, and lets go of the list when the camera stops', async () => {
            const { controller, captures } = harness(true, [], undefined, { CameraCheck: true });
            controller.SetDevices(CAMERAS);
            expect(await captures.Start('camera', { DeviceID: 'cam-2' })).toMatchObject({ Status: 'starting', Checking: true, DeviceID: 'cam-2', Devices: CAMERAS });
            captures.Stop('camera');
            expect(captures.States.Camera).toEqual({ Status: 'off' });
        });

        it('switches the open camera to another, keeping the stream and what the agent is shown', async () => {
            const { client, controller, samplers, captures, sources } = harness();
            controller.SetDevices(CAMERAS);
            await captures.Start('camera', { DeviceID: 'cam-1' });
            expect(await captures.SwitchCamera('cam-2')).toEqual({ Status: 'on', Stream: controller.CameraStream, DeviceID: 'cam-2', Devices: CAMERAS });
            expect(controller.SwitchCalls).toEqual(['cam-2']);
            expect(samplers).toHaveLength(1);
            expect(sources()).toEqual([{ SourceID: 'capture:camera', Label: 'Camera', Kind: 'camera' }]);
            samplers[0].Push('from-the-desk');
            expect(client.Frames).toEqual(['from-the-desk']);
        });

        it('switches during the check, which goes on waiting for the confirm', async () => {
            const { controller, captures, sources } = harness(true, [], undefined, { CameraCheck: true });
            await captures.Start('camera', { DeviceID: 'cam-1' });
            expect(await captures.SwitchCamera('cam-2')).toEqual({ Status: 'starting', Checking: true, Stream: controller.CameraStream, DeviceID: 'cam-2', Devices: [] });
            expect(sources()).toEqual([]);
        });

        it('keeps the camera in use when the new one cannot open, and stops when neither can', async () => {
            const { client, controller, captures } = harness();
            await captures.Start('camera', { DeviceID: 'cam-1' });
            controller.NextSwitch = 'back';
            expect(await captures.SwitchCamera('cam-2')).toMatchObject({ Status: 'on', DeviceID: 'cam-1' });
            controller.NextSwitch = 'lost';
            expect(await captures.SwitchCamera('cam-2')).toEqual({ Status: 'off' });
            expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
        });

        it('switches nothing while the camera is off', async () => {
            const { controller, captures } = harness();
            expect(await captures.SwitchCamera('cam-2')).toEqual({ Status: 'off' });
            expect(controller.SwitchCalls).toEqual([]);
        });
    });

    it('Dispose stops both captures and completes', async () => {
        const { client, captures } = harness();
        await captures.Start('camera');
        await captures.Start('screen');
        let completed = false;
        captures.States$.subscribe({ complete: () => (completed = true) });
        captures.Dispose();
        expect(completed).toBe(true);
        expect(captures.States).toEqual({ Camera: { Status: 'off' }, Screen: { Status: 'off' } });
        expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
    });
});
