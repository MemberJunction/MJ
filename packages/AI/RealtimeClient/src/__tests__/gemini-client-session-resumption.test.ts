import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Content, LiveServerContent, LiveServerMessage } from '@google/genai';
import { REALTIME_CONNECTION_SETUP_TIMEOUT_MS, type ClientRealtimeSessionConfig, type JSONObject } from '@memberjunction/ai';
import type { GeminiClientConnectArgs, GeminiLiveClientSession } from '../drivers/geminiRealtimeClient';
import {
    collect,
    ConfirmGeminiSetup,
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
        if (this.AutoConfirmSetup) {
            ConfirmGeminiSetup(args);
        }
        return session;
    }

    /** Has Google confirm connection `index`'s setup (with `AutoConfirmSetup` off). */
    public ConfirmSetupOn(index: number): void {
        ConfirmGeminiSetup(this.Connections[index].Args);
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
const CONTENT = (content: LiveServerContent): LiveServerMessage => ({ serverContent: content }) as LiveServerMessage;
/** The user's words, as Google transcribes them. */
const HEARD = (text: string): LiveServerMessage => CONTENT({ inputTranscription: { text } });
/** The model's words, as Google transcribes them. */
const SAID = (text: string): LiveServerMessage => CONTENT({ outputTranscription: { text } });
const TURN_COMPLETE = CONTENT({ turnComplete: true });
const TOOL_CALL = (id: string): LiveServerMessage =>
    ({ toolCall: { functionCalls: [{ id, name: 'lookup_order', args: {} }] } }) as LiveServerMessage;

/** The session config every client here connects with, plus what a test adds to it. */
function sessionConfig(extra: JSONObject = {}): ClientRealtimeSessionConfig {
    return makeGeminiConfig({ model: 'gemini-3.8-live', config: { responseModalities: ['AUDIO'], sessionResumption: {} }, ...extra });
}

/** A second client, connected with `extra` added to its session config (Google confirms the setup). */
async function connectAnother(extra: JSONObject = {}): Promise<MultiConnectionClient> {
    const other = new MultiConnectionClient();
    await other.Connect(sessionConfig(extra), new FakeMediaStream([new FakeTrack()]));
    return other;
}

describe('GeminiRealtimeClient session resumption', () => {
    let client: MultiConnectionClient;
    let emitted: CollectedEmissions;

    beforeEach(async () => {
        vi.useFakeTimers();
        client = new MultiConnectionClient();
        emitted = collect(client);
        await client.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()]));
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

        it('waits for the turn in progress instead of resuming mid-turn, then moves with the stored handle', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('what time is it'));
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(5000);
            expect(client.Connections).toHaveLength(1);

            client.EmitOn(0, TURN_COMPLETE);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it("does not wait on Google's resumable flag: with no turn open it moves at once", async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, NOT_RESUMABLE);
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it('falls back to the last handle shortly before the deadline in timeLeft', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('a long question'));
            client.EmitOn(0, GO_AWAY('20s'));
            await vi.advanceTimersByTimeAsync(13332);
            expect(client.Connections).toHaveLength(1);
            // 20 s left minus a third of it: the deadline fires at 13.333 s; its attempt runs on the next tick.
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

        it('resumes without a handle: an abnormal close opens a new connection and is not fatal', async () => {
            client.CloseOn(0, 1006);
            expect(emitted.states.at(-1)).toBe('connecting');
            await vi.advanceTimersByTimeAsync(0);

            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({});
            expect(emitted.errors).toEqual([]);
            expect(emitted.states.at(-1)).toBe('listening');
        });

        it('with no handle, a transport error is only logged and the close that follows resumes', async () => {
            client.ErrorOn(0);
            expect(emitted.errors).toEqual([]);
            expect(emitted.states.at(-1)).toBe('listening');
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(emitted.errors).toEqual([]);
            expect(emitted.states.at(-1)).toBe('listening');
        });

        it.each([1000, 1005])('with no handle, a clean close (%i) is the server ending the call: closed, no resume', async (code) => {
            client.CloseOn(0, code);
            await vi.advanceTimersByTimeAsync(5000);
            expect(client.Connections).toHaveLength(1);
            expect(emitted.errors).toEqual([]);
            expect(emitted.states.at(-1)).toBe('closed');
        });

        it('with a handle, a clean close still resumes', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.CloseOn(0, 1000);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(emitted.states.at(-1)).toBe('listening');
        });

        it('with no handle, fails the session with the close reason when every attempt closes before its setup', async () => {
            client.AutoConfirmSetup = false;
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            client.CloseOn(1, 1007);
            await vi.advanceTimersByTimeAsync(1000);
            client.CloseOn(2, 1007);
            await vi.advanceTimersByTimeAsync(3000);
            client.CloseOn(3, 1007);
            await vi.advanceTimersByTimeAsync(0);

            expect(emitted.errors).toEqual([
                {
                    Message: 'Gemini Live connection was lost and could not be resumed: Gemini Live closed the connection before confirming its setup (1007): gone',
                    Fatal: true,
                },
            ]);
            expect(emitted.states.at(-1)).toBe('error');
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
            // The seed, with the cut-off turn in it, then the note queued behind the move.
            const [seed, note, ...rest] = client.Connections[1].Session.ClientContents;
            expect(seed.turns?.at(-1)).toEqual({ role: 'model', parts: [{ text: 'Half a sen' }] });
            expect(note).toEqual({ turns: [{ role: 'user', parts: [{ text: 'queued while the model was talking' }] }], turnComplete: false });
            expect(rest).toEqual([]);
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

    // The move starts at turnComplete, with the handle stored by then: the seed, not a handle issued after the turn, carries it.
    describe('a planned move waits for the turn in progress (#5354)', () => {
        it('a goAway mid-answer lets the answer finish on the old connection, then moves at turnComplete with the whole answer in the seed', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('count slowly to three'));
            client.EmitOn(0, SAID('One, two,'));
            client.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(5000);
            expect(client.Connections).toHaveLength(1);

            client.EmitOn(0, SAID(' three.'));
            client.EmitOn(0, TURN_COMPLETE);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            // h1 predates the answer, and resuming from it alone would drop it: the seed carries the answer.
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
            expect(client.Connections[1].Session.ClientContents[0].turns?.at(-1)).toEqual({ role: 'model', parts: [{ text: 'One, two, three.' }] });
            expect(emitted.transcripts.filter((t) => t.Role === 'Assistant' && t.IsFinal).map((t) => t.Text)).toEqual(['One, two, three.']);
            expect(emitted.errors).toEqual([]);
        });

        it('a goAway right after a spoken question waits too, though no answer has started', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('what time is it'));
            client.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(1000);
            expect(client.Connections).toHaveLength(1);

            client.EmitOn(0, SAID('It is noon.'));
            client.EmitOn(0, TURN_COMPLETE);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it('a goAway right after a typed question waits too', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.SendText('what time is it');
            client.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(1000);
            expect(client.Connections).toHaveLength(1);
            expect(client.Connections[0].Session.RealtimeInputs).toEqual([{ text: 'what time is it' }]);

            client.EmitOn(0, TURN_COMPLETE);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it('with no answer coming, the deadline still moves the session, with the last handle', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('hello?'));
            client.EmitOn(0, GO_AWAY('30s'));
            // 30 s of notice keeps a 10 s margin.
            await vi.advanceTimersByTimeAsync(19999);
            expect(client.Connections).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(2);
            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it('a goAway between turns still moves at once', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Hello!'));
            client.EmitOn(0, TURN_COMPLETE);
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it('a tool call holds the move until its result has gone out and the turn completes', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, TOOL_CALL('call-1'));
            client.EmitOn(0, GO_AWAY('30s'));
            client.EmitOn(0, RESUMABLE('h2')); // stored, not a reason to move
            await vi.advanceTimersByTimeAsync(1000);
            expect(client.Connections).toHaveLength(1);

            client.SendToolResult('call-1', '{"status":"shipped"}');
            await vi.advanceTimersByTimeAsync(1000);
            expect(client.Connections).toHaveLength(1); // the result is out, but the turn it continues is not over

            client.EmitOn(0, SAID('It shipped.'));
            client.EmitOn(0, TURN_COMPLETE);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h2' });
            expect(client.Connections[0].Session.ToolResponses).toHaveLength(1);
        });
    });

    describe('IsTurnOpen', () => {
        it('opens at the first transcribed words, not at whitespace, and closes at turnComplete', () => {
            expect(client.IsTurnOpen).toBe(false);
            client.EmitOn(0, HEARD(' '));
            expect(client.IsTurnOpen).toBe(false);
            client.EmitOn(0, HEARD('hi'));
            expect(client.IsTurnOpen).toBe(true);
            client.EmitOn(0, TURN_COMPLETE);
            expect(client.IsTurnOpen).toBe(false);
        });

        it('opens at the model audio of a session without an avatar, and at a thought', () => {
            client.EmitOn(0, CONTENT({ modelTurn: { role: 'model', parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] } }));
            expect(client.IsTurnOpen).toBe(true);
            client.EmitOn(0, TURN_COMPLETE);
            client.EmitOn(0, CONTENT({ modelTurn: { role: 'model', parts: [{ thought: true, text: 'Planning the answer' }] } }));
            expect(client.IsTurnOpen).toBe(true);
        });

        it('a non-blocking tool call pending at turnComplete keeps it open until the result goes out', async () => {
            const other = await connectAnother({ supportsBlocking: false });
            other.EmitOn(0, TOOL_CALL('call-1'));
            other.EmitOn(0, SAID('Let me check.'));
            other.EmitOn(0, TURN_COMPLETE);
            expect(other.IsTurnOpen).toBe(true);
            other.EmitOn(0, RESUMABLE('h1'));
            other.EmitOn(0, GO_AWAY('30s'));
            await vi.advanceTimersByTimeAsync(1000);
            expect(other.Connections).toHaveLength(1);

            other.SendToolResult('call-1', '{"status":"shipped"}');
            expect(other.IsTurnOpen).toBe(false);
            await vi.advanceTimersByTimeAsync(0);
            expect(other.Connections[1]?.Args.Config.sessionResumption).toEqual({ handle: 'h1' });
        });

        it('on an interactionStatus model, closes at the IDLE status, not at turnComplete', async () => {
            const thinking = await connectAnother({ idleSignal: 'interactionStatus', supportsBlocking: false });
            // `interaction_status` is a wire field the SDK's message type does not declare (as in the client's other tests).
            thinking.EmitOn(0, { interaction_status: 'IN_PROGRESS' } as unknown as LiveServerMessage);
            expect(thinking.IsTurnOpen).toBe(true);
            thinking.EmitOn(0, TURN_COMPLETE);
            expect(thinking.IsTurnOpen).toBe(true);
            thinking.EmitOn(0, { interaction_status: 'IDLE' } as unknown as LiveServerMessage);
            expect(thinking.IsTurnOpen).toBe(false);
        });

        it('a resume closes it: the turn the drop cut off never completes on the new connection', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, SAID('Half a sen'));
            expect(client.IsTurnOpen).toBe(true);
            client.CloseOn(0, 1006);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(client.IsTurnOpen).toBe(false);
        });
    });

    describe('conversation memory across a resume', () => {
        const PREAMBLE =
            '[Connection resumed. Transcript so far, for continuity. Continue exactly where the conversation left off. ' +
            'Do not greet again and do not restart. If you already remember this conversation, this is the same one.]';
        /** Each turn as `role:text|text`, so a failure shows the whole seed. */
        const texts = (turns: Content[] | undefined): string[] =>
            (turns ?? []).map((turn) => `${turn.role}:${(turn.parts ?? []).map((part) => part.text).join('|')}`);
        const seedOn = (index: number): string[] => texts(client.Connections[index].Session.ClientContents[0]?.turns);

        it('seeds the preamble and every entry, in order, with turnComplete false', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.SendText('typed answer');
            client.EmitOn(0, TURN_COMPLETE); // the typed turn holds the note until it ends
            client.SendContextNote('note');
            client.EmitOn(0, TOOL_CALL('c1'));
            client.SendToolResult('c1', '{"ok":true}');
            client.EmitOn(0, HEARD('more'));
            client.EmitOn(0, SAID('Question 2'));
            client.EmitOn(0, TURN_COMPLETE);
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);

            const contents = client.Connections[1].Session.ClientContents;
            expect(contents).toHaveLength(1);
            expect(contents[0].turnComplete).toBe(false);
            expect(texts(contents[0].turns)).toEqual([
                `user:${PREAMBLE}|hi`,
                'model:Question 1',
                'user:typed answer|note',
                'model:[called lookup_order {}]',
                'user:[lookup_order returned {"ok":true}]|more',
                'model:Question 2',
            ]);
        });

        it('sends the seed before the mic audio held during the move', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.AutoConfirmSetup = false;
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            client.OnPcmChunk?.('AAAA');
            client.OnPcmChunk?.('BBBB');

            client.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[1].Session.Calls).toEqual(['clientContent', 'realtimeInput', 'realtimeInput']);
        });

        it('an empty notebook seeds nothing', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[1].Session.ClientContents).toEqual([]);
            expect(emitted.states.at(-1)).toBe('listening');
        });

        it('the cut-off partial transcript is in the seed', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Half a sen'));
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(1)).toEqual([`user:${PREAMBLE}|hi`, 'model:Half a sen']);
        });

        it('a user partial cut off before the model spoke is in the seed', async () => {
            client.EmitOn(0, HEARD('half a ques'));
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(1)).toEqual([`user:${PREAMBLE}|half a ques`]);
        });

        it('narration and thought turns are not in the seed, and neither is the trigger of a narration', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.RequestSpokenUpdate('tell them to wait');
            client.EmitOn(0, SAID('One moment.'));
            client.EmitOn(0, TURN_COMPLETE);
            client.EmitOn(0, CONTENT({ modelTurn: { role: 'model', parts: [{ thought: true, text: 'Planning the answer' }] } }));
            client.EmitOn(0, TURN_COMPLETE);
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(emitted.transcripts.some((t) => t.IsFinal && t.Kind === 'narration' && t.Text === 'One moment.')).toBe(true);
            expect(emitted.transcripts.some((t) => t.IsFinal && t.IsThought && t.Text === 'Planning the answer')).toBe(true);
            expect(seedOn(1)).toEqual([`user:${PREAMBLE}|hi`, 'model:Question 1']);
        });

        it('a spoken turn and its reply are in the seed', async () => {
            client.RequestSpokenTurn('greet the participant');
            client.EmitOn(0, SAID('Hello.'));
            client.EmitOn(0, TURN_COMPLETE);
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(1)).toEqual([`user:${PREAMBLE}|greet the participant`, 'model:Hello.']);
        });

        it('a 1011 with no handle recorded resumes and seeds instead of ending the call', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);

            expect(client.Connections).toHaveLength(2);
            expect(client.Connections[1].Args.Config.sessionResumption).toEqual({});
            expect(seedOn(1)).toEqual([`user:${PREAMBLE}|hi`, 'model:Question 1']);
            expect(emitted.errors).toEqual([]);
            expect(emitted.states.at(-1)).toBe('listening');
        });

        it('drops the oldest entries past the cap and says so in the preamble', async () => {
            for (let i = 0; i < 30; i++) {
                client.EmitOn(0, HEARD(`${i}`.padEnd(1000, 'u')));
                client.EmitOn(0, SAID(`${i}`.padEnd(1000, 'a')));
                client.EmitOn(0, TURN_COMPLETE);
            }
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);

            // 60 entries of 1,000 characters against a cap of 24,000.
            const parts = (client.Connections[1].Session.ClientContents[0].turns ?? []).flatMap((turn) => turn.parts ?? []).map((part) => part.text);
            expect(parts[0]).toContain('for continuity; 36 earlier entries omitted. Continue');
            expect(parts).toHaveLength(25);
            expect(parts[1]).toBe('18'.padEnd(1000, 'u'));
            expect(parts[24]).toBe('29'.padEnd(1000, 'a'));
        });

        it('a failing seed is a non-fatal error and the resume still completes', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.AutoConfirmSetup = false;
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            client.OnPcmChunk?.('AAAA');
            client.Connections[1].Session.ThrowOnClientContent = new Error('socket not open');

            client.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);

            expect(emitted.errors).toEqual([
                { Message: 'Gemini Live resumed without the conversation so far: socket not open', Code: 'resume-seed-failed', Fatal: false },
            ]);
            expect(emitted.states.at(-1)).toBe('listening');
            expect(client.Connections[1].Session.RealtimeInputs).toEqual([{ audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } }]);
        });

        it('a second drop reseeds the full ledger', async () => {
            client.EmitOn(0, HEARD('first'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            client.EmitOn(1, HEARD('second'));
            client.EmitOn(1, SAID('Question 2'));
            client.EmitOn(1, TURN_COMPLETE);
            client.CloseOn(1, 1011);
            await vi.advanceTimersByTimeAsync(0);

            expect(seedOn(2)).toEqual([`user:${PREAMBLE}|first`, 'model:Question 1', 'user:second', 'model:Question 2']);
        });

        it('a note queued during a move is not in the seed and lands after it', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.AutoConfirmSetup = false;
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            client.SendContextNote('queued note');

            client.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);
            const contents = client.Connections[1].Session.ClientContents;
            expect(contents).toHaveLength(2);
            expect(texts(contents[0].turns)).toEqual([`user:${PREAMBLE}|hi`, 'model:Question 1']);
            expect(texts(contents[1].turns)).toEqual(['user:queued note']);

            // It went out, so the next seed has it.
            client.CloseOn(1, 1011);
            await vi.advanceTimersByTimeAsync(1);
            client.ConfirmSetupOn(2);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(2)).toEqual([`user:${PREAMBLE}|hi`, 'model:Question 1', 'user:queued note']);
        });

        it('a SendText queued during a move is not in the seed and goes out after it', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            client.AutoConfirmSetup = false;
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            client.SendText('queued text');

            client.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(1)).toEqual([`user:${PREAMBLE}|hi`, 'model:Question 1']);
            expect(client.Connections[1].Session.Calls).toEqual(['clientContent', 'realtimeInput']);
            expect(client.Connections[1].Session.RealtimeInputs).toEqual([{ text: 'queued text' }]);
        });

        it('records a tool call before the host sees it, so a host that answers at once keeps the pair in order', async () => {
            client.OnToolCall((call) => client.SendToolResult(call.CallID, '{"ok":true}'));
            client.EmitOn(0, TOOL_CALL('c1'));
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(1)).toEqual([`user:${PREAMBLE}`, 'model:[called lookup_order {}]', 'user:[lookup_order returned {"ok":true}]']);
        });

        it("records the user's words before the tool call they led to", async () => {
            client.EmitOn(0, HEARD('where is my order'));
            client.EmitOn(0, TOOL_CALL('c1'));
            client.SendToolResult('c1', '{"ok":true}');
            client.EmitOn(0, SAID('It shipped.'));
            client.EmitOn(0, TURN_COMPLETE);
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(1)).toEqual([
                `user:${PREAMBLE}|where is my order`,
                'model:[called lookup_order {}]',
                'user:[lookup_order returned {"ok":true}]',
                'model:It shipped.',
            ]);
        });

        it('records the tool result the model got: scheduling hints stripped, free text wrapped', async () => {
            client.EmitOn(0, TOOL_CALL('c1'));
            client.SendToolResult('c1', '{"status":"shipped","__mj_scheduling":"SILENT"}');
            client.EmitOn(0, TURN_COMPLETE);
            client.EmitOn(0, TOOL_CALL('c2'));
            client.SendToolResult('c2', 'done');
            client.EmitOn(0, TURN_COMPLETE);
            client.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(seedOn(1)).toEqual([
                `user:${PREAMBLE}`,
                'model:[called lookup_order {}]',
                'user:[lookup_order returned {"status":"shipped"}]',
                'model:[called lookup_order {}]',
                'user:[lookup_order returned {"result":"done"}]',
            ]);
        });

        it('the commit a tool response owed on the old connection is not sent on the new one, so the seed starts no reply', async () => {
            const thinking = await connectAnother({ idleSignal: 'interactionStatus', supportsBlocking: false });
            thinking.SendContextNote('note');
            thinking.EmitOn(0, TOOL_CALL('c1'));
            thinking.SendToolResult('c1', '{"ok":true}');
            thinking.CloseOn(0, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(thinking.Connections).toHaveLength(2);

            thinking.EmitOn(1, { interaction_status: 'IN_PROGRESS' } as unknown as LiveServerMessage);
            thinking.EmitOn(1, { interaction_status: 'IDLE' } as unknown as LiveServerMessage);
            expect(thinking.Connections[1].Session.ClientContents.filter((content) => content.turnComplete === true)).toEqual([]);
        });

        it('Disconnect clears the notebook', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            await client.Disconnect();
            await client.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()]));
            client.CloseOn(1, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[2].Session.ClientContents).toEqual([]);
        });

        it('a new Connect starts an empty notebook', async () => {
            client.EmitOn(0, HEARD('hi'));
            client.EmitOn(0, SAID('Question 1'));
            client.EmitOn(0, TURN_COMPLETE);
            await client.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()]));
            client.CloseOn(1, 1011);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[2].Session.ClientContents).toEqual([]);
        });

        describe('diagnostics', () => {
            let logged: string[];

            beforeEach(() => {
                vi.stubEnv('MJ_VERBOSE', 'true');
                logged = [];
                vi.spyOn(console, 'log').mockImplementation((line: string) => {
                    logged.push(line);
                });
            });

            afterEach(() => {
                vi.unstubAllEnvs();
                vi.restoreAllMocks();
            });

            it('reports the seed by its counts, never its text', async () => {
                client.EmitOn(0, HEARD('private words'));
                client.EmitOn(0, SAID('Question 1'));
                client.EmitOn(0, TURN_COMPLETE);
                client.CloseOn(0, 1011);
                await vi.advanceTimersByTimeAsync(0);
                expect(logged).toContain('[GeminiRealtimeClient] seeded 2 entries (chars 23, dropped 0)');
                expect(logged.filter((line) => line.includes('private words') || line.includes('Question 1'))).toEqual([]);
            });

            it('reports an empty notebook', async () => {
                client.CloseOn(0, 1011);
                await vi.advanceTimersByTimeAsync(0);
                expect(logged).toContain('[GeminiRealtimeClient] no conversation to seed');
            });

            it('reports a failed seed by its counts, never its text', async () => {
                client.EmitOn(0, HEARD('private words'));
                client.AutoConfirmSetup = false;
                client.CloseOn(0, 1011);
                await vi.advanceTimersByTimeAsync(0);
                client.Connections[1].Session.ThrowOnClientContent = new Error('socket not open');
                client.ConfirmSetupOn(1);
                await vi.advanceTimersByTimeAsync(0);
                expect(logged).toContain('[GeminiRealtimeClient] seed failed: socket not open (entries 1, chars 13, dropped 0)');
                expect(logged.filter((line) => line.includes('private words'))).toEqual([]);
            });
        });
    });

    describe('input waits for Google to confirm the setup (#5358)', () => {
        it('Connect reports connected and listening, and starts the microphone, only once the setup is confirmed', async () => {
            const fresh = new MultiConnectionClient();
            fresh.AutoConfirmSetup = false;
            const { states } = collect(fresh);
            const connecting = fresh.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()]));
            await vi.advanceTimersByTimeAsync(0);
            expect(fresh.Connections).toHaveLength(1);
            expect(states).toEqual(['connecting']);
            expect(fresh.OnPcmChunk).toBeNull();

            fresh.ConfirmSetupOn(0);
            await connecting;
            expect(states).toEqual(['connecting', 'connected', 'listening']);
            fresh.OnPcmChunk?.('AAAA');
            expect(fresh.Connections[0].Session.RealtimeInputs).toHaveLength(1);
        });

        it('input sent during a move goes out on the new connection once its setup is confirmed, and none on the old one', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.AutoConfirmSetup = false;
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections).toHaveLength(2);
            expect(emitted.states.at(-1)).toBe('connecting');

            client.OnPcmChunk?.('AAAA');
            client.SendText('are you there?');
            client.SendContextNote('the user opened the orders panel');
            await vi.advanceTimersByTimeAsync(1000);
            expect(client.Connections[0].Session.RealtimeInputs).toEqual([]);
            expect(client.Connections[0].Session.ClientContents).toEqual([]);
            expect(client.Connections[1].Session.RealtimeInputs).toEqual([]);
            expect(client.Connections[0].Session.Closed).toBe(false); // still in use until the new one is ready

            client.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[0].Session.Closed).toBe(true);
            expect(client.Connections[1].Session.RealtimeInputs).toEqual([
                { audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } },
                { text: 'are you there?' },
            ]);
            // The note waits for the turn the question started, as on any connection.
            client.EmitOn(1, TURN_COMPLETE);
            expect(client.Connections[1].Session.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'the user opened the orders panel' }] }], turnComplete: false },
            ]);
            expect(client.Connections[0].Session.RealtimeInputs).toEqual([]);
        });

        it('keeps the latest 2 s of mic audio held during a move, dropping older audio first', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.AutoConfirmSetup = false;
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);
            // Ten chunks of 10,664 base64 characters (about 0.25 s of 16 kHz PCM16 each); 2 s holds eight.
            const chunks = Array.from({ length: 10 }, (_, i) => `${String(i).padStart(4, '0')}${'AAAA'.repeat(2665)}`);
            chunks.forEach((chunk) => client.OnPcmChunk?.(chunk));

            client.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[1].Session.RealtimeInputs.map((input) => input.audio?.data)).toEqual(chunks.slice(2));
        });

        it('drops video frames during a move instead of sending them to the connection being replaced', async () => {
            const video = await connectAnother({
                supportsInboundVideo: true,
                maxInboundVideoRate: 1,
                requestedTracks: [
                    { Modality: 'audio', Direction: 'inbound' },
                    { Modality: 'audio', Direction: 'outbound' },
                    { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 },
                ],
            });
            expect(video.IsTrackEstablished('video', 'inbound')).toBe(true);
            video.EmitOn(0, RESUMABLE('h1'));
            video.AutoConfirmSetup = false;
            video.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);
            expect(video.SendVideoFrame('BBBB', 'image/jpeg')).toBe(false);

            video.ConfirmSetupOn(1);
            await vi.advanceTimersByTimeAsync(1000);
            expect(video.SendVideoFrame('CCCC', 'image/jpeg')).toBe(true);
            expect(video.Connections[1].Session.RealtimeInputs).toEqual([{ video: { data: 'CCCC', mimeType: 'image/jpeg' } }]);
            expect(video.Connections[0].Session.RealtimeInputs).toEqual([]);
        });

        it('fails Connect, with the close code, when the connection closes before Google confirms the setup', async () => {
            const fresh = new MultiConnectionClient();
            fresh.AutoConfirmSetup = false;
            const connecting = fresh.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()]));
            await vi.advanceTimersByTimeAsync(0);
            fresh.CloseOn(0, 1007);
            await expect(connecting).rejects.toThrow('before confirming its setup (1007)');
        });

        it('fails Connect, and closes the socket, when Google never confirms the setup', async () => {
            const fresh = new MultiConnectionClient();
            fresh.AutoConfirmSetup = false;
            const outcome = fresh.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()])).then(
                () => 'connected',
                (error: Error) => error.message
            );
            await vi.advanceTimersByTimeAsync(REALTIME_CONNECTION_SETUP_TIMEOUT_MS);
            expect(await outcome).toContain('did not confirm the session setup');
            expect(fresh.Connections[0].Session.Closed).toBe(true);
        });

        it('retries a resume whose new connection closes before its setup is confirmed', async () => {
            client.EmitOn(0, RESUMABLE('h1'));
            client.AutoConfirmSetup = false;
            client.EmitOn(0, GO_AWAY('60s'));
            await vi.advanceTimersByTimeAsync(0);
            client.CloseOn(1, 1011);
            await vi.advanceTimersByTimeAsync(1000); // the second attempt, 1 s later
            expect(client.Connections).toHaveLength(3);

            client.ConfirmSetupOn(2);
            await vi.advanceTimersByTimeAsync(0);
            expect(client.Connections[0].Session.Closed).toBe(true);
            expect(emitted.errors).toEqual([]);
            expect(emitted.states.at(-1)).toBe('listening');
        });

        it('a Disconnect while the setup is in flight closes the new connection and reports no listening', async () => {
            const fresh = new MultiConnectionClient();
            fresh.AutoConfirmSetup = false;
            const { states } = collect(fresh);
            const connecting = fresh.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()]));
            await vi.advanceTimersByTimeAsync(0);
            await fresh.Disconnect();
            fresh.ConfirmSetupOn(0);
            await connecting;
            expect(fresh.Connections[0].Session.Closed).toBe(true);
            expect(states).toEqual(['connecting', 'closed']);
            expect(fresh.OnPcmChunk).toBeNull();
        });

        it('after a Disconnect while the setup is in flight, a setup failure is not reported: Connect resolves', async () => {
            const fresh = new MultiConnectionClient();
            fresh.AutoConfirmSetup = false;
            const { states, errors } = collect(fresh);
            const connecting = fresh.Connect(sessionConfig(), new FakeMediaStream([new FakeTrack()]));
            await vi.advanceTimersByTimeAsync(0);
            await fresh.Disconnect();
            fresh.CloseOn(0, 1006);
            await expect(connecting).resolves.toBeUndefined();
            expect(states).toEqual(['connecting', 'closed']);
            expect(errors).toEqual([]);
        });
    });
});
