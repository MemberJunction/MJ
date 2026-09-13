import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({ UserInfo: class {}, LogError: () => {} }));
vi.mock('@memberjunction/core-entities', () => ({}));

import { BaseDetachedMediaBridge } from '../base-detached-media-bridge';
import { RealtimeBridgeContext, BridgeConnectResult, BridgeDisconnectReason } from '../base-realtime-bridge';
import { BridgeMediaFrame } from '../media-tracks';
import { BridgeCapabilityNotSupportedError } from '../capability-errors';

class TestDetachedBridge extends BaseDetachedMediaBridge {
    public DisconnectedReason?: BridgeDisconnectReason;

    public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult> {
        this.applyDetachedContext(ctx);
        this.callerNumber = '+15551234567';
        this.externalCallId = 'test-call-123';
        return {
            BotParticipantId: this.botParticipantId,
            ExternalConnectionId: this.externalCallId,
        };
    }

    public async Disconnect(reason: BridgeDisconnectReason): Promise<void> {
        this.DisconnectedReason = reason;
    }

    public testEmitMedia(frame: BridgeMediaFrame): void {
        this.emitMediaFrame(frame);
    }

    public testEmitDTMF(digit: string): void {
        this.emitDTMF(digit);
    }

    public testEmitCallEnded(): void {
        this.emitCallEnded();
    }
}

describe('BaseDetachedMediaBridge', () => {
    it('sets DetachedMediaPlane to true and connects cleanly', async () => {
        const bridge = new TestDetachedBridge();
        const ctx: RealtimeBridgeContext = {
            Features: { InboundRouting: true },
            ProviderName: 'TestSIP',
            Address: '+15559876543',
        };

        const result = await bridge.Connect(ctx);
        expect(result.BotParticipantId).toBe('bot');
        expect(result.ExternalConnectionId).toBe('test-call-123');
        expect(bridge.Features.DetachedMediaPlane).toBe(true);
    });

    it('SendMedia and FlushOutboundMedia are safe no-ops', async () => {
        const bridge = new TestDetachedBridge();
        await bridge.Connect({ Features: {}, ProviderName: 'Test', Address: '' });

        expect(() => {
            bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: new ArrayBuffer(16) });
            bridge.FlushOutboundMedia();
        }).not.toThrow();
    });

    it('dispatches media frames via OnMedia when emitMediaFrame is called', async () => {
        const bridge = new TestDetachedBridge();
        await bridge.Connect({ Features: {}, ProviderName: 'Test', Address: '' });

        const received: BridgeMediaFrame[] = [];
        bridge.OnMedia((frame) => received.push(frame));

        const testFrame: BridgeMediaFrame = { Track: 'audio-in', Bytes: new ArrayBuffer(8) };
        bridge.testEmitMedia(testFrame);

        expect(received.length).toBe(1);
        expect(received[0]).toBe(testFrame);
    });

    it('gates DTMF on feature flag and dispatches received digits', async () => {
        const bridgeWithoutDtmf = new TestDetachedBridge();
        await bridgeWithoutDtmf.Connect({ Features: {}, ProviderName: 'Test', Address: '' });
        expect(() => bridgeWithoutDtmf.OnDTMF(() => {})).toThrow(BridgeCapabilityNotSupportedError);

        const bridge = new TestDetachedBridge();
        await bridge.Connect({ Features: { DTMF: true }, ProviderName: 'Test', Address: '' });

        const digits: string[] = [];
        bridge.OnDTMF((d) => digits.push(d));

        bridge.testEmitDTMF('5');
        bridge.testEmitDTMF('#');

        expect(digits).toEqual(['5', '#']);
    });

    it('fires OnCallEnded handlers when call ends', async () => {
        const bridge = new TestDetachedBridge();
        await bridge.Connect({ Features: {}, ProviderName: 'Test', Address: '' });

        let ended = false;
        bridge.OnCallEnded(() => {
            ended = true;
        });

        bridge.testEmitCallEnded();
        expect(ended).toBe(true);
    });

    it('returns participant roster with Agent and Participant roles', async () => {
        const bridge = new TestDetachedBridge();
        await bridge.Connect({ Features: {}, ProviderName: 'Test', Address: '' });

        const roster = await bridge.GetParticipants();
        expect(roster).toHaveLength(2);
        expect(roster[0]).toEqual({
            ExternalId: 'bot',
            DisplayName: 'AI Agent',
            Role: 'Agent',
            IsAgent: true,
        });
        expect(roster[1]).toEqual({
            ExternalId: '+15551234567',
            DisplayName: '+15551234567',
            Role: 'Participant',
            IsAgent: false,
        });
    });

    it('returns null for GetMeetingControlsEventSource', async () => {
        const bridge = new TestDetachedBridge();
        expect(bridge.GetMeetingControlsEventSource()).toBeNull();
    });
});
