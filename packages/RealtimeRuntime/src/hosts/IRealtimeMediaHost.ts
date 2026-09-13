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
 * Mirrors the browser recorder's existing surface so the runtime's call sites are unchanged by the
 * extraction. Every method is best-effort by contract: a recorder that fails mid-session must
 * degrade to "no recording" rather than failing the call, because audio capture is never worth
 * dropping a live conversation over.
 */
export interface IRealtimeSessionRecorder {
    /** `false` when capture could not start (unsupported platform, no permission). */
    readonly IsRecording: boolean;

    /** Capture sample rate, used to label the header-less PCM16 crash-recovery shards. */
    readonly SampleRate: number;

    /**
     * Container MIME type of the FINAL consolidated recording.
     *
     * Read it BEFORE {@link StopAndEncode} — implementations are permitted to clear it on stop,
     * which is why the runtime captures it first.
     */
    readonly MimeType: string;

    /**
     * Begins capture of the microphone, mixing in the agent's audio when it is already available.
     *
     * `remoteStream` is usually `null` here: on WebRTC the agent's track commonly lands slightly
     * after the connection resolves, so the runtime also wires {@link AttachRemoteStream}.
     */
    Start(micStream: MediaStream, remoteStream: MediaStream | null): void;

    /** Mixes the agent's audio in once its track arrives, so the recording carries both sides. */
    AttachRemoteStream(stream: MediaStream): void;

    /** Milliseconds into the recording, used to stamp per-turn cue offsets into a seekable file. */
    NowOffsetMs(): number;

    /** Waveform peaks computed during capture; survives {@link StopAndEncode}. */
    GetPeaks(): number[];

    /**
     * Returns audio captured since the previous snapshot, **already base64-encoded**, or `null`
     * when nothing new is pending.
     *
     * Encoding lives behind this seam deliberately: browsers reach for `Blob` + `FileReader`,
     * React Native reads a file off disk, and a test harness may hold bytes in memory. The runtime
     * only forwards the string to the server, so it should never learn which of those it is.
     *
     * Shards are header-less raw little-endian PCM16 — recovery is concatenate-in-order then
     * WAV-wrap. The canonical seekable file is the consolidated {@link StopAndEncode} upload.
     */
    SnapshotNewSegmentBase64(): Promise<string | null>;

    /**
     * Stops capture and returns the consolidated recording **already base64-encoded**, or `null`
     * when nothing was captured. Idempotent.
     */
    StopAndEncode(): Promise<string | null>;
}
