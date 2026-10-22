import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sql from 'mssql';
import { SafeJSONParse } from '@memberjunction/global';
import { BulkLoader } from './bulk-load';
import { TruthCsv, type SqlCell } from './csv';
import { DatasetStamp } from './stamp';
import type { LoadSummary } from './world-loader';

interface RollingOriginSpec {
  K: number;
  H: number;
  firstTestPeriod?: number;
}

interface ScenarioManifest {
  id: string;
  seed?: number;
  nRows: number;
  rollingOrigin?: RollingOriginSpec;
  planted?: {
    nPeriods?: number;
    rollingOrigin?: RollingOriginSpec;
  } | null;
}

/** Bulk loader for planted and real scenarios (`Scn_<ID>`, `SeriesFrame_<ID>`, `SeriesTrain_<ID>`). */
export class ScenarioLoader {
  public static TableSuffix(scenarioId: string): string {
    return scenarioId.replace(/-/g, '');
  }

  public static ScenarioTable(scenarioId: string): string {
    return `Scn_${ScenarioLoader.TableSuffix(scenarioId)}`;
  }

  public static SeriesFrameTable(scenarioId: string): string {
    return `SeriesFrame_${ScenarioLoader.TableSuffix(scenarioId)}`;
  }

  public static SeriesTrainTable(scenarioId: string): string {
    return `SeriesTrain_${ScenarioLoader.TableSuffix(scenarioId)}`;
  }

  private static resolvePaths(dirOrPrefix: string): { rowsPath: string; manifestPath: string } {
    if (dirOrPrefix.endsWith('.rows.csv')) {
      return {
        rowsPath: dirOrPrefix,
        manifestPath: dirOrPrefix.replace(/\.rows\.csv$/, '.manifest.json'),
      };
    }
    return {
      rowsPath: path.join(dirOrPrefix, 'rows.csv'),
      manifestPath: path.join(dirOrPrefix, 'manifest.json'),
    };
  }

  /** Delete existing rows of `Scn_<ID>`, bulk-load `rows.csv`, check row count against `manifest.nRows`, and stamp the table. */
  public static async LoadSeed(pool: sql.ConnectionPool, scenarioId: string, dir: string): Promise<LoadSummary> {
    const t0 = performance.now();
    const table = ScenarioLoader.ScenarioTable(scenarioId);
    await BulkLoader.AssertDirectSqlOptIn(pool, table);
    const { rowsPath, manifestPath } = ScenarioLoader.resolvePaths(dir);
    const manifest = SafeJSONParse<ScenarioManifest>(readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest.nRows !== 'number') {
      throw new Error(`Invalid or missing manifest at ${manifestPath}`);
    }

    await pool.request().query(`DELETE FROM pstruth.[${table}];`);
    await BulkLoader.LoadCsvFile(pool, table, rowsPath);

    const countRes = await pool.request().query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM pstruth.[${table}]`);
    const actualRows = Number(countRes.recordset[0]?.cnt ?? 0);
    if (actualRows !== manifest.nRows) {
      throw new Error(
        `ScenarioLoader.LoadSeed(${scenarioId}): loaded row count ${actualRows} differs from manifest nRows ${manifest.nRows}`,
      );
    }

    const rowsSha = createHash('sha256').update(readFileSync(rowsPath)).digest('hex');
    const seedTag = path.basename(dir).startsWith('seed-')
      ? path.basename(dir)
      : `seed-${manifest.seed ?? 'real'}`;
    const stampVal = `${scenarioId}/${seedTag}#${rowsSha}`;
    await DatasetStamp.Write(pool, table, stampVal);

    return {
      Table: `pstruth.${table}`,
      Rows: actualRows,
      People: 0,
      Ms: Math.round(performance.now() - t0),
    };
  }

  /** Populate `SeriesFrame_<ID>` with `rows.csv` plus computed calendar columns `MonthIndex`, `MonthOfYear`, and `Month`. */
  public static async LoadSeriesFrame(pool: sql.ConnectionPool, scenarioId: string, dir: string): Promise<LoadSummary> {
    const t0 = performance.now();
    const frameId = scenarioId === 'T3-lag' ? 'T3' : scenarioId;
    const table = ScenarioLoader.SeriesFrameTable(frameId);
    await BulkLoader.AssertDirectSqlOptIn(pool, table);
    const { rowsPath, manifestPath } = ScenarioLoader.resolvePaths(dir);
    TruthCsv.AssertNotTruthFile(rowsPath);
    const manifest = SafeJSONParse<ScenarioManifest>(readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest.nRows !== 'number') {
      throw new Error(`Invalid or missing manifest at ${manifestPath}`);
    }

    const parsed = TruthCsv.Parse(readFileSync(rowsPath, 'utf8'));
    const tIdx = parsed.Header.indexOf('T');
    if (tIdx === -1) {
      throw new Error(`Series CSV ${rowsPath} is missing column 'T'`);
    }

    const ymList = parsed.Rows.map((row) => {
      const cell = row[tIdx] ?? '';
      const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(cell);
      if (!m) throw new Error(`Invalid date '${cell}' in ${rowsPath}`);
      return { year: Number(m[1]), month: Number(m[2]) };
    });
    const minYm = ymList.reduce(
      (acc, cur) => (cur.year * 12 + cur.month < acc.year * 12 + acc.month ? cur : acc),
      ymList[0] ?? { year: 2000, month: 1 },
    );

    const tableCols = await BulkLoader.ReadTableColumns(pool, table);
    const fullHeader = [...parsed.Header, 'MonthIndex', 'MonthOfYear', 'Month'];
    TruthCsv.AssertHeaderOrder(
      fullHeader,
      tableCols.map((c) => c.Name),
    );
    const colByName = new Map(tableCols.map((c) => [c.Name, c]));
    const activeCols = fullHeader.map((name) => {
      const col = colByName.get(name);
      if (!col) throw new Error(`Column '${name}' missing on pstruth.${table}`);
      return col;
    });

    const baseColCount = parsed.Header.length;
    const coercedRows: SqlCell[][] = parsed.Rows.map((row, idx) => {
      const baseCells = parsed.Header.map((_, cIdx) =>
        TruthCsv.CoerceCell(row[cIdx] ?? '', activeCols[cIdx]!.SqlType),
      );
      const ym = ymList[idx]!;
      const monthIndex = (ym.year - minYm.year) * 12 + (ym.month - minYm.month);
      const monthOfYear = ym.month;
      const monthStr = `M${String(ym.month).padStart(2, '0')}`;
      return [
        ...baseCells.slice(0, baseColCount),
        monthIndex,
        monthOfYear,
        monthStr,
      ];
    });

    await pool.request().query(`DELETE FROM pstruth.[${table}];`);
    await BulkLoader.Insert(pool, table, activeCols, coercedRows, tableCols);

    const countRes = await pool.request().query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM pstruth.[${table}]`);
    const actualRows = Number(countRes.recordset[0]?.cnt ?? 0);
    if (actualRows !== manifest.nRows) {
      throw new Error(
        `ScenarioLoader.LoadSeriesFrame(${scenarioId}): loaded row count ${actualRows} differs from manifest nRows ${manifest.nRows}`,
      );
    }

    const rowsSha = createHash('sha256').update(readFileSync(rowsPath)).digest('hex');
    const seedTag = path.basename(dir).startsWith('seed-')
      ? path.basename(dir)
      : `seed-${manifest.seed ?? 'real'}`;
    const stampVal = `${frameId}/${seedTag}#${rowsSha}`;
    await DatasetStamp.Write(pool, table, stampVal);

    return {
      Table: `pstruth.${table}`,
      Rows: actualRows,
      People: 0,
      Ms: Math.round(performance.now() - t0),
    };
  }

  /** Refill `SeriesTrain_<ID>` from `SeriesFrame_<ID>` for rolling `origin` (`MonthIndex < firstTestPeriod + 12 * (origin - 1)`). */
  public static async FillSeriesTrain(
    pool: sql.ConnectionPool,
    scenarioId: string,
    origin: number,
    dir?: string,
  ): Promise<LoadSummary> {
    const t0 = performance.now();
    const frameId = scenarioId === 'T3-lag' ? 'T3' : scenarioId;
    const frameTable = ScenarioLoader.SeriesFrameTable(frameId);
    const trainTable = ScenarioLoader.SeriesTrainTable(frameId);
    await BulkLoader.AssertDirectSqlOptIn(pool, trainTable);

    let firstTestPeriod = 96;
    let seedTag = 'seed-base';
    let rowsSha = 'frame';
    if (dir) {
      const { rowsPath, manifestPath } = ScenarioLoader.resolvePaths(dir);
      const manifest = SafeJSONParse<ScenarioManifest>(readFileSync(manifestPath, 'utf8'));
      const ro = manifest?.planted?.rollingOrigin ?? manifest?.rollingOrigin;
      if (ro) {
        firstTestPeriod =
          ro.firstTestPeriod ??
          ((manifest?.planted?.nPeriods ?? manifest?.nRows ?? 240) - ro.K * ro.H);
      }
      seedTag = path.basename(dir).startsWith('seed-')
        ? path.basename(dir)
        : `seed-${manifest?.seed ?? 'real'}`;
      rowsSha = createHash('sha256').update(readFileSync(rowsPath)).digest('hex');
    } else {
      const frameStamp = await DatasetStamp.Read(pool, frameTable);
      if (frameStamp) {
        const [, rest] = frameStamp.split('/');
        const [st, sha] = (rest ?? '').split('#');
        if (st) seedTag = st;
        if (sha) rowsSha = sha;
      }
      if (frameId === 'T1-real') {
        firstTestPeriod = 31;
      }
    }

    const cutoff = firstTestPeriod + 12 * (origin - 1);
    const cols = await BulkLoader.ReadTableColumns(pool, trainTable);
    const colList = cols.map((c) => `[${c.Name}]`).join(', ');

    await pool
      .request()
      .input('cutoff', sql.Int, cutoff)
      .query(
        `DELETE FROM pstruth.[${trainTable}]; INSERT INTO pstruth.[${trainTable}] (${colList}) SELECT ${colList} FROM pstruth.[${frameTable}] WHERE [MonthIndex] < @cutoff;`,
      );

    const countRes = await pool
      .request()
      .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM pstruth.[${trainTable}]`);
    const actualRows = Number(countRes.recordset[0]?.cnt ?? 0);
    await DatasetStamp.Write(pool, trainTable, `${frameId}/${seedTag}/origin-${origin}#${rowsSha}`);

    return {
      Table: `pstruth.${trainTable}`,
      Rows: actualRows,
      People: 0,
      Ms: Math.round(performance.now() - t0),
    };
  }
}
