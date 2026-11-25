import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WithRetry, DEFAULT_RETRY_CONFIG } from '../RetryRunner.js';
import type { RetryConfig } from '../RetryRunner.js';

describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have sensible defaults', () => {
        expect(DEFAULT_RETRY_CONFIG.MaxAttempts).toBe(3);
        expect(DEFAULT_RETRY_CONFIG.InitialBackoffMs).toBe(1000);
        expect(DEFAULT_RETRY_CONFIG.MaxBackoffMs).toBe(30000);
        expect(DEFAULT_RETRY_CONFIG.JitterFraction).toBe(0.1);
    });
});

describe('WithRetry', () => {
    /** Config with zero delays for fast tests */
    const fastConfig: RetryConfig = {
        MaxAttempts: 3,
        InitialBackoffMs: 0,
        MaxBackoffMs: 0,
        JitterFraction: 0,
    };

    it('should return result on first-attempt success', async () => {
        const operation = vi.fn<[], Promise<string>>().mockResolvedValue('success');

        const result = await WithRetry(operation, fastConfig);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure then succeed', async () => {
        const operation = vi.fn<[], Promise<string>>()
            .mockRejectedValueOnce(new Error('transient error'))
            .mockResolvedValueOnce('recovered');

        const result = await WithRetry(operation, fastConfig);

        expect(result).toBe('recovered');
        expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately for non-retryable errors', async () => {
        const permanentError = new Error('permanent failure');
        const operation = vi.fn<[], Promise<string>>().mockRejectedValueOnce(permanentError);
        const isRetryable = vi.fn().mockReturnValue(false);

        await expect(WithRetry(operation, fastConfig, isRetryable)).rejects.toThrow('permanent failure');
        expect(operation).toHaveBeenCalledTimes(1);
        expect(isRetryable).toHaveBeenCalledWith(permanentError);
    });

    it('should throw after exhausting all attempts', async () => {
        const operation = vi.fn<[], Promise<string>>()
            .mockRejectedValueOnce(new Error('keeps failing'))
            .mockRejectedValueOnce(new Error('keeps failing'))
            .mockRejectedValueOnce(new Error('keeps failing'));

        const config: RetryConfig = {
            MaxAttempts: 3,
            InitialBackoffMs: 0,
            MaxBackoffMs: 0,
            JitterFraction: 0,
        };

        await expect(WithRetry(operation, config)).rejects.toThrow('keeps failing');
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback before each retry', async () => {
        const operation = vi.fn<[], Promise<string>>()
            .mockRejectedValueOnce(new Error('fail-1'))
            .mockRejectedValueOnce(new Error('fail-2'))
            .mockResolvedValueOnce('success');

        const onRetry = vi.fn();

        const config: RetryConfig = {
            MaxAttempts: 4,
            InitialBackoffMs: 0,
            MaxBackoffMs: 0,
            JitterFraction: 0,
        };

        const result = await WithRetry(operation, config, () => true, onRetry);

        expect(result).toBe('success');
        expect(onRetry).toHaveBeenCalledTimes(2);

        // First retry: attempt 1, error, delay
        expect(onRetry.mock.calls[0][0]).toBe(1); // attempt number
        expect(onRetry.mock.calls[0][1]).toBeInstanceOf(Error);
        expect((onRetry.mock.calls[0][1] as Error).message).toBe('fail-1');
        expect(typeof onRetry.mock.calls[0][2]).toBe('number'); // delay

        // Second retry: attempt 2, error, delay
        expect(onRetry.mock.calls[1][0]).toBe(2);
        expect((onRetry.mock.calls[1][1] as Error).message).toBe('fail-2');
    });

    it('should not call onRetry when the first attempt succeeds', async () => {
        const operation = vi.fn<[], Promise<string>>().mockResolvedValue('first-try');
        const onRetry = vi.fn();

        await WithRetry(operation, fastConfig, () => true, onRetry);

        expect(onRetry).not.toHaveBeenCalled();
    });

    it('should not call onRetry for non-retryable errors', async () => {
        const operation = vi.fn<[], Promise<string>>().mockRejectedValueOnce(new Error('fatal'));
        const onRetry = vi.fn();

        await expect(WithRetry(operation, fastConfig, () => false, onRetry)).rejects.toThrow('fatal');
        expect(onRetry).not.toHaveBeenCalled();
    });

    it('should use exponential backoff delays', async () => {
        const operation = vi.fn<[], Promise<string>>()
            .mockRejectedValueOnce(new Error('fail'))
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce('ok');

        const onRetry = vi.fn();

        const config: RetryConfig = {
            MaxAttempts: 4,
            InitialBackoffMs: 100,
            MaxBackoffMs: 10000,
            JitterFraction: 0, // no jitter for deterministic test
        };

        // Use fake timers to control the sleep calls
        vi.useFakeTimers();

        const resultPromise = WithRetry(operation, config, () => true, onRetry);
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        vi.useRealTimers();

        expect(result).toBe('ok');
        // First retry delay: 100 * 2^0 = 100
        expect(onRetry.mock.calls[0][2]).toBe(100);
        // Second retry delay: 100 * 2^1 = 200
        expect(onRetry.mock.calls[1][2]).toBe(200);
    });

    it('should cap delay at MaxBackoffMs', async () => {
        const operation = vi.fn<[], Promise<string>>()
            .mockRejectedValueOnce(new Error('fail'))
            .mockRejectedValueOnce(new Error('fail'))
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce('ok');

        const onRetry = vi.fn();

        const config: RetryConfig = {
            MaxAttempts: 5,
            InitialBackoffMs: 100,
            MaxBackoffMs: 150, // low cap to test capping
            JitterFraction: 0,
        };

        vi.useFakeTimers();

        const resultPromise = WithRetry(operation, config, () => true, onRetry);
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        vi.useRealTimers();

        expect(result).toBe('ok');
        // First: 100 * 2^0 = 100, capped at 150 -> 100
        expect(onRetry.mock.calls[0][2]).toBe(100);
        // Second: 100 * 2^1 = 200, capped at 150 -> 150
        expect(onRetry.mock.calls[1][2]).toBe(150);
        // Third: 100 * 2^2 = 400, capped at 150 -> 150
        expect(onRetry.mock.calls[2][2]).toBe(150);
    });

    it('should handle MaxAttempts of 1 (no retries)', async () => {
        const operation = vi.fn<[], Promise<string>>().mockRejectedValueOnce(new Error('immediate fail'));

        const config: RetryConfig = {
            MaxAttempts: 1,
            InitialBackoffMs: 0,
            MaxBackoffMs: 0,
            JitterFraction: 0,
        };

        await expect(WithRetry(operation, config)).rejects.toThrow('immediate fail');
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use default config when none provided', async () => {
        const operation = vi.fn<[], Promise<string>>().mockResolvedValue('default-config');

        const result = await WithRetry(operation);

        expect(result).toBe('default-config');
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should pass the isRetryable predicate the caught error each time', async () => {
        const error1 = new Error('error-1');
        const error2 = new Error('error-2');
        const operation = vi.fn<[], Promise<string>>()
            .mockRejectedValueOnce(error1)
            .mockRejectedValueOnce(error2)
            .mockResolvedValueOnce('done');

        const isRetryable = vi.fn().mockReturnValue(true);

        const config: RetryConfig = {
            MaxAttempts: 4,
            InitialBackoffMs: 0,
            MaxBackoffMs: 0,
            JitterFraction: 0,
        };

        await WithRetry(operation, config, isRetryable);

        expect(isRetryable).toHaveBeenCalledTimes(2);
        expect(isRetryable).toHaveBeenNthCalledWith(1, error1);
        expect(isRetryable).toHaveBeenNthCalledWith(2, error2);
    });
});
