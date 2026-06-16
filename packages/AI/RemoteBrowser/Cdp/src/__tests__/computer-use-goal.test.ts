import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BaseBrowserAdapter, ComputerUseResult, RunComputerUseParams } from '@memberjunction/computer-use';
import { CdpRemoteBrowserSession } from '../cdp-remote-browser-session';
import { ComputerUseGoalProgress, ComputerUseGoalRun, defaultComputerUseGoalEngineFactory } from '../computer-use-goal-engine';
import { FakeCdpSessionBackend, FakePlaywrightBrowserAdapter } from './fakes';

/** A fake goal engine implementing the seam — records the handed adapter + goal, forwards progress, supports abort. */
class FakeGoalEngine implements ComputerUseGoalRun {
  public adapter?: BaseBrowserAdapter;
  public ranGoal?: string;
  public ranMaxSteps?: number;
  public stopped = false;
  public OnProgress?: (progress: ComputerUseGoalProgress) => void;
  /** When set, Run blocks on this until resolved (lets a test abort mid-run). */
  public resolveRun?: (result: ComputerUseResult) => void;
  public result: Partial<ComputerUseResult> = {
    Success: true,
    Status: 'Completed',
    TotalSteps: 3,
    FinalUrl: 'https://done.test/',
  };

  public SetBrowserAdapter(adapter: BaseBrowserAdapter): void {
    this.adapter = adapter;
  }
  public async Run(params: RunComputerUseParams): Promise<ComputerUseResult> {
    this.ranGoal = params.Goal;
    this.ranMaxSteps = params.MaxSteps;
    this.OnProgress?.({ Step: 1, Message: 'working on it', Url: 'https://step.test/' });
    if (this.resolveRun) {
      return new Promise<ComputerUseResult>((res) => {
        this.resolveRun = res as (r: ComputerUseResult) => void;
      });
    }
    return this.result as ComputerUseResult;
  }
  public Stop(): void {
    this.stopped = true;
  }
}

function buildSession(): { session: CdpRemoteBrowserSession; adapter: FakePlaywrightBrowserAdapter } {
  const adapter = new FakePlaywrightBrowserAdapter();
  const session = new CdpRemoteBrowserSession(adapter, 'ws://cdp.test/endpoint', {}, new FakeCdpSessionBackend(), 'FakeProvider');
  return { session, adapter };
}

describe('CdpRemoteBrowserSession.RunComputerUseGoal', () => {
  let engine: FakeGoalEngine;

  beforeEach(() => {
    engine = new FakeGoalEngine();
    CdpRemoteBrowserSession.SetGoalEngineFactory(() => engine);
  });
  afterEach(() => {
    CdpRemoteBrowserSession.SetGoalEngineFactory(defaultComputerUseGoalEngineFactory);
  });

  it('hands ITS OWN adapter to the engine, runs the goal, and maps the result', async () => {
    const { session, adapter } = buildSession();
    const result = await session.RunComputerUseGoal('log in', { MaxSteps: 12 });

    expect(engine.adapter).toBe(adapter); // same instance the session/human use — no second browser
    expect(engine.ranGoal).toBe('log in');
    expect(engine.ranMaxSteps).toBe(12);
    expect(result).toEqual({
      Success: true,
      Strategy: 'ComputerUse',
      CurrentUrl: 'https://done.test/',
      Status: 'Completed',
      StepCount: 3,
      Detail: undefined,
    });
  });

  it('forwards per-step progress to the caller', async () => {
    const { session } = buildSession();
    const progress: ComputerUseGoalProgress[] = [];
    await session.RunComputerUseGoal('do it', { OnProgress: (p) => progress.push(p) });
    expect(progress).toEqual([{ Step: 1, Message: 'working on it', Url: 'https://step.test/' }]);
  });

  it('stops the engine when the abort signal fires (barge-in)', async () => {
    const { session } = buildSession();
    engine.resolveRun = () => undefined; // make Run block
    const ctrl = new AbortController();
    const pending = session.RunComputerUseGoal('long task', { Signal: ctrl.signal });
    ctrl.abort();
    expect(engine.stopped).toBe(true);
    engine.resolveRun?.(engine.result as ComputerUseResult); // unblock
    await pending;
  });

  it('maps an engine throw to a failed ComputerUse result', async () => {
    const { session } = buildSession();
    engine.Run = async () => {
      throw new Error('vision model offline');
    };
    const result = await session.RunComputerUseGoal('x');
    expect(result.Success).toBe(false);
    expect(result.Strategy).toBe('ComputerUse');
    expect(result.Status).toBe('Error');
    expect(result.Detail).toMatch(/vision model offline/);
  });
});
