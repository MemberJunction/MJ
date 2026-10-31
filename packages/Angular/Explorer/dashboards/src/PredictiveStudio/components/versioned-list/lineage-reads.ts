/**
 * Reads of versioned Predictive Studio rows (`MJ: Evaluation Protocols`, `MJ: Prediction Units`) through a given
 * provider (no Angular): the versions of one lineage, and a bound version with the latest version of its lineage.
 * Version 1 is its own lineage root, so `LineageRootID = <root>` returns every version of a lineage. Reads are
 * `simple` and limited to the fields asked for; independent reads go in one `RunViews` batch.
 */
import { RunView, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { EvaluationProtocolRowTarget, PredictionUnitRowTarget } from '@memberjunction/predictive-studio-core';

/** The two versioned entities. */
export type VersionedEntityName = 'MJ: Evaluation Protocols' | 'MJ: Prediction Units';

/** The identity columns every versioned row has. */
export interface VersionIdentity {
  ID: string;
  LineageRootID: string;
  Version: number;
}

/** The columns a version list shows. */
export interface VersionRowFields extends VersionIdentity {
  Name: string;
  __mj_CreatedAt: Date | string;
}

/** Rows read, or the read's error message. */
export type LineageRead<T> = { readonly Ok: true; readonly Rows: readonly T[] } | { readonly Ok: false; readonly Error: string };

/** A bound version and the latest version of its lineage (the same row when it is the latest). */
export interface BoundVersionRead {
  readonly Bound: VersionRowFields;
  readonly Latest: VersionRowFields;
}

/** What a bound-version read asks for: the entity and the bound row's ID. */
export interface BoundVersionRequest {
  readonly EntityName: VersionedEntityName;
  readonly ID: string;
}

/** A protocol version row as a version list reads it: every column the parser reads, the description and the save time. */
export type ProtocolVersionRow = EvaluationProtocolRowTarget & { __mj_CreatedAt: Date | string };

/** A unit version row as a version list reads it: every column the parser reads, the description and the save time. */
export type UnitVersionRow = PredictionUnitRowTarget & { __mj_CreatedAt: Date | string };

/** The fields of a {@link ProtocolVersionRow}. */
export const PROTOCOL_VERSION_FIELDS = [
  'ID', 'LineageRootID', 'Version', 'Name', 'Description', 'Holdout', 'InnerValidation', 'Seed', 'HoldoutAccessBudget', 'PrimaryScore',
  'SecondaryMetrics', 'Baselines', 'Calibration', 'Resampling', 'Intervals', 'Promotion', 'AllowedOutcomes', 'LeakageAudit', 'Exclusions',
  'Slices', 'PredictionIntervals', 'ResidualDiagnostics', 'RetrainTriggers', 'SearchStrategy', 'Budgets', 'MinMinorityClassRows',
  'GuardFieldsEditableBy', 'AuthoredBy', '__mj_CreatedAt',
] as const satisfies readonly (keyof ProtocolVersionRow)[];

/** The fields of a {@link UnitVersionRow}. */
export const UNIT_VERSION_FIELDS = [
  'ID', 'LineageRootID', 'Version', 'LabelVersion', 'Name', 'Description', 'UnitRows', 'LabelRule', 'LabelWindowDays', 'LabelGapDays',
  'TaskType', 'Censoring', 'ChangeHistoryPolicy', 'GroupKey', 'TemporalSpec', 'DecisionSpec', 'IncumbentHeuristic', 'AuthoredBy', '__mj_CreatedAt',
] as const satisfies readonly (keyof UnitVersionRow)[];

/** Compile-time completeness: a column added to a row type without listing it in its fields array breaks the build. */
const protocolFieldsComplete: [Exclude<keyof ProtocolVersionRow, (typeof PROTOCOL_VERSION_FIELDS)[number]>] extends [never] ? true : never = true;
const unitFieldsComplete: [Exclude<keyof UnitVersionRow, (typeof UNIT_VERSION_FIELDS)[number]>] extends [never] ? true : never = true;
void protocolFieldsComplete;
void unitFieldsComplete;

const VERSION_ROW_FIELDS = ['ID', 'Name', 'Version', 'LineageRootID', '__mj_CreatedAt'] as const satisfies readonly (keyof VersionRowFields)[];

/** Versioned-row reads through one provider. */
export class LineageReads {
  /** Every version of the lineage `anyVersionID` belongs to, oldest first, with `fields`. */
  public static async ReadLineage<T extends VersionIdentity>(
    provider: IMetadataProvider, entityName: VersionedEntityName, anyVersionID: string, fields: readonly (keyof T & string)[],
  ): Promise<LineageRead<T>> {
    const rv = RunView.FromMetadataProvider(provider);
    const one = await rv.RunView<VersionIdentity>({
      EntityName: entityName, ExtraFilter: `ID='${EscapeSQLString(anyVersionID)}'`, Fields: ['ID', 'LineageRootID', 'Version'], ResultType: 'simple',  // pk-filter-ok: VersionedEntityName is two MJ core entities, both keyed by ID
    });
    if (!one.Success) return { Ok: false, Error: one.ErrorMessage };
    const current = one.Results[0];
    if (current === undefined) return { Ok: false, Error: `${entityName} row ${anyVersionID} was not found.` };
    const all = await rv.RunView<T>({
      EntityName: entityName, ExtraFilter: `LineageRootID='${EscapeSQLString(current.LineageRootID)}'`, OrderBy: 'Version', Fields: [...fields], ResultType: 'simple',
    });
    return all.Success ? { Ok: true, Rows: all.Results } : { Ok: false, Error: all.ErrorMessage };
  }

  /** Each requested row and the latest version of its lineage: two batches whatever the number of requests. */
  public static async ReadBoundVersions(provider: IMetadataProvider, requests: readonly BoundVersionRequest[]): Promise<LineageRead<BoundVersionRead | null>> {
    if (requests.length === 0) return { Ok: true, Rows: [] };
    const rv = RunView.FromMetadataProvider(provider);
    const bound = await rv.RunViews<VersionRowFields>(requests.map((r) => LineageReads.versionRowParams(r.EntityName, `ID='${EscapeSQLString(r.ID)}'`)));
    const failedBound = bound.find((r) => !r.Success);
    if (failedBound !== undefined) return { Ok: false, Error: failedBound.ErrorMessage };
    const rows = bound.map((r) => r.Results[0] || null);
    const latestParams = requests.flatMap((r, i) => {
      const row = rows[i];
      return row === null ? [] : [{ ...LineageReads.versionRowParams(r.EntityName, `LineageRootID='${EscapeSQLString(row.LineageRootID)}'`), OrderBy: 'Version DESC', MaxRows: 1 }];
    });
    const latest = latestParams.length === 0 ? [] : await rv.RunViews<VersionRowFields>(latestParams);
    const failedLatest = latest.find((r) => !r.Success);
    if (failedLatest !== undefined) return { Ok: false, Error: failedLatest.ErrorMessage };
    return { Ok: true, Rows: LineageReads.pairBoundWithLatest(rows, latest.map((r) => r.Results[0] || null)) };
  }

  /** Every version row of an entity, version-list columns only; the list keeps the latest version of each lineage. */
  public static async ReadAllVersionRows(provider: IMetadataProvider, entityName: VersionedEntityName): Promise<LineageRead<VersionRowFields>> {
    const r = await RunView.FromMetadataProvider(provider).RunView<VersionRowFields>(LineageReads.versionRowParams(entityName, ''));
    return r.Success ? { Ok: true, Rows: r.Results } : { Ok: false, Error: r.ErrorMessage };
  }

  private static versionRowParams(entityName: VersionedEntityName, filter: string): RunViewParams {
    return { EntityName: entityName, ExtraFilter: filter, Fields: [...VERSION_ROW_FIELDS], ResultType: 'simple' };
  }

  /** Pairs each found bound row with the next latest row (the latest reads were issued only for found rows, in order). */
  private static pairBoundWithLatest(rows: readonly (VersionRowFields | null)[], latest: readonly (VersionRowFields | null)[]): (BoundVersionRead | null)[] {
    let next = 0;
    return rows.map((row) => {
      if (row === null) return null;
      const top = latest[next];
      next += 1;
      return { Bound: row, Latest: top || row };
    });
  }
}
