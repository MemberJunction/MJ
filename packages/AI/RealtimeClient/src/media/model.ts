/**
 * @fileoverview Shared types for the `/media` entry point: the local devices and capture state that the
 * media controllers and the UI exchange.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

/** A kind of local device the user captures from. */
export type LocalMediaKind = 'camera' | 'microphone';

/** One input device. */
export interface MediaDevice {
    /** The browser's id for the device, stable for this site until the user clears its data. */
    DeviceID: string;
    Kind: LocalMediaKind;
    /** The device's name. Browsers leave it empty until the user has allowed this site that kind of device. */
    Label: string;
    /** Devices on the same physical product (a webcam's camera and microphone) share a group id. */
    GroupID: string;
}

/** Why a local device could not be used. */
export type LocalMediaFailure =
    /** The user, the operating system or the page's permissions policy refused access. */
    | 'denied'
    /** There is no device of that kind, or not the one asked for. */
    | 'not-found'
    /** The device exists, but another application is using it. */
    | 'in-use'
    /** The browser cannot capture at all (no `getUserMedia`). */
    | 'unsupported'
    /** Anything else; see the message. */
    | 'error';

/** One kind of local capture. */
export interface LocalTrackState {
    Status: 'off' | 'starting' | 'on' | 'failed';
    /** The device in use, while `on`. */
    DeviceID?: string;
    /** That device's name, while `on`. */
    Label?: string;
    /** Why capture failed, while `failed`. */
    Failure?: LocalMediaFailure;
    /** The browser's message for the failure. */
    Message?: string;
}

/** Everything captured locally, as the `LocalMediaController` reports it. */
export interface LocalMediaState {
    Camera: LocalTrackState;
    Microphone: LocalTrackState;
    /** The input devices the browser lists now. */
    Devices: MediaDevice[];
}

/** The outcome of starting or switching a local device. It always resolves; it never rejects. */
export type LocalMediaResult =
    | { Status: 'started'; Stream: MediaStream }
    | { Status: 'failed'; Reason: LocalMediaFailure; Message: string };
