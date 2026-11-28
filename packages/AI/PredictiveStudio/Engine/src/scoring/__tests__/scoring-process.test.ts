import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';

import { BindingWithdrawnError, type ScoringBindingMode } from '../scoring-binding';
import {
  CreateScoringProcess,
  type CreateScoringProcessOptions,
} from '../scoring-process';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

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
  /** The id the saved Record Process carries; the helper copies it onto the scoring binding. */
  public ID = 'rp-1';
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
  public MLTrainingPipelineID = '';
  public FeatureName = '';
  public ViewAuthorizationID: string | null = null;
  public RecordProcessID: string | null = null;
  public TargetEntityID: string | null = null;
  public TargetColumn: string | null = null;
  public TargetColumnSource: string | null = null;
  public Status: MJMLModelScoringBindingEntity['Status'] = 'Active';
  public Mode: ScoringBindingMode = 'Scheduled';
  public LoadedId: string | null = null;
  public SaveCalled = false;

  public constructor(
    private readonly saveResult: boolean,
    private readonly completeMessage?: string,
  ) {}

  public NewRecord(): boolean {
    return true;
  }
  public async Load(id: string): Promise<boolean> {
    this.LoadedId = id;
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

/** A provider transaction double: records whether the helper committed or rolled back. */
class FakeTransaction {
  public Committed = false;
  public RolledBack = false;
  public async Commit(): Promise<void> {
    this.Committed = true;
  }
  public async Rollback(): Promise<void> {
    this.RolledBack = true;
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
  existingBindings: ReadonlyArray<{ ID: string; MLTrainingPipelineID: string }> = [],
  transaction: FakeTransaction = new FakeTransaction(),
): IMetadataProvider {
  return {
    SupportsEntityTransactions: true,
    async BeginEntityTransaction() {
      return transaction;
    },
    Authorizations: [{ ID: SEEDED_AUTHORIZATION_ID, Name: 'View Model Predictions' }],
    async RunView(params: RunViewParams) {
      if (params.EntityName === 'MJ: ML Models') return { Success: true, Results: [MODEL_ROW], ErrorMessage: '' };
      if (params.EntityName === 'MJ: ML Model Scoring Bindings') return { Success: true, Results: [...existingBindings], ErrorMessage: '' };
      throw new Error(`unexpected RunView('${params.EntityName}')`);
    },
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
const SEEDED_AUTHORIZATION_ID = 'auth-view-model-predictions';
/** The model the helper binds: pipeline `pipe-1` ("Renewal"), a classification. */
const MODEL_ROW = { ID: 'model-1', PipelineID: 'pipe-1', Pipeline: 'Renewal', ProblemType: 'classification' };
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
  existingBindings: ReadonlyArray<{ ID: string; MLTrainingPipelineID: string }> = [],
): { opts: CreateScoringProcessOptions; rp: FakeRecordProcess; binding: FakeScoringBinding; transaction: FakeTransaction } {
  const rp = new FakeRecordProcess(saveResult, completeMessage);
  const binding = new FakeScoringBinding(bindingSaveResult, bindingCompleteMessage);
  const transaction = new FakeTransaction();
  const provider = fakeProvider(ENTITY_NAME, ENTITY_ID, rp, binding, existingBindings, transaction);
  const opts: CreateScoringProcessOptions = {
    modelId: 'model-1',
    targetEntityName: ENTITY_NAME,
    outputField: 'RenewalScore',
    scope: { filter: "Status='Active'" },
    contextUser: USER,
    provider,
    ...overrides,
  };
  return { opts, rp, binding, transaction };
}

// ----- createScoringProcess — happy path (on-demand row) -----------------------

describe('createScoringProcess — assembled on-demand Record Process', () => {
  it('sets Active status, ML Model work type, on-demand ON, schedule OFF, no cron, and resolves the entity id', async () => {
    const { opts, rp } = setup();
    const result = await CreateScoringProcess(opts);

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
    await CreateScoringProcess(opts);
    expect(JSON.parse(rp.Configuration as string)).toEqual({ modelId: 'model-1', primaryKeyField: 'ID' });
  });

  it('honors a custom primaryKeyField in Configuration', async () => {
    const { opts, rp } = setup({ primaryKeyField: 'MembershipID' });
    await CreateScoringProcess(opts);
    expect(JSON.parse(rp.Configuration as string).primaryKeyField).toBe('MembershipID');
  });

  it('writes no OutputMapping in write-back mode: the binding names the column and its copy source (the score by default)', async () => {
    const { opts, rp, binding } = setup();
    await CreateScoringProcess(opts);
    expect(rp.OutputMapping).toBeNull();
    expect([binding.TargetColumn, binding.TargetColumnSource]).toEqual(['RenewalScore', '$.AdverseProbability']);
  });

  it('writes no OutputMapping when valueKind=class: the binding copies the class', async () => {
    const { opts, rp, binding } = setup({ valueKind: 'class', outputField: 'RenewalSegment' });
    await CreateScoringProcess(opts);
    expect(rp.OutputMapping).toBeNull();
    expect([binding.TargetColumn, binding.TargetColumnSource]).toEqual(['RenewalSegment', '$.Class']);
  });

  it('generates a descriptive default name (with the write-back column + On Demand) when none is supplied', async () => {
    const { opts, rp } = setup();
    await CreateScoringProcess(opts);
    expect(rp.Name).toBe('Score Memberships with model model-1 → RenewalScore (On Demand)');
  });

  it('uses a supplied name verbatim', async () => {
    const { opts, rp } = setup({ name: 'Renewal Scoring (manual)' });
    await CreateScoringProcess(opts);
    expect(rp.Name).toBe('Renewal Scoring (manual)');
  });
});

// ----- scoring binding (lineage) -----------------------------------------------

describe('createScoringProcess — scoring binding (lineage row)', () => {
  it('creates an Active binding of the model\'s pipeline: feature name, view authorization, record process, column and source, Mode=OnDemand', async () => {
    const { opts, rp, binding } = setup();
    const result = await CreateScoringProcess(opts);

    expect(binding.SaveCalled).toBe(true);
    expect(binding.MLTrainingPipelineID).toBe('pipe-1');
    expect(binding.FeatureName).toBe('Renewal');
    expect(binding.ViewAuthorizationID).toBe(SEEDED_AUTHORIZATION_ID);
    expect(binding.Status).toBe('Active');
    expect(binding.TargetColumnSource).toBe('$.AdverseProbability');
    expect(binding.LoadedId).toBeNull();
    expect(binding.RecordProcessID).toBe(rp.ID);
    expect(binding.TargetEntityID).toBe(ENTITY_ID);
    expect(binding.TargetColumn).toBe('RenewalScore');
    expect(binding.Mode).toBe('OnDemand');
    // The helper returns BOTH rows; the binding is the same double we captured.
    expect(result.binding as unknown as FakeScoringBinding).toBe(binding);
  });

  it('binds the resolved target entity id (not a re-resolved one) and the configured output field', async () => {
    const { opts, binding } = setup({ outputField: 'RenewalSegment' });
    await CreateScoringProcess(opts);
    expect(binding.TargetEntityID).toBe(ENTITY_ID);
    expect(binding.TargetColumn).toBe('RenewalSegment');
  });

  it('rolls the Record Process back with a binding that fails to save, and throws the binding\'s error', async () => {
    const errors = ConsoleCapture.Errors();
    // RP saves OK (true); the binding save fails (false) with a message.
    const { opts, rp, binding, transaction } = setup({}, true, undefined, false, 'binding duplicate key');
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/binding duplicate key/);
    expect([rp.SaveCalled, binding.SaveCalled]).toEqual([true, true]);
    // Both saves ran in one transaction, rolled back: no Record Process (and no schedule) is left without its binding.
    expect([transaction.Committed, transaction.RolledBack]).toEqual([false, true]);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining(`ScoringBindings.Upsert: failed to save scoring binding "Renewal" of pipeline 'pipe-1': binding duplicate key`), expect.stringContaining("createScoringProcess: the scoring binding of Record Process 'rp-1' failed for model 'model-1'; the Record Process is rolled back with it")]);
  });

  it('commits the Record Process and its binding together', async () => {
    const { opts, transaction } = setup();
    await CreateScoringProcess(opts);
    expect([transaction.Committed, transaction.RolledBack]).toEqual([true, false]);
  });

  it('refuses a provider without entity transactions before saving anything', async () => {
    const { opts, rp } = setup();
    const noTransactions: IMetadataProvider = Object.assign(Object.create(opts.provider), { SupportsEntityTransactions: false });
    await expect(CreateScoringProcess({ ...opts, provider: noTransactions })).rejects.toThrow(/needs a server-side transaction/);
    expect(rp.SaveCalled).toBe(false);
  });

  it('takes the feature name, view authorization and class copy source from the options', async () => {
    const { opts, binding } = setup({ featureName: 'Churn risk', viewAuthorizationId: 'auth-custom', valueKind: 'class' });
    await CreateScoringProcess(opts);
    expect(binding).toMatchObject({ FeatureName: 'Churn risk', ViewAuthorizationID: 'auth-custom', TargetColumnSource: '$.Class' });
  });

  it('updates the pipeline\'s existing binding of the feature on the entity instead of creating a second one', async () => {
    const { opts, binding } = setup({}, true, undefined, true, undefined, [{ ID: 'existing-binding', MLTrainingPipelineID: 'PIPE-1' }]);
    await CreateScoringProcess(opts);
    expect(binding.LoadedId).toBe('existing-binding');
  });

  it('refuses an existing Withdrawn binding of the feature with a structured error instead of reporting success on it', async () => {
    const errors = ConsoleCapture.Errors();
    const { opts, binding } = setup({}, true, undefined, true, undefined, [{ ID: 'existing-binding', MLTrainingPipelineID: 'PIPE-1' }]);
    binding.Status = 'Withdrawn';
    await expect(CreateScoringProcess(opts)).rejects.toBeInstanceOf(BindingWithdrawnError);
    expect([binding.Status, binding.SaveCalled]).toEqual(['Withdrawn', false]);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("createScoringProcess: the scoring binding of Record Process 'rp-1' failed for model 'model-1'; the Record Process is rolled back with it")]);
  });

  it('refuses when no view authorization is given and none is seeded', async () => {
    const errors = ConsoleCapture.Errors();
    const { opts, binding } = setup();
    const noSeed: IMetadataProvider = Object.assign(Object.create(opts.provider), { Authorizations: [] });
    await expect(CreateScoringProcess({ ...opts, provider: noSeed })).rejects.toThrow(/no view authorization was given and the 'View Model Predictions' authorization is not in the metadata/);
    expect(binding.SaveCalled).toBe(false);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("createScoringProcess: the scoring binding of Record Process 'rp-1' failed")]);
  });
});

// ----- generic output (no write-back column) -----------------------------------

describe('createScoringProcess — generic output (no outputField)', () => {
  it('omits OutputMapping and creates a binding with no column, keeping the RP otherwise intact', async () => {
    const { opts, rp, binding } = setup({ outputField: undefined });
    const result = await CreateScoringProcess(opts);

    // Generic mode: no write-back mapping; the binding defines the feature with no column.
    expect(rp.OutputMapping).toBeNull();
    expect(result.binding as unknown as FakeScoringBinding).toBe(binding);
    expect(binding).toMatchObject({ SaveCalled: true, TargetColumn: null, TargetColumnSource: null, MLTrainingPipelineID: 'pipe-1' });

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
    await CreateScoringProcess(opts);
    expect(rp.Name).toBe('Score Memberships with model model-1 (On Demand)');
  });
});

// ----- scope mapping -----------------------------------------------------------

describe('createScoringProcess — scope → ScopeType', () => {
  it('maps a filter scope to ScopeType=Filter + ScopeFilter', async () => {
    const { opts, rp } = setup({ scope: { filter: 'RenewalDue=1' } });
    await CreateScoringProcess(opts);
    expect(rp.ScopeType).toBe('Filter');
    expect(rp.ScopeFilter).toBe('RenewalDue=1');
    expect(rp.ScopeViewID).toBeNull();
    expect(rp.ScopeListID).toBeNull();
  });

  it('maps a view scope to ScopeType=View + ScopeViewID', async () => {
    const { opts, rp } = setup({ scope: { viewId: 'view-42' } });
    await CreateScoringProcess(opts);
    expect(rp.ScopeType).toBe('View');
    expect(rp.ScopeViewID).toBe('view-42');
    expect(rp.ScopeFilter).toBeNull();
  });

  it('maps a list scope to ScopeType=List + ScopeListID', async () => {
    const { opts, rp } = setup({ scope: { listId: 'list-7' } });
    await CreateScoringProcess(opts);
    expect(rp.ScopeType).toBe('List');
    expect(rp.ScopeListID).toBe('list-7');
  });

  it('maps a whole-entity scope (all: true) to ScopeType=Filter + the all-rows predicate (1=1)', async () => {
    const { opts, rp } = setup({ scope: { all: true } });
    await CreateScoringProcess(opts);
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
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/`modelId` is required/);
  });

  it('throws when targetEntityName is missing', async () => {
    const { opts } = setup({ targetEntityName: '  ' });
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/`targetEntityName` is required/);
  });

  it('does NOT throw when outputField is omitted (generic output is valid)', async () => {
    const { opts } = setup({ outputField: undefined });
    await expect(CreateScoringProcess(opts)).resolves.toMatchObject({ binding: { TargetColumn: null } });
  });

  it('throws when no scope selector is populated', async () => {
    const { opts } = setup({ scope: {} });
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when more than one scope selector is populated', async () => {
    const { opts } = setup({ scope: { filter: 'x=1', viewId: 'v1' } });
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when two selectors are populated including all (all + filter)', async () => {
    const { opts } = setup({ scope: { all: true, filter: 'x=1' } });
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/exactly one of: filter, viewId, listId, all/);
  });

  it('throws when the target entity is unknown to metadata', async () => {
    const { opts } = setup({ targetEntityName: 'Ghosts' });
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/'Ghosts' was not found in metadata/);
  });

  it('throws (with the save message) when the Record Process fails to save', async () => {
    const { opts } = setup({}, false, 'duplicate key');
    await expect(CreateScoringProcess(opts)).rejects.toThrow(/failed to save Record Process.*duplicate key/s);
  });
});
