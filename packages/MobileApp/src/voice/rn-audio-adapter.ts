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
 *
 * ## One audio session, many calls
 *
 * The audio session is process-wide, but each run of the voice screen makes its own realtime
 * runtime and media host, and each releases the microphone on its own. So
 * {@link ConfigureVoiceAudioSession} and {@link ResetVoiceAudioSession} count the open calls, and
 * the session goes back to normal only when the last one releases it.
 */

/**
 * The calls that have put the audio session into the call category and not released it yet.
 *
 * A call abandoned while its microphone was opening releases once the opening returns, which can be
 * after a newer call has opened (#5421); resetting then would take the newer call off its route in
 * the middle of the call. Calls are counted by identity rather than by a number, so a call counts
 * once however many times it configures or releases, and a release from a call that never
 * configured (its microphone permission was refused) counts for nothing.
 */
const openCalls = new Set<object>();

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
 *
 * Counts `call` as open until {@link ResetVoiceAudioSession} releases it, also when the mode change
 * fails, so the session stays in the call category while any call is open.
 *
 * @param call Identifies the call: pass the same object to {@link ResetVoiceAudioSession}. The
 *        media host passes itself. A call that configures again is still one open call.
 */
export async function ConfigureVoiceAudioSession(call: object): Promise<void> {
    // Counted before the mode changes, so a release that runs meanwhile sees this call open.
    openCalls.add(call);
    try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch {
        /* non-fatal — keep the prior audio session category */
    }
}

/**
 * Takes the audio session back out of record mode when the last open call ends.
 *
 * The paired half of {@link ConfigureVoiceAudioSession}, and not optional: the category is
 * process-wide and outlives the call, so skipping this leaves every later sound the app plays on
 * the call route at call volume. It changes the session only when `call` is the last open call,
 * since resetting while another call is open takes that call off its route. A release from a call
 * that is not open does nothing. Best-effort and never throws.
 *
 * @param call The object the call passed to {@link ConfigureVoiceAudioSession}.
 */
export async function ResetVoiceAudioSession(call: object): Promise<void> {
    if (!openCalls.delete(call) || openCalls.size > 0) {
        return;
    }
    try {
        await setAudioModeAsync({ allowsRecording: false });
    } catch {
        /* non-fatal */
    }
}
