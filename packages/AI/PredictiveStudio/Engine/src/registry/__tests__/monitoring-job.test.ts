/** `MonitoringJobs` (Task M3.2): one Pending job per published model; archiving disables only that model's jobs. */
import { describe, expect, it } from 'vitest';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { MonitoringJobs } from '../monitoring-job';

describe('MonitoringJobs.DisableForModel', () => {
  it("disables the model's Pending/Active/Paused monitoring jobs and nothing else", async () => {
    const store = new GateTestStore();
    store.Insert('MJ: Scheduled Job Types', { ID: GateWorld.JobTypeID, Name: MonitoringJobs.JOB_TYPE_NAME });
    const job = (id: string, modelId: string, status: string, type = GateWorld.JobTypeID) =>
      store.Insert('MJ: Scheduled Jobs', { ID: id, JobTypeID: type, Status: status, Configuration: JSON.stringify({ modelId }) });
    job('J1', 'm-1', 'Pending');
    job('J2', 'M-1', 'Active');
    job('J3', 'M-2', 'Pending');
    job('J4', 'M-1', 'Expired');
    job('J5', 'M-1', 'Pending', 'OTHER-TYPE');
    expect(await MonitoringJobs.DisableForModel('M-1', { ContextUser: GateWorld.User, Provider: store.Provider() })).toBe(2);
    expect(store.Tables['MJ: Scheduled Jobs'].map((j) => `${j['ID']}:${j['Status']}`)).toEqual(['J1:Disabled', 'J2:Disabled', 'J3:Pending', 'J4:Expired', 'J5:Pending']);
  });
  it('refuses when the monitoring job type is missing', async () => {
    const store = new GateTestStore();
    await expect(MonitoringJobs.DisableForModel('M-1', { ContextUser: GateWorld.User, Provider: store.Provider() })).rejects.toThrow("'Predictive Studio Model Monitoring' scheduled job type is missing");
  });
});
