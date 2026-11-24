/**
 * The `MJ: ML Model Publish Records` a harness run's own models caused: the lifecycle gate's sign-off, publish and
 * refusal rows naming one of the run's models (as the model or the model it replaced) or one of its training runs (a
 * run-level refusal names only the run). The ledger is append-only for every API caller (review item 1 of PR #6517,
 * D4-279): MJAPI's `PredictiveStudioPublishRecordGuard` refuses each delete the gate harness sends over GraphQL. So the
 * gate harness deletes its own fixture rows with SQL over its own pool, before the entity-layer cleanup deletes their
 * models, as it deletes the run's notifications ({@link HarnessNotifications}). The match is by the run's pipelines and
 * models only, so no other run's rows are touched. An in-process cleanup (the TruthSuite DB lane) deletes them through
 * the entity layer under the guard's one-shot authorisation instead.
 */
import type { IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { RunRecords } from './cleanup';

/**
 * What {@link HarnessPublishLedger.Delete} runs its two statements through: the harness's own pool (`DatasetPool`, an
 * mssql `ConnectionPool`) in a run, a fake in a unit test.
 */
export interface LedgerStatementRunner {
  /** A new request on the connection. */
  // case-violation-ok-legacy-back-compat: mirrors mssql's ConnectionPool.request(), which the harness's pool satisfies as is
  request(): {
    /** Runs one statement and returns its rows (the recount's single row; the DELETE returns none). */
    query(statement: string): Promise<{ readonly recordset: readonly LedgerCountRow[] }>;
  };
}

/** The recount's row. */
export interface LedgerCountRow {
  /** How many of the run's publish records are still present. */
  readonly Remaining: number;
}

/** The tables the match reads, as `[schema].[table]`. */
export interface LedgerTables {
  readonly PublishRecords: string;
  readonly Models: string;
  readonly TrainingRuns: string;
}

/** Finds and deletes the publish records of one harness run. */
export class HarnessPublishLedger {
  /** The entity whose rows are deleted. */
  public static readonly ENTITY_NAME = 'MJ: ML Model Publish Records';

  /**
   * The WHERE clause matching the run's publish records: `ModelID` or `ReplacesModelID` one of the run's models (recorded,
   * or of a recorded pipeline), or `TrainingRunID` a training run of a recorded pipeline; null when the run recorded no
   * pipeline and no model. Pure.
   */
  public static MatchClause(records: Pick<RunRecords, 'PipelineIDs' | 'ModelIDs'>, tables: LedgerTables): string | null {
    const pipelines = HarnessPublishLedger.idList([...records.PipelineIDs]);
    const models = HarnessPublishLedger.idList([...records.ModelIDs]);
    if (pipelines === null && models === null) return null;
    const modelSources = [
      ...(models === null ? [] : [`SELECT N.[ID] FROM (VALUES ${[...records.ModelIDs].map((id) => `('${EscapeSQLString(id)}')`).join(',')}) AS N([ID])`]),
      ...(pipelines === null ? [] : [`SELECT M.[ID] FROM ${tables.Models} M WHERE M.[PipelineID] IN (${pipelines})`]),
    ];
    const runModels = modelSources.join(' UNION ');
    const terms = [`[ModelID] IN (${runModels})`, `[ReplacesModelID] IN (${runModels})`];
    if (pipelines !== null) terms.push(`[TrainingRunID] IN (SELECT R.[ID] FROM ${tables.TrainingRuns} R WHERE R.[PipelineID] IN (${pipelines}))`);
    return terms.join(' OR ');
  }

  /**
   * Delete the run's publish records through `pool` (one statement: a consumer and the sign-off it names go together),
   * then recount; returns one line naming the count still present (none when every row went). Never throws: a failed
   * statement is returned as its line.
   */
  public static async Delete(pool: LedgerStatementRunner, provider: Pick<IMetadataProvider, 'EntityByName'>, records: Pick<RunRecords, 'PipelineIDs' | 'ModelIDs'>): Promise<string[]> {
    const tables = HarnessPublishLedger.tablesOf(provider);
    if (typeof tables === 'string') return [tables];
    const where = HarnessPublishLedger.MatchClause(records, tables);
    if (where === null) return [];
    try {
      await pool.request().query(`DELETE FROM ${tables.PublishRecords} WHERE ${where}`);
      const left = await pool.request().query(`SELECT COUNT(*) AS Remaining FROM ${tables.PublishRecords} WHERE ${where}`);
      const remaining = left.recordset[0]?.Remaining || 0;
      return remaining === 0 ? [] : [`${HarnessPublishLedger.ENTITY_NAME}: ${remaining} of the run's publish records still present after the delete`];
    } catch (e) {
      return [`${HarnessPublishLedger.ENTITY_NAME}: deleting the run's publish records failed: ${e instanceof Error ? e.message : String(e)}`];
    }
  }

  /** The three tables from the provider's metadata, or the line naming the entity it lacks. */
  private static tablesOf(provider: Pick<IMetadataProvider, 'EntityByName'>): LedgerTables | string {
    const table = (name: string): string | null => {
      const entity = provider.EntityByName(name);
      return entity ? `[${entity.SchemaName}].[${entity.BaseTable}]` : null;
    };
    const names = [HarnessPublishLedger.ENTITY_NAME, 'MJ: ML Models', 'MJ: ML Training Runs'] as const;
    const [publishRecords, models, trainingRuns] = names.map(table);
    const missing = names.find((n) => table(n) === null);
    if (missing !== undefined || publishRecords === null || models === null || trainingRuns === null) {
      return `${missing || HarnessPublishLedger.ENTITY_NAME}: not in the provider's metadata, so the run's publish records were not deleted`;
    }
    return { PublishRecords: publishRecords, Models: models, TrainingRuns: trainingRuns };
  }

  /** IDs as a quoted, escaped SQL list; null for none. */
  private static idList(ids: readonly string[]): string | null {
    return ids.length === 0 ? null : ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
  }
}
