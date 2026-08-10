import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Every transcription request the mocked SDK received. */
const transcribe = vi.hoisted(() => vi.fn());

/** What `toFile` was handed, so tests can assert on the bytes and the file name. */
const toFileCalls = vi.hoisted(() => [] as Array<{ bytes: Buffer; name: string }>);

const MockOpenAI = vi.hoisted(() =>
    vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.audio = { transcriptions: { create: transcribe }, speech: { create: vi.fn() } };
    }),
);

vi.mock('openai', () => ({
    OpenAI: MockOpenAI,
    toFile: async (bytes: Buffer, name: string) => {
        toFileCalls.push({ bytes, name });
        return { __file: name };
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: Function) => target,
    };
});

// The real module, with only ErrorAnalyzer stubbed. BaseAudioGenerator owns the split-and-join
// transcription loop, so hand-stubbing it here would mean the split tests below exercise a
// reimplementation rather than the code that ships.
vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        ...actual,
        ErrorAnalyzer: { analyzeError: () => ({}) },
    };
});

import { OpenAIAudioGenerator } from '../models/tts';

const MB = 1024 * 1024;

/** Audio of a given size, with a recognizable first byte so pieces can be told apart. */
function audio(bytes: number, marker = 1): Buffer {
    const buf = Buffer.alloc(bytes, 0);
    buf[0] = marker;
    return buf;
}

function makeGenerator(): OpenAIAudioGenerator {
    return new OpenAIAudioGenerator('sk-test-key');
}

/** Silence the intentional console.error on the failure paths. */
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    transcribe.mockReset();
    transcribe.mockResolvedValue({ text: 'hello world', duration: 12 });
    toFileCalls.length = 0;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('OpenAIAudioGenerator — single-pass transcription', () => {
    it('transcribes a Buffer', async () => {
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(true);
        expect(result.content).toBe('hello world');
        expect(transcribe).toHaveBeenCalledTimes(1);
    });

    it('transcribes base 64 audio, decoding it to the same bytes', async () => {
        const bytes = audio(64, 7);
        const result = await makeGenerator().SpeechToText({ model: '', audioFile: bytes.toString('base64') });
        expect(result.success).toBe(true);
        expect(Buffer.compare(toFileCalls[0].bytes, bytes)).toBe(0);
    });

    it('defaults to whisper-1 when no model is named', async () => {
        await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(transcribe.mock.calls[0][0].model).toBe('whisper-1');
    });

    it('passes the transcription hints through', async () => {
        await makeGenerator().SpeechToText({
            model: 'whisper-1',
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

    it('requests the verbose_json response format, the only one that returns the billable duration', async () => {
        await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(transcribe.mock.calls[0][0].response_format).toBe('verbose_json');
    });

    it('uses the supplied file name so the container format can be inferred', async () => {
        await makeGenerator().SpeechToText({ model: '', audioData: audio(64), fileName: 'episode-104.m4a' });
        expect(toFileCalls[0].name).toBe('episode-104.m4a');
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

describe('OpenAIAudioGenerator — inputs it refuses', () => {
    it('fails when neither audio form is supplied', async () => {
        const result = await makeGenerator().SpeechToText({ model: '' } as never);
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/requires either audioData/);
    });

    it('fails on an empty transcript rather than storing silence as content', async () => {
        transcribe.mockResolvedValue({ text: '   ', duration: 3 });
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/no text/);
    });

    it('names the Splitter option when oversized audio arrives without one', async () => {
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/AudioSplitter/);
        expect(result.errorMessage).toMatch(/30\.0MB/);
        expect(transcribe).not.toHaveBeenCalled();
    });
});

describe('OpenAIAudioGenerator — split transcription', () => {
    it('transcribes pieces sequentially and joins the transcripts in order', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(10 * MB, 1), audio(10 * MB, 2), audio(6 * MB, 3)] };
        transcribe
            .mockResolvedValueOnce({ text: 'one', duration: 1 })
            .mockResolvedValueOnce({ text: 'two', duration: 1 })
            .mockResolvedValueOnce({ text: 'three', duration: 1 });

        const result = await g.SpeechToText({ model: '', audioData: audio(26 * MB) });
        expect(result.success).toBe(true);
        expect(result.content).toBe('one two three');
        expect(transcribe).toHaveBeenCalledTimes(3);
        expect(toFileCalls.map((c) => c.bytes[0])).toEqual([1, 2, 3]);
    });

    it('fails when the splitter returns no pieces', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [] };
        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/no pieces/);
    });

    it('names the splitter when it leaves a piece above the ceiling', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(26 * MB)] };
        const result = await g.SpeechToText({ model: '', audioData: audio(30 * MB) });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/AudioSplitter produced a 26\.0MB piece/);
    });
});

describe('OpenAIAudioGenerator — billable duration', () => {
    it('reports the reported duration as usage in seconds', async () => {
        transcribe.mockResolvedValue({ text: 'hello world', duration: 128.5 });
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.usage?.unitKind).toBe('Seconds');
        expect(result.usage?.inputUnits).toBe(128.5);
        // Transcription is not token work — leaving stale token counts here would corrupt rollups.
        expect(result.usage?.promptTokens).toBe(0);
    });

    it('sums duration across split pieces, which is what the provider bills', async () => {
        const g = makeGenerator();
        g.Splitter = { Split: async () => [audio(10 * MB, 1), audio(10 * MB, 2)] };
        transcribe
            .mockResolvedValueOnce({ text: 'one', duration: 600 })
            .mockResolvedValueOnce({ text: 'two', duration: 342.25 });

        const result = await g.SpeechToText({ model: '', audioData: audio(26 * MB) });
        expect(result.usage?.inputUnits).toBe(942.25);
    });

    it('reports NO usage when the provider omits the duration, rather than billing the run as free', async () => {
        transcribe.mockResolvedValue({ text: 'hello world' });
        const result = await makeGenerator().SpeechToText({ model: '', audioData: audio(64) });
        expect(result.success).toBe(true);
        expect(result.usage).toBeUndefined();
    });
});

describe('OpenAIAudioGenerator — capability reporting', () => {
    it('advertises SpeechToText now that it is implemented', async () => {
        expect(await makeGenerator().GetSupportedMethods()).toContain('SpeechToText');
    });

    it('lists whisper-1 as a transcription-only model', async () => {
        const models = await makeGenerator().GetModels();
        const whisper = models.find((m) => m.id === 'whisper-1');
        expect(whisper).toBeDefined();
        expect(whisper?.supportsTextToSpeech).toBe(false);
    });

    it('keeps the TTS model first, since CreateSpeech defaults to GetModels()[0]', async () => {
        const models = await makeGenerator().GetModels();
        expect(models[0].supportsTextToSpeech).toBe(true);
    });
});
