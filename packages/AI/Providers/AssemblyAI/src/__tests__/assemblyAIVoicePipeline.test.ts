import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeSTT, FakeTTS, Harness, settle } from './helpers/pipelineHarness';

const pcm = (ms: number): string => Buffer.alloc((24000 * 2 * ms) / 1000).toString('base64');
const toolOutput = (call_id: string, output: string) => ({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id, output } });
const message = (role: string, text: string) => ({ type: 'conversation.item.create', item: { type: 'message', role, content: [{ type: 'input_text', text }] } });

describe('AssemblyAIVoicePipeline', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        vi.useFakeTimers();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('opening', () => {
        it('reports ready only when both services are open', async () => {
            let openTTS: ((t: FakeTTS) => void) | null = null;
            const h = new Harness({}, { OpenTTS: (handlers) => new Promise((resolve) => (openTTS = () => resolve(new FakeTTS(handlers)))) });
            await h.Start();
            expect(h.Types()).toEqual([]);
            openTTS!(null as never);
            await settle();
            expect(h.Types()).toEqual(['session.created']);
        });

        it('closes the one that opened when the other fails, and ends the call', async () => {
            const h = new Harness({}, { OpenTTS: async () => Promise.reject(new Error('no voice')) });
            await h.Start();
            expect(h.STT.CloseCalls).toBe(1);
            expect(h.Types()).toEqual(['error']);
            expect(h.PeerCloses).toEqual([{ Code: 1011, Reason: expect.any(String) }]);
        });

        it('a hang-up while connecting aborts both and leaves nothing open', async () => {
            let finish: (() => void) | null = null;
            const late: FakeSTT[] = [];
            const h = new Harness({}, {
                OpenSTT: (handlers, signal) => new Promise((resolve) => {
                    h.OpenSignals.push(signal);
                    finish = () => {
                        late.push(new FakeSTT(handlers));
                        resolve(late[0]);
                    };
                }),
            });
            await h.Start();
            h.Pipeline.Closed();
            expect(h.OpenSignals.every((s) => s.aborted)).toBe(true);
            finish!(); // the socket wins the race against the abort
            await settle();
            expect(late[0].CloseCalls).toBe(1);
            expect(h.TTS.CloseCalls).toBe(1);
            expect(h.Types()).toEqual([]);
        });
    });

    describe('a plain turn', () => {
        it('sends the OpenAI Realtime events in order', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('Hi there. How').Text(' are you?').Usage(12, 5).End();
            await settle();
            h.TTS.Deliver(0, 500);
            h.TTS.Deliver(1, 500);
            await settle(1100);
            expect(h.Types()).toEqual([
                'session.created',
                'input_audio_buffer.speech_started',
                'input_audio_buffer.speech_stopped',
                'input_audio_buffer.committed',
                'conversation.item.input_audio_transcription.completed',
                'response.created',
                'response.output_audio_transcript.delta',
                'response.output_audio.delta',
                'response.output_audio_transcript.delta',
                'response.output_audio.delta',
                'response.output_audio_transcript.done',
                'response.done',
            ]);
            expect(h.Of('conversation.item.input_audio_transcription.completed')[0]['transcript']).toBe('Hello.');
            expect(h.Of('response.output_audio_transcript.done')[0]['transcript']).toBe('Hi there. How are you?');
            expect(h.Of('response.output_audio_transcript.delta').map((f) => f['delta']).join('')).toBe('Hi there. How are you?');
            expect(h.Of('response.done')[0]['response']).toMatchObject({ status: 'completed', usage: { input_tokens: 12, output_tokens: 5 } });
        });

        it('ties the user events together with one item id, new for each turn', async () => {
            const h = await new Harness().Start();
            await h.Turn('One.', 'A.');
            await h.Turn('Two.', 'B.');
            const started = h.Of('input_audio_buffer.speech_started').map((f) => f['item_id']);
            const completed = h.Of('conversation.item.input_audio_transcription.completed').map((f) => f['item_id']);
            expect(started).toEqual(completed);
            expect(new Set(started).size).toBe(2);
        });

        it('asks the LLM with the prompt, tools and history', async () => {
            const h = await new Harness({ Tools: [{ Name: 't', Description: 'd', ParametersSchema: {} }] }).Start();
            await h.Turn('One.', 'First answer.');
            h.STT.Say('Two.');
            await settle();
            expect(h.History()).toEqual(['system: SYS', 'user: One.', 'assistant: First answer.', 'user: Two.']);
            expect(h.LastLLM.Request.Tools.map((t) => t.Name)).toEqual(['t']);
            expect(h.LastLLM.Request.Model).toBe('gemma-4-31b');
        });

        it.each(['<call:find{q:"How many? Now."}>', '<tool_code>\nprint(find())\n</tool_code>', '<|tool_call|>find'])('never speaks a tool call the model wrote as text (%s)', async (markup) => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('Let me check that.\n\n').Text(markup.slice(0, 4)).Text(markup.slice(4) + ' And more words. Then more.').End();
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['Let me check that.']);
            expect(warn.mock.calls.flat().join(' ')).toMatch(/tool call as text/);
        });

        it('speaks a comparison sign', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('Two < three is true.').End();
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['Two < three is true.']);
        });

        it('starts speaking at the first sentence, before the reply is finished', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('First sentence. Second');
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['First sentence.']);
        });

        it('speaks clean text and skips pieces with nothing to say', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('**Great!** It is done. 🎉').End();
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['Great!', 'It is done.']);
        });

        it('is busy until the speech has finished playing, not just arrived', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('A long answer.').End();
            await settle();
            h.TTS.Deliver(0, 3000);
            await settle(2900);
            expect(h.Types()).not.toContain('response.done');
            await settle(200);
            expect(h.Types()).toContain('response.done');
        });

        it.each([333, 1001, 1999])('keeps every word of a reply that played to its end (%d samples)', async (samples) => {
            // A length that is no whole number of milliseconds, and a timer that fires a little early, as Node's do.
            const real = globalThis.setTimeout;
            const h = await new Harness().Start();
            h.STT.Say('When?');
            await settle();
            h.LastLLM.Text('Your order ships on Monday.').End();
            await settle();
            vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => real(fn, Math.max(0, Math.floor(ms ?? 0) - 1))) as typeof setTimeout);
            h.TTS.Handlers.OnAudio(Buffer.alloc(samples * 2).toString('base64'), h.TTS.Spoken[0].ID);
            h.TTS.Handlers.OnSegmentDone(h.TTS.Spoken[0].ID);
            await settle(500);
            expect(h.Of('response.output_audio_transcript.done')[0]['transcript']).toBe('Your order ships on Monday.');
        });

        it('gives the speech model the reply as context', async () => {
            const h = await new Harness().Start();
            await h.Turn('Hello.', 'What is your email?');
            expect(h.STT.Contexts).toEqual(['What is your email?']);
        });

        it('passes microphone audio on, and ignores audio that is not base64 text', async () => {
            const h = await new Harness().Start();
            h.Receive({ type: 'input_audio_buffer.append', audio: pcm(100) });
            h.Receive({ type: 'input_audio_buffer.append', audio: 5 });
            expect(h.STT.Audio).toBe(4800);
        });

        it('finishes a reply that says nothing', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.End();
            await settle();
            expect(h.Types().slice(-2)).toEqual(['response.created', 'response.done']);
        });
    });

    describe('interruption', () => {
        async function speaking(reply = 'one two three four five six seven eight nine ten.'): Promise<Harness> {
            const h = await new Harness().Start();
            h.STT.Say('Count.');
            await settle();
            h.LastLLM.Text(reply).End();
            await settle();
            h.TTS.Deliver(0, 1000);
            await settle(500);
            return h;
        }

        it('stops the reply on speech and keeps only what was heard', async () => {
            const h = await speaking();
            h.STT.StartSaying('Stop.');
            expect(h.Types().slice(-3)).toEqual(['input_audio_buffer.speech_started', 'response.output_audio_transcript.done', 'response.done']);
            expect(h.Of('response.output_audio_transcript.done')[0]['transcript']).toBe('one two three four five');
            expect(h.Of('response.done')[0]['response']).toMatchObject({ status: 'cancelled' });
            expect(h.TTS.Cancels).toBe(1);
            h.STT.Finish('Stop.');
            await settle();
            expect(h.History().slice(-2)).toEqual(['assistant: one two three four five…', 'user: Stop.']);
        });

        it('stops the LLM when the reply is still being written', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Tell me a story.');
            await settle();
            h.LastLLM.Text('Once upon a time. There');
            await settle();
            h.STT.StartSaying('Wait');
            expect(h.LLM[0].Aborted).toBe(true);
            h.LLM[0].Text(' was a king. And');
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['Once upon a time.']);
        });

        it('sends no audio for a stopped reply', async () => {
            const h = await speaking();
            h.STT.StartSaying('Stop.');
            const before = h.Of('response.output_audio.delta').length;
            h.TTS.Deliver(0, 500);
            expect(h.Of('response.output_audio.delta').length).toBe(before);
        });

        it('is not triggered by speech start alone', async () => {
            const h = await speaking();
            h.STT.Handlers.OnSpeechStarted();
            expect(h.Of('input_audio_buffer.speech_started')).toHaveLength(1);
            expect(h.TTS.Cancels).toBe(0);
        });

        it('is not triggered by a listening sound, which starts no turn', async () => {
            const h = await speaking();
            h.STT.Say('Mm-hm.');
            await settle(600);
            expect(h.TTS.Cancels).toBe(0);
            expect(h.LLM).toHaveLength(1);
            expect(h.Of('response.done')[0]['response']).toMatchObject({ status: 'completed' });
            expect(h.Of('conversation.item.input_audio_transcription.completed')).toHaveLength(1);
        });

        it('a listening sound that ends after the reply did is an answer', async () => {
            const h = await speaking();
            h.STT.StartSaying('Yeah.');
            await settle(600);
            h.STT.Finish('Yeah.');
            await settle();
            expect(h.LLM).toHaveLength(2);
            expect(h.History().at(-1)).toBe('user: Yeah.');
        });

        it('a listening sound that grows into words interrupts', async () => {
            const h = await speaking();
            h.STT.StartSaying('Yeah');
            expect(h.TTS.Cancels).toBe(0);
            h.STT.Handlers.OnTurn({ Transcript: 'Yeah but what about Tuesday', EndOfTurn: false });
            expect(h.TTS.Cancels).toBe(1);
        });

        it('answers once when the user resumes before the reply has started', async () => {
            const h = await new Harness().Start();
            h.STT.Say('I would like to');
            await settle();
            h.STT.Say('book a table.');
            await settle();
            expect(h.LLM[0].Aborted).toBe(true);
            expect(h.History()).toEqual(['system: SYS', 'user: I would like to', 'user: book a table.']);
        });

        it('treats the user starting a turn while idle as no interruption', async () => {
            const h = await new Harness().Start();
            h.STT.StartSaying('Hello');
            expect(h.TTS.Cancels).toBe(0);
            expect(h.Types()).toEqual(['session.created', 'input_audio_buffer.speech_started']);
        });

        it('an empty turn starts no reply and is reported as not transcribed', async () => {
            const h = await new Harness().Start();
            h.STT.StartSaying('uh');
            h.STT.Finish('');
            await settle();
            expect(h.LLM).toHaveLength(0);
            expect(h.Types().at(-1)).toBe('conversation.item.input_audio_transcription.failed');
        });

        it('a sound with no words does not take the floor', async () => {
            const h = await new Harness().Start();
            h.STT.Handlers.OnSpeechStarted();
            h.Receive({ type: 'response.create' });
            await settle();
            expect(h.LLM).toHaveLength(1);
        });

        it('a turn the speech model never ends is given up, so waiting replies start', async () => {
            const h = await new Harness().Start();
            h.STT.StartSaying('I was');
            h.Receive({ type: 'response.create' });
            await settle(14_000);
            expect(h.LLM).toHaveLength(0);
            await settle(2_000);
            expect(h.Types()).toContain('conversation.item.input_audio_transcription.failed');
            expect(h.LLM).toHaveLength(1);
        });

        it('a long turn that keeps going is not given up', async () => {
            const h = await new Harness().Start();
            h.STT.StartSaying('I was');
            for (let i = 0; i < 4; i++) {
                await settle(10_000);
                h.STT.Handlers.OnTurn({ Transcript: `I was saying ${i}`, EndOfTurn: false });
            }
            expect(h.Types()).not.toContain('conversation.item.input_audio_transcription.failed');
            h.Pipeline.Closed();
            expect(vi.getTimerCount()).toBe(0);
        });

        it('response.cancel stops the reply without a speech event', async () => {
            const h = await speaking();
            const before = h.Sent.length;
            h.Receive({ type: 'response.cancel' });
            expect(h.Types().slice(before)).toEqual(['response.output_audio_transcript.done', 'response.done']);
            expect(h.TTS.Cancels).toBe(1);
        });

        it('response.cancel while idle does nothing', async () => {
            const h = await new Harness().Start();
            h.Receive({ type: 'response.cancel' });
            expect(h.Types()).toEqual(['session.created']);
        });
    });

    describe('tools', () => {
        async function called(said = ''): Promise<Harness> {
            const h = await new Harness().Start();
            h.STT.Say('Revenue?');
            await settle();
            if (said) h.LastLLM.Text(said);
            h.LastLLM.Calls({ CallID: 'c1', Name: 'find', Arguments: '{"y":1}' }).End();
            await settle();
            return h;
        }

        it('asks the host to run the tool, then voices the result', async () => {
            const h = await called();
            expect(h.Of('response.function_call_arguments.done')[0]).toMatchObject({ call_id: 'c1', name: 'find', arguments: '{"y":1}' });
            expect(h.Types().at(-1)).toBe('response.done');
            h.Receive(toolOutput('c1', '{"v":42}'));
            h.Receive({ type: 'response.create' });
            await settle();
            expect(h.LLM).toHaveLength(2);
            expect(h.LastLLM.Request.Messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"v":42}' });
        });

        it('hands the call over once the words before it have arrived, while they still play', async () => {
            const h = await called('Let me check. ');
            expect(h.Of('response.function_call_arguments.done')).toHaveLength(0);
            h.TTS.Deliver(0, 2000);
            expect(h.Of('response.function_call_arguments.done')).toHaveLength(1);
            expect(h.Types()).not.toContain('response.done');
        });

        it('drops a call the user interrupted before it was handed over', async () => {
            const h = await called('Let me check. ');
            h.TTS.Deliver(0, 2000, false);
            await settle(100);
            h.STT.Say('Never mind, stop.');
            await settle();
            expect(h.Of('response.function_call_arguments.done')).toHaveLength(0);
            expect(h.LastLLM.Request.Messages.some((m) => m.role === 'tool')).toBe(false);
        });

        it('keeps the order words, call, end', async () => {
            const h = await called('Let me check. ');
            h.TTS.Deliver(0, 100);
            await settle(200);
            expect(h.Types().slice(-4)).toEqual(['response.output_audio.delta', 'response.function_call_arguments.done', 'response.output_audio_transcript.done', 'response.done']);
        });

        it('voices a result that arrives while still speaking, after that speech', async () => {
            const h = await called('Let me check. ');
            h.TTS.Deliver(0, 2000);
            h.Receive(toolOutput('c1', '{"v":42}'));
            h.Receive({ type: 'response.create' });
            await settle(100);
            expect(h.LLM).toHaveLength(1);
            await settle(2000);
            expect(h.LLM).toHaveLength(2);
            expect(h.Types().slice(-2)).toEqual(['response.done', 'response.created']);
        });

        it('a result request while the user speaks is answered with the user turn, once', async () => {
            const h = await called();
            h.STT.StartSaying('Also the costs');
            h.Receive(toolOutput('c1', '{"v":42}'));
            h.Receive({ type: 'response.create' });
            await settle();
            expect(h.LLM).toHaveLength(1);
            h.STT.Finish('Also the costs please.');
            await settle();
            expect(h.LLM).toHaveLength(2);
            await settle(5000);
            expect(h.LLM).toHaveLength(2);
        });

        it('a result request is answered after a turn that turned out empty', async () => {
            const h = await called();
            h.STT.StartSaying('uh');
            h.Receive(toolOutput('c1', '{"v":42}'));
            h.Receive({ type: 'response.create' });
            h.STT.Finish('');
            await settle();
            expect(h.LLM).toHaveLength(2);
        });

        it('keeps the conversation valid when the user moves on before the result', async () => {
            const h = await called();
            await h.Turn('What is two plus two?', 'Four.');
            h.Receive(toolOutput('c1', '{"v":42}'));
            h.Receive({ type: 'response.create' });
            await settle();
            expect(h.History().at(-1)).toContain('{"v":42}');
        });

        it('several requests while speaking become one reply, and a plain one is not lost to a spoken update', async () => {
            const h = await called('Let me check. ');
            h.TTS.Deliver(0, 2000);
            h.Receive(toolOutput('c1', '{"v":42}'));
            h.Receive({ type: 'response.create' });
            h.Receive({ type: 'response.create', response: { instructions: 'Say it is still running.' } });
            await settle(2100);
            expect(h.LLM).toHaveLength(2);
            expect(h.History().join()).not.toContain('still running.');
        });
    });

    describe('host requests', () => {
        it('speaks one update under its instruction, which does not stay in the history', async () => {
            const h = await new Harness().Start();
            h.Receive({ type: 'response.create', response: { instructions: 'Say you are ready.' } });
            await settle();
            expect(h.History().at(-1)).toContain('Say you are ready.');
            h.LastLLM.Text('I am ready.').End();
            await settle();
            h.TTS.Deliver(0, 100);
            await settle(200);
            h.STT.Say('Good.');
            await settle();
            expect(h.History()).toEqual(['system: SYS', 'assistant: I am ready.', 'user: Good.']);
        });

        it('answers every request with its own response, so the client never waits for one that was merged', async () => {
            const h = await new Harness().Start();
            h.STT.StartSaying('Hello');
            h.Receive({ type: 'response.create' });
            h.Receive({ type: 'response.cancel' });
            h.Receive({ type: 'response.create' });
            h.STT.Finish('Hello there.');
            await settle();
            expect(h.LLM).toHaveLength(1);
            expect(h.Of('response.created')).toHaveLength(2);
            expect(h.Types().slice(-3)).toEqual(['response.created', 'response.done', 'response.created']);
        });

        it('refuses a flood of requests, each with an error', async () => {
            const h = await new Harness().Start();
            for (let i = 0; i < 100; i++) {
                h.Receive({ type: 'response.create' });
                await settle();
                h.Receive({ type: 'response.cancel' });
            }
            expect(h.LLM.length).toBeLessThanOrEqual(60);
            expect(h.Of('error').length).toBe(100 - h.Of('response.created').length);
            await settle(61_000);
            const before = h.LLM.length;
            h.Receive({ type: 'response.create' });
            await settle();
            expect(h.LLM.length).toBe(before + 1);
        });

        it('a context note causes no reply', async () => {
            const h = await new Harness().Start();
            h.Receive(message('system', 'On the Sales page.'));
            await settle();
            expect(h.LLM).toHaveLength(0);
            h.STT.Say('Where am I?');
            await settle();
            expect(h.History()[1]).toContain('On the Sales page.');
        });

        it('takes typed text and seeded history', async () => {
            const h = await new Harness().Start();
            h.Receive(message('user', 'Earlier question'));
            h.Receive(message('assistant', 'Earlier answer'));
            h.Receive({ type: 'response.create' });
            await settle();
            expect(h.History()).toEqual(['system: SYS', 'user: Earlier question', 'assistant: Earlier answer']);
        });

        it('ignores a browser trying to change the prompt or tools', async () => {
            const h = await new Harness().Start();
            h.Receive({ type: 'session.update', session: { instructions: 'HACKED', tools: [{ type: 'function', name: 'x' }] } });
            h.STT.Say('Hello.');
            await settle();
            expect(h.History()[0]).toBe('system: SYS');
            expect(h.LastLLM.Request.Tools).toEqual([]);
        });

        it('applies a session update from the server', async () => {
            const h = await new Harness({ AcceptSessionUpdates: true }).Start();
            h.Receive({ type: 'session.update', session: { instructions: 'NEW', tools: [{ type: 'function', name: 'x', description: 'd', parameters: { type: 'object' } }] } });
            h.Receive({ type: 'session.update', session: { audio: { input: { turn_detection: { type: 'server_vad', create_response: false } } } } });
            h.STT.Say('Hello.');
            await settle();
            expect(h.LLM).toHaveLength(0);
            h.Receive({ type: 'response.create' });
            await settle();
            expect(h.History()).toEqual(['system: NEW', 'user: Hello.']);
            expect(h.LastLLM.Request.Tools).toEqual([{ Name: 'x', Description: 'd', ParametersSchema: { type: 'object' } }]);
        });

        it.each(['not json', '[]', '5', 'null', '{}', '{"type":"conversation.item.create"}', '{"type":"conversation.item.create","item":{"type":"message","role":"user","content":"x"}}', '{"type":"unknown"}'])(
            'ignores %j',
            async (raw) => {
                const h = await new Harness().Start();
                expect(() => h.Pipeline.Receive(raw)).not.toThrow();
                expect(h.Types()).toEqual(['session.created']);
            }
        );
    });

    describe('first message', () => {
        it('is spoken when the first microphone audio shows the browser can play it, without the LLM', async () => {
            const h = await new Harness({ FirstMessage: 'Hi, I am Kyla.' }).Start();
            expect(h.TTS.Spoken).toEqual([]);
            h.Receive({ type: 'input_audio_buffer.append', audio: pcm(20) });
            h.Receive({ type: 'input_audio_buffer.append', audio: pcm(20) });
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['Hi, I am Kyla.']);
            expect(h.LLM).toHaveLength(0);
            h.TTS.Deliver(0, 100);
            await settle(200);
            h.STT.Say('Hello.');
            await settle();
            expect(h.History()).toEqual(['system: SYS', 'assistant: Hi, I am Kyla.', 'user: Hello.']);
        });
    });

    describe('failures', () => {
        it('an LLM failure is spoken about and reported, and the next turn works', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Fail('HTTP 503 secret-detail');
            await settle();
            expect(h.TTS.Spoken).toHaveLength(1);
            expect(h.TTS.Spoken[0].Text).toMatch(/sorry/i);
            h.TTS.Deliver(0, 500);
            await settle(600);
            expect(h.Of('error')).toHaveLength(1);
            expect(h.Of('response.done')[0]['response']).toMatchObject({ status: 'failed' });
            await h.Turn('Again.', 'Works now.');
            expect(h.History()).toEqual(['system: SYS', 'user: Hello.', 'user: Again.']);
        });

        it('does not apologise on top of words already spoken', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('Half an answer. And');
            await settle();
            h.LastLLM.Fail('HTTP 500');
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['Half an answer.']);
        });

        it('a lost voice ends that reply and is reopened for the next', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('An answer. And');
            await settle();
            h.TTS.Lose();
            await settle();
            expect(h.Of('response.done')[0]['response']).toMatchObject({ status: 'failed' });
            expect(h.PeerCloses).toEqual([]);
            await h.Turn('Again.', 'Works now.');
            expect(h.TTSs).toHaveLength(2);
            expect(h.Of('response.done')[1]['response']).toMatchObject({ status: 'completed' });
        });

        it('a voice that cannot be reopened fails the turn, not the call', async () => {
            let opens = 0;
            const h: Harness = new Harness({}, {
                OpenTTS: async (handlers) => {
                    if (++opens > 1) throw new Error('rate limited');
                    const tts = new FakeTTS(handlers);
                    h.TTSs.push(tts);
                    return tts;
                },
            });
            await h.Start();
            h.TTS.Lose();
            h.STT.Say('Hello.');
            await settle();
            expect(h.Of('response.done')[0]['response']).toMatchObject({ status: 'failed' });
            expect(h.PeerCloses).toEqual([]);
        });

        it('two replies that need the voice reopened share one connection', async () => {
            const releases: Array<() => void> = [];
            const h: Harness = new Harness({}, {
                OpenTTS: (handlers) => {
                    const tts = new FakeTTS(handlers);
                    h.TTSs.push(tts);
                    return h.TTSs.length === 1 ? Promise.resolve(tts) : new Promise((resolve) => releases.push(() => resolve(tts)));
                },
            });
            await h.Start();
            h.TTS.Lose();
            h.STT.Say('First question.');
            await settle();
            h.STT.Say('Second question.');
            await settle();
            expect(h.TTSs).toHaveLength(2);
            releases.forEach((r) => r());
            await settle();
            h.LastLLM.Text('An answer.').End();
            await settle();
            expect(h.TTS.Spoken.map((s) => s.Text)).toEqual(['An answer.']);
            h.Pipeline.Closed();
            expect(h.TTS.CloseCalls).toBe(1);
        });

        it('a late loss report from a replaced voice does not fail the reply in progress', async () => {
            const h = await new Harness().Start();
            const first = h.TTS;
            first.Lose();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('An answer. And');
            await settle();
            first.Handlers.OnLost('again');
            await settle();
            expect(h.Types()).not.toContain('response.done');
        });

        it('a voice that stalled is replaced for the next reply', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('An answer. ').End();
            await settle(60_000);
            expect(h.TTSs[0].CloseCalls).toBe(1);
            await h.Turn('Again.', 'Works now.');
            expect(h.TTSs).toHaveLength(2);
            expect(h.Of('response.done')[1]['response']).toMatchObject({ status: 'completed' });
        });

        it('a reply that stalls is failed, so the call is not stuck', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('An answer. ').End();
            await settle(60_000); // the voice never answers
            expect(h.Of('response.done')[0]['response']).toMatchObject({ status: 'failed' });
            h.STT.Say('Still there?');
            await settle();
            expect(h.LLM).toHaveLength(2);
        });

        it('a lost microphone connection ends the call so the browser can reconnect', async () => {
            const h = await new Harness().Start();
            h.STT.Handlers.OnLost('AssemblyAI STT: gone');
            await settle();
            expect(h.Types().at(-1)).toBe('error');
            expect(h.PeerCloses).toEqual([{ Code: 1011, Reason: expect.any(String) }]);
            expect(h.TTS.CloseCalls).toBe(1);
        });

        it('logs failures, with nothing anyone said', async () => {
            const h = await new Harness().Start();
            h.STT.Say('My password is hunter2.');
            await settle();
            h.LastLLM.Fail('HTTP 503');
            await settle();
            const logged = warn.mock.calls.flat().join(' ');
            expect(logged).toContain('HTTP 503');
            expect(logged).not.toContain('hunter2');
        });
    });

    describe('ending', () => {
        it('closes both services once, stops the reply, and says nothing more', async () => {
            const h = await new Harness().Start();
            h.STT.Say('Hello.');
            await settle();
            h.LastLLM.Text('An answer. And');
            await settle();
            const sent = h.Sent.length;
            h.Pipeline.Closed();
            h.Pipeline.Closed();
            h.TTS.Deliver(0, 100);
            h.STT.Say('More');
            await settle(60_000);
            expect(h.STT.CloseCalls).toBe(1);
            expect(h.TTS.CloseCalls).toBe(1);
            expect(h.LLM[0].Aborted).toBe(true);
            expect(h.LLM).toHaveLength(1);
            expect(h.Sent.length).toBe(sent);
            expect(vi.getTimerCount()).toBe(0);
        });

        it('closes a voice being reopened when the call ends meanwhile', async () => {
            let opens = 0;
            let release: (() => void) | null = null;
            const h: Harness = new Harness({}, {
                OpenTTS: (handlers) => {
                    const tts = new FakeTTS(handlers);
                    h.TTSs.push(tts);
                    return ++opens === 1 ? Promise.resolve(tts) : new Promise((resolve) => (release = () => resolve(tts)));
                },
            });
            await h.Start();
            h.TTS.Lose();
            h.STT.Say('Hello.');
            await settle();
            h.Pipeline.Closed();
            release!();
            await settle();
            expect(h.TTSs[1].CloseCalls).toBe(1);
        });

        it('ends at the time cap with the code the browser reads as a time limit', async () => {
            const h = await new Harness({ MaxSessionSeconds: 300 }).Start();
            await settle(299_000);
            expect(h.PeerCloses).toEqual([]);
            await settle(2_000);
            expect(h.PeerCloses).toEqual([{ Code: 4000, Reason: expect.any(String) }]);
            expect(h.STT.CloseCalls).toBe(1);
        });

        it('ends a connection that outlives its limit, so the browser moves to a new one', async () => {
            const h = await new Harness({ MaxConnectionSeconds: 10 }).Start();
            await settle(11_000);
            expect(h.PeerCloses).toEqual([{ Code: 1001, Reason: expect.any(String) }]);
            expect(h.STT.CloseCalls).toBe(1);
        });

        it('a failing close is logged, not thrown', async () => {
            const h = await new Harness().Start();
            h.STT.Close = async () => Promise.reject(new Error('close failed'));
            h.Pipeline.Closed();
            await settle();
            expect(warn.mock.calls.flat().join(' ')).toContain('close failed');
        });
    });
});
