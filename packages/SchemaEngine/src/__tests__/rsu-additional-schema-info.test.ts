/**
 * RSU and CodeGen must agree on the additionalSchemaInfo file, and RSU must not report success
 * when CodeGen created no entity for a table it was asked to build (#5858).
 *
 * Observed: outside MJAPI, RSU resolved 'additionalSchemaInfo.json' against process.cwd() while
 * CodeGen read the configured path, so CodeGen found no soft primary keys and created 0 entities.
 * Every RSU step still reported success, and the following syncs finished in ~120 ms with 0 maps.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as nodePath from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  RuntimeSchemaManager,
  ResolveRSUAdditionalSchemaInfoPath,
  FindTablesWithoutEntities,
  DEFAULT_ADDITIONAL_SCHEMA_INFO_FILE,
} from '../RuntimeSchemaManager.js';

const WORK_DIR = nodePath.resolve('/srv/mj');

describe('ResolveRSUAdditionalSchemaInfoPath', () => {
  it('uses the injected (mj.config) path when no env override is set', () => {
    const injected = nodePath.resolve('/repo/config/additionalSchemaInfo.json');
    expect(ResolveRSUAdditionalSchemaInfoPath(WORK_DIR, injected)).toBe(injected);
  });

  it('keeps an absolute path as-is regardless of the work dir', () => {
    const injected = nodePath.resolve('/elsewhere/asi.json');
    expect(ResolveRSUAdditionalSchemaInfoPath(nodePath.resolve('/a'), injected)).toBe(injected);
    expect(ResolveRSUAdditionalSchemaInfoPath(nodePath.resolve('/b'), injected)).toBe(injected);
  });

  it('lets the env override win over the injected path', () => {
    const override = nodePath.resolve('/override/asi.json');
    expect(ResolveRSUAdditionalSchemaInfoPath(WORK_DIR, nodePath.resolve('/repo/asi.json'), override)).toBe(override);
  });

  it('resolves relative values against the work dir', () => {
    expect(ResolveRSUAdditionalSchemaInfoPath(WORK_DIR, null, 'config/asi.json')).toBe(nodePath.join(WORK_DIR, 'config', 'asi.json'));
    expect(ResolveRSUAdditionalSchemaInfoPath(WORK_DIR, 'cfg/asi.json')).toBe(nodePath.join(WORK_DIR, 'cfg', 'asi.json'));
  });

  it('falls back to the default file in the work dir', () => {
    expect(ResolveRSUAdditionalSchemaInfoPath(WORK_DIR)).toBe(nodePath.join(WORK_DIR, DEFAULT_ADDITIONAL_SCHEMA_INFO_FILE));
  });
});

describe('RuntimeSchemaManager.AdditionalSchemaInfoPath', () => {
  const previousEnv = process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH;
  const previousWorkDir = process.env.RSU_WORK_DIR;
  const rsm = RuntimeSchemaManager.Instance as unknown as { _additionalSchemaInfoPath: string | null } & RuntimeSchemaManager;

  afterEach(() => {
    if (previousEnv === undefined) delete process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH;
    else process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH = previousEnv;
    if (previousWorkDir === undefined) delete process.env.RSU_WORK_DIR;
    else process.env.RSU_WORK_DIR = previousWorkDir;
    rsm._additionalSchemaInfoPath = null;
  });

  it('is absolute and independent of process.cwd() once the server injects the config path', () => {
    delete process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH;
    process.env.RSU_WORK_DIR = WORK_DIR;
    const injected = nodePath.resolve('/repo/config/additionalSchemaInfo.json');
    rsm.SetAdditionalSchemaInfoPath(injected);
    expect(rsm.AdditionalSchemaInfoPath).toBe(injected);
  });

  it('honors the env override', () => {
    process.env.RSU_WORK_DIR = WORK_DIR;
    process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH = 'rsu/asi.json';
    rsm.SetAdditionalSchemaInfoPath(nodePath.resolve('/repo/asi.json'));
    expect(rsm.AdditionalSchemaInfoPath).toBe(nodePath.join(WORK_DIR, 'rsu', 'asi.json'));
  });
});

describe('FindTablesWithoutEntities', () => {
  const entities = [
    { SchemaName: 'hubspot', BaseTable: 'Contact' },
    { SchemaName: 'hubspot', BaseTable: 'Company' },
  ];

  it('returns nothing when every table has an entity (case-insensitive)', () => {
    expect(FindTablesWithoutEntities(['hubspot.contact', 'HUBSPOT.Company'], entities)).toEqual([]);
  });

  it('lists each table with no entity once', () => {
    expect(FindTablesWithoutEntities(['hubspot.Contact', 'hubspot.Deal', 'hubspot.Deal', 'other.Contact'], entities))
      .toEqual(['hubspot.Deal', 'other.Contact']);
  });

  it('lists every table when CodeGen created zero entities', () => {
    expect(FindTablesWithoutEntities(['hubspot.Contact', 'hubspot.Company'], [])).toEqual(['hubspot.Contact', 'hubspot.Company']);
  });
});

/** Private surface of the post-migration phase under test. */
type PipelineInternals = {
  runPostMigrationPipeline(
    inputs: unknown[],
    successfulItems: unknown[],
    sharedSteps: Array<{ Name: string; Status: string; Message?: string }>,
  ): Promise<{ CodeGenSucceeded?: boolean; CodeGenError?: string }>;
  registerPendingWork(inputs: unknown[]): Promise<{ IDs: Map<unknown, string[]>; Errors: Map<unknown, string[]> }>;
  writeAdditionalSchemaInfo(inputs: unknown[]): Promise<boolean>;
  runCodeGen(): Promise<boolean>;
  compileTypeScript(): Promise<boolean>;
  writePostRestartFiles(inputs: unknown[]): Promise<void>;
  getDBProvider(): unknown;
};

describe('RunCodeGen step fails when CodeGen created no entity for an affected table', () => {
  let rsm: PipelineInternals;
  let workDir: string;
  let entityRows: Array<{ SchemaName: string; BaseTable: string }>;
  const previousWorkDir = process.env.RSU_WORK_DIR;

  beforeEach(() => {
    workDir = mkdtempSync(nodePath.join(tmpdir(), 'rsu-entity-check-'));
    process.env.RSU_WORK_DIR = workDir; // keeps rsu-pipeline.log out of the package
    rsm = RuntimeSchemaManager.Instance as unknown as PipelineInternals;
    vi.spyOn(rsm, 'registerPendingWork').mockResolvedValue({ IDs: new Map(), Errors: new Map() });
    vi.spyOn(rsm, 'writeAdditionalSchemaInfo').mockResolvedValue(true);
    vi.spyOn(rsm, 'runCodeGen').mockResolvedValue(true); // CodeGen itself reports success
    vi.spyOn(rsm, 'compileTypeScript').mockResolvedValue(true);
    vi.spyOn(rsm, 'writePostRestartFiles').mockResolvedValue(undefined);
    vi.spyOn(rsm, 'getDBProvider').mockReturnValue({
      MJCoreSchemaName: '__mj',
      ExecuteSQL: async () => entityRows,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(workDir, { recursive: true, force: true });
    if (previousWorkDir === undefined) delete process.env.RSU_WORK_DIR;
    else process.env.RSU_WORK_DIR = previousWorkDir;
  });

  const run = async () => {
    const input = { Description: 'test', AffectedTables: ['hubspot.Contact', 'hubspot.Deal'], SkipGitCommit: true, SkipRestart: true };
    const steps: Array<{ Name: string; Status: string; Message?: string }> = [];
    const result = await rsm.runPostMigrationPipeline([input], [{ Input: input, FilePath: '/tmp/V1__x.sql' }], steps);
    return { result, steps };
  };

  it('zero entities created: the step fails and names every missing table', async () => {
    entityRows = [];
    const { result, steps } = await run();
    const step = steps.find((s) => s.Name === 'RunCodeGen');
    expect(step?.Status).toBe('failed');
    expect(result.CodeGenSucceeded).toBe(false);
    expect(result.CodeGenError).toContain('hubspot.Contact');
    expect(result.CodeGenError).toContain('hubspot.Deal');
    expect(steps.some((s) => s.Name === 'CompileTypeScript')).toBe(false);
  });

  it('one table missing: the step fails and names only that table', async () => {
    entityRows = [{ SchemaName: 'hubspot', BaseTable: 'Contact' }];
    const { result } = await run();
    expect(result.CodeGenSucceeded).toBe(false);
    expect(result.CodeGenError).toContain('1 of 2 table(s): hubspot.Deal.');
  });

  it('every table has an entity: the step succeeds', async () => {
    entityRows = [{ SchemaName: 'hubspot', BaseTable: 'Contact' }, { SchemaName: 'hubspot', BaseTable: 'Deal' }];
    const { result, steps } = await run();
    expect(result.CodeGenSucceeded).toBe(true);
    expect(steps.find((s) => s.Name === 'RunCodeGen')?.Status).toBe('success');
  });
});
