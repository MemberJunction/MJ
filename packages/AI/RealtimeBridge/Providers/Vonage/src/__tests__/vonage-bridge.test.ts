import { describe, it, expect, beforeEach } from 'vitest';
import type { MJAIBridgeProviderEntity_IBridgeProviderFeatures } from '@memberjunction/core-entities';
import {
    RealtimeBridgeContext,
    BridgeMediaFrame,
    BridgeCapabilityNotSupportedError,
    ITelephonyCallSdk,
    DIRECTION_CONFIG_KEY,
    FROM_NUMBER_CONFIG_KEY,
    INBOUND_CALL_ID_CONFIG_KEY,
} from '@memberjunction/ai-bridge-base';
import { VonageBridge } from '../vonage-bridge';
import { VonageCallSdk } from '../vonage-call-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// FakeVonageCallSdk — an in-memory ITelephonyCallSdk with drive helpers and capture
// sinks. No network, no real Vonage client.
// ──────────────────────────────────────────────────────────────────────────────

class FakeVonageCallSdk implements ITelephonyCallSdk {
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
        return 'von-outbound-1';
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
// Helpers.
// ──────────────────────────────────────────────────────────────────────────────

/** The Vonage seed-row capability shape: telephony only — NO video/screen/diarization. */
const VONAGE_FEATURES: MJAIBridgeProviderEntity_IBridgeProviderFeatures = {
    InviteJoin: true,
    OutboundDial: true,
    InboundRouting: true,
    AudioIn: true,
    AudioOut: true,
    DTMF: true,
    CallTransfer: true,
};

function ctx(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures = VONAGE_FEATURES,
    config: Record<string, unknown> = {},
    address = '+15551234567',
): RealtimeBridgeContext {
    return {
        Features: features,
        ProviderName: 'Vonage',
        Address: address,
        Configuration: { [FROM_NUMBER_CONFIG_KEY]: '+15559876543', ...config },
    };
}

/** Builds a VonageBridge wired to a FakeVonageCallSdk via the creation seam. */
function makeBridge(sdk: FakeVonageCallSdk): VonageBridge {
    const bridge = new VonageBridge();
    bridge.SetSdkFactory(() => sdk);
    return bridge;
}

function bytes(...vals: number[]): ArrayBuffer {
    return new Uint8Array(vals).buffer;
}

let sdk: FakeVonageCallSdk;
beforeEach(() => {
    sdk = new FakeVonageCallSdk();
});

// ──────────────────────────────────────────────────────────────────────────────
// Outbound dial → Connect → audio round-trip.
// ──────────────────────────────────────────────────────────────────────────────

describe('VonageBridge — outbound dial', () => {
    it('dials the destination from the agent number and returns the call handles', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx()); // defaults to Outbound
        expect(sdk.Dialed?.to).toBe('+15551234567');
        expect(sdk.Dialed?.from).toBe('+15559876543');
        expect(result.ExternalConnectionId).toBe('von-outbound-1');
        expect(result.BotParticipantId).toBe('agent');
        expect(bridge.CallId).toBe('von-outbound-1');
        expect(bridge.Direction).toBe('Outbound');
    });

    it('round-trips audio: inbound → OnMedia (single-caller label) and outbound → SDK', async () => {
        const bridge = makeBridge(sdk);
        const heard: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => heard.push(f));
        await bridge.Connect(ctx());

        // inbound (what the agent hears)
        sdk.DriveInboundAudio(bytes(1, 2, 3));
        expect(heard.length).toBe(1);
        expect(heard[0].Track).toBe('audio-in');
        expect(heard[0].SpeakerLabel).toBe('caller');
        expect(new Uint8Array(heard[0].Bytes!)).toEqual(new Uint8Array([1, 2, 3]));

        // outbound (the agent's voice)
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(9, 9) });
        expect(new Uint8Array(sdk.SentAudio[0])).toEqual(new Uint8Array([9, 9]));
    });

    it('requires OutboundDial for an outbound call', async () => {
        const bridge = makeBridge(sdk);
        await expect(
            bridge.Connect(ctx({ AudioIn: true, AudioOut: true })),
        ).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Inbound answer.
// ──────────────────────────────────────────────────────────────────────────────

describe('VonageBridge — inbound answer', () => {
    it('answers a routed inbound call and returns its id as the connection', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(
            ctx(VONAGE_FEATURES, { [DIRECTION_CONFIG_KEY]: 'Inbound', [INBOUND_CALL_ID_CONFIG_KEY]: 'von-inbound-9' }),
        );
        expect(sdk.Answered).toBe('von-inbound-9');
        expect(sdk.Dialed).toBeUndefined();
        expect(result.ExternalConnectionId).toBe('von-inbound-9');
        expect(bridge.Direction).toBe('Inbound');
    });

    it('requires InboundRouting for an inbound call', async () => {
        const bridge = makeBridge(sdk);
        await expect(
            bridge.Connect(
                ctx({ AudioIn: true, AudioOut: true }, { [DIRECTION_CONFIG_KEY]: 'Inbound', [INBOUND_CALL_ID_CONFIG_KEY]: 'von-1' }),
            ),
        ).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('throws when an inbound connect omits the InboundCallId', async () => {
        const bridge = makeBridge(sdk);
        await expect(
            bridge.Connect(ctx(VONAGE_FEATURES, { [DIRECTION_CONFIG_KEY]: 'Inbound' })),
        ).rejects.toThrow(/InboundCallId/);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// DTMF send + receive (gated by DTMF).
// ──────────────────────────────────────────────────────────────────────────────

describe('VonageBridge — DTMF', () => {
    it('sends DTMF tones through the SDK', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.SendDTMF('1234#');
        expect(sdk.SentDtmf).toContain('1234#');
    });

    it('receives inbound DTMF via OnDTMF', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const received: string[] = [];
        bridge.OnDTMF((d) => received.push(d));
        sdk.DriveInboundDtmf('7');
        expect(received).toEqual(['7']);
    });

    it('SendDTMF throws when DTMF is disabled (defense-in-depth re-assert)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ OutboundDial: true, AudioIn: true, AudioOut: true })); // no DTMF
        await expect(bridge.SendDTMF('1')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Transfer (gated by CallTransfer).
// ──────────────────────────────────────────────────────────────────────────────

describe('VonageBridge — transfer', () => {
    it('transfers the live call through the SDK', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.TransferCall('+15550001111');
        expect(sdk.Transferred).toEqual({ callId: 'von-outbound-1', to: '+15550001111' });
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

describe('VonageBridge — hangup / call ended', () => {
    it('hangs up the call on Disconnect and clears state', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');
        expect(sdk.HungUp).toBe('von-outbound-1');
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

describe('VonageBridge — participants', () => {
    it('GetParticipants returns the single remote caller + the agent', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const roster = await bridge.GetParticipants();
        expect(roster.length).toBe(2);
        expect(roster.find((p) => p.ExternalId === 'caller')).toMatchObject({ Role: 'Participant', IsAgent: false });
        expect(roster.find((p) => p.ExternalId === 'agent')).toMatchObject({ Role: 'Agent', IsAgent: true });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Capability gating — telephony correctly has NO video / screen / Meeting Controls.
// ──────────────────────────────────────────────────────────────────────────────

describe('VonageBridge — no video / screen / Meeting Controls', () => {
    it('no-ops video/screen out (telephony carries audio only)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(2) });
        expect(sdk.SentAudio.length).toBe(0);
    });

    it('GetMeetingControlsEventSource is null (no facilitator surface on a phone call)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        expect(bridge.GetMeetingControlsEventSource()).toBeNull();
    });

    it('StartRecording stays capability-gated (Vonage seed row does not enable Recording)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.StartRecording()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('Connect requires AudioIn + AudioOut', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.Connect(ctx({ OutboundDial: true, AudioIn: true }))).rejects.toBeInstanceOf(
            BridgeCapabilityNotSupportedError,
        );
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// The default VonageCallSdk (no real client bound) throws the explicit bind-me error.
// ──────────────────────────────────────────────────────────────────────────────

describe('VonageBridge — real Vonage client binding TODO', () => {
    it('a VonageBridge with the default (unbound) Vonage SDK throws bind-me on Connect', async () => {
        const bridge = new VonageBridge(); // default factory → unbound VonageCallSdk
        await expect(bridge.Connect(ctx())).rejects.toThrow(/no real Vonage client bound/i);
    });

    it('the unbound VonageCallSdk throws bind-me from dial directly', async () => {
        const unbound = new VonageCallSdk();
        await expect(unbound.dial('+1555', '+1444')).rejects.toThrow(/no real Vonage client bound/i);
    });
});
