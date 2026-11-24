import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { HarnessNotifications, type NotificationCountRow, type NotificationStatementRunner } from '../notifications';
import { RunRecords } from '../cleanup';

const P1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const M1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const J1 = 'cccccccc-0000-0000-0000-000000000001';

describe('HarnessNotifications.MatchClause (D4-146)', () => {
  it('matches the notifications about the run’s models and pipelines by ResourceRecordID, and its jobs by the scheduler’s configuration', () => {
    expect(HarnessNotifications.MatchClause({ RecordIDs: [P1, M1], ScheduledJobIDs: [J1] }))
      .toBe(`[ResourceRecordID] IN ('${P1}','${M1}') OR [ResourceConfiguration] LIKE N'%"scheduledJobId":"${J1}"%'`);
  });

  it('matches nothing when the run has no subjects', () => {
    expect(HarnessNotifications.MatchClause({ RecordIDs: [], ScheduledJobIDs: [] })).toBeNull();
  });

  it('escapes every ID it writes into the statement', () => {
    expect(HarnessNotifications.MatchClause({ RecordIDs: ["x'y"], ScheduledJobIDs: ["j'k"] }))
      .toBe(`[ResourceRecordID] IN ('x''y') OR [ResourceConfiguration] LIKE N'%"scheduledJobId":"j''k"%'`);
  });
});

describe('RunRecords.RecordScheduledJob', () => {
  it('records each job once, case-insensitively, keeping the first spelling', () => {
    const r = new RunRecords();
    r.RecordScheduledJob(J1);
    r.RecordScheduledJob(J1.toUpperCase());
    expect([...r.ScheduledJobIDs]).toEqual([J1]);
  });
});

/**
 * A fake pool over a table of notification rows: a DELETE removes `deletes` of the rows the clause matches (all of them
 * by default), a COUNT returns how many matched rows are left, and a `failWith` makes every statement throw. It
 * records each statement it ran.
 */
class FakeNotificationPool implements NotificationStatementRunner {
  /** Every statement run, in order. */
  public readonly Statements: string[] = [];
  constructor(private matched: number, private readonly deletes: number = matched, private readonly failWith: string | null = null) {}
  /** A request whose `query` runs one statement against the fake table. */
  public request(): { query(statement: string): Promise<{ readonly recordset: readonly NotificationCountRow[] }> } {
    return { query: (statement: string) => this.run(statement) };
  }
  private async run(statement: string): Promise<{ readonly recordset: readonly NotificationCountRow[] }> {
    this.Statements.push(statement);
    if (this.failWith !== null) throw new Error(this.failWith);
    if (statement.startsWith('DELETE')) {
      this.matched -= Math.min(this.deletes, this.matched);
      return { recordset: [] };
    }
    return { recordset: [{ Remaining: this.matched }] };
  }
}

/** A provider that knows only the notifications entity, as Delete reads it. */
const notificationsProvider = {
  EntityByName: (name: string): EntityInfo | undefined =>
    name === HarnessNotifications.ENTITY_NAME ? new EntityInfo({ Name: name, SchemaName: '__mj', BaseTable: 'UserNotification' }) : undefined,
};
const SUBJECTS = { RecordIDs: [P1, M1], ScheduledJobIDs: [J1] };
const WHERE = `[ResourceRecordID] IN ('${P1}','${M1}') OR [ResourceConfiguration] LIKE N'%"scheduledJobId":"${J1}"%'`;

describe('HarnessNotifications.Delete (D4-146)', () => {
  it('deletes the subjects’ notifications from the entity’s table, then recounts them, and reports nothing when none is left', async () => {
    const pool = new FakeNotificationPool(3);
    expect(await HarnessNotifications.Delete(pool, notificationsProvider, SUBJECTS)).toEqual([]);
    expect(pool.Statements).toEqual([
      `DELETE FROM [__mj].[UserNotification] WHERE ${WHERE}`,
      `SELECT COUNT(*) AS Remaining FROM [__mj].[UserNotification] WHERE ${WHERE}`,
    ]);
  });

  it('names the count the recount still finds', async () => {
    const pool = new FakeNotificationPool(3, 1);
    expect(await HarnessNotifications.Delete(pool, notificationsProvider, SUBJECTS))
      .toEqual(["MJ: User Notifications: 2 of the run's notifications still present after the delete"]);
  });

  it('returns a failed statement as its line instead of throwing', async () => {
    const pool = new FakeNotificationPool(3, 3, 'connection closed');
    expect(await HarnessNotifications.Delete(pool, notificationsProvider, SUBJECTS))
      .toEqual(["MJ: User Notifications: deleting the run's notifications failed: connection closed"]);
  });

  it('runs no statement when the run has no subjects', async () => {
    const pool = new FakeNotificationPool(3);
    expect(await HarnessNotifications.Delete(pool, notificationsProvider, { RecordIDs: [], ScheduledJobIDs: [] })).toEqual([]);
    expect(pool.Statements).toEqual([]);
  });
});
