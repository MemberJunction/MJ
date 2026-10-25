import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEmbeddings, EmbeddingDimensionsError, EmbeddingModelInfo, Embeddings } from '../generic/baseEmbeddings';
import { ErrorAnalyzer } from '../generic/errorAnalyzer';
import { EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from '../generic/embed.types';
import { ModelUsage } from '../generic/baseModel';
import { AIErrorInfo } from '../generic/errorTypes';

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

describe('BaseEmbeddings.RequiresAPIKey', () => {
    it('defaults to true, since most providers call a hosted API', () => {
        expect(new DefaultEmbeddings('k').RequiresAPIKey).toBe(true);
    });

    it('can be overridden to false by an in-process provider', () => {
        class KeylessEmbeddings extends DefaultEmbeddings {
            public override get RequiresAPIKey(): boolean {
                return false;
            }
        }
        expect(new KeylessEmbeddings('').RequiresAPIKey).toBe(false);
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

/** A driver with a model table, exposing the shared `dimensions` rule. */
class TableEmbeddings extends TestEmbeddings {
    protected override get EmbeddingModels(): readonly EmbeddingModelInfo[] {
        return [
            { Model: 'fixed', Description: 'one width, rejects dimensions', OutputDimension: 1536, AcceptsDimensions: false },
            { Model: 'ranged', Description: 'any width up to 3072', OutputDimension: 3072, AcceptsDimensions: true },
            { Model: 'listed', Description: 'three widths', OutputDimension: 1024, AcceptsDimensions: true, SupportedDimensions: [256, 512, 1024] },
        ];
    }

    public Dimensions(model: string, dimensions?: number): { dimensions?: number } {
        return this.DimensionsParam(model, dimensions);
    }
}

describe('BaseEmbeddings.DimensionsParam', () => {
    const e = new TableEmbeddings('k');

    it('sends nothing when no width is requested', () => {
        expect(e.Dimensions('ranged')).toEqual({});
        expect(e.Dimensions('fixed', 0)).toEqual({});
    });

    it('omits dimensions for a model that rejects it when the width is its own', () => {
        expect(e.Dimensions('fixed', 1536)).toEqual({});
    });

    it('sends a width the model can produce', () => {
        expect(e.Dimensions('ranged', 512)).toEqual({ dimensions: 512 });
        expect(e.Dimensions('ranged', 3072)).toEqual({ dimensions: 3072 });
        expect(e.Dimensions('listed', 256)).toEqual({ dimensions: 256 });
    });

    it('refuses a width the model cannot produce, with a non-retriable classification', () => {
        expect(() => e.Dimensions('fixed', 512)).toThrow(EmbeddingDimensionsError);
        expect(() => e.Dimensions('fixed', 512)).toThrow("Embedding model 'fixed' can't produce 512-dimension vectors; it supports only 1536.");
        expect(() => e.Dimensions('ranged', 4096)).toThrow('it supports 1 to 3072');
        expect(() => e.Dimensions('listed', 768)).toThrow('it supports 256, 512, 1024');
    });

    it('passes the width through for a model not in the table, and for a driver with no table', () => {
        expect(e.Dimensions('unknown', 4096)).toEqual({ dimensions: 4096 });
        expect(new (class extends TestEmbeddings {
            public Dimensions(model: string, dimensions?: number): { dimensions?: number } { return this.DimensionsParam(model, dimensions); }
        })('k').Dimensions('fixed', 512)).toEqual({ dimensions: 512 });
    });

    it('carries a classification ErrorAnalyzer keeps: no retry, no failover', () => {
        let thrown: unknown;
        try {
            e.Dimensions('fixed', 512);
        } catch (error) {
            thrown = error;
        }
        expect(ErrorAnalyzer.AnalyzeError(thrown)).toMatchObject({ errorType: 'InvalidRequest', severity: 'Fatal', canFailover: false });
    });
});

/**
 * A refusal is a configuration error, so the per-text path must not treat it as a transient
 * failure. Retrying it sleeps through the backoff to reach the same answer, and degrading it to an
 * empty result is what the refusal exists to replace: the runner reads an empty result as
 * "No vectors returned", classifies it Retriable and fails over to another vendor, which fails the
 * same way. Both layers arrived with embedding cancellation; the refusal arrived with #5234.
 */
describe('BaseEmbeddings.EmbedTexts and a refused width on the per-text path', () => {
    /** Per-text driver (no native batch) whose EmbedText refuses a width its model can't produce. */
    class RefusingEmbeddings extends BaseEmbeddings {
        public attempts = 0;
        protected override get EmbeddingModels(): readonly EmbeddingModelInfo[] {
            return [{ Model: 'fixed', Description: 'one width, rejects dimensions', OutputDimension: 1536, AcceptsDimensions: false }];
        }
        public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
            this.attempts++;
            this.DimensionsParam(params.model ?? '', params.dimensions);
            return { object: 'object', model: 'fixed', ModelUsage: new ModelUsage(1, 0), vector: [0.1] };
        }
        public async GetEmbeddingModels(): Promise<string[]> {
            return ['fixed'];
        }
    }

    it('throws the refusal instead of degrading to an empty result, and does not retry it', async () => {
        const e = new RefusingEmbeddings('k');

        await expect(e.EmbedTexts({ texts: ['a'], model: 'fixed', dimensions: 512 })).rejects.toThrow(EmbeddingDimensionsError);
        expect(e.attempts).toBe(1); // one attempt; 3 would mean the refusal was retried through the backoff
    });

    it('still degrades an ordinary per-text failure, which retry and the error contract own', async () => {
        class FailingEmbeddings extends RefusingEmbeddings {
            public override async EmbedText(_params: EmbedTextParams): Promise<EmbedTextResult> {
                this.attempts++;
                throw new Error('503 upstream unavailable');
            }
            protected override get embedRetryBaseDelayMs(): number {
                return 0; // no real sleeping in a unit test
            }
        }
        const e = new FailingEmbeddings('k');

        const r = await e.EmbedTexts({ texts: ['a'], model: 'fixed', dimensions: 1536 });
        expect(r.vectors).toEqual([]);
        expect(e.attempts).toBe(3); // the initial attempt plus maxEmbedTextsRetries
    });
});

/** The classification a thrown cancellation error carries. */
function errorTypeOf(error: Error & { errorInfo?: AIErrorInfo }): string | undefined {
    return error.errorInfo?.errorType;
}

/** Captures the error an operation rejects with, failing the test if it resolves. */
async function rejectionOf(operation: Promise<unknown>): Promise<Error & { errorInfo?: AIErrorInfo }> {
    try {
        await operation;
    } catch (error) {
        if (error instanceof Error) {
            return error;
        }
        throw new Error(`rejected with a non-Error: ${String(error)}`);
    }
    throw new Error('expected the operation to reject');
}

// Per-text driver whose EmbedText can abort the caller's controller, or fail with a scripted error.
class CancellableEmbeddings extends BaseEmbeddings {
    public attempts = 0;
    public seenSignals: Array<AbortSignal | undefined> = [];
    public onAttempt: ((attempt: number) => void) | null = null;
    public retryDelayMs = 0;

    protected override get maxEmbedTextsConcurrency(): number {
        return 1; // sequential, so "texts after the abort" is well defined
    }
    protected override get embedRetryBaseDelayMs(): number {
        return this.retryDelayMs;
    }
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        this.attempts++;
        this.seenSignals.push(params.CancellationToken);
        this.onAttempt?.(this.attempts);
        return { object: 'object', model: 'm', ModelUsage: new ModelUsage(1, 0), vector: [params.text.length] };
    }
    public async GetEmbeddingModels(): Promise<string[]> {
        return [];
    }
}

describe('BaseEmbeddings.EmbedTexts cancellation', () => {
    it('refuses a pre-aborted call before any text or batch is sent', async () => {
        const perText = new CancellableEmbeddings('k');
        const batch = new BatchEmbeddings('k');
        const controller = new AbortController();
        controller.abort('stop');

        const perTextError = await rejectionOf(perText.EmbedTexts({ texts: ['a', 'b'], model: 'm', CancellationToken: controller.signal }));
        const batchError = await rejectionOf(batch.EmbedTexts({ texts: ['a', 'b'], model: 'm', CancellationToken: controller.signal }));

        expect(perText.attempts).toBe(0);
        expect(batch.batchCalls).toBe(0);
        expect(errorTypeOf(perTextError)).toBe('Cancelled');
        expect(errorTypeOf(batchError)).toBe('Cancelled');
    });

    it('forwards the signal to each per-text EmbedText call', async () => {
        const e = new CancellableEmbeddings('k');
        const controller = new AbortController();
        await e.EmbedTexts({ texts: ['a', 'b'], model: 'm', CancellationToken: controller.signal });
        expect(e.seenSignals).toEqual([controller.signal, controller.signal]);
    });

    it('stops before the next text once aborted, and throws a cancellation instead of degrading to []', async () => {
        const e = new CancellableEmbeddings('k');
        const controller = new AbortController();
        e.onAttempt = (n) => {
            if (n === 2) {
                controller.abort('user pressed stop');
            }
        };

        const error = await rejectionOf(e.EmbedTexts({ texts: ['a', 'b', 'c', 'd'], model: 'm', CancellationToken: controller.signal }));

        expect(e.attempts).toBe(2); // texts 3 and 4 never sent
        expect(errorTypeOf(error)).toBe('Cancelled');
        expect(error.message).toContain('user pressed stop');
    });

    it('never retries a text whose call was aborted', async () => {
        const e = new CancellableEmbeddings('k');
        const controller = new AbortController();
        e.onAttempt = () => {
            controller.abort('stop');
            const abort = new Error('This operation was aborted');
            abort.name = 'AbortError';
            throw abort;
        };

        const error = await rejectionOf(e.EmbedTexts({ texts: ['a'], model: 'm', CancellationToken: controller.signal }));

        expect(e.attempts).toBe(1); // no retry, despite the default retry budget of 2
        expect(errorTypeOf(error)).toBe('Cancelled');
    });

    it('does not retry an abort error even without a token', async () => {
        const e = new CancellableEmbeddings('k');
        e.onAttempt = () => {
            const abort = new Error('This operation was aborted');
            abort.name = 'AbortError';
            throw abort;
        };

        const error = await rejectionOf(e.EmbedTexts({ texts: ['a'], model: 'm' }));

        expect(e.attempts).toBe(1);
        expect(errorTypeOf(error)).toBe('Cancelled');
    });

    it('cuts the retry backoff short when the signal fires during the wait', async () => {
        const e = new CancellableEmbeddings('k');
        e.retryDelayMs = 60_000; // a backoff the test would never outlive
        const controller = new AbortController();
        e.onAttempt = () => {
            throw new Error('503 Service Unavailable'); // transient: the base backs off before retrying
        };
        setTimeout(() => controller.abort('stop'), 20);

        const started = Date.now();
        const error = await rejectionOf(e.EmbedTexts({ texts: ['a'], model: 'm', CancellationToken: controller.signal }));

        expect(Date.now() - started).toBeLessThan(5_000);
        expect(e.attempts).toBe(1); // the retry never started
        expect(errorTypeOf(error)).toBe('Cancelled');
    });

    it('reports an abort caused by a timeout as a retriable network error, not a cancellation', async () => {
        const e = new CancellableEmbeddings('k');
        const controller = new AbortController();
        e.onAttempt = () => controller.abort(Object.assign(new Error('the model call was aborted (timeout)'), { IsTimeout: true }));

        const error = await rejectionOf(e.EmbedTexts({ texts: ['a', 'b'], model: 'm', CancellationToken: controller.signal }));

        expect(errorTypeOf(error)).toBe('NetworkError');
        expect(error.errorInfo?.canFailover).toBe(true);
    });

    it('refuses a pre-aborted EmbedContent', async () => {
        const e = new CancellableEmbeddings('k');
        const controller = new AbortController();
        controller.abort('stop');
        const error = await rejectionOf(e.EmbedContent({ content: 'hello', model: 'm', CancellationToken: controller.signal }));
        expect(e.attempts).toBe(0);
        expect(errorTypeOf(error)).toBe('Cancelled');
    });
});
