/**
 * Tests for `VonageNativeCallSdk` — the **two-way** native Vonage Voice client binding. Exercises the
 * adapter against a **fake native module** (no SDK, no network): the pure native→seam mappings, the
 * dial/answer + auth path, BOTH audio directions (the inbound media → seam-PCM path AND the real
 * `sendAudioFrame` → native WebSocket-media send path), DTMF send/receive, transfer, hangup, the
 * call-ended signal + teardown, the `BindVonageNativeCall` factory, `readNativeConfig` extraction, and the
 * actionable errors (no specifier / module absent).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    VonageNativeCallSdk,
    BindVonageNativeCall,
    readNativeConfig,
    mapNativeMediaFrame,
    toArrayBuffer,
    defaultNativeLoader,
    NativeCallModule,
    NativeCallClient,
    NativeMediaFrame,
    NativePlaceCallArgs,
    NativeClientOptions,
} from '../vonage-native-call-sdk';

/** An in-memory {@link NativeCallClient} with drive helpers + capture sinks (no SDK, no network). */
class FakeNativeCallClient implements NativeCallClient {
    public placed?: NativePlaceCallArgs;
    public accepted?: string;
    public ended?: string;
    public sentPcm: ArrayBuffer[] = [];
    public sentDigits: Array<[string, string]> = [];
    public transfers: Array<[string, string]> = [];

    private mediaCb?: (media: NativeMediaFrame) => void;
    private digitsCb?: (digits: string) => void;
    private statusCb?: () => void;

    constructor(public readonly uuid: string = 'call-uuid-1') {}

    async placeCall(args: NativePlaceCallArgs) {
        this.placed = args;
        return this.uuid;
    }
    async acceptInbound(callUuid: string) {
        this.accepted = callUuid;
    }
    async endCall(callUuid: string) {
        this.ended = callUuid;
    }
    writeMedia(_callUuid: string, pcm: ArrayBuffer) {
        this.sentPcm.push(pcm);
    }
    onMedia(_callUuid: string, cb: (media: NativeMediaFrame) => void) {
        this.mediaCb = cb;
    }
    async sendDigits(callUuid: string, digits: string) {
        this.sentDigits.push([callUuid, digits]);
    }
    onDigits(_callUuid: string, cb: (digits: string) => void) {
        this.digitsCb = cb;
    }
    async transferCall(callUuid: string, toNumber: string) {
        this.transfers.push([callUuid, toNumber]);
    }
    onCallStatus(_callUuid: string, cb: () => void) {
        this.statusCb = cb;
    }

    // ── drive helpers (the "Vonage" side) ──
    driveMedia(frame: NativeMediaFrame) {
        this.mediaCb?.(frame);
    }
    driveDigits(digits: string) {
        this.digitsCb?.(digits);
    }
    driveEnded() {
        this.statusCb?.();
    }
}

/** A fake native module returning a single shared {@link FakeNativeCallClient} and capturing its options. */
function fakeModule(client: FakeNativeCallClient): { module: NativeCallModule; lastOptions: () => NativeClientOptions | undefined } {
    let captured: NativeClientOptions | undefined;
    return {
        module: {
            createClient: (options: NativeClientOptions) => {
                captured = options;
                return client;
            },
        },
        lastOptions: () => captured,
    };
}

const cfg = {
    NativeModuleSpecifier: '@acme/vonage-native-voice',
    ApplicationId: 'app-123',
    PrivateKey: 'pk-pem',
    ApiKey: 'key',
    ApiSecret: 'secret',
    WebsocketMediaUrl: 'wss://media.example/agent',
};

describe('VonageNativeCallSdk — pure mappings', () => {
    it('toArrayBuffer copies a Uint8Array view (not aliasing the underlying buffer window)', () => {
        const backing = new Uint8Array([9, 8, 7, 6]).buffer;
        const view = new Uint8Array(backing, 1, 2); // [8,7]
        const out = toArrayBuffer(view);
        expect(out.byteLength).toBe(2);
        expect(new Uint8Array(out)).toEqual(new Uint8Array([8, 7]));
    });

    it('toArrayBuffer copies a standalone ArrayBuffer (caller never aliases the source)', () => {
        const src = new Uint8Array([1, 2, 3]).buffer;
        const out = toArrayBuffer(src);
        expect(out).not.toBe(src);
        expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('mapNativeMediaFrame copies the inbound PCM to an equal ArrayBuffer', () => {
        const view = new Uint8Array([4, 5, 6]);
        const out = mapNativeMediaFrame({ data: view });
        expect(new Uint8Array(out)).toEqual(view);
    });
});

describe('VonageNativeCallSdk — dial/answer + auth + two-way audio', () => {
    it('dial() loads the module, constructs a client with resolved Voice creds, and returns the call UUID', async () => {
        const client = new FakeNativeCallClient();
        const fake = fakeModule(client);
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fake.module);
        const uuid = await sdk.dial('+15558675309', '+15551112222', { region: 'us' });
        expect(uuid).toBe('call-uuid-1');
        expect(client.placed).toEqual({ to: '+15558675309', from: '+15551112222', options: { region: 'us' } });
        // Auth resolved upstream and passed straight to the native client factory.
        expect(fake.lastOptions()).toEqual({
            ApplicationId: 'app-123',
            PrivateKey: 'pk-pem',
            ApiKey: 'key',
            ApiSecret: 'secret',
            WebsocketMediaUrl: 'wss://media.example/agent',
        });
    });

    it('answer() accepts the inbound WebSocket media leg for the delivered call UUID', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        await sdk.answer('inbound-uuid-9');
        expect(client.accepted).toBe('inbound-uuid-9');
    });

    it('sendAudioFrame forwards the agent voice to the native WebSocket media send path', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        await sdk.dial('+1', '+2');
        const pcm = new Uint8Array([5, 5, 5]).buffer;
        sdk.sendAudioFrame(pcm);
        expect(client.sentPcm).toHaveLength(1);
        expect(client.sentPcm[0]).toBe(pcm);
    });

    it('sendAudioFrame before the call exists is a safe no-op (no throw)', () => {
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeCallClient()).module);
        expect(() => sdk.sendAudioFrame(new ArrayBuffer(2))).not.toThrow();
    });

    it('inbound native media is mapped to a copied PCM ArrayBuffer and delivered to the handler', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        const heard: ArrayBuffer[] = [];
        sdk.onAudioFrame((pcm) => heard.push(pcm));
        await sdk.dial('+1', '+2');
        client.driveMedia({ data: new Uint8Array([7, 8]) });
        expect(heard).toHaveLength(1);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array([7, 8]));
    });

    it('a handler registered AFTER the call is live still attaches and receives inbound media', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        await sdk.dial('+1', '+2');
        const heard: ArrayBuffer[] = [];
        sdk.onAudioFrame((pcm) => heard.push(pcm));
        client.driveMedia({ data: new Uint8Array([1]) });
        expect(heard).toHaveLength(1);
    });
});

describe('VonageNativeCallSdk — DTMF, transfer, controls, teardown', () => {
    it('sendDtmf reaches the native client for the active call', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        await sdk.dial('+1', '+2');
        await sdk.sendDtmf('123#');
        expect(client.sentDigits).toEqual([['call-uuid-1', '123#']]);
    });

    it('inbound DTMF reaches the registered handler', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        const digits: string[] = [];
        sdk.onDtmf((d) => digits.push(d));
        await sdk.dial('+1', '+2');
        client.driveDigits('9');
        expect(digits).toEqual(['9']);
    });

    it('transfer reaches the native client', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        await sdk.dial('+1', '+2');
        await sdk.transfer('call-uuid-1', '+15559998888');
        expect(client.transfers).toEqual([['call-uuid-1', '+15559998888']]);
    });

    it('call-ended fires the handler; hangup() ends the call and clears the active UUID', async () => {
        const client = new FakeNativeCallClient();
        const sdk = new VonageNativeCallSdk(readNativeConfig(cfg), async () => fakeModule(client).module);
        const ended = vi.fn();
        sdk.onCallEnded(ended);
        await sdk.dial('+1', '+2');
        client.driveEnded();
        expect(ended).toHaveBeenCalledOnce();
        await sdk.hangup('call-uuid-1');
        expect(client.ended).toBe('call-uuid-1');
        // After hangup the active UUID is cleared, so outbound media no-ops.
        sdk.sendAudioFrame(new ArrayBuffer(1));
        expect(client.sentPcm).toHaveLength(0);
    });
});

describe('VonageNativeCallSdk — config + errors + factory', () => {
    it('readNativeConfig extracts typed fields and ignores wrong types', () => {
        const out = readNativeConfig({
            ApplicationId: 'app',
            PrivateKey: 'pk',
            ApiKey: 'k',
            ApiSecret: 's',
            WebsocketMediaUrl: 'wss://x',
            NativeModuleSpecifier: '@acme/mod',
            Bogus: 123,
        });
        expect(out).toEqual({
            ApplicationId: 'app',
            PrivateKey: 'pk',
            ApiKey: 'k',
            ApiSecret: 's',
            WebsocketMediaUrl: 'wss://x',
            NativeModuleSpecifier: '@acme/mod',
        });
    });

    it('readNativeConfig drops non-string / empty values', () => {
        const out = readNativeConfig({ ApplicationId: 42, PrivateKey: '', ApiKey: true });
        expect(out.ApplicationId).toBeUndefined();
        expect(out.PrivateKey).toBeUndefined();
        expect(out.ApiKey).toBeUndefined();
    });

    it('dial() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new VonageNativeCallSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeCallClient()).module);
        await expect(sdk.dial('+1', '+2')).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('answer() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new VonageNativeCallSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeCallClient()).module);
        await expect(sdk.answer('inbound-1')).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('defaultNativeLoader throws an actionable error when the module specifier cannot be resolved', async () => {
        await expect(defaultNativeLoader('@nonexistent/vonage-native-voice-xyz')).rejects.toThrow(
            /could not load the native Vonage Voice client module/,
        );
    });

    it('BindVonageNativeCall builds a working factory from a loose Configuration map', async () => {
        const client = new FakeNativeCallClient();
        const factory = BindVonageNativeCall(async () => fakeModule(client).module);
        const sdk = factory(cfg);
        const uuid = await sdk.dial('+1', '+2');
        expect(uuid).toBe('call-uuid-1');
    });
});
