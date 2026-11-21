import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EncodeRecordingShard } from '@memberjunction/ai-core-plus';
// The runtime exports only the window's type; the real class lets SendRecordingTerminal run for real.
import { RecordingShardWindow } from '@memberjunction/realtime-runtime/dist/session/RecordingShardWindow';
import type { IRecordingTransport, RecordingTerminalInput } from '@memberjunction/realtime-runtime';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    PageHideEventTarget,
    RealtimeSessionService,
    VisibilityEventSource,
} from '../lib/services/realtime-session.service';
import { RealtimeAudioRecorder } from '../lib/services/realtime-audio-recorder';
import type { IOpusPacketEncoder } from '../lib/services/recording/opus-packet-encoder';

/** Exposes the protected wiring so a node test can hand it fake `window` / `document` targets. */
class TestableSessionService extends RealtimeSessionService {
    public Wire(page: PageHideEventTarget, visibility: VisibilityEventSource): void {
        this.WireRecordingTerminalTriggers(page, visibility);
    }
}

/** A fake event target that records every listener and can fire them. */
class FakeTarget {
    public visibilityState: DocumentVisibilityState = 'visible';
    public Listeners = new Map<string, Array<(event: { persisted: boolean }) => void>>();
    public addEventListener(type: string, listener: (event: { persisted: boolean }) => void): void {
        this.Listeners.set(type, [...(this.Listeners.get(type) ?? []), listener]);
    }
    /** `event` is what a `pagehide` carries; a terminal (non-bfcache) hide by default. */
    public Fire(type: string, event: { persisted: boolean } = { persisted: false }): void {
        for (const listener of this.Listeners.get(type) ?? []) listener(event);
    }
}

/** An encoder whose Encode/Flush must never run from a page-lifecycle handler. */
function spyEncoder(packets: Uint8Array[]): IOpusPacketEncoder & { Encode: Mock<(pcm48k: Float32Array) => void>; Flush: Mock<() => Promise<void>> } {
    return {
        Kind: 'wasm',
        Encode: vi.fn<(pcm48k: Float32Array) => void>(),
        Flush: vi.fn(async (): Promise<void> => undefined),
        TakePackets: () => packets.splice(0),
        Close: () => undefined,
    };
}

describe('RealtimeSessionService — recording terminal on pagehide / visibilitychange (#5294)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('pagehide calls SendRecordingTerminal exactly once', () => {
        const service = new TestableSessionService();
        const send = vi.spyOn(service, 'SendRecordingTerminal').mockImplementation(() => undefined);
        const page = new FakeTarget();
        service.Wire(page, new FakeTarget());
        page.Fire('pagehide');
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('visibilitychange to hidden calls SendRecordingTerminal exactly once; to visible it does not', () => {
        const service = new TestableSessionService();
        const send = vi.spyOn(service, 'SendRecordingTerminal').mockImplementation(() => undefined);
        const doc = new FakeTarget();
        service.Wire(new FakeTarget(), doc);

        doc.visibilityState = 'visible';
        doc.Fire('visibilitychange');
        expect(send).not.toHaveBeenCalled();

        doc.visibilityState = 'hidden';
        doc.Fire('visibilitychange');
        expect(send).toHaveBeenCalledTimes(1);
        // The call may go on after a hide, so the server must not assemble the recording right away.
        expect(send).toHaveBeenCalledWith({ Final: false });
    });

    it('pagehide sends a final terminal', () => {
        const service = new TestableSessionService();
        const send = vi.spyOn(service, 'SendRecordingTerminal').mockImplementation(() => undefined);
        const page = new FakeTarget();
        service.Wire(page, new FakeTarget());
        page.Fire('pagehide');
        expect(send).toHaveBeenCalledWith({ Final: true });
    });

    it('the constructor wires pagehide + visibilitychange on window/document and adds no beforeunload listener', () => {
        const win = new FakeTarget();
        const doc = new FakeTarget();
        vi.stubGlobal('window', win);
        vi.stubGlobal('document', doc);
        const service = new RealtimeSessionService();
        const send = vi.spyOn(service, 'SendRecordingTerminal').mockImplementation(() => undefined);

        expect([...win.Listeners.keys()]).toEqual(['pagehide']);
        expect([...doc.Listeners.keys()]).toEqual(['visibilitychange']);
        expect(win.Listeners.has('beforeunload')).toBe(false);
        win.Fire('pagehide');
        doc.visibilityState = 'hidden';
        doc.Fire('visibilitychange');
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('the constructor wires nothing (and does not throw) where there is no window/document', () => {
        expect(() => new RealtimeSessionService()).not.toThrow();
    });

    it('the real handler sends the terminal with the packets already encoded — no IndexedDB, no Encode/Flush', () => {
        const open = vi.fn();
        vi.stubGlobal('indexedDB', { open });
        const service = new TestableSessionService();
        const page = new FakeTarget();
        service.Wire(page, new FakeTarget());

        // A live recording mid-call: three packets already encoded and waiting.
        const recorder = new RealtimeAudioRecorder(async () => encoder);
        const encoder = spyEncoder([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])]);
        (recorder as unknown as { encoder: IOpusPacketEncoder }).encoder = encoder;
        const terminals: RecordingTerminalInput[] = [];
        const transport: IRecordingTransport = {
            UploadShard: vi.fn(async () => 'Acked' as const),
            SendTerminal: vi.fn(async (_id: string, input: RecordingTerminalInput) => {
                terminals.push(input);
                return true;
            }),
        };
        const internals = service as unknown as { recorder: unknown; recordingShards: unknown };
        internals.recorder = recorder;
        internals.recordingShards = {
            SessionID: 'session-1',
            Window: new RecordingShardWindow(),
            Queue: { Flush: vi.fn(async () => undefined), Close: vi.fn(), Unacknowledged: () => [] },
            Transport: transport,
        };

        page.Fire('pagehide');

        expect(terminals).toHaveLength(1);
        const tail = terminals[0].Tail!;
        expect(tail).toEqual(EncodeRecordingShard({
            ShardIndex: 0,
            StartSample: 0,
            SampleCount: 3 * 960,
            PacketCount: 3,
            Packets: [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])],
        }));
        expect(open).not.toHaveBeenCalled();
        expect(encoder.Encode).not.toHaveBeenCalled();
        expect(encoder.Flush).not.toHaveBeenCalled();
    });

    it('a terminal pagehide with a live call closes the server session with a keepalive CloseAgentSession (F15)', () => {
        // Without it, a closed tab left the session `Active` until the janitor's 15-minute idle sweep.
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { CloseAgentSession: true } }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const service = new TestableSessionService();
        service.Provider = { ConfigData: { URL: 'https://api.example/graphql', Token: 'jwt-1' } } as unknown as IMetadataProvider;
        (service as unknown as { agentSessionId: string | null }).agentSessionId = 'session-9';
        const page = new FakeTarget();
        service.Wire(page, new FakeTarget());

        page.Fire('pagehide', { persisted: false });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.example/graphql');
        expect(init.keepalive).toBe(true);
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt-1');
        const body = JSON.parse(String(init.body)) as { query: string; variables: Record<string, string> };
        expect(body.query).toContain('CloseAgentSession');
        expect(body.variables).toEqual({ agentSessionId: 'session-9', closeReason: 'Explicit' });
    });

    it('a pagehide into the back/forward cache (persisted) does not close the session: the page may come back', () => {
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const service = new TestableSessionService();
        service.Provider = { ConfigData: { URL: 'https://api.example/graphql', Token: 'jwt-1' } } as unknown as IMetadataProvider;
        (service as unknown as { agentSessionId: string | null }).agentSessionId = 'session-9';
        const page = new FakeTarget();
        const doc = new FakeTarget();
        service.Wire(page, doc);

        page.Fire('pagehide', { persisted: true });
        doc.visibilityState = 'hidden';
        doc.Fire('visibilitychange');

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('BrowserRecordingUnloadGuard no longer exists', () => {
        expect(existsSync(resolve(__dirname, '../lib/services/browser-recording-unload-guard.ts'))).toBe(false);
    });
});
