/**
 * The dated `Person.Status` history the W4 world implies, written as `MJ: Record Changes` rows of the test entity
 * `pstruth.W4_Person`, so the as-of assembly can replay the status a person held on each decision day. The W4 world
 * stores only the final status on the Person row; the membership years say when it changed.
 */
import sql from 'mssql';
import { RunView } from '@memberjunction/core';
import type { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { UtcDay } from '@memberjunction/predictive-studio';
import type { TruthHarness } from '../harness/types';
import { TruthConnection } from '../db/connection';
import { UnitFixtures } from './unit-fixtures';

/** One person's status timeline: Active from `ActiveFrom`, Lapsed from `LapsedFrom` (null = never lapsed). */
export interface StatusSpan { readonly ActiveFrom: Date; readonly LapsedFrom: Date | null }
/** Each person's status timeline, keyed by lower-cased PersonID. */
export type StatusTimeline = ReadonlyMap<string, StatusSpan>;
/** One W4 membership year as the timeline reads it. */
export interface W4MembershipYearRow { readonly PersonID: string; readonly Year: number; readonly Renewed: boolean | null }

/** Record Change writes in flight at once: bounded so thousands of saves never exhaust MJAPI's connection pool. */
const WRITE_BATCH = 100;

/** The W4 Person.Status history fixture, as static members on one owner class. */
export class W4StatusHistory {
  /**
   * Writes the dated `Person.Status` history the W4 world implies as `MJ: Record Changes` rows for the test entity
   * `pstruth.W4_Person`, idempotently: a row an earlier run wrote is kept, and only the missing rows are written.
   * Record Changes are an append-only audit trail (no role may delete one), so an earlier row this fixture would not
   * write cannot be removed and fails the fixture instead. `Update` rows are saved through the entity layer; `Create`
   * rows by direct SQL only because the entity refuses them (see `writeCreateRows`). Returns the timeline.
   */
  public static async WriteW4StatusHistory(h: TruthHarness): Promise<StatusTimeline> {
    const pool: sql.ConnectionPool = await TruthConnection.OpenPool();
    try {
      const timeline = await W4StatusHistory.readTimeline(pool);
      const personEntity = h.Provider.EntityByName(UnitFixtures.TruthEntityName(h, 'W4_Person'));
      if (!personEntity) throw new Error('pstruth.W4_Person is not registered');
      const existing = await W4StatusHistory.readExistingRows(h, personEntity.ID, timeline);
      await W4StatusHistory.writeCreateRows(pool, h, personEntity.ID, [...timeline].filter(([id]) => !existing.has(W4StatusHistory.rowKey(id, 'Create'))));
      await W4StatusHistory.saveUpdateRows(h, personEntity.ID, [...timeline].filter(([id]) => !existing.has(W4StatusHistory.rowKey(id, 'Update'))));
      return timeline;
    } finally {
      await pool.close();
    }
  }

  /**
   * Each person's timeline from their membership years (in year order): Active from 1 January of the first cycle (the
   * cycle's StartDate), Lapsed from 1 January after the first cycle they did not renew.
   */
  public static BuildTimeline(years: readonly W4MembershipYearRow[]): Map<string, StatusSpan> {
    const timeline = new Map<string, StatusSpan>();
    for (const y of [...years].sort((a, b) => a.Year - b.Year)) {
      const k = y.PersonID.toLowerCase();
      const t = timeline.get(k) || { ActiveFrom: new Date(Date.UTC(y.Year, 0, 1)), LapsedFrom: null };
      timeline.set(k, y.Renewed === false && t.LapsedFrom === null ? { ...t, LapsedFrom: new Date(Date.UTC(y.Year + 1, 0, 1)) } : t);
    }
    return timeline;
  }

  /** The status the timeline says was in force at the end of a decision day; null when the person had not joined. */
  public static ExpectedStatusAt(timeline: StatusTimeline, personId: string, decision: Date): string | null {
    const t = timeline.get(personId.toLowerCase());
    if (!t) return null;
    const asOf = UtcDay.AddUtcDays(decision, 1).getTime();
    if (asOf <= t.ActiveFrom.getTime()) return null;
    return t.LapsedFrom !== null && t.LapsedFrom.getTime() < asOf ? 'Lapsed' : 'Active';
  }

  /** The W4 membership years, read from the test schema. */
  private static async readTimeline(pool: sql.ConnectionPool): Promise<Map<string, StatusSpan>> {
    const years = await pool.request().query<W4MembershipYearRow>('SELECT CONVERT(nvarchar(36), PersonID) AS PersonID, [Year], Renewed FROM pstruth.W4_MembershipYear');
    return W4StatusHistory.BuildTimeline(years.recordset);
  }

  /** The key of one fixture row: the person's RecordID, the row type and the instant it is dated at. */
  private static rowKey(personId: string, type: 'Create' | 'Update'): string {
    return `ID|${personId.toUpperCase()}|${type}`;
  }

  /** The instant the timeline dates a person's row of `type` at; null when the person has no such row. */
  private static rowInstant(span: StatusSpan, type: MJRecordChangeEntity['Type']): Date | null {
    return type === 'Create' ? span.ActiveFrom : type === 'Update' ? span.LapsedFrom : null;
  }

  /**
   * The keys of the entity's Record Changes an earlier run of this fixture wrote. Any other row of the entity (another
   * type, another person, another instant) throws: the audit trail cannot be edited, so the replay would read it.
   */
  private static async readExistingRows(h: TruthHarness, entityID: string, timeline: StatusTimeline): Promise<ReadonlySet<string>> {
    const res = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJRecordChangeEntity, 'RecordID' | 'Type' | 'ChangedAt'>>({
      EntityName: 'MJ: Record Changes', ExtraFilter: `EntityID='${EscapeSQLString(entityID)}'`, Fields: ['RecordID', 'Type', 'ChangedAt'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    }, h.User);
    if (!res.Success) throw new Error(`reading earlier W4 Record Changes failed: ${res.ErrorMessage}`);
    const keys = new Set<string>();
    let foreign = 0;
    for (const r of res.Results) {
      const personId = r.RecordID.replace(/^ID\|/, '');
      const span = timeline.get(personId.toLowerCase());
      const at = span ? W4StatusHistory.rowInstant(span, r.Type) : null;
      if ((r.Type !== 'Create' && r.Type !== 'Update') || at === null || at.getTime() !== new Date(r.ChangedAt).getTime()) { foreign++; continue; }
      keys.add(W4StatusHistory.rowKey(personId, r.Type));
    }
    if (foreign > 0) throw new Error(`pstruth.W4_Person has ${foreign} Record Change(s) this fixture does not write; Record Changes cannot be deleted, so the dated history cannot be rebuilt`);
    return keys;
  }

  /**
   * The `Create` rows, by direct SQL: `MJRecordChangeEntityServer.CheckPermissions` refuses a caller-created
   * `Source='Internal'`, `Type='Create'` row ("written by the platform and cannot be created through the API"), so the
   * entity layer cannot write them. Confined to this fixture, the test entity's rows and the suite's own database.
   */
  private static async writeCreateRows(pool: sql.ConnectionPool, h: TruthHarness, entityID: string, people: readonly (readonly [string, StatusSpan])[]): Promise<void> {
    if (people.length === 0) return;
    const table = new sql.Table('[__mj].[RecordChange]');
    table.columns.add('EntityID', sql.UniqueIdentifier, { nullable: false });
    table.columns.add('RecordID', sql.NVarChar(750), { nullable: false });
    table.columns.add('UserID', sql.UniqueIdentifier, { nullable: false });
    table.columns.add('Type', sql.NVarChar(20), { nullable: false });
    table.columns.add('Source', sql.NVarChar(20), { nullable: false });
    table.columns.add('ChangedAt', sql.DateTimeOffset, { nullable: false });
    table.columns.add('ChangesJSON', sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add('ChangesDescription', sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add('FullRecordJSON', sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add('Status', sql.NVarChar(50), { nullable: false });
    for (const [personId, t] of people) {
      const id = personId.toUpperCase();
      table.rows.add(entityID, `ID|${id}`, h.User.ID, 'Create', 'Internal', t.ActiveFrom, '{}', 'Record Created', JSON.stringify({ ID: id, Status: 'Active' }), 'Complete');
    }
    await pool.request().bulk(table);
  }

  /** The `Update` rows (Active → Lapsed), saved through the entity layer in bounded batches; a failed save throws with its message. */
  private static async saveUpdateRows(h: TruthHarness, entityID: string, people: readonly (readonly [string, StatusSpan])[]): Promise<void> {
    const lapsed = people.filter((e): e is [string, StatusSpan & { readonly LapsedFrom: Date }] => e[1].LapsedFrom !== null);
    const failed = await W4StatusHistory.inBatches(lapsed, async ([personId, t]) => {
      const id = personId.toUpperCase();
      const rc = await h.Provider.GetEntityObject<MJRecordChangeEntity>('MJ: Record Changes', h.User);
      rc.NewRecord();
      rc.EntityID = entityID;
      rc.RecordID = `ID|${id}`;
      rc.UserID = h.User.ID;
      rc.Type = 'Update';
      rc.Source = 'Internal';
      rc.ChangedAt = t.LapsedFrom;
      rc.ChangesJSON = JSON.stringify({ Status: { field: 'Status', oldValue: 'Active', newValue: 'Lapsed' } });
      rc.ChangesDescription = 'Status: Active → Lapsed';
      rc.FullRecordJSON = JSON.stringify({ ID: id, Status: 'Lapsed' });
      rc.Status = 'Complete';
      return (await rc.Save()) ? null : rc.LatestResult?.CompleteMessage || 'save failed';
    });
    if (failed.length > 0) throw new Error(`saving W4 Record Change updates failed (${failed.length}): ${failed[0]}`);
  }

  /** Runs `work` over `items`, `WRITE_BATCH` at a time in parallel; returns every failure message. */
  private static async inBatches<T>(items: readonly T[], work: (item: T) => Promise<string | null>): Promise<string[]> {
    const failed: string[] = [];
    for (let i = 0; i < items.length; i += WRITE_BATCH) {
      const outcomes = await Promise.all(items.slice(i, i + WRITE_BATCH).map(work));
      failed.push(...outcomes.filter((m): m is string => m !== null));
    }
    return failed;
  }
}
