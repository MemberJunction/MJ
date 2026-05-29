/**
 * Pipecat-style typed frame bus — every signal moving through the runtime
 * (audio, video, transcript, control, tool-call) is a typed frame on one bus.
 *
 * `AudioFrame` is re-imported from `@memberjunction/ai` — single source of truth.
 * `VideoFrame`, `TranscriptFrame`, `ControlEvent`, and `ToolCallFrame` are defined
 * here because they only become meaningful inside the channel runtime.
 *
 * NOTE on discrimination: `AudioFrame` and `VideoFrame` are raw media containers
 * without their own discriminator field, so the top-level `Frame` union is
 * defined as a wrapper `{ Kind; Payload }` rather than tagging the payload
 * types themselves. Wrapping (rather than mutating the imported `AudioFrame`)
 * keeps providers free to construct/consume `AudioFrame` directly without
 * thinking about the runtime's bus.
 *
 * See `plans/audio-agent-architecture.md` section 3.1 — `frames/frame-bus.ts`.
 */
import type { AudioFrame, ToolCall } from '@memberjunction/ai';

/**
 * A single video frame moving across a realtime/streaming channel.
 *
 * `MediaType` examples: `'video/h264'`, `'video/vp8'`, `'image/jpeg'` (for keyframes).
 * `PtsMs` is the presentation timestamp in milliseconds when known.
 */
export interface VideoFrame {
    Data: Uint8Array;
    Width: number;
    Height: number;
    MediaType: string;
    PtsMs?: number;
}

/**
 * A transcript fragment — partial or final — from STT or a realtime model.
 */
export interface TranscriptFrame {
    Text: string;
    Role: 'user' | 'assistant' | 'system';
    IsFinal: boolean;
    StartMs?: number;
    EndMs?: number;
}

/**
 * Runtime signals not tied to a media payload.
 *
 * `user-text` exists so non-audio paths (e.g. Twilio ConvRelay, which delivers
 * caller text already) can feed the agent through the same bus that voice does.
 */
export type ControlEvent =
    | { Kind: 'session-start' }
    | { Kind: 'session-end'; Reason: string }
    | { Kind: 'participant-joined'; ParticipantID: string }
    | { Kind: 'participant-left'; ParticipantID: string }
    | { Kind: 'user-text'; Text: string };

/**
 * A tool invocation surfaced to the runtime (routes back through `BaseAgent`
 * for audit/permissions regardless of whether the model emitted it natively).
 */
export interface ToolCallFrame {
    Call: ToolCall;
    SessionID: string;
    AgentRunStepID?: string;
}

/**
 * Discriminator for the top-level `Frame` wrapper union.
 */
export type FrameKind = 'audio' | 'video' | 'transcript' | 'control' | 'tool-call';

/**
 * Top-level frame envelope. The bus discriminates on `Kind`; consumers narrow
 * via `OnKind` (typed) or `On` (catch-all).
 */
export type Frame =
    | { Kind: 'audio'; Payload: AudioFrame }
    | { Kind: 'video'; Payload: VideoFrame }
    | { Kind: 'transcript'; Payload: TranscriptFrame }
    | { Kind: 'control'; Payload: ControlEvent }
    | { Kind: 'tool-call'; Payload: ToolCallFrame };

/**
 * The runtime-internal frame bus. Concrete implementation lands in Phase 1(c);
 * this interface is the contract engines code against.
 */
export interface FrameBus {
    /** Publish a frame to all subscribers. */
    Emit(frame: Frame): void;

    /**
     * Subscribe to all frames. Returns a disposer that unsubscribes the handler.
     */
    On(handler: (frame: Frame) => void): () => void;

    /**
     * Subscribe to a single kind of frame; the handler receives the narrowed type.
     * Returns a disposer.
     */
    OnKind<K extends FrameKind>(
        kind: K,
        handler: (frame: Extract<Frame, { Kind: K }>) => void
    ): () => void;
}
