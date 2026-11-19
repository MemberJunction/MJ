/**
 * Gemini Live blocking tool-call batches (#6753). A BLOCKING Gemini answers only once it has every result
 * of a `toolCall` frame, while the first result marks the client busy for the reply. These tests pin
 * the wire order, using one ordered log across tool responses, client content and realtime text:
 * - every result of a batch goes out, in order;
 * - context notes and narrations still wait for the reply (typed text barges in, as before);
 * - an open client turn is committed once, after the batch's LAST result;
 * - the tool-batch barrier's timeout releases queued results first, then ONE held commit;
 * - a commit held across a connection move goes out once the move completes;
 * - a no-output backstop releases the turn when the model never answers (a single call too);
 * - only the batch's OTHER owed calls hold the commit (a stale result does not complete the batch).
 *
 * Controls that must NOT move: a single call, NON_BLOCKING tooling, and the `interactionStatus` idle profile.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Blob as GeminiBlob, Content, FunctionResponse, LiveServerMessage } from '@google/genai';
import { JSONObject } from '@memberjunction/ai';
import { FakeGeminiSession, FakeMediaStream, FakeTrack, GeminiTestClient, makeGeminiConfig } from './helpers/realtime-fakes';
import { GeminiRealtimeClient } from '../drivers/geminiRealtimeClient';

/** A fake session that also keeps ONE ordered log of everything sent, so tests can assert interleaving. */
class OrderedGeminiSession extends FakeGeminiSession {
    public Wire: string[] = [];

    public override sendRealtimeInput(params: { audio?: GeminiBlob; text?: string; media?: GeminiBlob; video?: GeminiBlob }): void {
        if (params.text !== undefined) {
            this.Wire.push(`text:${params.text}`);
        }
        super.sendRealtimeInput(params);
    }
    public override sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void {
        const text = params.turns?.[0]?.parts?.[0]?.text;
        this.Wire.push(text !== undefined ? `note:${text}` : 'commit');
        super.sendClientContent(params);
    }
    public override sendToolResponse(params: { functionResponses: FunctionResponse[] }): void {
        for (const response of params.functionResponses) {
            this.Wire.push(`tool:${response.id}`);
        }
        super.sendToolResponse(params);
    }
}

const BLOCKING: JSONObject = { model: 'gemini-3.8-live', config: {}, idleSignal: 'turnComplete', supportsScheduling: true, supportsBlocking: true };
const NON_BLOCKING: JSONObject = { model: 'gemini-3.8-live', config: {}, idleSignal: 'turnComplete', supportsScheduling: true, supportsBlocking: false };
const BLOCKING_INTERACTION_STATUS: JSONObject = { model: 'gemini-3.8-live', config: {}, idleSignal: 'interactionStatus', supportsScheduling: true, supportsBlocking: true };

const BARRIER_MS = 15000;
const BACKSTOP_MS = GeminiRealtimeClient.BLOCKING_TOOL_REPLY_BACKSTOP_MS;

async function connect(sessionConfig: JSONObject): Promise<{ client: GeminiTestClient; session: OrderedGeminiSession }> {
    const client = new GeminiTestClient();
    const session = new OrderedGeminiSession();
    client.Fake = session;
    await client.Connect(makeGeminiConfig(sessionConfig), new FakeMediaStream([new FakeTrack()]));
    return { client, session };
}

function toolCall(client: GeminiTestClient, ...ids: string[]): void {
    client.Emit({ toolCall: { functionCalls: ids.map((id) => ({ id, name: `tool_${id}`, args: {} })) } } as LiveServerMessage);
}

function modelSpeaks(client: GeminiTestClient, text = 'Here is the answer.'): void {
    client.Emit({ serverContent: { outputTranscription: { text } } } as LiveServerMessage);
}

function turnComplete(client: GeminiTestClient): void {
    client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
}

describe('GeminiRealtimeClient blocking tool-call batch (#6753)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    describe('blocking, turnComplete idle signal', () => {
        it('sends every result of a 3-call batch, in order, without waiting for a turnComplete', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b', 'c');

            client.SendToolResult('a', '{"ok":1}');
            client.SendToolResult('b', '{"ok":2}');
            client.SendToolResult('c', '{"ok":3}');

            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'tool:c']);
            // The reply is next: the client stays busy for it.
            expect(client.IsBusy).toBe(true);
        });

        it('keeps the host order when results come back out of call order', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b', 'c');

            client.SendToolResult('c', '{}');
            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');

            expect(session.Wire).toEqual(['tool:c', 'tool:a', 'tool:b']);
        });

        it('a context note sent mid-batch waits until after the reply', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b', 'c');

            client.SendToolResult('a', '{}');
            client.SendContextNote('board settled');
            client.SendToolResult('b', '{}');
            client.SendToolResult('c', '{}');
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'tool:c']);

            modelSpeaks(client);
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'tool:c']);
            turnComplete(client);
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'tool:c', 'note:board settled']);
        });

        it('a narration requested mid-batch waits until after the reply', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');

            client.SendToolResult('a', '{}');
            client.RequestSpokenUpdate('say you are still working');
            client.SendToolResult('b', '{}');
            expect(session.Wire).toEqual(['tool:a', 'tool:b']);

            modelSpeaks(client);
            turnComplete(client);
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'text:say you are still working']);
        });

        it('typed text mid-batch barges in as before, and the batch still gets its last result', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');

            client.SendToolResult('a', '{}');
            client.SendText('and another thing');
            client.SendToolResult('b', '{}');

            expect(session.Wire).toEqual(['tool:a', 'text:and another thing', 'tool:b']);
        });

        it('commits an open client turn ONCE, after the last result of the batch', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('learner opened lesson 2');
            toolCall(client, 'a', 'b', 'c');

            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');
            expect(session.Wire).toEqual(['note:learner opened lesson 2', 'tool:a', 'tool:b']);

            client.SendToolResult('c', '{}');
            expect(session.Wire).toEqual(['note:learner opened lesson 2', 'tool:a', 'tool:b', 'tool:c', 'commit']);
        });

        it('a second toolCall frame while results are owed joins the batch', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a');
            toolCall(client, 'b');

            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');

            expect(session.Wire).toEqual(['tool:a', 'tool:b']);
        });

        it('results queued behind a typed turn go out, in order, when the barrier times out', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');
            // A user turn takes the floor before any result: the results wait for it, as before.
            client.SendText('wait, one more thing');
            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');
            expect(session.Wire).toEqual(['text:wait, one more thing']);

            vi.advanceTimersByTime(BARRIER_MS);

            expect(session.Wire).toEqual(['text:wait, one more thing', 'tool:a', 'tool:b']);
        });

        it('a result that arrives after the barrier expired the batch still goes out at once', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}');

            vi.advanceTimersByTime(BARRIER_MS);
            client.SendToolResult('b', '{"slow":true}');

            expect(session.Wire).toEqual(['tool:a', 'tool:b']);
        });

        it('sends a held commit when the barrier gives up on a call that is never answered', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('context');
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}');
            expect(session.Wire).toEqual(['note:context', 'tool:a']);

            vi.advanceTimersByTime(BARRIER_MS);

            expect(session.Wire).toEqual(['note:context', 'tool:a', 'commit']);
        });

        it('the backstop releases the turn and drains when the model never answers', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a');
            client.SendToolResult('a', '{}');
            client.SendContextNote('queued behind the reply');
            expect(client.IsBusy).toBe(true);

            vi.advanceTimersByTime(BACKSTOP_MS - 1);
            expect(session.Wire).toEqual(['tool:a']);

            vi.advanceTimersByTime(1);
            expect(client.IsBusy).toBe(false);
            expect(session.Wire).toEqual(['tool:a', 'note:queued behind the reply']);
        });

        it('the backstop does not fire once the model answers', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');
            client.SendContextNote('after the reply');

            modelSpeaks(client);
            vi.advanceTimersByTime(BACKSTOP_MS * 3);

            expect(client.IsBusy).toBe(true);
            expect(session.Wire).toEqual(['tool:a', 'tool:b']);
            turnComplete(client);
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'note:after the reply']);
        });

        it('a single call is unchanged: result, then the reply, then queued sends', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('before');
            toolCall(client, 'a');
            client.SendToolResult('a', '{}');
            client.SendContextNote('after');
            expect(session.Wire).toEqual(['note:before', 'tool:a', 'commit']);

            modelSpeaks(client);
            turnComplete(client);
            expect(session.Wire).toEqual(['note:before', 'tool:a', 'commit', 'note:after']);
        });

        it('Disconnect clears the backstop', async () => {
            const { client } = await connect(BLOCKING);
            const base = vi.getTimerCount(); // the connection's own timers
            toolCall(client, 'a'); // +1: the tool-batch barrier
            client.SendToolResult('a', '{}'); // the barrier is cleared and the backstop armed
            expect(vi.getTimerCount()).toBe(base + 1);

            await client.Disconnect();
            expect(vi.getTimerCount()).toBe(0);
        });

        it('a barrier timeout sends the queued results first and ONE commit last', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('ctx');
            toolCall(client, 'a', 'b', 'c');
            client.SendText('x'); // takes the floor before any result
            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');
            expect(session.Wire).toEqual(['note:ctx', 'text:x']);

            vi.advanceTimersByTime(BARRIER_MS); // c is never answered

            expect(session.Wire).toEqual(['note:ctx', 'text:x', 'tool:a', 'tool:b', 'commit']);
        });

        it('a commit held when the barrier fires during a connection move goes out once the move completes', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('ctx');
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}'); // b is never answered
            expect(session.Wire).toEqual(['note:ctx', 'tool:a']);

            client['connectionReady'] = false; // the session starts to move
            vi.advanceTimersByTime(BARRIER_MS);
            expect(session.Wire).toEqual(['note:ctx', 'tool:a']);

            client['handleResumed'](); // native resumption completes the move
            expect(session.Wire).toEqual(['note:ctx', 'tool:a', 'commit']);
            expect(client.IsBusy).toBe(true); // busy for the reply the commit asks for
        });

        it('a held commit also goes out when a failed move goes back to the old connection', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('ctx');
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}');

            client['connectionReady'] = false;
            vi.advanceTimersByTime(BARRIER_MS);
            expect(client['ResumeOnOldConnection']()).toBe(true);

            expect(session.Wire).toEqual(['note:ctx', 'tool:a', 'commit']);
        });

        it('expired results queued during a move all go out on resume, then ONE commit', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('ctx');
            toolCall(client, 'a', 'b', 'c');
            client.SendToolResult('a', '{}'); // the commit is held
            client['connectionReady'] = false; // the session starts to move
            client.SendToolResult('b', '{}');
            client.SendToolResult('c', '{}');
            vi.advanceTimersByTime(BARRIER_MS); // b and c expire while queued

            client['handleResumed']();

            expect(session.Wire).toEqual(['note:ctx', 'tool:a', 'tool:b', 'tool:c', 'commit']);
        });

        it('expired results queued during a move all go out on resume without an open turn', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b', 'c');
            client.SendToolResult('a', '{}');
            client['connectionReady'] = false;
            client.SendToolResult('b', '{}');
            client.SendToolResult('c', '{}');
            vi.advanceTimersByTime(BARRIER_MS);

            client['handleResumed']();

            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'tool:c']);
        });

        it('a typed turn queued during a move leaves no held commit behind for a later note', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('ctx');
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}'); // the commit is held; b is never answered
            client['connectionReady'] = false;
            client.SendText('typed during the move'); // queued
            vi.advanceTimersByTime(BARRIER_MS);

            client['handleResumed']();
            modelSpeaks(client);
            turnComplete(client);
            expect(client['blockingBatchCommitHeld']).toBe(false);
            const settled = [...session.Wire];

            client.SendContextNote('later note');
            client['connectionReady'] = false;
            client['handleResumed']();
            toolCall(client, 'z'); // never answered
            vi.advanceTimersByTime(BARRIER_MS);

            expect(session.Wire).toEqual([...settled, 'note:later note']); // no unprompted commit
        });

        it('a backstop that fires during a move keeps the held commit for the new connection', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('ctx');
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}'); // b is never answered: the commit is held

            client['connectionReady'] = false; // a move that takes longer than barrier + backstop
            vi.advanceTimersByTime(BARRIER_MS + BACKSTOP_MS);
            expect(session.Wire).toEqual(['note:ctx', 'tool:a']); // nothing to the connection being left

            client['handleResumed']();
            expect(session.Wire).toEqual(['note:ctx', 'tool:a', 'commit']);
        });

        it('a stale result while a new batch is owed neither commits early nor holds the batch', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'p', 'old');
            client.SendToolResult('p', '{}');
            vi.advanceTimersByTime(BARRIER_MS); // old is expired
            toolCall(client, 'x', 'y');
            client.SendContextNote('ctx');

            client.SendToolResult('old', '{}'); // late: the new frame dropped it
            client.SendToolResult('x', '{}');
            client.SendToolResult('y', '{}');

            expect(session.Wire).toEqual(['tool:p', 'note:ctx', 'tool:old', 'tool:x', 'tool:y', 'commit']);
        });

        it('a duplicate result mid-batch stays queued behind the reply and the batch completes', async () => {
            const { client, session } = await connect(BLOCKING);
            client.SendContextNote('ctx');
            toolCall(client, 'a', 'b', 'c');
            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');
            client.SendToolResult('b', '{"again":true}'); // queued behind the reply, as before
            client.SendToolResult('c', '{}');

            expect(session.Wire).toEqual(['note:ctx', 'tool:a', 'tool:b', 'tool:c', 'commit']);
        });

        it('an interactionStatus IDLE frame on a turnComplete model does not clear the backstop', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a');
            client.SendToolResult('a', '{}');
            client.SendContextNote('queued');
            client.Emit({ interactionStatus: 'IDLE' } as unknown as LiveServerMessage);

            vi.advanceTimersByTime(BACKSTOP_MS);

            expect(client.IsBusy).toBe(false);
            expect(session.Wire).toEqual(['tool:a', 'note:queued']);
        });

        it('a second toolCall frame mid-batch keeps a note from slipping between results', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}');
            toolCall(client, 'c'); // joins the started batch
            client.SendContextNote('note');
            client.SendToolResult('b', '{}');
            client.SendToolResult('c', '{}');
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'tool:c']);

            modelSpeaks(client);
            turnComplete(client);
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'tool:c', 'note:note']);
        });

        it('typed text mid-batch barges in: a note queued mid-batch goes out before it', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}');
            client.SendContextNote('queued note');
            client.SendText('barge in');
            client.SendToolResult('b', '{}');

            expect(session.Wire).toEqual(['tool:a', 'note:queued note', 'text:barge in', 'tool:b', 'commit']);
        });
        it('the barrier timeout arms the backstop when a call is never answered and no client turn is open', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b');
            client.SendToolResult('a', '{}'); // b is never answered
            client.SendContextNote('queued');

            vi.advanceTimersByTime(BARRIER_MS);
            expect(session.Wire).toEqual(['tool:a']);

            vi.advanceTimersByTime(BACKSTOP_MS);
            expect(session.Wire).toEqual(['tool:a', 'note:queued']);
            expect(client.IsBusy).toBe(false);
        });

        it('results queued behind a typed turn all go out once that turn completes, before the barrier', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a', 'b', 'c');
            client.SendText('first'); // takes the floor before any result
            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');
            client.SendToolResult('c', '{}');
            expect(session.Wire).toEqual(['text:first']);

            modelSpeaks(client);
            turnComplete(client);

            expect(session.Wire).toEqual(['text:first', 'tool:a', 'tool:b', 'tool:c']);
        });

        it('a new toolCall frame drops expired calls: a stale result after the new batch started waits for the reply', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'p', 'old');
            client.SendToolResult('p', '{}');
            vi.advanceTimersByTime(BARRIER_MS); // old is expired
            modelSpeaks(client);
            turnComplete(client);

            toolCall(client, 'x');
            client.SendToolResult('x', '{}'); // the reply to x is next
            client.SendToolResult('old', '{}');
            expect(session.Wire).toEqual(['tool:p', 'tool:x']);

            modelSpeaks(client);
            turnComplete(client);
            expect(session.Wire).toEqual(['tool:p', 'tool:x', 'tool:old']);
        });

        it('a thought part restarts the backstop: the model is working on the reply, not silent', async () => {
            const { client, session } = await connect(BLOCKING);
            toolCall(client, 'a');
            client.SendToolResult('a', '{}');
            client.SendContextNote('queued');

            vi.advanceTimersByTime(BACKSTOP_MS - 1000);
            client.Emit({ serverContent: { modelTurn: { parts: [{ thought: true, text: 'planning the reply' }] } } } as LiveServerMessage);
            vi.advanceTimersByTime(1000);
            expect(client.IsBusy).toBe(true);
            expect(session.Wire).toEqual(['tool:a']);

            vi.advanceTimersByTime(BACKSTOP_MS);
            expect(client.IsBusy).toBe(false);
            expect(session.Wire).toEqual(['tool:a', 'note:queued']);
        });
    });

    describe('controls that must not move', () => {
        it('NON_BLOCKING: results go out while the model talks, notes wait, and no backstop is armed', async () => {
            const { client, session } = await connect(NON_BLOCKING);
            const timersAtStart = vi.getTimerCount();
            modelSpeaks(client, 'thinking out loud');
            toolCall(client, 'a', 'b');

            client.SendToolResult('a', '{}');
            client.SendContextNote('note');
            client.SendToolResult('b', '{}');

            expect(session.Wire).toEqual(['tool:a', 'tool:b']);
            expect(vi.getTimerCount()).toBe(timersAtStart);
            turnComplete(client);
            expect(session.Wire).toEqual(['tool:a', 'tool:b', 'note:note']);
        });

        it('interactionStatus idle profile: the second result still waits for the turn', async () => {
            const { client, session } = await connect(BLOCKING_INTERACTION_STATUS);
            toolCall(client, 'a', 'b');

            client.SendToolResult('a', '{}');
            client.SendToolResult('b', '{}');

            expect(session.Wire).toEqual(['tool:a']);
            client.Emit({ interactionStatus: 'IDLE' } as unknown as LiveServerMessage);
            expect(session.Wire).toEqual(['tool:a', 'tool:b']);
        });
    });
});
