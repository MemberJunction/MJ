import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the call audio category, which every voice call in the app shares (#5421).
 *
 * iOS has one audio session per process, but each run of the voice screen makes its own realtime
 * runtime and media host, and each host releases the microphone on its own. A call abandoned while
 * its microphone was opening can release after a newer call has opened. These tests drive the
 * audio adapter, and the host on top of it, in the orders overlapping calls produce, and assert
 * what reaches `setAudioModeAsync`: the category goes back to normal only when the last open call
 * releases it.
 */
const device = vi.hoisted(() => ({
    /** Every mode handed to `setAudioModeAsync`, in order. */
    modes: [] as unknown[],
    permissionGranted: true,
    /** What `getUserMedia` resolves to; `null` is a device with no microphone. */
    stream: {} as unknown,
    /** When true, `getUserMedia` waits until the test resolves the opening it parks in `heldOpenings`. */
    holdMicrophone: false,
    heldOpenings: [] as Array<() => void>,
}));

vi.mock('expo-audio', () => ({
    getRecordingPermissionsAsync: async () => ({ granted: device.permissionGranted, canAskAgain: false }),
    requestRecordingPermissionsAsync: async () => ({ granted: device.permissionGranted }),
    setAudioModeAsync: async (mode: unknown) => {
        device.modes.push(mode);
    },
}));

vi.mock('react-native-webrtc', () => ({
    mediaDevices: {
        getUserMedia: () =>
            device.holdMicrophone
                ? new Promise((resolve) => device.heldOpenings.push(() => resolve(device.stream)))
                : Promise.resolve(device.stream),
    },
}));

/** The mode a call puts the session into. */
const CALL = { allowsRecording: true, playsInSilentMode: true };
/** The mode the session goes back to when no call is open. */
const NORMAL = { allowsRecording: false };

let adapter: typeof import('@/voice/rn-audio-adapter');
let hosts: typeof import('@/voice/rn-media-host');

beforeEach(async () => {
    device.modes = [];
    device.permissionGranted = true;
    device.stream = {};
    device.holdMicrophone = false;
    device.heldOpenings = [];
    // The open calls are module state, as the audio session is process state: a fresh module per
    // test starts every test with no call open.
    vi.resetModules();
    adapter = await import('@/voice/rn-audio-adapter');
    hosts = await import('@/voice/rn-media-host');
});

describe('voice audio session shared by every call', () => {
    it('puts the session into the call category, and back when the call releases it', async () => {
        const call = {};
        await adapter.ConfigureVoiceAudioSession(call);
        await adapter.ResetVoiceAudioSession(call);
        expect(device.modes).toEqual([CALL, NORMAL]);
    });

    it('keeps the call category when one of two overlapping calls releases it', async () => {
        const first = {};
        const second = {};
        await adapter.ConfigureVoiceAudioSession(first);
        await adapter.ConfigureVoiceAudioSession(second);
        await adapter.ResetVoiceAudioSession(first);
        expect(device.modes).toEqual([CALL, CALL]);
    });

    it('resets the category when the second of two overlapping calls releases it', async () => {
        const first = {};
        const second = {};
        await adapter.ConfigureVoiceAudioSession(first);
        await adapter.ConfigureVoiceAudioSession(second);
        await adapter.ResetVoiceAudioSession(first);
        await adapter.ResetVoiceAudioSession(second);
        expect(device.modes).toEqual([CALL, CALL, NORMAL]);
    });

    it('does nothing on a release with nothing open', async () => {
        await adapter.ResetVoiceAudioSession({});
        expect(device.modes).toEqual([]);
    });

    it('counts a call once however many times it releases', async () => {
        // A second release from the same call must not close the other call's count.
        const first = {};
        const second = {};
        await adapter.ConfigureVoiceAudioSession(first);
        await adapter.ConfigureVoiceAudioSession(second);
        await adapter.ResetVoiceAudioSession(first);
        await adapter.ResetVoiceAudioSession(first);
        expect(device.modes).toEqual([CALL, CALL]);
        await adapter.ResetVoiceAudioSession(second);
        expect(device.modes).toEqual([CALL, CALL, NORMAL]);
    });

    it('counts a call once however many times it configures', async () => {
        // The runtime can open the microphone twice for one call and release once: a start ended
        // while its microphone opened, then a newer start on the same runtime.
        const call = {};
        await adapter.ConfigureVoiceAudioSession(call);
        await adapter.ConfigureVoiceAudioSession(call);
        await adapter.ResetVoiceAudioSession(call);
        expect(device.modes).toEqual([CALL, CALL, NORMAL]);
    });
});

describe('RNRealtimeMediaHost calls that overlap', () => {
    it("keeps a newer call in the call category when an abandoned call's opening returns after it", async () => {
        const abandoned = new hosts.RNRealtimeMediaHost();
        const newer = new hosts.RNRealtimeMediaHost();

        // The abandoned call has set the category and is still waiting for the microphone.
        device.holdMicrophone = true;
        const abandonedOpening = abandoned.AcquireMicrophone();
        await vi.waitFor(() => expect(device.heldOpenings).toHaveLength(1));

        // The user is in a newer call, on its own runtime and host, before that opening returns.
        device.holdMicrophone = false;
        await newer.AcquireMicrophone();

        // The abandoned opening returns, and its runtime releases it.
        device.heldOpenings[0]();
        await abandonedOpening;
        await abandoned.ReleaseMicrophone();
        expect(device.modes).toEqual([CALL, CALL]);

        await newer.ReleaseMicrophone();
        expect(device.modes).toEqual([CALL, CALL, NORMAL]);
    });

    it('releases nothing for a call whose microphone permission was refused', async () => {
        // The runtime releases a failed opening too. This one never set the category, so its
        // release must not count against the call that did.
        const open = new hosts.RNRealtimeMediaHost();
        await open.AcquireMicrophone();

        device.permissionGranted = false;
        const refused = new hosts.RNRealtimeMediaHost();
        await expect(refused.AcquireMicrophone()).rejects.toThrow(/permission/i);
        await refused.ReleaseMicrophone();
        expect(device.modes).toEqual([CALL]);

        await open.ReleaseMicrophone();
        expect(device.modes).toEqual([CALL, NORMAL]);
    });

    it('resets the category for a call whose microphone failed after the category was set', async () => {
        // The category is set before the microphone opens. The runtime's release of the failed
        // opening is what puts it back.
        device.stream = null;
        const host = new hosts.RNRealtimeMediaHost();
        await expect(host.AcquireMicrophone()).rejects.toThrow(/no microphone/i);
        await host.ReleaseMicrophone();
        expect(device.modes).toEqual([CALL, NORMAL]);
    });
});
