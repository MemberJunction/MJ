import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { DatasetCatalog } from '../data/catalog';
import { GoldenHashes } from '../data/golden';
import { TruthEntities } from '../harness/entities';
import type { DatasetRef, LoadedDataset } from '../harness/types';
import { BulkLoader, type TableColumnSpec, type TextRows } from './bulk-load';
import { TruthCsv, type SqlCell } from './csv';
import { DatasetStamp } from './stamp';

/** What a load needs: the provider whose metadata holds the `pstruth` entities, the user, and the truth pool. */
export interface DatasetLoadContext {
  readonly Provider: IMetadataProvider;
  readonly User: UserInfo;
  readonly Pool: sql.ConnectionPool;
}

/** One row as column name → cell text (the shape a CSV row has). */
export type DatasetRow = Record<string, string>;

/** Rows that replace a dataset's `rows.csv` for one load (the seam a test uses to feed bad rows). */
export type DatasetRowSource = () => AsyncIterable<DatasetRow>;

/** The two manifest shapes the generators write: worlds count `rowCount` (and `nPersons` people), scenarios `nRows`. */
interface DatasetManifest {
  rowCount?: number;
  nPersons?: number;
  nRows?: number;
  planted?: { rollingOrigin?: RollingOriginSpec } | null;
}

/** The rolling-origin split a series manifest plants: K origins of H periods, from the first test period. */
interface RollingOriginSpec {
  K: number;
  H: number;
  firstTestPeriod?: number;
}

/** One table a load replaces: its prepared rows, the count the manifest expects, and the stamp it gets. */
interface TableReplacement {
  Table: string;
  Columns: TableColumnSpec[];
  TableColumns: TableColumnSpec[];
  Rows: SqlCell[][];
  ExpectedRows: number;
  Stamp: string;
}

/** The rows of one load: from the dataset's `rows.csv`, or from a row source. */
interface RowsInput {
  Rows: TextRows;
  /** sha256 of the rows' bytes: the CSV file, or the row source's canonical JSON. */
  Sha256: string;
  /** True for a row source: its stamp never matches a generated dataset's, so the next `Load` reloads. */
  FromSource: boolean;
}

/**
 * Loads the generated datasets into their `pstruth` tables. A base seed's generated `rows.csv` and `truth.csv` are first
 * compared with fixtures/golden-hashes.json, and a mismatch throws before anything is loaded. Every load runs in one
 * transaction: delete the table's rows, bulk-insert the new ones, compare the inserted count with the manifest, write
 * the stamp, commit. Any error rolls the whole load back, so a table never carries a stamp for rows it does not hold.
 */
export class DatasetLoader {
  /** Ensure the dataset is generated and loaded (skipped when the table's stamp already names these rows). */
  public static async Load(ctx: DatasetLoadContext, ref: DatasetRef): Promise<LoadedDataset> {
    return DatasetLoader.load(ctx, ref, null);
  }

  /** Load the dataset with `rows` in place of its `rows.csv`, whatever the current stamp. */
  public static async LoadWithRowSource(ctx: DatasetLoadContext, ref: DatasetRef, rows: DatasetRowSource): Promise<LoadedDataset> {
    return DatasetLoader.load(ctx, ref, rows);
  }

  /** `Scn_<ID>` (the scenario id without hyphens). */
  public static ScenarioTable(scenarioId: string): string {
    return `Scn_${DatasetLoader.tableSuffix(scenarioId)}`;
  }

  /** `W<n>_MembershipYear`, or `W9_EventRegistration` for the multiclass world. */
  public static WorldRowTable(worldId: string): string {
    const prefix = DatasetLoader.worldPrefix(worldId);
    return prefix === 'W9' ? 'W9_EventRegistration' : `${prefix}_MembershipYear`;
  }

  /** `W<n>_Person`. */
  public static WorldPersonTable(worldId: string): string {
    return `${DatasetLoader.worldPrefix(worldId)}_Person`;
  }

  /** `SeriesFrame_<ID>`. */
  public static SeriesFrameTable(scenarioId: string): string {
    return `SeriesFrame_${DatasetLoader.tableSuffix(scenarioId)}`;
  }

  /** `SeriesTrain_<ID>`. */
  public static SeriesTrainTable(scenarioId: string): string {
    return `SeriesTrain_${DatasetLoader.tableSuffix(scenarioId)}`;
  }

  private static async load(ctx: DatasetLoadContext, ref: DatasetRef, source: DatasetRowSource | null): Promise<LoadedDataset> {
    const entry = DatasetCatalog.Find(ref.Kind === 'world' ? 'world' : 'scenario', ref.ID);
    const dir = await DatasetCatalog.EnsureGenerated(entry, ref.Seed);
    GoldenHashes.Verify(entry, ref.Seed, dir);
    const manifest = DatasetLoader.ReadManifest(dir);
    const input = source ? await DatasetLoader.ReadSource(source) : DatasetLoader.ReadCsv(path.join(dir, 'rows.csv'));
    const stamp = DatasetLoader.StampValue(ref.ID, ref.Seed, input);

    if (ref.Kind === 'world') {
      const table = DatasetLoader.WorldRowTable(ref.ID);
      if (source || (await DatasetStamp.Read(ctx.Pool, table)) !== stamp) {
        await DatasetLoader.loadWorld(ctx, ref.ID, dir, manifest, input, stamp);
      }
      return DatasetLoader.loaded(ctx, ref, dir, table, DatasetLoader.ExpectedRows(manifest, 'rowCount', dir), input.Sha256);
    }

    if (ref.Kind === 'scenario') {
      const table = DatasetLoader.ScenarioTable(ref.ID);
      if (source || (await DatasetStamp.Read(ctx.Pool, table)) !== stamp) {
        const tableColumns = await DatasetLoader.prepareTable(ctx, table);
        const prepared = BulkLoader.CoerceRows(table, input.Rows, tableColumns);
        await DatasetLoader.replaceTables(ctx.Pool, [{
          Table: table, Columns: prepared.Columns, TableColumns: tableColumns, Rows: prepared.Rows,
          ExpectedRows: DatasetLoader.ExpectedRows(manifest, 'nRows', dir), Stamp: stamp,
        }]);
      }
      return DatasetLoader.loaded(ctx, ref, dir, table, DatasetLoader.ExpectedRows(manifest, 'nRows', dir), input.Sha256);
    }

    return DatasetLoader.loadSeriesOrigin(ctx, ref, dir, manifest, input, stamp, source !== null);
  }

  /** The frame holds the whole series; the train table holds the frame's rows before this origin's cutoff. */
  private static async loadSeriesOrigin(
    ctx: DatasetLoadContext,
    ref: Extract<DatasetRef, { Kind: 'series-origin' }>,
    dir: string,
    manifest: DatasetManifest,
    input: RowsInput,
    stamp: string,
    force: boolean,
  ): Promise<LoadedDataset> {
    const frameTable = DatasetLoader.SeriesFrameTable(ref.ID);
    if (force || (await DatasetStamp.Read(ctx.Pool, frameTable)) !== stamp) {
      await DatasetLoader.loadSeriesFrame(ctx, frameTable, manifest, input, stamp, dir);
    }
    const trainTable = DatasetLoader.SeriesTrainTable(ref.ID);
    const trainStamp = DatasetLoader.StampValue(ref.ID, ref.Seed, input, ref.Origin);
    const rowCount =
      force || (await DatasetStamp.Read(ctx.Pool, trainTable)) !== trainStamp
        ? await DatasetLoader.fillSeriesTrain(ctx, frameTable, trainTable, DatasetLoader.Cutoff(manifest, ref.Origin, dir), trainStamp)
        : await DatasetLoader.countRows(ctx, trainTable);
    return DatasetLoader.loaded(ctx, ref, dir, trainTable, rowCount, input.Sha256);
  }

  private static loaded(ctx: DatasetLoadContext, ref: DatasetRef, dir: string, table: string, rowCount: number, sha: string): LoadedDataset {
    return { Ref: ref, Dir: dir, Entity: TruthEntities.ForTable(ctx.Provider, table), RowCount: rowCount, RowsSha256: sha };
  }

  /** People first (the rows reference them), then the rows; both tables carry the same stamp. */
  private static async loadWorld(
    ctx: DatasetLoadContext,
    worldId: string,
    dir: string,
    manifest: DatasetManifest,
    input: RowsInput,
    stamp: string,
  ): Promise<void> {
    const personTable = DatasetLoader.WorldPersonTable(worldId);
    const rowTable = DatasetLoader.WorldRowTable(worldId);
    const personColumns = await DatasetLoader.prepareTable(ctx, personTable);
    const rowColumns = await DatasetLoader.prepareTable(ctx, rowTable);
    const people = DatasetLoader.ReadCsv(path.join(dir, 'people.csv')).Rows;
    const preparedPeople = BulkLoader.CoerceRows(personTable, people, personColumns);
    const preparedRows = BulkLoader.CoerceRows(rowTable, input.Rows, rowColumns);
    await DatasetLoader.replaceTables(ctx.Pool, [
      { Table: personTable, Columns: preparedPeople.Columns, TableColumns: personColumns, Rows: preparedPeople.Rows,
        ExpectedRows: DatasetLoader.ExpectedRows(manifest, 'nPersons', dir), Stamp: stamp },
      { Table: rowTable, Columns: preparedRows.Columns, TableColumns: rowColumns, Rows: preparedRows.Rows,
        ExpectedRows: DatasetLoader.ExpectedRows(manifest, 'rowCount', dir), Stamp: stamp },
    ]);
  }

  /** The series rows plus the calendar columns the pipelines train on: `MonthIndex`, `MonthOfYear`, `Month`. */
  private static async loadSeriesFrame(
    ctx: DatasetLoadContext,
    table: string,
    manifest: DatasetManifest,
    input: RowsInput,
    stamp: string,
    dir: string,
  ): Promise<void> {
    const tIdx = input.Rows.Header.indexOf('T');
    if (tIdx === -1) {
      throw new Error(`Series rows for pstruth.${table} are missing column 'T'`);
    }
    const months = input.Rows.Rows.map((row) => {
      const cell = row[tIdx] ?? '';
      const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(cell);
      if (!m) throw new Error(`Invalid date '${cell}' in the series rows for pstruth.${table}`);
      return Number(m[1]) * 12 + (Number(m[2]) - 1);
    });
    const first = Math.min(...months);
    const withCalendar: TextRows = {
      Header: [...input.Rows.Header, 'MonthIndex', 'MonthOfYear', 'Month'],
      Rows: input.Rows.Rows.map((row, idx) => {
        const month = (months[idx]! % 12) + 1;
        return [...row, String(months[idx]! - first), String(month), `M${String(month).padStart(2, '0')}`];
      }),
    };
    const tableColumns = await DatasetLoader.prepareTable(ctx, table);
    const prepared = BulkLoader.CoerceRows(table, withCalendar, tableColumns);
    await DatasetLoader.replaceTables(ctx.Pool, [{
      Table: table, Columns: prepared.Columns, TableColumns: tableColumns, Rows: prepared.Rows,
      ExpectedRows: DatasetLoader.ExpectedRows(manifest, 'nRows', dir), Stamp: stamp,
    }]);
  }

  /** Refill the train table from the frame's rows before `cutoff`, in one transaction; returns the rows inserted. */
  private static async fillSeriesTrain(
    ctx: DatasetLoadContext,
    frameTable: string,
    trainTable: string,
    cutoff: number,
    stamp: string,
  ): Promise<number> {
    const columns = await DatasetLoader.prepareTable(ctx, trainTable);
    const colList = columns.map((c) => `[${c.Name}]`).join(', ');
    return DatasetLoader.inTransaction(ctx.Pool, async (tx) => {
      await new sql.Request(tx).query(`DELETE FROM pstruth.[${trainTable}];`);
      const res = await new sql.Request(tx)
        .input('cutoff', sql.Int, cutoff)
        .query(`INSERT INTO pstruth.[${trainTable}] (${colList}) SELECT ${colList} FROM pstruth.[${frameTable}] WHERE [MonthIndex] < @cutoff;`);
      await DatasetStamp.Write(tx, trainTable, stamp);
      return res.rowsAffected[0] ?? 0; // `??`: an empty train set (0 rows) is a legitimate count
    });
  }

  /**
   * Replace every table's rows in one transaction: delete children before parents (the reverse of `tables`), insert
   * parents first, re-check the foreign keys the bulk insert skipped, compare each inserted count with the manifest's,
   * stamp each table, commit. Any error rolls everything back and rethrows.
   */
  private static async replaceTables(pool: sql.ConnectionPool, tables: TableReplacement[]): Promise<void> {
    await DatasetLoader.inTransaction(pool, async (tx) => {
      for (const t of [...tables].reverse()) {
        await new sql.Request(tx).query(`DELETE FROM pstruth.[${t.Table}];`);
      }
      for (const t of tables) {
        const inserted = await BulkLoader.Insert(tx, t.Table, t.Columns, t.Rows, t.TableColumns);
        if (inserted !== t.ExpectedRows) {
          throw new Error(`pstruth.${t.Table}: loaded row count ${inserted} differs from the manifest's ${t.ExpectedRows}`);
        }
        await new sql.Request(tx).query(`ALTER TABLE pstruth.[${t.Table}] WITH CHECK CHECK CONSTRAINT ALL;`);
      }
      for (const t of tables) {
        await DatasetStamp.Write(tx, t.Table, t.Stamp);
      }
    });
  }

  private static async inTransaction<T>(pool: sql.ConnectionPool, work: (tx: sql.Transaction) => Promise<T>): Promise<T> {
    const tx = new sql.Transaction(pool);
    // A batch-aborting error makes SQL Server roll the transaction back itself; mssql then reports `aborted` and a
    // second rollback would throw over the error that caused it.
    let abortedByServer = false;
    tx.on('rollback', (aborted: boolean) => {
      abortedByServer = aborted;
    });
    await tx.begin();
    try {
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (err) {
      if (!abortedByServer) await tx.rollback();
      throw err;
    }
  }

  /** The table's columns, after checking its entity sanctions direct SQL (read before the transaction opens). */
  private static async prepareTable(ctx: DatasetLoadContext, table: string): Promise<TableColumnSpec[]> {
    BulkLoader.AssertDirectSqlOptIn(TruthEntities.ForTable(ctx.Provider, table));
    return BulkLoader.ReadTableColumns(ctx.Pool, table);
  }

  /** The train table's row count when it is already loaded for this origin. */
  private static async countRows(ctx: DatasetLoadContext, table: string): Promise<number> {
    const entity = TruthEntities.ForTable(ctx.Provider, table);
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView(
      { EntityName: entity.Name, ResultType: 'count_only', BypassCache: true },
      ctx.User,
    );
    if (!res.Success) throw new Error(`count ${entity.Name}: ${res.ErrorMessage}`);
    return res.TotalRowCount ?? 0;
  }

  /** `<id>/seed-<seed>[/origin-<origin>]#<sha>`; a row source's sha is prefixed so it never equals a generated one. */
  protected static StampValue(id: string, seed: number, input: RowsInput, origin?: number): string {
    const originPart = origin === undefined ? '' : `/origin-${origin}`;
    return `${id}/${DatasetLoader.SeedTag(seed)}${originPart}#${input.FromSource ? 'source-' : ''}${input.Sha256}`;
  }

  protected static SeedTag(seed: number): string {
    return `seed-${seed}`;
  }

  protected static ReadManifest(dir: string): DatasetManifest {
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = SafeJSONParse<DatasetManifest>(readFileSync(manifestPath, 'utf8'));
    if (!manifest) throw new Error(`Invalid or missing manifest at ${manifestPath}`);
    return manifest;
  }

  protected static ExpectedRows(manifest: DatasetManifest, key: 'rowCount' | 'nPersons' | 'nRows', dir: string): number {
    const n = manifest[key];
    if (typeof n !== 'number') throw new Error(`manifest.json in ${dir} has no numeric '${key}'`);
    return n;
  }

  /**
   * The first test period of the rolling-origin split, moved 12 periods per origin. Every series manifest records
   * `planted.rollingOrigin.firstTestPeriod` (make_scenario.ts), so a manifest without it throws.
   */
  protected static Cutoff(manifest: DatasetManifest, origin: number, dir: string): number {
    const firstTestPeriod = manifest.planted?.rollingOrigin?.firstTestPeriod;
    if (typeof firstTestPeriod !== 'number') {
      throw new Error(`manifest.json in ${dir} has no planted.rollingOrigin.firstTestPeriod: it is not a series dataset`);
    }
    return firstTestPeriod + 12 * (origin - 1);
  }

  /** A generated `rows.csv` (refusing truth files) and the sha256 of its bytes. */
  protected static ReadCsv(csvPath: string): RowsInput {
    TruthCsv.AssertNotTruthFile(csvPath);
    const bytes = readFileSync(csvPath);
    return { Rows: TruthCsv.Parse(bytes.toString('utf8')), Sha256: DatasetLoader.Sha256(bytes), FromSource: false };
  }

  /** A row source's rows under the first row's columns, and the sha256 of their JSON. */
  protected static async ReadSource(source: DatasetRowSource): Promise<RowsInput> {
    const records: DatasetRow[] = [];
    for await (const row of source()) records.push(row);
    const header = records.length > 0 ? Object.keys(records[0]!) : [];
    return {
      Rows: { Header: header, Rows: records.map((r) => header.map((c) => r[c] ?? '')) },
      Sha256: DatasetLoader.Sha256(Buffer.from(JSON.stringify(records))),
      FromSource: true,
    };
  }

  protected static Sha256(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  private static tableSuffix(scenarioId: string): string {
    return scenarioId.replace(/-/g, '');
  }

  private static worldPrefix(worldId: string): string {
    const m = /^(W[1-9])\b/.exec(worldId);
    if (!m) throw new Error(`Invalid world ID '${worldId}' (expected W1..W9 prefix)`);
    return m[1]!;
  }
}
