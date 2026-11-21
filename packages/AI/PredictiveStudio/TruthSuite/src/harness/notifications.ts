/**
 * The `MJ: User Notifications` a harness run's own rows caused (D4-146): the lifecycle gate's notifications about the
 * run's models and pipelines (`PublishNotifications`, the drift alert: `ResourceRecordID` is the model's or, for a run
 * stopped at Evaluate with no model, the pipeline's ID), and the scheduler's notifications about the one-off jobs the
 * run's checks created (`ResourceConfiguration` names the job as `"scheduledJobId":"<id>"`). The suite user may not
 * delete `MJ: User Notifications` through the entity layer, so cleanup deletes them with SQL over the harness's own
 * pool, matched only by those IDs, as the M4b.4 harness does.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { RunRecords } from './cleanup';

/** The IDs a run's notifications are matched by. */
export interface NotificationSubjects {
  /** The run's models and pipelines (a notification's `ResourceRecordID`). */
  readonly RecordIDs: readonly string[];
  /** The run's one-off scheduled jobs (named in a notification's `ResourceConfiguration`). */
  readonly ScheduledJobIDs: readonly string[];
}

/**
 * What {@link HarnessNotifications.Delete} runs its two statements through: the harness's own pool (`DatasetPool`, an
 * mssql `ConnectionPool`) in a run, a fake in a unit test.
 */
export interface NotificationStatementRunner {
  /** A new request on the connection. */
  // case-violation-ok-legacy-back-compat: mirrors mssql's ConnectionPool.request(), which the harness's pool satisfies as is
  request(): {
    /** Runs one statement and returns its rows (the recount's single row; the DELETE returns none). */
    query(statement: string): Promise<{ readonly recordset: readonly NotificationCountRow[] }>;
  };
}

/** The recount's row. */
export interface NotificationCountRow {
  /** How many of the run's notifications are still present. */
  readonly Remaining: number;
}

/** Finds and deletes the notifications of one harness run. */
export class HarnessNotifications {
  /** The entity whose rows are deleted. */
  public static readonly ENTITY_NAME = 'MJ: User Notifications';

  /**
   * The run's subjects: its recorded pipelines and models, every model of a recorded pipeline (read past the cache), and
   * its recorded scheduled jobs. Read before cleanup deletes the rows, which also empties `records`.
   *
   * @throws Error when the models of the recorded pipelines cannot be read
   */
  public static async SubjectsOf(provider: IMetadataProvider, user: UserInfo, records: RunRecords): Promise<NotificationSubjects> {
    const pipelineIds = [...records.PipelineIDs];
    const recordIds = [...pipelineIds, ...records.ModelIDs];
    if (pipelineIds.length > 0) {
      const r = await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLModelEntity, 'ID'>>({
        EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID IN (${HarnessNotifications.idList(pipelineIds)})`,
        Fields: ['ID'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
      }, user);
      if (!r.Success) throw new Error(`reading the models of the run's pipelines for their notifications failed: ${r.ErrorMessage}`);
      recordIds.push(...r.Results.map((m) => m.ID));
    }
    return { RecordIDs: recordIds, ScheduledJobIDs: [...records.ScheduledJobIDs] };
  }

  /**
   * The WHERE clause matching the subjects' notifications: `ResourceRecordID` one of the record IDs, or a
   * `ResourceConfiguration` naming one of the jobs; null when there is nothing to match. Pure.
   */
  public static MatchClause(s: NotificationSubjects): string | null {
    const terms: string[] = [];
    if (s.RecordIDs.length > 0) terms.push(`[ResourceRecordID] IN (${HarnessNotifications.idList(s.RecordIDs)})`);
    for (const job of s.ScheduledJobIDs) terms.push(`[ResourceConfiguration] LIKE N'%"scheduledJobId":"${EscapeSQLString(job)}"%'`);
    return terms.length === 0 ? null : terms.join(' OR ');
  }

  /**
   * Delete the subjects' notifications through `pool`, then read what is left; returns one line naming the count still
   * present (none when every row went). Never throws: a failed statement is returned as its line.
   */
  public static async Delete(pool: NotificationStatementRunner, provider: Pick<IMetadataProvider, 'EntityByName'>, s: NotificationSubjects): Promise<string[]> {
    const where = HarnessNotifications.MatchClause(s);
    if (where === null) return [];
    const entity = provider.EntityByName(HarnessNotifications.ENTITY_NAME);
    if (!entity) return [`${HarnessNotifications.ENTITY_NAME}: not in the provider's metadata, so the run's notifications were not deleted`];
    const table = `[${entity.SchemaName}].[${entity.BaseTable}]`;
    try {
      await pool.request().query(`DELETE FROM ${table} WHERE ${where}`);
      const left = await pool.request().query(`SELECT COUNT(*) AS Remaining FROM ${table} WHERE ${where}`);
      const remaining = left.recordset[0]?.Remaining || 0;
      return remaining === 0 ? [] : [`${HarnessNotifications.ENTITY_NAME}: ${remaining} of the run's notifications still present after the delete`];
    } catch (e) {
      return [`${HarnessNotifications.ENTITY_NAME}: deleting the run's notifications failed: ${e instanceof Error ? e.message : String(e)}`];
    }
  }

  /** IDs as a quoted, escaped SQL list. */
  private static idList(ids: readonly string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
  }
}
