import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalMediaController } from '../media/localMediaController';
import type { LocalMediaResult, LocalMediaState } from '../media/model';
import { InstallFakeMediaDevices, NamedError, type FakeMediaDevices } from './helpers/fake-user-media';

/** The stream from a result that must have started. */
function startedStream(result: LocalMediaResult): MediaStream {
    if (result.Status !== 'started') {
        throw new Error(`Expected a started capture, got ${JSON.stringify(result)}`);
    }
    return result.Stream;
}

/** Lets pending promise callbacks (a device-loss recovery, a device refresh) run. */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe('LocalMediaController', () => {
    let devices: FakeMediaDevices;
    let controller: LocalMediaController;

    beforeEach(() => {
        devices = InstallFakeMediaDevices();
        controller = new LocalMediaController();
    });

    afterEach(() => {
        controller.Dispose();
        vi.unstubAllGlobals();
    });

    it('starts nothing on its own', () => {
        expect(devices.Requests).toHaveLength(0);
        expect(controller.State).toEqual({ Camera: { Status: 'off' }, Microphone: { Status: 'off' }, Devices: [] });
    });

    describe('Start', () => {
        it('starts the camera at its native frame rate and reports the device', async () => {
            const stream = startedStream(await controller.Start('camera'));

            expect(devices.Requests[0]).toEqual({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
            expect(stream.getVideoTracks()[0]).toBe(devices.Tracks[0]);
            expect(controller.GetStream('camera')).toBe(stream);
            expect(controller.State.Camera).toEqual({ Status: 'on', DeviceID: 'cam-built-in', Label: 'Built-in Camera' });
        });

        it('starts the microphone with echo cancellation, noise suppression and auto gain', async () => {
            await controller.Start('microphone');
            expect(devices.Requests[0]).toEqual({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            expect(controller.State.Microphone).toMatchObject({ Status: 'on', DeviceID: 'mic-built-in' });
        });

        it('prefers a device without requiring it, so a remembered device that is gone falls back', async () => {
            await controller.Start('camera', 'cam-usb');
            expect(devices.Requests[0]).toMatchObject({ video: { deviceId: { ideal: 'cam-usb' } } });
            expect(controller.State.Camera.DeviceID).toBe('cam-usb');

            controller.Stop('camera');
            devices.Devices = devices.Devices.filter((d) => d.DeviceID !== 'cam-usb');
            await controller.Start('camera', 'cam-usb');
            expect(controller.State.Camera.DeviceID).toBe('cam-built-in');
        });

        it('lists devices with their labels once the user has allowed them', async () => {
            expect(await controller.RefreshDevices()).toEqual(expect.arrayContaining([expect.objectContaining({ DeviceID: 'cam-usb', Label: '' })]));

            await controller.Start('camera');
            await settle();
            expect(controller.State.Devices).toEqual(expect.arrayContaining([
                { DeviceID: 'cam-usb', Kind: 'camera', Label: 'USB Camera', GroupID: 'g-usb' },
                { DeviceID: 'mic-headset', Kind: 'microphone', Label: 'Headset', GroupID: 'g-headset' },
            ]));
        });

        it('returns the live stream when the kind is already on', async () => {
            const first = startedStream(await controller.Start('camera'));
            const second = startedStream(await controller.Start('camera'));
            expect(second).toBe(first);
            expect(devices.Requests).toHaveLength(1);
        });

        it('shares one request between overlapping starts', async () => {
            const [a, b] = await Promise.all([controller.Start('camera'), controller.Start('camera')]);
            expect(startedStream(a)).toBe(startedStream(b));
            expect(devices.Requests).toHaveLength(1);
        });
    });

    describe('failures are results, and show in State', () => {
        it.each([
            ['NotAllowedError', 'denied'],
            ['NotFoundError', 'not-found'],
            ['NotReadableError', 'in-use'],
            ['TypeError', 'error'],
        ])('%s is %s', async (name, reason) => {
            devices.RejectNextWith(NamedError(name, `${name} message`));
            expect(await controller.Start('camera')).toEqual({ Status: 'failed', Reason: reason, Message: `${name} message` });
            expect(controller.State.Camera).toEqual({ Status: 'failed', Failure: reason, Message: `${name} message` });
            expect(controller.GetStream('camera')).toBeNull();
        });

        it('a browser that cannot capture is unsupported', async () => {
            vi.unstubAllGlobals();
            const bare = new LocalMediaController();
            expect(await bare.Start('microphone')).toMatchObject({ Status: 'failed', Reason: 'unsupported' });
            bare.Dispose();
        });
    });

    describe('SwitchDevice', () => {
        it('keeps the same stream with the new device in it, and stops the old one', async () => {
            const stream = startedStream(await controller.Start('camera'));
            const oldTrack = devices.Tracks[0];

            const switched = startedStream(await controller.SwitchDevice('camera', 'cam-usb'));
            expect(switched).toBe(stream);
            expect(devices.Requests[1]).toMatchObject({ video: { deviceId: { exact: 'cam-usb' } } });
            expect(stream.getVideoTracks()).toEqual([devices.Tracks[1]]);
            expect(oldTrack.Stopped).toBe(true);
            expect(controller.State.Camera).toMatchObject({ Status: 'on', DeviceID: 'cam-usb', Label: 'USB Camera' });
        });

        it('releases the current device before opening the new one, as mobile browsers need', async () => {
            await controller.Start('camera');
            await controller.SwitchDevice('camera', 'cam-usb');
            expect(devices.LiveAtRequest).toEqual([0, 0]);
        });

        it('reopens the previous device when the new one fails', async () => {
            const stream = startedStream(await controller.Start('camera'));
            devices.RejectNextWith(NamedError('NotReadableError', 'Device in use'));

            expect(await controller.SwitchDevice('camera', 'cam-usb')).toMatchObject({ Status: 'failed', Reason: 'in-use' });
            expect(devices.Requests[2]).toMatchObject({ video: { deviceId: { exact: 'cam-built-in' } } });
            expect(stream.getVideoTracks()).toEqual([devices.Tracks[1]]);
            expect(controller.State.Camera).toMatchObject({ Status: 'on', DeviceID: 'cam-built-in' });
        });

        it('fails the kind when the previous device cannot be reopened either', async () => {
            await controller.Start('camera');
            devices.RejectNextWith(NamedError('NotReadableError', 'Device in use'), NamedError('NotReadableError', 'Still in use'));

            await controller.SwitchDevice('camera', 'cam-usb');
            expect(controller.State.Camera).toEqual({ Status: 'failed', Failure: 'in-use', Message: 'Still in use' });
            expect(controller.GetStream('camera')).toBeNull();
        });

        it('a Stop during a switch wins: the device that arrives is released', async () => {
            await controller.Start('camera');
            devices.HoldNext();
            const pending = controller.SwitchDevice('camera', 'cam-usb');
            controller.Stop('camera');
            devices.ReleaseHeld();

            expect(await pending).toMatchObject({ Status: 'failed', Reason: 'error' });
            expect(devices.Tracks[1].Stopped).toBe(true);
            expect(controller.State.Camera).toEqual({ Status: 'off' });
        });

        it('starts a kind that is off on the chosen device', async () => {
            await controller.SwitchDevice('microphone', 'mic-headset');
            expect(controller.State.Microphone).toMatchObject({ Status: 'on', DeviceID: 'mic-headset' });
        });
    });

    describe('a lost device', () => {
        it('falls back to the default device in the same stream', async () => {
            const stream = startedStream(await controller.Start('microphone', 'mic-headset'));
            devices.Unplug('mic-headset');
            await settle();

            expect(devices.Requests[1]).toEqual({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            expect(controller.GetStream('microphone')).toBe(stream);
            expect(stream.getAudioTracks()).toEqual([devices.Tracks[1]]);
            expect(controller.State.Microphone).toMatchObject({ Status: 'on', DeviceID: 'mic-built-in' });
        });

        it('reports failed when no device of that kind is left', async () => {
            await controller.Start('camera');
            devices.Unplug('cam-usb');
            devices.Unplug('cam-built-in');
            await settle();

            expect(controller.State.Camera).toMatchObject({ Status: 'failed', Failure: 'not-found' });
            expect(controller.GetStream('camera')).toBeNull();
        });

        it('is told apart from a stop: stopping never restarts the device', async () => {
            await controller.Start('camera');
            controller.Stop('camera');
            await settle();
            expect(devices.Requests).toHaveLength(1);
        });
    });

    describe('Stop and Dispose', () => {
        it('Stop releases the device and reports off', async () => {
            await controller.Start('camera');
            controller.Stop('camera');
            expect(devices.Tracks[0].Stopped).toBe(true);
            expect(controller.GetStream('camera')).toBeNull();
            expect(controller.State.Camera).toEqual({ Status: 'off' });
        });

        it('a start that finishes after Stop releases what arrived', async () => {
            devices.HoldNext();
            const pending = controller.Start('camera');
            controller.Stop('camera');
            devices.ReleaseHeld();

            expect(await pending).toMatchObject({ Status: 'failed', Reason: 'error' });
            expect(devices.Tracks[0].Stopped).toBe(true);
            expect(controller.State.Camera).toEqual({ Status: 'off' });
        });

        it('State$ gives a new subscriber the current state, then every change, and completes on Dispose', async () => {
            await controller.Start('camera');
            const seen: LocalMediaState[] = [];
            let completed = false;
            controller.State$.subscribe({ next: (state) => seen.push(state), complete: () => (completed = true) });
            expect(seen[0].Camera.Status).toBe('on');

            controller.Dispose();
            expect(seen.at(-1)?.Camera.Status).toBe('off');
            expect(completed).toBe(true);
            expect(devices.Tracks[0].Stopped).toBe(true);
        });

        it('follows device changes until disposed', async () => {
            await controller.Start('camera');
            await settle();
            devices.Unplug('cam-usb');
            await settle();
            expect(controller.State.Devices.some((d) => d.DeviceID === 'cam-usb')).toBe(false);

            controller.Dispose();
            const listed = vi.spyOn(devices, 'enumerateDevices');
            devices.dispatchEvent(new Event('devicechange'));
            expect(listed).not.toHaveBeenCalled();
        });
    });
});
