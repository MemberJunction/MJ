import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerMessage, Blob as GeminiBlob, Content, FunctionResponse } from '@google/genai';
import type { IRealtimeSession, RealtimeSessionError, RealtimeSessionParams } from '@memberjunction/ai';

import { GeminiRealtime, type GeminiLiveSession, type GeminiConnectArgs } from '../geminiRealtime';

/** One fake socket per connection, recording what the session sends on it. */
class FakeConnection implements GeminiLiveSession {
    public RealtimeInputs: Array<{ audio?: GeminiBlob; activityStart?: unknown; activityEnd?: unknown }> = [];
    public Closed = false;
    public sendRealtimeInput(params: { audio?: GeminiBlob; activityStart?: unknown; activityEnd?: unknown }): void {
        this.RealtimeInputs.push(params);
    }
    public sendClientContent(_params: { turns?: Content[]; turnComplete?: boolean }): void {}
    public sendToolResponse(_params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {}
    public close(): void {
        this.Closed = true;
    }
}

/**
 * Driver whose seam opens a NEW fake per connection, so a test can drive the old and the new
 * connection separately. `FailConnects` makes the next N connects reject; `HangNextConnect`
 * leaves the next one pending until the test calls `PendingConnect`.
 */
class MultiConnectionGemini extends GeminiRealtime {
    public Connections: Array<{ Args: GeminiConnectArgs; Fake: FakeConnection }> = [];
    public FailConnects = 0;
    public HangNextConnect = false;
    public PendingConnect: (() => void) | null = null;

    protected override async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        if (this.FailConnects > 0) {
            this.FailConnects--;
            throw new Error('socket refused');
        }
        const fake = new FakeConnection();
        this.Connections.push({ Args: args, Fake: fake });
        if (this.HangNextConnect) {
            this.HangNextConnect = false;
            await new Promise<void>((resolve) => {
                this.PendingConnect = resolve;
            });
        }
        return fake;
    }

    public EmitOn(index: number, message: LiveServerMessage): void {
        this.Connections[index].Args.OnMessage(message);
    }

    public CloseOn(index: number, code = 1006): void {
        this.Connections[index].Args.OnClose?.({ code, reason: 'gone' } as CloseEvent);
    }
}

const RESUMABLE = (handle: string): LiveServerMessage =>
    ({ sessionResumptionUpdate: { newHandle: handle, resumable: true } }) as LiveServerMessage;
const NOT_RESUMABLE = { sessionResumptionUpdate: { resumable: false } } as LiveServerMessage;
const GO_AWAY = (timeLeft?: string): LiveServerMessage => ({ goAway: { timeLeft } }) as LiveServerMessage;

function params(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return { Model: 'gemini-3.8-live', SystemPrompt: 'You are a meeting assistant.', ...overrides };
}

describe('GeminiRealtime server-bridged session resumption', () => {
    let driver: MultiConnectionGemini;
    let session: IRealtimeSession;
    let errors: RealtimeSessionError[];

    async function start(overrides: Partial<RealtimeSessionParams> = {}): Promise<void> {
        session = await driver.StartSession(params(overrides));
        errors = [];
        session.OnError?.((error) => errors.push(error));
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        driver = new MultiConnectionGemini('fake-api-key');
        await start();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('when Google announces the connection is ending (goAway)', () => {
        it('reconnects with the latest handle, closes the old connection and sends on the new one', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            expect(driver.Connections).toHaveLength(2);
            expect(driver.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
            expect(driver.Connections[1].Args.Model).toBe('gemini-3.8-live');
            expect(driver.Connections[0].Fake.Closed).toBe(true);

            session.SendInput(new ArrayBuffer(4));
            expect(driver.Connections[1].Fake.RealtimeInputs).toHaveLength(1);
            expect(driver.Connections[0].Fake.RealtimeInputs).toHaveLength(0);
            expect(errors).toEqual([]);
        });

        it('waits for a resumable point instead of resuming mid-turn', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.EmitOn(0, NOT_RESUMABLE);
            driver.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(5000);
            expect(driver.Connections).toHaveLength(1);

            driver.EmitOn(0, RESUMABLE('h2'));
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h2' });
        });

        it('ignores the replaced connection: its close does not end the session', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            driver.CloseOn(0);
            expect(errors).toEqual([]);
        });
    });

    describe('when the connection drops unexpectedly', () => {
        it('resumes with the last handle instead of surfacing a fatal error', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.CloseOn(0);
            await vi.advanceTimersByTimeAsync(0);

            expect(driver.Connections).toHaveLength(2);
            expect(driver.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
            expect(errors).toEqual([]);
        });

        it('keeps the old behavior with no handle: the drop is fatal', () => {
            driver.CloseOn(0);
            expect(errors).toHaveLength(1);
            expect(errors[0].Fatal).toBe(true);
            expect(errors[0].Message).toContain('closed unexpectedly');
        });

        it('fails once with a fatal error when every attempt fails', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.FailConnects = 3;
            driver.CloseOn(0);
            await vi.advanceTimersByTimeAsync(5000);

            expect(errors).toHaveLength(1);
            expect(errors[0].Fatal).toBe(true);
            expect(errors[0].Message).toContain('could not be resumed');
        });
    });

    describe('meeting mode', () => {
        it('opens a new activity window on the new connection for the first audio after a resume', async () => {
            await start({ Config: { disableAutoResponse: true } });
            const first = driver.Connections.length - 1;
            session.SendInput(new ArrayBuffer(4));
            expect(driver.Connections[first].Fake.RealtimeInputs[0].activityStart).toEqual({});

            driver.EmitOn(first, RESUMABLE('h1'));
            driver.EmitOn(first, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            session.SendInput(new ArrayBuffer(4));
            const resumed = driver.Connections[first + 1].Fake.RealtimeInputs;
            expect(resumed[0].activityStart).toEqual({});
            expect(resumed[1].audio).toBeDefined();
        });
    });

    describe('Close', () => {
        it('closes a connection that finishes opening after the consumer closed the session', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.HangNextConnect = true;
            driver.CloseOn(0);
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections).toHaveLength(2);

            await session.Close();
            driver.PendingConnect?.();
            await vi.advanceTimersByTimeAsync(0);

            expect(driver.Connections[1].Fake.Closed).toBe(true);
            expect(errors).toEqual([]);
        });
    });
});
