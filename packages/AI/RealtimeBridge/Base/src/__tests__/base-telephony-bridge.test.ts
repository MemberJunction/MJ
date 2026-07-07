import { describe, it, expect, beforeEach, vi } from 'vitest';

// base-telephony-bridge imports LogError from @memberjunction/core (runtime) and the features
// interface as a TYPE alias from core-entities (erased). Stub both so the module graph resolves
// without pulling heavy deps.
vi.mock('@memberjunction/core', () => ({ UserInfo: class {}, LogError: () => {} }));
vi.mock('@memberjunction/core-entities', () => ({}));

import {
    BaseTelephonyBridge,
    ITelephonyCallSdk,
    DIRECTION_CONFIG_KEY,
    FROM_NUMBER_CONFIG_KEY,
    INBOUND_CALL_ID_CONFIG_KEY,
    INBOUND_SAMPLE_RATE_CONFIG_KEY,
    OUTBOUND_SAMPLE_RATE_CONFIG_KEY,
    TELEPHONY_SAMPLE_RATE,
} from '../base-telephony-bridge';
import { RealtimeBridgeContext, IBridgeProviderFeatures } from '../base-realtime-bridge';
import { BridgeMediaFrame } from '../media-tracks';
import { BridgeCapabilityNotSupportedError } from '../capability-errors';

// ──────────────────────────────────────────────────────────────────────────────
// FakeTelephonyCallSdk — in-memory ITelephonyCallSdk with drive helpers + capture sinks.
// No network, no real CPaaS client.
// ──────────────────────────────────────────────────────────────────────────────

class FakeTelephonyCallSdk implements ITelephonyCallSdk {
    public Dialed?: { to: string; from: string; args?: Record<string, unknown> };
    public Answered?: string;
    public HungUp?: string;
    public readonly SentAudio: ArrayBuffer[] = [];
    public readonly SentDtmf: string[] = [];
    public Transferred?: { callId: string; to: string };

    private audioCb?: (pcm: ArrayBuffer) => void;
    private dtmfCb?: (digits: string) => void;
    private endedCb?: () => void;

    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        this.Dialed = { to: toNumber, from: fromNumber, args };
        return 'call-out-1';
    }
    public async answer(callId: string): Promise<void> {
        this.Answered = callId;
    }
    public async hangup(callId: string): Promise<void> {
        this.HungUp = callId;
    }
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.SentAudio.push(pcm);
    }
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioCb = cb;
    }
    public async sendDtmf(digits: string): Promise<void> {
        this.SentDtmf.push(digits);
    }
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfCb = cb;
    }
    public async transfer(callId: string, toNumber: string): Promise<void> {
        this.Transferred = { callId, to: toNumber };
    }
    public onCallEnded(cb: () => void): void {
        this.endedCb = cb;
    }

    // ── drive helpers ──
    public DriveInboundAudio(pcm: ArrayBuffer): void {
        this.audioCb?.(pcm);
    }
    public DriveInboundDtmf(digits: string): void {
        this.dtmfCb?.(digits);
    }
    public DriveCallEnded(): void {
        this.endedCb?.();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// A trivial concrete telephony driver (the base is abstract). Exercises the base entirely;
// adds nothing of its own — exactly what a real driver inherits.
// ──────────────────────────────────────────────────────────────────────────────

class TestTelephonyBridge extends BaseTelephonyBridge {}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers.
// ──────────────────────────────────────────────────────────────────────────────

const TEL_FEATURES: IBridgeProviderFeatures = {
    OutboundDial: true,
    InboundRouting: true,
    InviteJoin: true,
    AudioIn: true,
    AudioOut: true,
    DTMF: true,
    CallTransfer: true,
};

function ctx(
    features: IBridgeProviderFeatures = TEL_FEATURES,
    config: Record<string, unknown> = {},
    address = '+15551234567',
): RealtimeBridgeContext {
    return {
        Features: features,
        ProviderName: 'Twilio',
        Address: address,
        // Default to telephony-native 8 kHz on both legs so media plumbing tests assert byte
        // pass-through; resampling is exercised explicitly by overriding these in the resample test.
        Configuration: {
            [FROM_NUMBER_CONFIG_KEY]: '+15559876543',
            [INBOUND_SAMPLE_RATE_CONFIG_KEY]: TELEPHONY_SAMPLE_RATE,
            [OUTBOUND_SAMPLE_RATE_CONFIG_KEY]: TELEPHONY_SAMPLE_RATE,
            ...config,
        },
    };
}

function makeBridge(sdk: FakeTelephonyCallSdk): TestTelephonyBridge {
    const bridge = new TestTelephonyBridge();
    bridge.SetSdkFactory(() => sdk);
    return bridge;
}

function bytes(...vals: number[]): ArrayBuffer {
    return new Uint8Array(vals).buffer;
}

let sdk: FakeTelephonyCallSdk;
beforeEach(() => {
    sdk = new FakeTelephonyCallSdk();
});

// ──────────────────────────────────────────────────────────────────────────────
// Outbound dial.
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — outbound dial', () => {
    it('dials the destination from the agent number and returns the call handles', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx()); // Direction defaults to Outbound
        expect(sdk.Dialed?.to).toBe('+15551234567');
        expect(sdk.Dialed?.from).toBe('+15559876543');
        expect(result.ExternalConnectionId).toBe('call-out-1');
        expect(result.BotParticipantId).toBe('agent');
        expect(bridge.CallId).toBe('call-out-1');
        expect(bridge.Direction).toBe('Outbound');
    });

    it('explicitly Outbound direction also dials', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx(TEL_FEATURES, { [DIRECTION_CONFIG_KEY]: 'Outbound' }));
        expect(sdk.Dialed).toBeDefined();
        expect(sdk.Answered).toBeUndefined();
    });

    it('requires OutboundDial for an outbound call', async () => {
        const bridge = makeBridge(sdk);
        await expect(
            bridge.Connect(ctx({ AudioIn: true, AudioOut: true })), // no OutboundDial
        ).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('throws an explicit error when no SDK factory is bound (real client TODO)', async () => {
        const bridge = new TestTelephonyBridge(); // no SetSdkFactory
        await expect(bridge.Connect(ctx())).rejects.toThrow(/no telephony call SDK bound/i);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Inbound answer.
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — inbound answer', () => {
    it('answers a routed inbound call and returns its id as the connection', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(
            ctx(TEL_FEATURES, { [DIRECTION_CONFIG_KEY]: 'Inbound', [INBOUND_CALL_ID_CONFIG_KEY]: 'call-in-9' }),
        );
        expect(sdk.Answered).toBe('call-in-9');
        expect(sdk.Dialed).toBeUndefined();
        expect(result.ExternalConnectionId).toBe('call-in-9');
        expect(bridge.Direction).toBe('Inbound');
    });

    it('requires InboundRouting for an inbound call', async () => {
        const bridge = makeBridge(sdk);
        await expect(
            bridge.Connect(
                ctx({ AudioIn: true, AudioOut: true }, { [DIRECTION_CONFIG_KEY]: 'Inbound', [INBOUND_CALL_ID_CONFIG_KEY]: 'c1' }),
            ),
        ).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('throws when an inbound connect has no InboundCallId', async () => {
        const bridge = makeBridge(sdk);
        await expect(
            bridge.Connect(ctx(TEL_FEATURES, { [DIRECTION_CONFIG_KEY]: 'Inbound' })),
        ).rejects.toThrow(/InboundCallId/);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Audio round-trip (audio-in / audio-out), single remote party.
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — media', () => {
    it('forwards inbound audio to OnMedia with the single-caller speaker label', async () => {
        const bridge = makeBridge(sdk);
        const heard: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => heard.push(f));
        await bridge.Connect(ctx());

        sdk.DriveInboundAudio(bytes(1, 2, 3));

        expect(heard.length).toBe(1);
        expect(heard[0].Track).toBe('audio-in');
        expect(heard[0].SpeakerLabel).toBe('caller'); // single remote party — trivial diarization
        expect(new Uint8Array(heard[0].Bytes!)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('sends outbound audio frames to the SDK', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(9, 9) });
        expect(sdk.SentAudio.length).toBe(1);
        expect(new Uint8Array(sdk.SentAudio[0])).toEqual(new Uint8Array([9, 9]));
    });

    it('decodes a base64 outbound audio frame before sending', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('audio-out', { Track: 'audio-out', Base64: 'AQID' }); // [1,2,3]
        expect(new Uint8Array(sdk.SentAudio[0])).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('resamples model-rate audio to the carrier 8 kHz on both legs (no "deep/slow" pitch error)', async () => {
        const bridge = makeBridge(sdk);
        const heard: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => heard.push(f));
        // OpenAI-style 24 kHz model on both legs — the production case.
        await bridge.Connect(ctx(TEL_FEATURES, { [INBOUND_SAMPLE_RATE_CONFIG_KEY]: 24000, [OUTBOUND_SAMPLE_RATE_CONFIG_KEY]: 24000 }));

        // Outbound: 24 kHz model audio (1200 PCM16 samples = 2400 bytes) must shrink ~3× to 8 kHz.
        const outboundSamples = 1200;
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: new ArrayBuffer(outboundSamples * 2) });
        const sentSamples = sdk.SentAudio[0].byteLength / 2;
        expect(sentSamples).toBeGreaterThan(outboundSamples / 3 - 5);
        expect(sentSamples).toBeLessThan(outboundSamples / 3 + 5);

        // Inbound: 8 kHz caller audio (400 samples) must grow ~3× to the model's 24 kHz.
        const inboundSamples = 400;
        sdk.DriveInboundAudio(new ArrayBuffer(inboundSamples * 2));
        const heardSamples = heard[0].Bytes!.byteLength / 2;
        expect(heardSamples).toBeGreaterThan(inboundSamples * 3 - 5);
        expect(heardSamples).toBeLessThan(inboundSamples * 3 + 5);
    });

    it('drops outbound audio when not connected', () => {
        const bridge = makeBridge(sdk);
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(1) });
        expect(sdk.SentAudio.length).toBe(0);
    });

    it('no-ops video/screen out (telephony carries audio only)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(2) });
        expect(sdk.SentAudio.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// DTMF send + receive (gated).
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — DTMF', () => {
    it('sends DTMF tones through the SDK', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.SendDTMF('123#');
        expect(sdk.SentDtmf).toContain('123#');
    });

    it('receives inbound DTMF via OnDTMF', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const received: string[] = [];
        bridge.OnDTMF((d) => received.push(d));
        sdk.DriveInboundDtmf('5');
        sdk.DriveInboundDtmf('#');
        expect(received).toEqual(['5', '#']);
    });

    it('SendDTMF throws when DTMF is disabled (defense-in-depth re-assert)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ OutboundDial: true, InboundRouting: true, AudioIn: true, AudioOut: true })); // no DTMF
        await expect(bridge.SendDTMF('1')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('OnDTMF throws when DTMF is disabled', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ OutboundDial: true, InboundRouting: true, AudioIn: true, AudioOut: true })); // no DTMF
        expect(() => bridge.OnDTMF(() => {})).toThrow(BridgeCapabilityNotSupportedError);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Transfer (gated).
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — transfer', () => {
    it('transfers the live call through the SDK', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.TransferCall('+15550009999');
        expect(sdk.Transferred).toEqual({ callId: 'call-out-1', to: '+15550009999' });
    });

    it('TransferCall throws when CallTransfer is disabled', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ OutboundDial: true, AudioIn: true, AudioOut: true })); // no CallTransfer
        await expect(bridge.TransferCall('+1555')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hangup + onCallEnded.
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — hangup / call ended', () => {
    it('hangs up the call on Disconnect and clears state', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');
        expect(sdk.HungUp).toBe('call-out-1');
        expect(bridge.CallId).toBeNull();
    });

    it('a call-ended signal empties the roster and fires the call-ended handler', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        let lastRoster: number | null = null;
        bridge.OnParticipantChange((p) => (lastRoster = p.length));
        let ended = false;
        bridge.OnCallEnded(() => (ended = true));

        sdk.DriveCallEnded();

        expect(lastRoster).toBe(0);
        expect(ended).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Participants — the single caller + agent.
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — participants', () => {
    it('GetParticipants returns the single remote caller + the agent', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const roster = await bridge.GetParticipants();
        expect(roster.length).toBe(2);
        const caller = roster.find((p) => p.ExternalId === 'caller');
        const agent = roster.find((p) => p.ExternalId === 'agent');
        expect(caller).toMatchObject({ Role: 'Participant', IsAgent: false });
        expect(agent).toMatchObject({ Role: 'Agent', IsAgent: true });
    });

    it('outbound caller display name is the dialled number', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const roster = await bridge.GetParticipants();
        expect(roster.find((p) => p.ExternalId === 'caller')?.DisplayName).toBe('+15551234567');
    });

    it('OnParticipantChange emits the roster immediately to a late subscriber', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        let count = 0;
        bridge.OnParticipantChange((p) => (count = p.length));
        expect(count).toBe(2);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Capability gating — telephony has NO video / screen / Meeting Controls.
// ──────────────────────────────────────────────────────────────────────────────

describe('BaseTelephonyBridge — no video / screen / Meeting Controls', () => {
    it('GetMeetingControlsEventSource is null (no facilitator surface on a 1:1 call)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        expect(bridge.GetMeetingControlsEventSource()).toBeNull();
    });

    it('StartRecording stays capability-gated (not enabled on the test features)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.StartRecording()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('Connect requires AudioIn + AudioOut (a call minimum)', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.Connect(ctx({ OutboundDial: true, AudioIn: true }))).rejects.toBeInstanceOf(
            BridgeCapabilityNotSupportedError,
        );
    });
});
