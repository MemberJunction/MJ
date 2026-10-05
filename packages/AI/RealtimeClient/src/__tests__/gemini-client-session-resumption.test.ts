import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerMessage } from '@google/genai';
import type { GeminiClientConnectArgs, GeminiLiveClientSession } from '../drivers/geminiRealtimeClient';
import {
    collect,
    FakeGeminiSession,
    FakeMediaStream,
    FakeTrack,
    GeminiTestClient,
    makeGeminiConfig,
    type CollectedEmissions,
} from './helpers/realtime-fakes';

/**
 * A client whose seam opens a NEW fake socket per connection, so a test can drive the old and the
 * new connection separately. `FailConnects` makes the next N connects reject; `HangNextConnect`
 * leaves the next one pending until the test resolves it.
 */
class MultiConnectionClient extends GeminiTestClient {
    public Connections: Array<{ Args: GeminiClientConnectArgs; Session: FakeGeminiSession }> = [];
    public FailConnects = 0;
    public PendingConnect: (() => void) | null = null;
    public HangNextConnect = false;

    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        if (this.FailConnects > 0) {
            this.FailConnects--;
            throw new Error('socket refused');
        }
        const session = new FakeGeminiSession();
        this.Connections.push({ Args: args, Session: session });
        this.LastConnectArgs = args;
        if (this.HangNextConnect) {
            this.HangNextConnect = false;
            await new Promise<void>((resolve) => {
                this.PendingConnect = resolve;
            });
        }
        return session;
    }

    /** Drives a server message through connection `index`'s callback. */
    public EmitOn(index: number, message: LiveServerMessage): void {
        this.Connections[index].Args.OnMessage(message);
    }

    /** Fires connection `index`'s close callback. */
    public CloseOn(index: number, code = 1006): void {
        this.Connections[index].Args.OnClose({ code, reason: 'gone', wasClean: code === 1000 } as CloseEvent);
    }

    /** Fires connection `index`'s error callback. */
    public ErrorOn(index: number): void {
        this.Connections[index].Args.OnError({ message: 'network', error: null } as ErrorEvent);
    }
}

const RESUMABLE = (handle: string): LiveServerMessage =>
    ({ sessionResumptionUpdate: { newHandle: handle, resumable: true } }) as LiveServerMessage;
const NOT_RESUMABLE = { sessionResumptionUpdate: { resumable: false } } as LiveServerMessage;
const GO_AWAY = (timeLeft?: string): LiveServerMessage => ({ goAway: { timeLeft } }) as LiveServerMessage;

describe('GeminiRealtimeClient session resumption', () => {
    let client: MultiConnectionClient;
    let emitted: CollectedEmissions;

    beforeEach(async () => {
        vi.useFakeTimers();
        client = new MultiConnectionClient();
        emitted = collect(client);
        await client.Connect(
            makeGeminiConfig({ model: 'gemini-3.8-live', config: { responseModalities: ['AUDIO'], sessionResumption: {} } }),
            new FakeMediaStream([new FakeTrack()])
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('when Google announces the connection is ending (goAway)', () => {
        it('reconnects with the latest handle, the same token and model, and closes the old socket', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            expect(client.Connections).toHaveLength(2);
            const resumed = client.Connections[1].Args;
            expect(resumed.Config.sessionResumption).toEqual({ handle: 'h1' });
            expect(resumed.EphemeralToken).toBe('auth_tokens/ephemeral-abc');
            expect(resumed.Model).toBe('gemini-3.8-live');
            expect(client.Connections[0].Session.Closed).toBe(true);
            expect(emitted.states.slice(-2)).toEqual(['connecting', 'listening']);
            expect(emitted.errors).toEqual([]);
        });

        it('waits for a resumable point instead of resuming mid-turn', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, NOT_RESUMABLE);
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(5000);
            expect(client.Connections).toHaveLength(1);

            client.EmitOn(0, RESUMABLE('h2'));
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h2' });
        });

        it('falls back to the last handle shortly before the deadline in timeLeft', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, NOT_RESUMABLE);
            client.EmitOn(0, GO_AWAY('20s'));
            await vi.advanceTimersByTimeAsync(9999);
            expect(client.Connections).toHaveLength(1);
            // 20 s left minus the 10 s margin: the deadline fires at 10 s; its attempt runs on the next tick.
            await vi.advanceTimersByTimeAsync(2);
            expect(client.Connections).toHaveLength(2);
        });

        it('ignores the replaced socket: its close and late messages do not touch the new session', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            client.CloseOn(0, 1006);
            client.EmitOn(0, RESUMABLE('stale'));
            expect(emitted.errors).toEqual([]);
            expect(emitted.states[emitted.states.length - 1]).toBe('listening');
            expect(client.ResumptionHandle).toBe('h1');
        });

        it('sends mic audio on the new connection after the switch', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            client.OnPcmChunk?.('AAAA');
            expect(client.Connections[1].Session.RealtimeInputs).toHaveLength(1);
            expect(client.Connections[0].Session.RealtimeInputs).toHaveLength(0);
        });
    });

    describe('when the connection drops unexpectedly', () => {
        it('resumes with the last handle instead of failing the session', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.CloseOn(0, 1006);
            expect(emitted.states[emitted.states.length - 1]).toBe('connecting');
            await vi.advanceTimersByTimeAsync(0);

            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
            expect(emitted.errors).toEqual([]);
            expect(emitted.states[emitted.states.length - 1]).toBe('listening');
        });

        it('treats a transport error as the start of a drop when a handle exists', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.ErrorOn(0);
            expect(emitted.errors).toEqual([]);
            client.CloseOn(0, 1006);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(emitted.errors).toEqual([]);
        });

        it('retries, then fails the session once when every attempt fails', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.FailConnects = 3;
            client.CloseOn(0, 1006);
            await vi.advanceTimersByTimeAsync(5000);

            expect(emitted.errors).toHaveLength(1);
            expect(emitted.errors[0].Message).toContain('could not be resumed');
            expect(emitted.errors[0].Fatal).toBe(true);
            expect(emitted.states[emitted.states.length - 1]).toBe('error');
        });

        it('keeps the old behavior with no handle: an abnormal close is fatal', () => {
            client.CloseOn(0, 1006);
            expect(emitted.errors).toHaveLength(1);
            expect(emitted.states[emitted.states.length - 1]).toBe('error');
        });

        it('ends the cut-off turn and sends queued messages on the new connection', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, {
                serverContent: { outputTranscription: { text: 'Half a sen' } },
            } as LiveServerMessage);
            client.SendContextNote('queued while the model was talking');
            expect(client.Connections[0].Session.ClientContents).toHaveLength(0);

            client.CloseOn(0, 1006);
            await vi.advanceTimersByTimeAsync(0);

            expect(emitted.transcripts.some((t) => t.Role === 'Assistant' && t.IsFinal && t.Text === 'Half a sen')).toBe(true);
            expect(client.Connections[1].Session.ClientContents).toHaveLength(1);
            expect(client.IsBusy).toBe(false);
        });
    });

    describe('Disconnect', () => {
        it('clears the handle and does not resume on the close it causes', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            await client.Disconnect();
            client.CloseOn(0, 1006);
            await vi.advanceTimersByTimeAsync(5000);

            expect(client.ResumptionHandle).toBeNull();
            expect(client.Connections).toHaveLength(1);
            expect(emitted.errors).toEqual([]);
        });

        it('closes a connection that finishes opening after the consumer disconnected', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.HangNextConnect = true;
            client.CloseOn(0, 1006);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);

            await client.Disconnect();
            client.PendingConnect?.();
            await vi.advanceTimersByTimeAsync(0);

            expect(client.Connections[1].Session.Closed).toBe(true);
            expect(emitted.errors).toEqual([]);
        });
    });
});
