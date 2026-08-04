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
 * `GetEntityObject` that returns an in-memory Record Process double for
 * `'MJ: Record Processes'` and an in-memory Scoring Binding double for
 * `'MJ: ML Model Scoring Bindings'` (the helper creates the binding through the
 * production `MetadataEntityFactory`, which calls `provider.GetEntityObject`). These
 * prove the helper assembles the correct scheduled `MJ: Record Processes` row (work
 * type, status, schedule, cron-per-cadence, Configuration, OutputMapping, scope) AND
 * upserts the lineage `MJ: ML Model Scoring Bindings` row (model / record-process /
 * target-entity / target-column / Mode='Scheduled'), and that its validation rejects
 * missing inputs / a bad scope / an unknown entity.
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

/**
 * An in-memory MJ: ML Model Scoring Bindings double capturing the lineage fields the
 * helper upserts (model / record-process / target-entity / target-column / mode) plus
 * a freshly-assigned ID, so the helper's returned binding has a stable identity.
 */
class FakeScoringBinding {
  public ID = 'binding-1';
  public MLModelID = '';
  public RecordProcessID: string | null = null;
  public TargetEntityID: string | null = null;
  public TargetColumn: string | null = null;
  public Mode: 'OnDemand' | 'Scheduled' | 'Materialized' = 'OnDemand';
  public LastScoredAt: Date | null = null;
  public LastRowCount: number | null = null;
  public SaveCalled = false;

  public constructor(
    private readonly saveResult: boolean,
    private readonly completeMessage?: string,
  ) {}

  public async Load(): Promise<boolean> {
    return true;
  }
  public async Save(): Promise<boolean> {
    this.SaveCalled = true;
    return this.saveResult;
  }
  public get LatestResult(): { CompleteMessage?: string } | undefined {
    return this.saveResult ? undefined : { CompleteMessage: this.completeMessage };
  }
}

/**
 * Build a fake provider that resolves the named target entity to an id and dispatches
 * `GetEntityObject` by entity name: the RP double for `'MJ: Record Processes'` and the
 * binding double for `'MJ: ML Model Scoring Bindings'` (the binding entity the helper's
 * `MetadataEntityFactory` creates). Throws on any other entity so a wrong name surfaces.
 */
function fakeProvider(
  entityName: string,
  entityId: string,
  rp: FakeRecordProcess,
  binding: FakeScoringBinding,
): IMetadataProvider {
  return {
    EntityByName(n: string) {
      return n.trim().toLowerCase() === entityName.trim().toLowerCase()
        ? { ID: entityId, Name: entityName }
        : undefined;
    },
    async GetEntityObject(name: string) {
      if (name === 'MJ: Record Processes') return rp;
      if (name === 'MJ: ML Model Scoring Bindings') return binding;
      throw new Error(`unexpected GetEntityObject('${name}')`);
    },
  } as unknown as IMetadataProvider;
}

const USER = { ID: 'test-user' } as unknown as UserInfo;
const ENTITY_NAME = 'Memberships';
const ENTITY_ID = 'ENT-MEMBERSHIPS';

/**
 * Minimal valid options (filter scope) + a freshly-saved RP double + the scoring
 * binding double + their provider. `saveResult` / `completeMessage` drive the RP save;
 * `bindingSaveResult` (default success) drives the binding save so a test can exercise
 * the "RP saved but binding failed" path independently.
 */
function setup(
  overrides: Partial<ScheduleModelScoringOptions> = {},
  saveResult = true,
  completeMessage?: string,
  bindingSaveResult = true,
  bindingCompleteMessage?: string,
): { opts: ScheduleModelScoringOptions; rp: FakeRecordProcess; binding: FakeScoringBinding } {
  const rp = new FakeRecordProcess(saveResult, completeMessage);
  const binding = new FakeScoringBinding(bindingSaveResult, bindingCompleteMessage);
  const provider = fakeProvider(ENTITY_NAME, ENTITY_ID, rp, binding);
  const opts: ScheduleModelScoringOptions = {
    modelId: 'model-1',
    targetEntityName: ENTITY_NAME,
    outputField: 'RenewalScore',
    scope: { filter: "Status='Active'" },
    contextUser: USER,
    provider,
    ...overrides,
  };
  return { opts, rp, binding };
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
    const result = await createScheduledModelScoring(opts);

    expect(result.recordProcess as unknown as FakeRecordProcess).toBe(rp);
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

  it('generates a descriptive default name (with the write-back column) when none is supplied', async () => {
    const { opts, rp } = setup();
    await createScheduledModelScoring(opts);
    expect(rp.Name).toBe('Score Memberships with model model-1 → RenewalScore (Monthly)');
  });

  it('uses a supplied name verbatim', async () => {
    const { opts, rp } = setup({ name: 'Monthly Renewal Scoring' });
    await createScheduledModelScoring(opts);
    expect(rp.Name).toBe('Monthly Renewal Scoring');
  });
});

// ----- scoring binding (lineage) -----------------------------------------------

describe('createScheduledModelScoring — scoring binding (lineage row)', () => {
  it('upserts a binding with the model, record-process, target-entity, target-column, and Mode=Scheduled', async () => {
    const { opts, rp, binding } = setup();
    const result = await createScheduledModelScoring(opts);

    expect(binding.SaveCalled).toBe(true);
    expect(binding.MLModelID).toBe('model-1');
    expect(binding.RecordProcessID).toBe(rp.ID);
    expect(binding.TargetEntityID).toBe(ENTITY_ID);
    expect(binding.TargetColumn).toBe('RenewalScore');
    expect(binding.Mode).toBe('Scheduled');
    // The helper returns BOTH rows; the binding is the same double we captured.
    expect(result.binding as unknown as FakeScoringBinding).toBe(binding);
  });

  it('binds the resolved target entity id (not a re-resolved one) and the configured output field', async () => {
    const { opts, binding } = setup({ outputField: 'RenewalSegment' });
    await createScheduledModelScoring(opts);
    expect(binding.TargetEntityID).toBe(ENTITY_ID);
    expect(binding.TargetColumn).toBe('RenewalSegment');
  });

  it('throws (and does not swallow) when the binding fails to save after the RP saved', async () => {
    // RP saves OK (true); the binding save fails (false) with a message.
    const { opts, rp, binding } = setup({}, true, undefined, false, 'binding duplicate key');
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/binding duplicate key/);
    // The RP WAS saved (the failure is surfaced, not rolled back — no cross-row txn).
    expect(rp.SaveCalled).toBe(true);
    expect(binding.SaveCalled).toBe(true);
  });
});

// ----- generic output (no write-back column) -----------------------------------

describe('createScheduledModelScoring — generic output (no outputField)', () => {
  it('omits OutputMapping and creates no binding (binding is null), keeping the RP otherwise intact', async () => {
    const { opts, rp, binding } = setup({ outputField: undefined });
    const result = await createScheduledModelScoring(opts);

    // Generic mode: no write-back mapping, no lineage binding row.
    expect(rp.OutputMapping).toBeNull();
    expect(result.binding).toBeNull();
    expect(binding.SaveCalled).toBe(false);

    // The RP is still a correct scheduled ML Model scoring row.
    expect(rp.SaveCalled).toBe(true);
    expect(rp.WorkType).toBe('ML Model');
    expect(rp.Status).toBe('Active');
    expect(JSON.parse(rp.Configuration as string)).toEqual({ modelId: 'model-1', primaryKeyField: 'ID' });
    expect(rp.CronExpression).toBe('0 0 1 * *');
    expect(rp.ScheduleEnabled).toBe(true);
    expect(rp.OnDemandEnabled).toBe(true);
    expect(rp.ScopeType).toBe('Filter');
    expect(rp.ScopeFilter).toBe("Status='Active'");
  });

  it('generates a column-free default name in generic mode', async () => {
    const { opts, rp } = setup({ outputField: undefined });
    await createScheduledModelScoring(opts);
    expect(rp.Name).toBe('Score Memberships with model model-1 (Monthly)');
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

  it('maps a whole-entity scope (all: true) to ScopeType=Filter + the all-rows predicate (1=1)', async () => {
    const { opts, rp } = setup({ scope: { all: true } });
    await createScheduledModelScoring(opts);
    expect(rp.ScopeType).toBe('Filter');
    expect(rp.ScopeFilter).toBe('(1=1)');
    expect(rp.ScopeViewID).toBeNull();
    expect(rp.ScopeListID).toBeNull();
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

  it('does NOT throw when outputField is omitted (generic output is valid)', async () => {
    const { opts } = setup({ outputField: undefined });
    await expect(createScheduledModelScoring(opts)).resolves.toMatchObject({ binding: null });
  });

  it('throws when no scope selector is populated', async () => {
    const { opts } = setup({ scope: {} });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when more than one scope selector is populated', async () => {
    const { opts } = setup({ scope: { filter: "x=1", viewId: 'v1' } });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when two selectors are populated including all (all + filter)', async () => {
    const { opts } = setup({ scope: { all: true, filter: "x=1" } });
    await expect(createScheduledModelScoring(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
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
