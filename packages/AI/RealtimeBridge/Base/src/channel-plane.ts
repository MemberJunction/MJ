/**
 * The bridge ↔ channel-plane seam — the platform-agnostic contracts that let a bridge driver
 * contribute its native surfaces (roster, hand-raise queue, who's-speaking, mute) into the realtime
 * runner's **server-side channel plane** (`@memberjunction/ai-agents`'s `RealtimeChannelServerHost`
 * + `MeetingControlsChannelServer`) WITHOUT this base package depending on `@memberjunction/ai-agents`.
 *
 * ## Why these types live here (and are structurally mirrored, not imported)
 * The canonical `IMeetingControlsEventSource` / `MeetingParticipant` and the channel host live in
 * `@memberjunction/ai-agents` (the realtime runner package). Bridge **drivers** (`ZoomBridge`, …)
 * depend on this lightweight base package, not on the heavy agents package — so a driver can adapt
 * its native participant/event stream into a Meeting Controls event source by implementing the
 * interface declared HERE. The shapes are **structurally identical** to the agents-package versions
 * (same property names + signatures), so the adapter the runner-constructing layer (`AIBridgeEngine`'s
 * caller) passes through type-checks against both. The agents package owns the channel implementation;
 * this package owns only the seam a driver needs to feed it.
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §4b (bridges contribute channels) and the
 * Phase 2 channel plane (`packages/AI/Agents/src/realtime/`).
 */

/**
 * The role a participant plays in the meeting, as the Meeting Controls channel tracks them. A union
 * (not an enum) so it exports cleanly and stays additive. Structurally mirrors the agents package's
 * `MeetingParticipantRole`.
 */
export type BridgeMeetingParticipantRole = 'Host' | 'CoHost' | 'Participant' | 'Agent';

/**
 * One participant on the meeting roster as the Meeting Controls channel consumes it. Minimal and
 * platform-agnostic — a bridge driver maps its native roster ({@link import('./media-tracks').BridgeParticipantInfo},
 * a Zoom participant, a Twilio call leg, …) onto this shape when feeding the channel's event source.
 *
 * Structurally identical to `@memberjunction/ai-agents`'s `MeetingParticipant`, so an event source
 * implemented here satisfies the channel's injected dependency.
 */
export interface BridgeMeetingParticipant {
    /** Stable platform-native participant id (the key the queue / speaking / mute state is keyed on). */
    ParticipantId: string;

    /** Human-readable display name, when the platform reports one. */
    DisplayName?: string;

    /** The participant's role in the meeting. */
    Role: BridgeMeetingParticipantRole;

    /** Whether this participant is an agent bot (the facilitator excludes agents from hand-raise / call-on). */
    IsAgent: boolean;
}

/**
 * The facilitator capability a platform may advertise to the Meeting Controls channel. Today the
 * single gated action is muting a participant; the channel always offers hand-raise/call-on/timer
 * (those are channel-internal). Structurally mirrors the agents package's `MeetingControlsCapability`.
 */
export type BridgeMeetingControlsCapability = 'Mute';

/**
 * The signaling/perception + action surface a bridge driver supplies to the **Meeting Controls**
 * server channel. The channel subscribes to the three perception streams (roster / speaking /
 * hand-raise) to maintain its queue/timer state and feed the agent perception, and maps the agent's
 * `MuteParticipant` tool back onto {@link MuteParticipant}. A driver adapts its native participant/
 * event stream into this — the channel itself never names a platform.
 *
 * Structurally identical to `@memberjunction/ai-agents`'s `IMeetingControlsEventSource`. A
 * {@link BaseRealtimeBridge.GetMeetingControlsEventSource} implementation returns this; the
 * runner-constructing layer hands it straight to `MeetingControlsChannelServer`'s deps.
 *
 * All `On*` registrations are "latest handler wins" (one channel instance per session).
 */
export interface IBridgeMeetingControlsEventSource {
    /**
     * Registers a handler for roster changes. Fired with the FULL current roster on every change.
     *
     * @param handler Invoked with the full current roster on every change.
     */
    OnRosterChange(handler: (participants: BridgeMeetingParticipant[]) => void): void;

    /**
     * Registers a handler for diarized speaking changes — the set of participant ids currently speaking.
     *
     * @param handler Invoked with the speaking participant ids on every change.
     */
    OnSpeakingChange(handler: (participantIds: string[]) => void): void;

    /**
     * Registers a handler for hand-raise/lower signals the PLATFORM surfaces (e.g. a participant uses
     * the conferencing app's native "raise hand"). `raised = true` enqueues, `false` dequeues.
     *
     * @param handler Invoked with the participant id and whether the hand is now raised.
     */
    OnHandRaiseChange(handler: (participantId: string, raised: boolean) => void): void;

    /**
     * Mutes a participant on the platform (the actuation behind the agent's `MuteParticipant` tool).
     * Capability-gated by {@link Capabilities}; the channel checks the capability before calling this.
     *
     * @param participantId The participant to mute.
     * @returns A promise resolving once the mute request has been issued.
     */
    MuteParticipant(participantId: string): Promise<void>;

    /**
     * The facilitator capabilities this platform supports (e.g. `['Mute']`). The channel gates the
     * `MuteParticipant` tool on `'Mute'` being present.
     */
    readonly Capabilities: ReadonlyArray<BridgeMeetingControlsCapability>;
}

/**
 * A server-executed channel tool contributed by a session's server-side channels, as the bridge
 * engine forwards it to the realtime runner. Structurally a `RealtimeToolDefinition`
 * (`@memberjunction/ai`) — re-declared here as the minimal shape so the bridge-server engine can
 * surface contributed tools on {@link import('./index').ActiveBridgeSession} without depending on the
 * AI core/agents packages for the type.
 */
export interface BridgeChannelToolDefinition {
    /** The model-visible tool name (already namespaced by the channel's `ToolNamePrefix`). */
    Name: string;
    /** A natural-language description the model reads to decide when to call the tool. */
    Description: string;
    /** The tool's JSON-schema parameter definition (an object schema). */
    ParametersSchema: Record<string, unknown>;
}

/**
 * The result of executing one server-channel tool, as returned to the runner. Structurally the
 * `ServerChannelToolResult` / `ToolExecutionResult` shape — minimal so the engine stays decoupled
 * from the AI packages.
 */
export interface BridgeChannelToolResult {
    /** Whether the tool executed successfully. */
    Success: boolean;
    /** The textual outcome fed back to the model (a description on success, the error on failure). */
    Output: string;
}

/**
 * The minimal, **session-scoped** view of the realtime runner's server-side channel plane that
 * {@link import('./index').AIBridgeEngine} needs to wire a bridged session's channels — declared here
 * (not imported from `@memberjunction/ai-agents`) so the bridge-server engine does not take a heavy
 * dependency on the agents package. The runner-constructing layer (which already depends on
 * `@memberjunction/ai-agents`) supplies an adapter binding these to
 * `RealtimeChannelServerHost.OnSessionStarted` / `GetSessionServerTools` /
 * `ExecuteSessionServerTool` / `OnSessionClosed` and constructs the per-session
 * `MeetingControlsChannelServer` from a driver's {@link IBridgeMeetingControlsEventSource}.
 *
 * The engine calls {@link StartSessionChannels} at connect (passing the driver's optional Meeting
 * Controls event source + the runner session's perception sink), then reads
 * {@link GetSessionServerTools} / routes {@link ExecuteSessionServerTool}, and calls
 * {@link CloseSessionChannels} at teardown.
 */
export interface IBridgeChannelHost {
    /**
     * Starts the session's server-side channels. The host registers the session with the channel
     * plane (`RealtimeChannelServerHost.OnSessionStarted`) and, when an {@link IBridgeMeetingControlsEventSource}
     * is supplied, constructs + registers a `MeetingControlsChannelServer` bound to it, feeding the
     * supplied `sendContextNote` perception sink into the channel context.
     *
     * Never throws to the engine — a channel-plane failure must not break a live bridged session.
     *
     * @param sessionId The `MJ: AI Agent Sessions` row id whose channels to start.
     * @param meetingControls The driver's Meeting Controls event source, or `null` when the driver
     *   contributes none.
     * @param sendContextNote The runner session's perception sink (`IRealtimeSession.SendContextNote`),
     *   or `undefined` when the provider can't inject mid-session — channels degrade gracefully.
     */
    StartSessionChannels(
        sessionId: string,
        meetingControls: IBridgeMeetingControlsEventSource | null,
        sendContextNote?: (text: string) => void,
    ): Promise<void>;

    /**
     * Returns the aggregated server-executed tool definitions every live channel of the session
     * contributes (the per-session server-channel tool vocabulary the runner registers as
     * `ServerChannelTools`). `[]` for an unknown session or one with no contributing channels.
     *
     * @param sessionId The session whose channels' tools to collect.
     */
    GetSessionServerTools(sessionId: string): BridgeChannelToolDefinition[];

    /**
     * Routes ONE server-channel tool call to the session's owning channel and returns its result. Bound
     * by the runner-constructing layer to the runner's `ExecuteServerChannelTool` hook. Never throws —
     * an unowned tool / unknown session / throwing channel resolves to `{ Success: false }`.
     *
     * @param sessionId The session the tool call belongs to.
     * @param toolName The full (prefixed) tool name the model invoked.
     * @param argsJson The raw arguments JSON the model emitted.
     */
    ExecuteSessionServerTool(sessionId: string, toolName: string, argsJson: string): Promise<BridgeChannelToolResult>;

    /**
     * Tears down the session's server-side channels (`RealtimeChannelServerHost.OnSessionClosed`).
     * Never throws.
     *
     * @param sessionId The session whose channels to close.
     */
    CloseSessionChannels(sessionId: string): Promise<void>;
}
