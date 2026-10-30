/**
 * Loads the C1 corpus fixture into the pstruth C1 tables. Touches only the eight C1 tables, so a world
 * or scenario loaded by the world and scenario loaders stays in place. Bulk insert through `mssql` (a TruthSuite dependency).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { BulkLoader } from '../db/bulk-load';

export const C1_CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'c1-corpus');

export interface C1CsvTable { readonly Header: readonly string[]; readonly Rows: readonly Readonly<Record<string, string>>[] }

/**
 * The C1 corpus fixture: read and verify its committed CSVs and load them into the pstruth C1 tables (static members
 * on one owner class rather than free exported functions).
 */
export class C1CorpusFixture {
  /** Parse one fixture CSV (unquoted by construction: the builder refuses values needing quotes). */
  public static async ReadC1CorpusCsv(path: string): Promise<C1CsvTable> {
    const text = await readFile(path, 'utf8');
    const lines = text.split('\n').filter((l) => l.length > 0);
    const header = lines[0].split(',');
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',');
      if (cells.length !== header.length) throw new Error(`${path}: row has ${cells.length} cells, header has ${header.length}`);
      const row: Record<string, string> = {};
      header.forEach((h, i) => { row[h] = cells[i]; });
      return row;
    });
    return { Header: header, Rows: rows };
  }

  /**
   * Throws naming `truth:provision` unless every table's `PS Truth:` entity sanctions direct inserts and deletes
   * (`.claude/rules/data-access.md`). A physical read of `__mj.Entity`, parameterised.
   */
  public static async RequireDirectSQLOptIn(pool: sql.ConnectionPool, tables: readonly string[]): Promise<void> {
    const request = pool.request();
    tables.forEach((name, i) => request.input(`t${i}`, sql.NVarChar(128), name));
    const placeholders = tables.map((_, i) => `@t${i}`).join(', ');
    const res = await request.query<{ BaseTable: string }>(`SELECT BaseTable FROM __mj.Entity WHERE SchemaName = 'pstruth' AND BaseTable IN (${placeholders}) AND AllowDirectSQLInsert = 1 AND AllowDirectSQLDelete = 1`);
    const sanctioned = new Set(res.recordset.map((r) => r.BaseTable));
    const missing = tables.filter((name) => !sanctioned.has(name));
    if (missing.length > 0) throw new Error(`direct SQL is not sanctioned on pstruth.${missing.join(', pstruth.')}: run truth:provision (it pushes TruthSuite/metadata)`);
  }

  /** Files whose SHA-256 differs from SHA256SUMS (empty when the fixture is intact). */
  public static async VerifyC1CorpusChecksums(dir: string): Promise<string[]> {
    const sums = (await readFile(join(dir, 'SHA256SUMS'), 'utf8')).split('\n').filter((l) => l.length > 0);
    const bad: string[] = [];
    for (const line of sums) {
      const [expected, name] = line.split(/\s+/);
      const actual = createHash('sha256').update(await readFile(join(dir, name))).digest('hex');
      if (actual !== expected) bad.push(name);
    }
    return bad;
  }

  /** Replace the C1 tables' contents with the fixture; returns the row count per table. Refuses a corrupted fixture. */
  public static async LoadC1Corpus(pool: sql.ConnectionPool, dir: string = C1_CORPUS_DIR): Promise<Record<string, number>> {
    const bad = await C1CorpusFixture.VerifyC1CorpusChecksums(dir);
    if (bad.length > 0) throw new Error(`C1 corpus fixture checksum mismatch: ${bad.join(', ')}`);
    // Bulk DML is these entities' declared path: `metadata/entities/.pstruth-c1-entities.json` sets their
    // AllowDirectSQLInsert/Delete (with TrackRecordChanges and server-cache trust off, DeleteType Hard), and the loader
    // checks the flags before any DML. Nothing outside the eight C1 tables is touched; product entities are always
    // written through BaseEntity.
    const deleteOrder = ['C1DuesPeriod', 'C1Person', 'C1OrderHeader', 'C1NonduesLine', 'C1EventAttendance', 'C1CourseCompletion', 'C1Certification', 'C1CommitteeMembership'];
    await C1CorpusFixture.RequireDirectSQLOptIn(pool, deleteOrder);
    for (const t of deleteOrder) await pool.request().query(`DELETE FROM [pstruth].[${t}]`);
    const counts: Record<string, number> = {};
    for (const load of LOADS) {
      const csv = await C1CorpusFixture.ReadC1CorpusCsv(join(dir, load.Csv));
      const table = new sql.Table(`[pstruth].[${load.Table}]`);
      // Each bulk column declares the table's own nullability: SQL Server rejects a column declared nullable when the
      // table's column is NOT NULL ("Invalid column type from bcp client").
      const nullable = new Map((await BulkLoader.ReadTableColumns(pool, load.Table)).map((c) => [c.Name, c.IsNullable]));
      for (const c of load.Columns) {
        const type = c.Type === 'uuid' ? sql.UniqueIdentifier : c.Type === 'date' ? sql.Date : c.Type === 'int' ? sql.Int : c.Type === 'decimal' ? sql.Decimal(18, 2) : sql.NVarChar(50);
        const isNullable = nullable.get(c.Column);
        if (isNullable === undefined) throw new Error(`pstruth.${load.Table} has no column ${c.Column}: run truth:provision`);
        table.columns.add(c.Column, type, { nullable: isNullable });
      }
      for (const row of csv.Rows) {
        table.rows.add(...load.Columns.map((c) => {
          const v = row[c.Csv];
          if (v === '') return null;
          if (c.Type === 'int') return Number.parseInt(v, 10);
          if (c.Type === 'decimal') return Number.parseFloat(v);
          if (c.Type === 'date') return new Date(`${v}T00:00:00Z`);
          return v;
        }));
      }
      await pool.request().bulk(table);
      const n = await pool.request().query<{ n: number }>(`SELECT COUNT(*) AS n FROM [pstruth].[${load.Table}]`);
      counts[load.Table] = n.recordset[0].n;
      if (counts[load.Table] !== csv.Rows.length) throw new Error(`${load.Table}: loaded ${counts[load.Table]} of ${csv.Rows.length} rows`);
    }
    return counts;
  }
}


interface TableLoad { readonly Csv: string; readonly Table: string; readonly Columns: readonly { readonly Csv: string; readonly Column: string; readonly Type: 'uuid' | 'date' | 'int' | 'decimal' | 'text' }[] }

const LOADS: readonly TableLoad[] = [
  { Csv: 'people.csv', Table: 'C1Person', Columns: [{ Csv: 'PersonID', Column: 'ID', Type: 'uuid' }, { Csv: 'JoinDate', Column: 'JoinDate', Type: 'date' }, { Csv: 'Segment', Column: 'Segment', Type: 'text' }, { Csv: 'Region', Column: 'Region', Type: 'text' }] },
  { Csv: 'order_headers.csv', Table: 'C1OrderHeader', Columns: [{ Csv: 'OrderID', Column: 'ID', Type: 'uuid' }, { Csv: 'PersonID', Column: 'PersonID', Type: 'uuid' }, { Csv: 'OrderDate', Column: 'OrderDate', Type: 'date' }, { Csv: 'Status', Column: 'Status', Type: 'text' }, { Csv: 'OrderType', Column: 'OrderType', Type: 'text' }, { Csv: 'ReversesOrderID', Column: 'ReversesOrderID', Type: 'uuid' }, { Csv: 'ReversedOn', Column: 'ReversedOn', Type: 'date' }] },
  { Csv: 'dues_periods.csv', Table: 'C1DuesPeriod', Columns: [{ Csv: 'DuesPeriodID', Column: 'ID', Type: 'uuid' }, { Csv: 'PersonID', Column: 'PersonID', Type: 'uuid' }, { Csv: 'PeriodIndex', Column: 'PeriodIndex', Type: 'int' }, { Csv: 'OrderDate', Column: 'OrderDate', Type: 'date' }, { Csv: 'TierSKU', Column: 'TierSKU', Type: 'text' }, { Csv: 'OrderID', Column: 'OrderID', Type: 'uuid' }] },
  { Csv: 'nondues_lines.csv', Table: 'C1NonduesLine', Columns: [{ Csv: 'LineID', Column: 'ID', Type: 'uuid' }, { Csv: 'PersonID', Column: 'PersonID', Type: 'uuid' }, { Csv: 'OrderID', Column: 'OrderID', Type: 'uuid' }, { Csv: 'OrderDate', Column: 'OrderDate', Type: 'date' }, { Csv: 'LineTotalNet', Column: 'LineTotalNet', Type: 'decimal' }, { Csv: 'ReversedOn', Column: 'ReversedOn', Type: 'date' }] },
  { Csv: 'event_attendances.csv', Table: 'C1EventAttendance', Columns: [{ Csv: 'AttendanceID', Column: 'ID', Type: 'uuid' }, { Csv: 'PersonID', Column: 'PersonID', Type: 'uuid' }, { Csv: 'EventDate', Column: 'EventDate', Type: 'date' }] },
  { Csv: 'course_completions.csv', Table: 'C1CourseCompletion', Columns: [{ Csv: 'CompletionID', Column: 'ID', Type: 'uuid' }, { Csv: 'PersonID', Column: 'PersonID', Type: 'uuid' }, { Csv: 'CompletedOn', Column: 'CompletedOn', Type: 'date' }] },
  { Csv: 'certifications.csv', Table: 'C1Certification', Columns: [{ Csv: 'CertificationID', Column: 'ID', Type: 'uuid' }, { Csv: 'PersonID', Column: 'PersonID', Type: 'uuid' }, { Csv: 'AwardedOn', Column: 'AwardedOn', Type: 'date' }, { Csv: 'ExpiresOn', Column: 'ExpiresOn', Type: 'date' }] },
  { Csv: 'committee_memberships.csv', Table: 'C1CommitteeMembership', Columns: [{ Csv: 'CommitteeMembershipID', Column: 'ID', Type: 'uuid' }, { Csv: 'PersonID', Column: 'PersonID', Type: 'uuid' }, { Csv: 'StartDate', Column: 'StartDate', Type: 'date' }, { Csv: 'EndDate', Column: 'EndDate', Type: 'date' }] },
];
