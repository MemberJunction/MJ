import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAssemblyAITTS, type AssemblyAITTSHandlers, type IAssemblyAITTS } from '../voice/assemblyAIStreamingTTS';
import { FakeSocket } from './helpers/fakeSocket';

describe('AssemblyAI streaming TTS', () => {
    let socket: FakeSocket;
    let audio: Array<[string, number]>;
    let done: number[];
    let lost: string[];

    beforeEach(() => {
        vi.useFakeTimers();
        audio = [];
        done = [];
        lost = [];
    });
    afterEach(() => vi.useRealTimers());

    const handlers: AssemblyAITTSHandlers = {
        OnAudio: (base64, id) => audio.push([base64, id]),
        OnSegmentDone: (id) => done.push(id),
        OnLost: (message) => lost.push(message),
    };
    async function open(): Promise<IAssemblyAITTS> {
        const opening = OpenAssemblyAITTS({ APIKey: 'secret', VoiceID: 'aai-kyla', SampleRate: 24000 }, handlers, (url, key) => (socket = new FakeSocket(url, key)));
        socket.Receive({ type: 'Begin', configuration: {} });
        return opening;
    }

    it('asks for the voice and raw PCM at the rate, and keeps the key out of the URL', async () => {
        await open();
        const url = new URL(socket.Url);
        expect(url.origin + url.pathname).toBe('wss://tts.us.assemblyai.com/v1/ws');
        expect(url.searchParams.get('voice_id')).toBe('aai-kyla');
        expect(url.searchParams.get('sample_rate')).toBe('24000');
        expect(url.searchParams.get('encoding')).toBe('pcm_s16le');
        expect(socket.Url).not.toContain('secret');
        expect(socket.ApiKey).toBe('secret');
    });

    it('sends each piece with a trailing space and flushes it', async () => {
        const tts = await open();
        tts.Speak('Hello there.', 1);
        expect(socket.SentText).toEqual([{ type: 'Generate', text: 'Hello there. ' }, { type: 'Flush' }]);
    });

    it('attributes audio to pieces in order', async () => {
        const tts = await open();
        tts.Speak('One.', 1);
        tts.Speak('Two.', 2);
        socket.Receive({ type: 'Audio', audio: 'AA==', flush_id: 0 });
        socket.Receive({ type: 'FlushDone', flush_id: 0 });
        socket.Receive({ type: 'WordBoundaries', flush_id: 0, words: [] });
        socket.Receive({ type: 'Audio', audio: 'BB==', flush_id: 1 });
        socket.Receive({ type: 'FlushDone', flush_id: 1 });
        expect(audio).toEqual([['AA==', 1], ['BB==', 2]]);
        expect(done).toEqual([1, 2]);
    });

    it('drops everything between a cancel and its confirmation', async () => {
        const tts = await open();
        tts.Speak('Old.', 1);
        tts.Cancel();
        tts.Speak('New.', 2);
        socket.Receive({ type: 'Audio', audio: 'OLD=', flush_id: 0 });
        socket.Receive({ type: 'Cancelled', audio_duration_seconds: 0 });
        socket.Receive({ type: 'Audio', audio: 'NEW=', flush_id: 4 });
        socket.Receive({ type: 'FlushDone', flush_id: 4 });
        expect(audio).toEqual([['NEW=', 2]]);
        expect(done).toEqual([2]);
    });

    it('matches several cancels to several confirmations', async () => {
        const tts = await open();
        tts.Speak('a', 1);
        tts.Cancel();
        tts.Speak('b', 2);
        tts.Cancel();
        tts.Speak('c', 3);
        socket.Receive({ type: 'Cancelled' });
        socket.Receive({ type: 'Audio', audio: 'B===', flush_id: 1 });
        socket.Receive({ type: 'Cancelled' });
        socket.Receive({ type: 'Audio', audio: 'C===', flush_id: 2 });
        expect(audio).toEqual([['C===', 3]]);
    });

    it('sends no cancel when nothing is being spoken', async () => {
        const tts = await open();
        tts.Cancel();
        tts.Speak('a', 1);
        socket.Receive({ type: 'FlushDone', flush_id: 0 });
        tts.Cancel();
        expect(socket.Types()).not.toContain('Cancel');
    });

    it('keeps an idle session open', async () => {
        await open();
        await vi.advanceTimersByTimeAsync(100_000);
        expect(socket.Types().filter((t) => t === 'KeepAlive').length).toBeGreaterThanOrEqual(2);
    });

    it('stops keep-alives once closed', async () => {
        const tts = await open();
        const closing = tts.Close();
        socket.Receive({ type: 'Termination' });
        await closing;
        const before = socket.SentText.length;
        await vi.advanceTimersByTimeAsync(200_000);
        expect(socket.SentText.length).toBe(before);
    });

    it('cancels speech before terminating, so a hang-up does not wait for it', async () => {
        const tts = await open();
        tts.Speak('A long story.', 1);
        const closing = tts.Close();
        expect(socket.Types().slice(-2)).toEqual(['Cancel', 'Terminate']);
        socket.Receive({ type: 'Termination' });
        await closing;
        expect(socket.CloseCalls).toBe(1);
        expect(lost).toEqual([]);
    });

    it('a cancel that is never confirmed ends the session as lost, so a new one can be opened', async () => {
        const tts = await open();
        tts.Speak('a', 1);
        tts.Cancel();
        await vi.advanceTimersByTimeAsync(4_000);
        expect(lost).toEqual([]);
        await vi.advanceTimersByTimeAsync(4_000);
        expect(lost).toHaveLength(1);
        expect(tts.IsOpen).toBe(false);
        expect(socket.CloseCalls).toBe(1);
    });

    it('a confirmed cancel leaves the session open', async () => {
        const tts = await open();
        tts.Speak('a', 1);
        tts.Cancel();
        socket.Receive({ type: 'Cancelled' });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(lost).toEqual([]);
        expect(tts.IsOpen).toBe(true);
    });

    it('logs an error the provider reports without closing, and does not blame it for a later close', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await open();
        socket.Receive({ type: 'Error', error_code: 3006, error: 'bad text' });
        expect(warn.mock.calls.flat().join(' ')).toContain('bad text');
        socket.Receive({ type: 'FlushDone', flush_id: 0 });
        socket.Drop(1006);
        expect(lost[0]).not.toContain('bad text');
        warn.mockRestore();
    });

    it('reports a lost connection once, and ignores later speech', async () => {
        const tts = await open();
        socket.Receive({ type: 'Error', error_code: 3006, error: 'idle' });
        socket.Drop(3006);
        expect(lost).toHaveLength(1);
        expect(() => tts.Speak('x', 9)).not.toThrow();
        expect(tts.IsOpen).toBe(false);
    });
});
