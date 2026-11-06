/**
 * Unit tests for the audio lines in prompt-run pricing (`MJAIPromptRunEntityServer.CalculateAndSetCost`).
 *
 * A realtime run that stored a usage record with audio tokens prices each direction's audio tokens on an `'Audio'`
 * line when the model vendor's resolved configuration has a price for it (`Realtime.Pricing.AudioInput` /
 * `AudioOutput`, per 1M tokens); those tokens leave the default row's input or output bucket. Audio tokens without a
 * usable price stay on the default line at the row's rate, which is then marked `Blended`, with one log line.
 *
 * Cache hits the record counts (`Input.CachedTokens`, cached audio included) price at the row's cache-read rate, and
 * the input audio line prices only the uncached audio (`AudioTokens` less `CachedAudioTokens`).
 *
 * Same harness as the avatar video suite: a stub generated base, the engine's catalog lookups stubbed, the real
 * pricing math. Numbers: a GPT Realtime style cost row at $4 / $16 per 1M text tokens, audio at $32 in / $64 out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AIModelConfiguration, RealtimeUnitPrice } from '@memberjunction/ai';
import type { MJAIModelCostEntity, MJAIModelVendorEntity } from '@memberjunction/core-entities';

const logs = vi.hoisted(() => ({ LogStatus: vi.fn(), LogError: vi.fn() }));

// Neutralize the class-factory registration decorator (the stub base is not the generated class); leave the rest real.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogStatus: logs.LogStatus, LogError: logs.LogError };
});

// Declared INSIDE the factory because `vi.mock` is hoisted above every top-level declaration here.
vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-core-plus')>();
    /** The generated prompt run's fields the pricing pass reads and writes, as plain properties. */
    class StubPromptRun {
        public ID = 'prompt-run-1';
        public ModelID = 'model-gemini-live';
        public VendorID = 'vendor-vertex';
        public ParentID: string | null = null;
        public UsageTypeID: string | null = null;
        public TokensPrompt: number | null = 0;
        public TokensCompletion: number | null = 0;
        public TokensCacheRead: number | null = 0;
        public TokensCacheWrite: number | null = 0;
        public InputUnitsUsed: number | null = null;
        public OutputUnitsUsed: number | null = null;
        public ModelSpecificResponseDetails: string | null = null;
        public CostCurrency: string | null = null;
        public TotalCost: number | null = null;
        public ContextCurrentUser = undefined;
        private cost: number | null = null;
        private descendantCost: number | null = null;
        public get Cost(): number | null {
            return this.cost;
        }
        public set Cost(value: number | null) {
            this.cost = value;
        }
        public get DescendantCost(): number | null {
            return this.descendantCost;
        }
        public set DescendantCost(value: number | null) {
            this.descendantCost = value;
        }
    }
    return { ...actual, MJAIPromptRunEntityExtended: StubPromptRun };
});

import { AIEngineBase, PerMillionTokensPriceUnitType, ReadCostLines, TimePerMinutePriceUnitType } from '@memberjunction/ai-engine-base';
import { NormalizeUUID } from '@memberjunction/global';
import { MJAIPromptRunEntityServer } from '../custom/MJAIPromptRunEntityServer.server';

/** Runs the pricing pass the way `Save` does when `CompletedAt` is set. */
class PricedRun extends MJAIPromptRunEntityServer {
    public async Price(): Promise<void> {
        await this.CalculateAndSetCost();
    }
}

const COST_ROW = {
    ID: 'cost-row-openai',
    Currency: 'USD',
    InputPricePerUnit: 4,
    OutputPricePerUnit: 16,
    CacheReadPricePerUnit: null,
    CacheWritePricePerUnit: null,
} as unknown as MJAIModelCostEntity;

const AUDIO_INPUT: RealtimeUnitPrice = { Price: 32, Unit: 'Per 1M Tokens', Currency: 'USD' };
const AUDIO_OUTPUT: RealtimeUnitPrice = { Price: 64, Unit: 'Per 1M Tokens', Currency: 'USD' };
const AUDIO_PRICES: AIModelConfiguration = { Realtime: { Pricing: { AudioInput: AUDIO_INPUT, AudioOutput: AUDIO_OUTPUT } } };

/** 10,000 input tokens (8,000 audio) and 2,000 output tokens (1,500 audio). */
const CALL = { RealtimeUsage: { Input: { TextTokens: 2000, AudioTokens: 8000 }, Output: { TextTokens: 500, AudioTokens: 1500 } } };

const TEXT_LINE_COST = 2000 * 4e-6 + 500 * 16e-6; // 0.008 + 0.008
const AUDIO_INPUT_COST = 8000 * 32e-6; // 0.256
const AUDIO_OUTPUT_COST = 1500 * 64e-6; // 0.096
const TODAY_COST = 10000 * 4e-6 + 2000 * 16e-6; // 0.04 + 0.032

const MODEL_VENDOR_ROWS = [{ ID: 'mv-openai', VendorID: 'vendor-openai' }] as unknown as MJAIModelVendorEntity[];

/** The stub base takes no entity info, unlike the generated class the types describe. */
const PricedRunOverStub = PricedRun as unknown as new () => PricedRun;

function makeRun(details: object | null, tokens: { Prompt?: number; Completion?: number } = {}): PricedRun {
    const run = new PricedRunOverStub();
    run.ModelID = 'model-gpt-realtime';
    run.VendorID = 'vendor-openai';
    run.TokensPrompt = tokens.Prompt ?? 10000;
    run.TokensCompletion = tokens.Completion ?? 2000;
    run.ModelSpecificResponseDetails = details === null ? null : JSON.stringify(details);
    return run;
}

function loggedStatus(text: string): number {
    return logs.LogStatus.mock.calls.filter((call) => String(call[0]).includes(text)).length;
}

describe('MJAIPromptRunEntityServer pricing: the audio lines', () => {
    let configuration: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        const engine = AIEngineBase.Instance;
        vi.spyOn(engine, 'Config').mockResolvedValue(undefined as never);
        vi.spyOn(engine, 'GetActiveModelCost').mockReturnValue(COST_ROW);
        vi.spyOn(engine, 'GetPriceCalculator').mockReturnValue(new PerMillionTokensPriceUnitType());
        vi.spyOn(engine, 'ModelVendorsByModelID', 'get').mockReturnValue(new Map([[NormalizeUUID('model-gpt-realtime'), MODEL_VENDOR_ROWS]]));
        vi.spyOn(engine, 'IsInferenceProvider').mockReturnValue(true);
        configuration = vi.spyOn(engine, 'GetEffectiveModelConfiguration').mockReturnValue(AUDIO_PRICES);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        logs.LogStatus.mockClear();
        logs.LogError.mockClear();
    });

    describe('with audio prices', () => {
        it('prices each direction on its own line and takes the audio tokens out of the default buckets', async () => {
            const run = makeRun(CALL);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TEXT_LINE_COST + AUDIO_INPUT_COST + AUDIO_OUTPUT_COST, 10);
            expect(run.Cost).toBeCloseTo(0.368, 10);
            expect(run.TotalCost).toBe(run.Cost);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Tokens', Input: 2000, Output: 500, Cost: 0.016 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 8000, Output: 0, Cost: 0.256 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 1500, Cost: 0.096 },
            ]);
            expect(logs.LogStatus).not.toHaveBeenCalled();
            expect(configuration).toHaveBeenCalledWith('model-gpt-realtime', 'mv-openai');
        });

        it('adds up audio, text and avatar video lines on one run', async () => {
            configuration.mockReturnValue({
                Realtime: { Pricing: { AudioInput: AUDIO_INPUT, AudioOutput: AUDIO_OUTPUT, AvatarVideoOutput: { Price: 1, Unit: 'Per 1M Tokens', Currency: 'USD' } } },
            });
            const record = { RealtimeUsage: { Input: CALL.RealtimeUsage.Input, Output: { ...CALL.RealtimeUsage.Output, VideoTokens: 371520, VideoSeconds: 60 } } };
            const run = makeRun(record, { Completion: 2000 + 371520 });
            await run.Price();

            expect(run.Cost).toBeCloseTo(0.368 + 0.37152, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Tokens', Input: 2000, Output: 500, Cost: 0.016 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 8000, Output: 0, Cost: 0.256 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 1500, Cost: 0.096 },
                { Modality: 'Video', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 371520, Cost: 0.37152 },
            ]);
        });

        it('keeps cache reads and writes on the default line', async () => {
            const run = makeRun(CALL, { Prompt: 9000 });
            run.TokensCacheRead = 1000;
            await run.Price();

            expect(ReadCostLines(run.ModelSpecificResponseDetails)[0]).toMatchObject({ Input: 2000, Output: 500 });
            expect(run.Cost).toBeCloseTo(1000 * 4e-6 + 1000 * 4e-6 + 500 * 16e-6 + AUDIO_INPUT_COST + AUDIO_OUTPUT_COST, 10);
        });

        it('stops a bucket at 0 when the audio tokens exceed it, prices only the audio that left it, and logs that', async () => {
            const run = makeRun({ RealtimeUsage: { Input: { AudioTokens: 12000 }, Output: { AudioTokens: 1500 } } });
            await run.Price();

            // 10,000 input tokens recorded, so the audio input line prices 10,000, not the 12,000 the record claims.
            expect(run.Cost).toBeCloseTo(500 * 16e-6 + 10000 * 32e-6 + AUDIO_OUTPUT_COST, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Tokens', Input: 0, Output: 500, Cost: 0.008 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 10000, Output: 0, Cost: 0.32 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 1500, Cost: 0.096 },
            ]);
            expect(loggedStatus('audio tokens (12000 input, 1500 output) exceed')).toBe(1);
        });
    });

    describe('cached input', () => {
        /** The CALL with 7,000 of its 10,000 input tokens cache hits, 6,000 of them audio. */
        const CACHED_CALL = {
            RealtimeUsage: {
                Input: { TextTokens: 2000, AudioTokens: 8000, CachedTokens: 7000, CachedAudioTokens: 6000 },
                Output: { TextTokens: 500, AudioTokens: 1500 },
            },
        };
        /** The GPT Realtime 2.1 row's cache rate, $0.40 per 1M. */
        const CACHED_ROW = { ...COST_ROW, CacheReadPricePerUnit: 0.4 } as unknown as MJAIModelCostEntity;

        it("prices cached audio at the row's cache-read rate and only the uncached audio on the Audio line", async () => {
            vi.spyOn(AIEngineBase.Instance, 'GetActiveModelCost').mockReturnValue(CACHED_ROW);
            const run = makeRun(CACHED_CALL);
            await run.Price();

            // 1,000 uncached text in at $4, 7,000 cached at $0.40, 500 text out at $16, 2,000 uncached audio in at $32,
            // 1,500 audio out at $64.
            const expected = 1000 * 4e-6 + 7000 * 0.4e-6 + 500 * 16e-6 + 2000 * 32e-6 + AUDIO_OUTPUT_COST;
            expect(run.Cost).toBeCloseTo(expected, 10);
            expect(run.Cost).toBeCloseTo(0.1748, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Tokens', Input: 8000, Output: 500, Cost: 0.0148 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 2000, Output: 0, Cost: 0.064 },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 1500, Cost: 0.096 },
            ]);
            expect(logs.LogStatus).not.toHaveBeenCalled();
        });

        it('makes a cache hit cheaper than the same call uncached', async () => {
            vi.spyOn(AIEngineBase.Instance, 'GetActiveModelCost').mockReturnValue(CACHED_ROW);
            const cached = makeRun(CACHED_CALL);
            const uncached = makeRun(CALL);
            await cached.Price();
            await uncached.Price();

            expect(uncached.Cost).toBeCloseTo(0.368, 10);
            expect(cached.Cost ?? 0).toBeLessThan(uncached.Cost ?? 0);
        });

        it("falls back to the row's input rate for a row without a cache-read rate", async () => {
            const run = makeRun(CACHED_CALL);
            await run.Price();

            expect(run.Cost).toBeCloseTo(1000 * 4e-6 + 7000 * 4e-6 + 500 * 16e-6 + 2000 * 32e-6 + AUDIO_OUTPUT_COST, 10);
        });

        it('moves cache hits to the cache rate without audio prices too, and still blends the audio', async () => {
            vi.spyOn(AIEngineBase.Instance, 'GetActiveModelCost').mockReturnValue(CACHED_ROW);
            configuration.mockReturnValue(null);
            const run = makeRun(CACHED_CALL);
            await run.Price();

            expect(run.Cost).toBeCloseTo(3000 * 4e-6 + 7000 * 0.4e-6 + 2000 * 16e-6, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)[0]).toMatchObject({ Input: 10000, Output: 2000, Blended: true });
            expect(loggedStatus('2000 audio input tokens')).toBe(1);
        });

        it("trusts a run's own cache-read column and moves nothing more", async () => {
            vi.spyOn(AIEngineBase.Instance, 'GetActiveModelCost').mockReturnValue(CACHED_ROW);
            const run = makeRun(CACHED_CALL, { Prompt: 3000 });
            run.TokensCacheRead = 7000;
            await run.Price();

            expect(run.Cost).toBeCloseTo(1000 * 4e-6 + 7000 * 0.4e-6 + 500 * 16e-6 + 2000 * 32e-6 + AUDIO_OUTPUT_COST, 10);
        });
    });

    describe('without a usable audio price: the default line is blended', () => {
        it('keeps the run at the row rates, marks the default line, and logs once', async () => {
            configuration.mockReturnValue(null);
            const run = makeRun(CALL);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.072, Blended: true },
            ]);
            expect(logs.LogStatus).toHaveBeenCalledTimes(1);
            expect(loggedStatus('8000 audio input tokens (Realtime.Pricing.AudioInput: no usable price); 1500 audio output tokens')).toBe(1);
        });

        it('prices the direction that has a price and blends the other', async () => {
            configuration.mockReturnValue({ Realtime: { Pricing: { AudioInput: AUDIO_INPUT } } });
            const run = makeRun(CALL);
            await run.Price();

            expect(run.Cost).toBeCloseTo(2000 * 4e-6 + 2000 * 16e-6 + AUDIO_INPUT_COST, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Tokens', Input: 2000, Output: 2000, Cost: 0.04, Blended: true },
                { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 8000, Output: 0, Cost: 0.256 },
            ]);
            expect(loggedStatus('1500 audio output tokens (Realtime.Pricing.AudioOutput: no usable price)')).toBe(1);
            expect(loggedStatus('audio input tokens')).toBe(0);
        });

        it('does not apply a per-minute audio price, or one in another currency', async () => {
            configuration.mockReturnValue({
                Realtime: { Pricing: { AudioInput: { Price: 0.06, Unit: 'Per Minute', Currency: 'USD' }, AudioOutput: { ...AUDIO_OUTPUT, Currency: 'EUR' } } },
            });
            const run = makeRun(CALL);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)[0].Blended).toBe(true);
            expect(loggedStatus("a unit other than 'Per 1M Tokens'")).toBe(1);
            expect(loggedStatus("a currency other than the cost row's")).toBe(1);
        });
    });

    describe('runs the audio lines do not touch', () => {
        it('leaves a run without audio tokens unmarked and unlogged', async () => {
            configuration.mockReturnValue(null);
            const run = makeRun({ RealtimeUsage: { Input: { TextTokens: 10000 }, Output: { TextTokens: 2000 } } });
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.072 },
            ]);
            expect(logs.LogStatus).not.toHaveBeenCalled();
        });

        it('leaves a run without a usage record exactly as before: no cost lines', async () => {
            const run = makeRun(null);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(run.ModelSpecificResponseDetails).toBeNull();
            expect(configuration).not.toHaveBeenCalled();
        });

        it('prices a run measured in seconds by its seconds alone: no audio lines, not blended', async () => {
            vi.spyOn(AIEngineBase.Instance, 'UsageTypeName').mockReturnValue('Seconds');
            vi.spyOn(AIEngineBase.Instance, 'GetPriceCalculator').mockReturnValue(new TimePerMinutePriceUnitType());
            vi.spyOn(AIEngineBase.Instance, 'GetActiveModelCost').mockReturnValue({ ...COST_ROW, InputPricePerUnit: 0.06, OutputPricePerUnit: 0.24 } as unknown as MJAIModelCostEntity);
            const run = makeRun(CALL, { Prompt: 0, Completion: 0 });
            run.UsageTypeID = 'usage-type-seconds';
            run.InputUnitsUsed = 60;
            run.OutputUnitsUsed = 60;
            await run.Price();

            expect(run.Cost).toBeCloseTo(0.06 + 0.24, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-openai', Measure: 'Seconds', Input: 60, Output: 60, Cost: 0.3 },
            ]);
            expect(logs.LogStatus).not.toHaveBeenCalled();
        });
    });
});
