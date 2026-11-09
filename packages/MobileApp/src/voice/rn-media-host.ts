import { mediaDevices } from 'react-native-webrtc';
import type { IRealtimeMediaHost } from '@memberjunction/realtime-runtime';
import { RequestMicrophonePermission, ConfigureVoiceAudioSession, ResetVoiceAudioSession } from './rn-audio-adapter';

/**
 * @fileoverview React Native's implementation of the realtime runtime's media seam.
 *
 * The realtime session runtime — mint, driver resolution, transcripts, tool relay, delegation
 * narration, channel lifecycle, teardown — is shared with MJ Explorer and knows nothing about any
 * platform. It asks a host for exactly one thing it cannot provide itself: a microphone.
 *
 * That split is not arbitrary. Microphone permission is a product decision that differs per
 * platform — a browser shows a URL-bar prompt, iOS shows a system sheet gated on an `Info.plist`
 * usage string, Android runs the runtime-permission flow — and the audio *session* has to be
 * configured for voice chat before capture begins or the route and echo behaviour are wrong.
 */

/**
 * Supplies the microphone for a realtime session on iOS and Android.
 *
 * Recording is deliberately not implemented: {@link IRealtimeMediaHost.CreateRecorder} is optional,
 * and returning nothing is a fully supported configuration rather than a degraded one. Session
 * recording is consent-gated, and the runtime's session clock is anchored independently of the
 * recorder precisely so unrecorded calls still produce correct per-turn timings.
 */
export class RNRealtimeMediaHost implements IRealtimeMediaHost {
    /**
     * Requests microphone access and prepares the audio session for a voice call.
     *
     * Ordering matters: the audio session is configured for voice chat **before** capture starts,
     * so the platform applies the right category, route and echo handling from the first frame.
     * Configuring afterwards produces a call whose first seconds sound wrong.
     *
     * Once permission is granted, this host counts as one open call on the shared audio session
     * until {@link ReleaseMicrophone}, however many times the runtime asks. Give each runtime its
     * own host, as `MobileVoiceSession` does: a host shared by two runtimes would count their calls
     * as one.
     *
     * @throws when permission is denied or no input device is available. The runtime treats a throw
     *         as a failed session start and tears down cleanly, so there is no need to pre-check.
     */
    public async AcquireMicrophone(): Promise<MediaStream> {
        const granted = await RequestMicrophonePermission();
        if (!granted) {
            throw new Error('Microphone permission was not granted.');
        }

        await ConfigureVoiceAudioSession(this);

        const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
        if (!stream) {
            throw new Error('No microphone is available on this device.');
        }
        return stream as unknown as MediaStream;
    }

    /**
     * Closes this host's call on the shared audio session, which returns to its normal,
     * non-recording configuration when no other call is open.
     *
     * {@link AcquireMicrophone} puts iOS into a record-and-play category with the speaker route so
     * the call sounds right. That setting is process-wide and outlives the call: without this,
     * every later sound the app plays — a notification, a video in a chat attachment — goes out on
     * the call route at call volume for the rest of the app's lifetime.
     *
     * A call abandoned while its microphone was opening releases once the opening returns, which
     * can be after the user has started a newer call on another runtime; that release leaves the
     * newer call in the call category. A host whose permission was refused opened no call, and its
     * release does nothing.
     */
    public async ReleaseMicrophone(): Promise<void> {
        await ResetVoiceAudioSession(this);
    }
}
