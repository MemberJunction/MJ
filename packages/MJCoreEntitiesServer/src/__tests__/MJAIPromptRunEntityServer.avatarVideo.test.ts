/**
 * Unit tests for the avatar video line in prompt-run pricing (`MJAIPromptRunEntityServer.CalculateAndSetCost`).
 *
 * A realtime run that stored a usage record is priced at its default cost row plus, when the model vendor's resolved
 * configuration has an avatar video price, a video line: the video seconds at a per-minute price, or the video tokens
 * at a per-1M-token price. The video's output tokens then leave the default row's output bucket and the cost lines are
 * written into the run's details. Without a price the run prices exactly as before; without a default row it stays
 * unpriced.
 *
 * The generated base (`MJAIPromptRunEntityExtended`) is replaced by a plain stub, as the package's other entity
 * tests do, and the engine's catalog lookups are stubbed on the real singleton; the pricing math is the real code.
 * Numbers: one speaking minute of Gemini 3.8 Live on Vertex AI at $0.75 / $4.50 per 1M tokens, with Google counting
 * 371,520 avatar video tokens in the response total, and the avatar's video at $0.37152 per minute or $1.00 per 1M
 * video tokens.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AIModelConfiguration } from '@memberjunction/ai';
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
    ID: 'cost-row-vertex',
    Currency: 'USD',
    InputPricePerUnit: 0.75,
    OutputPricePerUnit: 4.5,
    CacheReadPricePerUnit: null,
    CacheWritePricePerUnit: null,
} as unknown as MJAIModelCostEntity;

const VIDEO_PRICE: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: { Price: 0.37152, Unit: 'Per Minute', Currency: 'USD' } } } };
/** Google's list price for avatar video output tokens. */
const TOKEN_PRICE: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: { Price: 1, Unit: 'Per 1M Tokens', Currency: 'USD' } } } };

/** One speaking minute: 371,520 of the 373,520 output tokens are the avatar's video. */
const ONE_MINUTE_RECORD = {
    RealtimeUsage: {
        Input: { TextTokens: 7900, AudioTokens: 2100 },
        Output: { AudioTokens: 2000, VideoTokens: 371520, VideoSeconds: 60 },
    },
};

const TODAY_COST = 10000 * 0.75e-6 + 373520 * 4.5e-6; // 0.0075 + 1.68084
const DEFAULT_LINE_COST = 10000 * 0.75e-6 + 2000 * 4.5e-6; // 0.0075 + 0.009

const MODEL_VENDOR_ROWS = [
    { ID: 'mv-google', VendorID: 'vendor-google' },
    { ID: 'mv-vertex-developer', VendorID: 'vendor-vertex' },
    { ID: 'mv-vertex', VendorID: 'vendor-vertex' },
] as unknown as MJAIModelVendorEntity[];

/** The stub base takes no entity info, unlike the generated class the types describe. */
const PricedRunOverStub = PricedRun as unknown as new () => PricedRun;

function makeRun(details: object | string | null, tokens: { Prompt?: number; Completion?: number } = {}): PricedRun {
    const run = new PricedRunOverStub();
    run.TokensPrompt = tokens.Prompt ?? 10000;
    run.TokensCompletion = tokens.Completion ?? 373520;
    run.ModelSpecificResponseDetails = typeof details === 'string' ? details : details === null ? null : JSON.stringify(details);
    return run;
}

function loggedStatus(text: string): number {
    return logs.LogStatus.mock.calls.filter((call) => String(call[0]).includes(text)).length;
}

describe('MJAIPromptRunEntityServer pricing: the avatar video line', () => {
    let configuration: ReturnType<typeof vi.spyOn>;
    let costRow: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        const engine = AIEngineBase.Instance;
        vi.spyOn(engine, 'Config').mockResolvedValue(undefined as never);
        costRow = vi.spyOn(engine, 'GetActiveModelCost').mockReturnValue(COST_ROW);
        vi.spyOn(engine, 'GetPriceCalculator').mockReturnValue(new PerMillionTokensPriceUnitType());
        vi.spyOn(engine, 'ModelVendorsByModelID', 'get').mockReturnValue(new Map([[NormalizeUUID('model-gemini-live'), MODEL_VENDOR_ROWS]]));
        vi.spyOn(engine, 'IsInferenceProvider').mockImplementation((row) => row.ID !== 'mv-vertex-developer');
        configuration = vi.spyOn(engine, 'GetEffectiveModelConfiguration').mockReturnValue(VIDEO_PRICE);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        logs.LogStatus.mockClear();
        logs.LogError.mockClear();
    });

    describe('with an avatar video price', () => {
        it('adds the video line to the cost and takes the video tokens out of the output bucket', async () => {
            const run = makeRun(ONE_MINUTE_RECORD);
            await run.Price();

            expect(run.Cost).toBeCloseTo(DEFAULT_LINE_COST + 0.37152, 10);
            expect(run.Cost).toBeCloseTo(0.38802, 10);
            expect(run.TotalCost).toBe(run.Cost);
            expect(run.CostCurrency).toBe('USD');
        });

        it('writes the cost lines beside the usage record, which it keeps', async () => {
            const run = makeRun({ ...ONE_MINUTE_RECORD, Provider: 'kept' });
            await run.Price();

            const details = JSON.parse(run.ModelSpecificResponseDetails ?? '{}') as Record<string, unknown>;
            expect(details['RealtimeUsage']).toEqual(ONE_MINUTE_RECORD.RealtimeUsage);
            expect(details['Provider']).toBe('kept');
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-vertex', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.0165 },
                { Modality: 'Video', CostRowID: null, Measure: 'Seconds', Input: 0, Output: 60, Cost: 0.37152 },
            ]);
        });

        it("reads the price from the run's vendor's inference-provider row of the model", async () => {
            await makeRun(ONE_MINUTE_RECORD).Price();
            expect(configuration).toHaveBeenCalledWith('model-gemini-live', 'mv-vertex');
        });

        it('stops the output bucket at 0 when the video tokens exceed it, and logs that', async () => {
            const run = makeRun({ RealtimeUsage: { Output: { VideoTokens: 400000, VideoSeconds: 60 } } });
            await run.Price();

            expect(run.Cost).toBeCloseTo(10000 * 0.75e-6 + 0.37152, 10);
            expect(loggedStatus('video tokens exceed')).toBe(1);
        });

        it('prices the video seconds when Google reports no video tokens, leaving the output bucket whole', async () => {
            const run = makeRun({ RealtimeUsage: { Output: { AudioTokens: 2000, VideoSeconds: 30 } } }, { Completion: 2000 });
            await run.Price();

            expect(run.Cost).toBeCloseTo(DEFAULT_LINE_COST + 0.18576, 10);
        });

        it('takes no video tokens from a run priced in seconds, whose default line holds none', async () => {
            vi.spyOn(AIEngineBase.Instance, 'UsageTypeName').mockReturnValue('Seconds');
            vi.spyOn(AIEngineBase.Instance, 'GetPriceCalculator').mockReturnValue(new TimePerMinutePriceUnitType());
            costRow.mockReturnValue({ ...COST_ROW, InputPricePerUnit: 0.005, OutputPricePerUnit: 0.018 } as unknown as MJAIModelCostEntity);
            const run = makeRun(ONE_MINUTE_RECORD, { Prompt: 0, Completion: 0 });
            run.UsageTypeID = 'usage-type-seconds';
            run.InputUnitsUsed = 60;
            run.OutputUnitsUsed = 60;
            await run.Price();

            expect(run.Cost).toBeCloseTo(0.005 + 0.018 + 0.37152, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)[0]).toMatchObject({ Measure: 'Seconds', Input: 60, Output: 60 });
        });

        it('prices a child run the same way; its parent rolls the cost up', async () => {
            const run = makeRun(ONE_MINUTE_RECORD);
            run.ParentID = 'parent-run';
            await run.Price();

            expect(run.Cost).toBeCloseTo(0.38802, 10);
        });
    });

    describe('with a per-token avatar video price', () => {
        beforeEach(() => {
            configuration.mockReturnValue(TOKEN_PRICE);
        });

        it('prices the video tokens on the video line and takes them out of the output bucket', async () => {
            const run = makeRun(ONE_MINUTE_RECORD);
            await run.Price();

            expect(run.Cost).toBeCloseTo(DEFAULT_LINE_COST + 0.37152, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-vertex', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.0165 },
                { Modality: 'Video', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 371520, Cost: 0.37152 },
            ]);
        });

        it("prices the 10-minute call's 460,530 VIDEO tokens, not its 617.79 streamed seconds (#5312)", async () => {
            const run = makeRun({ RealtimeUsage: { Output: { AudioTokens: 2000, VideoTokens: 460530, VideoSeconds: 617.79 } } }, { Completion: 462530 });
            await run.Price();

            expect(run.Cost).toBeCloseTo(DEFAULT_LINE_COST + 0.46053, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)[1]).toEqual({ Modality: 'Video', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 460530, Cost: 0.46053 });
        });

        it('prices as before, with one log line, when the run stored video seconds but no video tokens', async () => {
            const run = makeRun({ RealtimeUsage: { Output: { AudioTokens: 2000, VideoSeconds: 30 } } }, { Completion: 2000 });
            await run.Price();

            expect(run.Cost).toBeCloseTo(DEFAULT_LINE_COST, 10);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-vertex', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.0165 },
            ]);
            expect(loggedStatus('no video tokens to price')).toBe(1);
        });
    });

    describe('without a usable price: priced as before', () => {
        it('prices every output token at the output rate when the configuration has no price, and writes the default line', async () => {
            configuration.mockReturnValue(null);
            const run = makeRun(ONE_MINUTE_RECORD);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(run.TotalCost).toBe(run.Cost);
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([
                { Modality: null, CostRowID: 'cost-row-vertex', Measure: 'Tokens', Input: 10000, Output: 373520, Cost: 1.68834 },
            ]);
            expect(loggedStatus('no usable Realtime.Pricing.AvatarVideoOutput price')).toBe(1);
        });

        it("prices as before, with one log line, when the price's unit is neither per minute nor per 1M tokens", async () => {
            configuration.mockReturnValue({ Realtime: { Pricing: { AvatarVideoOutput: { Price: 22, Unit: 'Per Hour', Currency: 'USD' } } } } as unknown as AIModelConfiguration);
            const run = makeRun(ONE_MINUTE_RECORD);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(loggedStatus("neither 'Per Minute' nor 'Per 1M Tokens'")).toBe(1);
        });

        it("prices as before, with one log line, when the price is in another currency than the cost row's", async () => {
            configuration.mockReturnValue({ Realtime: { Pricing: { AvatarVideoOutput: { Price: 0.35, Unit: 'Per Minute', Currency: 'EUR' } } } });
            const run = makeRun(ONE_MINUTE_RECORD);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(loggedStatus("not in the cost row's currency")).toBe(1);
        });

        it('logs nothing for a realtime run without avatar video', async () => {
            const run = makeRun({ RealtimeUsage: { Output: { AudioTokens: 2000 } } }, { Completion: 2000 });
            await run.Price();

            expect(run.Cost).toBeCloseTo(DEFAULT_LINE_COST, 10);
            expect(logs.LogStatus).not.toHaveBeenCalled();
        });
    });

    describe('runs the video line does not touch', () => {
        it('leaves a run without a usage record exactly as before: no cost lines', async () => {
            const run = makeRun(null);
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(run.ModelSpecificResponseDetails).toBeNull();
            expect(configuration).not.toHaveBeenCalled();
        });

        it('prices malformed details at the default row alone and leaves them untouched', async () => {
            const run = makeRun('{not json');
            await run.Price();

            expect(run.Cost).toBeCloseTo(TODAY_COST, 10);
            expect(run.ModelSpecificResponseDetails).toBe('{not json');
        });

        it('leaves the run unpriced, video or not, without a default cost row', async () => {
            costRow.mockReturnValue(null);
            const run = makeRun(ONE_MINUTE_RECORD);
            await run.Price();

            expect(run.Cost).toBeNull();
            expect(run.TotalCost).toBeNull();
            expect(ReadCostLines(run.ModelSpecificResponseDetails)).toEqual([]);
        });
    });
});
