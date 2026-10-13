import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelUsage } from '@memberjunction/ai';
import { BaseModelRunner, PromptRunUsageFields } from '../BaseModelRunner';

const h = vi.hoisted(() => ({
  usageTypes: [] as Array<{ ID: string; Name: string }>,
  logStatus: vi.fn(),
}));

vi.mock('@memberjunction/ai-engine-base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/ai-engine-base')>();
  return { ...actual, AIEngineBase: { Instance: { get UsageTypes() { return h.usageTypes; } } } };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogStatus: h.logStatus };
});

/** Exposes the protected usage helpers. */
class UsageTestRunner extends BaseModelRunner {
  public override get RequiredModelType(): string {
    return 'Speech to Text';
  }

  protected override get DefaultLogCategory(): string {
    return 'UsageTestRunner';
  }

  public Resolve(reported: ModelUsage | undefined, counted: ModelUsage | undefined): ModelUsage | undefined {
    return this.ResolveUsageToRecord(reported, counted);
  }

  public Apply(run: PromptRunUsageFields, usage: ModelUsage | undefined): void {
    this.ApplyUsageToRunRecord(run, usage);
  }
}

const SECONDS_ID = 'A6D3D2F1-8D22-4E5B-9E2B-1C2E4C4B0001';
const CHARACTERS_ID = 'A6D3D2F1-8D22-4E5B-9E2B-1C2E4C4B0002';

function emptyRun(): PromptRunUsageFields {
  return {
    ID: 'run-1',
    TokensPrompt: null,
    TokensCompletion: null,
    TokensUsed: null,
    UsageTypeID: null,
    InputUnitsUsed: null,
    OutputUnitsUsed: null,
    Cost: null,
    CostCurrency: null,
  };
}

describe('BaseModelRunner usage recording', () => {
  let runner: UsageTestRunner;

  beforeEach(() => {
    h.usageTypes = [{ ID: SECONDS_ID, Name: 'Seconds' }, { ID: CHARACTERS_ID, Name: 'Characters' }];
    h.logStatus.mockClear();
    runner = new UsageTestRunner();
  });

  describe('ResolveUsageToRecord', () => {
    it("keeps the driver's usage when it reports a quantity", () => {
      const reported = ModelUsage.ForMedia('Seconds', 90);

      expect(runner.Resolve(reported, ModelUsage.ForMedia('Characters', 12))).toBe(reported);
    });

    it("falls back to the runner's count, carrying the driver's cost", () => {
      const reported = new ModelUsage(0, 0, 0.25, 'USD');
      const counted = ModelUsage.ForMedia('Characters', 12);

      const resolved = runner.Resolve(reported, counted);

      expect(resolved).toBe(counted);
      expect(resolved?.cost).toBe(0.25);
      expect(resolved?.costCurrency).toBe('USD');
    });

    it('with neither a quantity nor a count, invents nothing', () => {
      expect(runner.Resolve(undefined, undefined)).toBeUndefined();
    });
  });

  describe('ApplyUsageToRunRecord', () => {
    it('records units with the usage type that names their measure, and no cost of its own', () => {
      const run = emptyRun();

      runner.Apply(run, ModelUsage.ForMedia('Characters', 42));

      expect(run.UsageTypeID).toBe(CHARACTERS_ID);
      expect(run.InputUnitsUsed).toBe(42);
      expect(run.OutputUnitsUsed).toBe(0);
      expect(run.TokensUsed).toBeNull();
      expect(run.Cost).toBeNull();
    });

    it('records tokens in the token columns and never as units', () => {
      const run = emptyRun();

      runner.Apply(run, new ModelUsage(10, 5));

      expect(run.TokensPrompt).toBe(10);
      expect(run.TokensCompletion).toBe(5);
      expect(run.TokensUsed).toBe(15);
      expect(run.UsageTypeID).toBeNull();
    });

    it("records the driver's cost when it gave one", () => {
      const run = emptyRun();
      const usage = ModelUsage.ForMedia('Seconds', 30);
      usage.cost = 0.003;
      usage.costCurrency = 'USD';

      runner.Apply(run, usage);

      expect(run.Cost).toBe(0.003);
      expect(run.CostCurrency).toBe('USD');
    });

    it('skips units whose usage type is not loaded, naming the runner in the log line', () => {
      h.usageTypes = [];
      const run = emptyRun();

      runner.Apply(run, ModelUsage.ForMedia('Seconds', 30));

      expect(run.UsageTypeID).toBeNull();
      expect(run.InputUnitsUsed).toBeNull();
      expect(h.logStatus).toHaveBeenCalledWith("UsageTestRunner: usage type 'Seconds' is not loaded; units not recorded on run run-1");
    });

    it('with no usage, records nothing', () => {
      const run = emptyRun();

      runner.Apply(run, undefined);

      expect(run).toEqual(emptyRun());
    });
  });
});
