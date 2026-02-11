import { describe, it, expect } from 'vitest';
import { ErrorAnalyzer } from '../generic/errorAnalyzer';

describe('ErrorAnalyzer', () => {
    describe('analyzeError', () => {
        it('should detect rate limit errors from message', () => {
            const error = { message: 'Rate limit exceeded', status: 429 };
            const info = ErrorAnalyzer.analyzeError(error, 'OpenAI');

            expect(info.errorType).toBe('RateLimit');
            expect(info.severity).toBe('Retriable');
            expect(info.canFailover).toBe(true);
        });

        it('should detect rate limit from "too many requests" message', () => {
            const error = { message: 'Too many requests, please try again' };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('RateLimit');
        });

        it('should detect authentication errors', () => {
            const error = { message: 'Invalid API key provided', status: 401 };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('Authentication');
            expect(info.severity).toBe('Fatal');
            expect(info.canFailover).toBe(true);
        });

        it('should detect context length exceeded', () => {
            const error = { message: 'context_length_exceeded: maximum context length is 128k' };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('ContextLengthExceeded');
            expect(info.severity).toBe('Fatal');
            expect(info.canFailover).toBe(true);
        });

        it('should detect NoCredit errors from billing message', () => {
            const error = { message: 'Insufficient credit balance', status: 402 };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('NoCredit');
            expect(info.severity).toBe('Retriable');
            expect(info.canFailover).toBe(true);
        });

        it('should detect service unavailable', () => {
            const error = { message: 'Service unavailable, try again later', status: 503 };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('ServiceUnavailable');
            expect(info.severity).toBe('Retriable');
        });

        it('should detect network errors', () => {
            const error = { message: 'Network timeout, request failed' };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('NetworkError');
        });

        it('should detect model errors', () => {
            const error = { message: 'Model gpt-5 not found' };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('ModelError');
            expect(info.severity).toBe('Transient');
        });

        it('should detect vendor validation errors', () => {
            const error = { message: 'PartListUnion is required for this operation' };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('VendorValidationError');
            expect(info.canFailover).toBe(true);
        });

        it('should detect invalid request (structural)', () => {
            const error = { message: 'Malformed JSON in request body' };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('InvalidRequest');
            expect(info.severity).toBe('Fatal');
            expect(info.canFailover).toBe(false);
        });

        it('should detect error type from constructor name', () => {
            const error = new Error('some error');
            Object.defineProperty(error.constructor, 'name', { value: 'RateLimitError' });
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('RateLimit');
        });

        it('should fall back to status code analysis', () => {
            const error = { message: '', status: 500 };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('InternalServerError');
        });

        it('should detect 403 as ServiceUnavailable when message is ambiguous', () => {
            const error = { message: '', status: 403 };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('ServiceUnavailable');
        });

        it('should return Unknown for unrecognized errors', () => {
            const error = { message: '' };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('Unknown');
        });

        it('should extract retry delay from Retry-After header', () => {
            const error = {
                message: 'Rate limit exceeded',
                response: { headers: { 'retry-after': '30' } }
            };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.suggestedRetryDelaySeconds).toBe(30);
        });

        it('should provide default retry delay for 429 status', () => {
            const error = { message: '', status: 429 };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.suggestedRetryDelaySeconds).toBe(30);
        });

        it('should extract provider error code', () => {
            const error = {
                message: 'something failed',
                code: 'rate_limit_exceeded'
            };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.providerErrorCode).toBe('rate_limit_exceeded');
        });

        it('should handle context_length_exceeded provider error code', () => {
            const error = {
                message: 'Some error',
                code: 'context_length_exceeded'
            };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.errorType).toBe('ContextLengthExceeded');
            expect(info.severity).toBe('Fatal');
        });

        it('should include provider name in context', () => {
            const error = { message: 'Test error' };
            const info = ErrorAnalyzer.analyzeError(error, 'Anthropic');

            expect(info.context?.provider).toBe('Anthropic');
        });

        it('should extract provider code from nested JSON in error message', () => {
            const error = {
                message: 'Error occurred: {"error":{"code":"invalid_model"}}'
            };
            const info = ErrorAnalyzer.analyzeError(error);

            expect(info.providerErrorCode).toBe('invalid_model');
        });
    });
});
