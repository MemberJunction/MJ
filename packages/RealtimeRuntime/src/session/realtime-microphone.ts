/**
 * @fileoverview The microphone of one realtime session, as a host's device menu shows it: the one the call uses, the
 * ones the user can move it to (`RealtimeSessionRuntime.SwitchMicrophone`), and why none works once the call lost it.
 *
 * The call opens the microphone through the host's camera-and-microphone controller, and the controller reports the
 * device in use and the devices the browser lists. This module reads the microphone's part of that report. It shows
 * nothing outside a call and nothing on a host without a controller, which opens the microphone itself
 * (`IRealtimeMediaHost.AcquireMicrophone`) and so has no list to offer.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { LocalMediaFailure, LocalMediaState, MediaDevice } from '@memberjunction/ai-realtime-client';

/** The call's microphone: the one in use, the ones the user can move it to, and why none works once the call lost it. */
export interface RealtimeMicrophoneState {
    /**
     * The microphone in use. Kept while a switch is under way, until the new one is on. Absent outside a call, on a host
     * without a controller, and when the controller has no microphone open (it stopped, or no device could open).
     */
    DeviceID?: string;
    /**
     * The microphones the browser lists while the call is connected: what `SwitchMicrophone` can move to. The call has
     * opened the microphone, so the browser gives their names. Empty outside a call and on a host without a controller.
     */
    Devices: readonly MediaDevice[];
    /**
     * Why no microphone works: the call lost its microphone (the one in use failed and so did the fallback to the default,
     * or the last one went away), so the agent hears nothing until the user picks one with `SwitchMicrophone`. Kept while
     * the picked one opens, and gone once a microphone is on. Absent while the microphone works or is being switched,
     * outside a call, and on a host without a controller.
     */
    Failure?: LocalMediaFailure;
}

/** No microphone to show or switch: what a host gets outside a call and on a host without a controller. */
export const REALTIME_MICROPHONE_NONE: RealtimeMicrophoneState = Object.freeze({ Devices: Object.freeze([]) });

/**
 * The call's microphone as a controller reports it. The device in use is the controller's while its microphone is on.
 * While the controller is starting a microphone (a switch, a lost device replaced by the default, or a pick after the call
 * lost its microphone), the call keeps what it shows now: the microphone in use, so a device menu keeps showing it until
 * the new one is on, or why none works. Failed, there is none, and the failure says why. Stopped, there is none.
 *
 * @param media The controller's state.
 * @param current What the call shows now.
 */
export function ReadMicrophoneState(media: LocalMediaState, current: RealtimeMicrophoneState = REALTIME_MICROPHONE_NONE): RealtimeMicrophoneState {
    const microphone = media.Microphone;
    const devices = media.Devices.filter((d) => d.Kind === 'microphone');
    switch (microphone.Status) {
        case 'on':
            return { ...(microphone.DeviceID ? { DeviceID: microphone.DeviceID } : {}), Devices: devices };
        case 'starting':
            return {
                ...(current.DeviceID ? { DeviceID: current.DeviceID } : {}),
                ...(current.Failure ? { Failure: current.Failure } : {}),
                Devices: devices,
            };
        case 'failed':
            return { Failure: microphone.Failure ?? 'error', Devices: devices };
        default:
            return { Devices: devices };
    }
}

/**
 * Whether two states name the same microphone in use, list the same microphones (by id and name, in the same order) and
 * give the same failure.
 */
export function SameMicrophoneState(a: RealtimeMicrophoneState, b: RealtimeMicrophoneState): boolean {
    return (
        a.DeviceID === b.DeviceID &&
        a.Failure === b.Failure &&
        a.Devices.length === b.Devices.length &&
        a.Devices.every((d, i) => d.DeviceID === b.Devices[i].DeviceID && d.Label === b.Devices[i].Label)
    );
}
