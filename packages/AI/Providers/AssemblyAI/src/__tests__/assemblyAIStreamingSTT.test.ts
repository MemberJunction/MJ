import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAssemblyAISTT, type AssemblyAISTTHandlers, type AssemblyAISTTOptions, type IAssemblyAISTT } from '../voice/assemblyAIStreamingSTT';
import { FakeSocket } from './helpers/fakeSocket';

const BASE: AssemblyAISTTOptions = { APIKey: 'secret', SpeechModel: 'assemblyai-stt-3-7-realtime-agent', SampleRate: 24000 };

describe('AssemblyAI streaming STT', () => {
    let socket: FakeSocket;
    let handlers: { [K in keyof AssemblyAISTTHandlers]: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.useFakeTimers();
        handlers = { OnSpeechStarted: vi.fn(), OnTurn: vi.fn(), OnLost: vi.fn() };
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const start = (options: Partial<AssemblyAISTTOptions> = {}, signal?: AbortSignal): Promise<IAssemblyAISTT> =>
        OpenAssemblyAISTT({ ...BASE, ...options }, handlers as unknown as AssemblyAISTTHandlers, (url, key) => (socket = new FakeSocket(url, key)), signal);

    async function open(options: Partial<AssemblyAISTTOptions> = {}): Promise<IAssemblyAISTT> {
        const opening = start(options);
        socket.Receive({ type: 'Begin', id: 'x', configuration: { model: BASE.SpeechModel } });
        return opening;
    }

    it('asks for the model and rate, and keeps the key out of the URL', async () => {
        await open({ Mode: 'balanced', MaxTurnSilenceMs: 900, VadThreshold: 0.4, Keyterms: ['Kyla', 'MJ'] });
        const url = new URL(socket.Url);
        expect(url.origin + url.pathname).toBe('wss://streaming.assemblyai.com/v3/ws');
        expect(url.searchParams.get('speech_model')).toBe('assemblyai-stt-3-7-realtime-agent');
        expect(url.searchParams.get('sample_rate')).toBe('24000');
        expect(url.searchParams.get('mode')).toBe('balanced');
        expect(url.searchParams.get('max_turn_silence')).toBe('900');
        expect(url.searchParams.get('vad_threshold')).toBe('0.4');
        expect(JSON.parse(url.searchParams.get('keyterms_prompt') ?? '')).toEqual(['Kyla', 'MJ']);
        expect(socket.Url).not.toContain('secret');
        expect(socket.ApiKey).toBe('secret');
    });

    it('rejects with the provider message, and closes, when the provider refuses', async () => {
        const opening = start();
        const failed = expect(opening).rejects.toThrow(/Invalid API key/);
        socket.Receive({ type: 'Error', error_code: 1008, error: 'Invalid API key' });
        await failed;
        expect(socket.CloseCalls).toBeGreaterThan(0);
    });

    it('rejects when the socket closes before Begin', async () => {
        const opening = start();
        const failed = expect(opening).rejects.toThrow(/closed.*1006/);
        socket.Drop(1006);
        await failed;
    });

    it('rejects and closes when Begin never comes', async () => {
        const opening = start();
        const failed = expect(opening).rejects.toThrow(/did not open/);
        await vi.advanceTimersByTimeAsync(11_000);
        await failed;
        expect(socket.CloseCalls).toBeGreaterThan(0);
    });

    it('closes a socket that is still connecting when the caller gives up', async () => {
        const abort = new AbortController();
        const opening = start({}, abort.signal);
        const failed = expect(opening).rejects.toThrow(/aborted/);
        abort.abort();
        await failed;
        expect(socket.CloseCalls).toBeGreaterThan(0);
    });

    it('warns when the provider runs a different model than asked', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const opening = start();
        socket.Receive({ type: 'Begin', configuration: { model: 'universal-3-6-pro' } });
        await opening;
        expect(warn.mock.calls.flat().join(' ')).toContain('universal-3-6-pro');
    });

    it('batches audio to 50 ms frames', async () => {
        const stt = await open();
        const fiftyMs = (24000 * 2) / 20;
        stt.SendAudio(new Uint8Array(fiftyMs / 2));
        expect(socket.SentBinary).toHaveLength(0);
        stt.SendAudio(new Uint8Array(fiftyMs / 2));
        stt.SendAudio(new Uint8Array(fiftyMs + 10));
        expect(socket.SentBinary.map((b) => b.byteLength)).toEqual([fiftyMs, fiftyMs + 10]);
    });

    it('splits a very long chunk so no frame exceeds one second', async () => {
        const stt = await open();
        stt.SendAudio(new Uint8Array(24000 * 2 * 2.5));
        expect(Math.max(...socket.SentBinary.map((b) => b.byteLength))).toBeLessThanOrEqual(48000);
        expect(socket.SentBinary.reduce((n, b) => n + b.byteLength, 0)).toBe(120000);
    });

    it('reports speech and turns', async () => {
        await open();
        socket.Receive({ type: 'SpeechStarted', timestamp: 1 });
        socket.Receive({ type: 'Turn', turn_order: 0, transcript: 'Hello', end_of_turn: false });
        socket.Receive({ type: 'Turn', turn_order: 0, transcript: 'Hello there.', end_of_turn: true });
        expect(handlers.OnSpeechStarted).toHaveBeenCalledTimes(1);
        expect(handlers.OnTurn.mock.calls.map((c) => c[0])).toEqual([
            { Transcript: 'Hello', EndOfTurn: false },
            { Transcript: 'Hello there.', EndOfTurn: true },
        ]);
    });

    it('ignores unknown frames and bad JSON', async () => {
        await open();
        socket.OnMessage?.('not json');
        socket.Receive({ type: 'Heartbeat' });
        expect(handlers.OnTurn).not.toHaveBeenCalled();
        expect(handlers.OnLost).not.toHaveBeenCalled();
    });

    it('sends the agent reply as context', async () => {
        const stt = await open();
        stt.UpdateAgentContext('What is your email?');
        expect(socket.SentText).toContainEqual({ type: 'UpdateConfiguration', agent_context: 'What is your email?' });
    });

    it('sends only the end of a long reply, which is what the user answers', async () => {
        const stt = await open();
        stt.UpdateAgentContext('x'.repeat(5000) + ' What is your email?');
        const sent = String(socket.SentText.at(-1)?.['agent_context']);
        expect(sent.length).toBeLessThanOrEqual(1000);
        expect(sent.endsWith('What is your email?')).toBe(true);
    });

    it('terminates before closing, and does not call that a loss', async () => {
        const stt = await open();
        const closing = stt.Close();
        expect(socket.Types()).toContain('Terminate');
        expect(socket.CloseCalls).toBe(0);
        socket.Receive({ type: 'Termination', audio_duration_seconds: 3, session_duration_seconds: 4 });
        await closing;
        expect(socket.CloseCalls).toBe(1);
        expect(handlers.OnLost).not.toHaveBeenCalled();
    });

    it('closes anyway when the provider never confirms, and only once', async () => {
        const stt = await open();
        const first = stt.Close();
        const second = stt.Close();
        await vi.advanceTimersByTimeAsync(3_000);
        await Promise.all([first, second]);
        expect(socket.Types().filter((t) => t === 'Terminate')).toHaveLength(1);
        expect(socket.CloseCalls).toBe(1);
    });

    it('reports a lost connection with the provider reason, once', async () => {
        await open();
        socket.Receive({ type: 'Error', error_code: 3008, error: 'Session expired' });
        socket.Drop(3008, 'See Error message for details');
        expect(handlers.OnLost).toHaveBeenCalledTimes(1);
        expect(handlers.OnLost.mock.calls[0][0]).toContain('Session expired');
    });

    it('drops audio after it closed instead of throwing', async () => {
        const stt = await open();
        socket.Drop(1006);
        expect(() => stt.SendAudio(new Uint8Array(4800))).not.toThrow();
    });
});
