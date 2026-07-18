import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import { RawRealtimeWebSocketConnection } from '../models/rawRealtimeWebSocketConnection';

/** In-memory fake of the platform WebSocket the adapter drives. */
class FakeNativeWebSocket {
    public static Instances: FakeNativeWebSocket[] = [];
    public Url: string;
    public Sent: string[] = [];
    public Closed = false;
    public onopen: (() => void) | null = null;
    public onmessage: ((event: { data: unknown }) => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

    constructor(url: string) {
        this.Url = url;
        FakeNativeWebSocket.Instances.push(this);
    }
    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }
    // ── test drivers ──
    public Open(): void {
        this.onopen?.();
    }
    public Receive(frame: unknown): void {
        this.onmessage?.({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
    }
    public Fail(): void {
        this.onerror?.();
    }
    public CloseFromServer(): void {
        this.onclose?.({ code: 1006, reason: 'gone' });
    }
    public SentFrames(): Array<Record<string, unknown>> {
        return this.Sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    }
}

function makeConnection(url = 'ws://localhost:8000/v1/realtime'): { conn: RawRealtimeWebSocketConnection; ws: FakeNativeWebSocket } {
    const conn = new RawRealtimeWebSocketConnection(url, FakeNativeWebSocket as unknown as new (u: string) => FakeNativeWebSocket);
    const ws = FakeNativeWebSocket.Instances.at(-1)!;
    return { conn, ws };
}

describe('RawRealtimeWebSocketConnection', () => {
    beforeEach(() => {
        FakeNativeWebSocket.Instances = [];
    });

    describe('construction + URL', () => {
        it('opens the raw socket against the exact URL it was given', () => {
            const { ws } = makeConnection('ws://hf.internal:9000/v1/realtime');
            expect(ws.Url).toBe('ws://hf.internal:9000/v1/realtime');
        });

        it('throws a clear error when no WebSocket implementation exists', () => {
            const g = globalThis as unknown as { WebSocket?: unknown };
            const saved = g.WebSocket;
            delete g.WebSocket;
            try {
                expect(() => new RawRealtimeWebSocketConnection('ws://x')).toThrow(/global WebSocket/);
            } finally {
                if (saved !== undefined) g.WebSocket = saved as never;
            }
        });
    });

    describe('outbound buffering until open', () => {
        it('buffers sends made before the socket opens and flushes them IN ORDER on open', () => {
            const { conn, ws } = makeConnection();
            conn.send({ type: 'session.update', session: { type: 'realtime', instructions: 'a' } } as RealtimeClientEvent);
            conn.send({ type: 'response.create' } as RealtimeClientEvent);
            expect(ws.Sent).toHaveLength(0); // nothing on the wire yet
            ws.Open();
            const frames = ws.SentFrames();
            expect(frames.map((f) => f.type)).toEqual(['session.update', 'response.create']);
        });

        it('sends immediately once open (no residual buffering)', () => {
            const { conn, ws } = makeConnection();
            ws.Open();
            conn.send({ type: 'response.create' } as RealtimeClientEvent);
            expect(ws.SentFrames().map((f) => f.type)).toEqual(['response.create']);
        });

        it('drops buffered sends when closed before ever opening', () => {
            const { conn, ws } = makeConnection();
            conn.send({ type: 'response.create' } as RealtimeClientEvent);
            conn.close();
            ws.Open(); // even a (pathological) late open must not flush the dropped frames
            expect(ws.Sent).toHaveLength(0);
            expect(ws.Closed).toBe(true);
        });
    });

    describe('inbound event fan-out', () => {
        it('parses JSON frames and fans them out to every event listener', () => {
            const { conn, ws } = makeConnection();
            const a = vi.fn();
            const b = vi.fn();
            conn.on('event', a);
            conn.on('event', b);
            ws.Receive({ type: 'session.created' });
            expect(a).toHaveBeenCalledWith({ type: 'session.created' });
            expect(b).toHaveBeenCalledWith({ type: 'session.created' });
        });

        it('off() removes exactly the given listener', () => {
            const { conn, ws } = makeConnection();
            const a = vi.fn();
            const b = vi.fn();
            conn.on('event', a);
            conn.on('event', b);
            conn.off('event', a);
            ws.Receive({ type: 'response.created' });
            expect(a).not.toHaveBeenCalled();
            expect(b).toHaveBeenCalledTimes(1);
        });

        it('silently ignores non-JSON frames', () => {
            const { conn, ws } = makeConnection();
            const a = vi.fn();
            conn.on('event', a);
            ws.Receive('this is not json {');
            expect(a).not.toHaveBeenCalled();
        });

        it('handles a listener being removed by a sibling mid-dispatch (snapshot iteration)', () => {
            const { conn, ws } = makeConnection();
            const b = vi.fn();
            const a = vi.fn(() => conn.off('event', b));
            conn.on('event', a);
            conn.on('event', b);
            ws.Receive({ type: 'response.created' });
            // The dispatch snapshot means b still saw THIS frame; removal applies to the next one.
            expect(b).toHaveBeenCalledTimes(1);
            ws.Receive({ type: 'response.done', response: {} });
            expect(b).toHaveBeenCalledTimes(1);
        });

        it('preserves large / unicode payloads verbatim through the JSON hop', () => {
            const { conn, ws } = makeConnection();
            const seen: RealtimeServerEvent[] = [];
            conn.on('event', (e) => seen.push(e));
            const big = '🎤 Ünïcode — ' + 'x'.repeat(50_000);
            ws.Receive({ type: 'response.output_audio_transcript.done', transcript: big });
            expect((seen[0] as { transcript?: string }).transcript).toBe(big);
        });
    });

    describe('the dual error channel (SDK contract mirror)', () => {
        it("re-routes provider 'error' FRAMES to the error channel with the payload attached (recoverable downstream)", () => {
            const { conn, ws } = makeConnection();
            const events = vi.fn();
            const errors: OpenAIRealtimeError[] = [];
            conn.on('event', events);
            conn.on('error', (e) => errors.push(e));
            ws.Receive({ type: 'error', error: { message: 'bad session field', code: 'invalid_request' } });
            // NEVER delivered through the event firehose — mirrors OpenAIRealtimeWebSocket.
            expect(events).not.toHaveBeenCalled();
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toBe('bad session field');
            expect(errors[0].error).toMatchObject({ code: 'invalid_request' });
        });

        it('routes TRANSPORT failures to the error channel with NO payload (fatal downstream)', () => {
            const { conn, ws } = makeConnection();
            const errors: OpenAIRealtimeError[] = [];
            conn.on('error', (e) => errors.push(e));
            ws.Fail();
            expect(errors).toHaveLength(1);
            expect(errors[0].error).toBeUndefined();
        });

        it('tolerates an error frame with no error body', () => {
            const { conn, ws } = makeConnection();
            const errors: OpenAIRealtimeError[] = [];
            conn.on('error', (e) => errors.push(e));
            ws.Receive({ type: 'error' });
            expect(errors).toHaveLength(1);
            expect(errors[0].message).toBe('realtime provider error');
        });

        it('off() removes error listeners too', () => {
            const { conn, ws } = makeConnection();
            const a = vi.fn();
            conn.on('error', a);
            conn.off('error', a);
            ws.Fail();
            expect(a).not.toHaveBeenCalled();
        });
    });

    describe('close shim', () => {
        it('fires registered socket close listeners when the server closes', () => {
            const { conn, ws } = makeConnection();
            const closed = vi.fn();
            conn.socket.addEventListener('close', closed);
            ws.CloseFromServer();
            expect(closed).toHaveBeenCalledTimes(1);
        });

        it('supports multiple close listeners', () => {
            const { conn, ws } = makeConnection();
            const a = vi.fn();
            const b = vi.fn();
            conn.socket.addEventListener('close', a);
            conn.socket.addEventListener('close', b);
            ws.CloseFromServer();
            expect(a).toHaveBeenCalledTimes(1);
            expect(b).toHaveBeenCalledTimes(1);
        });

        it('close() terminates the underlying socket', () => {
            const { conn, ws } = makeConnection();
            ws.Open();
            conn.close();
            expect(ws.Closed).toBe(true);
        });
    });
});

describe('QA hardening regressions (adapter A-items)', () => {
    beforeEach(() => {
        FakeNativeWebSocket.Instances = [];
    });

    it('A1: a BODYLESS error frame still carries a synthesized provider payload (recoverable downstream)', () => {
        const { conn, ws } = makeConnection();
        const errors: OpenAIRealtimeError[] = [];
        conn.on('error', (e) => errors.push(e));
        ws.Receive({ type: 'error' });
        expect(errors).toHaveLength(1);
        expect(errors[0].error).toBeDefined(); // payload PRESENT → downstream classifies non-fatal
        ws.Receive({ type: 'error', message: 'flat message style' });
        expect(errors[1].error).toBeDefined();
        expect(errors[1].message).toBe('flat message style');
    });

    it('A1: transport failures still carry NO payload (fatal downstream)', () => {
        const { conn, ws } = makeConnection();
        const errors: OpenAIRealtimeError[] = [];
        conn.on('error', (e) => errors.push(e));
        ws.Fail();
        expect(errors[0].error).toBeUndefined();
    });

    it('A7: a transport error before open clears the pending send buffer', () => {
        const { conn, ws } = makeConnection();
        conn.send({ type: 'response.create' } as RealtimeClientEvent);
        ws.Fail();
        ws.Open(); // pathological late open must not flush dead frames
        expect(ws.Sent).toHaveLength(0);
    });

    it('A7: send after server-initiated close is a safe no-op', () => {
        const { conn, ws } = makeConnection();
        ws.Open();
        ws.CloseFromServer();
        expect(() => conn.send({ type: 'response.create' } as RealtimeClientEvent)).not.toThrow();
        expect(ws.Sent).toHaveLength(0);
    });
});
