import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';

import {
  createScheduledModelScoring,
  cadenceToCron,
  CADENCE_CRON,
  type ScheduleModelScoringOptions,
} from '../scheduled-model-scoring';

/**
 * Unit tests for the PS2-6 scheduled-model-scoring helper. NO live DB — a fake
 * provider supplies `EntityByName` (entity-id resolution) and a captured-state
 * `GetEntityObject` returning an in-memory Record Process double. These prove the
 * helper assembles the correct scheduled `MJ: Record Processes` row (work type,
 * status, schedule, cron-per-cadence, Configuration, OutputMapping, scope) and that
 * its validation rejects missing inputs / a bad scope / an unknown entity.
 */

/** An in-memory MJ: Record Processes double capturing the fields the helper sets. */
class FakeRecordProcess {
  // Strongly-typed columns the helper sets directly.
  public Name = '';
  public EntityID = '';
  public Status: 'Active' | 'Disabled' | 'Draft' = 'Draft';
  public ScopeType: 'Filter' | 'List' | 'SingleRecord' | 'View' | null = null;
  public ScopeViewID: string | null = null;
  public ScopeListID: string | null = null;
  public ScopeFilter: string | null = null;
  public Configuration: string | null = null;
  public OutputMapping: string | null = null;
  public ScheduleEnabled = false;
  public CronExpression: string | null = null;
  public Timezone: string | null = null;
  public OnDemandEnabled = false;

  // The runtime-registered 'ML Model' work type goes through Set() (closed union).
  private dynamic: Record<string, unknown> = {};
  public NewRecordCalled = false;
  public SaveCalled = false;

  public constructor(
    private readonly saveResult: boolean,
    private readonly completeMessage?: string,
  ) {}

  public NewRecord(): boolean {
    this.NewRecordCalled = true;
    return true;
  }
  public Set(field: string, value: unknown): void {
    this.dynamic[field] = value;
  }
  public Get(field: string): unknown {
    return this.dynamic[field];
  }
  public get WorkType(): unknown {
    return this.dynamic['WorkType'];
  }
  public async Save(): Promise<boolean> {
    this.SaveCalled = true;
    return this.saveResult;
  }
  public get LatestResult(): { CompleteMessage?: string } | undefined {
    return this.saveResult ? undefined : { CompleteMessage: this.completeMessage };
  }
}

/** Build a fake provider that resolves the named entity to an id and hands back the RP double. */
function fakeProvider(
  entityName: string,
  entityId: string,
  rp: FakeRecordProcess,
): IMetadataProvider {
  return {
    EntityByName(n: string) {
      return n.trim().toLowerCase() === entityName.trim().toLowerCase()
        ? { ID: entityId, Name: entityName }
        : undefined;
    },
    async GetEntityObject() {
      return rp;
    },
  } as unknown as IMetadataProvider;
}

const USER = { ID: 'test-user' } as unknown as UserInfo;
const ENTITY_NAME = 'Memberships';
const ENTITY_ID = 'ENT-MEMBERSHIPS';

/** Minimal valid options (filter scope) + a freshly-saved RP double + its provider. */
function setup(
  overrides: Partial<ScheduleModelScoringOptions> = {},
  saveResult = true,
  completeMessage?: string,
): { opts: ScheduleModelScoringOptions; rp: FakeRecordProcess } {
  const rp = new FakeRecordProcess(saveResult, completeMessage);
  const provider = fakeProvider(ENTITY_NAME, ENTITY_ID, rp);
  const opts: ScheduleModelScoringOptions = {
    modelId: 'model-1',
    targetEntityName: ENTITY_NAME,
    outputField: 'RenewalScore',
    scope: { filter: "Status='Active'" },
    contextUser: USER,
    provider,
    ...overrides,
  };
  return { opts, rp };
}

// ----- cadenceToCron (pure) ----------------------------------------------------

describe('cadenceToCron', () => {
  it('defaults to Monthly (0 0 1 * *) when undefined', () => {
    expect(cadenceToCron(undefined)).toBe('0 0 1 * *');
    expect(CADENCE_CRON.Monthly).toBe('0 0 1 * *');
  });
  it('maps the named cadences', () => {
    expect(cadenceToCron('Monthly')).toBe('0 0 1 * *');
    expect(cadenceToCron('Weekly')).toBe('0 0 * * 0');
    expect(cadenceToCron('Daily')).toBe('0 0 * * *');
  });
  it('passes an explicit cron through (trimmed)', () => {
    expect(cadenceToCron({ cron: '  15 3 * * 1  ' })).toBe('15 3 * * 1');
  });
  it('throws on an explicit cadence with an empty cron', () => {
    expect(() => cadenceToCron({ cron: '   ' })).toThrow(/non-empty `cron`/);
  });
});

// ----- createScheduledModelScoring — happy path --------------------------------

describe('createScheduledModelScoring — assembled Record Process', () => {
  it('sets Active status, ML Model work type, schedule, and resolves the entity id', async () => {
    const { opts, rp } = setup();
    const saved = (await createScheduledModelScoring(opts)) as unknown as FakeRecordProcess;

    expect(saved).toBe(rp);
    expect(rp.NewRecordCalled).toBe(true);
    expect(rp.SaveCalled).toBe(true);
    expect(rp.Status).toBe('Active');
    expect(rp.WorkType).toBe('ML Model');
    expect(rp.EntityID).toBe(ENTITY_ID);
    expect(rp.ScheduleEnabled).toBe(true);
    expect(rp.OnDemandEnabled).toBe(true);
    expect(rp.Timezone).toBe('UTC');
  });

  it('defaults the cadence to Monthly cron (0 0 1 * *)', async () => {
    const { opts, rp } = setup();
    await createScheduledModelScoring(opts);
    expect(rp.CronExpression).toBe('0 0 1 * *');
  });

  it('honors an explicit cron cadence', async () => {
    const { opts, rp } = setup({ cadence: { cron: '30 2 * * 5' } });
    await createScheduledModelScoring(opts);
    expect(rp.CronExpression).toBe('30 2 * * 5');
  });

  it.each([
    ['Weekly', '0 0 * * 0'],
    ['Daily', '0 0 * * *'],
  ] as const)('maps the %s cadence to %s', async (cadence, cron) => {
    const { opts, rp } = setup({ cadence });
    await createScheduledModelScoring(opts);
    expect(rp.CronExpression).toBe(cron);
  });

  it('writes Configuration with modelId + default ID primaryKeyField', async () => {
    const { opts, rp } = setup();
    await createScheduledModelScoring(opts);
    expect(JSON.parse(rp.Configuration as string)).toEqual({ modelId: 'model-1', primaryKeyField: 'ID' });
  });

  it('honors a custom primaryKeyField in Configuration', async () => {
    const { opts, rp } = setup({ primaryKeyField: 'MembershipID' });
    await createScheduledModelScoring(opts);
    expect(JSON.parse(rp.Configuration as string).primaryKeyField).toBe('MembershipID');
  });

  it('writes OutputMapping mapping the output field to $.score by default', async () => {
    const { opts, rp } = setup();
    await createScheduledModelScoring(opts);
    expect(JSON.parse(rp.OutputMapping as string)).toEqual({ fields: { RenewalScore: '$.score' } });
  });

  it('writes OutputMapping mapping to $.class when valueKind=class', async () => {
    const { opts, rp } = setup({ valueKind: 'class', outputField: 'RenewalSegment' });
    await createScheduledModelScoring(opts);
    expect(JSON.parse(rp.OutputMapping as string)).toEqual({ fields: { RenewalSegment: '$.class' } });
  });

  it('generates a descriptive default name when none is supplied', async () => {
    const { opts, rp } = setup();
    await createScheduledModelScoring(opts);
    expect(rp.Name).toBe('Score Memberships with model model-1 (Monthly)');
  });

  it('uses a supplied name verbatim', async () => {
    const { opts, rp } = setup({ name: 'Monthly Renewal Scoring' });
    await createScheduledModelScoring(opts);
    expect(rp.Name).toBe('Monthly Renewal Scoring');
  });
});

// ----- scope mapping -----------------------------------------------------------

describe('createScheduledModelScoring — scope → ScopeType', () => {
  it('maps a filter scope to ScopeType=Filter + ScopeFilter', async () => {
    const { opts, rp } = setup({ scope: { filter: "RenewalDue=1" } });
    await createScheduledModelScoring(opts);
    expect(rp.ScopeType).toBe('Filter');
    expect(rp.ScopeFilter).toBe('RenewalDue=1');
    expect(rp.ScopeViewID).toBeNull();
    expect(rp.ScopeListID).toBeNull();
  });

  it('maps a view scope to ScopeType=View + ScopeViewID', async () => {
    const { opts, rp } = setup({ scope: { viewId: 'view-42' } });
    await createScheduledModelScoring(opts);
    expect(rp.ScopeType).toBe('View');
    expect(rp.ScopeViewID).toBe('view-42');
    expect(rp.ScopeFilter).toBeNull();
  });

  it('maps a list scope to ScopeType=List + ScopeListID', async () => {
    const { opts, rp } = setup({ scope: { listId: 'list-7' } });
    await createScheduledModelScoring(opts);
    expect(rp.ScopeType).toBe('List');
    expect(rp.ScopeListID).toBe('list-7');
  });
});

// ----- validation --------------------------------------------------------------

describe('createScheduledModelScoring — validation', () => {
  it('throws when modelId is missing', async () => {
    const { opts } = setup({ modelId: '' });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/`modelId` is required/);
  });

  it('throws when targetEntityName is missing', async () => {
    const { opts } = setup({ targetEntityName: '  ' });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/`targetEntityName` is required/);
  });

  it('throws when outputField is missing', async () => {
    const { opts } = setup({ outputField: '' });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/`outputField` is required/);
  });

  it('throws when no scope selector is populated', async () => {
    const { opts } = setup({ scope: {} });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId/);
  });

  it('throws when more than one scope selector is populated', async () => {
    const { opts } = setup({ scope: { filter: "x=1", viewId: 'v1' } });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId/);
  });

  it('throws when the target entity is unknown to metadata', async () => {
    const { opts } = setup({ targetEntityName: 'Ghosts' });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/'Ghosts' was not found in metadata/);
  });

  it('throws (with the save message) when the Record Process fails to save', async () => {
    const { opts } = setup({}, false, 'duplicate key');
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/failed to save Record Process.*duplicate key/s);
  });
});
