import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * How the driver classifies a failed request, with the real ErrorAnalyzer and the errors the real
 * Groq SDK throws. Only the transcription endpoint is stubbed.
 */
const transcribe = vi.hoisted(() => vi.fn());

vi.mock('groq-sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('groq-sdk')>();
    class StubGroq {
        public audio = { transcriptions: { create: transcribe } };
    }
    return { ...actual, default: StubGroq, toFile: async (_bytes: Buffer, name: string) => ({ name }) };
});

import { APIError, APIUserAbortError } from 'groq-sdk';
import { GroqAudioGenerator } from '../models/groqAudio';

/** The error the SDK throws for an HTTP error response, built the way the SDK builds it. */
function sdkError(status: number, message: string): APIError {
    return APIError.generate(status, { error: { message, type: 'invalid_request_error' } }, undefined, {});
}

function transcribeOnce(): ReturnType<GroqAudioGenerator['SpeechToText']> {
    return new GroqAudioGenerator('gsk-test-key').SpeechToText({ model: 'whisper-large-v3', audioData: Buffer.from('audio'), audioFile: '' });
}

beforeEach(() => {
    transcribe.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('GroqAudioGenerator error classification', () => {
    it('reports a 400 as a request another vendor would reject too', async () => {
        transcribe.mockRejectedValueOnce(sdkError(400, 'could not process file - is it a valid media file?'));

        const result = await transcribeOnce();

        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/^400 /);
        expect(result.errorInfo).toMatchObject({ httpStatusCode: 400, errorType: 'InvalidRequest', canFailover: false });
    });

    it.each([
        [503, 'Service Unavailable', 'ServiceUnavailable'],
        [429, 'Rate limit reached for model `whisper-large-v3`', 'RateLimit'],
    ])('reports a %i as %s, which may fail over', async (status, message, errorType) => {
        transcribe.mockRejectedValueOnce(sdkError(status, message));

        const result = await transcribeOnce();

        expect(result.errorInfo).toMatchObject({ httpStatusCode: status, errorType, canFailover: true });
    });
});

describe('GroqAudioGenerator cancellation', () => {
    it('passes the CancellationToken to the transcription request, and reports its abort as Cancelled', async () => {
        const controller = new AbortController();
        transcribe.mockImplementationOnce((_body: object, options?: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
            if (options?.signal?.aborted) {
                reject(new APIUserAbortError());
                return;
            }
            options?.signal?.addEventListener('abort', () => reject(new APIUserAbortError()), { once: true });
        }));

        const pending = new GroqAudioGenerator('gsk-test-key').SpeechToText({
            model: 'whisper-large-v3', audioData: Buffer.from('audio'), audioFile: '', CancellationToken: controller.signal,
        });
        controller.abort();
        const result = await pending;

        expect(transcribe.mock.calls[0][1]).toEqual({ signal: controller.signal });
        expect(result.success).toBe(false);
        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false });
    });

    it('sends nothing when the CancellationToken has already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await new GroqAudioGenerator('gsk-test-key').SpeechToText({
            model: 'whisper-large-v3', audioData: Buffer.from('audio'), audioFile: '', CancellationToken: controller.signal,
        });

        expect(transcribe).not.toHaveBeenCalled();
        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', canFailover: false });
    });
});
