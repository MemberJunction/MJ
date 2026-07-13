import { describe, it, expect, vi, beforeEach } from 'vitest';

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
