import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';

import { PredictiveStudioScheduleModelScoringAction } from '../schedule-model-scoring.action';
import type { ScheduleModelScoringFn } from '../schedule-model-scoring.action';
import type { ScheduleModelScoringOptions } from '../../scheduling/scheduled-model-scoring';

/**
 * Unit tests for the Schedule Model Scoring action. NO live DB — the scheduling
 * helper is mocked via the action's overridable `schedule()` seam. These prove the
 * action stays thin: param validation (ModelID / TargetEntityName / OutputField /
 * ScopeFilter / ContextUser), correct mapping of the conversational params onto the
 * helper's options (cadence + valueKind parsing), and result→output-param mapping.
 */

/** A captured-call mock helper returning a stub saved Record Process. */
class MockScheduler {
  public LastOpts: ScheduleModelScoringOptions | null = null;
  public CallCount = 0;
  constructor(private readonly rp: Partial<MJRecordProcessEntity>) {}
  public fn: ScheduleModelScoringFn = async (opts) => {
    this.CallCount++;
    this.LastOpts = opts;
    return this.rp as MJRecordProcessEntity;
  };
}

/** Test subclass injecting a mock scheduling fn, exposing a clean `run`. */
class TestableAction extends PredictiveStudioScheduleModelScoringAction {
  constructor(private readonly schedulerFn: ScheduleModelScoringFn) {
    super();
  }
  protected override schedule(): ScheduleModelScoringFn {
    return this.schedulerFn;
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

function params(list: ActionParam[]): RunActionParams {
  return { Params: list, ContextUser: { ID: 'test-user' } } as unknown as RunActionParams;
}
function paramsNoUser(list: ActionParam[]): RunActionParams {
  return { Params: list } as unknown as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}

const STUB_RP = { ID: 'rp-1', Name: 'Score Memberships with model m1 (Monthly)', CronExpression: '0 0 1 * *' };

function validParams(extra: ActionParam[] = []): ActionParam[] {
  return [
    { Name: 'ModelID', Type: 'Input', Value: 'm1' },
    { Name: 'TargetEntityName', Type: 'Input', Value: 'Memberships' },
    { Name: 'OutputField', Type: 'Input', Value: 'RenewalScore' },
    { Name: 'ScopeFilter', Type: 'Input', Value: "Status='Active'" },
    ...extra,
  ];
}

describe('PredictiveStudioScheduleModelScoringAction — validation', () => {
  it.each([
    ['ModelID', [{ Name: 'TargetEntityName', Type: 'Input', Value: 'Memberships' }, { Name: 'OutputField', Type: 'Input', Value: 'X' }, { Name: 'ScopeFilter', Type: 'Input', Value: 'x=1' }]],
    ['TargetEntityName', [{ Name: 'ModelID', Type: 'Input', Value: 'm1' }, { Name: 'OutputField', Type: 'Input', Value: 'X' }, { Name: 'ScopeFilter', Type: 'Input', Value: 'x=1' }]],
    ['OutputField', [{ Name: 'ModelID', Type: 'Input', Value: 'm1' }, { Name: 'TargetEntityName', Type: 'Input', Value: 'Memberships' }, { Name: 'ScopeFilter', Type: 'Input', Value: 'x=1' }]],
    ['ScopeFilter', [{ Name: 'ModelID', Type: 'Input', Value: 'm1' }, { Name: 'TargetEntityName', Type: 'Input', Value: 'Memberships' }, { Name: 'OutputField', Type: 'Input', Value: 'X' }]],
  ] as const)('fails when %s is missing', async (_missing, list) => {
    const scheduler = new MockScheduler(STUB_RP);
    const result = await new TestableAction(scheduler.fn).run(params(list as ActionParam[]));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(scheduler.CallCount).toBe(0);
  });

  it('fails when ContextUser is missing', async () => {
    const scheduler = new MockScheduler(STUB_RP);
    const result = await new TestableAction(scheduler.fn).run(paramsNoUser(validParams()));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(scheduler.CallCount).toBe(0);
  });
});

describe('PredictiveStudioScheduleModelScoringAction — delegation + mapping', () => {
  it('maps the conversational params onto the helper options and returns the RP id + cron', async () => {
    const scheduler = new MockScheduler(STUB_RP);
    const p = params(validParams());
    const result = await new TestableAction(scheduler.fn).run(p);

    expect(scheduler.CallCount).toBe(1);
    expect(scheduler.LastOpts?.modelId).toBe('m1');
    expect(scheduler.LastOpts?.targetEntityName).toBe('Memberships');
    expect(scheduler.LastOpts?.outputField).toBe('RenewalScore');
    expect(scheduler.LastOpts?.scope).toEqual({ filter: "Status='Active'" });
    expect(scheduler.LastOpts?.cadence).toBeUndefined(); // helper defaults to Monthly
    expect(scheduler.LastOpts?.valueKind).toBeUndefined();

    expect(result.Success).toBe(true);
    expect(out(p, 'RecordProcessID')).toBe('rp-1');
    expect(out(p, 'CronExpression')).toBe('0 0 1 * *');
  });

  it('parses a named cadence (case-insensitive) and value kind', async () => {
    const scheduler = new MockScheduler(STUB_RP);
    await new TestableAction(scheduler.fn).run(
      params(validParams([
        { Name: 'Cadence', Type: 'Input', Value: 'weekly' },
        { Name: 'ValueKind', Type: 'Input', Value: 'class' },
        { Name: 'PrimaryKeyField', Type: 'Input', Value: 'MembershipID' },
      ])),
    );
    expect(scheduler.LastOpts?.cadence).toBe('Weekly');
    expect(scheduler.LastOpts?.valueKind).toBe('class');
    expect(scheduler.LastOpts?.primaryKeyField).toBe('MembershipID');
  });

  it('treats a non-named cadence as a raw cron expression', async () => {
    const scheduler = new MockScheduler(STUB_RP);
    await new TestableAction(scheduler.fn).run(
      params(validParams([{ Name: 'Cadence', Type: 'Input', Value: '30 2 * * 5' }])),
    );
    expect(scheduler.LastOpts?.cadence).toEqual({ cron: '30 2 * * 5' });
  });

  it('maps a thrown helper error onto SCHEDULE_FAILED', async () => {
    const scheduler = { fn: async (): Promise<MJRecordProcessEntity> => { throw new Error('save blew up'); } };
    const result = await new TestableAction(scheduler.fn).run(params(validParams()));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('SCHEDULE_FAILED');
    expect(result.Message).toContain('save blew up');
  });
});
