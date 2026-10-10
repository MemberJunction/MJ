import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerContent, LiveServerMessage, Blob as GeminiBlob, Content, FunctionResponse } from '@google/genai';
import type { IRealtimeSession, RealtimeSessionError, RealtimeSessionParams } from '@memberjunction/ai';

import { GeminiRealtime, type GeminiLiveSession, type GeminiConnectArgs } from '../geminiRealtime';
import { ConfirmGeminiSetup } from './live-session-test-helpers';

type SentInput = { audio?: GeminiBlob; video?: GeminiBlob; text?: string; activityStart?: unknown; activityEnd?: unknown };

/** One fake socket per connection, recording what the session sends on it. */
class FakeConnection implements GeminiLiveSession {
    public RealtimeInputs: SentInput[] = [];
    public ClientContents: Array<{ turns?: Content[]; turnComplete?: boolean }> = [];
    public ToolResponses: Array<{ functionResponses: FunctionResponse[] | FunctionResponse }> = [];
    public Closed = false;
    public sendRealtimeInput(params: SentInput): void {
        this.RealtimeInputs.push(params);
    }
    public sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void {
        this.ClientContents.push(params);
    }
    public sendToolResponse(params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {
        this.ToolResponses.push(params);
    }
    public close(): void {
        this.Closed = true;
    }
}

/**
 * Driver whose seam opens a NEW fake per connection, so a test can drive the old and the new
 * connection separately. `FailConnects` makes the next N connects reject; `HangNextConnect`
 * leaves the next one pending until the test calls `PendingConnect`. Google confirms each
 * connection's setup as it opens unless `AutoConfirmSetup` is off (then `ConfirmSetupOn`).
 */
class MultiConnectionGemini extends GeminiRealtime {
    public Connections: Array<{ Args: GeminiConnectArgs; Fake: FakeConnection }> = [];
    public FailConnects = 0;
    public HangNextConnect = false;
    public PendingConnect: (() => void) | null = null;
    public AutoConfirmSetup = true;

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
        if (this.AutoConfirmSetup) {
            ConfirmGeminiSetup(args);
        }
        return fake;
    }

    public EmitOn(index: number, message: LiveServerMessage): void {
        this.Connections[index].Args.OnMessage(message);
    }

    public CloseOn(index: number, code = 1006): void {
        this.Connections[index].Args.OnClose?.({ code, reason: 'gone' } as CloseEvent);
    }

    public ConfirmSetupOn(index: number): void {
        ConfirmGeminiSetup(this.Connections[index].Args);
    }
}

const RESUMABLE = (handle: string): LiveServerMessage =>
    ({ sessionResumptionUpdate: { newHandle: handle, resumable: true } }) as LiveServerMessage;
const NOT_RESUMABLE = { sessionResumptionUpdate: { resumable: false } } as LiveServerMessage;
const GO_AWAY = (timeLeft?: string): LiveServerMessage => ({ goAway: { timeLeft } }) as LiveServerMessage;
const CONTENT = (content: LiveServerContent): LiveServerMessage => ({ serverContent: content }) as LiveServerMessage;
/** The user's words, as Google transcribes them. */
const HEARD = (text: string): LiveServerMessage => CONTENT({ inputTranscription: { text } });
/** The model's words, as Google transcribes them. */
const SAID = (text: string): LiveServerMessage => CONTENT({ outputTranscription: { text } });
const TURN_COMPLETE = CONTENT({ turnComplete: true });
const TOOL_CALL = (id: string): LiveServerMessage =>
    ({ toolCall: { functionCalls: [{ id, name: 'lookup_order', args: {} }] } }) as LiveServerMessage;
const AUDIO_FRAME = (byte: number): { Data: ArrayBuffer; Kind: 'audio' } => ({ Data: new Uint8Array([byte, byte]).buffer, Kind: 'audio' });

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

            session.SendInput({ Data: new ArrayBuffer(4), Kind: 'audio' });
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
            session.SendInput({ Data: new ArrayBuffer(4), Kind: 'audio' });
            expect(driver.Connections[first].Fake.RealtimeInputs[0].activityStart).toEqual({});

            driver.EmitOn(first, RESUMABLE('h1'));
            driver.EmitOn(first, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            session.SendInput({ Data: new ArrayBuffer(4), Kind: 'audio' });
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

    // Vertex AI never sends `resumable: false`: it marks every update resumable and sends one 20-70 ms after each
    // turnComplete. These runs replay that cadence.
    describe('a planned move waits for the turn in progress (#5354)', () => {
        it('a goAway mid-answer lets the answer finish on the old connection, then moves at the handle after turnComplete', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.EmitOn(0, HEARD('count slowly to three'));
            driver.EmitOn(0, SAID('One, two,'));
            driver.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(5000);
            expect(driver.Connections).toHaveLength(1);

            driver.EmitOn(0, SAID(' three.'));
            driver.EmitOn(0, TURN_COMPLETE);
            await vi.advanceTimersByTimeAsync(50);
            expect(driver.Connections).toHaveLength(1); // h1 predates the answer: resuming from it would drop it

            driver.EmitOn(0, RESUMABLE('h2'));
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h2' });
            expect(errors).toEqual([]);
        });

        it('a goAway right after a question waits too, though no answer has started', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.EmitOn(0, HEARD('what time is it'));
            driver.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(1000);
            expect(driver.Connections).toHaveLength(1);

            driver.EmitOn(0, SAID('It is noon.'));
            driver.EmitOn(0, TURN_COMPLETE);
            driver.EmitOn(0, RESUMABLE('h2'));
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h2' });
        });

        it('a spoken update this session sends holds the move until its turnComplete', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            session.RequestSpokenUpdate?.('Say that the report is ready.');
            driver.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(1000);
            expect(driver.Connections).toHaveLength(1);

            driver.EmitOn(0, TURN_COMPLETE);
            driver.EmitOn(0, RESUMABLE('h2'));
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h2' });
        });

        it('with no answer coming, the deadline still moves the session, with the last handle', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.EmitOn(0, HEARD('hello?'));
            driver.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(19999);
            expect(driver.Connections).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(2);
            expect(driver.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it('a tool call pending at turnComplete holds the move until its result goes out', async () => {
            driver.EmitOn(0, TOOL_CALL('call-1'));
            driver.EmitOn(0, SAID('Let me check.'));
            driver.EmitOn(0, TURN_COMPLETE);
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(1000);
            expect(driver.Connections).toHaveLength(1);

            await session.SendToolResult('call-1', '{"status":"shipped"}');
            driver.EmitOn(0, RESUMABLE('h2'));
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h2' });
            expect(driver.Connections[0].Fake.ToolResponses).toHaveLength(1);
        });

        it('in meeting mode, room speech is no turn until the bridge commits one: a goAway still moves at once', async () => {
            await start({ Config: { disableAutoResponse: true } });
            const first = driver.Connections.length - 1;
            driver.EmitOn(first, HEARD('two people talking to each other'));
            driver.EmitOn(first, RESUMABLE('h1'));
            driver.EmitOn(first, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections).toHaveLength(first + 2);
        });
    });

    describe('input waits for Google to confirm the setup (#5358)', () => {
        it('StartSession resolves, and the initial context goes out, only once the setup is confirmed', async () => {
            driver.AutoConfirmSetup = false;
            let started = false;
            const starting = driver.StartSession(params({ InitialContext: 'Earlier, the user asked about order 7.' })).then((opened) => {
                started = true;
                return opened;
            });
            await vi.advanceTimersByTimeAsync(1000);
            const last = driver.Connections.length - 1;
            expect(started).toBe(false);
            expect(driver.Connections[last].Fake.ClientContents).toEqual([]);

            driver.ConfirmSetupOn(last);
            await starting;
            expect(driver.Connections[last].Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'Earlier, the user asked about order 7.' }] }], turnComplete: false },
            ]);
        });

        it('fails StartSession, with the close code, when the connection closes before Google confirms the setup', async () => {
            driver.AutoConfirmSetup = false;
            const starting = driver.StartSession(params());
            await vi.advanceTimersByTimeAsync(0);
            driver.CloseOn(driver.Connections.length - 1, 1007);
            await expect(starting).rejects.toThrow('before confirming its setup (1007)');
        });

        it('input sent during a move goes out on the new connection once its setup is confirmed, and none on the old one', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.AutoConfirmSetup = false;
            driver.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections).toHaveLength(2);

            session.SendInput(AUDIO_FRAME(1));
            session.SendInput({ Data: new Uint8Array([0xff, 0xd8]).buffer, Kind: 'video', MimeType: 'image/jpeg' });
            session.SendContextNote?.('The user opened the orders panel.');
            expect(session.RequestSpokenUpdate?.('Say that the report is ready.')).toBe(true);
            await vi.advanceTimersByTimeAsync(1000);
            expect(driver.Connections[0].Fake.RealtimeInputs).toEqual([]);
            expect(driver.Connections[0].Fake.ClientContents).toEqual([]);
            expect(driver.Connections[1].Fake.RealtimeInputs).toEqual([]);
            expect(driver.Connections[0].Fake.Closed).toBe(false); // still in use until the new one is ready

            driver.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections[0].Fake.Closed).toBe(true);
            expect(driver.Connections[1].Fake.RealtimeInputs).toEqual([
                { audio: { data: Buffer.from([1, 1]).toString('base64'), mimeType: 'audio/pcm;rate=16000' } },
                { text: 'Say that the report is ready.' },
            ]);
            expect(driver.Connections[1].Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'The user opened the orders panel.' }] }], turnComplete: false },
            ]);
            expect(driver.Connections[0].Fake.RealtimeInputs).toEqual([]);
        });

        it('keeps the latest 2 s of input audio held during a move, dropping older audio first', async () => {
            driver.EmitOn(0, RESUMABLE('h1'));
            driver.AutoConfirmSetup = false;
            driver.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);
            // Six half-second frames of 16 kHz PCM16; 2 s holds four.
            for (let i = 0; i < 6; i++) {
                session.SendInput({ Data: new Uint8Array(16000).fill(i).buffer, Kind: 'audio' });
            }

            driver.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);
            const sent = driver.Connections[1].Fake.RealtimeInputs.map((input) => Buffer.from(input.audio?.data ?? '', 'base64')[0]);
            expect(sent).toEqual([2, 3, 4, 5]);
        });

        it('in meeting mode, a spoken update during a move counts as committed and commits on the new connection', async () => {
            await start({ Config: { disableAutoResponse: true } });
            const first = driver.Connections.length - 1;
            driver.EmitOn(first, RESUMABLE('h1'));
            driver.AutoConfirmSetup = false;
            driver.EmitOn(first, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);

            expect(session.RequestSpokenUpdate?.('')).toBe(true);
            expect(driver.Connections[first].Fake.RealtimeInputs).toEqual([]);

            driver.ConfirmSetupOn(first + 1);
            await vi.advanceTimersByTimeAsync(0);
            expect(driver.Connections[first + 1].Fake.RealtimeInputs).toEqual([{ activityStart: {} }, { activityEnd: {} }]);
        });
    });
});
