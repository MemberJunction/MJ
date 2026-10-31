/**
 * Test support: an in-memory store of Prediction Unit version rows and an entity factory that saves new unit rows into
 * it (the database minting an ID for a later version), wrapping another factory for every other entity. The rows reach
 * the code under test through the `IPredictionUnitStore` / `IEntityFactory` seams with one deliberate test-double cast
 * each, as the other Engine fakes do.
 */
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import type { PredictionUnitColumns } from '@memberjunction/predictive-studio-core';
import type { IPredictionUnitStore } from '../unit-store';
import type { IEntityFactory } from '../../training/types';

/** A unit version row: the unit columns, the description and the save surface the versioning code calls. */
export class FakeUnitRow implements PredictionUnitColumns {
  public ID = '';
  public LineageRootID = '';
  public Version = 0;
  public Name = '';
  public Description: string | null = null;
  public UnitRows = '';
  public LabelRule = '';
  public LabelWindowDays = 0;
  public LabelGapDays = 0;
  public LabelVersion = 0;
  public TaskType = '';
  public Censoring = '';
  public ChangeHistoryPolicy = '';
  public GroupKey: string | null = null;
  public TemporalSpec: string | null = null;
  public DecisionSpec = '';
  public IncumbentHeuristic = '';
  public AuthoredBy = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public Deleted = false;

  constructor(private readonly store: InMemoryUnitVersions, private readonly saveOk = true, private readonly afterSave: ((row: FakeUnitRow) => void) | null = null) {}

  public async Save(): Promise<boolean> {
    if (!this.saveOk) {
      this.LatestResult = { CompleteMessage: 'unit save refused' };
      return false;
    }
    if (!this.ID) this.ID = `U-${this.store.Rows.length + 1}`;
    this.store.Rows.push(this);
    if (this.afterSave !== null) this.afterSave(this);
    return true;
  }

  public async Delete(): Promise<boolean> {
    this.Deleted = true;
    this.store.Rows.splice(this.store.Rows.indexOf(this), 1);
    return true;
  }
}

/** Unit version rows by ID and lineage. */
export class InMemoryUnitVersions implements IPredictionUnitStore {
  public readonly Rows: FakeUnitRow[] = [];

  /** Seeds a saved row from its columns. */
  public Seed(columns: PredictionUnitColumns): FakeUnitRow {
    const row = Object.assign(new FakeUnitRow(this), columns);
    this.Rows.push(row);
    return row;
  }

  public async Load(unitId: string): Promise<MJPredictionUnitEntity | null> {
    const row = this.Rows.find((r) => r.ID === unitId);
    return row === undefined ? null : (row as unknown as MJPredictionUnitEntity);
  }

  public async LatestVersion(lineageRootId: string): Promise<MJPredictionUnitEntity | null> {
    const lineage = this.Rows.filter((r) => r.LineageRootID === lineageRootId).sort((a, b) => b.Version - a.Version);
    return lineage.length === 0 ? null : (lineage[0] as unknown as MJPredictionUnitEntity);
  }
}

/** Serves new unit rows saved into `units`; every other entity comes from `inner`. */
export class UnitVersionFactory implements IEntityFactory {
  /** `afterSave` runs on each new unit row once it is saved (a test can corrupt what was stored). */
  constructor(private readonly units: InMemoryUnitVersions, private readonly inner: IEntityFactory | null = null, private readonly afterSave: ((row: FakeUnitRow) => void) | null = null) {}

  public async getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
    if (entityName === 'MJ: Prediction Units') return new FakeUnitRow(this.units, true, this.afterSave) as unknown as T;
    if (this.inner === null) throw new Error(`UnitVersionFactory: unexpected entity ${entityName}`);
    return this.inner.getEntityObject<T>(entityName, contextUser);
  }
}
