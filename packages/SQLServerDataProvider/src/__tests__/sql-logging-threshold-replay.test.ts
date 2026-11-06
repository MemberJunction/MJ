/**
 * End-to-end: two Save() calls on ONE record, logged through the real SqlLoggingSessionImpl at
 * the Explorer session defaults (GO, variableBatchThreshold 200, logRecordChangeMetadata false),
 * must produce a capture whose batches never redeclare a variable.
 *
 * The save-call suffix is deterministic per record (GenericDatabaseProvider.allocateSaveCallSuffix),
 * so both saves emit identical DECLARE lists; only the logger's redeclaration guard keeps the
 * capture replayable. Real code under test: Save() → GenerateSaveSQL → RenderSaveCallBinding →
 * the simpleSQLFallback hand-off → SqlLoggingSessionImpl. Only mssql is mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { EntityDeleteOptions, EntitySaveOptions } from '@memberjunction/core';
import { SqlLoggingSessionImpl } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import {
  TEST_USER,
  TestEntity,
  makeRecordChangesEntityInfo,
  makeWidgetEntityInfo,
  makeSavedWidgetEntity,
  savedWidgetRow,
} from './helpers/entity-fixtures';

interface ProviderPrivateSurface {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  _needsDatetimeOffsetAdjustment: boolean;
}

/**
 * Same hermetic harness as save-delete-paths.test.ts, plus a logging session wired through the
 * provider's own _logSqlStatement hook (which is what CreateSqlLogger sessions receive).
 */
class LoggingTestProvider extends SQLServerDataProvider {
  public Session: SqlLoggingSessionImpl | null = null;
  private testEntities: EntityInfo[] = [];

  public override get Entities(): EntityInfo[] {
    return this.testEntities;
  }

  public override get MJCoreSchemaName(): string {
    return '__mj';
  }

  public SetTestEntities(entities: EntityInfo[]): void {
    this.testEntities = entities;
  }

  public AttachPool(pool: MockConnectionPool): void {
    const surface = this as unknown as ProviderPrivateSurface;
    surface._pool = pool;
    surface._datetimeOffsetTestComplete = true;
    surface._needsDatetimeOffsetAdjustment = false;
  }

  protected override async _logSqlStatement(
    query: string,
    parameters?: unknown,
    description?: string,
    ignoreLogging: boolean = false,
    isMutation: boolean = false,
    simpleSQLFallback?: string,
    _contextUser?: UserInfo,
  ): Promise<void> {
    if (ignoreLogging || !this.Session) {
      return;
    }
    await this.Session.logSqlStatement(query, parameters, description, isMutation, simpleSQLFallback);
  }

  protected override async HandleEntityActions(_entity: BaseEntity, _baseType: 'save' | 'delete' | 'validate', _before: boolean): Promise<never[]> {
    return [];
  }

  protected override async HandleEntityAIActions(): Promise<void> {
    // no-op — AI engine not under test
  }
}

describe('SQL logging capture of the same record saved twice (threshold mode)', () => {
  let dir: string;

  beforeEach(() => {
    mssqlState.Reset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-threshold-replay-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function saveTwiceAndCapture(options: { variableBatchThreshold?: number }): Promise<string> {
    const info = makeWidgetEntityInfo();
    const provider = new LoggingTestProvider();
    provider.AttachPool(new MockConnectionPool());
    provider.SetTestEntities([info]);

    const file = path.join(dir, 'capture.sql');
    provider.Session = new SqlLoggingSessionImpl('threshold-replay', file, {
      batchSeparator: 'GO',
      logRecordChangeMetadata: false,
      statementTypes: 'mutations',
      ...options,
    });
    await provider.Session.initialize();

    const first = makeSavedWidgetEntity(info, TEST_USER);
    const second = makeSavedWidgetEntity(info, TEST_USER);
    first.Set('Name', 'Once');
    second.Set('Name', 'Twice');
    mssqlState.QueueResult({ rows: [{ ...savedWidgetRow(), Name: 'Once' }] });
    mssqlState.QueueResult({ rows: [{ ...savedWidgetRow(), Name: 'Twice' }] });

    expect(await provider.Save(first, TEST_USER, new EntitySaveOptions())).toBeTruthy();
    expect(await provider.Save(second, TEST_USER, new EntitySaveOptions())).toBeTruthy();

    await provider.Session.dispose();
    return fs.readFileSync(file, 'utf8');
  }

  it('Explorer defaults (threshold 200): identical suffixes, and a GO between the two DECLARE lists', async () => {
    const text = await saveTwiceAndCapture({ variableBatchThreshold: 200 });

    const suffixes = [...text.matchAll(/@Name(_[0-9a-f]{12}(?:_\d+)?)/g)].map((m) => m[1]);
    expect(suffixes.length).toBeGreaterThan(0);
    expect(new Set(suffixes).size).toBe(1); // deterministic: same record → same suffix on both saves

    const batches = text.split(/^GO\s*$/m);
    expect(batches.length).toBe(2); // exactly one separator, between the saves
    for (const batch of batches) {
      const declared = [...batch.matchAll(/(@\w+)\s+(?:NVARCHAR|BIT|INT|UNIQUEIDENTIFIER|DATETIMEOFFSET)/gi)].map((m) => m[1].toLowerCase());
      expect(new Set(declared).size).toBe(declared.length); // no batch redeclares a variable
    }
  });

  it('legacy mode (no threshold) still separates after every statement', async () => {
    const text = await saveTwiceAndCapture({});
    expect((text.match(/^GO\s*$/gm) ?? []).length).toBe(2);
  });
});

/**
 * Saves and deletes run with typed parameters (saveParameters.ts), but every log and capture still
 * gets the statement with its values written in: a capture must replay on its own, with no
 * parameters to bind. Judged by what readers of the log need, not by bytes.
 */
describe('SQL logging of statements that ran with typed parameters', () => {
  let dir: string;

  beforeEach(() => {
    mssqlState.Reset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-param-log-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function capture(logRecordChangeMetadata: boolean, run: (provider: LoggingTestProvider) => Promise<void>): Promise<string> {
    const provider = new LoggingTestProvider();
    provider.AttachPool(new MockConnectionPool());
    provider.SetTestEntities([makeRecordChangesEntityInfo()]);
    const file = path.join(dir, 'capture.sql');
    provider.Session = new SqlLoggingSessionImpl('param-log', file, { batchSeparator: 'GO', logRecordChangeMetadata, statementTypes: 'mutations' });
    await provider.Session.initialize();
    await run(provider);
    await provider.Session.dispose();
    return fs.readFileSync(file, 'utf8');
  }

  async function saveRenamed(provider: LoggingTestProvider, trackRecordChanges: boolean): Promise<void> {
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo({ trackRecordChanges }), TEST_USER);
    entity.Set('Name', "O'Neil 😀");
    mssqlState.QueueResult({ rows: [{ ...savedWidgetRow(), Name: "O'Neil 😀" }] });
    expect(await provider.Save(entity, TEST_USER, new EntitySaveOptions())).toBeTruthy();
  }

  /** No parameter reference, no executed-form variable, no parameter comment: the text stands alone. */
  function expectSelfContained(text: string): void {
    expect(text).not.toMatch(/@p\$\d/);
    expect(text).not.toMatch(/@\w+\$/);
    expect(text).not.toContain('-- Parameters:');
  }

  it('the default session (logRecordChangeMetadata off) captures the replay form with values written in', async () => {
    const text = await capture(false, (p) => saveRenamed(p, true));
    expectSelfContained(text);
    expect(text).toMatch(/SET @Name_[0-9a-f]{12} = N'O''Neil 😀'/);
    expect(text).not.toContain('spCreateRecordChange_Internal');
  });

  it('a session with logRecordChangeMetadata on captures the full statement, Record Change included, with values written in', async () => {
    const text = await capture(true, (p) => saveRenamed(p, true));
    expectSelfContained(text);
    expect(text).toMatch(/SET @Name_[0-9a-f]{12} = N'O''Neil 😀'/);
    expect(text).toContain('spCreateRecordChange_Internal');
    expect(text).toContain(`@UserID='${TEST_USER.ID}'`);
  });

  it('a delete is captured with its key written in, in the form the PG migration gate counts', async () => {
    const id = '82DFF26B-2ABB-4A69-8718-1FE550B60816';
    const text = await capture(false, async (provider) => {
      const entity = new TestEntity(makeWidgetEntityInfo({ trackRecordChanges: true }));
      entity.ContextCurrentUser = TEST_USER;
      entity.SetMany({ ...savedWidgetRow(), ID: id }, false, true, true);
      mssqlState.QueueResult({ rows: [{ ID: id }] });
      expect(await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER)).toBe(true);
    });
    expectSelfContained(text);
    // SS_SYNC_DELETE from scripts/check-pg-migration-content.mjs, which counts mj-sync deletions.
    const ssSyncDelete = /EXEC\s+\[?[\w${}:]+\]?\s*\.\s*\[?spDelete\w+\]?\s+@ID\s*=\s*N?'[0-9a-fA-F-]{36}'/gi;
    expect(text.match(ssSyncDelete)).toEqual([`EXEC [dbo].[spDeleteWidget] @ID='${id}'`]);
  });
});
