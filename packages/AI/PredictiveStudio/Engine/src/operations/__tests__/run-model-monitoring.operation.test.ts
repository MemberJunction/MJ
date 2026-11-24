import { beforeEach, describe, expect, it } from 'vitest';

import { PredictiveStudioModelMonitoringJobDriver } from '../../monitoring/monitoring-driver';
import { SPEC } from '../../monitoring/__tests__/monitoring-spec';
import { CURRENT, D, MonitoringWorld } from '../../monitoring/__tests__/monitoring-world';
import { MonitoringJobs } from '../../registry/monitoring-job';
import { ModelMonitoringRun } from '../run-model-monitoring.operation';

/** Task M6.3 — `PredictiveStudio.RunModelMonitoring` runs one period now with the model's open monitoring job's spec. */
let world: MonitoringWorld;
let driver: PredictiveStudioModelMonitoringJobDriver;

beforeEach(() => {
  world = new MonitoringWorld();
  world.Store.Binding = MonitoringWorld.BINDING;
  world.Now = D('2026-07-31');
  driver = new PredictiveStudioModelMonitoringJobDriver(world.Seams());
  world.GateStore.Insert('MJ: Scheduled Job Types', { ID: 'D0000000-0000-4000-8000-000000000001', Name: MonitoringJobs.JOB_TYPE_NAME });
  world.GateStore.Insert('MJ: Scheduled Jobs', { ID: 'D0000000-0000-4000-8000-000000000002', JobTypeID: 'D0000000-0000-4000-8000-000000000001', Status: 'Active', Configuration: JSON.stringify(SPEC) });
  for (let i = 0; i < 50; i++) {
    world.Store.Predict(CURRENT, `r${i}`, D('2026-05-10'), 0.3);
    world.Store.Outcome(`r${i}`, D('2026-05-10'), i < 15 ? '1' : '0');
  }
});

const ctx = () => ({ ContextUser: MonitoringWorld.User, Provider: world.Provider });

describe('ModelMonitoringRun.Run', () => {
  it('runs the named period and returns its row with the primary score and bounds', async () => {
    const out = await ModelMonitoringRun.Run({ modelId: CURRENT, periodStart: '2026-05-01' }, ctx(), driver);
    expect(out).toMatchObject({ modelId: CURRENT, periods: [{ period: '2026-05-01', state: 'evaluated', joinedRows: 50, primaryValue: expect.any(Number), primaryLower: expect.any(Number), primaryUpper: expect.any(Number) }] });
    expect(world.Store.Last().ScheduledJobRunID).toBeNull();
  });

  it('runs the last complete period when none is named', async () => {
    const out = await ModelMonitoringRun.Run({ modelId: CURRENT }, ctx(), driver);
    expect(out.periods.map((p) => p.period)).toEqual(['2026-06-01']);
  });

  it('refuses a periodStart that is not the first day of a period of the job\'s grain', async () => {
    await expect(ModelMonitoringRun.Run({ modelId: CURRENT, periodStart: '2026-05-02' }, ctx(), driver)).rejects.toThrow(/not the first day of a month/);
  });

  it('refuses a model with no open monitoring job', async () => {
    await expect(ModelMonitoringRun.Run({ modelId: 'C0000000-0000-4000-8000-0000000000FF' }, ctx(), driver)).rejects.toThrow(/no open monitoring job/);
  });
});
