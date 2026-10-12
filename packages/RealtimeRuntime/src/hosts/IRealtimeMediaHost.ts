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
 * - **Browser** — `getUserMedia({ audio: true })` and the global `RTCPeerConnection`.
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
     * Called by the runtime on teardown, after the microphone tracks are stopped, on every exit
     * path including a failed start. Best-effort: a rejection is logged and swallowed, because
     * restoring audio state is never worth failing the end of a call over.
     */
    ReleaseMicrophone?(): Promise<void> | void;

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

