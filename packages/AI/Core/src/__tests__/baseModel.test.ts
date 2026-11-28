import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseModel, BaseResult, BaseParams, ModelUsage } from '../generic/baseModel';
import {
    AITransportManager,
    type FetchDispatcherLike,
    type FetchFunction,
    type ResolvedUndiciAgentOptions,
    type UndiciModuleLike,
} from '../generic/aiTransportManager';

// Concrete test implementation of the abstract BaseModel
class TestModel extends BaseModel {
    public settingsChangedCount = 0;

    // Expose protected members for testing
    public getApiKey(): string {
        return this.apiKey;
    }

    public getCustomFetch(): FetchFunction | undefined {
        return this.CustomFetch;
    }

    public getBoundFetch(): FetchFunction {
        return this.BoundFetch;
    }

    public buildTransportOptions(): { fetch?: FetchFunction } {
        return this.BuildTransportClientOptions();
    }

    public getClient<T>(factory: () => T): T {
        return this.GetOrCreateClient(factory);
    }

    public invalidate(): void {
        this.InvalidateClient();
    }

    protected override OnAdditionalSettingsChanged(): void {
        this.settingsChangedCount++;
        super.OnAdditionalSettingsChanged();
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

    describe('AdditionalSettings, lazy client caching, and AI transport integration', () => {
        beforeEach(async () => {
            await AITransportManager.Instance.Reset();
        });

        afterEach(async () => {
            await AITransportManager.Instance.Reset();
        });

        it('manages AdditionalSettings across all BaseModel modalities and invokes OnAdditionalSettingsChanged', () => {
            const model = new TestModel('key');
            expect(model.AdditionalSettings).toEqual({});

            model.SetAdditionalSettings({ endpoint: 'https://a.example.com' });
            model.SetAdditionalSettings({ timeout: 5000 });
            expect(model.AdditionalSettings).toEqual({ endpoint: 'https://a.example.com', timeout: 5000 });
            expect(model.settingsChangedCount).toBe(2);

            model.ClearAdditionalSettings();
            expect(model.AdditionalSettings).toEqual({});
            expect(model.settingsChangedCount).toBe(3);
        });

        it('caches SDK clients via GetOrCreateClient and invalidates automatically on settings changes', () => {
            const model = new TestModel('key');
            let builds = 0;
            const factory = () => ({ id: ++builds, host: model.AdditionalSettings.host ?? 'default' });

            const first = model.getClient(factory);
            const second = model.getClient(factory);
            expect(first).toBe(second);
            expect(builds).toBe(1);

            model.SetAdditionalSettings({ host: 'https://custom.local' });
            const rebuilt = model.getClient(factory);
            expect(rebuilt).not.toBe(first);
            expect(rebuilt).toEqual({ id: 2, host: 'https://custom.local' });

            model.invalidate();
            const afterManualInvalidate = model.getClient(factory);
            expect(afterManualInvalidate.id).toBe(3);
        });

        it('exposes CustomFetch, BuildTransportClientOptions, and memoized late-bound BoundFetch', async () => {
            const model = new TestModel('key');
            expect(model.getCustomFetch()).toBeUndefined();
            expect(model.buildTransportOptions()).toEqual({});

            // BoundFetch is memoized per instance and created BEFORE AITransportManager is configured
            const bound1 = model.getBoundFetch();
            const bound2 = model.getBoundFetch();
            expect(bound1).toBe(bound2);

            const createdOpts: ResolvedUndiciAgentOptions[] = [];
            const fakeUndici: UndiciModuleLike = {
                Agent: class implements FetchDispatcherLike {
                    public readonly close = vi.fn(async () => undefined);
                    public constructor(opts: ResolvedUndiciAgentOptions) {
                        createdOpts.push(opts);
                    }
                },
            };
            const baseFetch = vi.fn(async () => new Response('ok', { status: 200 }));
            AITransportManager.Instance.Configure({ headersTimeoutMs: 1_800_000, bodyTimeoutMs: 1_800_000 }, fakeUndici, baseFetch);

            expect(model.getCustomFetch()).toBeTypeOf('function');
            expect(model.buildTransportOptions()).toEqual({ fetch: model.getCustomFetch() });

            // BoundFetch picks up the post-construction transport configuration dynamically
            await bound1('https://api.example.com/v1', { method: 'POST' });
            expect(baseFetch).toHaveBeenCalledTimes(1);

            // Per-model overrides in AdditionalSettings flow through CustomFetch & BoundFetch
            model.SetAdditionalSettings({ headersTimeoutMs: 30_000 });
            await bound1('https://api.example.com/v1/override', { method: 'POST' });
            expect(baseFetch).toHaveBeenCalledTimes(2);
            expect(createdOpts).toHaveLength(2);
            expect(createdOpts[1].headersTimeout).toBe(30_000);

            // Per-model transport opt-out disables custom fetch cleanly
            model.SetAdditionalSettings({ transportDisabled: true });
            expect(model.getCustomFetch()).toBeUndefined();
            expect(model.buildTransportOptions()).toEqual({});
        });
    });
});

describe('ModelUsage.ForMedia', () => {
    it('carries the quantity in the media fields and leaves the token fields at zero', () => {
        const usage = ModelUsage.ForMedia('Seconds', 128.5);

        expect(usage.unitKind).toBe('Seconds');
        expect(usage.inputUnits).toBe(128.5);
        expect(usage.outputUnits).toBe(0);
        // Folding minutes into the token fields would make TokensUsed read as 128 tokens and
        // corrupt every token rollup and dashboard downstream.
        expect(usage.promptTokens).toBe(0);
        expect(usage.completionTokens).toBe(0);
        expect(usage.totalTokens).toBe(0);
    });

    it('accepts an output quantity for models that produce media', () => {
        const usage = ModelUsage.ForMedia('Seconds', 0, 45);

        expect(usage.inputUnits).toBe(0);
        expect(usage.outputUnits).toBe(45);
    });

    it('counts generated images', () => {
        const usage = ModelUsage.ForMedia('Images', 0, 3);

        expect(usage.unitKind).toBe('Images');
        expect(usage.outputUnits).toBe(3);
    });

    it('leaves unitKind undefined on token usage, which consumers read as Tokens', () => {
        const usage = new ModelUsage(100, 50);

        expect(usage.unitKind).toBeUndefined();
        expect(usage.inputUnits).toBeUndefined();
        expect(usage.outputUnits).toBeUndefined();
    });
});
