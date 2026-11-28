import { readFileSync } from 'node:fs';
import path from 'node:path';
import type sql from 'mssql';
import { RunView, type UserInfo } from '@memberjunction/core';
import { UUIDMap } from '@memberjunction/global';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { TruthConnection } from '../db/connection';
import { TruthCsv } from '../db/csv';
import { DatasetLoader } from '../db/dataset-loader';
import { TruthEntities } from './entities';
import type { DatasetRef, LoadedDataset, RenamedCopy } from './types';

export type DatasetPool = sql.ConnectionPool;

/** What the dataset members close over: the MJAPI connection, its user, and the truth pool. */
export interface DatasetContext {
  readonly Provider: GraphQLDataProvider;
  readonly User: UserInfo;
  readonly Pool: DatasetPool;
}

/** Dataset generation, bulk-load, and SQL inspection helpers for the truth harness. */
export class HarnessDatasets {
  /** Open one connection pool to the test database for the run. */
  public static async OpenDatasetPool(): Promise<DatasetPool> {
    return TruthConnection.OpenPool();
  }

  /** Ensure a world, scenario, or rolling-origin series dataset is generated and loaded into `pstruth`. */
  public static async EnsureLoaded(ctx: DatasetContext, ref: DatasetRef): Promise<LoadedDataset> {
    return DatasetLoader.Load(ctx, ref);
  }

  /** Count rows whose `column` (`TruthScore`) is set on the dataset's entity. */
  public static async CountNonNull(ctx: DatasetContext, dataset: LoadedDataset, column: 'TruthScore'): Promise<number> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView(
      { EntityName: dataset.Entity.Name, ExtraFilter: `[${column}] IS NOT NULL`, ResultType: 'count_only', BypassCache: true },
      ctx.User,
    );
    if (!res.Success) throw new Error(`count ${dataset.Entity.Name}.${column}: ${res.ErrorMessage}`);
    return res.TotalRowCount ?? 0;
  }

  /** Reset `column` (`TruthScore`) to NULL on the dataset's `pstruth` table: direct SQL its entity sanctions. */
  public static async ResetColumn(ctx: DatasetContext, dataset: LoadedDataset, column: 'TruthScore'): Promise<void> {
    if (!dataset.Entity.AllowDirectSQLUpdate) {
      throw new Error(`Direct SQL updates are not sanctioned on ${dataset.Entity.Name} (AllowDirectSQLUpdate is false). Run truth:provision.`);
    }
    await ctx.Pool.request().query(`UPDATE pstruth.[${dataset.Entity.BaseTable}] SET [${column}] = NULL WHERE [${column}] IS NOT NULL`);
  }

  /**
   * Fills the `pstruth` copy table `copyTable` with every row of the dataset's table, each source column written to the
   * copy's column of the same name or, for a key of `renames`, of the renamed one (G5.1's R1 copy with `DistanceZ`
   * renamed): the copy's rows are deleted first, then one `INSERT … SELECT`. Direct SQL both entities sanction. Returns
   * the copy's entity and its row count.
   *
   * @throws when the copy is not a registered entity, direct SQL is not sanctioned on it, or the copy's row count
   *   differs from the dataset's
   */
  public static async FillRenamedCopy(ctx: DatasetContext, dataset: LoadedDataset, copyTable: string, renames: Readonly<Record<string, string>>): Promise<RenamedCopy> {
    const copy = TruthEntities.ForTable(ctx.Provider, copyTable);
    if (!copy.AllowDirectSQLInsert || !copy.AllowDirectSQLDelete) {
      throw new Error(`Direct SQL inserts and deletes are not sanctioned on ${copy.Name}. Run truth:provision.`);
    }
    const source = dataset.Entity.Fields.filter((f) => !f.IsVirtual).map((f) => f.Name);
    const target = source.map((c) => renames[c] || c);
    const list = (cols: readonly string[]): string => cols.map((c) => `[${c}]`).join(', ');
    await ctx.Pool.request().query(
      `DELETE FROM pstruth.[${copyTable}]; INSERT INTO pstruth.[${copyTable}] (${list(target)}) SELECT ${list(source)} FROM pstruth.[${dataset.Entity.BaseTable}]`,
    );
    const counted = await ctx.Pool.request().query<{ n: number }>(`SELECT COUNT(*) AS n FROM pstruth.[${copyTable}]`);
    const rows = Number(counted.recordset[0]?.n || 0);
    if (rows !== dataset.RowCount) throw new Error(`${copy.Name} holds ${rows} rows after the copy, not ${dataset.Entity.Name}'s ${dataset.RowCount}`);
    return { Entity: copy, Rows: rows };
  }

  /** Count positive and negative labels in the dataset's cached `rows.csv` (never the truth file). */
  public static LabelCounts(dataset: LoadedDataset, column: string): { Positives: number; Negatives: number } {
    const rowsPath = path.join(dataset.Dir, 'rows.csv');
    TruthCsv.AssertNotTruthFile(rowsPath);
    const parsed = TruthCsv.Parse(readFileSync(rowsPath, 'utf8'));
    const colIdx = parsed.Header.indexOf(column);
    if (colIdx < 0) {
      throw new Error(`Column '${column}' not found in ${rowsPath}`);
    }
    let positives = 0;
    let negatives = 0;
    for (const row of parsed.Rows) {
      const val = (row[colIdx] ?? '').trim().toLowerCase();
      if (val === '1' || val === 'true') {
        positives += 1;
      } else if (val === '0' || val === 'false') {
        negatives += 1;
      }
    }
    return { Positives: positives, Negatives: negatives };
  }

  /** Each row's `column` cell keyed by its `ID`, from the dataset's cached `rows.csv` (never the truth file). */
  public static ColumnByRowID(dataset: LoadedDataset, column: string): UUIDMap<string> {
    const rowsPath = path.join(dataset.Dir, 'rows.csv');
    TruthCsv.AssertNotTruthFile(rowsPath);
    const parsed = TruthCsv.Parse(readFileSync(rowsPath, 'utf8'));
    const idIdx = parsed.Header.indexOf('ID');
    const colIdx = parsed.Header.indexOf(column);
    if (idIdx < 0 || colIdx < 0) {
      throw new Error(`${rowsPath} has no ID/${column} columns`);
    }
    const out = new UUIDMap<string>();
    for (const row of parsed.Rows) {
      const id = (row[idIdx] || '').trim();
      if (id.length > 0) out.Set(id, (row[colIdx] || '').trim());
    }
    return out;
  }

  /** Read the first `n` `ID` values from the dataset's cached `rows.csv` (never the truth file). */
  public static FirstRowIDs(dataset: LoadedDataset, n: number): string[] {
    const rowsPath = path.join(dataset.Dir, 'rows.csv');
    TruthCsv.AssertNotTruthFile(rowsPath);
    const parsed = TruthCsv.Parse(readFileSync(rowsPath, 'utf8'));
    const idIdx = parsed.Header.indexOf('ID');
    if (idIdx < 0) {
      throw new Error(`Column 'ID' not found in ${rowsPath}`);
    }
    return parsed.Rows.slice(0, n)
      .map((r) => (r[idIdx] ?? '').trim())
      .filter((id) => id.length > 0);
  }
}
