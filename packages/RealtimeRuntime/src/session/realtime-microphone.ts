/**
 * @fileoverview The microphone of one realtime session, as a host's device menu shows it: the one the call uses and the
 * ones the user can move it to (`RealtimeSessionRuntime.SwitchMicrophone`).
 *
 * The call opens the microphone through the host's camera-and-microphone controller, and the controller reports the
 * device in use and the devices the browser lists. This module reads the microphone's part of that report. It shows
 * nothing outside a call and nothing on a host without a controller, which opens the microphone itself
 * (`IRealtimeMediaHost.AcquireMicrophone`) and so has no list to offer.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { LocalMediaState, MediaDevice } from '@memberjunction/ai-realtime-client';

/** The call's microphone: the one in use and the ones the user can move it to. */
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
}

/** No microphone to show or switch: what a host gets outside a call and on a host without a controller. */
export const REALTIME_MICROPHONE_NONE: RealtimeMicrophoneState = Object.freeze({ Devices: Object.freeze([]) });

/**
 * The call's microphone as a controller reports it. The device in use is the controller's while its microphone is on.
 * While the controller is starting a microphone (a switch, or a lost device replaced by the default), it is `inUse`, the
 * one the call already names, so a device menu keeps showing it until the new one is on. Stopped or failed, there is none.
 *
 * @param media The controller's state.
 * @param inUse The microphone the call names now.
 */
export function ReadMicrophoneState(media: LocalMediaState, inUse?: string): RealtimeMicrophoneState {
    const microphone = media.Microphone;
    const deviceId = microphone.Status === 'on' ? microphone.DeviceID : microphone.Status === 'starting' ? inUse : undefined;
    return { ...(deviceId ? { DeviceID: deviceId } : {}), Devices: media.Devices.filter((d) => d.Kind === 'microphone') };
}

/** Whether two states name the same microphone in use and list the same microphones, by id and name, in the same order. */
export function SameMicrophoneState(a: RealtimeMicrophoneState, b: RealtimeMicrophoneState): boolean {
    return (
        a.DeviceID === b.DeviceID &&
        a.Devices.length === b.Devices.length &&
        a.Devices.every((d, i) => d.DeviceID === b.Devices[i].DeviceID && d.Label === b.Devices[i].Label)
    );
}
