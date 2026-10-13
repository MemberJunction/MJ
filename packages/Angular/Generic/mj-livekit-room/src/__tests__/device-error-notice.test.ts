import { describe, expect, it } from 'vitest';
import type { LiveKitErrorDevice, LiveKitRoomError } from '@memberjunction/livekit-room-core';
import { DeviceErrorNoticeText } from '../lib/device-error-notice';

/** A device error about `device`, with `cause`, and the message the controller gives it (which the notice never shows). */
function deviceError(device: LiveKitErrorDevice | undefined, cause?: unknown): LiveKitRoomError {
  return { Kind: 'device', Message: 'Failed to enable something.', Cause: cause, ...(device ? { Device: device } : {}) };
}

describe('DeviceErrorNoticeText', () => {
  it("words a refused panel share with the share picker's hint, as the call does", () => {
    const refused = new Error("To share only the panel, choose this tab in the browser's picker.");
    expect(DeviceErrorNoticeText(deviceError({ Media: 'screen', Change: 'on' }, refused))).toBe(
      "Couldn't start sharing: To share only the panel, choose this tab in the browser's picker."
    );
  });

  it('says what the user asked of which device, then the reason given', () => {
    const cases: Array<[LiveKitErrorDevice, string]> = [
      [{ Media: 'microphone', Change: 'on' }, "Couldn't turn on your microphone"],
      [{ Media: 'microphone', Change: 'off' }, "Couldn't turn off your microphone"],
      [{ Media: 'microphone', Change: 'switch' }, "Couldn't switch your microphone"],
      [{ Media: 'microphone' }, "Couldn't use your microphone"],
      [{ Media: 'camera', Change: 'on' }, "Couldn't turn on your camera"],
      [{ Media: 'camera', Change: 'off' }, "Couldn't turn off your camera"],
      [{ Media: 'camera', Change: 'switch' }, "Couldn't switch your camera"],
      [{ Media: 'camera' }, "Couldn't use your camera"],
      [{ Media: 'screen', Change: 'on' }, "Couldn't start sharing"],
      [{ Media: 'screen', Change: 'off' }, "Couldn't stop sharing"],
      [{ Media: 'screen' }, "Couldn't share"],
      [{ Media: 'speaker', Change: 'on' }, "Couldn't turn on the sound"],
      [{ Media: 'speaker', Change: 'switch' }, "Couldn't switch your speaker"],
      [{ Media: 'speaker' }, "Couldn't play the sound"],
    ];
    for (const [device, lead] of cases) {
      expect(DeviceErrorNoticeText(deviceError(device, new Error('Could not start video source'))), JSON.stringify(device)).toBe(
        `${lead}: Could not start video source`
      );
    }
  });

  it('takes the reason from a text cause too, as the preview room gives it', () => {
    expect(DeviceErrorNoticeText(deviceError({ Media: 'camera', Change: 'on' }, ' Not allowed. '))).toBe("Couldn't turn on your camera: Not allowed.");
  });

  it('says what the user asked for alone when no reason was given', () => {
    expect(DeviceErrorNoticeText(deviceError({ Media: 'screen', Change: 'on' }))).toBe("Couldn't start sharing.");
    expect(DeviceErrorNoticeText(deviceError({ Media: 'camera', Change: 'on' }, new Error('  ')))).toBe("Couldn't turn on your camera.");
    expect(DeviceErrorNoticeText(deviceError({ Media: 'microphone', Change: 'on' }, { code: 7 }))).toBe("Couldn't turn on your microphone.");
  });

  it('words a device error about no one device', () => {
    expect(DeviceErrorNoticeText(deviceError(undefined, new Error('Device lost')))).toBe("Couldn't use your devices: Device lost");
  });

  it('has no line for any other kind of error', () => {
    for (const kind of ['connect', 'publish', 'data', 'disconnect', 'agent-vision', 'unknown'] as const) {
      expect(DeviceErrorNoticeText({ Kind: kind, Message: 'Something failed.', Cause: new Error('why') }), kind).toBeNull();
    }
  });
});
