/**
 * Unit tests for the realtime voice adapter + orchestration service.
 *
 * `expo-audio` is a native module, so it is mocked. Tests exercise the pure logic: the RN
 * audio-seam implementations, the native-PCM capability flag, and — most importantly — that the
 * service DEGRADES GRACEFULLY (emits an `'unavailable'` state, never throws, never hits the
 * network) when the build has no native PCM audio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestRecordingPermissionsAsync = vi.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' }));
const getRecordingPermissionsAsync = vi.fn(async () => ({ granted: false, canAskAgain: true, status: 'undetermined' }));
const setAudioModeAsync = vi.fn(async () => undefined);

vi.mock('expo-audio', () => ({
    requestRecordingPermissionsAsync: () => requestRecordingPermissionsAsync(),
    getRecordingPermissionsAsync: () => getRecordingPermissionsAsync(),
    setAudioModeAsync: (mode: unknown) => setAudioModeAsync(),
}));

import {
    RnPcmMicCapture,
    RnPcmPlayback,
    acquireVoiceInputStream,
    isRealtimePcmAudioSupported,
    enableRealtimePcmAudio,
    requestMicrophonePermission,
} from '@/voice/rn-audio-adapter';
import { RealtimeVoiceService, type VoiceServiceEvent } from '@/voice/realtime-voice-service';

describe('rn-audio-adapter', () => {
    beforeEach(() => {
        requestRecordingPermissionsAsync.mockClear();
        getRecordingPermissionsAsync.mockClear();
    });

    describe('RnPcmPlayback', () => {
        it('tracks IsPlaying across enqueue / flush / close', () => {
            const playback = new RnPcmPlayback(16000);
            expect(playback.SampleRate).toBe(16000);
            expect(playback.IsPlaying).toBe(false);
            playback.Enqueue(new ArrayBuffer(8));
            expect(playback.IsPlaying).toBe(true);
            playback.Flush();
            expect(playback.IsPlaying).toBe(false);
            playback.Enqueue(new ArrayBuffer(8));
            playback.Close();
            expect(playback.IsPlaying).toBe(false);
        });
    });

    describe('RnPcmMicCapture', () => {
        it('exposes its rate + chunk callback and stops without throwing', () => {
            const onChunk = vi.fn();
            const capture = new RnPcmMicCapture(24000, onChunk);
            expect(capture.SampleRate).toBe(24000);
            expect(capture.OnPcmChunk).toBe(onChunk);
            expect(() => capture.Stop()).not.toThrow();
        });
    });

    describe('acquireVoiceInputStream', () => {
        it('returns a stream with empty track lists', () => {
            const stream = acquireVoiceInputStream();
            expect(stream.getAudioTracks()).toEqual([]);
            expect(stream.getTracks()).toEqual([]);
        });
    });

    describe('requestMicrophonePermission', () => {
        it('returns true when already granted (without prompting again)', async () => {
            getRecordingPermissionsAsync.mockResolvedValueOnce({ granted: true, canAskAgain: true, status: 'granted' });
            expect(await requestMicrophonePermission()).toBe(true);
            expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
        });

        it('prompts and returns the grant when not yet granted', async () => {
            expect(await requestMicrophonePermission()).toBe(true);
            expect(requestRecordingPermissionsAsync).toHaveBeenCalledOnce();
        });

        it('returns false (never throws) when the module errors', async () => {
            getRecordingPermissionsAsync.mockRejectedValueOnce(new Error('no module'));
            expect(await requestMicrophonePermission()).toBe(false);
        });
    });
});

describe('RealtimeVoiceService graceful degradation', () => {
    it('degrades to unavailable("audio") when no native PCM audio is present — no throw, no network', async () => {
        // Default build has no native PCM module.
        expect(isRealtimePcmAudioSupported()).toBe(false);

        const service = new RealtimeVoiceService();
        const events: VoiceServiceEvent[] = [];
        service.on((e) => events.push(e));

        await service.start({ TargetAgentID: 'agent-1', ConversationID: 'conv-1' });

        expect(service.State).toBe('unavailable');
        const stateEvents = events.filter((e): e is Extract<VoiceServiceEvent, { Type: 'state' }> => e.Type === 'state');
        const unavailable = stateEvents.find((e) => e.State === 'unavailable');
        expect(unavailable?.Reason).toBe('audio');
        // The audio gate is checked FIRST, so the mic permission flow was never reached.
        expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    });

    it('on() returns a working unsubscribe', () => {
        const service = new RealtimeVoiceService();
        const handler = vi.fn();
        const off = service.on(handler);
        off();
        // No live session, but stop() must be safe and not notify an unsubscribed handler.
        void service.stop();
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('enableRealtimePcmAudio', () => {
    it('flips the capability flag (native-module seam)', () => {
        enableRealtimePcmAudio();
        expect(isRealtimePcmAudioSupported()).toBe(true);
    });
});
