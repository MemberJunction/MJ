/**
 * @fileoverview The media seam between the framework-agnostic realtime session runtime and
 * whatever platform is hosting it.
 *
 * ## Why this interface exists
 *
 * The realtime co-agent session orchestration — mint, driver resolution, transcript relay, tool
 * relay, delegation narration, channel lifecycle, usage relay, teardown — is pure TypeScript and
 * runs identically in a browser, in React Native, or in a Node test harness. Exactly **one** line
 * of it was not: microphone acquisition, which was hard-coded to
 * `navigator.mediaDevices.getUserMedia({ audio: true })`.
 *
 * That was never meant to live in the runtime. The Real-Time Co-Agents guide states the contract
 * plainly — *"the host acquires the mic (it owns the permission UX)"* — because microphone
 * permission is a **product** decision that differs per platform: a browser shows the URL-bar
 * prompt, iOS shows a system sheet gated on an `Info.plist` usage string, Android runs the
 * runtime-permission flow. The runtime has no business making that call; it only needs the
 * resulting stream. This interface makes that pre-existing contract explicit instead of implied.
 *
 * ## Implementations
 *
 * - **Browser** — a `LocalMediaController` (from `@memberjunction/ai-realtime-client/media`) that opens
 *   the microphone and follows device changes, and the global `RTCPeerConnection`.
 * - **React Native** — the `react-native-webrtc` equivalents, which polyfill both APIs natively
 *   and additionally give the platform's acoustic echo cancellation, noise suppression and jitter
 *   buffering for free.
 * - **Test harness** — a synthetic stream, so a session can be driven end to end with no hardware.
 *
 * ## A note on `MediaStream`
 *
 * `MediaStream` is referenced as a **type only**. It is erased at compile time, it is already in
 * this repo's base `lib` (`tsconfig.server.json`), and `react-native-webrtc` ships a conforming
 * implementation — so naming it here costs nothing and invents no parallel abstraction. The
 * runtime never *constructs* one; it only receives it from the host and hands it to the realtime
 * client driver, whose `Connect()` already takes exactly this type.
 */

import type { DisplayCaptureOptions, DisplayCaptureResult, FrameSamplerOptions, ILocalMediaController } from '@memberjunction/ai-realtime-client';

/**
 * The platform capabilities the realtime session runtime needs but cannot provide itself.
 *
 * Implement one of these per host. Every member is intentionally coarse — the runtime asks for an
 * outcome ("give me a microphone"), never for a mechanism ("call getUserMedia with these
 * constraints"), so hosts stay free to satisfy it however their platform requires.
 */
export interface IRealtimeMediaHost {
    /**
     * Acquires the user's microphone, prompting for permission if the platform requires it.
     *
     * The host owns the entire permission experience, including any pre-permission priming UI and
     * the decision about what to do when permission is permanently denied.
     *
     * @returns the live audio stream to hand to the realtime driver.
     * @throws if permission is denied or no input device is available. The runtime treats a throw
     *         as a failed session start and tears down cleanly — hosts do **not** need to
     *         pre-check permission to avoid a half-open session.
     */
    AcquireMicrophone(): Promise<MediaStream>;

    /**
     * OPTIONAL: returns the platform's audio state to what it was before
     * {@link AcquireMicrophone} changed it.
     *
     * Acquiring a microphone is not always a symmetric act. A browser hands back a stream and
     * nothing else changes, so most hosts omit this. iOS is the counter-example: a voice call
     * requires putting the shared audio session into a record-and-play category with the speaker
     * route, and that setting outlives the call — every later sound in the app plays through the
     * call route, at call volume, until something puts it back.
     *
     * Called by the runtime once each time it asks for the microphone (through
     * {@link AcquireMicrophone} or the session's controller), after the request returns, opened or
     * failed, and the microphone tracks are stopped: when the session ends, on every exit path
     * including a failed start, or, when the session ended while the request was pending, once the
     * request returns, so the call undoes what the request did. When a newer session has asked for
     * the microphone by then, that session's end makes the call instead. A session that ends before
     * asking for the microphone gets no call. Best-effort: a rejection is logged and swallowed,
     * because restoring audio state is never worth failing the end of a call over.
     */
    ReleaseMicrophone?(): Promise<void> | void;

    /**
     * OPTIONAL: creates a controller for the user's camera and microphone, once per session.
     *
     * When a host offers one, the runtime starts the microphone through it instead of
     * {@link AcquireMicrophone}. The call then follows a device switch and survives a lost device:
     * the controller swaps the new track into the same stream (falling back to the system default
     * when a device goes away), and the runtime moves the driver and the recorder onto it. The
     * runtime disposes the controller at teardown. Hosts without one keep {@link AcquireMicrophone}.
     */
    CreateLocalMediaController?(): ILocalMediaController;

    /**
     * OPTIONAL: asks the user for a screen, window or browser tab to share (or one panel of the page), for the
     * session's screen share. Always resolves: a cancelled picker or a refusal is a result.
     *
     * A browser host passes it to `RequestDisplayCapture` from `@memberjunction/ai-realtime-client/media`. A host
     * without it cannot share a screen; the runtime reports that instead of asking.
     */
    RequestDisplayCapture?(options?: DisplayCaptureOptions): Promise<DisplayCaptureResult>;

    /**
     * OPTIONAL: creates the sampler that takes still frames from a camera or a screen share for the agent: from `stream`,
     * at `options.Rate` frames per second (the rate the model's video track negotiated), each handed to `options.OnFrame`
     * as a base64 image. The runtime creates one per capture, starts it once the device or share is open, and stops it
     * when the capture stops; the stream's tracks belong to the capture, not the sampler.
     *
     * A host without it gets `FrameSampler` from `@memberjunction/ai-realtime-client/media`, which draws through a hidden
     * `<video>` and a `<canvas>`: what a browser host wants, so it can omit this. A host without a DOM (React Native, a
     * native shell, a test harness) supplies its own here. When the sampler cannot start (`Start()` returns `false`, as
     * the DOM default does without a DOM), the capture fails as `unsupported` and the agent is never told it can see it.
     */
    CreateFrameSampler?(stream: MediaStream, options: FrameSamplerOptions): IRealtimeFrameSampler;

    /**
     * OPTIONAL: creates a recorder for this session's audio, when the platform can record and the
     * user has consented.
     *
     * Returning `null` — or omitting the member entirely — disables recording for the session.
     * That is a fully supported configuration, not a degraded one: recording is consent-gated and
     * many hosts will never offer it. The runtime's session clock is anchored independently of the
     * recorder precisely so that unrecorded sessions still produce correct per-turn timings.
     *
     * The returned recorder is **unstarted** — the runtime calls {@link IRealtimeSessionRecorder.Start}
     * once it knows whether the agent's remote stream is already available.
     */
    CreateRecorder?(): IRealtimeSessionRecorder | null;
}

/**
 * A frame sampler a host supplies through {@link IRealtimeMediaHost.CreateFrameSampler}. `FrameSampler` from
 * `@memberjunction/ai-realtime-client/media` is one.
 */
export interface IRealtimeFrameSampler {
    /**
     * Starts taking frames.
     *
     * @returns `false` when the sampler cannot take frames on this platform; the runtime then fails the capture.
     */
    Start(): boolean;

    /** Stops taking frames and releases what the sampler holds. Never stops the stream's tracks. */
    Stop(): void;
}

/**
 * The recording capability a host may optionally provide.
 *
 * The host captures the call (mic + agent mix) at **48 kHz** and runs ONE continuous Opus encoder
 * for the whole call: mono, 32 kbps, 20 ms frames (960 samples). The runtime pulls the encoded
 * packets every few seconds, cuts them into indexed `MJOPUS1` shards, keeps each one in a durable
 * local store until the server acknowledges it, and sends a terminal request when the call ends.
 * The host never builds a container (no WAV, no Ogg) and never base64-encodes anything: the server
 * assembles the final `recording.wav` from the shards.
 *
 * Every method is best-effort by contract: a recorder that fails mid-session must degrade to
 * "no recording" rather than failing the call, because audio capture is never worth dropping a live
 * conversation over.
 */
export interface IRealtimeSessionRecorder {
    /** `false` when capture could not start (unsupported platform, no permission, no encoder). */
    readonly IsRecording: boolean;

    /**
     * Begins capture of the microphone, mixing in the agent's audio when it is already available.
     *
     * `remoteStream` is usually `null` here: on WebRTC the agent's track commonly lands slightly
     * after the connection resolves, so the runtime also wires {@link AttachRemoteStream}.
     */
    Start(micStream: MediaStream, remoteStream: MediaStream | null): void;

    /** Mixes the agent's audio in once its track arrives, so the recording carries both sides. */
    AttachRemoteStream(stream: MediaStream): void;

    /**
     * OPTIONAL: records the microphone stream's current track from now on, after its track was
     * replaced (a device switch, or a lost device replaced by the default). A recorder bound to the
     * old track would otherwise record silence. A recorder without it keeps its original binding.
     */
    ReplaceMicrophone?(micStream: MediaStream): void;

    /**
     * Milliseconds into the recording, derived from the samples captured so far on the 48 kHz
     * sample clock (never wall clock), used to stamp per-turn cue offsets into the assembled file.
     */
    NowOffsetMs(): number;

    /**
     * Returns the 20 ms Opus packets encoded since the previous call, in capture order, and forgets
     * them; an empty array when none are ready. Synchronous and cheap: it hands over what the
     * encoder already produced and never encodes on the caller's thread — the runtime calls it from
     * `pagehide`, where there is no time to wait for an encoder.
     */
    TakeEncodedPackets(): Uint8Array[];

    /**
     * Stops capture, flushes the encoder (its last packets become available to
     * {@link TakeEncodedPackets}), and resolves the total number of samples captured at 48 kHz. That
     * count may be less than `packets × 960` when the encoder padded its last frame; the runtime
     * trims the final shard to it. Idempotent: a second call resolves the same count.
     */
    Stop(): Promise<number>;
}

