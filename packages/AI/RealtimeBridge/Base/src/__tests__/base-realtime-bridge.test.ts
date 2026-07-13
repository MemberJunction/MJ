import { describe, it, expect, vi } from 'vitest';

// base-realtime-bridge only uses `UserInfo` as a TYPE (erased at compile) and the features
// interface as a TYPE alias (also erased). Neither produces a runtime import. We still stub the
// two packages minimally so the module graph resolves without pulling heavy deps.
vi.mock('@memberjunction/core', () => ({ UserInfo: class {} }));
vi.mock('@memberjunction/core-entities', () => ({}));

import { BaseRealtimeBridge, RealtimeBridgeContext, IBridgeProviderFeatures } from '../base-realtime-bridge';
import { BridgeMediaFrame, BridgeMediaTrackKind } from '../media-tracks';
import { BridgeCapabilityNotSupportedError } from '../capability-errors';

/**
 * Minimal bridge implementing only the abstract methods — every virtual capability method is left
 * at its NotSupported default. Used to verify the base throwing behavior.
 */
class BareBridge extends BaseRealtimeBridge {
    public connected = false;
    public sent: BridgeMediaFrame[] = [];
    public mediaHandler?: (frame: BridgeMediaFrame) => void;

    public async Connect(ctx: RealtimeBridgeContext) {
        this.applyContext(ctx);
        this.connected = true;
        return { BotParticipantId: 'bot-1', ExternalConnectionId: 'conn-1' };
    }
    public async Disconnect(): Promise<void> {
        this.connected = false;
    }
    public SendMedia(_track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void {
        this.sent.push(frame);
    }
    public OnMedia(handler: (frame: BridgeMediaFrame) => void): void {
        this.mediaHandler = handler;
    }
}

/**
 * A telephony-capable bridge that OVERRIDES the virtual methods and re-asserts the feature flags
 * via RequireFeature — used to verify (a) overrides don't throw NotSupported, and (b) the
 * defense-in-depth RequireFeature guard.
 */
class TelephonyBridge extends BareBridge {
    public override async SendDTMF(_digits: string): Promise<void> {
        this.RequireFeature('DTMF');
    }
    public override async TransferCall(_target: string): Promise<void> {
        this.RequireFeature('CallTransfer');
    }
    public override async StartRecording(): Promise<void> {
        this.RequireFeature('Recording');
    }
}

function ctxWith(features: IBridgeProviderFeatures, providerName = 'TestProvider'): RealtimeBridgeContext {
    return { Features: features, ProviderName: providerName, Address: 'tel:+15550000000' };
}

describe('BaseRealtimeBridge — abstract methods work', () => {
    it('Connect records context and returns handles', async () => {
        const b = new BareBridge();
        const result = await b.Connect(ctxWith({ AudioIn: true, AudioOut: true }));
        expect(b.connected).toBe(true);
        expect(result.BotParticipantId).toBe('bot-1');
        expect(result.ExternalConnectionId).toBe('conn-1');
        expect(b.Features.AudioIn).toBe(true);
    });

    it('SendMedia / OnMedia round-trip frames', () => {
        const b = new BareBridge();
        let received: BridgeMediaFrame | undefined;
        b.OnMedia(f => { received = f; });
        const frame: BridgeMediaFrame = { Track: 'audio-out', Base64: 'AAAA' };
        b.SendMedia('audio-out', frame);
        expect(b.sent[0]).toBe(frame);
        // simulate inbound
        b.mediaHandler?.({ Track: 'audio-in', Base64: 'BBBB' });
        expect(received?.Track).toBe('audio-in');
    });

    it('Disconnect tears down', async () => {
        const b = new BareBridge();
        await b.Connect(ctxWith({}));
        await b.Disconnect('Explicit');
        expect(b.connected).toBe(false);
    });
});

describe('BaseRealtimeBridge — virtual methods throw NotSupported by default', () => {
    it('GetParticipants rejects', async () => {
        const b = new BareBridge();
        await expect(b.GetParticipants()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('OnParticipantChange throws', () => {
        const b = new BareBridge();
        expect(() => b.OnParticipantChange(() => {})).toThrow(BridgeCapabilityNotSupportedError);
    });

    it('SendDTMF rejects', async () => {
        const b = new BareBridge();
        await expect(b.SendDTMF('123')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('OnDTMF throws', () => {
        const b = new BareBridge();
        expect(() => b.OnDTMF(() => {})).toThrow(BridgeCapabilityNotSupportedError);
    });

    it('TransferCall rejects', async () => {
        const b = new BareBridge();
        await expect(b.TransferCall('+1555')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('StartRecording rejects', async () => {
        const b = new BareBridge();
        await expect(b.StartRecording()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('the thrown error carries the feature + provider name', async () => {
        const b = new BareBridge();
        await b.Connect(ctxWith({}, 'Zoom'));
        try {
            await b.GetParticipants();
            throw new Error('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(BridgeCapabilityNotSupportedError);
            if (e instanceof BridgeCapabilityNotSupportedError) {
                expect(e.FeatureName).toBe('GetParticipants');
                expect(e.ProviderName).toBe('Zoom');
            }
        }
    });

    it('falls back to the class name as provider name before Connect', async () => {
        const b = new BareBridge();
        try {
            await b.SendDTMF('1');
        } catch (e) {
            if (e instanceof BridgeCapabilityNotSupportedError) {
                expect(e.ProviderName).toBe('BareBridge');
            }
        }
    });
});

describe('BaseRealtimeBridge — overrides do NOT throw NotSupported', () => {
    it('SendDTMF succeeds when the DTMF feature is enabled', async () => {
        const b = new TelephonyBridge();
        await b.Connect(ctxWith({ DTMF: true }, 'Twilio'));
        await expect(b.SendDTMF('123#')).resolves.toBeUndefined();
    });

    it('TransferCall succeeds when CallTransfer is enabled', async () => {
        const b = new TelephonyBridge();
        await b.Connect(ctxWith({ CallTransfer: true }, 'Twilio'));
        await expect(b.TransferCall('+15551112222')).resolves.toBeUndefined();
    });
});

describe('BaseRealtimeBridge — RequireFeature defense-in-depth', () => {
    it('RequireFeature throws when the flag is off, even on an overriding driver', async () => {
        const b = new TelephonyBridge();
        await b.Connect(ctxWith({ DTMF: false }, 'Twilio')); // metadata says DTMF off
        await expect(b.SendDTMF('123')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('RequireFeature throws when the flag is omitted', async () => {
        const b = new TelephonyBridge();
        await b.Connect(ctxWith({}, 'Twilio'));
        await expect(b.StartRecording()).rejects.toMatchObject({ FeatureName: 'Recording', ProviderName: 'Twilio' });
    });

    it('RequireFeature passes when the flag is true', async () => {
        const b = new TelephonyBridge();
        await b.Connect(ctxWith({ Recording: true }, 'Twilio'));
        await expect(b.StartRecording()).resolves.toBeUndefined();
    });
});
