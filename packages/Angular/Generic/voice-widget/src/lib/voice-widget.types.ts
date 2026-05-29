/**
 * Public types for the Voice Widget.
 *
 * Defined once here so component templates, the service, and consumers all
 * use the same names. Kept as TypeScript union types (per MJ's no-enums-in-
 * library-exports preference) so they tree-shake cleanly.
 */

/**
 * Lifecycle status of the widget. Drives the status pill and gates UI controls.
 *
 *   - `idle`       — initial state; no session.
 *   - `connecting` — `StartChannelSession` mutation is in flight.
 *   - `active`     — session is running; audio subscription is open.
 *   - `error`      — terminal-ish state; details surfaced via `ErrorOccurred`.
 *   - `ended`      — session ended cleanly (user clicked End, or stream completed).
 */
export type VoiceWidgetStatus = 'idle' | 'connecting' | 'active' | 'error' | 'ended';

/**
 * Voice channel kind passed through to `StartChannelSession.ChannelName`.
 * `voice-cascaded` is the demo path (text-in / voice-out via
 * `TextInputAudioOutputTransport` when `RoomName` is omitted).
 */
export type VoiceChannelName = 'voice-cascaded' | 'voice-realtime';

/**
 * One row in the transcript. The widget renders user turns as text and agent
 * turns as a small "speaking…" indicator (since agent audio doesn't currently
 * stream back text; only PCM frames).
 */
export interface VoiceTranscriptEntry {
    Role: 'user' | 'agent' | 'system';
    Text: string;
    Timestamp: Date;
}

/**
 * One audio frame as delivered by the `ChannelAudioOut` subscription. The
 * widget's audio service decodes `DataBase64` → bytes → AudioBuffer → playback
 * via Web Audio API. Mirrors `ChannelAudioOutFrame` in `ChannelSessionResolver`.
 */
export interface VoiceAudioFrame {
    DataBase64: string;
    SampleRateHz: number;
    ChannelCount: number;
    MediaType: string;
}

/** Result of `StartChannelSession`. */
export interface StartSessionResult {
    SessionID: string;
    ChannelName: string;
}

/** Result of `SubmitChannelTextTurn`. */
export interface SubmitTextTurnResult {
    OK: boolean;
    ErrorMessage?: string;
}

/** Result of `EndChannelSession`. */
export interface EndSessionResult {
    OK: boolean;
}

/**
 * One transcript event from the `ChannelTranscript` subscription. Mirrors
 * the server-side `ChannelTranscriptEventDTO`. Discriminated by `Kind`:
 *
 *  - `user`           — user said/typed this text. `IsFinal` always true.
 *  - `assistant-text` — incremental chunk of the agent's `message` field.
 *  - `agent-response` — post-execution payload with structured fields like
 *                       `ActionableCommands` and `ResponseForm`. `Text` is
 *                       the full assembled `message`.
 *  - `error`          — per-turn error; surface in the widget UI.
 */
export interface VoiceTranscriptEvent {
    SessionID: string;
    Kind: 'user' | 'assistant-text' | 'agent-response' | 'error';
    Text?: string;
    IsFinal?: boolean;
    ActionableCommands?: VoiceActionableCommand[];
    ResponseForm?: Record<string, unknown>;
}

/**
 * Subset of `LoopAgentResponse.actionableCommands[i]` that the widget renders
 * as a chip. The full shape lives in `@memberjunction/ai-core-plus`; we mirror
 * only the fields needed to display + click. The widget emits a click event
 * outward — host apps decide how to execute the command (navigate, run report,
 * etc.).
 */
export interface VoiceActionableCommand {
    /** Human label for the chip. */
    label?: string;
    /** Display name fallback used when `label` isn't set. */
    Label?: string;
    /** Discriminator for the command type. */
    type?: string;
    Type?: string;
    /** Free-form payload for handlers. */
    [key: string]: unknown;
}
