import { describe, it, expect } from 'vitest';
import {
    resolveCredentialValue,
    validateRequiredCredentials,
    resolveCredentials,
} from '../CredentialUtils';

describe('resolveCredentialValue', () => {
    it('should return request value when provided', () => {
        const result = resolveCredentialValue('request-val', 'env-val', false);
        expect(result).toBe('request-val');
    });

    it('should return env value when request value is undefined and fallback enabled', () => {
        const result = resolveCredentialValue(undefined, 'env-val', false);
        expect(result).toBe('env-val');
    });

    it('should return env value when request value is null and fallback enabled', () => {
        const result = resolveCredentialValue(null, 'env-val', false);
        expect(result).toBe('env-val');
    });

    it('should return env value when request value is empty string and fallback enabled', () => {
        const result = resolveCredentialValue('', 'env-val', false);
        expect(result).toBe('env-val');
    });

    it('should return undefined when request value is empty and fallback disabled', () => {
        const result = resolveCredentialValue(undefined, 'env-val', true);
        expect(result).toBeUndefined();
    });

    it('should return undefined when both values are undefined', () => {
        const result = resolveCredentialValue(undefined, undefined, false);
        expect(result).toBeUndefined();
    });

    it('should prefer request value over env value even when both provided', () => {
        const result = resolveCredentialValue('request', 'env', false);
        expect(result).toBe('request');
    });

    it('should return request value even when fallback is disabled', () => {
        const result = resolveCredentialValue('request-val', 'env-val', true);
        expect(result).toBe('request-val');
    });

    it('should handle numeric values', () => {
        const result = resolveCredentialValue(42, 100, false);
        expect(result).toBe(42);
    });

    it('should handle boolean values', () => {
        const result = resolveCredentialValue(true, false, false);
        expect(result).toBe(true);
    });

    it('should treat 0 as a valid request value', () => {
        const result = resolveCredentialValue(0, 100, false);
        expect(result).toBe(0);
    });

    it('should treat false as a valid request value', () => {
        const result = resolveCredentialValue(false, true, false);
        expect(result).toBe(false);
    });
});

describe('validateRequiredCredentials', () => {
    it('should not throw when all required fields are present', () => {
        const resolved = { apiKey: 'key-123', secret: 'secret-456' };
        expect(() => validateRequiredCredentials(resolved, ['apiKey', 'secret'], 'TestProvider')).not.toThrow();
    });

    it('should throw when a required field is missing (undefined)', () => {
        const resolved = { apiKey: undefined, secret: 'secret-456' };
        expect(() => validateRequiredCredentials(resolved, ['apiKey', 'secret'], 'TestProvider'))
            .toThrow('Missing required credentials for TestProvider: apiKey');
    });

    it('should throw when a required field is null', () => {
        const resolved = { apiKey: null };
        expect(() => validateRequiredCredentials(resolved, ['apiKey'], 'TestProvider'))
            .toThrow('Missing required credentials for TestProvider: apiKey');
    });

    it('should throw when a required field is empty string', () => {
        const resolved = { apiKey: '' };
        expect(() => validateRequiredCredentials(resolved, ['apiKey'], 'TestProvider'))
            .toThrow('Missing required credentials for TestProvider: apiKey');
    });

    it('should list all missing fields in error message', () => {
        const resolved = { apiKey: undefined, secret: null, token: '' };
        expect(() => validateRequiredCredentials(resolved, ['apiKey', 'secret', 'token'], 'TestProvider'))
            .toThrow('Missing required credentials for TestProvider: apiKey, secret, token');
    });

    it('should include helpful guidance in error message', () => {
        const resolved = { apiKey: undefined };
        expect(() => validateRequiredCredentials(resolved, ['apiKey'], 'TestProvider'))
            .toThrow('Provide in request or set environment variables');
    });

    it('should pass when field value is 0 (falsy but present)', () => {
        const resolved = { count: 0 };
        expect(() => validateRequiredCredentials(resolved, ['count'], 'TestProvider')).not.toThrow();
    });

    it('should pass when field value is false (falsy but present)', () => {
        const resolved = { enabled: false };
        expect(() => validateRequiredCredentials(resolved, ['enabled'], 'TestProvider')).not.toThrow();
    });

    it('should not throw for empty required fields array', () => {
        expect(() => validateRequiredCredentials({}, [], 'TestProvider')).not.toThrow();
    });
});

describe('resolveCredentials', () => {
    it('should resolve all fields from request credentials', () => {
        const result = resolveCredentials(
            { apiKey: 'req-key', secret: 'req-secret' },
            { apiKey: 'env-key', secret: 'env-secret' },
            ['apiKey', 'secret'],
            false
        );

        expect(result.values.apiKey).toBe('req-key');
        expect(result.values.secret).toBe('req-secret');
        expect(result.source).toBe('request');
        expect(result.fieldSources.apiKey).toBe('request');
        expect(result.fieldSources.secret).toBe('request');
    });

    it('should resolve all fields from environment when no request credentials', () => {
        const result = resolveCredentials(
            undefined,
            { apiKey: 'env-key', secret: 'env-secret' },
            ['apiKey', 'secret'],
            false
        );

        expect(result.values.apiKey).toBe('env-key');
        expect(result.values.secret).toBe('env-secret');
        expect(result.source).toBe('environment');
        expect(result.fieldSources.apiKey).toBe('environment');
        expect(result.fieldSources.secret).toBe('environment');
    });

    it('should return mixed source when some from request and some from env', () => {
        const result = resolveCredentials(
            { apiKey: 'req-key' },
            { apiKey: 'env-key', secret: 'env-secret' },
            ['apiKey', 'secret'],
            false
        );

        expect(result.values.apiKey).toBe('req-key');
        expect(result.values.secret).toBe('env-secret');
        expect(result.source).toBe('mixed');
        expect(result.fieldSources.apiKey).toBe('request');
        expect(result.fieldSources.secret).toBe('environment');
    });

    it('should not use env values when fallback disabled', () => {
        const result = resolveCredentials(
            { apiKey: 'req-key' },
            { apiKey: 'env-key', secret: 'env-secret' },
            ['apiKey', 'secret'],
            true
        );

        expect(result.values.apiKey).toBe('req-key');
        expect(result.values.secret).toBeUndefined();
        expect(result.source).toBe('request');
    });

    it('should skip empty request values and fall back to env', () => {
        const result = resolveCredentials(
            { apiKey: '', secret: 'req-secret' },
            { apiKey: 'env-key', secret: 'env-secret' },
            ['apiKey', 'secret'],
            false
        );

        expect(result.values.apiKey).toBe('env-key');
        expect(result.values.secret).toBe('req-secret');
        expect(result.source).toBe('mixed');
    });

    it('should handle empty env and empty request', () => {
        const result = resolveCredentials(
            {},
            {},
            ['apiKey'],
            false
        );

        expect(result.values.apiKey).toBeUndefined();
        expect(result.source).toBe('environment'); // no hasRequest, no hasEnv, defaults to environment
    });
});
