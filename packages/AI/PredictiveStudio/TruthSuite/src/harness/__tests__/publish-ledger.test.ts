import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { HarnessPublishLedger, type LedgerCountRow, type LedgerStatementRunner } from '../publish-ledger';
import { RunRecords } from '../cleanup';

const P1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const M1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const TABLES = { PublishRecords: '[__mj].[MLModelPublishRecord]', Models: '[__mj].[MLModel]', TrainingRuns: '[__mj].[MLTrainingRun]' };

function records(pipelines: readonly string[], models: readonly string[]): RunRecords {
  const r = new RunRecords();
  for (const p of pipelines) r.RecordPipeline(p);
  for (const m of models) r.RecordModel(m);
  return r;
}

const RUN_MODELS = `SELECT N.[ID] FROM (VALUES ('${M1}')) AS N([ID]) UNION SELECT M.[ID] FROM [__mj].[MLModel] M WHERE M.[PipelineID] IN ('${P1}')`;
const WHERE = `[ModelID] IN (${RUN_MODELS}) OR [ReplacesModelID] IN (${RUN_MODELS}) OR [TrainingRunID] IN (SELECT R.[ID] FROM [__mj].[MLTrainingRun] R WHERE R.[PipelineID] IN ('${P1}'))`;

describe('HarnessPublishLedger.MatchClause (D4-279)', () => {
  it("matches the records naming one of the run's models (recorded, or of a recorded pipeline) or a training run of a recorded pipeline", () => {
    expect(HarnessPublishLedger.MatchClause(records([P1], [M1]), TABLES)).toBe(WHERE);
  });

  it('matches by the recorded models alone when the run recorded no pipeline', () => {
    const models = `SELECT N.[ID] FROM (VALUES ('${M1}')) AS N([ID])`;
    expect(HarnessPublishLedger.MatchClause(records([], [M1]), TABLES)).toBe(`[ModelID] IN (${models}) OR [ReplacesModelID] IN (${models})`);
  });

  it('matches nothing when the run recorded no pipeline and no model', () => {
    expect(HarnessPublishLedger.MatchClause(records([], []), TABLES)).toBeNull();
  });

  it('escapes every ID it writes into the statement', () => {
    expect(HarnessPublishLedger.MatchClause(records(["p'q"], []), TABLES)).toContain(`IN ('p''q')`);
  });
});

/**
 * A fake pool over a table of publish records: a DELETE removes `deletes` of the rows the clause matches (all of them
 * by default), a COUNT returns how many matched rows are left, and a `failWith` makes every statement throw. It records
 * each statement it ran.
 */
class FakeLedgerPool implements LedgerStatementRunner {
  public readonly Statements: string[] = [];
  constructor(private matched: number, private readonly deletes: number = matched, private readonly failWith: string | null = null) {}
  public request(): { query(statement: string): Promise<{ readonly recordset: readonly LedgerCountRow[] }> } {
    return { query: (statement: string) => this.run(statement) };
  }
  private async run(statement: string): Promise<{ readonly recordset: readonly LedgerCountRow[] }> {
    this.Statements.push(statement);
    if (this.failWith !== null) throw new Error(this.failWith);
    if (statement.startsWith('DELETE')) {
      this.matched -= Math.min(this.deletes, this.matched);
      return { recordset: [] };
    }
    return { recordset: [{ Remaining: this.matched }] };
  }
}

const TABLE_OF: Record<string, string> = { 'MJ: ML Model Publish Records': 'MLModelPublishRecord', 'MJ: ML Models': 'MLModel', 'MJ: ML Training Runs': 'MLTrainingRun' };
const ledgerProvider = {
  EntityByName: (name: string): EntityInfo | undefined =>
    TABLE_OF[name] === undefined ? undefined : new EntityInfo({ Name: name, SchemaName: '__mj', BaseTable: TABLE_OF[name] }),
};

describe('HarnessPublishLedger.Delete (D4-279)', () => {
  it("deletes the run's publish records in one statement, then recounts them, and reports nothing when none is left", async () => {
    const pool = new FakeLedgerPool(3);
    expect(await HarnessPublishLedger.Delete(pool, ledgerProvider, records([P1], [M1]))).toEqual([]);
    expect(pool.Statements).toEqual([
      `DELETE FROM [__mj].[MLModelPublishRecord] WHERE ${WHERE}`,
      `SELECT COUNT(*) AS Remaining FROM [__mj].[MLModelPublishRecord] WHERE ${WHERE}`,
    ]);
  });

  it('names the count the recount still finds', async () => {
    const pool = new FakeLedgerPool(3, 1);
    expect(await HarnessPublishLedger.Delete(pool, ledgerProvider, records([P1], [M1])))
      .toEqual(["MJ: ML Model Publish Records: 2 of the run's publish records still present after the delete"]);
  });

  it('returns a failed statement as its line instead of throwing', async () => {
    const pool = new FakeLedgerPool(3, 3, 'connection closed');
    expect(await HarnessPublishLedger.Delete(pool, ledgerProvider, records([P1], [M1])))
      .toEqual(["MJ: ML Model Publish Records: deleting the run's publish records failed: connection closed"]);
  });

  it('runs no statement when the run recorded nothing, and names an entity the metadata lacks', async () => {
    const pool = new FakeLedgerPool(3);
    expect(await HarnessPublishLedger.Delete(pool, ledgerProvider, records([], []))).toEqual([]);
    expect(await HarnessPublishLedger.Delete(pool, { EntityByName: () => undefined }, records([P1], []))).toEqual([
      "MJ: ML Model Publish Records: not in the provider's metadata, so the run's publish records were not deleted",
    ]);
    expect(pool.Statements).toEqual([]);
  });
});
