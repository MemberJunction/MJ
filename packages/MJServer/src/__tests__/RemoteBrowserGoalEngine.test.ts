import { describe, it, expect, vi, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { RunComputerUseParams, type StepRecord } from '@memberjunction/computer-use';
import { MJComputerUseEngine, MJRunComputerUseParams } from '@memberjunction/computer-use-engine';
import { CdpRemoteBrowserSession, type ComputerUseGoalRun } from '@memberjunction/remote-browser-cdp';
import type { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import {
  buildMJGoalParams,
  BindRemoteBrowserGoalEngine,
  MJProgressComputerUseEngine,
  extractCoAgentRunID,
  finalizeBrowserGoalStep,
} from '../agentSessions/remoteBrowserGoalEngine.js';

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

  it('threads the parent run + step ids for observability nesting', () => {
    const mj = buildMJGoalParams(baseParams(), USER, 'coagent-run-1', 'goal-step-1');
    expect(mj.AgentRunId).toBe('coagent-run-1');
    expect(mj.AgentRunStepID).toBe('goal-step-1');
  });

  it('leaves the run/step ids undefined when not supplied', () => {
    const mj = buildMJGoalParams(baseParams(), USER);
    expect(mj.AgentRunId).toBeUndefined();
    expect(mj.AgentRunStepID).toBeUndefined();
  });
});

describe('extractCoAgentRunID', () => {
  it('pulls coAgentRunID out of a session Config_ blob', () => {
    expect(extractCoAgentRunID(JSON.stringify({ coAgentRunID: 'run-9', promptRunID: 'p' }))).toBe('run-9');
  });
  it('returns undefined for a missing key, null/empty config, or non-string value', () => {
    expect(extractCoAgentRunID(JSON.stringify({ promptRunID: 'p' }))).toBeUndefined();
    expect(extractCoAgentRunID(null)).toBeUndefined();
    expect(extractCoAgentRunID(undefined)).toBeUndefined();
    expect(extractCoAgentRunID('')).toBeUndefined();
    expect(extractCoAgentRunID(JSON.stringify({ coAgentRunID: 123 }))).toBeUndefined();
  });
  it('returns undefined for malformed JSON (best-effort)', () => {
    expect(extractCoAgentRunID('{not json')).toBeUndefined();
  });
});

describe('finalizeBrowserGoalStep', () => {
  function fakeStep() {
    return {
      StartedAt: new Date(),
      Save: vi.fn(async () => true),
      LatestResult: { CompleteMessage: '' },
    } as unknown as MJAIAgentRunStepEntity & { Save: ReturnType<typeof vi.fn> };
  }

  it('finalizes the parent step Completed from a successful goal result + saves', async () => {
    const step = fakeStep();
    await finalizeBrowserGoalStep(step, { Success: true, Strategy: 'ComputerUse', Status: 'Completed', StepCount: 4, CurrentUrl: 'https://done/' });
    expect(step.Status).toBe('Completed');
    expect(step.Success).toBe(true);
    expect((step as unknown as { Save: ReturnType<typeof vi.fn> }).Save).toHaveBeenCalledOnce();
    const out = JSON.parse(step.OutputData as string);
    expect(out.strategy).toBe('ComputerUse');
    expect(out.stepCount).toBe(4);
  });

  it('finalizes Failed and carries the detail as the error message', async () => {
    const step = fakeStep();
    await finalizeBrowserGoalStep(step, { Success: false, Status: 'Error', Detail: 'login blocked' });
    expect(step.Status).toBe('Failed');
    expect(step.ErrorMessage).toBe('login blocked');
  });

  it('is a no-op when the step is null (no co-agent run to nest under)', async () => {
    await expect(finalizeBrowserGoalStep(null, { Success: true })).resolves.toBeUndefined();
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
