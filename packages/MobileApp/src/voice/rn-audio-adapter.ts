/**
 * React Native audio adapter for `@memberjunction/ai-realtime-client`.
 *
 * The realtime client drivers keep ALL provider wire logic (transport, the response state
 * machine, transcript/tool routing, barge-in) platform-agnostic, and expose the **audio plane**
 * behind two overridable `protected` seams on each websocket driver:
 *
 *  - `createMicCapture(micStream, sampleRate, onPcmChunk)` → {@link IPcmMicCapture}
 *  - `createPlayback(sampleRate)` → {@link IRealtimePcmPlayback}
 *
 * The shipped implementations of those seams are built on the browser **Web Audio API**
 * (`AudioContext` + `AudioWorkletNode` for capture, `AudioBufferSourceNode` scheduling for
 * playback) — none of which exist under Hermes/React Native. This module provides the RN
 * halves and a thin driver subclass ({@link RNElevenLabsRealtimeClient}) that injects them,
 * so the RN work is a small adapter rather than a fork of the driver.
 *
 * ## ⚠️ THE `expo-audio` PCM / LATENCY CONSTRAINT (documented honestly)
 *
 * `expo-audio` (v1.x) is a **file-based** recorder/player: `AudioRecorder` records the mic to a
 * container file (`.m4a`/`.wav`) and `AudioPlayer` plays a finite `AudioSource` (a URI/asset).
 * It exposes **no API to receive raw PCM16 frames from the microphone as they are captured**, and
 * **no API to enqueue raw PCM16 buffers for gap-free playout**. A full-duplex realtime voice
 * session needs BOTH: sub-100 ms PCM16 mic frames streamed to the provider, and gapless PCM16
 * playback of the model's returned audio.
 *
 * Therefore true low-latency PCM streaming on RN requires a **native audio module** (e.g.
 * `react-native-audio-api`'s Web Audio implementation, or `@siteed/expo-audio-stream`) that can
 * (a) deliver mic PCM16 blocks via a callback and (b) schedule raw PCM16 chunks on an output
 * clock. This adapter is written against exactly that seam: when such a module is present it calls
 * {@link enableRealtimePcmAudio} at startup, {@link isRealtimePcmAudioSupported} flips `true`, and
 * the session runs; when it is absent (an `expo-audio`-only build) the capability reports `false`
 * and {@link RealtimeVoiceService} degrades gracefully to a clear "voice unavailable" state instead
 * of opening a session that could carry no audio.
 *
 * The `expo-audio` primitives we CAN use unconditionally are the microphone **permission** flow and
 * the **audio-session** configuration ({@link requestMicrophonePermission},
 * {@link configureVoiceAudioSession}) — those are wired here for real.
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeClient,
    ElevenLabsRealtimeClient,
    IPcmMicCapture,
    IRealtimePcmPlayback,
    LoadElevenLabsRealtimeClient,
} from '@memberjunction/ai-realtime-client';
import {
    getRecordingPermissionsAsync,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
} from 'expo-audio';

// ── Native-PCM capability seam ─────────────────────────────────────────────────

/**
 * Module-level flag toggled by {@link enableRealtimePcmAudio}. A native PCM-streaming module
 * calls the enabler at app startup; until then the flag stays `false` and the voice service
 * degrades gracefully (see the file header). Kept as a module variable (not a `globalThis`
 * probe) so it stays strongly typed with no casts.
 */
let pcmAudioSupported = false;

/**
 * Declares that a native module capable of low-latency PCM16 mic capture + gapless PCM16
 * playback is installed and wired into {@link RnPcmMicCapture} / {@link RnPcmPlayback}. Call
 * this once at startup from that module's init. Absent this call, {@link isRealtimePcmAudioSupported}
 * reports `false` and realtime voice degrades to an "unavailable" state rather than opening a
 * session that cannot carry audio.
 */
export function enableRealtimePcmAudio(): void {
    pcmAudioSupported = true;
}

/**
 * Whether this build can carry a real-time PCM16 voice session. `false` on an `expo-audio`-only
 * build (the file-based recorder/player cannot stream raw PCM — see the file header); `true` once
 * a native audio module has called {@link enableRealtimePcmAudio}.
 */
export function isRealtimePcmAudioSupported(): boolean {
    return pcmAudioSupported;
}

// ── Microphone permission + audio session (real `expo-audio` usage) ────────────

/**
 * Requests (or confirms) microphone permission via `expo-audio`. Returns `true` only when the
 * user has granted recording access. Checks the current grant first so an already-granted user is
 * never re-prompted. Never throws — any module error resolves to `false` (treated as "denied") so
 * the caller can surface a clear permission message instead of crashing.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
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
 * Puts the device audio session into a record-and-playback mode suitable for a live voice call:
 * recording enabled and audio audible even with the ringer on silent. Best-effort — a failure is
 * swallowed (the session can still proceed; iOS simply keeps its prior category).
 */
export async function configureVoiceAudioSession(): Promise<void> {
    try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch {
        /* non-fatal — keep the prior audio session category */
    }
}

/**
 * Reverts the audio session out of record mode at session end. Best-effort and never throws.
 */
export async function resetVoiceAudioSession(): Promise<void> {
    try {
        await setAudioModeAsync({ allowsRecording: false });
    } catch {
        /* non-fatal */
    }
}

// ── RN implementations of the driver audio seams ───────────────────────────────

/**
 * RN microphone-capture seam. On an `expo-audio`-only build this cannot emit PCM16 frames (see the
 * file header), so `onPcmChunk` is retained for the native-module path but never invoked here —
 * {@link isRealtimePcmAudioSupported} gates the session so this inert state is never reached in
 * production. When a native PCM module is wired in, its per-block callback is forwarded to
 * `onPcmChunk` and {@link Stop} releases the native capture graph.
 */
export class RnPcmMicCapture implements IPcmMicCapture {
    /** Retained for the native-module capture path; unused on an `expo-audio`-only build. */
    private readonly onPcmChunk: (base64Pcm16: string) => void;
    private readonly sampleRate: number;

    /**
     * @param sampleRate The PCM16 capture rate (Hz) negotiated by the driver at session start.
     * @param onPcmChunk Invoked with each captured PCM16 block as base64 (native path only).
     */
    constructor(sampleRate: number, onPcmChunk: (base64Pcm16: string) => void) {
        this.sampleRate = sampleRate;
        this.onPcmChunk = onPcmChunk;
    }

    /** The negotiated capture rate — surfaced for a native module that binds to this instance. */
    public get SampleRate(): number {
        return this.sampleRate;
    }

    /** Callback a native capture module forwards mic PCM16 blocks to (base64). */
    public get OnPcmChunk(): (base64Pcm16: string) => void {
        return this.onPcmChunk;
    }

    /** Releases capture resources. No-op on the `expo-audio`-only build (nothing was opened). */
    public Stop(): void {
        /* native capture graph teardown lands here when a PCM module is wired in */
    }
}

/**
 * RN playout seam. On an `expo-audio`-only build there is no primitive to schedule raw PCM16
 * chunks gaplessly (see the file header), so enqueued chunks are counted for an honest
 * {@link IsPlaying} but not rendered to the speaker — {@link isRealtimePcmAudioSupported} gates the
 * session so this inert state is never reached in production. A native module replaces the counting
 * with a real output-clock scheduler.
 */
export class RnPcmPlayback implements IRealtimePcmPlayback {
    private readonly sampleRate: number;
    /** Chunks accepted since the last {@link Flush} — drives the honest {@link IsPlaying} read. */
    private queuedChunks = 0;

    /** @param sampleRate The PCM16 playout rate (Hz) negotiated by the driver at session start. */
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /** The negotiated playout rate — surfaced for a native module that binds to this instance. */
    public get SampleRate(): number {
        return this.sampleRate;
    }

    /** Accepts a PCM16 chunk. Counted for {@link IsPlaying}; rendered by the native module path. */
    public Enqueue(_pcm16: ArrayBuffer): void {
        this.queuedChunks++;
    }

    /** Drops all pending audio (barge-in / interruption). */
    public Flush(): void {
        this.queuedChunks = 0;
    }

    /** `true` while chunks are pending playout. */
    public get IsPlaying(): boolean {
        return this.queuedChunks > 0;
    }

    /** Releases playout resources and clears the queue. */
    public Close(): void {
        this.queuedChunks = 0;
    }
}

// ── Silent input stream shim ───────────────────────────────────────────────────

/**
 * The realtime driver's `Connect(config, micStream)` requires a browser `MediaStream`, which does
 * not exist under Hermes. The ElevenLabs driver only ever calls `getAudioTracks()` / `getTracks()`
 * on it (to build an optional audio meter and to stop tracks on disconnect), so a minimal
 * empty-track object satisfies the driver's real usage. A native PCM module would instead supply a
 * genuine stream here. The single cast is confined to this platform-boundary helper.
 *
 * @returns A `MediaStream`-typed shim exposing empty track lists.
 */
export function acquireVoiceInputStream(): MediaStream {
    const shim: Pick<MediaStream, 'getTracks' | 'getAudioTracks' | 'getVideoTracks'> = {
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [],
    };
    // Platform boundary: RN has no `MediaStream`; the driver only invokes the three methods above.
    return shim as unknown as MediaStream;
}

// ── RN ElevenLabs driver (injects the seams above) ─────────────────────────────

/**
 * React Native ElevenLabs realtime driver: the stock {@link ElevenLabsRealtimeClient} with its two
 * Web-Audio seams replaced by the RN implementations above. Registered under the ClassFactory key
 * `'elevenlabs'` at a HIGHER priority than the base driver (auto-incremented — last registration
 * wins), so {@link RealtimeVoiceService}'s provider-agnostic `ClassFactory.CreateInstance(...,
 * 'elevenlabs')` resolves THIS variant under Hermes exactly as the Angular host resolves the base
 * driver in the browser.
 *
 * ElevenLabs is the RN-simplest provider by design: a raw WebSocket (Hermes has a global
 * `WebSocket`) against a server-minted signed URL, PCM both ways, no WebRTC / `RTCPeerConnection`.
 */
@RegisterClass(BaseRealtimeClient, 'elevenlabs')
export class RNElevenLabsRealtimeClient extends ElevenLabsRealtimeClient {
    /** @inheritdoc — RN mic-capture seam (see {@link RnPcmMicCapture}). */
    protected override async createMicCapture(
        _micStream: MediaStream,
        sampleRate: number,
        onPcmChunk: (base64Pcm16: string) => void,
    ): Promise<IPcmMicCapture> {
        return new RnPcmMicCapture(sampleRate, onPcmChunk);
    }

    /** @inheritdoc — RN playout seam (see {@link RnPcmPlayback}). */
    protected override createPlayback(sampleRate: number): IRealtimePcmPlayback {
        return new RnPcmPlayback(sampleRate);
    }
}

/**
 * Tree-shaking prevention: the RN ElevenLabs driver is resolved dynamically through the
 * ClassFactory (by the server-reported provider key), so bundlers cannot see it is used. Calling
 * this no-op from a static code path keeps the `@RegisterClass` side effects of BOTH the RN
 * subclass and its base alive.
 */
export function LoadRNVoiceDrivers(): void {
    LoadElevenLabsRealtimeClient();
}
