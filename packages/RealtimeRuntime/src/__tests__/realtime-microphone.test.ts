import { describe, it, expect } from 'vitest';
import type { LocalMediaState, LocalTrackState, MediaDevice } from '@memberjunction/ai-realtime-client';
import { REALTIME_MICROPHONE_NONE, ReadMicrophoneState, SameMicrophoneState, type RealtimeMicrophoneState } from '../session/realtime-microphone';

const BUILT_IN: MediaDevice = { DeviceID: 'mic-built-in', Kind: 'microphone', Label: 'Built-in Microphone', GroupID: 'laptop' };
const HEADSET: MediaDevice = { DeviceID: 'mic-headset', Kind: 'microphone', Label: 'USB Headset', GroupID: 'headset' };
const CAMERA: MediaDevice = { DeviceID: 'cam-built-in', Kind: 'camera', Label: 'Built-in Camera', GroupID: 'laptop' };

/** A controller's report with the microphone in the given state and the built-in microphone, a camera and a headset listed. */
const media = (microphone: LocalTrackState): LocalMediaState => ({ Camera: { Status: 'off' }, Microphone: microphone, Devices: [BUILT_IN, CAMERA, HEADSET] });

/** What the call shows while it uses the built-in microphone. */
const ON_BUILT_IN: RealtimeMicrophoneState = { DeviceID: 'mic-built-in', Devices: [BUILT_IN, HEADSET] };

/** What the call shows once it lost its microphone. */
const LOST: RealtimeMicrophoneState = { Devices: [BUILT_IN, HEADSET], Failure: 'not-found' };

/** The call's microphone read from its controller's report (#5371). */
describe('ReadMicrophoneState', () => {
    it("names the controller's microphone while it is on, and lists the microphones alone, in the browser's order", () => {
        expect(ReadMicrophoneState(media({ Status: 'on', DeviceID: 'mic-headset' }), ON_BUILT_IN)).toEqual({
            DeviceID: 'mic-headset',
            Devices: [BUILT_IN, HEADSET],
        });
    });

    it('keeps naming the microphone in use while the controller starts another one', () => {
        expect(ReadMicrophoneState(media({ Status: 'starting' }), ON_BUILT_IN).DeviceID).toBe('mic-built-in');
        expect(ReadMicrophoneState(media({ Status: 'starting' }))).toEqual({ Devices: [BUILT_IN, HEADSET] });
    });

    it('names none once the controller stopped the microphone', () => {
        expect(ReadMicrophoneState(media({ Status: 'off' }), ON_BUILT_IN)).toEqual({ Devices: [BUILT_IN, HEADSET] });
    });

    it('names none and says why once the controller could open none (#5406)', () => {
        expect(ReadMicrophoneState(media({ Status: 'failed', Failure: 'in-use' }), ON_BUILT_IN)).toEqual({ Devices: [BUILT_IN, HEADSET], Failure: 'in-use' });
        expect(ReadMicrophoneState(media({ Status: 'failed' }), ON_BUILT_IN).Failure).toBe('error');
    });

    it('keeps saying why none works while the controller opens a picked one, and stops once it is on (#5406)', () => {
        expect(ReadMicrophoneState(media({ Status: 'starting' }), LOST)).toEqual(LOST);
        expect(ReadMicrophoneState(media({ Status: 'on', DeviceID: 'mic-headset' }), LOST)).toEqual({ DeviceID: 'mic-headset', Devices: [BUILT_IN, HEADSET] });
        expect(ReadMicrophoneState(media({ Status: 'failed', Failure: 'in-use' }), LOST).Failure).toBe('in-use');
    });
});

describe('SameMicrophoneState', () => {
    it('is the same for the same microphone in use and the same list, by id and name', () => {
        expect(SameMicrophoneState({ DeviceID: 'mic-built-in', Devices: [BUILT_IN] }, { DeviceID: 'mic-built-in', Devices: [{ ...BUILT_IN }] })).toBe(true);
        expect(SameMicrophoneState(REALTIME_MICROPHONE_NONE, { Devices: [] })).toBe(true);
    });

    it('differs when the microphone in use, the list, its order or a name differs', () => {
        const state = { DeviceID: 'mic-built-in', Devices: [BUILT_IN, HEADSET] };
        expect(SameMicrophoneState(state, { ...state, DeviceID: 'mic-headset' })).toBe(false);
        expect(SameMicrophoneState(state, { ...state, Devices: [BUILT_IN] })).toBe(false);
        expect(SameMicrophoneState(state, { ...state, Devices: [HEADSET, BUILT_IN] })).toBe(false);
        expect(SameMicrophoneState(state, { ...state, Devices: [BUILT_IN, { ...HEADSET, Label: 'Headset (USB)' }] })).toBe(false);
    });

    it('differs when the failure differs (#5406)', () => {
        expect(SameMicrophoneState(LOST, { ...LOST })).toBe(true);
        expect(SameMicrophoneState(LOST, { ...LOST, Failure: 'in-use' })).toBe(false);
        expect(SameMicrophoneState(LOST, { Devices: LOST.Devices })).toBe(false);
    });
});
