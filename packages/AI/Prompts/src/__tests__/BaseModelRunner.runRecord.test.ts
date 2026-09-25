import { describe, it, expect, vi } from 'vitest';
import type {
  MJAIPromptEntityExtended,
  MJAIModelEntityExtended,
  MJAIPromptRunEntityExtended,
  AIPromptParams,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseModelRunner } from '../BaseModelRunner';

class FakePromptRun {
  public ID = '';
  public PromptID?: string;
  public ModelID?: string;
  public AgentID?: string;
  public Status?: string;
  public Cancelled?: boolean;
  public CacheHit?: boolean;
  public WasSelectedResult?: boolean;
  public RunAt?: Date;
  public CompletedAt?: Date;
  public ExecutionTimeMS?: number;
  public FailoverAttempts?: number;
  public FailoverErrors?: unknown;
  public FailoverDurations?: unknown;
  public TotalFailoverDuration?: number;
  public ParentID?: string;
  public RerunFromPromptRunID?: string;
  public TokensPrompt?: number;
  public TokensCompletion?: number;
  public TokensUsed?: number;
  public TokensCacheRead?: number;
  public TokensCacheWrite?: number;
  public Cost?: number;
  public TotalCost?: number;
  public TokensPromptRollup?: number;
  public TokensCompletionRollup?: number;
  public TokensUsedRollup?: number;
  public TokensCacheReadRollup?: number;
  public TokensCacheWriteRollup?: number;
  public Success?: boolean;
  public Result?: string;
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveCount = 0;
  [k: string]: unknown;

  private static seq = 0;
  NewRecord(): boolean {
    this.ID = `fake-pr-${++FakePromptRun.seq}`;
    return true;
  }
  async Save(): Promise<boolean> {
    this.saveCount++;
    return true;
  }
}

class TestModelRunner extends BaseModelRunner {
  public loggedErrors: Array<{ error: Error | string; options?: Record<string, unknown> }> = [];

  public override get RequiredModelType(): string {
    return 'LLM';
  }

  public invokeCreateRunRecord(
    prompt: MJAIPromptEntityExtended,
    model: MJAIModelEntityExtended,
    params: AIPromptParams,
    startTime: Date,
    vendorId?: string,
    modelSelectionInfo?: unknown,
    applyRequestFields?: (promptRun: MJAIPromptRunEntityExtended) => void
  ): Promise<MJAIPromptRunEntityExtended> {
    return this.createRunRecord(
      prompt,
      model,
      params,
      startTime,
      vendorId,
      modelSelectionInfo,
      applyRequestFields
    );
  }

  public invokeFinalizeRunRecord(
    promptRun: MJAIPromptRunEntityExtended,
    endTime: Date,
    executionTimeMS: number,
    applyResultFields: (promptRun: MJAIPromptRunEntityExtended) => void
  ): Promise<void> {
    return this.finalizeRunRecord(promptRun, endTime, executionTimeMS, applyResultFields);
  }

  protected override logError(
    error: Error | string,
    options?: {
      category?: string;
      metadata?: Record<string, unknown>;
      prompt?: MJAIPromptEntityExtended;
      model?: MJAIModelEntityExtended;
      severity?: 'warning' | 'error' | 'critical';
      maxErrorLength?: number;
    }
  ): void {
    this.loggedErrors.push({ error, options });
    super.logError(error, options);
  }
}

describe('BaseModelRunner run record lifecycle', () => {
  const createMockPrompt = (overrides: Partial<MJAIPromptEntityExtended> = {}): MJAIPromptEntityExtended =>
    ({
      ID: 'prompt-123',
      Name: 'Test Prompt',
      ...overrides,
    } as unknown as MJAIPromptEntityExtended);

  const createMockModel = (overrides: Partial<MJAIModelEntityExtended> = {}): MJAIModelEntityExtended =>
    ({
      ID: 'model-456',
      Name: 'Test Model',
      ModelVendors: [],
      ...overrides,
    } as unknown as MJAIModelEntityExtended);

  const createFakeProvider = (): IMetadataProvider => {
    return {
      GetEntityObject: vi.fn(async () => new FakePromptRun() as unknown),
    } as unknown as IMetadataProvider;
  };

  it('createRunRecord initializes the generic fields', async () => {
    const runner = new TestModelRunner();
    const prompt = createMockPrompt({ ID: 'prompt-abc' });
    const model = createMockModel({ ID: 'model-xyz' });
    const startTime = new Date('2026-03-15T12:00:00.000Z');
    const fakeProvider = createFakeProvider();

    const params: AIPromptParams = {
      agentId: 'agent-789',
      parentPromptRunId: 'parent-run-111',
      rerunFromPromptRunID: 'rerun-run-222',
      provider: fakeProvider,
    };

    const run = await runner.invokeCreateRunRecord(prompt, model, params, startTime);

    expect(run.PromptID).toBe('prompt-abc');
    expect(run.ModelID).toBe('model-xyz');
    expect(run.AgentID).toBe('agent-789');
    expect(run.Status).toBe('Running');
    expect(run.Cancelled).toBe(false);
    expect(run.CacheHit).toBe(false);
    expect(run.WasSelectedResult).toBe(false);
    expect(run.RunAt).toEqual(startTime);
    expect(run.OriginalModelID).toBe('model-xyz');
    expect(run.OriginalRequestStartTime).toEqual(startTime);
    expect(run.FailoverAttempts).toBe(0);
    expect(run.FailoverErrors).toBeNull();
    expect(run.FailoverDurations).toBeNull();
    expect(run.TotalFailoverDuration).toBe(0);
    expect(run.ParentID).toBe('parent-run-111');
    expect(run.RerunFromPromptRunID).toBe('rerun-run-222');

    await runner.WaitForPendingPromptRunSaves();
  });

  it('createRunRecord invokes the applyRequestFields callback before enqueuing the save', async () => {
    const runner = new TestModelRunner();
    const prompt = createMockPrompt();
    const model = createMockModel();
    const startTime = new Date();
    const fakeProvider = createFakeProvider();

    let callbackRanBeforeInsert = false;
    const applyRequestFields = vi.fn((promptRun: MJAIPromptRunEntityExtended) => {
      const fake = promptRun as unknown as FakePromptRun;
      // Before save has occurred, saveCount should be 0
      callbackRanBeforeInsert = fake.saveCount === 0;
      fake['CustomRequestHeader'] = 'chat-specific-val';
    });

    const params: AIPromptParams = {
      provider: fakeProvider,
    };

    const run = await runner.invokeCreateRunRecord(
      prompt,
      model,
      params,
      startTime,
      undefined,
      undefined,
      applyRequestFields
    );

    expect(applyRequestFields).toHaveBeenCalledTimes(1);
    expect(applyRequestFields).toHaveBeenCalledWith(run);
    expect(callbackRanBeforeInsert).toBe(true);
    expect((run as unknown as FakePromptRun)['CustomRequestHeader']).toBe('chat-specific-val');

    await runner.WaitForPendingPromptRunSaves();
  });

  it('finalizeRunRecord updates CompletedAt, ExecutionTimeMS, invokes applyResultFields, and computes rollup fields', async () => {
    const runner = new TestModelRunner();
    const fakeRun = new FakePromptRun() as unknown as MJAIPromptRunEntityExtended;
    const endTime = new Date('2026-03-15T12:05:00.000Z');
    const executionTimeMS = 1500;

    const applyResultFields = vi.fn((promptRun: MJAIPromptRunEntityExtended) => {
      promptRun.Success = true;
      promptRun.Result = 'Generated test output';
      promptRun.TokensPrompt = 250;
      promptRun.TokensCompletion = 75;
      promptRun.TokensUsed = 325;
      promptRun.TokensCacheRead = 40;
      promptRun.TokensCacheWrite = 10;
      promptRun.Cost = 0.0015;
    });

    await runner.invokeFinalizeRunRecord(fakeRun, endTime, executionTimeMS, applyResultFields);
    await runner.WaitForPendingPromptRunSaves();

    expect(applyResultFields).toHaveBeenCalledTimes(1);
    expect(fakeRun.CompletedAt).toEqual(endTime);
    expect(fakeRun.ExecutionTimeMS).toBe(1500);
    expect(fakeRun.Success).toBe(true);
    expect(fakeRun.Result).toBe('Generated test output');
    expect(fakeRun.TokensPromptRollup).toBe(250);
    expect(fakeRun.TokensCompletionRollup).toBe(75);
    expect(fakeRun.TokensUsedRollup).toBe(325);
    expect(fakeRun.TokensCacheReadRollup).toBe(40);
    expect(fakeRun.TokensCacheWriteRollup).toBe(10);
    expect(fakeRun.TotalCost).toBe(0.0015);
  });

  it('finalizeRunRecord handles errors inside the update callback by logging to logError with category PromptRunUpdate without throwing', async () => {
    const runner = new TestModelRunner();
    const fakeRun = new FakePromptRun();
    fakeRun.ID = 'failed-run-999';
    const fakeRunEntity = fakeRun as unknown as MJAIPromptRunEntityExtended;
    const endTime = new Date();
    const executionTimeMS = 800;

    const errorToThrow = new Error('Database serialization boom');
    const applyResultFields = vi.fn(() => {
      throw errorToThrow;
    });

    // finalizeRunRecord should NOT throw even if applyResultFields throws
    await expect(
      runner.invokeFinalizeRunRecord(fakeRunEntity, endTime, executionTimeMS, applyResultFields)
    ).resolves.not.toThrow();

    await runner.WaitForPendingPromptRunSaves();

    expect(applyResultFields).toHaveBeenCalledTimes(1);
    const logged = runner.loggedErrors.find(
      (entry) => entry.options?.category === 'PromptRunUpdate'
    );
    expect(logged).toBeDefined();
    expect(logged?.error).toBe(errorToThrow);
    expect(logged?.options?.metadata?.promptRunId).toBe('failed-run-999');
  });
});
