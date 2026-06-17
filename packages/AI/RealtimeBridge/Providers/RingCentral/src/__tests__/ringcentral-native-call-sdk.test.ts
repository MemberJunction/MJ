/**
 * Tests for `RingCentralNativeCallSdk` — the **two-way** native RingCentral RingCX / Voice media-stream
 * binding of the telephony seam. Exercises the adapter against a **fake native module + fake call client**
 * (no addon, no network): the pure mappings, the dial/answer + auth (credential hand-off) path, BOTH audio
 * directions (the inbound→PCM path AND the real `sendAudioFrame`→native media-send path), DTMF / transfer /
 * hangup / controls actually reaching the native client, the call-ended signal + teardown, the
 * `BindRingCentralNativeCall` factory, `readNativeConfig` extraction, and the actionable errors (no
 * specifier / addon absent).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    RingCentralNativeCallSdk,
    BindRingCentralNativeCall,
    readNativeConfig,
    mapNativeCallAudio,
    mapNativeClientOptions,
    toArrayBuffer,
    defaultNativeLoader,
    NativeCallModule,
    NativeCallClient,
    NativeCallAudioFrame,
    NativeCallClientOptions,
    NativeDialArgs,
    RingCentralNativeCallConfig,
} from '../ringcentral-native-call-sdk';

/** An in-memory {@link NativeCallClient} with drive helpers + capture sinks (no addon, no network). */
class FakeNativeCallClient implements NativeCallClient {
    public dialed?: NativeDialArgs;
    public answered?: string;
    public hungUp?: string;
    public sentPcm: ArrayBuffer[] = [];
    public sentDigits: string[] = [];
    public transfers: Array<[string, string]> = [];

    private audioCb?: (frame: NativeCallAudioFrame) => void;
    private digitsCb?: (digits: string) => void;
    private endedCb?: () => void;

    async dial(args: NativeDialArgs) {
        this.dialed = args;
        return 'session-1';
    }
    async answer(sessionId: string) {
        this.answered = sessionId;
    }
    async hangup(sessionId: string) {
        this.hungUp = sessionId;
    }
    sendAudio(pcm: ArrayBuffer) {
        this.sentPcm.push(pcm);
    }
    onAudio(cb: (frame: NativeCallAudioFrame) => void) {
        this.audioCb = cb;
    }
    async sendDigits(digits: string) {
        this.sentDigits.push(digits);
    }
    onDigits(cb: (digits: string) => void) {
        this.digitsCb = cb;
    }
    async transfer(sessionId: string, toNumber: string) {
        this.transfers.push([sessionId, toNumber]);
    }
    onEnded(cb: () => void) {
        this.endedCb = cb;
    }

    // ── drive helpers (the "RingCentral" side) ──
    driveAudio(frame: NativeCallAudioFrame) {
        this.audioCb?.(frame);
    }
    driveDigits(digits: string) {
        this.digitsCb?.(digits);
    }
    driveEnded() {
        this.endedCb?.();
    }
}

/** A fake native module returning a single shared {@link FakeNativeCallClient}, capturing the options. */
function fakeModule(client: FakeNativeCallClient): { module: NativeCallModule; seenOptions: NativeCallClientOptions[] } {
    const seenOptions: NativeCallClientOptions[] = [];
    return {
        module: {
            createClient: (options: NativeCallClientOptions) => {
                seenOptions.push(options);
                return client;
            },
        },
        seenOptions,
    };
}

const cfg: RingCentralNativeCallConfig = {
    NativeModuleSpecifier: '@acme/ringcentral-native-addon',
    ClientId: 'cid',
    ClientSecret: 'secret',
    Jwt: 'jwt',
    ServerUrl: 'https://platform.devtest.ringcentral.com',
    SampleRate: 16000,
};

describe('RingCentralNativeCallSdk — pure mappings', () => {
    it('toArrayBuffer copies a Uint8Array view (not aliasing the underlying buffer window)', () => {
        const backing = new Uint8Array([9, 8, 7, 6]).buffer;
        const view = new Uint8Array(backing, 1, 2); // [8,7]
        const out = toArrayBuffer(view);
        expect(out.byteLength).toBe(2);
        expect(new Uint8Array(out)).toEqual(new Uint8Array([8, 7]));
    });

    it('toArrayBuffer passes an ArrayBuffer through unchanged', () => {
        const buf = new ArrayBuffer(4);
        expect(toArrayBuffer(buf)).toBe(buf);
    });

    it('mapNativeCallAudio copies the inbound PCM to a standalone ArrayBuffer', () => {
        const view = new Uint8Array([1, 2, 3]);
        const out = mapNativeCallAudio({ data: view, timestampMs: 99 });
        expect(new Uint8Array(out)).toEqual(view); // copied, equal bytes
    });

    it('mapNativeClientOptions forwards resolved credentials/media opts (and only those)', () => {
        const opts = mapNativeClientOptions(cfg);
        expect(opts).toEqual({
            ClientId: 'cid',
            ClientSecret: 'secret',
            Jwt: 'jwt',
            ServerUrl: 'https://platform.devtest.ringcentral.com',
            SampleRate: 16000,
        });
    });
});

describe('RingCentralNativeCallSdk — lifecycle + auth', () => {
    it('dial() loads the addon with resolved credentials and returns the session id', async () => {
        const client = new FakeNativeCallClient();
        const fake = fakeModule(client);
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fake.module);
        const sessionId = await sdk.dial('+15551112222', '+15553334444', { record: true });
        expect(sessionId).toBe('session-1');
        expect(client.dialed).toEqual({
            toNumber: '+15551112222',
            fromNumber: '+15553334444',
            options: { record: true },
        });
        // auth: the native client was constructed with the upstream-resolved credentials, never inline.
        expect(fake.seenOptions).toHaveLength(1);
        expect(fake.seenOptions[0]).toEqual({
            ClientId: 'cid',
            ClientSecret: 'secret',
            Jwt: 'jwt',
            ServerUrl: 'https://platform.devtest.ringcentral.com',
            SampleRate: 16000,
        });
    });

    it('answer() accepts an inbound session and binds it', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(client).module);
        await sdk.answer('inbound-77');
        expect(client.answered).toBe('inbound-77');
    });

    it('the native client is constructed once (memoized) across dial + sends', async () => {
        const client = new FakeNativeCallClient();
        const fake = fakeModule(client);
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fake.module);
        await sdk.dial('+1', '+2');
        sdk.sendAudioFrame(new ArrayBuffer(2));
        await sdk.sendDtmf('1');
        expect(fake.seenOptions).toHaveLength(1);
    });
});

describe('RingCentralNativeCallSdk — two-way audio', () => {
    it('sendAudioFrame forwards the agent voice to the native media-send path', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(client).module);
        await sdk.dial('+1', '+2');
        const pcm = new Uint8Array([5, 5, 5]).buffer;
        sdk.sendAudioFrame(pcm);
        expect(client.sentPcm).toHaveLength(1);
        expect(client.sentPcm[0]).toBe(pcm);
    });

    it('sendAudioFrame before the call is up is a safe no-op (no throw)', () => {
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(new FakeNativeCallClient()).module);
        expect(() => sdk.sendAudioFrame(new ArrayBuffer(2))).not.toThrow();
    });

    it('inbound native audio is mapped to a PCM ArrayBuffer and delivered to the handler (registered before dial)', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(client).module);
        const heard: ArrayBuffer[] = [];
        sdk.onAudioFrame((pcm) => heard.push(pcm)); // bridge registers BEFORE dialling
        await sdk.dial('+1', '+2');
        client.driveAudio({ data: new Uint8Array([1, 2]) });
        expect(heard).toHaveLength(1);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array([1, 2]));
    });

    it('inbound audio handler registered AFTER the call is up still wires onto the live client', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(client).module);
        await sdk.dial('+1', '+2');
        const heard: ArrayBuffer[] = [];
        sdk.onAudioFrame((pcm) => heard.push(pcm)); // registered after dial
        client.driveAudio({ data: new Uint8Array([9]) });
        expect(heard).toHaveLength(1);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array([9]));
    });
});

describe('RingCentralNativeCallSdk — DTMF, transfer, controls, teardown', () => {
    it('sendDtmf + onDtmf reach the native client (registered before dial)', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(client).module);
        const received: string[] = [];
        sdk.onDtmf((d) => received.push(d));
        await sdk.dial('+1', '+2');
        await sdk.sendDtmf('123#');
        client.driveDigits('9');
        expect(client.sentDigits).toEqual(['123#']);
        expect(received).toEqual(['9']);
    });

    it('transfer reaches the native client', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(client).module);
        await sdk.dial('+1', '+2');
        await sdk.transfer('session-1', '+15559998888');
        expect(client.transfers).toEqual([['session-1', '+15559998888']]);
    });

    it('call-ended fires the handler; hangup releases the client', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new RingCentralNativeCallSdk(cfg, async () => fakeModule(client).module);
        const ended = vi.fn();
        sdk.onCallEnded(ended);
        await sdk.dial('+1', '+2');
        client.driveEnded();
        expect(ended).toHaveBeenCalledOnce();
        await sdk.hangup('session-1');
        expect(client.hungUp).toBe('session-1');
        // after hangup, an outbound frame is a safe no-op (client released)
        expect(() => sdk.sendAudioFrame(new ArrayBuffer(1))).not.toThrow();
        expect(client.sentPcm).toHaveLength(0);
    });
});

describe('RingCentralNativeCallSdk — config + errors', () => {
    it('readNativeConfig extracts typed fields and ignores wrong types', () => {
        const out = readNativeConfig({
            ClientId: 'cid',
            ClientSecret: 'secret',
            Jwt: 'jwt',
            ServerUrl: 'https://x',
            SampleRate: 8000,
            NativeModuleSpecifier: '@acme/addon',
            Bogus: 123,
        });
        expect(out).toEqual({
            ClientId: 'cid',
            ClientSecret: 'secret',
            Jwt: 'jwt',
            ServerUrl: 'https://x',
            SampleRate: 8000,
            NativeModuleSpecifier: '@acme/addon',
        });
    });

    it('readNativeConfig drops non-finite / non-string values', () => {
        const out = readNativeConfig({ SampleRate: NaN, ClientId: 42, ServerUrl: '' });
        expect(out.SampleRate).toBeUndefined();
        expect(out.ClientId).toBeUndefined();
        expect(out.ServerUrl).toBeUndefined();
    });

    it('dial() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new RingCentralNativeCallSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeCallClient()).module);
        await expect(sdk.dial('+1', '+2')).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('defaultNativeLoader throws an actionable error when the addon specifier cannot be resolved', async () => {
        await expect(defaultNativeLoader('@nonexistent/ringcentral-native-addon-xyz')).rejects.toThrow(
            /could not load the native RingCentral media gateway addon/,
        );
    });

    it('BindRingCentralNativeCall builds a working factory from a loose Configuration map', async () => {
        const client = new FakeNativeCallClient();
        const factory = BindRingCentralNativeCall(async () => fakeModule(client).module);
        const sdk = factory(cfg);
        const sessionId = await sdk.dial('+1', '+2');
        expect(sessionId).toBe('session-1');
    });
});
