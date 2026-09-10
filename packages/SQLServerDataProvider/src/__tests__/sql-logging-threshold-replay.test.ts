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
import { EntitySaveOptions } from '@memberjunction/core';
import { SqlLoggingSessionImpl } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import { TEST_USER, makeWidgetEntityInfo, makeSavedWidgetEntity, savedWidgetRow } from './helpers/entity-fixtures';

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
