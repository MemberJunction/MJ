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
});
