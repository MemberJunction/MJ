import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  BaseEngine: class {
    protected async Load(_configs: unknown[], _provider?: unknown, _forceRefresh?: boolean, _contextUser?: unknown) {
      // no-op for tests
    }
    // Stubbed so the SchedulingEngineBase override can call super. The real base
    // reconciles cached arrays here; for these tests it's a no-op that returns true,
    // which lets us assert the subclass's post-super reconcile + notify behavior.
    protected async HandleIndividualBaseEntityEvent(_event: unknown): Promise<boolean> {
      return true;
    }
    // Stubbed no-op like HandleIndividualBaseEntityEvent above. The real base applies the
    // cache-event payload (or reloads) here; these tests assert only the subclass's
    // post-super re-filter + notify behavior.
    protected async OnExternalCacheChange(_config: unknown, _event: unknown): Promise<void> {
      // no-op for tests
    }
    static getInstance<T>(): T {
      return new (this as unknown as new () => T)();
    }
  },
  UserInfo: class {},
  IMetadataProvider: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJScheduledJobEntity: class {},
  MJScheduledJobTypeEntity: class {},
  MJScheduledJobRunEntity: class {},
}));

import { SchedulingEngineBase } from '../SchedulingEngineBase';

describe('SchedulingEngineBase', () => {
  let engine: SchedulingEngineBase;

  beforeEach(() => {
    engine = new SchedulingEngineBase();
  });

  describe('initial state', () => {
    it('should have empty arrays for all metadata collections', () => {
      expect(engine.ScheduledJobTypes).toEqual([]);
      expect(engine.ScheduledJobs).toEqual([]);
      expect(engine.ScheduledJobRuns).toEqual([]);
    });

    it('should have default polling interval of 10 seconds', () => {
      expect(engine.ActivePollingInterval).toBe(10000);
    });
  });

  describe('GetJobTypeByName', () => {
    it('should return undefined when no job types loaded', () => {
      expect(engine.GetJobTypeByName('Agent')).toBeUndefined();
    });
  });

  describe('GetJobTypeByDriverClass', () => {
    it('should return undefined when no job types loaded', () => {
      expect(engine.GetJobTypeByDriverClass('AgentDriver')).toBeUndefined();
    });
  });

  describe('GetJobsByType', () => {
    it('should return empty array when no jobs loaded', () => {
      expect(engine.GetJobsByType('type-id')).toEqual([]);
    });
  });

  describe('GetRunsForJob', () => {
    it('should return empty array when no runs loaded', () => {
      expect(engine.GetRunsForJob('job-id')).toEqual([]);
    });
  });

  describe('UpdatePollingInterval', () => {
    it('should set interval to null when no jobs', () => {
      // ScheduledJobs starts empty
      engine.UpdatePollingInterval();
      expect(engine.ActivePollingInterval).toBeNull();
    });

    describe('with string-dated jobs (poisoned cache)', () => {
      // NextRunAt is declared Date but can hold a raw ISO string once a serialized cache
      // payload has replaced the engine's rows. Pre-fix, `job.NextRunAt.getTime()` threw
      // here; the interval math must survive both shapes.
      type Internals = { _scheduledJobs: Array<{ ID: string; Status: string; NextRunAt: unknown }> };
      const seed = (jobs: Internals['_scheduledJobs']) => {
        (engine as unknown as Internals)._scheduledJobs = jobs;
      };

      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('computes the interval from a string NextRunAt instead of throwing', () => {
        seed([{ ID: 'a', Status: 'Active', NextRunAt: '2026-08-13T12:03:20.000Z' }]); // 200s out
        expect(() => engine.UpdatePollingInterval()).not.toThrow();
        expect(engine.ActivePollingInterval).toBe(100000); // half of 200s
      });

      it('picks the minimum across mixed Date and string NextRunAt values', () => {
        seed([
          { ID: 'string-far', Status: 'Active', NextRunAt: '2026-08-13T12:03:20.000Z' },
          { ID: 'date-near', Status: 'Active', NextRunAt: new Date('2026-08-13T12:01:00.000Z') }, // 60s out
        ]);
        engine.UpdatePollingInterval();
        expect(engine.ActivePollingInterval).toBe(30000); // half of the nearer 60s
      });
    });
  });

  describe('OnExternalCacheChange (cross-server cache event re-filter)', () => {
    // A cross-server cache event's payload is the UNFILTERED table (the config has no
    // Filter), and the base handler assigns it wholesale — so the subclass must restore
    // the Active-only invariant afterwards, exactly as it does for entity events. Pre-fix,
    // dispatch on this instance would then walk Disabled/Paused/Pending jobs.
    type EngineInternals = {
      _scheduledJobs: Array<{ ID: string; Status: string }>;
      OnExternalCacheChange: (config: unknown, event: unknown) => Promise<void>;
    };
    const asInternals = (e: SchedulingEngineBase) => e as unknown as EngineInternals;

    it('re-applies the Active-only filter and emits JobsChanged$ for the Scheduled Jobs config', async () => {
      const internals = asInternals(engine);
      internals._scheduledJobs = [
        { ID: 'a', Status: 'Active' },
        { ID: 'b', Status: 'Disabled' },
      ];

      let fired = 0;
      const sub = engine.JobsChanged$.subscribe(() => fired++);

      await internals.OnExternalCacheChange(
        { EntityName: 'MJ: Scheduled Jobs', PropertyName: '_scheduledJobs' },
        { Action: 'set' }
      );

      expect(fired).toBe(1);
      expect(engine.ScheduledJobs).toEqual([{ ID: 'a', Status: 'Active' }]);
      sub.unsubscribe();
    });

    it('leaves other configs alone (no filter, no notify)', async () => {
      const internals = asInternals(engine);
      internals._scheduledJobs = [
        { ID: 'a', Status: 'Active' },
        { ID: 'b', Status: 'Disabled' },
      ];

      let fired = 0;
      const sub = engine.JobsChanged$.subscribe(() => fired++);

      await internals.OnExternalCacheChange(
        { EntityName: 'MJ: Scheduled Job Types', PropertyName: '_scheduledJobTypes' },
        { Action: 'set' }
      );

      expect(fired).toBe(0);
      expect(engine.ScheduledJobs).toHaveLength(2);
      sub.unsubscribe();
    });
  });

  describe('HandleIndividualBaseEntityEvent (scheduled-jobs reconcile + notify)', () => {
    // Reach the private array and the protected handler without `any`.
    type EngineInternals = {
      _scheduledJobs: Array<{ ID: string; Status: string }>;
      HandleIndividualBaseEntityEvent: (event: unknown) => Promise<boolean>;
    };
    const asInternals = (e: SchedulingEngineBase) => e as unknown as EngineInternals;

    const scheduledJobsEvent = (type: string) => ({
      type,
      baseEntity: { EntityInfo: { Name: 'MJ: Scheduled Jobs' } },
    });

    it('re-applies the Active-only filter and emits JobsChanged$ on a Scheduled Jobs save', async () => {
      const internals = asInternals(engine);
      // Seed a set polluted with an inactive job (as the base's immediate-mutation
      // path would leave it after an activation/deactivation).
      internals._scheduledJobs = [
        { ID: 'a', Status: 'Active' },
        { ID: 'b', Status: 'Inactive' },
      ];

      let fired = 0;
      const sub = engine.JobsChanged$.subscribe(() => fired++);

      await internals.HandleIndividualBaseEntityEvent(scheduledJobsEvent('save'));

      expect(fired).toBe(1);
      expect(engine.ScheduledJobs).toEqual([{ ID: 'a', Status: 'Active' }]);
      sub.unsubscribe();
    });

    it('resolves the entity name from the remote-invalidate event shape', async () => {
      const internals = asInternals(engine);
      internals._scheduledJobs = [{ ID: 'a', Status: 'Active' }];

      let fired = 0;
      const sub = engine.JobsChanged$.subscribe(() => fired++);

      // remote-invalidate events carry `entityName` (a string), not `baseEntity`.
      await internals.HandleIndividualBaseEntityEvent({ type: 'remote-invalidate', entityName: 'MJ: Scheduled Jobs' });

      expect(fired).toBe(1);
      sub.unsubscribe();
    });

    it('ignores events for unrelated entities (no filter, no notify)', async () => {
      const internals = asInternals(engine);
      internals._scheduledJobs = [
        { ID: 'a', Status: 'Active' },
        { ID: 'b', Status: 'Inactive' },
      ];

      let fired = 0;
      const sub = engine.JobsChanged$.subscribe(() => fired++);

      await internals.HandleIndividualBaseEntityEvent({
        type: 'save',
        baseEntity: { EntityInfo: { Name: 'MJ: AI Agents' } },
      });

      expect(fired).toBe(0);
      // Untouched — the reconcile only runs for scheduled-jobs events.
      expect(engine.ScheduledJobs.length).toBe(2);
      sub.unsubscribe();
    });
  });
});
