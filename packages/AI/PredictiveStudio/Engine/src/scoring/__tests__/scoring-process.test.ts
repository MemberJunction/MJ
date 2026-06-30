import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

import {
  createScoringProcess,
  type CreateScoringProcessOptions,
} from '../scoring-process';

/**
 * Unit tests for the on-demand `createScoringProcess` helper (the "Operate this model"
 * flow). NO live DB — a fake provider supplies `EntityByName` (entity-id resolution)
 * and a captured-state `GetEntityObject` that returns an in-memory Record Process double
 * for `'MJ: Record Processes'` and an in-memory Scoring Binding double for
 * `'MJ: ML Model Scoring Bindings'` (the helper creates the binding through the
 * production `MetadataEntityFactory`, which calls `provider.GetEntityObject`). These
 * prove the helper assembles the correct ON-DEMAND `MJ: Record Processes` row (work
 * type, status, OnDemandEnabled=true, ScheduleEnabled=false, NO cron, Configuration,
 * OutputMapping, scope) AND — in write-back mode — upserts the lineage
 * `MJ: ML Model Scoring Bindings` row with `Mode='OnDemand'`; that generic mode omits
 * the OutputMapping + binding; that the whole-entity scope resolves to `(1=1)`; and
 * that its validation rejects missing inputs / a bad scope / an unknown entity.
 *
 * Mirrors `scheduling/__tests__/scheduled-model-scoring.test.ts`; the on-demand-only
 * assertions are the schedule-OFF + `Mode='OnDemand'` differences.
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
  public ScheduleEnabled = true; // seeded true so the helper's explicit false is observable
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
  public Mode: 'OnDemand' | 'Scheduled' | 'Materialized' = 'Scheduled';
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
  overrides: Partial<CreateScoringProcessOptions> = {},
  saveResult = true,
  completeMessage?: string,
  bindingSaveResult = true,
  bindingCompleteMessage?: string,
): { opts: CreateScoringProcessOptions; rp: FakeRecordProcess; binding: FakeScoringBinding } {
  const rp = new FakeRecordProcess(saveResult, completeMessage);
  const binding = new FakeScoringBinding(bindingSaveResult, bindingCompleteMessage);
  const provider = fakeProvider(ENTITY_NAME, ENTITY_ID, rp, binding);
  const opts: CreateScoringProcessOptions = {
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

// ----- createScoringProcess — happy path (on-demand row) -----------------------

describe('createScoringProcess — assembled on-demand Record Process', () => {
  it('sets Active status, ML Model work type, on-demand ON, schedule OFF, no cron, and resolves the entity id', async () => {
    const { opts, rp } = setup();
    const result = await createScoringProcess(opts);

    expect(result.recordProcess as unknown as FakeRecordProcess).toBe(rp);
    expect(rp.NewRecordCalled).toBe(true);
    expect(rp.SaveCalled).toBe(true);
    expect(rp.Status).toBe('Active');
    expect(rp.WorkType).toBe('ML Model');
    expect(rp.EntityID).toBe(ENTITY_ID);
    // On-demand: run-now enabled, schedule explicitly off, no cron.
    expect(rp.OnDemandEnabled).toBe(true);
    expect(rp.ScheduleEnabled).toBe(false);
    expect(rp.CronExpression).toBeNull();
  });

  it('writes Configuration with modelId + default ID primaryKeyField', async () => {
    const { opts, rp } = setup();
    await createScoringProcess(opts);
    expect(JSON.parse(rp.Configuration as string)).toEqual({ modelId: 'model-1', primaryKeyField: 'ID' });
  });

  it('honors a custom primaryKeyField in Configuration', async () => {
    const { opts, rp } = setup({ primaryKeyField: 'MembershipID' });
    await createScoringProcess(opts);
    expect(JSON.parse(rp.Configuration as string).primaryKeyField).toBe('MembershipID');
  });

  it('writes OutputMapping mapping the output field to $.score by default', async () => {
    const { opts, rp } = setup();
    await createScoringProcess(opts);
    expect(JSON.parse(rp.OutputMapping as string)).toEqual({ fields: { RenewalScore: '$.score' } });
  });

  it('writes OutputMapping mapping to $.class when valueKind=class', async () => {
    const { opts, rp } = setup({ valueKind: 'class', outputField: 'RenewalSegment' });
    await createScoringProcess(opts);
    expect(JSON.parse(rp.OutputMapping as string)).toEqual({ fields: { RenewalSegment: '$.class' } });
  });

  it('generates a descriptive default name (with the write-back column + On Demand) when none is supplied', async () => {
    const { opts, rp } = setup();
    await createScoringProcess(opts);
    expect(rp.Name).toBe('Score Memberships with model model-1 → RenewalScore (On Demand)');
  });

  it('uses a supplied name verbatim', async () => {
    const { opts, rp } = setup({ name: 'Renewal Scoring (manual)' });
    await createScoringProcess(opts);
    expect(rp.Name).toBe('Renewal Scoring (manual)');
  });
});

// ----- scoring binding (lineage) -----------------------------------------------

describe('createScoringProcess — scoring binding (lineage row)', () => {
  it('upserts a binding with the model, record-process, target-entity, target-column, and Mode=OnDemand', async () => {
    const { opts, rp, binding } = setup();
    const result = await createScoringProcess(opts);

    expect(binding.SaveCalled).toBe(true);
    expect(binding.MLModelID).toBe('model-1');
    expect(binding.RecordProcessID).toBe(rp.ID);
    expect(binding.TargetEntityID).toBe(ENTITY_ID);
    expect(binding.TargetColumn).toBe('RenewalScore');
    expect(binding.Mode).toBe('OnDemand');
    // The helper returns BOTH rows; the binding is the same double we captured.
    expect(result.binding as unknown as FakeScoringBinding).toBe(binding);
  });

  it('binds the resolved target entity id (not a re-resolved one) and the configured output field', async () => {
    const { opts, binding } = setup({ outputField: 'RenewalSegment' });
    await createScoringProcess(opts);
    expect(binding.TargetEntityID).toBe(ENTITY_ID);
    expect(binding.TargetColumn).toBe('RenewalSegment');
  });

  it('throws (and does not swallow) when the binding fails to save after the RP saved', async () => {
    // RP saves OK (true); the binding save fails (false) with a message.
    const { opts, rp, binding } = setup({}, true, undefined, false, 'binding duplicate key');
    await expect(createScoringProcess(opts)).rejects.toThrow(/binding duplicate key/);
    // The RP WAS saved (the failure is surfaced, not rolled back — no cross-row txn).
    expect(rp.SaveCalled).toBe(true);
    expect(binding.SaveCalled).toBe(true);
  });
});

// ----- generic output (no write-back column) -----------------------------------

describe('createScoringProcess — generic output (no outputField)', () => {
  it('omits OutputMapping and creates no binding (binding is null), keeping the RP otherwise intact', async () => {
    const { opts, rp, binding } = setup({ outputField: undefined });
    const result = await createScoringProcess(opts);

    // Generic mode: no write-back mapping, no lineage binding row.
    expect(rp.OutputMapping).toBeNull();
    expect(result.binding).toBeNull();
    expect(binding.SaveCalled).toBe(false);

    // The RP is still a correct on-demand ML Model scoring row.
    expect(rp.SaveCalled).toBe(true);
    expect(rp.WorkType).toBe('ML Model');
    expect(rp.Status).toBe('Active');
    expect(JSON.parse(rp.Configuration as string)).toEqual({ modelId: 'model-1', primaryKeyField: 'ID' });
    expect(rp.OnDemandEnabled).toBe(true);
    expect(rp.ScheduleEnabled).toBe(false);
    expect(rp.CronExpression).toBeNull();
    expect(rp.ScopeType).toBe('Filter');
    expect(rp.ScopeFilter).toBe("Status='Active'");
  });

  it('generates a column-free default name in generic mode', async () => {
    const { opts, rp } = setup({ outputField: undefined });
    await createScoringProcess(opts);
    expect(rp.Name).toBe('Score Memberships with model model-1 (On Demand)');
  });
});

// ----- scope mapping -----------------------------------------------------------

describe('createScoringProcess — scope → ScopeType', () => {
  it('maps a filter scope to ScopeType=Filter + ScopeFilter', async () => {
    const { opts, rp } = setup({ scope: { filter: 'RenewalDue=1' } });
    await createScoringProcess(opts);
    expect(rp.ScopeType).toBe('Filter');
    expect(rp.ScopeFilter).toBe('RenewalDue=1');
    expect(rp.ScopeViewID).toBeNull();
    expect(rp.ScopeListID).toBeNull();
  });

  it('maps a view scope to ScopeType=View + ScopeViewID', async () => {
    const { opts, rp } = setup({ scope: { viewId: 'view-42' } });
    await createScoringProcess(opts);
    expect(rp.ScopeType).toBe('View');
    expect(rp.ScopeViewID).toBe('view-42');
    expect(rp.ScopeFilter).toBeNull();
  });

  it('maps a list scope to ScopeType=List + ScopeListID', async () => {
    const { opts, rp } = setup({ scope: { listId: 'list-7' } });
    await createScoringProcess(opts);
    expect(rp.ScopeType).toBe('List');
    expect(rp.ScopeListID).toBe('list-7');
  });

  it('maps a whole-entity scope (all: true) to ScopeType=Filter + the all-rows predicate (1=1)', async () => {
    const { opts, rp } = setup({ scope: { all: true } });
    await createScoringProcess(opts);
    expect(rp.ScopeType).toBe('Filter');
    expect(rp.ScopeFilter).toBe('(1=1)');
    expect(rp.ScopeViewID).toBeNull();
    expect(rp.ScopeListID).toBeNull();
  });
});

// ----- validation --------------------------------------------------------------

describe('createScoringProcess — validation', () => {
  it('throws when modelId is missing', async () => {
    const { opts } = setup({ modelId: '' });
    await expect(createScoringProcess(opts)).rejects.toThrow(/`modelId` is required/);
  });

  it('throws when targetEntityName is missing', async () => {
    const { opts } = setup({ targetEntityName: '  ' });
    await expect(createScoringProcess(opts)).rejects.toThrow(/`targetEntityName` is required/);
  });

  it('does NOT throw when outputField is omitted (generic output is valid)', async () => {
    const { opts } = setup({ outputField: undefined });
    await expect(createScoringProcess(opts)).resolves.toMatchObject({ binding: null });
  });

  it('throws when no scope selector is populated', async () => {
    const { opts } = setup({ scope: {} });
    await expect(createScoringProcess(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when more than one scope selector is populated', async () => {
    const { opts } = setup({ scope: { filter: 'x=1', viewId: 'v1' } });
    await expect(createScoringProcess(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when two selectors are populated including all (all + filter)', async () => {
    const { opts } = setup({ scope: { all: true, filter: 'x=1' } });
    await expect(createScoringProcess(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when the target entity is unknown to metadata', async () => {
    const { opts } = setup({ targetEntityName: 'Ghosts' });
    await expect(createScoringProcess(opts)).rejects.toThrow(/'Ghosts' was not found in metadata/);
  });

  it('throws (with the save message) when the Record Process fails to save', async () => {
    const { opts } = setup({}, false, 'duplicate key');
    await expect(createScoringProcess(opts)).rejects.toThrow(/failed to save Record Process.*duplicate key/s);
  });
});
