/**
 * Unit tests for the performance/observability behaviors added to AIPromptRunner:
 *  - resolveScalarInferenceParams() — prompt-default ⊕ additionalParameters precedence
 *  - getParsedOutputExample() — content-keyed parse cache (hit / miss / cached-failure)
 *  - queuePromptRunSave() + WaitForPendingPromptRunSaves() — fire-and-forget saves with
 *    instance-keyed ordering (INSERT before UPDATE) and non-fatal failure handling
 *
 * These instantiate the REAL AIPromptRunner and reach the private members via a typed
 * cast, so they validate the actual implementation rather than a re-implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';

/** Accessor for the private members under test. */
type RunnerInternals = {
  resolveScalarInferenceParams(prompt: unknown, additionalParameters?: Record<string, unknown>): Record<string, unknown>;
  getParsedOutputExample(s: string): { parsed?: unknown; error?: string };
  queuePromptRunSave(entity: unknown): Promise<boolean>;
};
function internals(r: AIPromptRunner): RunnerInternals {
  return r as unknown as RunnerInternals;
}

function makePrompt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Temperature: null, TopP: null, TopK: null, MinP: null,
    FrequencyPenalty: null, PresencePenalty: null, Seed: null,
    IncludeLogProbs: null, TopLogProbs: null,
    ...overrides,
  };
}

describe('AIPromptRunner — resolveScalarInferenceParams', () => {
  let runner: AIPromptRunner;
  beforeEach(() => { runner = new AIPromptRunner(); });

  it('uses prompt defaults when no override is provided', () => {
    const r = internals(runner).resolveScalarInferenceParams(makePrompt({ Temperature: 0.5, TopP: 0.9 }));
    expect(r.temperature).toBe(0.5);
    expect(r.topP).toBe(0.9);
  });

  it('additionalParameters override prompt defaults', () => {
    const r = internals(runner).resolveScalarInferenceParams(
      makePrompt({ Temperature: 0.5 }),
      { temperature: 0.95 },
    );
    expect(r.temperature).toBe(0.95);
  });

  it('leaves a value undefined when neither prompt nor override sets it', () => {
    const r = internals(runner).resolveScalarInferenceParams(makePrompt());
    expect(r.temperature).toBeUndefined();
    expect(r.seed).toBeUndefined();
  });

  it('respects falsy-but-defined overrides (seed=0, topP=0)', () => {
    const r = internals(runner).resolveScalarInferenceParams(
      makePrompt({ Seed: 42 }),
      { seed: 0, topP: 0 },
    );
    expect(r.seed).toBe(0);   // override 0 must win over prompt default 42
    expect(r.topP).toBe(0);   // defined-but-falsy override applied
  });

  it('treats prompt default of 0 as a real value (!= null semantics)', () => {
    const r = internals(runner).resolveScalarInferenceParams(makePrompt({ Temperature: 0, TopK: 0 }));
    expect(r.temperature).toBe(0);
    expect(r.topK).toBe(0);
  });

  it('maps IncludeLogProbs/TopLogProbs through to includeLogProbs/topLogProbs', () => {
    const r = internals(runner).resolveScalarInferenceParams(makePrompt({ IncludeLogProbs: true, TopLogProbs: 3 }));
    expect(r.includeLogProbs).toBe(true);
    expect(r.topLogProbs).toBe(3);
  });
});

describe('AIPromptRunner — getParsedOutputExample (content-keyed cache)', () => {
  let runner: AIPromptRunner;
  beforeEach(() => {
    runner = new AIPromptRunner();
    // Clear the process-wide static cache so tests don't bleed into each other.
    (AIPromptRunner as unknown as { _outputExampleCache: Map<string, unknown> })._outputExampleCache.clear();
  });

  it('parses valid JSON and returns the object', () => {
    const res = internals(runner).getParsedOutputExample('{"a":1,"b":"x"}');
    expect(res.error).toBeUndefined();
    expect(res.parsed).toEqual({ a: 1, b: 'x' });
  });

  it('returns the SAME cached entry object on repeat (cache hit, no re-parse)', () => {
    const example = '{"cached":true}';
    const first = internals(runner).getParsedOutputExample(example);
    const second = internals(runner).getParsedOutputExample(example);
    expect(second).toBe(first); // identical entry object => served from cache
  });

  it('caches parse FAILURES (returns an error, does not throw, both calls equal)', () => {
    const bad = '{not valid json';
    const first = internals(runner).getParsedOutputExample(bad);
    const second = internals(runner).getParsedOutputExample(bad);
    expect(first.parsed).toBeUndefined();
    expect(typeof first.error).toBe('string');
    expect(second).toBe(first); // failure entry is cached too
  });

  it('keys by content — different examples get independent entries', () => {
    const a = internals(runner).getParsedOutputExample('{"x":1}');
    const b = internals(runner).getParsedOutputExample('{"x":2}');
    expect(a).not.toBe(b);
    expect((a.parsed as { x: number }).x).toBe(1);
    expect((b.parsed as { x: number }).x).toBe(2);
  });
});

/** Minimal stand-in for MJAIPromptRunEntityExtended for the save-queue tests. */
class FakePromptRun {
  public ID = 'pr-1';
  public LatestResult: { CompleteMessage: string } | null = null;
  public saveLog: string[];
  private failOn: Set<number>;
  private callIndex = 0;
  constructor(saveLog: string[], failOn: number[] = []) {
    this.saveLog = saveLog;
    this.failOn = new Set(failOn);
  }
  async Save(): Promise<boolean> {
    const n = ++this.callIndex;
    this.saveLog.push(`start:${n}`);
    // Yield to the event loop so a racing second Save() would interleave if NOT chained.
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.saveLog.push(`end:${n}`);
    if (this.failOn.has(n)) {
      this.LatestResult = { CompleteMessage: 'simulated failure' };
      return false;
    }
    return true;
  }
}

describe('AIPromptRunner — fire-and-forget prompt-run saves', () => {
  let runner: AIPromptRunner;
  beforeEach(() => { runner = new AIPromptRunner(); });

  it('chains saves for the SAME entity instance: INSERT fully completes before UPDATE starts', async () => {
    const log: string[] = [];
    const entity = new FakePromptRun(log);

    // Simulate createPromptRun (INSERT) then updatePromptRun (UPDATE) on the same instance.
    internals(runner).queuePromptRunSave(entity);
    internals(runner).queuePromptRunSave(entity);

    await runner.WaitForPendingPromptRunSaves();

    // The second save must not start until the first has ended — proves ordering.
    expect(log).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it('runs saves for DIFFERENT entity instances concurrently (no cross-entity serialization)', async () => {
    const log: string[] = [];
    const a = new FakePromptRun(log);
    const b = new FakePromptRun(log);

    internals(runner).queuePromptRunSave(a);
    internals(runner).queuePromptRunSave(b);
    await runner.WaitForPendingPromptRunSaves();

    // Both started before either finished => interleaved (concurrent), not serialized.
    expect(log.slice(0, 2).sort()).toEqual(['start:1', 'start:1']);
  });

  it('a failed save is non-fatal: the chained promise resolves false and the flush still completes', async () => {
    const log: string[] = [];
    const entity = new FakePromptRun(log, [1]); // first save fails

    const p1 = internals(runner).queuePromptRunSave(entity); // INSERT fails
    const p2 = internals(runner).queuePromptRunSave(entity); // UPDATE still runs after

    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(true);
    await runner.WaitForPendingPromptRunSaves();
    expect(log).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it('WaitForPendingPromptRunSaves resolves even with no queued saves', async () => {
    await expect(runner.WaitForPendingPromptRunSaves()).resolves.toBeUndefined();
  });
});
