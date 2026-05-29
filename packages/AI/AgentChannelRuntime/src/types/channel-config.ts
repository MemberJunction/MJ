/**
 * Strongly-typed channel config shapes — the discriminated union the runtime
 * resolves from `AIAgentChannel.ConfigJSONSchemaName`.
 *
 * Field naming follows MJ convention (PascalCase public members), even though
 * the plan doc uses lowercase. The metadata UI dispatches on `Kind` to render
 * a typed editor per variant.
 *
 * See `plans/audio-agent-architecture.md` section 2.5.
 */

/** Discriminator for `AgentChannelConfig`. */
export type ChannelKind =
    | 'text-chat'
    | 'voice-cascaded'
    | 'voice-realtime'
    | 'phone'
    | 'video-realtime';

/**
 * Plain text chat — the default channel for every existing agent caller.
 * Carries no audio/video config; LLM override is optional.
 */
export interface TextChatConfig {
    Kind: 'text-chat';
    LLM?: {
        AIModelID?: string;
    };
}

/**
 * Cascaded voice pipeline: STT → LLM → TTS, with VAD + turn-detector + optional
 * filler-word policy. The classic real-time voice stack.
 */
export interface VoiceCascadedConfig {
    Kind: 'voice-cascaded';
    STT: {
        AIModelID: string;
        LanguageCode?: string;
        Partials?: boolean;
    };
    TTS: {
        AIModelID: string;
        AIVoiceProfileID?: string;
        FirstChunkBudgetMs?: number;
    };
    VAD: {
        DriverClass: string;
        Sensitivity?: number;
    };
    TurnDetector: {
        DriverClass: string;
    };
    /** Overrides the agent's default LLM for this channel. */
    LLM?: {
        AIModelID?: string;
    };
    LatencyBudgetMs?: number;
    FillerPolicy?: {
        ThresholdMs: number;
        Phrases: string[];
    };
    BargeIn?: boolean;
}

/**
 * Speech-to-speech realtime — single bidirectional model (gpt-realtime,
 * gemini-live, elevenlabs-conv, personaplex).
 */
export interface VoiceRealtimeConfig {
    Kind: 'voice-realtime';
    Realtime: {
        AIModelID: string;
    };
    AIVoiceProfileID?: string;
    /**
     * `native` lets the model emit tool calls directly; `hand-off-to-llm` forces
     * intent → text LLM → tool route (PersonaPlex's only option today).
     */
    ToolCallStrategy: 'native' | 'hand-off-to-llm';
    BargeIn?: boolean;
}

/**
 * Phone bridges. When `Bridge` produces raw audio (Media Streams, LiveKit SIP),
 * the `Cascaded` config drives STT/TTS; ConvRelay handles them on Twilio's side
 * so only the LLM/agent config matters and `Cascaded` may be omitted.
 */
export interface PhoneConfig {
    Kind: 'phone';
    Bridge: 'twilio-conv-relay' | 'twilio-media-streams' | 'livekit-sip';
    Cascaded?: VoiceCascadedConfig;
}

/**
 * Forward-compat placeholder. The video-realtime engine ships in a later phase;
 * having the variant defined now keeps the discriminated union closed and lets
 * us add the engine class without touching the union type.
 *
 * See plan section "Phase 1(h) — forward compatibility".
 */
export interface VideoRealtimeConfig {
    Kind: 'video-realtime';
    /** Placeholder — real shape lands with the video-realtime engine. */
    Realtime?: {
        AIModelID?: string;
    };
}

/**
 * The full channel-config union. The runtime narrows by `Kind` to select the
 * right engine and validate the shape.
 */
export type AgentChannelConfig =
    | TextChatConfig
    | VoiceCascadedConfig
    | VoiceRealtimeConfig
    | PhoneConfig
    | VideoRealtimeConfig;
