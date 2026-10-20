/**
 * Tests for BaseAgent's fire-and-forget step persistence — the instance-keyed save chain that
 * keeps the agent loop unblocked while guaranteeing a step's INSERT lands before its UPDATE.
 *
 * Exercises the REAL queueStepSave / createStepEntity / finalizeStepEntity methods on a real
 * BaseAgent instance, with the metadata-provider boundary (GetEntityObject) and the agent-run
 * stubbed. This locks in the ordering + non-fatal-failure contract that had no coverage before.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import { PriorTurnToolResultCache } from '../prior-turn-tool-result-cache';

/** The fire-and-forget save queue's Flush result shape. */
type FlushResult = { failures: number; rejections: number };

/** Minimal stand-in for MJAIAgentRunStepEntityExtended. Records Save() ordering into a shared log. */
class MockStep {
  public ID = ''; // assigned client-side by NewRecord() (mirrors NewSequentialID() client PK)
  public AgentRunID = '';
  public StepNumber = 0;
  public StepType = '';
  public StepName = '';
  public TargetID: string | null = null;
  public TargetLogID: string | null = null;
  public ParentID: string | null = null;
  public Status = '';
  public StartedAt: Date = new Date(0);
  public CompletedAt: Date | null = null;
  public Success: boolean | null = null;
  public ErrorMessage: string | null = null;
  public InputData: string | null = null;
  public OutputData: string | null = null;
  public PayloadAtStart: string | null = null;
  public PayloadAtEnd: string | null = null;
  public FinalPayloadValidationResult: string | null = null;
  public FinalPayloadValidationMessages: string | null = null;
  public PromptRun: unknown = null;
  public LatestResult: { CompleteMessage: string } | null = null;

  public saveOptions: Array<{ IgnoreDirtyState?: boolean } | undefined> = []; // options seen per Save() call

  private callIndex = 0;
  constructor(
    private name: string,
    private log: string[],
    private failOn: Set<number> = new Set(),
  ) {}

  NewRecord(): void {
    this.ID = `${this.name}-id`; // client-generated PK available immediately, before the INSERT lands
  }

  async Save(options?: { IgnoreDirtyState?: boolean }): Promise<boolean> {
    const n = ++this.callIndex;
    this.saveOptions.push(options);
    this.log.push(`${this.name}:start:${n}`);
    await new Promise((r) => setTimeout(r, 5)); // yield so a racing save would interleave if unchained
    this.log.push(`${this.name}:end:${n}`);
    if (this.failOn.has(n)) {
      this.LatestResult = { CompleteMessage: 'simulated save failure' };
      return false;
    }
    if (!this.ID) this.ID = `${this.name}-id`; // INSERT assigns the PK
    return true;
  }
}

/** Wires a real BaseAgent with a stubbed provider that hands out the given step entities in order. */
function makeAgent(steps: MockStep[]): { agent: BaseAgent; pending: () => Promise<FlushResult> } {
  const agent = new BaseAgent();
  const a = agent as unknown as {
    _activeProvider: { GetEntityObject: () => Promise<MockStep> };
    _agentRun: { ID: string; Steps: MockStep[] };
    _stepSaveQueue: { Flush(): Promise<FlushResult> };
    queueStepSave(s: MockStep): void;
    createStepEntity(p: Record<string, unknown>): Promise<MockStep>;
    finalizeStepEntity(s: MockStep, success: boolean, err?: string, out?: unknown): Promise<void>;
  };
  let i = 0;
  a._activeProvider = { GetEntityObject: async () => steps[i++] };
  a._agentRun = { ID: 'run-1', Steps: [] };
  // Flushing the shared queue awaits every fire-and-forget INSERT/UPDATE (what the old _pendingSaves drain did).
  return { agent, pending: () => a._stepSaveQueue.Flush() };
}

function internals(agent: BaseAgent) {
  return agent as unknown as {
    queueStepSave(s: MockStep): void;
    createStepEntity(p: Record<string, unknown>): Promise<MockStep>;
    finalizeStepEntity(s: MockStep, success: boolean, err?: string, out?: unknown): Promise<void>;
    _agentRun: { Steps: MockStep[] };
  };
}

describe('BaseAgent.queueStepSave — fire-and-forget ordering', () => {
  it('chains saves for the SAME step instance: INSERT fully completes before UPDATE starts', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([]);
    internals(agent).queueStepSave(step); // INSERT
    internals(agent).queueStepSave(step); // UPDATE (must wait for INSERT)
    await pending();
    expect(log).toEqual(['s:start:1', 's:end:1', 's:start:2', 's:end:2']);
  });

  it('runs saves for DIFFERENT step instances concurrently', async () => {
    const log: string[] = [];
    const a = new MockStep('a', log);
    const b = new MockStep('b', log);
    const { agent, pending } = makeAgent([]);
    internals(agent).queueStepSave(a);
    internals(agent).queueStepSave(b);
    await pending();
    // Both INSERTs start before either finishes => concurrent, not serialized.
    expect(log.slice(0, 2).every((e) => e.endsWith(':start:1'))).toBe(true);
  });

  it('a failed save is non-fatal: the flush still settles and the next chained save still runs', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log, new Set([1])); // INSERT fails
    const { agent, pending } = makeAgent([]);
    internals(agent).queueStepSave(step); // fails
    internals(agent).queueStepSave(step); // still runs after
    const result = await pending();
    expect(result.failures).toBe(1); // the failed save is reported, not thrown
    expect(log).toEqual(['s:start:1', 's:end:1', 's:start:2', 's:end:2']);
  });
});

describe('BaseAgent.createStepEntity / finalizeStepEntity — lifecycle', () => {
  const ctx = { ID: 'u1', Name: 'Tester' } as never;

  it('createStepEntity stamps the run linkage, step number, Running status, and queues the INSERT', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    const created = await internals(agent).createStepEntity({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', contextUser: ctx });
    expect(created).toBe(step);
    expect(step.AgentRunID).toBe('run-1');
    expect(step.StepNumber).toBe(1);
    expect(step.StepType).toBe('Prompt');
    expect(step.Status).toBe('Running');
    expect(internals(agent)._agentRun.Steps).toContain(step); // tracked on the run
    await pending();
    expect(log).toContain('s:start:1'); // INSERT was queued, not skipped
  });

  it('finalizeStepEntity flips the step to Completed/Success and the UPDATE chains after the INSERT', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    const created = await internals(agent).createStepEntity({ stepType: 'Actions', stepName: 'Run Action', contextUser: ctx });
    await internals(agent).finalizeStepEntity(created, true, undefined, { result: 'ok' });
    await pending();
    expect(step.Status).toBe('Completed');
    expect(step.Success).toBe(true);
    expect(step.CompletedAt).not.toBeNull();
    expect(step.OutputData).toContain('ok');
    expect(log).toEqual(['s:start:1', 's:end:1', 's:start:2', 's:end:2']); // INSERT before UPDATE
  });

  it('finalizeStepEntity with success=false records the failure status + error message', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    const created = await internals(agent).createStepEntity({ stepType: 'Validation', stepName: 'Agent Validation', contextUser: ctx });
    await internals(agent).finalizeStepEntity(created, false, 'boom');
    await pending();
    expect(step.Status).toBe('Failed');
    expect(step.Success).toBe(false);
    expect(step.ErrorMessage).toBe('boom');
  });

  it('assigns incrementing StepNumbers as steps are created on the same run', async () => {
    const log: string[] = [];
    const s1 = new MockStep('s1', log);
    const s2 = new MockStep('s2', log);
    const { agent } = makeAgent([s1, s2]);
    const a = await internals(agent).createStepEntity({ stepType: 'Prompt', stepName: 'Step 1', contextUser: ctx });
    const b = await internals(agent).createStepEntity({ stepType: 'Prompt', stepName: 'Step 2', contextUser: ctx });
    expect(a.StepNumber).toBe(1);
    expect(b.StepNumber).toBe(2);
  });

  it('nests under a parent step, links a valid target, and wraps InputData with the hierarchy/depth context', async () => {
    const step = new MockStep('s', []);
    const { agent, pending } = makeAgent([step]);
    // agents-specific glue read by createStepEntity when building InputData
    (agent as unknown as { _agentHierarchy: string[]; _depth: number })._agentHierarchy = ['Root', 'Child'];
    (agent as unknown as { _agentHierarchy: string[]; _depth: number })._depth = 1;

    const created = await internals(agent).createStepEntity({
      stepType: 'Prompt',
      stepName: 'Child Prompt',
      contextUser: ctx,
      parentId: 'parent-step-1',
      targetId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      inputData: { foo: 'bar' },
    });

    expect(created.ParentID).toBe('parent-step-1'); // child step nests under the parent
    expect(created.TargetID).toBe('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
    const input = JSON.parse(created.InputData as string);
    expect(input.foo).toBe('bar');
    expect(input.context).toEqual({ agentHierarchy: ['Root', 'Child'], depth: 1, stepNumber: 1 });
    await pending();
  });

  it('ignores a non-UUID targetId (leaves TargetID null rather than stamping garbage)', async () => {
    const step = new MockStep('s', []);
    const { agent } = makeAgent([step]);
    const created = await internals(agent).createStepEntity({
      stepType: 'Prompt',
      stepName: 'x',
      contextUser: ctx,
      targetId: 'not-a-uuid',
    });
    expect(created.TargetID).toBeNull();
  });

  // A Flow agent's 327-character failure reason became the step name, the
  // column is 255, and both the INSERT and the UPDATE were rejected — the step never reached the run.
  it('trims a StepName longer than the column so the row stays saveable, keeping the start of the message', async () => {
    const log: string[] = [];
    const s = new MockStep('s', log);
    const { agent, pending } = makeAgent([s]);
    const reason = `Agent failed. Agent type 'Flow' terminated execution: ${'x'.repeat(400)}`;
    const step = await internals(agent).createStepEntity({ stepType: 'Validation', stepName: reason, contextUser: ctx });
    await pending();
    expect(step.StepName.length).toBe(255);
    expect(step.StepName.startsWith("Agent failed. Agent type 'Flow' terminated execution:")).toBe(true);
    expect(step.StepName.endsWith('…')).toBe(true);
    expect(step.Status).toBe('Running'); // still a normal, saved step
  });

  it('leaves a StepName that fits the column untouched', async () => {
    const log: string[] = [];
    const s = new MockStep('s', log);
    const { agent, pending } = makeAgent([s]);
    const step = await internals(agent).createStepEntity({ stepType: 'Validation', stepName: 'Agent Validation', contextUser: ctx });
    await pending();
    expect(step.StepName).toBe('Agent Validation');
  });

  it('completed option: the single INSERT carries the terminal state — no UPDATE is queued', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    await internals(agent).createStepEntity({
      stepType: 'Compaction',
      stepName: 'Cross-Turn Conversation Compaction (post-turn)',
      contextUser: ctx,
      completed: { success: true, outputData: { fired: true, tokensBefore: 3000, tokensAfter: 1200 } },
    });
    await pending();
    // Exactly ONE Save — the INSERT. finalizeStepEntity's chained UPDATE never happens.
    expect(step.saveOptions).toHaveLength(1);
    expect(step.Status).toBe('Completed');
    expect(step.Success).toBe(true);
    expect(step.CompletedAt).not.toBeNull();
    const output = JSON.parse(step.OutputData as string);
    expect(output.fired).toBe(true);
    expect(output.tokensBefore).toBe(3000);
    expect(output.context.success).toBe(true); // standard finalize envelope, same as two-phase steps
  });

  it('completed option with success=false: the single INSERT records Failed + the error message', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    await internals(agent).createStepEntity({
      stepType: 'Compaction',
      stepName: 'Cross-Turn Conversation Compaction (pre-turn)',
      contextUser: ctx,
      completed: { success: false, errorMessage: 'summary model unavailable' },
    });
    await pending();
    expect(step.saveOptions).toHaveLength(1);
    expect(step.Status).toBe('Failed');
    expect(step.Success).toBe(false);
    expect(step.ErrorMessage).toBe('summary model unavailable');
  });

  it('force-persists the finalize UPDATE (IgnoreDirtyState) so a fast create→finalize never stays Running', async () => {
    // Regression for the "step stuck at Running" bug: NewRecord() gives the entity a client PK, so the
    // INSERT and the finalize UPDATE mutate the SAME instance. Without IgnoreDirtyState the INSERT's
    // post-save dirty-reset would absorb the finalize mutations and the UPDATE would silently no-op.
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    const created = await internals(agent).createStepEntity({ stepType: 'Actions', stepName: 'Run Action', contextUser: ctx });
    await internals(agent).finalizeStepEntity(created, true, undefined, { result: 'ok' });
    await pending();
    // Two Save() calls: INSERT plain (no options), UPDATE forced (IgnoreDirtyState=true).
    expect(step.saveOptions).toHaveLength(2);
    expect(step.saveOptions[0]?.IgnoreDirtyState).toBeUndefined();
    expect(step.saveOptions[1]?.IgnoreDirtyState).toBe(true);
    expect(step.Status).toBe('Completed');
  });
});

/** Permissive AIAgentRun stand-in — accepts arbitrary field assignment + a Save(). */
class FakeAgentRun {
  public ID = 'run-1';
  public Steps: unknown[] = [];
  public ErrorMessage: string | null = null;
  public Status = '';
  public Success: boolean | null = null;
  public saved = false;
  [k: string]: unknown;
  async Save(): Promise<boolean> {
    this.saved = true;
    return true;
  }
}

/**
 * Wires a real BaseAgent for finalizeAgentRun with a STUB save queue whose Flush reports the given result.
 * (The queue's own drain/allSettle mechanics are unit-tested in `@memberjunction/ai-core-plus`; here we only
 * verify finalize delegates the flush and reacts to the failure count.)
 */
function makeFinalizeAgent(flushResult: FlushResult): { agent: BaseAgent; run: FakeAgentRun; flush: ReturnType<typeof vi.fn> } {
  const agent = new BaseAgent();
  const run = new FakeAgentRun();
  const flush = vi.fn(async () => flushResult);
  const a = agent as unknown as Record<string, unknown>;
  a._agentRun = run;
  a._stepSaveQueue = { Flush: flush };
  a._depth = 0;
  a._injectedMemory = { notes: [], examples: [] };
  a._mediaOutputs = [];
  a._fileOutputs = [];
  return { agent, run, flush };
}

function finalize(agent: BaseAgent, finalStep: Record<string, unknown>) {
  return (agent as unknown as { finalizeAgentRun(s: unknown, p?: unknown, u?: unknown): Promise<{ success: boolean }> }).finalizeAgentRun(
    finalStep,
    undefined,
    { ID: 'u1' },
  );
}

describe('BaseAgent.finalizeAgentRun — pending-save drain + run status', () => {
  it("flushes the step-save queue and marks a successful run 'Completed'", async () => {
    const { agent, run, flush } = makeFinalizeAgent({ failures: 0, rejections: 0 });
    const result = await finalize(agent, { step: 'Success', message: 'done' });
    expect(result.success).toBe(true);
    expect(run.Status).toBe('Completed');
    expect(run.saved).toBe(true);
    expect(flush).toHaveBeenCalledOnce(); // delegates the drain to the queue
  });

  it('records a diagnostic note when the queue reports failed step saves', async () => {
    const { agent, run } = makeFinalizeAgent({ failures: 2, rejections: 1 });
    await finalize(agent, { step: 'Success', message: 'done' });
    expect(run.ErrorMessage).toMatch(/step record save\(s\) failed/);
    expect(run.Status).toBe('Completed'); // save failures are observability, not run failure
  });

  it("marks a failed final step 'Failed' and surfaces the error message", async () => {
    const { agent, run } = makeFinalizeAgent({ failures: 0, rejections: 0 });
    const result = await finalize(agent, { step: 'Failed', errorMessage: 'agent blew up' });
    expect(result.success).toBe(false);
    expect(run.Status).toBe('Failed');
    expect(run.ErrorMessage).toMatch(/agent blew up/);
  });

  it("maps a Chat final step to 'AwaitingFeedback' (success, awaiting human input)", async () => {
    const { agent, run } = makeFinalizeAgent({ failures: 0, rejections: 0 });
    const result = await finalize(agent, { step: 'Chat', message: 'need more info' });
    expect(result.success).toBe(true);
    expect(run.Status).toBe('AwaitingFeedback');
  });

  it('a successful root finalize publishes the run tool results to the carry-forward cache', async () => {
    PriorTurnToolResultCache.Instance.Clear();
    const conversationId = 'F1F2F3F4-0000-0000-0000-000000000001';
    const agentId = 'F1F2F3F4-0000-0000-0000-0000000000AA';
    const { agent, run } = makeFinalizeAgent({ failures: 0, rejections: 0 });
    run.AgentID = agentId;
    const a = agent as unknown as { _executeParams: Record<string, unknown>; startPostTurnCompaction(): void };
    a._executeParams = { conversationId };
    a.startPostTurnCompaction = () => undefined; // compaction is out of scope here

    await finalize(agent, { step: 'Success', message: 'done' });
    // Steps is empty → the cached [] is the negative-cache entry that spares the next turn its DB lookups.
    expect(PriorTurnToolResultCache.Instance.Get(conversationId, agentId, null)).toEqual([]);
  });

  it('createFailureResult flushes both _stepSaveQueue and _promptRunner before saving the failed run row', async () => {
    const order: string[] = [];
    const { agent, run } = makeFinalizeAgent({ failures: 1, rejections: 0 });
    const a = agent as unknown as Record<string, unknown>;
    a._stepSaveQueue = {
      Flush: vi.fn(async () => {
        order.push('stepQueue:flush');
        return { failures: 1, rejections: 0 };
      }),
    };
    a._promptRunner = {
      FlushPendingSaves: vi.fn(async () => {
        order.push('promptRunner:flush');
      }),
    };
    run.Save = vi.fn(async () => {
      order.push('agentRun:save');
      run.saved = true;
      return true;
    });

    const result = await (
      agent as unknown as { createFailureResult(msg: string, u?: unknown): Promise<{ success: boolean }> }
    ).createFailureResult('model execution failed', { ID: 'u1' });

    expect(result.success).toBe(false);
    expect(run.Status).toBe('Failed');
    expect(run.saved).toBe(true);
    expect(run.ErrorMessage).toContain('model execution failed');
    expect(run.ErrorMessage).toMatch(/1 step record save\(s\) failed/);
    expect(order.indexOf('stepQueue:flush')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('promptRunner:flush')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('agentRun:save')).toBe(2);
  });

  it('createCancelledResult flushes both _stepSaveQueue and _promptRunner before saving the cancelled run row', async () => {
    const order: string[] = [];
    const { agent, run } = makeFinalizeAgent({ failures: 0, rejections: 0 });
    const a = agent as unknown as Record<string, unknown>;
    a._stepSaveQueue = {
      Flush: vi.fn(async () => {
        order.push('stepQueue:flush');
        return { failures: 0, rejections: 0 };
      }),
    };
    a._promptRunner = {
      FlushPendingSaves: vi.fn(async () => {
        order.push('promptRunner:flush');
      }),
    };
    run.Save = vi.fn(async () => {
      order.push('agentRun:save');
      run.saved = true;
      return true;
    });

    const result = await (
      agent as unknown as { createCancelledResult(msg: string, u?: unknown): Promise<{ success: boolean }> }
    ).createCancelledResult('User requested stop', { ID: 'u1' });

    expect(result.success).toBe(false);
    expect(run.Status).toBe('Cancelled');
    expect(run.saved).toBe(true);
    expect(run.ErrorMessage).toBe('User requested stop');
    expect(order.indexOf('stepQueue:flush')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('promptRunner:flush')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('agentRun:save')).toBe(2);
  });
});

describe('BaseAgent guardrail & validation step saves — queue sequencing and OutputData preservation', () => {
  const ctx = { ID: 'u1', Name: 'Tester' } as never;

  it('checkExecutionGuardrails queues its update after the INSERT and finalizeStepEntity preserves guardrailExceeded in OutputData', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    const created = await internals(agent).createStepEntity({
      stepType: 'Prompt',
      stepName: 'Execute Agent Prompt',
      contextUser: ctx,
    });

    const a = agent as unknown as {
      hasExceededAgentRunGuardrails: () => Promise<{
        exceeded: boolean;
        type?: string;
        limit?: number;
        current?: number;
        reason?: string;
      }>;
      checkExecutionGuardrails: (
        params: Record<string, unknown>,
        nextStep: Record<string, unknown>,
        currentPayload: Record<string, unknown>,
        agentRun: Record<string, unknown>,
        currentStep: MockStep,
      ) => Promise<Record<string, unknown>>;
    };

    a.hasExceededAgentRunGuardrails = vi.fn(async () => ({
      exceeded: true,
      type: 'MaxTokens',
      limit: 1000,
      current: 1500,
      reason: 'Max tokens exceeded (1500 > 1000)',
    }));

    const modifiedStep = await a.checkExecutionGuardrails(
      { agent: { ID: 'a1', Name: 'TestAgent' }, contextUser: ctx },
      { step: 'Retry', terminate: false },
      { status: 'running' },
      { ID: 'run-1' },
      created,
    );

    expect(modifiedStep.step).toBe('Failed');
    expect(modifiedStep.terminate).toBe(true);

    // Subsequent finalizeStepEntity with step outputData must NOT overwrite guardrailExceeded
    await internals(agent).finalizeStepEntity(created, true, undefined, {
      nextStep: modifiedStep,
    });
    await pending();

    // All saves were sequenced (INSERT completes before queued UPDATEs)
    expect(log[0]).toBe('s:start:1');
    expect(log[1]).toBe('s:end:1');
    const output = JSON.parse(created.OutputData as string) as Record<string, unknown>;
    expect(output.guardrailExceeded).toMatchObject({
      type: 'MaxTokens',
      limit: 1000,
      current: 1500,
      reason: 'Max tokens exceeded (1500 > 1000)',
    });
    expect(output.nextStep).toBeDefined();
  });

  it('handleFinalPayloadValidationFailure queues validation fields via queueStepSave and preserves them across finalizeStepEntity', async () => {
    const log: string[] = [];
    const step = new MockStep('s', log);
    const { agent, pending } = makeAgent([step]);
    const created = await internals(agent).createStepEntity({
      stepType: 'Prompt',
      stepName: 'Execute Agent Prompt',
      contextUser: ctx,
    });

    const a = agent as unknown as {
      handleFinalPayloadValidationFailure: (
        params: Record<string, unknown>,
        nextStep: Record<string, unknown>,
        currentPayload: Record<string, unknown>,
        mode: string,
        errorMessages: string[],
        agentRun: Record<string, unknown>,
        currentStep: MockStep,
      ) => Promise<Record<string, unknown>>;
    };

    const resultStep = await a.handleFinalPayloadValidationFailure(
      { agent: { ID: 'a1', Name: 'TestAgent', FinalPayloadValidationMaxRetries: 3 }, contextUser: ctx },
      { step: 'Success', terminate: true },
      { total: -1 },
      'Fail',
      ['total must be non-negative'],
      { ID: 'run-1' },
      created,
    );

    expect(resultStep.step).toBe('Failed');
    expect(created.FinalPayloadValidationResult).toBe('Fail');
    expect(created.FinalPayloadValidationMessages).toBe('total must be non-negative');

    await internals(agent).finalizeStepEntity(created, true, undefined, { nextStep: resultStep });
    await pending();

    expect(log[0]).toBe('s:start:1');
    expect(log[1]).toBe('s:end:1');
    expect(created.FinalPayloadValidationResult).toBe('Fail');
    expect(created.FinalPayloadValidationMessages).toBe('total must be non-negative');
  });
});

describe('BaseAgent.compactMessage (AI Summary) — shared prompt runner, tree budget, and queued step saves', () => {
  const ctx = { ID: 'u1', Name: 'Tester' } as never;

  it('reuses _promptRunner, records usage in AgentTreeBudget, links PromptRun/TargetLogID, and queues Compaction step saves', async () => {
    const log: string[] = [];
    const step = new MockStep('compaction', log);
    const { agent, pending } = makeAgent([step]);
    const promptId = '11111111-2222-3333-4444-555555555555';
    const promptRunId = '99999999-8888-7777-6666-555555555555';
    const fakePromptEntity = { ID: promptId, Name: 'Compact Agent Message' };

    const a = agent as unknown as {
      _promptRunner: { ExecutePrompt: ReturnType<typeof vi.fn> };
      _treeBudget?: {
        totalPromptIterations: number;
        totalTokens: number;
        totalCost: number;
        totalSteps: number;
      };
      compactMessage: (
        message: Record<string, unknown>,
        metadata: {
          compactMode: 'First N Chars' | 'AI Summary';
          compactLength: number;
          compactPromptId: string;
          originalLength: number;
        },
        params: Record<string, unknown>,
      ) => Promise<string>;
    };

    const fakePromptRun = {
      ID: promptRunId,
      TokensPrompt: 120,
      TokensCompletion: 30,
      TotalCost: 0.0045,
      Cost: 0.0045,
    };

    const executePromptMock = vi.fn(async (promptParams: { onPromptRunCreated?: (id: string) => Promise<void> }) => {
      if (promptParams.onPromptRunCreated) {
        await promptParams.onPromptRunCreated(promptRunId);
      }
      return {
        success: true,
        result: { summary: 'Concise summary of tool output.' },
        promptRun: fakePromptRun,
        promptTokens: 120,
        completionTokens: 30,
        cost: 0.0045,
      };
    });
    a._promptRunner = { ExecutePrompt: executePromptMock };

    const aiEngineMod = await import('@memberjunction/aiengine');
    vi.spyOn(aiEngineMod.AIEngine, 'Instance', 'get').mockReturnValue({
      Prompts: [fakePromptEntity],
    } as never);

    const summaryText = await a.compactMessage(
      {
        role: 'user',
        content: 'Long action output '.repeat(50),
        metadata: { messageType: 'action-result', turnAdded: 1, tokensSaved: 180 },
      },
      {
        compactMode: 'AI Summary',
        compactLength: 200,
        compactPromptId: promptId,
        originalLength: 950,
      },
      {
        agent: { ID: 'a1', Name: 'TestAgent' },
        contextUser: ctx,
        conversationMessages: [],
      },
    );

    await pending();

    expect(executePromptMock).toHaveBeenCalledOnce();
    expect(summaryText).toContain('Concise summary of tool output.');
    expect(step.StepType).toBe('Compaction');
    expect(step.StepNumber).toBe(1);
    expect(step.TargetID).toBe(promptId);
    expect(step.TargetLogID).toBe(promptRunId);
    expect(step.PromptRun).toBe(fakePromptRun);
    expect(step.Status).toBe('Completed');
    expect(step.Success).toBe(true);
    expect(internals(agent)._agentRun.Steps).toContain(step);

    // INSERT completes before queued UPDATE(s)
    expect(log[0]).toBe('compaction:start:1');
    expect(log[1]).toBe('compaction:end:1');
    expect(step.saveOptions.some((opt) => opt?.IgnoreDirtyState === true)).toBe(true);

    // Tree budget reflects both the Compaction step and the prompt execution tokens/cost
    expect(a._treeBudget?.totalSteps).toBe(1);
    expect(a._treeBudget?.totalTokens).toBe(150);
    expect(a._treeBudget?.totalCost).toBeCloseTo(0.0045, 6);
  });
});


