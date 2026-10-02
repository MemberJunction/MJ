import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * How the driver classifies a failed request, with the real ErrorAnalyzer and the errors the real
 * ElevenLabs SDK throws. Only the text-to-speech endpoint is stubbed.
 */
const convert = vi.hoisted(() => vi.fn());

vi.mock('@elevenlabs/elevenlabs-js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@elevenlabs/elevenlabs-js')>();
    class StubElevenLabsClient {
        public textToSpeech = { convert };
    }
    return { ...actual, ElevenLabsClient: StubElevenLabsClient };
});

import { ElevenLabs, ElevenLabsError, ElevenLabsTimeoutError } from '@elevenlabs/elevenlabs-js';
import { ElevenLabsAudioGenerator } from '../index';

function speakOnce(): ReturnType<ElevenLabsAudioGenerator['CreateSpeech']> {
    return new ElevenLabsAudioGenerator('test-key').CreateSpeech({ text: 'Hello', voice: 'bogus', model_id: 'eleven_v4' });
}

beforeEach(() => {
    convert.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('ElevenLabsAudioGenerator error classification', () => {
    it('reports an unknown voice (a 400) as a request another vendor would reject too', async () => {
        // The SDK throws ElevenLabsError for every status but 422.
        convert.mockRejectedValueOnce(new ElevenLabsError({
            statusCode: 400,
            body: { detail: { status: 'voice_not_found', message: 'A voice with the voice_id bogus was not found.' } },
        }));

        const result = await speakOnce();

        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/^Status code: 400\nBody: /);
        expect(result.errorInfo).toMatchObject({ httpStatusCode: 400, errorType: 'InvalidRequest', canFailover: false });
    });

    it('reports a 422 as a request another vendor would reject too', async () => {
        convert.mockRejectedValueOnce(new ElevenLabs.UnprocessableEntityError({
            detail: [{ loc: ['body', 'voice_settings', 'stability'], msg: 'Input should be less than or equal to 1', type: 'less_than_equal' }],
        }));

        const result = await speakOnce();

        expect(result.errorMessage).toMatch(/Status code: 422/);
        expect(result.errorInfo).toMatchObject({ httpStatusCode: 422, errorType: 'InvalidRequest', canFailover: false });
    });

    it.each([
        [503, 'ServiceUnavailable'],
        [429, 'RateLimit'],
    ])('reports a %i as %s, which may fail over', async (status, errorType) => {
        convert.mockRejectedValueOnce(new ElevenLabsError({ statusCode: status, body: { detail: { status: 'busy' } } }));

        const result = await speakOnce();

        expect(result.errorInfo).toMatchObject({ httpStatusCode: status, errorType, canFailover: true });
    });

    it('reports a timeout as a network error, which may fail over', async () => {
        convert.mockRejectedValueOnce(new ElevenLabsTimeoutError('Timeout exceeded when calling POST /v1/text-to-speech/{voice_id}.'));

        const result = await speakOnce();

        expect(result.errorInfo).toMatchObject({ errorType: 'NetworkError', canFailover: true });
    });
});
