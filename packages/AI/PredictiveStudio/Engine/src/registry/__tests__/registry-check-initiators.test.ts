import { beforeEach, describe, expect, it } from 'vitest';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import type { GateContext } from '../gate-context';
import { GateContexts } from '../gate-seams';
import { RegistryCheckInitiators } from '../registry-check-initiators';

/** R9 / D4-61 — only a run of a Registry Check job may take a Published model out of service without a replacement. */
const TYPE = '5A000000-0000-4000-8000-000000000001';
const OTHER_TYPE = '5A000000-0000-4000-8000-000000000002';
const JOB = '5A000000-0000-4000-8000-000000000011';
const OTHER_JOB = '5A000000-0000-4000-8000-000000000012';
const RUN = '5A000000-0000-4000-8000-000000000021';
const OTHER_RUN = '5A000000-0000-4000-8000-000000000022';

let store: GateTestStore;
let ctx: GateContext;

beforeEach(() => {
  store = new GateTestStore();
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  store.Insert('MJ: Scheduled Job Types', { ID: TYPE, Name: RegistryCheckInitiators.JobTypeName });
  store.Insert('MJ: Scheduled Job Types', { ID: OTHER_TYPE, Name: 'Predictive Studio Model Monitoring' });
  store.Insert('MJ: Scheduled Jobs', { ID: JOB, JobTypeID: TYPE });
  store.Insert('MJ: Scheduled Jobs', { ID: OTHER_JOB, JobTypeID: OTHER_TYPE });
  store.Insert('MJ: Scheduled Job Runs', { ID: RUN, ScheduledJobID: JOB });
  store.Insert('MJ: Scheduled Job Runs', { ID: OTHER_RUN, ScheduledJobID: OTHER_JOB });
});

describe('RegistryCheckInitiators.RefusalOf', () => {
  it('a run of a Registry Check job is admitted (null), whatever the ID\'s case', async () => {
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: RUN }, ctx)).toBeNull();
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: RUN.toLowerCase() }, ctx)).toBeNull();
  });

  it('any initiator that is not a scheduled job run is refused, naming its kind', async () => {
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'human', userId: GateWorld.User.ID }, ctx)).toBe('the initiator is a human, not a scheduled job run');
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'agent', agentRunId: RUN }, ctx)).toBe('the initiator is a agent, not a scheduled job run');
  });

  it('a run of another job type is refused, naming the type', async () => {
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: OTHER_RUN }, ctx)).toBe(`run ${OTHER_RUN} is a run of a 'Predictive Studio Model Monitoring' job`);
  });

  it('a missing run, job or job type refuses (fail closed), naming what is missing', async () => {
    const missing = '5A000000-0000-4000-8000-0000000000FF';
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: missing }, ctx)).toBe(`no Scheduled Job Run has the ID '${missing}'`);
    store.Insert('MJ: Scheduled Job Runs', { ID: '5A000000-0000-4000-8000-000000000023', ScheduledJobID: missing });
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: '5A000000-0000-4000-8000-000000000023' }, ctx)).toContain(`the job ${missing}`);
    store.Insert('MJ: Scheduled Jobs', { ID: '5A000000-0000-4000-8000-000000000013', JobTypeID: missing });
    store.Insert('MJ: Scheduled Job Runs', { ID: '5A000000-0000-4000-8000-000000000024', ScheduledJobID: '5A000000-0000-4000-8000-000000000013' });
    expect(await RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: '5A000000-0000-4000-8000-000000000024' }, ctx)).toContain(`the job type ${missing}`);
  });

  it('a failed read throws (a failed read is not an absent row)', async () => {
    store.ReadLog.FailNext('MJ: Scheduled Jobs');
    await expect(RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: RUN }, ctx)).rejects.toThrow('Reading MJ: Scheduled Jobs');
  });
});
