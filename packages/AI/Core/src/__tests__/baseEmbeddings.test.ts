import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEmbeddings, Embeddings } from '../generic/baseEmbeddings';
import { EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from '../generic/embed.types';
import { ModelUsage } from '../generic/baseModel';

// Concrete test implementation
class TestEmbeddings extends BaseEmbeddings {
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        return { success: true, embedding: [0.1, 0.2, 0.3], object: 'embedding' };
    }

    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        return {
            success: true,
            embeddings: [
                { embedding: [0.1, 0.2], object: 'embedding' },
                { embedding: [0.3, 0.4], object: 'embedding' }
            ],
            model: 'test-model',
            object: 'list'
        };
    }

    public async GetEmbeddingModels(): Promise<string[]> {
        return ['model-a', 'model-b'];
    }
}

describe('BaseEmbeddings', () => {
    let embeddings: TestEmbeddings;

    beforeEach(() => {
        embeddings = new TestEmbeddings('test-api-key');
    });

    describe('constructor', () => {
        it('should inherit from BaseModel and set API key', () => {
            expect(embeddings).toBeInstanceOf(BaseEmbeddings);
        });
    });

    describe('AdditionalSettings', () => {
        it('should start with empty additional settings', () => {
            expect(embeddings.AdditionalSettings).toEqual({});
        });

        it('should merge additional settings', () => {
            embeddings.SetAdditionalSettings({ dim: 512 });
            embeddings.SetAdditionalSettings({ format: 'float' });

            expect(embeddings.AdditionalSettings).toEqual({ dim: 512, format: 'float' });
        });

        it('should clear additional settings', () => {
            embeddings.SetAdditionalSettings({ dim: 512 });
            embeddings.ClearAdditionalSettings();

            expect(embeddings.AdditionalSettings).toEqual({});
        });

        it('should override existing keys', () => {
            embeddings.SetAdditionalSettings({ dim: 512 });
            embeddings.SetAdditionalSettings({ dim: 1024 });

            expect(embeddings.AdditionalSettings.dim).toBe(1024);
        });
    });

    describe('EmbedText', () => {
        it('should return embedding for single text', async () => {
            const result = await embeddings.EmbedText({ text: 'Hello world', model: 'test' });

            expect(result.success).toBe(true);
            expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
        });
    });

    describe('EmbedTexts', () => {
        it('should return embeddings for multiple texts', async () => {
            const result = await embeddings.EmbedTexts({
                texts: ['Hello', 'World'],
                model: 'test'
            });

            expect(result.success).toBe(true);
            expect(result.embeddings).toHaveLength(2);
        });
    });

    describe('GetEmbeddingModels', () => {
        it('should return available models', async () => {
            const models = await embeddings.GetEmbeddingModels();

            expect(models).toEqual(['model-a', 'model-b']);
        });
    });
});

describe('Embeddings (deprecated)', () => {
    it('should be an alias for BaseEmbeddings', () => {
        class TestDeprecated extends Embeddings {
            async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
                return { success: true, embedding: [], object: 'embedding' };
            }
            async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
                return { success: true, embeddings: [], model: 'test', object: 'list' };
            }
            async GetEmbeddingModels(): Promise<string[]> { return []; }
        }
        const instance = new TestDeprecated('key');
        expect(instance).toBeInstanceOf(BaseEmbeddings);
    });
});

// Implements ONLY EmbedText, so it exercises the base-class DEFAULT EmbedTexts (per-text fallback).
class DefaultEmbeddings extends BaseEmbeddings {
    public calls = 0;
    public failOn: string | null = null;
    public failMode: 'empty' | 'throw' = 'empty';

    // No real backoff delay in tests (the failing-text cases retry a few times before degrading).
    protected override get embedRetryBaseDelayMs(): number {
        return 0;
    }

    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        this.calls++;
        if (this.failOn !== null && params.text === this.failOn) {
            if (this.failMode === 'throw') {
                throw new Error('embed failed');
            }
            return { object: 'object', model: 'test-model', ModelUsage: new ModelUsage(0, 0), vector: [] };
        }
        // distinct, order-revealing vector seeded by text length
        const n = params.text.length;
        return { object: 'object', model: params.model ?? 'test-model', ModelUsage: new ModelUsage(1, 0), vector: [n, n + 0.5] };
    }

    public async GetEmbeddingModels(): Promise<string[]> {
        return [];
    }
}

describe('BaseEmbeddings.SupportsBatchEmbeddings', () => {
    it('defaults to false', () => {
        expect(new DefaultEmbeddings('k').SupportsBatchEmbeddings).toBe(false);
    });

    it('can be overridden to true by a subclass', () => {
        class NativeBatch extends DefaultEmbeddings {
            public override get SupportsBatchEmbeddings(): boolean {
                return true;
            }
        }
        expect(new NativeBatch('k').SupportsBatchEmbeddings).toBe(true);
    });
});

describe('BaseEmbeddings default EmbedTexts (per-text fallback)', () => {
    let embeddings: DefaultEmbeddings;
    beforeEach(() => {
        embeddings = new DefaultEmbeddings('test-api-key');
    });

    it('returns one vector per text, in order, via per-text EmbedText calls (no collapse)', async () => {
        const result = await embeddings.EmbedTexts({ texts: ['a', 'bb', 'ccc'], model: 'm' });
        expect(result.object).toBe('list');
        expect(result.vectors).toHaveLength(3);
        expect(embeddings.calls).toBe(3); // one EmbedText per text, not a single collapsed call
        expect(result.vectors).toEqual([[1, 1.5], [2, 2.5], [3, 3.5]]); // distinct + ordered
    });

    it('aggregates ModelUsage across the per-text calls', async () => {
        const result = await embeddings.EmbedTexts({ texts: ['a', 'b'], model: 'm' });
        expect(result.ModelUsage.promptTokens).toBe(2); // 1 per successful text
    });

    it('returns an empty vectors array for empty input without calling EmbedText', async () => {
        const result = await embeddings.EmbedTexts({ texts: [], model: 'm' });
        expect(result.vectors).toEqual([]);
        expect(embeddings.calls).toBe(0);
    });

    it('degrades gracefully (returns []) when a text yields an empty vector', async () => {
        embeddings.failOn = 'b';
        embeddings.failMode = 'empty';
        const result = await embeddings.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'm' });
        expect(result.vectors).toEqual([]); // no partially-corrupt batch
    });

    it('degrades gracefully (returns []) when a per-text EmbedText throws', async () => {
        embeddings.failOn = 'b';
        embeddings.failMode = 'throw';
        const result = await embeddings.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'm' });
        expect(result.vectors).toEqual([]);
    });

    it('handles more texts than the concurrency cap, preserving order', async () => {
        const texts = Array.from({ length: 10 }, (_, i) => 'x'.repeat(i + 1));
        const result = await embeddings.EmbedTexts({ texts, model: 'm' });
        expect(result.vectors).toHaveLength(10);
        expect(embeddings.calls).toBe(10);
        expect(result.vectors[0]).toEqual([1, 1.5]);
        expect(result.vectors[9]).toEqual([10, 10.5]);
    });
});

// Instruments EmbedText to record the PEAK number of concurrently in-flight calls, so we can prove
// the per-text fallback never exceeds maxEmbedTextsConcurrency (Robert's #4: "concurrency bound untested").
class ConcurrencyProbeEmbeddings extends BaseEmbeddings {
    public inFlight = 0;
    public peakInFlight = 0;
    private readonly cap: number;

    constructor(apiKey: string, cap = 4) {
        super(apiKey);
        this.cap = cap;
    }

    protected override get maxEmbedTextsConcurrency(): number {
        return this.cap;
    }

    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        this.inFlight++;
        this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
        // Yield so sibling workers get a chance to start before this call resolves — otherwise every
        // call would complete synchronously and peak in-flight would never exceed 1.
        await new Promise((resolve) => setTimeout(resolve, 5));
        this.inFlight--;
        const n = params.text.length;
        return { object: 'object', model: params.model ?? 'test-model', ModelUsage: new ModelUsage(1, 0), vector: [n] };
    }

    public async GetEmbeddingModels(): Promise<string[]> {
        return [];
    }
}

describe('BaseEmbeddings per-text concurrency bound', () => {
    it('never exceeds the default cap (4) in flight, and saturates it when texts > cap', async () => {
        const e = new ConcurrencyProbeEmbeddings('k'); // default cap = 4
        const texts = Array.from({ length: 12 }, (_, i) => 'x'.repeat(i + 1));
        const result = await e.EmbedTexts({ texts, model: 'm' });
        expect(result.vectors).toHaveLength(12);
        expect(e.peakInFlight).toBeLessThanOrEqual(4);
        expect(e.peakInFlight).toBe(4); // 12 texts > 4 workers ⇒ the cap is actually reached
    });

    it('honors a lowered concurrency cap', async () => {
        const e = new ConcurrencyProbeEmbeddings('k', 2);
        const texts = Array.from({ length: 8 }, (_, i) => 'x'.repeat(i + 1));
        await e.EmbedTexts({ texts, model: 'm' });
        expect(e.peakInFlight).toBeLessThanOrEqual(2);
        expect(e.peakInFlight).toBe(2);
    });

    it('runs no more workers than there are texts when texts < cap', async () => {
        const e = new ConcurrencyProbeEmbeddings('k', 4);
        await e.EmbedTexts({ texts: ['a', 'bb'], model: 'm' }); // only 2 texts, cap 4
        expect(e.peakInFlight).toBeLessThanOrEqual(2);
    });
});

// Fails the first `failFirst` per-text attempts (transient), then succeeds — exercises retryEmbedText.
class FlakyEmbeddings extends BaseEmbeddings {
    public attempts = 0;
    public failFirst = 0;
    public failMode: 'empty' | 'throw' = 'throw';
    protected override get embedRetryBaseDelayMs(): number {
        return 0; // no real backoff delay in tests
    }
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        this.attempts++;
        if (this.attempts <= this.failFirst) {
            if (this.failMode === 'throw') throw new Error('transient failure');
            return { object: 'object', model: 'm', ModelUsage: new ModelUsage(0, 0), vector: [] };
        }
        return { object: 'object', model: params.model ?? 'm', ModelUsage: new ModelUsage(1, 0), vector: [params.text.length] };
    }
    public async GetEmbeddingModels(): Promise<string[]> {
        return [];
    }
}

describe('BaseEmbeddings per-text retry-with-backoff', () => {
    it('retries a transient empty vector, then succeeds (batch NOT degraded)', async () => {
        const e = new FlakyEmbeddings('k'); e.failFirst = 2; e.failMode = 'empty'; // recover on the 3rd try (default 2 retries)
        const result = await e.EmbedTexts({ texts: ['abcd'], model: 'm' });
        expect(e.attempts).toBe(3); // 1 initial + 2 retries
        expect(result.vectors).toEqual([[4]]); // recovered — not the empty degrade
    });

    it('retries a transient thrown error, then succeeds', async () => {
        const e = new FlakyEmbeddings('k'); e.failFirst = 1; e.failMode = 'throw';
        const result = await e.EmbedTexts({ texts: ['ab'], model: 'm' });
        expect(e.attempts).toBe(2); // 1 initial + 1 retry
        expect(result.vectors).toEqual([[2]]);
    });

    it('gives up after the retry budget and still degrades to [] (persistent empty vector)', async () => {
        const e = new FlakyEmbeddings('k'); e.failFirst = 99; e.failMode = 'empty';
        const result = await e.EmbedTexts({ texts: ['x'], model: 'm' });
        expect(e.attempts).toBe(3); // 1 initial + 2 retries, then stop
        expect(result.vectors).toEqual([]);
    });

    it('gives up after the retry budget and still degrades to [] (persistent throw)', async () => {
        const e = new FlakyEmbeddings('k'); e.failFirst = 99; e.failMode = 'throw';
        const result = await e.EmbedTexts({ texts: ['x'], model: 'm' });
        expect(e.attempts).toBe(3);
        expect(result.vectors).toEqual([]);
    });

    it('does not retry a text that succeeds first try', async () => {
        const e = new FlakyEmbeddings('k'); e.failFirst = 0;
        await e.EmbedTexts({ texts: ['a', 'bb'], model: 'm' });
        expect(e.attempts).toBe(2); // one attempt per text
    });
});

// Declares native batch support and implements embedBatch — exercises the dispatch path.
class BatchEmbeddings extends DefaultEmbeddings {
    public batchCalls = 0;
    public override get SupportsBatchEmbeddings(): boolean {
        return true;
    }
    protected override async embedBatch(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        this.batchCalls++;
        const vectors = (params.texts ?? []).map((t) => [t.length, t.length + 0.25]);
        return { object: 'list', model: params.model ?? 'test-model', ModelUsage: new ModelUsage(0, 0), vectors };
    }
}

describe('BaseEmbeddings.EmbedTexts dispatch on SupportsBatchEmbeddings', () => {
    it('dispatches to embedBatch (not per-text) when SupportsBatchEmbeddings is true', async () => {
        const e = new BatchEmbeddings('k');
        const result = await e.EmbedTexts({ texts: ['a', 'bb'], model: 'm' });
        expect(e.batchCalls).toBe(1); // one batched call
        expect(e.calls).toBe(0); // per-text EmbedText NOT used
        expect(result.vectors).toEqual([[1, 1.25], [2, 2.25]]);
    });

    it('uses the per-text fallback when SupportsBatchEmbeddings is false', async () => {
        const e = new DefaultEmbeddings('k');
        const result = await e.EmbedTexts({ texts: ['a', 'bb'], model: 'm' });
        expect(e.calls).toBe(2); // per-text path
        expect(result.vectors).toEqual([[1, 1.5], [2, 2.5]]);
    });

    it('throws if a provider claims batch support but does not implement embedBatch', async () => {
        class BrokenBatch extends DefaultEmbeddings {
            public override get SupportsBatchEmbeddings(): boolean {
                return true;
            }
        }
        const e = new BrokenBatch('k');
        await expect(e.EmbedTexts({ texts: ['a'], model: 'm' })).rejects.toThrow(/does not implement embedBatch/i);
    });

    it('throws when a native embedBatch returns a misaligned vector count (collapse guard covers the batch path)', async () => {
        class CollapsingBatch extends DefaultEmbeddings {
            public override get SupportsBatchEmbeddings(): boolean {
                return true;
            }
            protected override async embedBatch(_params: EmbedTextsParams): Promise<EmbedTextsResult> {
                // simulate a native API that collapses N inputs into a single vector
                return { object: 'list', model: 'm', ModelUsage: new ModelUsage(0, 0), vectors: [[1, 2, 3]] };
            }
        }
        const e = new CollapsingBatch('k');
        await expect(e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'm' })).rejects.toThrow(/1:1 match|misaligned/i);
    });
});
