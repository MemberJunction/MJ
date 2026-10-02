import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * How the driver classifies a failed request, with the real ErrorAnalyzer and the errors the real
 * OpenAI SDK throws. Only the client's two audio endpoints are stubbed.
 */
const speak = vi.hoisted(() => vi.fn());
const transcribe = vi.hoisted(() => vi.fn());

vi.mock('openai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('openai')>();
    class StubOpenAI {
        public audio = { speech: { create: speak }, transcriptions: { create: transcribe } };
    }
    return { ...actual, OpenAI: StubOpenAI, toFile: async (_bytes: Buffer, name: string) => ({ name }) };
});

import { APIError } from 'openai';
import { OpenAIAudioGenerator } from '../models/tts';

/** The error the SDK throws for an HTTP error response, built the way the SDK builds it. */
function sdkError(status: number, message: string): APIError {
    return APIError.generate(status, { error: { message, type: 'invalid_request_error' } }, undefined, new Headers());
}

const INVALID_VOICE = "Invalid value: 'bogus'. Supported values are: 'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer' and 'verse'.";
const INVALID_FORMAT = "Invalid file format. Supported formats: ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']";

function makeGenerator(): OpenAIAudioGenerator {
    return new OpenAIAudioGenerator('sk-test-key');
}

beforeEach(() => {
    speak.mockReset();
    transcribe.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('OpenAIAudioGenerator error classification', () => {
    it('reports an invalid voice (a 400) as a request another vendor would reject too', async () => {
        speak.mockRejectedValueOnce(sdkError(400, INVALID_VOICE));

        const result = await makeGenerator().CreateSpeech({ text: 'Hello', voice: 'bogus', model_id: 'gpt-4o-mini-tts' });

        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe(`400 ${INVALID_VOICE}`);
        expect(result.errorInfo).toMatchObject({ httpStatusCode: 400, errorType: 'InvalidRequest', canFailover: false });
    });

    it('reports an unsupported audio format (a 400) as a request another vendor would reject too', async () => {
        transcribe.mockRejectedValueOnce(sdkError(400, INVALID_FORMAT));

        const result = await makeGenerator().SpeechToText({ model: 'whisper-1', audioData: Buffer.from('not audio'), audioFile: '' });

        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe(`400 ${INVALID_FORMAT}`);
        expect(result.errorInfo).toMatchObject({ httpStatusCode: 400, errorType: 'InvalidRequest', canFailover: false });
    });

    it.each([
        [503, 'Service Unavailable', 'ServiceUnavailable'],
        [429, 'Rate limit reached for requests', 'RateLimit'],
        [500, 'The server had an error while processing your request.', 'InternalServerError'],
    ])('reports a %i from speech as %s, which may fail over', async (status, message, errorType) => {
        speak.mockRejectedValueOnce(sdkError(status, message));

        const result = await makeGenerator().CreateSpeech({ text: 'Hello', voice: 'alloy' });

        expect(result.errorInfo).toMatchObject({ httpStatusCode: status, errorType, canFailover: true });
    });

    it('reports a 503 from transcription as an outage, which may fail over', async () => {
        transcribe.mockRejectedValueOnce(sdkError(503, 'Service Unavailable'));

        const result = await makeGenerator().SpeechToText({ model: 'whisper-1', audioData: Buffer.from('audio'), audioFile: '' });

        expect(result.errorInfo).toMatchObject({ httpStatusCode: 503, errorType: 'ServiceUnavailable', canFailover: true });
    });

    it('keeps the SDK error on the classification', async () => {
        const error = sdkError(400, INVALID_VOICE);
        speak.mockRejectedValueOnce(error);

        const result = await makeGenerator().CreateSpeech({ text: 'Hello', voice: 'bogus' });

        expect(result.errorInfo?.error).toBe(error);
    });
});
