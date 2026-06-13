import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeBridge,
    BridgeConnectResult,
    BridgeDisconnectReason,
    BridgeMediaFrame,
    BridgeMediaTrackKind,
    BridgeParticipantInfo,
    RealtimeBridgeContext,
    IBridgeMeetingControlsEventSource,
    BridgeMeetingParticipant,
    BridgeMeetingControlsCapability,
} from '@memberjunction/ai-bridge-base';

/**
 * The `DriverClass` key the {@link LoopbackBridge} registers under. A bridge provider row with
 * `DriverClass = 'LoopbackBridge'` resolves to this driver via the `ClassFactory`.
 */
export const LOOPBACK_BRIDGE_DRIVER_CLASS = 'LoopbackBridge';

/**
 * A trivial in-memory {@link IBridgeMeetingControlsEventSource} for tests — the loopback driver's
 * optional facilitator surface. It records the registered perception handlers and exposes `Emit*`
 * helpers so a test can drive roster / speaking / hand-raise signals into the Meeting Controls
 * channel, and records mute requests. A real driver (e.g. `ZoomBridge`) implements this by adapting
 * its native participant/event stream; the loopback version proves the bridge → channel-plane wiring
 * with no platform.
 */
export class LoopbackMeetingControlsEventSource implements IBridgeMeetingControlsEventSource {
    private rosterHandler?: (participants: BridgeMeetingParticipant[]) => void;
    private speakingHandler?: (participantIds: string[]) => void;
    private handRaiseHandler?: (participantId: string, raised: boolean) => void;

    /** Participant ids this source was asked to mute, in order — a capture sink for assertions. */
    public readonly Muted: string[] = [];

    /** The facilitator capabilities the loopback advertises (mute supported, so the gated tool appears). */
    public readonly Capabilities: ReadonlyArray<BridgeMeetingControlsCapability> = ['Mute'];

    /** @inheritdoc */
    public OnRosterChange(handler: (participants: BridgeMeetingParticipant[]) => void): void {
        this.rosterHandler = handler;
    }

    /** @inheritdoc */
    public OnSpeakingChange(handler: (participantIds: string[]) => void): void {
        this.speakingHandler = handler;
    }

    /** @inheritdoc */
    public OnHandRaiseChange(handler: (participantId: string, raised: boolean) => void): void {
        this.handRaiseHandler = handler;
    }

    /** @inheritdoc */
    public async MuteParticipant(participantId: string): Promise<void> {
        this.Muted.push(participantId);
    }

    /** Drives a roster snapshot into the channel. */
    public EmitRoster(participants: BridgeMeetingParticipant[]): void {
        this.rosterHandler?.(participants);
    }

    /** Drives a speaking-set change into the channel. */
    public EmitSpeaking(participantIds: string[]): void {
        this.speakingHandler?.(participantIds);
    }

    /** Drives a platform hand-raise/lower signal into the channel. */
    public EmitHandRaise(participantId: string, raised: boolean): void {
        this.handRaiseHandler?.(participantId, raised);
    }
}

/**
 * An in-memory, platform-free Realtime Bridge driver for **test and development**.
 *
 * `LoopbackBridge` proves the transport seam round-trips media with NO external conferencing or
 * telephony platform: every frame sent via {@link SendMedia} is **echoed straight back** through the
 * inbound {@link OnMedia} handler (re-stamped to the matching inbound track), and {@link GetParticipants}
 * returns a single synthetic agent participant. Wired into {@link AIBridgeEngine} with a mock
 * `IRealtimeSession`, it demonstrates that bridge → session → bridge media flow works end-to-end —
 * the deferred "unified-transport track" foundation, validated with zero infrastructure.
 *
 * It declares an audio-capable, diarizing feature set so the engine exercises both the media seam
 * and participant tracking against it. Telephony/recording features stay off (their virtual base
 * methods keep throwing `NotSupported`), so the loopback driver also documents the capability-gating
 * contract by example.
 *
 * Registered via `@RegisterClass(BaseRealtimeBridge, 'LoopbackBridge')`.
 */
@RegisterClass(BaseRealtimeBridge, LOOPBACK_BRIDGE_DRIVER_CLASS)
export class LoopbackBridge extends BaseRealtimeBridge {
    /** Whether {@link Connect} has run and the bridge is "online". */
    private connected = false;

    /** The inbound-media handler registered via {@link OnMedia}; frames are echoed to it. */
    private mediaHandler?: (frame: BridgeMediaFrame) => void;

    /** The roster-change handler registered via {@link OnParticipantChange}. */
    private participantHandler?: (participants: BridgeParticipantInfo[]) => void;

    /**
     * Every frame the engine sent outbound, in order — a capture sink for assertions in tests.
     * The frames are ALSO echoed back inbound; this array is the durable record of what was sent.
     */
    public readonly Sent: BridgeMediaFrame[] = [];

    /** The synthetic agent participant the loopback endpoint reports. */
    private static readonly AGENT_PARTICIPANT: BridgeParticipantInfo = {
        ExternalId: 'loopback-agent',
        DisplayName: 'Loopback Agent',
        Role: 'Agent',
        IsAgent: true,
    };

    /**
     * The optional Meeting Controls event source. `null` by default so the loopback driver contributes
     * NO facilitator surface (matching most drivers) — a test opts in via {@link EnableMeetingControls}
     * to exercise the bridge → channel-plane wiring.
     */
    private meetingControls: LoopbackMeetingControlsEventSource | null = null;

    /**
     * Enables (and returns) a simple {@link LoopbackMeetingControlsEventSource} so this loopback driver
     * contributes a Meeting Controls surface — used by tests of the engine's channel-plane wiring. The
     * returned source's `Emit*` helpers drive roster / speaking / hand-raise signals into the channel.
     *
     * @returns The enabled event source (the same instance {@link GetMeetingControlsEventSource} returns).
     */
    public EnableMeetingControls(): LoopbackMeetingControlsEventSource {
        this.meetingControls = new LoopbackMeetingControlsEventSource();
        return this.meetingControls;
    }

    /**
     * Returns the loopback's Meeting Controls event source when {@link EnableMeetingControls} was
     * called, else `null` (the base default — no facilitator surface).
     */
    public override GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return this.meetingControls;
    }

    /**
     * The enabled Meeting Controls event source (or `null`), typed concretely so tests can drive its
     * `Emit*` helpers. {@link GetMeetingControlsEventSource} returns the same instance via the interface.
     */
    public get MeetingControlsSource(): LoopbackMeetingControlsEventSource | null {
        return this.meetingControls;
    }

    /**
     * "Connects" the loopback endpoint. Records the context for capability gating and returns
     * synthetic handles. No network, no platform — always succeeds. After connecting, emits an
     * initial roster (the synthetic agent participant) to any registered roster handler.
     *
     * @param ctx The bridge context (features, provider name, address).
     * @returns Synthetic bot + connection identifiers.
     */
    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyContext(ctx);
        this.connected = true;
        // Surface the initial roster so participant tracking has something to upsert.
        this.participantHandler?.([LoopbackBridge.AGENT_PARTICIPANT]);
        return {
            BotParticipantId: LoopbackBridge.AGENT_PARTICIPANT.ExternalId,
            ExternalConnectionId: `loopback:${ctx.Address || 'in-memory'}`,
        };
    }

    /**
     * Tears the loopback endpoint down and drops all handlers. Always clean.
     *
     * @param _reason Why the disconnect happened (unused — loopback teardown is uniform).
     */
    public async Disconnect(_reason: BridgeDisconnectReason): Promise<void> {
        this.connected = false;
        this.mediaHandler = undefined;
        this.participantHandler = undefined;
    }

    /**
     * Sends an outbound media frame — and **echoes it straight back** through the inbound handler,
     * re-stamped to the matching inbound track (`audio-out` → `audio-in`, etc.). This is what makes
     * the loopback round-trip provable: what the agent "says" is immediately what the agent "hears",
     * so a test can drive the realtime-session output and observe it arrive back as session input.
     *
     * @param track The outbound track the frame targets.
     * @param frame The media frame to send (and echo).
     */
    public SendMedia(track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void {
        if (!this.connected) {
            return; // a disconnected loopback drops frames silently.
        }
        this.Sent.push(frame);
        const echoed: BridgeMediaFrame = {
            ...frame,
            Track: this.toInboundTrack(track),
        };
        this.mediaHandler?.(echoed);
    }

    /**
     * Registers the inbound-media handler. The loopback echoes outbound frames to this handler.
     *
     * @param handler Invoked with each (echoed) inbound media frame.
     */
    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.mediaHandler = handler;
    }

    /**
     * Returns the loopback roster — a single synthetic agent participant. Overrides the
     * capability-gated base method (gated by `SpeakerDiarization`, which the loopback provider
     * enables in its feature set).
     *
     * @returns The synthetic participant list.
     */
    public override async GetParticipants(): Promise<BridgeParticipantInfo[]> {
        this.RequireFeature('SpeakerDiarization');
        return [LoopbackBridge.AGENT_PARTICIPANT];
    }

    /**
     * Registers a roster-change handler. The loopback fires it once at {@link Connect} time with the
     * synthetic participant; {@link EmitParticipants} lets tests drive further roster changes.
     *
     * @param handler Invoked with the updated participant list on each change.
     */
    public override OnParticipantChange(handler: (participants: BridgeParticipantInfo[]) => void): void {
        this.RequireFeature('SpeakerDiarization');
        this.participantHandler = handler;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Test/dev helpers — drive the loopback from outside.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Pushes an inbound media frame directly into the registered {@link OnMedia} handler, simulating
     * the endpoint producing media (what the agent hears) WITHOUT an outbound echo. Lets a test
     * exercise the inbound half of the transport seam in isolation.
     *
     * @param frame The inbound frame to deliver.
     */
    public EmitInbound(frame: BridgeMediaFrame): void {
        this.mediaHandler?.(frame);
    }

    /**
     * Drives a roster change, delivering the supplied participants to the registered
     * {@link OnParticipantChange} handler. Lets a test exercise participant tracking.
     *
     * @param participants The roster to deliver.
     */
    public EmitParticipants(participants: BridgeParticipantInfo[]): void {
        this.participantHandler?.(participants);
    }

    /** Whether the loopback is currently "connected" (after {@link Connect}, before {@link Disconnect}). */
    public get IsConnected(): boolean {
        return this.connected;
    }

    /** Maps an outbound track kind to its inbound counterpart for the echo. */
    private toInboundTrack(track: BridgeMediaTrackKind): BridgeMediaTrackKind {
        switch (track) {
            case 'audio-out':
                return 'audio-in';
            case 'video-out':
                return 'video-in';
            case 'screen-out':
                return 'screen-in';
            default:
                return track; // an already-inbound track echoes as itself.
        }
    }
}

/**
 * Tree-shaking-prevention loader. Modern bundlers cannot see the `@RegisterClass` dynamic
 * registration of {@link LoopbackBridge} and may eliminate it. Importing and calling this no-op from
 * a package entry point keeps the class in the bundle so the `ClassFactory` can resolve it.
 */
export function LoadLoopbackBridge(): void {
    // Intentionally empty — referencing the module is what prevents tree-shaking.
}
