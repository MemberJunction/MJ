import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

/**
 * @fileoverview Microphone permission and audio-session control for React Native voice calls.
 *
 * These are the two things a realtime session needs from the platform that the shared runtime
 * cannot do itself, and they are exactly what {@link ../voice/rn-media-host.RNRealtimeMediaHost}
 * calls. They live in their own module because they are ordinary device concerns with nothing to
 * do with any provider: the same three functions would serve a video call or a voice memo.
 *
 * ## Why there is no PCM audio plane here
 *
 * MJ's realtime drivers come in two shapes. The WebRTC providers (GPT-Live, GPT Realtime) carry
 * media on the peer connection, and `react-native-webrtc` gives the platform's echo cancellation,
 * noise suppression and jitter buffering for free — that is the path this app uses, and it needs
 * nothing from this file beyond the audio session. The websocket providers (Gemini Live, Grok
 * Voice, ElevenLabs Agents, AssemblyAI) instead own their audio plane: they stream PCM16 frames up
 * and schedule PCM16 chunks down, through `createMicCapture` / `createPlayback` seams on the
 * driver.
 *
 * Those seams cannot be satisfied on an Expo build. `expo-audio` is file-based — `AudioRecorder`
 * records to a container file and `AudioPlayer` plays a finite source — with no API to receive raw
 * mic PCM16 as it is captured, and none to enqueue raw PCM16 for gapless playout. Satisfying them
 * needs a native audio module (`react-native-audio-api`, `@siteed/expo-audio-stream`).
 *
 * So this build declines those providers up front rather than shipping inert implementations of
 * their seams: `SupportedRealtimeProviders` in `rn-realtime-driver.ts` lists only the WebRTC keys,
 * and the session runtime's `hostCanUseProvider` gate turns a resolved-but-unusable provider into a
 * sentence the user can act on. An implementation that accepts frames and drops them would be
 * worse than no implementation — it connects, bills, and is silent in both directions.
 */

/**
 * Requests (or confirms) microphone permission.
 *
 * Checks the current grant first so an already-granted user is never re-prompted, and honours
 * `canAskAgain` so a permanently-denied user is not sent into a prompt the OS will not show.
 *
 * @returns `true` only when recording access is granted. Never throws — a module error resolves to
 *          `false` so the caller can surface a permission message rather than a crash.
 */
export async function RequestMicrophonePermission(): Promise<boolean> {
    try {
        const current = await getRecordingPermissionsAsync();
        if (current.granted) {
            return true;
        }
        if (!current.canAskAgain) {
            return false;
        }
        const requested = await requestRecordingPermissionsAsync();
        return requested.granted;
    } catch {
        return false;
    }
}

/**
 * Puts the device audio session into record-and-playback mode for a live call: recording enabled,
 * and audio audible even with the ringer on silent.
 *
 * Must run **before** capture starts — configuring afterwards leaves the first seconds of a call on
 * the wrong route with the wrong echo handling. Best-effort: a failure keeps the prior category,
 * which is worse-sounding but still a working call.
 */
export async function ConfigureVoiceAudioSession(): Promise<void> {
    try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch {
        /* non-fatal — keep the prior audio session category */
    }
}

/**
 * Takes the audio session back out of record mode when a call ends.
 *
 * The paired half of {@link ConfigureVoiceAudioSession}, and not optional: the category is
 * process-wide and outlives the call, so skipping this leaves every later sound the app plays on
 * the call route at call volume. Best-effort and never throws.
 */
export async function ResetVoiceAudioSession(): Promise<void> {
    try {
        await setAudioModeAsync({ allowsRecording: false });
    } catch {
        /* non-fatal */
    }
}
