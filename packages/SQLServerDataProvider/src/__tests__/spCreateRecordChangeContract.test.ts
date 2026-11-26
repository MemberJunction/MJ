/**
 * Contract guard between SQLServerDataProvider's RecordChange SQL rendering
 * (`renderRecordChangeEXEC` + `BuildSiblingRecordChangeSQL`) and the newest
 * `spCreateRecordChange_Internal` + `CHK_RecordChange_Source` definitions in
 * `migrations/` and `SQL Scripts/MJ_BASE_BEFORE_SQL.sql`.
 *
 * Prevents provider-to-schema drift where SQLServerDataProvider passes a named
 * parameter (`@IntegrationID`, `@SuppressReturn`, `@EntityID`, `@ChangeContext`, etc.)
 * or `@Source` value (`'Sync'`) that does not exist in the active migration set.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import type { EntityInfo, RecordChangeSource } from '@memberjunction/core';
import { BaseEntity, EntityDeleteOptions, EntitySaveOptions } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { MockConnectionPool, mssqlState } from './helpers/mock-mssql';
import type { ExecuteSQLOptions } from '../types';
import {
  TEST_USER,
  makeNewWidgetEntity,
  makeRecordChangesEntityInfo,
  makeSavedWidgetEntity,
  makeWidgetEntityInfo,
  savedWidgetRow,
} from './helpers/entity-fixtures';

interface ProviderInternalFields {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  _needsDatetimeOffsetAdjustment: boolean;
}

class RecordChangeContractProvider extends SQLServerDataProvider {
  public CapturedLiteralSQL: string[] = [];
  private testEntities: EntityInfo[] = [];

  public override get Entities(): EntityInfo[] {
    return this.testEntities;
  }

  public override get MJCoreSchemaName(): string {
    return '__mj';
  }

  public ConfigureTestEntities(entities: EntityInfo[]): void {
    this.testEntities = entities;
  }

  public AttachMockPool(pool: MockConnectionPool): void {
    const internal = this as unknown as ProviderInternalFields;
    internal._pool = pool;
    internal._datetimeOffsetTestComplete = true;
    internal._needsDatetimeOffsetAdjustment = false;
  }

  protected override async HandleEntityActions(): Promise<never[]> {
    return [];
  }

  protected override async HandleEntityAIActions(): Promise<void> {
    // no-op in hermetic provider test
  }

  public override async ExecuteSQL<T>(
    query?: string,
    parameters?: unknown[] | Record<string, unknown>,
    options?: ExecuteSQLOptions,
  ): Promise<Array<T>> {
    this.CapturedLiteralSQL.push(options?.literalSQL ?? query ?? '');
    return super.ExecuteSQL<T>(query, parameters, options);
  }

  public RenderSiblingSQL(
    entityInfo: EntityInfo,
    source?: RecordChangeSource,
    changeContext?: string | null,
    integrationID?: string | null,
  ): string {
    return this.BuildSiblingRecordChangeSQL(
      '@_rc_prop_0',
      entityInfo,
      '{}',
      'Sibling update',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      TEST_USER.ID,
      source,
      changeContext,
      integrationID,
    );
  }
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../../..');

function collectVersionedMigrationFiles(dirPath: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectVersionedMigrationFiles(fullPath));
    } else if (entry.isFile() && /^V\d+__.*\.sql$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function parseProcedureParameters(sqlText: string): Set<string> {
  const procHeaderMatch = sqlText.match(
    /CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+(?:\[[^\]]+\]|\$\{flyway:defaultSchema\}|__mj)\.\[?spCreateRecordChange_Internal\]?([\s\S]*?)\bAS\b/i,
  );
  if (!procHeaderMatch) {
    throw new Error('Could not locate spCreateRecordChange_Internal header in SQL text.');
  }
  const params = new Set<string>();
  const paramRegex = /(@[A-Za-z0-9_]+)\s+[A-Za-z]+/g;
  let match: RegExpExecArray | null = paramRegex.exec(procHeaderMatch[1]);
  while (match) {
    params.add(match[1].toLowerCase());
    match = paramRegex.exec(procHeaderMatch[1]);
  }
  return params;
}

function extractExecParameterNames(renderedSQL: string): string[] {
  const execIndex = renderedSQL.indexOf('spCreateRecordChange_Internal');
  if (execIndex < 0) {
    throw new Error(`Expected spCreateRecordChange_Internal in rendered SQL:\n${renderedSQL}`);
  }
  const afterProc = renderedSQL.slice(execIndex + 'spCreateRecordChange_Internal'.length);
  const statementEnd = afterProc.indexOf(';');
  const callBody = statementEnd >= 0 ? afterProc.slice(0, statementEnd) : afterProc;
  const names: string[] = [];
  const argRegex = /(@[A-Za-z0-9_]+)\s*=/g;
  let match: RegExpExecArray | null = argRegex.exec(callBody);
  while (match) {
    names.push(match[1].toLowerCase());
    match = argRegex.exec(callBody);
  }
  return names;
}

describe('SQLServerDataProvider <-> spCreateRecordChange_Internal migration contract', () => {
  let provider: RecordChangeContractProvider;
  let widgetEntityInfo: EntityInfo;

  beforeEach(() => {
    mssqlState.Reset();
    provider = new RecordChangeContractProvider();
    provider.ConcurrencyCheck = 'off';
    widgetEntityInfo = makeWidgetEntityInfo({ trackRecordChanges: true });
    provider.ConfigureTestEntities([widgetEntityInfo, makeRecordChangesEntityInfo()]);
    provider.AttachMockPool(new MockConnectionPool());
  });

  it('every @Param rendered for Internal, Restore, Clone, and Sync saves/deletes/siblings exists in the newest migration and MJ_BASE_BEFORE_SQL.sql', async () => {
    const migrationFiles = collectVersionedMigrationFiles(path.join(repoRoot, 'migrations'));
    // A literal `includes` first: the lazy regex alone took ~18 s over every migration (one 5.7 s file with many
    // procedures and no match), which timed this test out under load. Files without the name can never match.
    const procMigrations = migrationFiles.filter(f => {
      const sql = fs.readFileSync(f, 'utf8');
      return /spCreateRecordChange_Internal/i.test(sql)
        && /CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE[\s\S]*?spCreateRecordChange_Internal/i.test(sql);
    });
    expect(procMigrations.length).toBeGreaterThan(0);

    const newestProcMigration = procMigrations[procMigrations.length - 1];
    const newestMigrationParams = parseProcedureParameters(
      fs.readFileSync(newestProcMigration, 'utf8'),
    );

    const baseBeforeSqlPath = path.join(repoRoot, 'SQL Scripts', 'MJ_BASE_BEFORE_SQL.sql');
    const baseBeforeParams = parseProcedureParameters(
      fs.readFileSync(baseBeforeSqlPath, 'utf8'),
    );

    // 1. Sync Save WITH IntegrationID
    mssqlState.QueueResult({ rows: [savedWidgetRow()] });
    const syncEntityWithInt = makeNewWidgetEntity(widgetEntityInfo, TEST_USER);
    syncEntityWithInt.Set('Name', 'Synced Widget');
    syncEntityWithInt.Set('IsActive', true);
    syncEntityWithInt.SetSyncContext({
      OriginDeploymentID: '11111111-1111-4111-8111-111111111111',
      PairingID: 'pair-001',
      RunID: 'run-001',
      OriginChangeIDs: ['chg-001'],
      OriginUserEmail: 'origin@example.com',
      IntegrationID: '22222222-2222-4222-8222-222222222222',
    });
    const savedWithInt = await provider.Save(syncEntityWithInt, TEST_USER, new EntitySaveOptions());
    expect(savedWithInt).not.toBeNull();

    // 2. Sync Save WITHOUT IntegrationID & WITHOUT OriginUserEmail (service account)
    mssqlState.QueueResult({ rows: [savedWidgetRow()] });
    const syncEntityServiceAccount = makeNewWidgetEntity(widgetEntityInfo, TEST_USER);
    syncEntityServiceAccount.Set('Name', 'Service Synced');
    syncEntityServiceAccount.Set('IsActive', true);
    syncEntityServiceAccount.SetSyncContext({
      OriginDeploymentID: '11111111-1111-4111-8111-111111111111',
      PairingID: 'pair-001',
      RunID: 'run-002',
      OriginChangeIDs: ['chg-002'],
    });
    const savedService = await provider.Save(syncEntityServiceAccount, TEST_USER, new EntitySaveOptions());
    expect(savedService).not.toBeNull();

    // 3. Clone Save
    mssqlState.QueueResult({ rows: [savedWidgetRow()] });
    const cloneEntity = makeNewWidgetEntity(widgetEntityInfo, TEST_USER);
    cloneEntity.Set('Name', 'Cloned Widget');
    cloneEntity.Set('IsActive', true);
    cloneEntity.SetCloneContext({
      CloneLogID: '33333333-3333-4333-8333-333333333333',
      SourceRecordID: '44444444-4444-4444-8444-444444444444',
      RootEntityID: widgetEntityInfo.ID,
      RootEntityName: widgetEntityInfo.Name,
      RootSourceRecordID: '44444444-4444-4444-8444-444444444444',
      RootTargetRecordID: '55555555-5555-4555-8555-555555555555',
      Depth: 0,
      Route: 'RootSave',
      FieldChangeSummary: [],
    });
    await provider.Save(cloneEntity, TEST_USER, new EntitySaveOptions());

    // 4. Restore Save
    mssqlState.QueueResult({ rows: [savedWidgetRow()] });
    const restoreEntity = makeSavedWidgetEntity(widgetEntityInfo, TEST_USER);
    restoreEntity.Set('Name', 'Restored Widget');
    restoreEntity.SetRestoreContext('66666666-6666-4666-8666-666666666666', 'Rollback test');
    await provider.Save(restoreEntity, TEST_USER, new EntitySaveOptions());

    // 5. Sync Delete WITH IntegrationID
    const deletedRow = savedWidgetRow();
    mssqlState.QueueResult({ rows: [{ ID: deletedRow.ID }] });
    const deleteEntity = makeSavedWidgetEntity(widgetEntityInfo, TEST_USER);
    deleteEntity.SetSyncContext({
      OriginDeploymentID: '11111111-1111-4111-8111-111111111111',
      PairingID: 'pair-001',
      RunID: 'run-003',
      OriginChangeIDs: ['chg-003'],
      IntegrationID: '22222222-2222-4222-8222-222222222222',
    });
    const deleted = await provider.Delete(deleteEntity, new EntityDeleteOptions(), TEST_USER);
    expect(deleted).toBe(true);

    // 6. Sibling IS-A propagation SQL with Sync + IntegrationID
    const siblingSyncSQL = provider.RenderSiblingSQL(
      widgetEntityInfo,
      'Sync',
      '{"Version":1,"Kind":"Sync"}',
      '22222222-2222-4222-8222-222222222222',
    );

    const allRenderedCalls = [...provider.CapturedLiteralSQL, siblingSyncSQL].filter(sql =>
      sql.includes('spCreateRecordChange_Internal'),
    );
    expect(allRenderedCalls.length).toBeGreaterThanOrEqual(6);

    // Verify @IntegrationID and @Source='Sync' were actually rendered
    expect(allRenderedCalls[0]).toContain("@Source='Sync'");
    expect(allRenderedCalls[0]).toContain('@IntegrationID=');
    expect(siblingSyncSQL).toContain("@Source='Sync'");
    expect(siblingSyncSQL).toContain('@IntegrationID=');

    for (const sqlCall of allRenderedCalls) {
      const renderedParams = extractExecParameterNames(sqlCall);
      expect(renderedParams.length).toBeGreaterThan(0);
      for (const param of renderedParams) {
        expect(
          newestMigrationParams.has(param),
          `Parameter ${param} rendered by SQLServerDataProvider is missing from ${path.basename(newestProcMigration)}`,
        ).toBe(true);
        expect(
          baseBeforeParams.has(param),
          `Parameter ${param} rendered by SQLServerDataProvider is missing from SQL Scripts/MJ_BASE_BEFORE_SQL.sql`,
        ).toBe(true);
      }
    }
  });

  it('newest CHK_RecordChange_Source constraint in migrations allows Sync alongside Internal, External, Restore, and Clone', () => {
    const migrationFiles = collectVersionedMigrationFiles(path.join(repoRoot, 'migrations'));
    const checkMigrations = migrationFiles.filter(f =>
      /ADD\s+CONSTRAINT\s+\[?CHK_RecordChange_Source\]?/i.test(fs.readFileSync(f, 'utf8')),
    );
    expect(checkMigrations.length).toBeGreaterThan(0);

    const newestCheckSql = fs.readFileSync(checkMigrations[checkMigrations.length - 1], 'utf8');
    const checkMatch = newestCheckSql.match(
      /ADD\s+CONSTRAINT\s+\[?CHK_RecordChange_Source\]?\s+CHECK\s*\(([\s\S]*?)\)\s*;/i,
    );
    expect(checkMatch).not.toBeNull();

    for (const expectedSource of ['Internal', 'External', 'Restore', 'Clone', 'Sync']) {
      expect(checkMatch![1]).toContain(`'${expectedSource}'`);
    }
  });
});
