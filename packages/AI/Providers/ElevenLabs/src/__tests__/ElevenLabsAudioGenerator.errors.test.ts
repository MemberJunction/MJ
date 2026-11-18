import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * How the driver classifies a failed request, with the real ErrorAnalyzer and the errors the real
 * ElevenLabs SDK throws. Only the text-to-speech endpoint is stubbed.
 */
const convert = vi.hoisted(() => vi.fn());
const convertWithTimestamps = vi.hoisted(() => vi.fn());

vi.mock('@elevenlabs/elevenlabs-js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@elevenlabs/elevenlabs-js')>();
    class StubElevenLabsClient {
        public textToSpeech = { convert, convertWithTimestamps };
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
    convertWithTimestamps.mockReset();
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

describe('ElevenLabsAudioGenerator cancellation', () => {
    function speakWith(signal: AbortSignal): ReturnType<ElevenLabsAudioGenerator['CreateSpeech']> {
        return new ElevenLabsAudioGenerator('test-key').CreateSpeech({ text: 'Hello', voice: 'v1', model_id: 'eleven_v4', CancellationToken: signal });
    }

    it('passes the CancellationToken to the request, and reports its abort as Cancelled', async () => {
        const controller = new AbortController();
        convert.mockImplementationOnce((_voice: string, _body: object, options?: { abortSignal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
            options?.abortSignal?.addEventListener('abort', () => reject(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })), { once: true });
        }));

        const pending = speakWith(controller.signal);
        controller.abort();
        const result = await pending;

        expect(convert.mock.calls[0][2]).toEqual({ abortSignal: controller.signal });
        expect(result.success).toBe(false);
        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false });
    });

    it('stops reading the audio stream when the token aborts mid-stream', async () => {
        const controller = new AbortController();
        let pulls = 0;
        // A stream that yields one chunk, then waits forever for the next.
        const stream = new ReadableStream<Uint8Array>({
            pull(streamController) {
                pulls++;
                if (pulls === 1) {
                    streamController.enqueue(new Uint8Array([1, 2, 3]));
                    return;
                }
                return new Promise<void>(() => undefined);
            },
        });
        convert.mockResolvedValueOnce(stream);

        const pending = speakWith(controller.signal);
        setTimeout(() => controller.abort(), 10);
        const result = await pending;

        expect(result.success).toBe(false);
        expect(result.data).toBeUndefined();
        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', canFailover: false });
    });

    it('cancels the audio stream when the token aborts after the request resolves but before reading starts', async () => {
        const controller = new AbortController();
        const cancel = vi.fn();
        const stream = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined), cancel });
        convert.mockImplementationOnce(async () => {
            controller.abort();
            return stream;
        });

        const result = await speakWith(controller.signal);

        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', canFailover: false });
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('passes the CancellationToken to convertWithTimestamps when IncludeTimestamps is true, and reports its abort as Cancelled', async () => {
        const controller = new AbortController();
        convertWithTimestamps.mockImplementationOnce(
            (_voice: string, _body: object, options?: { abortSignal?: AbortSignal }) =>
                new Promise<never>((_resolve, reject) => {
                    options?.abortSignal?.addEventListener(
                        'abort',
                        () => reject(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })),
                        { once: true }
                    );
                })
        );

        const pending = new ElevenLabsAudioGenerator('test-key').CreateSpeech({
            text: 'Hello with timestamps',
            voice: 'v1',
            model_id: 'eleven_v4',
            IncludeTimestamps: true,
            CancellationToken: controller.signal,
        });
        controller.abort();
        const result = await pending;

        expect(convertWithTimestamps.mock.calls[0][2]).toEqual({ abortSignal: controller.signal });
        expect(result.success).toBe(false);
        expect(result.Alignment).toBeUndefined();
        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false });
    });

    it('reports Cancelled when the token aborts as convertWithTimestamps resolves', async () => {
        const controller = new AbortController();
        convertWithTimestamps.mockImplementationOnce(async () => {
            controller.abort();
            return {
                audioBase64: Buffer.from([1, 2, 3]).toString('base64'),
                alignment: {
                    characters: ['H'],
                    characterStartTimesSeconds: [0],
                    characterEndTimesSeconds: [0.1],
                },
            };
        });

        const result = await new ElevenLabsAudioGenerator('test-key').CreateSpeech({
            text: 'H',
            voice: 'v1',
            IncludeTimestamps: true,
            CancellationToken: controller.signal,
        });

        expect(result.success).toBe(false);
        expect(result.data).toBeUndefined();
        expect(result.Alignment).toBeUndefined();
        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', canFailover: false });
    });
});
