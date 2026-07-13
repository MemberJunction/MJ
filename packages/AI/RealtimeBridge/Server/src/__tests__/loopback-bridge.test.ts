import { describe, it, expect } from 'vitest';
import { BridgeCapabilityNotSupportedError } from '@memberjunction/ai-bridge-base';
import type { RealtimeBridgeContext } from '@memberjunction/ai-bridge-base';
import { LoopbackBridge } from '../loopback-bridge';

function ctx(features: Record<string, boolean>, address = 'loopback://room'): RealtimeBridgeContext {
    return { Features: features, ProviderName: 'Loopback', Address: address };
}

describe('LoopbackBridge', () => {
    it('Connect returns synthetic handles and goes online', async () => {
        const b = new LoopbackBridge();
        const result = await b.Connect(ctx({ AudioIn: true, AudioOut: true }));
        expect(b.IsConnected).toBe(true);
        expect(result.BotParticipantId).toBe('loopback-agent');
        expect(result.ExternalConnectionId).toContain('loopback:');
    });

    it('echoes outbound frames back inbound on the matching inbound track', async () => {
        const b = new LoopbackBridge();
        const received: string[] = [];
        b.OnMedia((f) => received.push(f.Track));
        await b.Connect(ctx({ AudioIn: true, AudioOut: true }));

        b.SendMedia('audio-out', { Track: 'audio-out', Base64: 'AAAA' });
        b.SendMedia('video-out', { Track: 'video-out', Base64: 'BBBB' });
        b.SendMedia('screen-out', { Track: 'screen-out', Base64: 'CCCC' });

        expect(received).toEqual(['audio-in', 'video-in', 'screen-in']);
        expect(b.Sent.length).toBe(3);
    });

    it('drops outbound frames when not connected', async () => {
        const b = new LoopbackBridge();
        let got = 0;
        b.OnMedia(() => got++);
        // No Connect → disconnected.
        b.SendMedia('audio-out', { Track: 'audio-out', Base64: 'AAAA' });
        expect(got).toBe(0);
        expect(b.Sent.length).toBe(0);
    });

    it('GetParticipants returns the synthetic agent when diarization is enabled', async () => {
        const b = new LoopbackBridge();
        await b.Connect(ctx({ SpeakerDiarization: true }));
        const participants = await b.GetParticipants();
        expect(participants.length).toBe(1);
        expect(participants[0].IsAgent).toBe(true);
        expect(participants[0].Role).toBe('Agent');
    });

    it('GetParticipants throws NotSupported when diarization is off (RequireFeature guard)', async () => {
        const b = new LoopbackBridge();
        await b.Connect(ctx({ AudioIn: true }));
        await expect(b.GetParticipants()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('telephony virtuals stay NotSupported (capability gating by example)', async () => {
        const b = new LoopbackBridge();
        await b.Connect(ctx({ AudioIn: true }));
        await expect(b.SendDTMF('1')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
        await expect(b.TransferCall('+1555')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('Disconnect drops handlers and goes offline', async () => {
        const b = new LoopbackBridge();
        let got = 0;
        b.OnMedia(() => got++);
        await b.Connect(ctx({ AudioIn: true, AudioOut: true }));
        await b.Disconnect('Explicit');
        expect(b.IsConnected).toBe(false);
        b.EmitInbound({ Track: 'audio-in', Base64: 'AAAA' });
        expect(got).toBe(0);
    });
});
