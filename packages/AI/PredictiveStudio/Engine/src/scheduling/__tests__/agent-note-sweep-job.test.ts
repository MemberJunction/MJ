/**
 * A5 — the hourly agent note sweep job: its driver (registered with `BaseScheduledJob`, the sweep's counts in the run's
 * `Details`), and its shipped metadata (one Active hourly job of a type naming the driver).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { PredictiveStudioAgentNotePolicy } from '../../agent/agent-note-policy';
import { PredictiveStudioAgentNoteSweepJobDriver } from '../agent-note-sweep-job';

const REPO = resolve(__dirname, '../../../../../../..');
const provider = { EntityByName: () => undefined, Entities: [] } as unknown as IMetadataProvider;
const user = { ID: 'E4000000-0000-4000-8000-000000000001', Name: 'System' } as unknown as UserInfo;
const context = { Provider: provider, ContextUser: user, Schedule: { Name: 'Predictive Studio Agent Note Sweep' }, Run: { StartedAt: new Date() } } as unknown as ScheduledJobExecutionContext;

afterEach(() => vi.restoreAllMocks());

interface SyncRecord { readonly fields: Record<string, string | boolean | null | Record<string, string>>; readonly primaryKey: { readonly ID: string } }
function records(path: string): SyncRecord[] {
  return JSON.parse(readFileSync(resolve(REPO, path), 'utf8')) as SyncRecord[];
}

describe('PredictiveStudioAgentNoteSweepJobDriver', () => {
  it('is the class factory registration for BaseScheduledJob under its DriverClass', () => {
    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseScheduledJob, 'PredictiveStudioAgentNoteSweepJobDriver');
    expect(reg?.SubClass).toBe(PredictiveStudioAgentNoteSweepJobDriver);
  });

  it("runs the policy's sweep as the job's user on the job's provider and writes its counts to Details", async () => {
    const sweep = vi.spyOn(PredictiveStudioAgentNotePolicy, 'Sweep').mockResolvedValue({ Activated: 2, Archived: 3, Failed: [] });
    const result = await new PredictiveStudioAgentNoteSweepJobDriver().Execute(context);
    expect(sweep).toHaveBeenCalledWith(provider, user);
    expect(result).toEqual({ Success: true, ErrorMessage: undefined, Details: { Activated: 2, Archived: 3, Failed: [] } });
  });

  it('a failed note save fails the run with every failure in Details; the others still count', async () => {
    vi.spyOn(PredictiveStudioAgentNotePolicy, 'Sweep').mockResolvedValue({ Activated: 1, Archived: 0, Failed: ['N1: refused'] });
    const result = await new PredictiveStudioAgentNoteSweepJobDriver().Execute(context);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBe('1 note save(s) failed');
    expect(result.Details).toEqual({ Activated: 1, Archived: 0, Failed: ['N1: refused'] });
  });

  it('a failed read fails the run with the message', async () => {
    vi.spyOn(PredictiveStudioAgentNotePolicy, 'Sweep').mockRejectedValue(new Error('Reading MJ: AI Agent Notes failed: boom'));
    expect(await new PredictiveStudioAgentNoteSweepJobDriver().Execute(context)).toEqual({ Success: false, ErrorMessage: 'Agent note sweep failed: Reading MJ: AI Agent Notes failed: boom' });
  });
});

describe('the shipped job metadata', () => {
  const types = records('metadata/scheduled-job-types/.predictive-studio-agent-note-sweep-type.json');
  const jobs = records('metadata/scheduled-jobs/.predictive-studio-agent-note-sweep-job.json');

  it('one job type naming the driver', () => {
    expect(types).toHaveLength(1);
    expect(types[0].fields.DriverClass).toBe('PredictiveStudioAgentNoteSweepJobDriver');
    expect(types[0].primaryKey.ID).toMatch(/^[0-9A-F-]{36}$/);
  });

  it('one Active hourly job of that type, in UTC, skipping an overlapping run', () => {
    expect(jobs).toHaveLength(1);
    const f = jobs[0].fields;
    expect(f.JobTypeID).toBe('@lookup:MJ: Scheduled Job Types.DriverClass=PredictiveStudioAgentNoteSweepJobDriver');
    expect(f.Status).toBe('Active');
    expect(f.Timezone).toBe('UTC');
    expect(f.ConcurrencyMode).toBe('Skip');
    expect(String(f.CronExpression)).toMatch(/^0 \d{1,2} \* \* \* \*$/);
  });
});
