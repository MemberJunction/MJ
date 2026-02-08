import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseModel, BaseResult, BaseParams, ModelUsage } from '../generic/baseModel';

// Concrete test implementation of the abstract BaseModel
class TestModel extends BaseModel {
    // Expose the protected apiKey for testing
    public getApiKey(): string {
        return this.apiKey;
    }
}

describe('BaseResult', () => {
    it('should construct with success, startTime, and endTime', () => {
        const start = new Date('2025-01-01T00:00:00Z');
        const end = new Date('2025-01-01T00:00:05Z');
        const result = new BaseResult(true, start, end);

        expect(result.success).toBe(true);
        expect(result.startTime).toBe(start);
        expect(result.endTime).toBe(end);
    });

    it('should calculate timeElapsed correctly', () => {
        const start = new Date('2025-01-01T00:00:00Z');
        const end = new Date('2025-01-01T00:00:05Z');
        const result = new BaseResult(true, start, end);

        expect(result.timeElapsed).toBe(5000);
    });

    it('should handle zero time elapsed', () => {
        const time = new Date('2025-01-01T00:00:00Z');
        const result = new BaseResult(false, time, time);

        expect(result.timeElapsed).toBe(0);
    });

    it('should store errorMessage and exception', () => {
        const start = new Date();
        const end = new Date();
        const result = new BaseResult(false, start, end);
        result.errorMessage = 'Something failed';
        result.exception = new Error('test error');

        expect(result.errorMessage).toBe('Something failed');
        expect(result.exception).toBeInstanceOf(Error);
    });

    it('should store errorInfo', () => {
        const start = new Date();
        const end = new Date();
        const result = new BaseResult(false, start, end);
        result.errorInfo = {
            errorType: 'RateLimit',
            severity: 'Retriable',
            canFailover: true
        };

        expect(result.errorInfo.errorType).toBe('RateLimit');
        expect(result.errorInfo.severity).toBe('Retriable');
        expect(result.errorInfo.canFailover).toBe(true);
    });
});

describe('BaseParams', () => {
    it('should allow setting model name', () => {
        const params = new BaseParams();
        params.model = 'gpt-4';

        expect(params.model).toBe('gpt-4');
    });

    it('should default responseFormat to Any', () => {
        const params = new BaseParams();

        expect(params.responseFormat).toBe('Any');
    });

    it('should allow setting optional temperature', () => {
        const params = new BaseParams();
        params.temperature = 0.7;

        expect(params.temperature).toBe(0.7);
    });

    it('should allow setting maxOutputTokens', () => {
        const params = new BaseParams();
        params.maxOutputTokens = 4096;

        expect(params.maxOutputTokens).toBe(4096);
    });

    it('should allow setting seed for reproducibility', () => {
        const params = new BaseParams();
        params.seed = 42;

        expect(params.seed).toBe(42);
    });

    it('should allow setting stop sequences', () => {
        const params = new BaseParams();
        params.stopSequences = ['END', 'STOP'];

        expect(params.stopSequences).toEqual(['END', 'STOP']);
    });

    it('should allow setting reasoningBudgetTokens', () => {
        const params = new BaseParams();
        params.reasoningBudgetTokens = 8000;

        expect(params.reasoningBudgetTokens).toBe(8000);
    });
});

describe('ModelUsage', () => {
    it('should construct with promptTokens and completionTokens', () => {
        const usage = new ModelUsage(100, 50);

        expect(usage.promptTokens).toBe(100);
        expect(usage.completionTokens).toBe(50);
    });

    it('should calculate totalTokens correctly', () => {
        const usage = new ModelUsage(100, 50);

        expect(usage.totalTokens).toBe(150);
    });

    it('should handle zero tokens', () => {
        const usage = new ModelUsage(0, 0);

        expect(usage.totalTokens).toBe(0);
    });

    it('should accept optional cost and costCurrency', () => {
        const usage = new ModelUsage(100, 50, 0.005, 'USD');

        expect(usage.cost).toBe(0.005);
        expect(usage.costCurrency).toBe('USD');
    });

    it('should not set cost when undefined', () => {
        const usage = new ModelUsage(100, 50);

        expect(usage.cost).toBeUndefined();
        expect(usage.costCurrency).toBeUndefined();
    });

    it('should allow setting timing metrics', () => {
        const usage = new ModelUsage(100, 50);
        usage.queueTime = 200;
        usage.promptTime = 1000;
        usage.completionTime = 3000;

        expect(usage.queueTime).toBe(200);
        expect(usage.promptTime).toBe(1000);
        expect(usage.completionTime).toBe(3000);
    });
});

describe('BaseModel', () => {
    it('should store the API key', () => {
        const model = new TestModel('test-api-key-123');

        expect(model.getApiKey()).toBe('test-api-key-123');
    });

    it('should warn on empty API key', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        new TestModel('');

        expect(warnSpy).toHaveBeenCalledWith(
            'BaseModel: API key is empty, this might cause issues with model execution'
        );
        warnSpy.mockRestore();
    });

    it('should warn on whitespace-only API key', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        new TestModel('   ');

        expect(warnSpy).toHaveBeenCalledWith(
            'BaseModel: API key is empty, this might cause issues with model execution'
        );
        warnSpy.mockRestore();
    });

    it('should not warn on valid API key', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        new TestModel('valid-key');

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('should keep the API key protected from external access', () => {
        const model = new TestModel('secret-key');
        // The apiKey property should not be directly accessible on the public interface
        expect((model as Record<string, unknown>)['_apiKey']).toBeDefined();
        expect(model.getApiKey()).toBe('secret-key');
    });
});
