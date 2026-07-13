import { describe, it, expect } from 'vitest';
import type { BaseEntity, UserInfo, IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';

import { ModelScoringActionGenerator } from '../model-scoring-action-generator';
import { SCORE_RECORD_SET_DRIVER_CLASS } from '../score-record-set.action';

/**
 * Unit tests for the per-model scoring Action generator (PS2-2). NO live DB — a
 * minimal in-memory metadata provider double backs three tables ('MJ: Actions',
 * 'MJ: Action Params', 'MJ: Action Categories'), supports the exact RunView
 * filters the generator issues, and hands back tiny entity fakes whose `Save()` /
 * `Delete()` mutate the store. We assert:
 *   (a) generating builds the child Action with the right shape + a ModelID param
 *       whose DefaultValue is the model id;
 *   (b) idempotency — generating twice neither duplicates the Action nor appends params;
 *   (c) disableForModel flips the generated Action's Status to 'Disabled';
 *   (d) a missing parent action is handled gracefully (no throw, nothing created).
 */

// ---------------------------------------------------------------------------
// In-memory store + entity fakes
// ---------------------------------------------------------------------------

let nextId = 1;
function newId(): string {
  return `id-${nextId++}`;
}

/** A row is just a string-keyed bag; the generator only sets known fields. */
type Row = Record<string, unknown>;

/** Backing store keyed by entity name. */
class Store {
  public rows: Record<string, Row[]> = {
    'MJ: Actions': [],
    'MJ: Action Params': [],
    'MJ: Action Categories': [],
  };
}

/** Minimal entity fake: field bag + Save()/Delete() that write through to the store. */
class FakeEntity {
  public LatestResult: { CompleteMessage: string } | null = null;
  private isNew = false;
  constructor(
    private readonly store: Store,
    private readonly entityName: string,
    private readonly row: Row,
  ) {}

  public NewRecord(): boolean {
    this.isNew = true;
    return true;
  }

  // Field access — the generator reads/writes plain properties, so proxy them.
  public get(key: string): unknown {
    return this.row[key];
  }
  public set(key: string, value: unknown): void {
    this.row[key] = value;
  }

  public async Save(): Promise<boolean> {
    if (this.isNew) {
      if (this.row['ID'] == null) {
        this.row['ID'] = newId();
      }
      this.store.rows[this.entityName].push(this.row);
      this.isNew = false;
    }
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }

  public async Delete(): Promise<boolean> {
    const arr = this.store.rows[this.entityName];
    const idx = arr.indexOf(this.row);
    if (idx >= 0) {
      arr.splice(idx, 1);
    }
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }
}

/**
 * Wrap a raw row bag in an object exposing the generator's field properties as
 * real getters/setters (so `action.Name = x` works) plus Save/Delete. We can't
 * predeclare every field, so use a Proxy that forwards unknown props to the row.
 */
function makeEntity(store: Store, entityName: string, row: Row): BaseEntity {
  const fake = new FakeEntity(store, entityName, row);
  return new Proxy(fake, {
    get(target, prop: string) {
      if (prop in target) {
        const v = (target as unknown as Record<string, unknown>)[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      }
      return target.get(prop);
    },
    set(target, prop: string, value) {
      if (prop in target) {
        (target as unknown as Record<string, unknown>)[prop] = value;
      } else {
        target.set(prop, value);
      }
      return true;
    },
  }) as unknown as BaseEntity;
}

/** Spy provider implementing the two members the generator touches. */
class FakeProvider {
  public readonly CurrentUser = { Email: 'test@example.com' } as UserInfo;
  constructor(public readonly store: Store) {}

  public async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
    return makeEntity(this.store, entityName, {}) as unknown as T;
  }

  /** Honors the exact filter shapes the generator issues. */
  public async RunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
    const matched = this.match(params.EntityName ?? '', params.ExtraFilter ?? '');
    const results = matched.map((row) => makeEntity(this.store, params.EntityName ?? '', row));
    return { Success: true, Results: results as unknown as T[], RowCount: results.length } as RunViewResult<T>;
  }

  private match(entityName: string, extraFilter: string): Row[] {
    const rows = this.store.rows[entityName] ?? [];
    return rows.filter((r) => this.rowMatches(r, extraFilter));
  }

  /** Tiny filter evaluator covering Name='x', DriverClass='x', ParentID IS NULL, ActionID='x'. */
  private rowMatches(row: Row, filter: string): boolean {
    const clauses = filter.split(' AND ').map((c) => c.trim()).filter(Boolean);
    return clauses.every((clause) => {
      const nullMatch = clause.match(/^(\w+)\s+IS NULL$/i);
      if (nullMatch) {
        return row[nullMatch[1]] == null;
      }
      const eqMatch = clause.match(/^(\w+)='(.*)'$/);
      if (eqMatch) {
        const [, field, value] = eqMatch;
        return String(row[field] ?? '') === value.replace(/''/g, "'");
      }
      return true; // unknown clause → don't exclude
    });
  }
}

function asProvider(p: FakeProvider): IMetadataProvider {
  return p as unknown as IMetadataProvider;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed the canonical parent 'Score Record Set' Action into the store. */
function seedParentAction(store: Store): Row {
  const parent: Row = {
    ID: newId(),
    Name: 'Score Record Set',
    DriverClass: SCORE_RECORD_SET_DRIVER_CLASS,
    ParentID: null,
    Type: 'Custom',
    Status: 'Active',
  };
  store.rows['MJ: Actions'].push(parent);
  return parent;
}

/**
 * A model fake exposing exactly the fields the generator reads. The model has no
 * `Name` column — its human label is the denormalized `Pipeline` view field.
 */
function fakeModel(over: Partial<{ ID: string; Pipeline: string | null; Version: number }> = {}): MJMLModelEntity {
  return {
    ID: over.ID ?? 'model-uuid-1',
    Pipeline: over.Pipeline === undefined ? 'Renewal Risk' : over.Pipeline,
    Version: over.Version ?? 3,
  } as unknown as MJMLModelEntity;
}

function actions(store: Store): Row[] {
  return store.rows['MJ: Actions'].filter((a) => a['ParentID'] != null); // children only
}
function paramsFor(store: Store, actionID: string): Row[] {
  return store.rows['MJ: Action Params'].filter((p) => p['ActionID'] === actionID);
}

const USER = { Email: 'test@example.com' } as UserInfo;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelScoringActionGenerator — generateForModel', () => {
  it('creates a child Action with the right shape + a ModelID param defaulted to the model id', async () => {
    const store = new Store();
    seedParentAction(store);
    const provider = new FakeProvider(store);
    const model = fakeModel({ ID: 'model-uuid-1', Pipeline: 'Renewal Risk', Version: 3 });

    await new ModelScoringActionGenerator().generateForModel(model, USER, asProvider(provider));

    const children = actions(store);
    expect(children).toHaveLength(1);
    const action = children[0];
    expect(action['Name']).toBe('Score with Renewal Risk v3');
    expect(action['Type']).toBe('Custom');
    expect(action['DriverClass']).toBe(SCORE_RECORD_SET_DRIVER_CLASS);
    expect(action['ParentID']).toBeTruthy();
    expect(action['Status']).toBe('Active');

    // A 'Predictive Studio Models' category was created and linked.
    const cats = store.rows['MJ: Action Categories'];
    expect(cats).toHaveLength(1);
    expect(cats[0]['Name']).toBe('Predictive Studio Models');
    expect(action['CategoryID']).toBe(cats[0]['ID']);

    // The ModelID input param carries the model id as its DefaultValue.
    const params = paramsFor(store, action['ID'] as string);
    const modelIdParam = params.find((p) => p['Name'] === 'ModelID');
    expect(modelIdParam).toBeTruthy();
    expect(modelIdParam!['Type']).toBe('Input');
    expect(modelIdParam!['IsRequired']).toBe(false);
    expect(modelIdParam!['DefaultValue']).toBe('model-uuid-1');

    // The full canonical param set is present (3 inputs + 5 outputs).
    expect(params).toHaveLength(8);
    expect(params.map((p) => p['Name']).sort()).toEqual(
      ['FailedCount', 'ModelID', 'Predictions', 'Scope', 'ScoredCount', 'SkippedCount', 'WriteBack', 'WroteBack'].sort(),
    );
  });

  it('falls back to the model ID + v1 in the name when Name/Version are absent', async () => {
    const store = new Store();
    seedParentAction(store);
    const provider = new FakeProvider(store);
    const model = { ID: 'bare-model', Pipeline: null } as unknown as MJMLModelEntity;

    await new ModelScoringActionGenerator().generateForModel(model, USER, asProvider(provider));

    expect(actions(store)[0]['Name']).toBe('Score with bare-model v1');
  });

  it('is idempotent — generating twice neither duplicates the Action nor appends params', async () => {
    const store = new Store();
    seedParentAction(store);
    const provider = new FakeProvider(store);
    const model = fakeModel();
    const gen = new ModelScoringActionGenerator();

    await gen.generateForModel(model, USER, asProvider(provider));
    await gen.generateForModel(model, USER, asProvider(provider));

    const children = actions(store);
    expect(children).toHaveLength(1); // reused, not duplicated
    expect(paramsFor(store, children[0]['ID'] as string)).toHaveLength(8); // recreated, not doubled
    expect(store.rows['MJ: Action Categories']).toHaveLength(1); // category reused too
  });
});

describe('ModelScoringActionGenerator — disableForModel', () => {
  it("sets the generated Action's Status to 'Disabled'", async () => {
    const store = new Store();
    seedParentAction(store);
    const provider = new FakeProvider(store);
    const model = fakeModel();
    const gen = new ModelScoringActionGenerator();

    await gen.generateForModel(model, USER, asProvider(provider));
    expect(actions(store)[0]['Status']).toBe('Active');

    await gen.disableForModel(model, USER, asProvider(provider));
    expect(actions(store)[0]['Status']).toBe('Disabled');
  });

  it('is a no-op when no generated Action exists', async () => {
    const store = new Store();
    seedParentAction(store);
    const provider = new FakeProvider(store);

    // Should not throw and should create nothing.
    await new ModelScoringActionGenerator().disableForModel(fakeModel(), USER, asProvider(provider));
    expect(actions(store)).toHaveLength(0);
  });
});

describe('ModelScoringActionGenerator — missing parent', () => {
  it('handles a missing parent action gracefully (logs, no throw, nothing created)', async () => {
    const store = new Store(); // NO parent seeded
    const provider = new FakeProvider(store);

    await expect(
      new ModelScoringActionGenerator().generateForModel(fakeModel(), USER, asProvider(provider)),
    ).resolves.toBeUndefined();

    // Nothing was created — neither an Action nor a category.
    expect(store.rows['MJ: Actions']).toHaveLength(0);
    expect(store.rows['MJ: Action Categories']).toHaveLength(0);
  });
});
