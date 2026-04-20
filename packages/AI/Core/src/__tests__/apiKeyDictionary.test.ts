import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIAPIKeys, GetAIAPIKey, GetAIAPIKeyGlobal } from '../generic/apiKeyDictionary';
import { MJGlobal } from '@memberjunction/global';

describe('AIAPIKeys', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        // Clear the cached API keys between tests
        (AIAPIKeys as Record<string, Record<string, string>>)['_cachedAPIKeys'] = {};
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('GetAPIKey', () => {
        it('should find API key from environment variable', () => {
            process.env['AI_VENDOR_API_KEY__OPENAILLM'] = 'sk-test-key';
            const keys = new AIAPIKeys();

            const result = keys.GetAPIKey('OpenAILLM');

            expect(result).toBe('sk-test-key');
        });

        it('should normalize key to uppercase for lookup', () => {
            process.env['AI_VENDOR_API_KEY__OPENAILLM'] = 'sk-test-key';
            const keys = new AIAPIKeys();

            const result = keys.GetAPIKey('openaillm');

            expect(result).toBe('sk-test-key');
        });

        it('should return undefined for missing API key', () => {
            const keys = new AIAPIKeys();

            const result = keys.GetAPIKey('NonExistentDriver');

            expect(result).toBeUndefined();
        });

        it('should cache API key after first lookup', () => {
            process.env['AI_VENDOR_API_KEY__TESTDRIVER'] = 'cached-key';
            const keys = new AIAPIKeys();

            // First call: reads from env
            const first = keys.GetAPIKey('TestDriver');
            // Remove env variable
            delete process.env['AI_VENDOR_API_KEY__TESTDRIVER'];
            // Second call: should return cached value
            const second = keys.GetAPIKey('TestDriver');

            expect(first).toBe('cached-key');
            expect(second).toBe('cached-key');
        });

        it('should handle case-insensitive environment variable names', () => {
            process.env['ai_vendor_api_key__mydriver'] = 'case-insensitive-key';
            const keys = new AIAPIKeys();

            const result = keys.GetAPIKey('MyDriver');

            expect(result).toBe('case-insensitive-key');
        });
    });
});

describe('GetAIAPIKey', () => {
    beforeEach(() => {
        (AIAPIKeys as Record<string, Record<string, string>>)['_cachedAPIKeys'] = {};
    });

    it('should use local API key when provided and matching', () => {
        const localKeys = [{ driverClass: 'OpenAILLM', apiKey: 'local-key' }];

        const result = GetAIAPIKey('OpenAILLM', localKeys);

        expect(result).toBe('local-key');
    });

    it('should fall back to global API key when no local match', () => {
        // Mock MJGlobal.Instance.ClassFactory.CreateInstance
        const mockApiKeys = new AIAPIKeys();
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue(mockApiKeys);
        vi.spyOn(mockApiKeys, 'GetAPIKey').mockReturnValue('global-key');

        const localKeys = [{ driverClass: 'OtherDriver', apiKey: 'other-key' }];
        const result = GetAIAPIKey('OpenAILLM', localKeys);

        expect(result).toBe('global-key');
    });

    it('should use global API key when no local keys provided', () => {
        const mockApiKeys = new AIAPIKeys();
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue(mockApiKeys);
        vi.spyOn(mockApiKeys, 'GetAPIKey').mockReturnValue('global-key');

        const result = GetAIAPIKey('OpenAILLM');

        expect(result).toBe('global-key');
    });

    it('should log verbose messages when verbose flag is true', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const localKeys = [{ driverClass: 'OpenAILLM', apiKey: 'local-key' }];

        GetAIAPIKey('OpenAILLM', localKeys, true);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Using local API key'));
        consoleSpy.mockRestore();
    });
});

describe('GetAIAPIKeyGlobal', () => {
    it('should throw error when class factory cannot create instance', () => {
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue(null);

        expect(() => GetAIAPIKeyGlobal('SomeDriver')).toThrow('Could not instantiate AIAPIKeys class');
    });

    it('should delegate to AIAPIKeys instance from ClassFactory', () => {
        const mockApiKeys = new AIAPIKeys();
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue(mockApiKeys);
        vi.spyOn(mockApiKeys, 'GetAPIKey').mockReturnValue('factory-key');

        const result = GetAIAPIKeyGlobal('TestDriver');

        expect(result).toBe('factory-key');
    });
});
