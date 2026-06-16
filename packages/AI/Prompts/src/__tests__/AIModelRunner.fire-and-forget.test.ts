/**
 * Fire-and-forget persistence tests for AIModelRunner (embedding/model run records).
 * Mirrors the AIPromptRunner contract: the run record is observability, so saves are queued
 * (not awaited), chained per-instance so the INSERT precedes the UPDATE, non-fatal on failure,
 * and flushable via WaitForPendingPromptRunSaves. Tests the REAL queuePromptRunSave via cast.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AIModelRunner } from '../AIModelRunner';

type RunnerInternals = { queuePromptRunSave(entity: unknown): Promise<boolean> };
function priv(r: AIModelRunner): RunnerInternals { return r as unknown as RunnerInternals; }

class FakePromptRun {
  public ID = 'mr-1';
  public LatestResult: { CompleteMessage: string } | null = null;
  private idx = 0;
  constructor(private log: string[], private failOn = new Set<number>()) {}
  async Save(): Promise<boolean> {
    const n = ++this.idx;
    this.log.push(`start:${n}`);
    await new Promise((r) => setTimeout(r, 5));
    this.log.push(`end:${n}`);
    if (this.failOn.has(n)) { this.LatestResult = { CompleteMessage: 'fail' }; return false; }
    return true;
  }
}

let runner: AIModelRunner;
beforeEach(() => { runner = new AIModelRunner(); });

describe('AIModelRunner — fire-and-forget prompt-run saves', () => {
  it('chains same-instance saves: INSERT completes before UPDATE starts', async () => {
    const log: string[] = [];
    const entity = new FakePromptRun(log);
    priv(runner).queuePromptRunSave(entity); // create
    priv(runner).queuePromptRunSave(entity); // complete/fail
    await runner.WaitForPendingPromptRunSaves();
    expect(log).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it('runs different-instance saves concurrently', async () => {
    const log: string[] = [];
    priv(runner).queuePromptRunSave(new FakePromptRun(log));
    priv(runner).queuePromptRunSave(new FakePromptRun(log));
    await runner.WaitForPendingPromptRunSaves();
    expect(log.slice(0, 2)).toEqual(['start:1', 'start:1']); // both started before either ended
  });

  it('a failed save is non-fatal and the flush still settles', async () => {
    const log: string[] = [];
    const entity = new FakePromptRun(log, new Set([1]));
    const p1 = priv(runner).queuePromptRunSave(entity);
    await expect(p1).resolves.toBe(false);
    await expect(runner.WaitForPendingPromptRunSaves()).resolves.toBeUndefined();
  });

  it('WaitForPendingPromptRunSaves resolves with nothing queued', async () => {
    await expect(runner.WaitForPendingPromptRunSaves()).resolves.toBeUndefined();
  });
});
