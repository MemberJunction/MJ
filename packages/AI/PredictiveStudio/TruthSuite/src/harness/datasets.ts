import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type sql from 'mssql';
import { SafeJSONParse } from '@memberjunction/global';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { DatasetCatalog } from '../data/catalog';
import { BulkLoader } from '../db/bulk-load';
import { TruthConnection } from '../db/connection';
import { TruthCsv } from '../db/csv';
import { ScenarioLoader } from '../db/scenario-loader';
import { DatasetStamp } from '../db/stamp';
import { WorldLoader } from '../db/world-loader';
import { TruthEntities } from './entities';
import type { DatasetRef, LoadedDataset } from './types';

export type DatasetPool = sql.ConnectionPool;

interface ManifestRowCount {
  rowCount?: number;
  nRows?: number;
}

/** Dataset generation, bulk-load, and SQL inspection helpers for the truth harness. */
export class HarnessDatasets {
  /** Open one connection pool to the test database for the run. */
  public static async OpenDatasetPool(): Promise<DatasetPool> {
    return TruthConnection.OpenPool();
  }

  /** Ensure a world, scenario, or rolling-origin series dataset is generated and loaded into `pstruth`. */
  public static async EnsureLoaded(
    ctx: { Provider: GraphQLDataProvider; Pool: DatasetPool },
    ref: DatasetRef,
  ): Promise<LoadedDataset> {
    if (ref.Kind === 'world') {
      const entry = DatasetCatalog.Find('world', ref.ID);
      const dir = await DatasetCatalog.EnsureGenerated(entry, ref.Seed);
      const rowsPath = path.join(dir, 'rows.csv');
      const rowsSha = createHash('sha256').update(readFileSync(rowsPath)).digest('hex');
      const table = WorldLoader.RowTable(ref.ID);
      const wantStamp = `${ref.ID}/seed-${ref.Seed}#${rowsSha}`;
      const currentStamp = await DatasetStamp.Read(ctx.Pool, table);
      if (currentStamp !== wantStamp) {
        await WorldLoader.LoadSeed(ctx.Pool, ref.ID, dir);
      }
      const manifest = SafeJSONParse<ManifestRowCount>(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const rowCount = manifest?.rowCount ?? 0;
      const entity = TruthEntities.ForTable(ctx.Provider, table);
      return { Ref: ref, Dir: dir, Entity: entity, RowCount: rowCount, RowsSha256: rowsSha };
    }

    if (ref.Kind === 'scenario') {
      const entry = DatasetCatalog.Find('scenario', ref.ID);
      const dir = await DatasetCatalog.EnsureGenerated(entry, ref.Seed);
      const rowsPath = path.join(dir, 'rows.csv');
      const rowsSha = createHash('sha256').update(readFileSync(rowsPath)).digest('hex');
      const table = ScenarioLoader.ScenarioTable(ref.ID);
      const wantStamp = `${ref.ID}/seed-${ref.Seed}#${rowsSha}`;
      const currentStamp = await DatasetStamp.Read(ctx.Pool, table);
      if (currentStamp !== wantStamp) {
        await ScenarioLoader.LoadSeed(ctx.Pool, ref.ID, dir);
      }
      const manifest = SafeJSONParse<ManifestRowCount>(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const rowCount = manifest?.nRows ?? 0;
      const entity = TruthEntities.ForTable(ctx.Provider, table);
      return { Ref: ref, Dir: dir, Entity: entity, RowCount: rowCount, RowsSha256: rowsSha };
    }

    // series-origin
    const entry = DatasetCatalog.Find('scenario', ref.ID);
    const dir = await DatasetCatalog.EnsureGenerated(entry, ref.Seed);
    const rowsPath = path.join(dir, 'rows.csv');
    const rowsSha = createHash('sha256').update(readFileSync(rowsPath)).digest('hex');
    const frameTable = ScenarioLoader.SeriesFrameTable(ref.ID);
    const wantFrameStamp = `${ref.ID}/seed-${ref.Seed}#${rowsSha}`;
    const currentFrameStamp = await DatasetStamp.Read(ctx.Pool, frameTable);
    if (currentFrameStamp !== wantFrameStamp) {
      await ScenarioLoader.LoadSeriesFrame(ctx.Pool, ref.ID, dir);
    }
    const trainTable = ScenarioLoader.SeriesTrainTable(ref.ID);
    const wantTrainStamp = `${ref.ID}/seed-${ref.Seed}/origin-${ref.Origin}#${rowsSha}`;
    const currentTrainStamp = await DatasetStamp.Read(ctx.Pool, trainTable);
    let rowCount: number;
    if (currentTrainStamp !== wantTrainStamp) {
      const summary = await ScenarioLoader.FillSeriesTrain(ctx.Pool, ref.ID, ref.Origin, dir);
      rowCount = summary.Rows;
    } else {
      const cntRes = await ctx.Pool.request().query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM pstruth.[${trainTable}]`);
      rowCount = Number(cntRes.recordset[0]?.cnt ?? 0);
    }
    const entity = TruthEntities.ForTable(ctx.Provider, trainTable);
    return { Ref: ref, Dir: dir, Entity: entity, RowCount: rowCount, RowsSha256: rowsSha };
  }

  /** Count non-null values in `column` (`TruthScore`) on the dataset's `pstruth` table. */
  public static async CountNonNull(
    ctx: { Pool: DatasetPool },
    dataset: LoadedDataset,
    column: 'TruthScore',
  ): Promise<number> {
    const table = dataset.Entity.BaseTable;
    await BulkLoader.AssertDirectSqlOptIn(ctx.Pool, table);
    const res = await ctx.Pool
      .request()
      .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM pstruth.[${table}] WHERE [${column}] IS NOT NULL`);
    return Number(res.recordset[0]?.cnt ?? 0);
  }

  /** Reset `column` (`TruthScore`) to NULL on the dataset's `pstruth` table. */
  public static async ResetColumn(
    ctx: { Pool: DatasetPool },
    dataset: LoadedDataset,
    column: 'TruthScore',
  ): Promise<void> {
    const table = dataset.Entity.BaseTable;
    await BulkLoader.AssertDirectSqlOptIn(ctx.Pool, table);
    await ctx.Pool.request().query(`UPDATE pstruth.[${table}] SET [${column}] = NULL WHERE [${column}] IS NOT NULL`);
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
