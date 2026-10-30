/**
 * A small Prediction Unit world shared by the training and scoring tests: yearly membership rows (`Years`, untracked,
 * every attribute declared not updatable) owned by people (`People`, tracked, with an updatable `Status` and its
 * Record Changes history). One person's status changes to `Lapsed` on 2025-06-01, so an as-of read gives `Active` for
 * that person's 2024 row and `Lapsed` for the 2025 row, while the stored value is `Lapsed` for both.
 */
import type { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import type { PredictionUnitColumns } from '@memberjunction/predictive-studio-core';
import type { SourceRow } from '../../feature-assembly/data-access';
import type { AssemblyEntityInfo, AssemblyFieldInfo, IAssemblyMetadata } from '../../feature-assembly/assembly-metadata';
import type { IPredictionUnitStore } from '../../prediction-unit/unit-store';

/** The renewal pattern of each cycle, by person index; the 2026 cycle's window has not closed at the cutoff. */
const CYCLES: ReadonlyArray<readonly [number, readonly boolean[]]> = [
  [2024, [true, false, true, true]],
  [2025, [true, true, false, true]],
  [2026, [false, false, false, false]],
];
const REGIONS = ['EU', 'US', 'EU', 'APAC'];

/** Unit-store fake: returns the configured unit row for its ID (one deliberate test-double cast at the seam). */
export class FakePredictionUnitStore implements IPredictionUnitStore {
  constructor(private readonly unit: PredictionUnitColumns) {}
  public async Load(unitId: string): Promise<MJPredictionUnitEntity | null> {
    return unitId === this.unit.ID ? (this.unit as unknown as MJPredictionUnitEntity) : null;
  }
  public async LatestVersion(_lineageRootId: string): Promise<MJPredictionUnitEntity | null> {
    return this.unit as unknown as MJPredictionUnitEntity;
  }
}

/** The world's tables, entities and unit. Static members on one owner. */
export class UnitYearsWorld {
  /** The unit every pipeline of this world points at. */
  public static readonly UnitID = 'U-1';
  /** The person whose Status changes to Lapsed on 2025-06-01. */
  public static readonly LapsedPerson = 'p2';

  /** `EventsAttended` is unique per row (person × 10 + cycle offset), so a matrix row names its unit row. */
  public static EventsAttended(person: number, cycle: number): number {
    return person * 10 + (cycle - 2024);
  }

  public static Years(): SourceRow[] {
    const rows: SourceRow[] = [];
    for (const [c, pattern] of CYCLES) {
      pattern.forEach((renewed, p) => rows.push({ ID: `y${c}-${p}`, PersonID: `p${p}`, StartDate: `${c}-01-01`, EventsAttended: UnitYearsWorld.EventsAttended(p, c), Region: REGIONS[p], Renewed: renewed }));
    }
    return rows;
  }

  public static People(): SourceRow[] {
    return [0, 1, 2, 3].map((p) => ({ ID: `p${p}`, Status: `p${p}` === UnitYearsWorld.LapsedPerson ? 'Lapsed' : 'Active' }));
  }

  /** Every person was created Active on 2023-01-01; the lapsed person was updated on 2025-06-01. */
  public static RecordChanges(): SourceRow[] {
    const change = (id: string, person: string, type: 'Create' | 'Update', at: string, status: string, changed: boolean): SourceRow => ({
      ID: id, EntityID: UnitYearsWorld.PeopleEntity.ID, Status: 'Complete', RecordID: `ID|${person}`, Type: type, Source: 'Internal', ChangedAt: new Date(at),
      ChangesJSON: changed ? JSON.stringify({ Status: { field: 'Status', oldValue: 'Active', newValue: status } }) : '{}',
      FullRecordJSON: JSON.stringify({ ID: person, Status: status }),
    });
    const creates = [0, 1, 2, 3].map((p) => change(`rc-create-p${p}`, `p${p}`, 'Create', '2023-01-01T00:00:00Z', 'Active', false));
    return [...creates, change('rc-update-p2', UnitYearsWorld.LapsedPerson, 'Update', '2025-06-01T00:00:00Z', 'Lapsed', true)];
  }

  /** The tables a `TableDataAccess` serves; `years` replaces the default `Years` rows. */
  public static Tables(years: SourceRow[] = UnitYearsWorld.Years()): Record<string, SourceRow[]> {
    return { Years: years, People: UnitYearsWorld.People(), 'MJ: Record Changes': UnitYearsWorld.RecordChanges() };
  }

  private static field(Name: string, TSType: AssemblyFieldInfo['TSType'], SqlType: string, AllowUpdateAPI: boolean): AssemblyFieldInfo {
    return { Name, SqlType, TSType, AllowUpdateAPI, IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false };
  }

  public static readonly YearsEntity: AssemblyEntityInfo = {
    ID: 'E-YEARS',
    Name: 'Years',
    PrimaryKey: 'ID',
    TrackRecordChanges: false,
    Fields: [
      UnitYearsWorld.field('ID', 'string', 'nvarchar', true),
      UnitYearsWorld.field('PersonID', 'string', 'nvarchar', false),
      UnitYearsWorld.field('StartDate', 'Date', 'date', false),
      UnitYearsWorld.field('EventsAttended', 'number', 'int', false),
      UnitYearsWorld.field('Region', 'string', 'nvarchar', false),
      UnitYearsWorld.field('Renewed', 'boolean', 'bit', false),
    ],
  };

  public static readonly PeopleEntity: AssemblyEntityInfo = {
    ID: 'E-PEOPLE',
    Name: 'People',
    PrimaryKey: 'ID',
    TrackRecordChanges: true,
    Fields: [UnitYearsWorld.field('ID', 'string', 'nvarchar', true), UnitYearsWorld.field('Status', 'string', 'nvarchar', true)],
  };

  public static Metadata(): IAssemblyMetadata {
    const byName = new Map([UnitYearsWorld.YearsEntity, UnitYearsWorld.PeopleEntity].map((e) => [e.Name, e] as const));
    return { Entity: (name) => byName.get(name) || null };
  }

  /** One row per year; decided 334 days after StartDate; labelled by Renewed; the corpus ends at the latest StartDate. */
  public static UnitColumns(): PredictionUnitColumns {
    return {
      ID: UnitYearsWorld.UnitID, LineageRootID: UnitYearsWorld.UnitID, Version: 1, Name: 'world renewal', LabelVersion: 1, LabelWindowDays: 31, LabelGapDays: 0, GroupKey: null, TemporalSpec: null,
      UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'column-offset', column: 'StartDate', offsetDays: 334 }, filter: [] }),
      LabelRule: JSON.stringify({ kind: 'column', column: 'Renewed' }),
      TaskType: JSON.stringify({ kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }),
      Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'Years', field: 'StartDate' } }),
      ChangeHistoryPolicy: JSON.stringify({ onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }),
      DecisionSpec: JSON.stringify({ action: 'a', actorRole: 'r', capacityPerPeriod: null, period: 'year' }),
      IncumbentHeuristic: JSON.stringify({ kind: 'none' }), AuthoredBy: JSON.stringify({ kind: 'human', userId: 'U' }),
    };
  }
}
