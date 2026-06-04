import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeSchemaManager, type IRSUCodeGenRunner, type RSUCodeGenEntityVerdict } from '../RuntimeSchemaManager.js';

/**
 * Verifies the RSU pipeline populates RSUPipelineResult.EntitiesCreated and
 * .EntitiesNotCreated from the CodeGen / manage-metadata verdict.
 *
 * Strategy: drive the full pipeline (RunPipeline) with a mock DDL provider (so
 * migration "executes" with no real DB) and a mock CodeGen runner that returns a
 * created-vs-skipped verdict. Git + restart are skipped. WorkDir points at a
 * throwaway temp dir so migration files / logs write to a writable location.
 * No real DB, no network, fully deterministic.
 */

/** Minimal DDL provider stand-in: every ExecuteSQL call succeeds. */
function makeMockDDLProvider() {
  return {
    ExecuteSQL: async () => [],
  };
}

/** CodeGen runner that reports the supplied verdict via RunInProcessWithResult. */
function makeVerdictRunner(verdict: RSUCodeGenEntityVerdict): IRSUCodeGenRunner {
  return {
    RunInProcess: async () => true,
    RunInProcessWithResult: async () => ({ Success: true, Verdict: verdict }),
  };
}

/** Legacy CodeGen runner that only implements RunInProcess (no verdict). */
function makeLegacyRunner(): IRSUCodeGenRunner {
  return {
    RunInProcess: async () => true,
  };
}

/** CodeGen runner that FAILS — RunInProcess returns false, so runCodeGen throws. */
function makeFailingRunner(): IRSUCodeGenRunner {
  return {
    RunInProcess: async () => false,
  };
}

describe('RuntimeSchemaManager — entity created/not-created verdict', () => {
  const originalEnv = { ...process.env };
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'rsu-verdict-'));
    process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
    process.env.RSU_WORK_DIR = workDir;
    // Keep audit-log writes from touching anything meaningful (provider is mocked anyway).
    process.env.RSU_AUDIT_LOG_ENABLED = '0';
    // Override the post-CodeGen compile to a trivial shell no-op so the pipeline
    // never shells out to `npx turbo build` (keeps the test fast + deterministic).
    process.env.RSU_COMPILE_COMMAND = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    // Reset injected state on the singleton so tests don't leak into each other.
    const rsm = RuntimeSchemaManager.Instance as unknown as {
      _ddlProvider: unknown;
      _codeGenRunner: unknown;
      _lastCodeGenVerdict: unknown;
    };
    rsm._ddlProvider = null;
    rsm._codeGenRunner = null;
    rsm._lastCodeGenVerdict = null;
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it('populates EntitiesCreated and EntitiesNotCreated from the CodeGen verdict', async () => {
    const verdict: RSUCodeGenEntityVerdict = {
      EntitiesCreated: ['hubspot.Contact', 'hubspot.Company'],
      EntitiesNotCreated: [{ name: 'hubspot.Note', reason: 'No primary key found' }],
    };

    const rsm = RuntimeSchemaManager.Instance;
    rsm.SetDDLProvider(makeMockDDLProvider() as never);
    rsm.SetCodeGenRunner(makeVerdictRunner(verdict));

    const result = await rsm.RunPipeline({
      MigrationSQL: 'CREATE TABLE [hubspot].[Contact] (ID UNIQUEIDENTIFIER NOT NULL);',
      Description: 'verdict test',
      AffectedTables: ['hubspot.Contact'],
      SkipGitCommit: true,
      SkipRestart: true,
    });

    expect(result.Success).toBe(true);
    // CodeGen must have run for the verdict to flow through.
    expect(result.Steps.find((s) => s.Name === 'RunCodeGen')?.Status).toBe('success');

    expect(result.EntitiesCreated).toEqual(['hubspot.Contact', 'hubspot.Company']);
    expect(result.EntitiesNotCreated).toEqual([{ name: 'hubspot.Note', reason: 'No primary key found' }]);
  });

  it('FAILS the connector (Success=false, ErrorStep=RunCodeGen) when RunCodeGen fails after a successful migration', async () => {
    // Regression for the silent-success bug: a migration can ExecuteMigration:success yet
    // RunCodeGen:failed (e.g. CODEGEN_DB creds that do not match the target DB platform),
    // leaving the entity with NO spCreate/spUpdate procs — after which a sync silently
    // skips it with SchemaNotGenerated. The connector must report FAILURE, not success.
    const rsm = RuntimeSchemaManager.Instance;
    rsm.SetDDLProvider(makeMockDDLProvider() as never);
    rsm.SetCodeGenRunner(makeFailingRunner());

    const result = await rsm.RunPipeline({
      MigrationSQL: 'CREATE TABLE [hubspot].[Contact] (ID UNIQUEIDENTIFIER NOT NULL);',
      Description: 'codegen-fail test',
      AffectedTables: ['hubspot.Contact'],
      SkipGitCommit: true,
      SkipRestart: true,
    });

    expect(result.Steps.find((s) => s.Name === 'ExecuteMigration')?.Status).toBe('success');
    expect(result.Steps.find((s) => s.Name === 'RunCodeGen')?.Status).toBe('failed');
    expect(result.Success).toBe(false);
    expect(result.ErrorStep).toBe('RunCodeGen');
    expect(result.ErrorMessage).toBeTruthy();
  });

  it('reports a skipped (no-PK) entity with its reason', async () => {
    const verdict: RSUCodeGenEntityVerdict = {
      EntitiesCreated: [],
      EntitiesNotCreated: [{ name: 'hubspot.Deal', reason: 'No primary key found' }],
    };

    const rsm = RuntimeSchemaManager.Instance;
    rsm.SetDDLProvider(makeMockDDLProvider() as never);
    rsm.SetCodeGenRunner(makeVerdictRunner(verdict));

    const result = await rsm.RunPipeline({
      MigrationSQL: 'CREATE TABLE [hubspot].[Deal] (Name NVARCHAR(100) NULL);',
      Description: 'skipped no-pk test',
      AffectedTables: ['hubspot.Deal'],
      SkipGitCommit: true,
      SkipRestart: true,
    });

    expect(result.Success).toBe(true);
    expect(result.EntitiesCreated).toEqual([]);
    expect(result.EntitiesNotCreated).toHaveLength(1);
    expect(result.EntitiesNotCreated[0].name).toBe('hubspot.Deal');
    expect(result.EntitiesNotCreated[0].reason).toContain('No primary key');
  });

  it('leaves the arrays empty (never undefined) when the runner reports no verdict', async () => {
    const rsm = RuntimeSchemaManager.Instance;
    rsm.SetDDLProvider(makeMockDDLProvider() as never);
    rsm.SetCodeGenRunner(makeLegacyRunner());

    const result = await rsm.RunPipeline({
      MigrationSQL: 'CREATE TABLE [hubspot].[Ticket] (ID UNIQUEIDENTIFIER NOT NULL);',
      Description: 'legacy runner test',
      AffectedTables: ['hubspot.Ticket'],
      SkipGitCommit: true,
      SkipRestart: true,
    });

    expect(result.Success).toBe(true);
    expect(result.EntitiesCreated).toEqual([]);
    expect(result.EntitiesNotCreated).toEqual([]);
  });

  it('returns empty arrays (never undefined) on an early validation failure', async () => {
    const rsm = RuntimeSchemaManager.Instance;
    // No DDL/CodeGen injection — this fails at ValidateSQL (__mj is protected).
    const result = await rsm.RunPipeline({
      MigrationSQL: 'ALTER TABLE [__mj].[Entity] ADD NewCol INT;',
      Description: 'protected schema',
      AffectedTables: ['__mj.Entity'],
    });

    expect(result.Success).toBe(false);
    expect(result.EntitiesCreated).toEqual([]);
    expect(result.EntitiesNotCreated).toEqual([]);
  });
});
