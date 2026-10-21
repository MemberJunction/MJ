/**
 * @fileoverview The meeting room's notice for a device error: a microphone, camera, speaker or share that failed, or
 * that the browser refused. Its line says what the user asked for and, after a colon, the reason the browser, LiveKit or
 * the share picker gave, as the room's notice about what the agent sees does ("Couldn't change what the agent sees: …").
 * For a panel share where the user picked another surface, the reason is `/media`'s own hint, so the line reads
 * "Couldn't start sharing: To share only the panel, choose this tab in the browser's picker." A share picker the user
 * closed is no error, so nothing shows for it.
 *
 * @module @memberjunction/ng-mj-livekit-room
 */

import type { LiveKitErrorDevice, LiveKitRoomError } from '@memberjunction/livekit-room-core';

/** What the user asked of a device, or `'unknown'` when the room can't tell. */
type DeviceRequest = NonNullable<LiveKitErrorDevice['Change']> | 'unknown';

/** How the notice starts: what the user asked for, by device and request. */
const LEADS: Readonly<Record<LiveKitErrorDevice['Media'], Readonly<Record<DeviceRequest, string>>>> = {
  microphone: {
    on: "Couldn't turn on your microphone",
    off: "Couldn't turn off your microphone",
    switch: "Couldn't switch your microphone",
    unknown: "Couldn't use your microphone",
  },
  camera: {
    on: "Couldn't turn on your camera",
    off: "Couldn't turn off your camera",
    switch: "Couldn't switch your camera",
    unknown: "Couldn't use your camera",
  },
  screen: {
    on: "Couldn't start sharing",
    off: "Couldn't stop sharing",
    switch: "Couldn't share",
    unknown: "Couldn't share",
  },
  speaker: {
    on: "Couldn't turn on the sound",
    off: "Couldn't turn off the sound",
    switch: "Couldn't switch your speaker",
    unknown: "Couldn't play the sound",
  },
};

/** How the notice starts for a device error about no one device (listing the devices). */
const NO_DEVICE_LEAD = "Couldn't use your devices";

/**
 * The meeting room's notice line for a room error: for a `device` error, what the user asked for and the reason given,
 * or what they asked for alone when no reason was given; `null` for any other kind of error.
 *
 * @param error The error the room reported.
 * @returns The line, such as "Couldn't turn on your camera: Could not start video source", or `null`.
 */
export function DeviceErrorNoticeText(error: LiveKitRoomError): string | null {
  if (error.Kind !== 'device') {
    return null;
  }
  const lead = error.Device ? LEADS[error.Device.Media][error.Device.Change ?? 'unknown'] : NO_DEVICE_LEAD;
  const reason = reasonOf(error.Cause);
  return reason ? `${lead}: ${reason}` : `${lead}.`;
}

/** The reason an error's cause gives: an error's message, or the text the preview room passes; empty for anything else. */
function reasonOf(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message.trim();
  }
  return typeof cause === 'string' ? cause.trim() : '';
}
