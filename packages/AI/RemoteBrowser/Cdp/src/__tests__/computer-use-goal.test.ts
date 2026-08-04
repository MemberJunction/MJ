import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { BaseBrowserAdapter, ComputerUseResult, RunComputerUseParams, StepRecord } from '@memberjunction/computer-use';
import { CdpRemoteBrowserSession } from '../cdp-remote-browser-session';
import {
  buildProgressNote,
  ComputerUseGoalProgress,
  ComputerUseGoalRun,
  defaultComputerUseGoalEngineFactory,
  PROGRESS_MESSAGE_MAX_LENGTH,
} from '../computer-use-goal-engine';
import { FakeCdpSessionBackend, FakePlaywrightBrowserAdapter } from './fakes';

/** A fake goal engine implementing the seam — records the handed adapter + goal, forwards progress, supports abort. */
class FakeGoalEngine implements ComputerUseGoalRun {
  public adapter?: BaseBrowserAdapter;
  public ranGoal?: string;
  public ranMaxSteps?: number;
  public stopped = false;
  public OnProgress?: (progress: ComputerUseGoalProgress) => void;
  public ContextUser?: UserInfo;
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

  it('forwards the acting ContextUser to the engine so MJ prompts run as that user', async () => {
    const { session } = buildSession();
    const user = { ID: 'user-1', Email: 'amith@bluecypress.io' } as unknown as UserInfo;
    await session.RunComputerUseGoal('do it', { ContextUser: user });
    expect(engine.ContextUser).toBe(user);
  });

  it('leaves the engine ContextUser unset when none is supplied', async () => {
    const { session } = buildSession();
    await session.RunComputerUseGoal('do it');
    expect(engine.ContextUser).toBeUndefined();
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

/** Builds a minimal StepRecord-shaped object for buildProgressNote tests. */
function step(partial: Partial<StepRecord>): StepRecord {
  return { StepNumber: 1, ControllerReasoning: '', Url: '', Screenshot: '', ...partial } as StepRecord;
}

describe('buildProgressNote', () => {
  it('carries the step number, reasoning, and url through unchanged when short', () => {
    expect(buildProgressNote(step({ StepNumber: 3, ControllerReasoning: 'clicking login', Url: 'https://x.test/' }))).toEqual({
      Step: 3,
      Message: 'clicking login',
      Url: 'https://x.test/',
    });
  });

  it('truncates an over-long reasoning to the max length plus an ellipsis', () => {
    const long = 'a'.repeat(PROGRESS_MESSAGE_MAX_LENGTH + 50);
    const note = buildProgressNote(step({ ControllerReasoning: long }));
    expect(note.Message).toBe('a'.repeat(PROGRESS_MESSAGE_MAX_LENGTH) + '…');
    expect(note.Message.length).toBe(PROGRESS_MESSAGE_MAX_LENGTH + 1); // +1 for the single ellipsis char
  });

  it('does not truncate reasoning exactly at the max length', () => {
    const exact = 'b'.repeat(PROGRESS_MESSAGE_MAX_LENGTH);
    expect(buildProgressNote(step({ ControllerReasoning: exact })).Message).toBe(exact);
  });

  it('yields an empty message when there is no reasoning', () => {
    expect(buildProgressNote(step({ ControllerReasoning: '' })).Message).toBe('');
  });
});
