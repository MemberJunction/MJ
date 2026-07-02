/**
 * @fileoverview The **Meeting Controls** server-side channel — a SERVER-ONLY interactive channel
 * (no Angular client surface) that turns a realtime agent into a meeting **facilitator**.
 *
 * It contributes a facilitator tool vocabulary the agent invokes server-side (`RaiseHand`,
 * `LowerHand`, `CallOnParticipant`, `MuteParticipant`, `SetTimer`) and feeds back the perception that
 * makes facilitation possible: the ordered **hand-raise queue** (who raised, in order, how long
 * they've waited), **who is speaking**, the **roster**, and the agenda **timer** (elapsed / remaining).
 * With that intel an agent can call on people in order, enforce time, and move the agenda — all
 * through one channel's tools + perception.
 *
 * The channel has **no platform code**: the signals (roster / speaking / hand-raise) arrive from an
 * INJECTED {@link IMeetingControlsEventSource} that each bridge driver adapts from its native
 * participant/event stream. The queue + timer logic is the pure, fully unit-testable
 * {@link MeetingControlsState}. This is the §4b "bridge contributes a channel" pattern realized as an
 * MJ channel: dynamic tool vocabulary + perception, routed through the same channel plane as the
 * MJ-native whiteboard.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import {
    BaseRealtimeChannelServer,
    RealtimeToolDefinition,
    ServerChannelToolResult,
    JSONObject,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import {
    MeetingControlsState,
    MeetingControlsClock,
    MeetingParticipant,
} from './meeting-controls-state';

/** The channel name — matches the (seedable) `MJ: AI Agent Channels` row's `Name`. */
export const MEETING_CONTROLS_CHANNEL_NAME = 'Meeting Controls';

/**
 * The shared name prefix of every Meeting Controls tool. The host routes any tool call beginning with
 * this prefix back to this channel's {@link MeetingControlsChannelServer.ExecuteServerTool}.
 */
export const MEETING_CONTROLS_TOOL_PREFIX = 'MeetingControls_';

/**
 * The capability the channel gates `MuteParticipant` on. The injected event source advertises which
 * facilitator actions the platform supports; muting is the only gated one (raising/lowering a hand,
 * calling on, and timers are channel-internal and always available).
 */
export type MeetingControlsCapability = 'Mute';

/**
 * The signaling/perception + action surface a bridge driver supplies to the Meeting Controls channel.
 *
 * The channel SUBSCRIBES to the three perception streams and the channel maps the agent's tool calls
 * back onto {@link MuteParticipant} (the one action that must reach the platform). Everything else
 * (the queue, the timer, who is speaking) is maintained inside {@link MeetingControlsState} from these
 * streams. Each bridge driver implements this by adapting its native participant/event stream — the
 * channel itself never names a platform.
 *
 * All `On*` registrations are "latest handler wins" (one channel instance per session).
 */
export interface IMeetingControlsEventSource {
    /**
     * Registers a handler for roster changes. The channel rebuilds its roster from each snapshot and
     * prunes departed participants from the queue / speaking / mute state.
     *
     * @param handler Invoked with the full current roster on every change.
     */
    OnRosterChange(handler: (participants: MeetingParticipant[]) => void): void;

    /**
     * Registers a handler for diarized speaking changes — the set of participant ids currently
     * speaking.
     *
     * @param handler Invoked with the speaking participant ids on every change.
     */
    OnSpeakingChange(handler: (participantIds: string[]) => void): void;

    /**
     * Registers a handler for hand-raise/lower signals the PLATFORM surfaces (e.g. a participant uses
     * Zoom's native "raise hand"). `raised = true` enqueues, `false` dequeues — mirroring the agent's
     * own `RaiseHand`/`LowerHand` tools so platform-raised and agent-raised hands share one queue.
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
     * `MuteParticipant` tool on `'Mute'` being present; absent capabilities make the corresponding
     * tool return a structured "not supported" result instead of calling the source.
     */
    readonly Capabilities: ReadonlyArray<MeetingControlsCapability>;
}

/**
 * Dependencies injected into a {@link MeetingControlsChannelServer} — the platform event source and an
 * optional deterministic clock. Injected (rather than resolved) so the channel is fully unit-testable
 * with a fake source and a controllable clock, and so the platform wiring is the driver's concern.
 */
export interface MeetingControlsChannelDeps {
    /** The bridge-supplied perception/action surface. */
    EventSource: IMeetingControlsEventSource;

    /** Optional clock for the queue/timer math (defaults to `Date.now`). */
    Clock?: MeetingControlsClock;
}

/** Parsed shape of a tool call that targets a single participant. */
interface ParticipantToolArgs {
    participantId?: string;
}

/** Parsed shape of the `SetTimer` tool call. */
interface SetTimerToolArgs {
    seconds?: number;
}

/**
 * Server-only Meeting Controls channel — the facilitator surface. ONE instance per session.
 *
 * Unlike the whiteboard (resolved from the registry by the host via a parameterless ClassFactory
 * construction), this channel needs a per-session {@link IMeetingControlsEventSource} from the bridge,
 * so a bridge driver constructs it directly with {@link MeetingControlsChannelDeps} and hands it to
 * the host's per-session plugin set. It has **no client surface** — the contract's
 * `GetServerToolDefinitions` / `ExecuteServerTool` are the entire interface; there is no
 * `GetSurfaceComponent` on the server half at all.
 *
 * Registered under {@link MEETING_CONTROLS_CHANNEL_NAME} so a seeded registry row can resolve a
 * default (event-source-less) instance for discovery; a real session always injects the driver's
 * event source.
 */
@RegisterClass(BaseRealtimeChannelServer, 'MeetingControlsChannelServer')
export class MeetingControlsChannelServer extends BaseRealtimeChannelServer {
    /** The pure facilitator state (queue / speaking / roster / mute / timer). */
    private readonly state: MeetingControlsState;

    /** The injected platform event source, or `null` for a registry-resolved discovery instance. */
    private readonly eventSource: IMeetingControlsEventSource | null;

    /**
     * @param deps Optional per-session dependencies. Omitted only for a registry-resolved discovery
     *   instance (the host's ClassFactory path) — such an instance maintains no live state and
     *   contributes its tool vocabulary but cannot actuate platform mutes.
     */
    constructor(deps?: MeetingControlsChannelDeps) {
        super();
        this.state = new MeetingControlsState(deps?.Clock);
        this.eventSource = deps?.EventSource ?? null;
    }

    /** @inheritdoc */
    public get ChannelName(): string {
        return MEETING_CONTROLS_CHANNEL_NAME;
    }

    /** @inheritdoc */
    public override get ToolNamePrefix(): string {
        return MEETING_CONTROLS_TOOL_PREFIX;
    }

    /** Read-only access to the live facilitator state (for the channel's own perception + tests). */
    public get State(): MeetingControlsState {
        return this.state;
    }

    // ── Lifecycle: subscribe the bridge event source ────────────────────────────────

    /**
     * Subscribes the injected event source's perception streams into {@link MeetingControlsState} and
     * emits an initial perception snapshot. A discovery instance (no event source) is inert.
     */
    public override async OnSessionStarted(): Promise<void> {
        if (!this.eventSource) {
            return;
        }
        this.eventSource.OnRosterChange((participants) => {
            this.state.SetRoster(participants);
            this.emitPerception('roster changed');
        });
        this.eventSource.OnSpeakingChange((ids) => {
            this.state.SetSpeaking(ids);
            this.emitPerception('speaking changed');
        });
        this.eventSource.OnHandRaiseChange((participantId, raised) => {
            const changed = raised ? this.state.RaiseHand(participantId) : this.state.LowerHand(participantId);
            if (changed) {
                this.emitPerception(raised ? 'hand raised' : 'hand lowered');
            }
        });
    }

    // ── Dynamic tool vocabulary ─────────────────────────────────────────────────────

    /**
     * The facilitator tool vocabulary. `MuteParticipant` is included only when the platform advertises
     * the `'Mute'` capability — so the contributed tool set is **runtime-computed** from the connected
     * platform's abilities (the §4b dynamic-tool point), not a fixed constant.
     *
     * @returns The contributed server-executed tool definitions.
     */
    public override GetServerToolDefinitions(): RealtimeToolDefinition[] {
        const tools: RealtimeToolDefinition[] = [
            this.tool('RaiseHand', 'Add a participant to the hand-raise queue (e.g. on their spoken request to speak).', this.participantSchema()),
            this.tool('LowerHand', 'Remove a participant from the hand-raise queue.', this.participantSchema()),
            this.tool(
                'CallOnParticipant',
                'Call on a participant so they may speak, lowering their hand. Omit participantId to call on the next person in the queue.',
                this.participantSchema(false),
            ),
            this.tool('SetTimer', 'Start an agenda/meeting timer for the given number of seconds (0 clears it).', this.setTimerSchema()),
        ];
        if (this.muteSupported()) {
            tools.push(this.tool('MuteParticipant', 'Mute a participant on the platform.', this.participantSchema()));
        }
        return tools;
    }

    /**
     * Executes one facilitator tool and returns the result (the model narrates it). Tool dispatch is
     * by the bare tool name (after the {@link MEETING_CONTROLS_TOOL_PREFIX}). Never throws — bad args
     * or an unknown tool resolve to a structured failure result.
     *
     * @param toolName The full tool name (prefixed).
     * @param argsJson The raw arguments JSON.
     * @returns The execution result.
     */
    public override async ExecuteServerTool(toolName: string, argsJson: string): Promise<ServerChannelToolResult> {
        const bare = toolName.startsWith(MEETING_CONTROLS_TOOL_PREFIX)
            ? toolName.slice(MEETING_CONTROLS_TOOL_PREFIX.length)
            : toolName;
        switch (bare) {
            case 'RaiseHand':
                return this.execRaiseHand(argsJson);
            case 'LowerHand':
                return this.execLowerHand(argsJson);
            case 'CallOnParticipant':
                return this.execCallOn(argsJson);
            case 'MuteParticipant':
                return this.execMute(argsJson);
            case 'SetTimer':
                return this.execSetTimer(argsJson);
            default:
                return { Success: false, Output: `Unknown Meeting Controls tool '${toolName}'.` };
        }
    }

    // ── Tool implementations ────────────────────────────────────────────────────────

    /** `RaiseHand(participantId)` — enqueue a participant; emits perception on a real change. */
    private execRaiseHand(argsJson: string): ServerChannelToolResult {
        const id = this.requireParticipantId(argsJson);
        if (!id) {
            return this.missingParticipant('RaiseHand');
        }
        if (!this.state.GetParticipant(id)) {
            return { Success: false, Output: `Participant '${id}' is not on the roster.` };
        }
        const changed = this.state.RaiseHand(id);
        if (changed) {
            this.emitPerception('hand raised');
        }
        return { Success: true, Output: changed ? `Hand raised for ${this.name(id)} (queue position ${this.queuePosition(id)}).` : `${this.name(id)} already has a hand raised.` };
    }

    /** `LowerHand(participantId)` — dequeue a participant. */
    private execLowerHand(argsJson: string): ServerChannelToolResult {
        const id = this.requireParticipantId(argsJson);
        if (!id) {
            return this.missingParticipant('LowerHand');
        }
        const changed = this.state.LowerHand(id);
        if (changed) {
            this.emitPerception('hand lowered');
        }
        return { Success: true, Output: changed ? `Lowered ${this.name(id)}'s hand.` : `${this.name(id)} had no raised hand.` };
    }

    /** `CallOnParticipant(participantId?)` — call on a specific person or the front of the queue. */
    private execCallOn(argsJson: string): ServerChannelToolResult {
        const id = this.parseParticipantArgs(argsJson).participantId;
        const called = this.state.CallOn(id);
        if (!called) {
            return { Success: false, Output: id ? `${this.name(id)} is not in the hand-raise queue.` : 'No one is in the hand-raise queue to call on.' };
        }
        this.emitPerception('called on participant');
        return { Success: true, Output: `Calling on ${called.DisplayName ?? this.name(called.ParticipantId)}.` };
    }

    /** `MuteParticipant(participantId)` — capability-gated; actuates the platform mute. */
    private async execMute(argsJson: string): Promise<ServerChannelToolResult> {
        if (!this.muteSupported()) {
            return { Success: false, Output: 'Muting participants is not supported on this platform.' };
        }
        const id = this.requireParticipantId(argsJson);
        if (!id) {
            return this.missingParticipant('MuteParticipant');
        }
        if (!this.state.GetParticipant(id)) {
            return { Success: false, Output: `Participant '${id}' is not on the roster.` };
        }
        try {
            await this.eventSource?.MuteParticipant(id);
        } catch (error) {
            return { Success: false, Output: `Failed to mute ${this.name(id)}: ${error instanceof Error ? error.message : String(error)}` };
        }
        this.state.MarkMuted(id);
        this.emitPerception('participant muted');
        return { Success: true, Output: `Muted ${this.name(id)}.` };
    }

    /** `SetTimer(seconds)` — start/clear the agenda timer. */
    private execSetTimer(argsJson: string): ServerChannelToolResult {
        const seconds = this.parseSetTimerArgs(argsJson).seconds;
        if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
            return { Success: false, Output: "SetTimer requires a non-negative 'seconds' value." };
        }
        this.state.SetTimer(seconds);
        this.emitPerception('timer set');
        return { Success: true, Output: seconds > 0 ? `Timer set for ${seconds} seconds.` : 'Timer cleared.' };
    }

    // ── Perception ──────────────────────────────────────────────────────────────────

    /**
     * Serializes the current facilitator state and feeds it to the model as a background context note
     * (no spoken reply forced). No-op when the host context supplies no perception sink (provider
     * can't inject mid-session, or no live session yet).
     *
     * @param reason A short label for the change that triggered the perception (logging only).
     */
    private emitPerception(reason: string): void {
        const sink = this.Context?.SendContextNote;
        if (!sink) {
            return;
        }
        try {
            const payload = JSON.stringify(this.state.BuildPerception());
            sink.call(this.Context, `[meeting-controls: ${reason}] ${payload}`);
        } catch (error) {
            LogError(`[MeetingControlsChannelServer] perception emit failed (${reason}): ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────────

    /** Whether the platform advertises mute support. */
    private muteSupported(): boolean {
        return this.eventSource?.Capabilities.includes('Mute') ?? false;
    }

    /** Builds one tool definition with the prefixed name. */
    private tool(bareName: string, description: string, parametersSchema: JSONObject): RealtimeToolDefinition {
        return { Name: `${MEETING_CONTROLS_TOOL_PREFIX}${bareName}`, Description: description, ParametersSchema: parametersSchema };
    }

    /** JSON schema for a `{ participantId }` tool; `required` controls whether the id is mandatory. */
    private participantSchema(required = true): JSONObject {
        const schema: JSONObject = {
            type: 'object',
            properties: { participantId: { type: 'string', description: 'The platform participant id this tool targets.' } },
        };
        if (required) {
            schema.required = ['participantId'];
        }
        return schema;
    }

    /** JSON schema for the `SetTimer` tool. */
    private setTimerSchema(): JSONObject {
        return {
            type: 'object',
            properties: { seconds: { type: 'number', description: 'Timer duration in seconds; 0 clears the timer.' } },
            required: ['seconds'],
        };
    }

    /** Parses a participant-targeting tool's args, tolerating malformed JSON. */
    private parseParticipantArgs(argsJson: string): ParticipantToolArgs {
        return this.safeParse<ParticipantToolArgs>(argsJson);
    }

    /** Parses the `SetTimer` tool's args, tolerating malformed JSON. */
    private parseSetTimerArgs(argsJson: string): SetTimerToolArgs {
        return this.safeParse<SetTimerToolArgs>(argsJson);
    }

    /** Returns the required `participantId` or `null` when absent/blank. */
    private requireParticipantId(argsJson: string): string | null {
        const id = this.parseParticipantArgs(argsJson).participantId;
        return typeof id === 'string' && id.trim().length > 0 ? id : null;
    }

    /** A standard "missing participantId" failure result for a tool. */
    private missingParticipant(tool: string): ServerChannelToolResult {
        return { Success: false, Output: `${tool} requires a 'participantId'.` };
    }

    /** A participant's display name, falling back to their id. */
    private name(participantId: string): string {
        return this.state.GetParticipant(participantId)?.DisplayName ?? participantId;
    }

    /** 1-based queue position of a participant (0 when not queued). */
    private queuePosition(participantId: string): number {
        return this.state.GetHandRaiseQueue().findIndex((e) => e.ParticipantId === participantId) + 1;
    }

    /** Parses JSON into `T`, returning an empty object on any error (channels never throw on bad args). */
    private safeParse<T>(json: string): T {
        try {
            const parsed = JSON.parse(json);
            return parsed && typeof parsed === 'object' ? (parsed as T) : ({} as T);
        } catch {
            return {} as T;
        }
    }
}

/**
 * Tree-shaking prevention for {@link MeetingControlsChannelServer}'s `@RegisterClass` registration.
 * Call from a static code path so the registration is never eliminated by the bundler — mirroring
 * every other `Load…()` in the realtime stack.
 */
export function LoadMeetingControlsChannelServer(): void {
    // no-op — the import + call create a static reference bundlers cannot eliminate
}
