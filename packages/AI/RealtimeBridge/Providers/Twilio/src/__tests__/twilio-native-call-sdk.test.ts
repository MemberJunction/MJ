/**
 * Tests for `TwilioNativeCallSdk` — the **two-way** native Twilio Programmable Voice + Media Streams
 * binding of the telephony call seam. Exercises the adapter against a **fake native module** (no `twilio`
 * install, no network): the pure native→seam mappings, the dial/answer + auth path, BOTH audio directions
 * (the inbound `media`→seam-callback path AND the real `sendAudioFrame`→native Media-Streams send path),
 * DTMF send/receive, transfer, hangup, call-ended + teardown, the `BindTwilioNativeCall` factory,
 * `readNativeConfig` extraction, and the actionable errors (no specifier / adapter absent).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    TwilioNativeCallSdk,
    BindTwilioNativeCall,
    readNativeConfig,
    mapNativeAudioFrame,
    toArrayBuffer,
    defaultNativeLoader,
    NativeCallModule,
    NativeCallClient,
    NativeCallAudioFrame,
    NativeDialArgs,
} from '../twilio-native-call-sdk';

/** An in-memory {@link NativeCallClient} with drive helpers + capture sinks (no `twilio`, no network). */
class FakeNativeCallClient implements NativeCallClient {
    public dialed?: NativeDialArgs;
    public answered?: string;
    public hungUp: string[] = [];
    public sentPcm: ArrayBuffer[] = [];
    public sentDtmf: string[] = [];
    public transfers: Array<[string, string]> = [];

    private audioCb?: (frame: NativeCallAudioFrame) => void;
    private dtmfCb?: (digits: string) => void;
    private endedCb?: () => void;

    async dial(args: NativeDialArgs) {
        this.dialed = args;
        return 'CA-fake-sid';
    }
    async answer(callId: string) {
        this.answered = callId;
    }
    async hangup(callId: string) {
        this.hungUp.push(callId);
    }
    sendAudioFrame(pcm: ArrayBuffer) {
        this.sentPcm.push(pcm);
    }
    onAudioFrame(cb: (frame: NativeCallAudioFrame) => void) {
        this.audioCb = cb;
    }
    async sendDtmf(digits: string) {
        this.sentDtmf.push(digits);
    }
    onDtmf(cb: (digits: string) => void) {
        this.dtmfCb = cb;
    }
    async transfer(callId: string, toNumber: string) {
        this.transfers.push([callId, toNumber]);
    }
    onCallEnded(cb: () => void) {
        this.endedCb = cb;
    }

    // ── drive helpers (the "Twilio" side) ──
    driveAudio(frame: NativeCallAudioFrame) {
        this.audioCb?.(frame);
    }
    driveDtmf(digits: string) {
        this.dtmfCb?.(digits);
    }
    driveEnded() {
        this.endedCb?.();
    }
}

/** A fake native module returning a single shared {@link FakeNativeCallClient}. */
function fakeModule(client: FakeNativeCallClient): NativeCallModule {
    return { createClient: () => client };
}

const cfg = { NativeModuleSpecifier: '@acme/twilio-native-adapter', AccountSid: 'AC123', AuthToken: 'tok' };

describe('TwilioNativeCallSdk — pure mappings', () => {
    it('toArrayBuffer copies a Uint8Array view (not aliasing the underlying buffer window)', () => {
        const backing = new Uint8Array([9, 8, 7, 6]).buffer;
        const view = new Uint8Array(backing, 1, 2); // [8,7]
        const out = toArrayBuffer(view);
        expect(out.byteLength).toBe(2);
        expect(new Uint8Array(out)).toEqual(new Uint8Array([8, 7]));
    });

    it('toArrayBuffer copies a standalone ArrayBuffer (distinct instance, equal bytes)', () => {
        const ab = new Uint8Array([1, 2, 3]).buffer;
        const out = toArrayBuffer(ab);
        expect(out).not.toBe(ab);
        expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('mapNativeAudioFrame copies the inbound PCM bytes', () => {
        const view = new Uint8Array([4, 5, 6]);
        const out = mapNativeAudioFrame({ data: view, timestampMs: 99 });
        expect(new Uint8Array(out)).toEqual(view);
    });
});

describe('TwilioNativeCallSdk — dial/answer + two-way audio', () => {
    it('dial() loads the adapter, places the outbound call with from/to, and returns the Call SID', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const sid = await sdk.dial('+15551112222', '+15553334444', { recording: true });
        expect(sid).toBe('CA-fake-sid');
        expect(client.dialed?.toNumber).toBe('+15551112222');
        expect(client.dialed?.fromNumber).toBe('+15553334444');
        expect(client.dialed?.extra).toEqual({ recording: true });
    });

    it('answer() accepts the inbound Call SID', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.answer('CA-inbound-1');
        expect(client.answered).toBe('CA-inbound-1');
    });

    it('createClient receives the resolved auth (Account SID + Auth Token) — never inlined', async () => {
        const seen: Array<Record<string, unknown>> = [];
        const client = new FakeNativeCallClient();
        const mod: NativeCallModule = {
            createClient: (options) => {
                seen.push(options);
                return client;
            },
        };
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => mod);
        await sdk.dial('+1', '+2');
        expect(seen[0]).toEqual({
            AccountSid: 'AC123',
            AuthToken: 'tok',
            ApiKeySid: undefined,
            ApiKeySecret: undefined,
            StreamUrl: undefined,
        });
    });

    it('sendAudioFrame forwards the agent voice to the native Media-Streams send path', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.dial('+1', '+2');
        const pcm = new Uint8Array([5, 5, 5]).buffer;
        sdk.sendAudioFrame(pcm);
        expect(client.sentPcm).toHaveLength(1);
        expect(client.sentPcm[0]).toBe(pcm);
    });

    it('sendAudioFrame before a call is a safe no-op (no throw)', () => {
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeCallClient()));
        expect(() => sdk.sendAudioFrame(new ArrayBuffer(2))).not.toThrow();
    });

    it('inbound native audio is mapped to a PCM ArrayBuffer and delivered to the handler (handler set pre-dial)', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const heard: ArrayBuffer[] = [];
        sdk.onAudioFrame((pcm) => heard.push(pcm)); // registered BEFORE the call exists
        await sdk.dial('+1', '+2');
        client.driveAudio({ data: new Uint8Array([1, 2, 3]) });
        expect(heard).toHaveLength(1);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array([1, 2, 3]));
    });
});

describe('TwilioNativeCallSdk — DTMF, transfer, hangup, teardown', () => {
    it('sendDtmf reaches the native client', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.dial('+1', '+2');
        await sdk.sendDtmf('123#');
        expect(client.sentDtmf).toEqual(['123#']);
    });

    it('inbound DTMF events reach the handler (handler set pre-dial)', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const digits: string[] = [];
        sdk.onDtmf((d) => digits.push(d));
        await sdk.dial('+1', '+2');
        client.driveDtmf('7');
        expect(digits).toEqual(['7']);
    });

    it('transfer redirects the live call via the native client', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.dial('+1', '+2');
        await sdk.transfer('CA-fake-sid', '+15559998888');
        expect(client.transfers).toEqual([['CA-fake-sid', '+15559998888']]);
    });

    it('call-ended fires the handler; hangup() releases the call via the native client', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const ended = vi.fn();
        sdk.onCallEnded(ended);
        await sdk.dial('+1', '+2');
        client.driveEnded();
        expect(ended).toHaveBeenCalledOnce();
        await sdk.hangup('CA-fake-sid');
        expect(client.hungUp).toEqual(['CA-fake-sid']);
    });

    it('hangup tolerates native teardown errors (does not throw)', async () => {
        const client = new FakeNativeCallClient();
        client.hangup = async () => {
            throw new Error('boom');
        };
        const sdk = new TwilioNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.dial('+1', '+2');
        await expect(sdk.hangup('CA-fake-sid')).resolves.toBeUndefined();
    });
});

describe('TwilioNativeCallSdk — config + errors + factory', () => {
    it('readNativeConfig extracts typed fields and ignores wrong/extra types', () => {
        const out = readNativeConfig({
            AccountSid: 'AC1',
            AuthToken: 'tok',
            ApiKeySid: 'SK1',
            ApiKeySecret: 'secret',
            StreamUrl: 'wss://stream',
            NativeModuleSpecifier: '@acme/adapter',
            Bogus: 123,
        });
        expect(out).toEqual({
            AccountSid: 'AC1',
            AuthToken: 'tok',
            ApiKeySid: 'SK1',
            ApiKeySecret: 'secret',
            StreamUrl: 'wss://stream',
            NativeModuleSpecifier: '@acme/adapter',
        });
    });

    it('readNativeConfig drops non-string values', () => {
        const out = readNativeConfig({ AccountSid: 42, AuthToken: '', StreamUrl: null });
        expect(out.AccountSid).toBeUndefined();
        expect(out.AuthToken).toBeUndefined();
        expect(out.StreamUrl).toBeUndefined();
    });

    it('dial() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new TwilioNativeCallSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeCallClient()));
        await expect(sdk.dial('+1', '+2')).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('answer() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new TwilioNativeCallSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeCallClient()));
        await expect(sdk.answer('CA-x')).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('defaultNativeLoader throws an actionable error when the adapter specifier cannot be resolved', async () => {
        await expect(defaultNativeLoader('@nonexistent/twilio-native-adapter-xyz')).rejects.toThrow(
            /could not load the native Twilio adapter/,
        );
    });

    it('BindTwilioNativeCall builds a working factory from a loose Configuration map', async () => {
        const client = new FakeNativeCallClient();
        const factory = BindTwilioNativeCall(async () => fakeModule(client));
        const sdk = factory(cfg);
        const sid = await sdk.dial('+1', '+2');
        expect(sid).toBe('CA-fake-sid');
    });
});
