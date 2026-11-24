/**
 * The single-join lineage read of G5.3 and G5.4 (§4.1, "How G5.3 and G5.4 read carries"): every `Source = 'Model'`
 * Feature Value row of a set of scoring runs, joined to its `MJ: ML Scoring Runs` row and its `MJ: ML Models` row. The
 * three reads go in one `RunViews` call and are joined in memory by UUID; a row is complete when it names its model,
 * run and as-of instant, both resolve, the run is the model's, the run's artifact hash equals the model's registered
 * SHA-256, and the row's `EffectiveAsOf` is the run's `AsOfDate`.
 */
import { RunView } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJMLModelEntity, MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, UUIDsEqual } from '@memberjunction/global';
import type { TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The Feature Value columns of a written score's lineage. */
export type LineageValueRow = Pick<MJFeatureValueEntity, 'ID' | 'RecordID' | 'MLModelID' | 'MLScoringRunID' | 'EffectiveAsOf'>;
/** The scoring-run columns a written score's lineage reaches. */
export type LineageRunRow = Pick<MJMLScoringRunEntity, 'ID' | 'ModelID' | 'ArtifactSha256' | 'AsOfDate'>;
/** The model columns a written score's lineage reaches. */
export type LineageModelRow = Pick<MJMLModelEntity, 'ID' | 'ArtifactSha256'>;

/** A row of any of the three reads. */
type LineageReadRow = LineageValueRow | LineageRunRow | LineageModelRow;

/** One written score with the run and model its lineage resolves to (null when it does not resolve). */
export interface LineageRow {
  /** The `Source = 'Model'` Feature Value row. */
  readonly Value: LineageValueRow;
  /** Its `MJ: ML Scoring Runs` row, or null when `MLScoringRunID` is null or names no run. */
  readonly Run: LineageRunRow | null;
  /** Its `MJ: ML Models` row, or null when `MLModelID` is null or names no model. */
  readonly Model: LineageModelRow | null;
}

/** What one lineage read returned: the rows, and the runs it found among those asked for. */
export interface LineageRead {
  /** Every written score of the runs, joined. */
  readonly Rows: readonly LineageRow[];
  /** The `MJ: ML Scoring Runs` rows found for the requested run IDs. */
  readonly Runs: readonly LineageRunRow[];
}

/** The largest number of IDs one `IN (…)` list carries. */
const MAX_IN_LIST = 500;

/** The single-join lineage read and the completeness rule of G5.3 and G5.4. */
export class ScoringLineage {
  /**
   * The `Model` rows written by `runIds`, their runs and their models, read with one `RunViews` (the models through a
   * subquery on the runs' `ModelID`) and joined by UUID. Throws when a read fails or more run IDs are given than one
   * `IN` list carries.
   */
  public static async Read(h: Pick<TruthHarness, 'Provider' | 'User'>, runIds: readonly string[]): Promise<LineageRead> {
    if (runIds.length === 0) return { Rows: [], Runs: [] };
    if (runIds.length > MAX_IN_LIST) throw new Error(`ScoringLineage: ${runIds.length} run IDs exceed one IN list (${MAX_IN_LIST})`);
    const runs = h.Provider.EntityByName('MJ: ML Scoring Runs');
    if (!runs) throw new Error('ScoringLineage: the provider does not describe MJ: ML Scoring Runs');
    const ids = runIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const [values, runRows, models] = await RunView.FromMetadataProvider(h.Provider).RunViews<LineageReadRow>([
      { EntityName: 'MJ: Feature Values', ExtraFilter: `Source='Model' AND MLScoringRunID IN (${ids})`, Fields: ['ID', 'RecordID', 'MLModelID', 'MLScoringRunID', 'EffectiveAsOf'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
      { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID IN (${ids})`, Fields: ['ID', 'ModelID', 'ArtifactSha256', 'AsOfDate'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID IN (SELECT ModelID FROM [${runs.SchemaName}].[${runs.BaseView}] WHERE ID IN (${ids}))`, Fields: ['ID', 'ArtifactSha256'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
    ], h.User);
    for (const [name, r] of [['Feature Values', values], ['ML Scoring Runs', runRows], ['ML Models', models]] as const) {
      if (!r.Success) throw new Error(`ScoringLineage: reading MJ: ${name} failed: ${r.ErrorMessage}`);
    }
    const runList = runRows.Results.filter(ScoringLineage.isRun);
    return { Rows: ScoringLineage.Join(values.Results.filter(ScoringLineage.isValue), runList, models.Results.filter(ScoringLineage.isModel)), Runs: runList };
  }

  /** Each value row with the run and model its IDs name, indexed once by UUID. Pure. */
  public static Join(values: readonly LineageValueRow[], runs: readonly LineageRunRow[], models: readonly LineageModelRow[]): LineageRow[] {
    const runsById = IndexByUUID(runs, (r) => r.ID);
    const modelsById = IndexByUUID(models, (m) => m.ID);
    return values.map((v) => ({
      Value: v,
      Run: v.MLScoringRunID ? runsById.Get(v.MLScoringRunID) || null : null,
      Model: v.MLModelID ? modelsById.Get(v.MLModelID) || null : null,
    }));
  }

  /**
   * True when the row names its model, run and as-of instant, both resolve, the run is the row's model's, the run's
   * artifact hash is set and equals the model's registered SHA-256 (case-insensitive), and `EffectiveAsOf` is the same
   * instant as the run's `AsOfDate`. Pure.
   */
  public static Complete(row: LineageRow): boolean {
    const v = row.Value;
    if (!v.MLModelID || !v.MLScoringRunID || row.Run === null || row.Model === null) return false;
    if (!UUIDsEqual(row.Run.ModelID, v.MLModelID)) return false;
    const runHash = (row.Run.ArtifactSha256 || '').trim().toLowerCase();
    if (runHash === '' || runHash !== (row.Model.ArtifactSha256 || '').trim().toLowerCase()) return false;
    const asOf = ScoringLineage.instant(v.EffectiveAsOf);
    return asOf !== null && asOf === ScoringLineage.instant(row.Run.AsOfDate);
  }

  /** What an incomplete row lacks, in words ("complete" when nothing). Pure. */
  public static Lacks(row: LineageRow): string {
    const v = row.Value;
    const gaps: string[] = [];
    if (!v.MLModelID) gaps.push('no MLModelID');
    if (!v.MLScoringRunID) gaps.push('no MLScoringRunID');
    if (row.Run === null) gaps.push('run unresolved');
    if (row.Model === null) gaps.push('model unresolved');
    if (row.Run !== null && v.MLModelID && !UUIDsEqual(row.Run.ModelID, v.MLModelID)) gaps.push('run of another model');
    if (row.Run !== null && row.Model !== null && ((row.Run.ArtifactSha256 || '').trim().toLowerCase() !== (row.Model.ArtifactSha256 || '').trim().toLowerCase() || !row.Run.ArtifactSha256)) gaps.push(`run hash ${row.Run.ArtifactSha256 || 'null'} ≠ model hash ${row.Model.ArtifactSha256 || 'null'}`);
    if (row.Run !== null && ScoringLineage.instant(v.EffectiveAsOf) !== ScoringLineage.instant(row.Run.AsOfDate)) gaps.push(`EffectiveAsOf ${ScoringLineage.iso(v.EffectiveAsOf)} ≠ AsOfDate ${ScoringLineage.iso(row.Run.AsOfDate)}`);
    return gaps.length === 0 ? 'complete' : gaps.join(', ');
  }

  /** A row of the Feature Value read (the only read whose rows carry `MLScoringRunID`). */
  private static isValue(row: LineageReadRow): row is LineageValueRow {
    return 'MLScoringRunID' in row;
  }

  /** A row of the scoring-run read (the only read whose rows carry `AsOfDate`). */
  private static isRun(row: LineageReadRow): row is LineageRunRow {
    return 'AsOfDate' in row;
  }

  /** A row of the model read (neither a value nor a run row). */
  private static isModel(row: LineageReadRow): row is LineageModelRow {
    return !('MLScoringRunID' in row) && !('AsOfDate' in row);
  }

  /** A date column as ISO text ("null" when absent or invalid). */
  private static iso(value: Date | string | null): string {
    const t = ScoringLineage.instant(value);
    return t === null ? 'null' : new Date(t).toISOString();
  }

  /** A date column's instant in ms (a `Date`, or the ISO text a simple read returns); null when absent or invalid. */
  private static instant(value: Date | string | null): number | null {
    if (value === null) return null;
    const t = (value instanceof Date ? value : new Date(value)).getTime();
    return Number.isNaN(t) ? null : t;
  }
}
