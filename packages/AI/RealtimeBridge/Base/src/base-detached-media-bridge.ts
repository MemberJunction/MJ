import {
    BaseRealtimeBridge,
    RealtimeBridgeContext,
    BridgeConnectResult,
    BridgeDisconnectReason,
} from './base-realtime-bridge';
import { BridgeMediaFrame, BridgeMediaTrackKind, BridgeParticipantInfo } from './media-tracks';
import { IBridgeMeetingControlsEventSource } from './channel-plane';

/**
 * Abstract base class for a **detached-media** Realtime Bridge driver (e.g. `OpenAISipBridge`).
 *
 * In a detached media plane, the platform/carrier terminates the live media leg directly with the
 * AI provider (e.g. OpenAI SIP endpoints), while MemberJunction attaches a sideband connection
 * for signaling, events, transcripts, tool calls, and telemetry.
 *
 * MemberJunction is **not in the live media path** and does not relay audio between the carrier
 * and the model. Therefore, `SendMedia` and `FlushOutboundMedia` are safe no-ops, and `OnMedia`
 * registers an observer handler without pumping media frames into an audio sink.
 */
export abstract class BaseDetachedMediaBridge extends BaseRealtimeBridge {
    protected mediaHandlers: Array<(frame: BridgeMediaFrame) => void> = [];
    protected dtmfHandlers: Array<(digit: string) => void> = [];
    protected callEndedHandlers: Array<() => void> = [];
    protected botParticipantId = 'bot';
    protected externalCallId = '';
    protected callerNumber = '';
    protected agentNumber = '';

    /**
     * Initializes base context and sets the DetachedMediaPlane feature flag.
     */
    protected applyDetachedContext(ctx: RealtimeBridgeContext): void {
        this.features = { ...ctx.Features, DetachedMediaPlane: true };
        this.providerName = ctx.ProviderName || this.constructor.name;
    }

    /**
     * No-op on a detached media plane: live media is handled directly between carrier and provider.
     */
    public SendMedia(_track: BridgeMediaTrackKind, _frame: BridgeMediaFrame): void {
        // Safe no-op: MJ does not relay outbound media in detached plane.
    }

    /**
     * Registers an observer for inbound media frames (if the provider reflects copies of audio on the sideband).
     */
    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.mediaHandlers.push(handler);
    }

    /**
     * Dispatches an inbound media frame to registered observers (e.g. reflected audio from sideband).
     */
    protected emitMediaFrame(frame: BridgeMediaFrame): void {
        for (const handler of this.mediaHandlers) {
            handler(frame);
        }
    }

    /**
     * No-op on a detached media plane: MJ holds no outbound audio queue to flush.
     */
    public override FlushOutboundMedia(): void {
        // Safe no-op
    }

    /**
     * Registers a handler for received DTMF digits (receive-only).
     */
    public override OnDTMF(handler: (digit: string) => void): void {
        this.RequireFeature('DTMF');
        this.dtmfHandlers.push(handler);
    }

    /**
     * Dispatches an inbound DTMF digit to registered listeners.
     */
    protected emitDTMF(digit: string): void {
        for (const handler of this.dtmfHandlers) {
            handler(digit);
        }
    }

    /**
     * Registers a callback fired when the call has ended.
     */
    public OnCallEnded(handler: () => void): void {
        this.callEndedHandlers.push(handler);
    }

    /**
     * Fires call-ended handlers when the call terminates.
     */
    protected emitCallEnded(): void {
        for (const handler of this.callEndedHandlers) {
            handler();
        }
    }

    /**
     * A phone call carries no meeting-controls surface.
     */
    public override GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null {
        return null;
    }

    /**
     * Returns the 1:1 participant roster: bot participant + remote caller.
     */
    public override async GetParticipants(): Promise<BridgeParticipantInfo[]> {
        return [
            {
                ExternalId: this.botParticipantId,
                DisplayName: 'AI Agent',
                Role: 'Agent',
                IsAgent: true,
            },
            {
                ExternalId: this.callerNumber || 'caller',
                DisplayName: this.callerNumber || 'Caller',
                Role: 'Participant',
                IsAgent: false,
            },
        ];
    }
}
