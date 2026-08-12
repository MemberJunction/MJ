import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Every transcription request the mocked SDK received. */
const transcribe = vi.hoisted(() => vi.fn());

/** What `toFile` was handed, so tests can assert on the bytes and the file name. */
const toFileCalls = vi.hoisted(() => [] as Array<{ bytes: Buffer; name: string }>);

const MockGroq = vi.hoisted(() =>
    vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.audio = { transcriptions: { create: transcribe } };
    }),
);

vi.mock('groq-sdk', () => ({
    default: MockGroq,
    toFile: async (bytes: Buffer, name: string) => {
        toFileCalls.push({ bytes, name });
        return { __file: name };
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
}));

vi.mock('@memberjunction/ai', () => {
    class BaseModel {
        protected _apiKey: string;
        constructor(apiKey: string) {
            this._apiKey = apiKey;
        }
    }
    class BaseAudioGenerator extends BaseModel {}
    class SpeechResult {
        success!: boolean;
        errorMessage?: string;
        content!: string;
        data?: Buffer;
    }
    return {
        BaseModel,
        BaseAudioGenerator,
        SpeechResult,
        ErrorAnalyzer: { analyzeError: () => ({}) },
    };
});

import { GroqAudioGenerator } from '../models/groqAudio';

const MB = 1024 * 1024;

/** Audio of a given size, with a recognizable first byte so pieces can be told apart. */
function audio(bytes: number, marker = 1): Buffer {
    const buf = Buffer.alloc(bytes, 0);
    buf[0] = marker;
    return buf;
}

function makeGenerator(): GroqAudioGenerator {
    return new GroqAudioGenerator('gsk-test-key');
}

/** Silence the intentional console.error on the failure paths. */
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    transcribe.mockReset();
    transcribe.mockResolvedValue({ text: 'hello world' });
    toFileCalls.length = 0;
    MockGroq.mockClear();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GroqAudioGenerator — construction', () => {
    it('passes the api key to the SDK client', () => {
        makeGenerator();
        expect(MockGroq).toHaveBeenCalledWith({ apiKey: 'gsk-test-key' });
    });

    it('exposes the client', () => {
        expect(makeGenerator().GroqClient).toBeDefined();
    });

    it('starts with no splitter', () => {
        expect(makeGenerator().Splitter).toBeNull();
    });
});

describe('GroqAudioGenerator — single-pass transcription', () => {
    it('transcribes a buffer and returns the text', async () => {
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(1024) });
        expect(result.success).toBe(true);
        expect(result.content).toBe('hello world');
        expect(transcribe).toHaveBeenCalledTimes(1);
    });

    it('accepts base 64 audio and decodes it to the same bytes', async () => {
        const bytes = Buffer.from('fake-mp3-bytes');
        const result = await makeGenerator().SpeechToText({ model: '', audioFile: bytes.toString('base64') });
        expect(result.success).toBe(true);
        expect(toFileCalls[0].bytes.equals(bytes)).toBe(true);
    });

    it('prefers audioData when both forms are supplied', async () => {
        // Callers migrating to the Buffer form may leave the old field populated; decoding
        // the base 64 instead would transcribe stale audio.
        await makeGenerator().SpeechToText({
            model: '',
            audioData: audio(64, 9),
            audioFile: Buffer.from('something-else').toString('base64'),
        });
        expect(toFileCalls[0].bytes[0]).toBe(9);
    });

    it('defaults to whisper-large-v3', async () => {
        await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(transcribe.mock.calls[0][0].model).toBe('whisper-large-v3');
    });

    it('honours an explicit model', async () => {
        await makeGenerator().SpeechToText({ model: 'whisper-large-v3-turbo', audioData: audio(64) });
        expect(transcribe.mock.calls[0][0].model).toBe('whisper-large-v3-turbo');
    });

    it('passes language, prompt and temperature through', async () => {
        await makeGenerator().SpeechToText({
            model: '',
            audioData: audio(64),
            language: 'en',
            prompt: 'MemberJunction, Blue Cypress',
            temperature: 0.2,
        });
        const sent = transcribe.mock.calls[0][0];
        expect(sent.language).toBe('en');
        expect(sent.prompt).toBe('MemberJunction, Blue Cypress');
        expect(sent.temperature).toBe(0.2);
    });

    it('requests the json response format', async () => {
        await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(transcribe.mock.calls[0][0].response_format).toBe('json');
    });

    it('uses the supplied file name so the container format can be inferred', async () => {
        await makeGenerator().SpeechToText({ model: '', audioData: audio(64), fileName: 'episode-104.m4a' });
        expect(toFileCalls[0].name).toBe('episode-104.m4a');
    });

    it('falls back to audio.mp3 when no file name is given', async () => {
        await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(toFileCalls[0].name).toBe('audio.mp3');
    });

    it('transcribes audio exactly at the 25MB ceiling in one pass', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: vi.fn() };
        const result = await g.SpeechToText({ model: '', audioData: audio(25 * MB) });
        expect(result.success).toBe(true);
        expect(transcribe).toHaveBeenCalledTimes(1);
        expect(g.Splitter.Split).not.toHaveBeenCalled();
    });
});

describe('GroqAudioGenerator — inputs it refuses', () => {
    it('fails when neither audio form is supplied', async () => {
        const result = await makeGenerator().SpeechToText({ model: '' } as never);
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/requires either audioData/);
        expect(transcribe).not.toHaveBeenCalled();
    });

    it('fails on an empty buffer rather than uploading nothing', async () => {
        const result = await makeGenerator().SpeechToText({ model: '', audioData: Buffer.alloc(0) });
        expect(result.success).toBe(false);
        expect(transcribe).not.toHaveBeenCalled();
    });

    it('fails on an empty base 64 string', async () => {
        const result = await makeGenerator().SpeechToText({ model: '', audioFile: '' });
        expect(result.success).toBe(false);
        expect(transcribe).not.toHaveBeenCalled();
    });
});

describe('GroqAudioGenerator — empty transcripts are failures', () => {
    it('fails when the model returns an empty string', async () => {
        // Reported as success it would be stored as the episode's transcript.
        transcribe.mockResolvedValue({ text: '' });
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/no text/);
    });

    it('fails when the model returns only whitespace', async () => {
        transcribe.mockResolvedValue({ text: '   \n  ' });
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(false);
    });

    it('fails when the response carries no text field at all', async () => {
        transcribe.mockResolvedValue({});
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(false);
    });
});

describe('GroqAudioGenerator — oversized audio', () => {
    it('fails with a message naming the Splitter option when none is set', async () => {
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/AudioSplitter/);
        expect(result.errorMessage).toMatch(/30\.0MB/);
        expect(transcribe).not.toHaveBeenCalled();
    });

    it('splits, transcribes every piece, and joins the transcripts in order', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(MB, 1), audio(MB, 2), audio(MB, 3)] };
        transcribe
            .mockResolvedValueOnce({ text: 'first part' })
            .mockResolvedValueOnce({ text: 'second part' })
            .mockResolvedValueOnce({ text: 'third part' });

        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(true);
        expect(result.content).toBe('first part second part third part');
        expect(transcribe).toHaveBeenCalledTimes(3);
        expect(toFileCalls.map((c) => c.bytes[0])).toEqual([1, 2, 3]);
    });

    it('asks the splitter for pieces under the ceiling, with headroom for form overhead', async () => {
        const g = makeGenerator();
        const split = vi.fn().mockResolvedValue([audio(MB)]);
        g.Splitter = { Split: split };
        await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(split.mock.calls[0][1]).toBe(24 * MB);
        expect(split.mock.calls[0][1]).toBeLessThan(25 * MB);
    });

    it('applies language and model to every piece', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(MB, 1), audio(MB, 2)] };
        await g.SpeechToText({
            model: 'whisper-large-v3-turbo',
            audioData: audio(30 * MB),
            language: 'es',
        });
        for (const call of transcribe.mock.calls) {
            expect(call[0].model).toBe('whisper-large-v3-turbo');
            expect(call[0].language).toBe('es');
        }
    });

    it('transcribes pieces sequentially, not concurrently', async () => {
        // Groq rate limits by audio-seconds per minute, so overlapping uploads buy 429s.
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(MB, 1), audio(MB, 2), audio(MB, 3)] };
        let inFlight = 0;
        let maxInFlight = 0;
        transcribe.mockImplementation(async () => {
            maxInFlight = Math.max(maxInFlight, ++inFlight);
            await new Promise((r) => setTimeout(r, 1));
            inFlight--;
            return { text: 'part' };
        });

        await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(maxInFlight).toBe(1);
    });

    it('skips a piece that transcribed to nothing instead of joining a double space', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(MB, 1), audio(MB, 2)] };
        transcribe.mockResolvedValueOnce({ text: 'only part' }).mockResolvedValueOnce({ text: '' });
        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(true);
        expect(result.content).toBe('only part');
    });

    it('fails when every piece transcribed to nothing', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(MB, 1), audio(MB, 2)] };
        transcribe.mockResolvedValue({ text: '' });
        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/no text/);
    });

    it('fails when the splitter returns no pieces', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [] };
        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/no pieces/);
        expect(transcribe).not.toHaveBeenCalled();
    });

    it('names the splitter when it produces a piece that is still oversized', async () => {
        // Otherwise the API returns a size error naming neither the splitter nor the piece.
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(MB, 1), audio(26 * MB, 2)] };
        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/AudioSplitter produced a 26\.0MB piece/);
        // The first piece was already uploaded before the bad one was reached.
        expect(transcribe).toHaveBeenCalledTimes(1);
    });

    it('surfaces a splitter failure rather than reporting an empty transcript', async () => {
        const g = makeGenerator();
        g.Splitter = {
            Split: async () => {
                throw new Error('ffmpeg exited with code 1');
            },
        };
        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('ffmpeg exited with code 1');
    });

    it('stops at the piece that failed instead of returning a transcript with a hole', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(MB, 1), audio(MB, 2), audio(MB, 3)] };
        transcribe
            .mockResolvedValueOnce({ text: 'first' })
            .mockRejectedValueOnce(new Error('rate limit exceeded'))
            .mockResolvedValueOnce({ text: 'third' });

        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('rate limit exceeded');
        expect(transcribe).toHaveBeenCalledTimes(2);
    });
});

describe('GroqAudioGenerator — API failures', () => {
    it('reports the API error message without throwing', async () => {
        transcribe.mockRejectedValue(new Error('Groq API error (HTTP 401): invalid api key'));
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('Groq API error (HTTP 401): invalid api key');
    });

    it('reports a non-Error rejection', async () => {
        transcribe.mockRejectedValue('socket hang up');
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('Unknown error occurred');
    });
});

describe('GroqAudioGenerator — unsupported surfaces', () => {
    it('rejects CreateSpeech, since Groq has no text-to-speech API', async () => {
        await expect(makeGenerator().CreateSpeech({ voice: 'x', text: 'hi' })).rejects.toThrow(/text-to-speech/);
    });

    it('reports only the methods that work', async () => {
        expect(await makeGenerator().GetSupportedMethods()).toEqual(['SpeechToText', 'GetModels']);
    });

    it('returns no voices', async () => {
        expect(await makeGenerator().GetVoices()).toEqual([]);
    });

    it('returns no pronunciation dictionaries', async () => {
        expect(await makeGenerator().GetPronounciationDictionaries()).toEqual([]);
    });

    it('lists both Whisper models, neither claiming text-to-speech', async () => {
        const models = await makeGenerator().GetModels();
        expect(models.map((m) => m.id)).toEqual(['whisper-large-v3', 'whisper-large-v3-turbo']);
        expect(models.every((m) => m.supportsTextToSpeech === false)).toBe(true);
    });
});
