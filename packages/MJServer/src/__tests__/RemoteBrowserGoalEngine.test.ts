import { describe, it, expect, vi, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { RunComputerUseParams, type StepRecord } from '@memberjunction/computer-use';
import { MJComputerUseEngine, MJRunComputerUseParams } from '@memberjunction/computer-use-engine';
import { CdpRemoteBrowserSession, type ComputerUseGoalRun } from '@memberjunction/remote-browser-cdp';
import { buildMJGoalParams, BindRemoteBrowserGoalEngine, MJProgressComputerUseEngine } from '../agentSessions/remoteBrowserGoalEngine.js';

const USER = { ID: 'u-1', Email: 'amith@bluecypress.io' } as unknown as UserInfo;

/** Builds a base RunComputerUseParams the CDP session would hand to the goal engine. */
function baseParams(): RunComputerUseParams {
  return Object.assign(new RunComputerUseParams(), { Goal: 'log in', MaxSteps: 7, StartUrl: 'https://app.test/' });
}

describe('buildMJGoalParams', () => {
  it('produces MJ-aware params that carry over the base goal/step/url fields', () => {
    const mj = buildMJGoalParams(baseParams(), USER);
    expect(mj).toBeInstanceOf(MJRunComputerUseParams);
    expect(mj.Goal).toBe('log in');
    expect(mj.MaxSteps).toBe(7);
    expect(mj.StartUrl).toBe('https://app.test/');
  });

  it('injects the acting ContextUser so MJ prompts run as that user', () => {
    expect(buildMJGoalParams(baseParams(), USER).ContextUser).toBe(USER);
  });

  it('leaves ContextUser undefined when none is supplied', () => {
    expect(buildMJGoalParams(baseParams()).ContextUser).toBeUndefined();
  });
});

describe('MJProgressComputerUseEngine', () => {
  it('is an MJ computer-use engine that satisfies the goal-run seam', () => {
    const engine = new MJProgressComputerUseEngine();
    expect(engine).toBeInstanceOf(MJComputerUseEngine);
    // Seam surface the CDP session drives:
    expect(typeof engine.SetBrowserAdapter).toBe('function');
    expect(typeof engine.Stop).toBe('function');
    expect(typeof engine.Run).toBe('function');
  });

  it('forwards a model-safe progress note on each completed step', () => {
    const engine = new MJProgressComputerUseEngine();
    const notes: { Step: number; Message: string; Url?: string }[] = [];
    engine.OnProgress = (p) => notes.push(p);

    // onStepComplete is protected; the base MJ media-persistence path is a no-op here (no prompt-run id /
    // context user set), so this exercises only the progress forwarding.
    const step = { StepNumber: 2, ControllerReasoning: 'typing username', Url: 'https://app.test/login', Screenshot: '' } as StepRecord;
    (engine as unknown as { onStepComplete(s: StepRecord, p: MJRunComputerUseParams): void }).onStepComplete(step, new MJRunComputerUseParams());

    expect(notes).toEqual([{ Step: 2, Message: 'typing username', Url: 'https://app.test/login' }]);
  });
});

describe('BindRemoteBrowserGoalEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('binds a factory that yields an MJ progress engine', () => {
    const spy = vi.spyOn(CdpRemoteBrowserSession, 'SetGoalEngineFactory');
    BindRemoteBrowserGoalEngine();

    expect(spy).toHaveBeenCalledOnce();
    const factory = spy.mock.calls[0][0] as () => ComputerUseGoalRun;
    expect(factory()).toBeInstanceOf(MJProgressComputerUseEngine);
  });

  it('never throws (a binding hiccup must not abort server boot)', () => {
    vi.spyOn(CdpRemoteBrowserSession, 'SetGoalEngineFactory').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => BindRemoteBrowserGoalEngine()).not.toThrow();
  });
});
