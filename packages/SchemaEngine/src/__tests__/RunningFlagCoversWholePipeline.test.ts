/**
 * `GetStatus().Running` must be true for the WHOLE pipeline, not only while the DB-mutation mutex
 * is held.
 *
 * The mutex (`_isRunning`) is deliberately released right after ExecuteMigration — the database is
 * consistent from then on and another pipeline may queue. But GetStatus reported that mutex as
 * "Running", so for WriteAdditionalSchemaInfo, RunCodeGen, CompileTypeScript, GitCommitAndPR and
 * RestartMJAPI — roughly 95% of a run's wall clock — the API said no RSU was running. On the sandbox
 * (2026-09-11) that read "No RSU pipeline running" while CodeGen was ten minutes in, and every
 * consumer that trusted it misjudged the build: a wizard fell back to its tables step, a list page
 * offered to resume a setup that was mid-restart.
 *
 * Every step is stubbed at the instance so nothing touches a database, a filesystem or pm2; the
 * one thing observed is what GetStatus says from INSIDE the CodeGen step.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuntimeSchemaManager } from '../RuntimeSchemaManager.js';

type Priv = Record<string, (...args: unknown[]) => unknown>;

describe('GetStatus().Running covers the whole pipeline', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
    delete process.env.RSU_DB_LOCK_ENABLED;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  it('is true inside RunCodeGen, after the DB-mutation mutex has been released', async () => {
    const rsm = RuntimeSchemaManager.Instance;
    const p = rsm as unknown as Priv;
    const seen: { running: boolean; mutex: boolean }[] = [];

    vi.spyOn(p, 'validateEnvironment').mockResolvedValue(true);
    vi.spyOn(p, 'writeMigrationFile').mockResolvedValue('/tmp/V000000000000__RSU_test.sql');
    vi.spyOn(p, 'executeMigration').mockResolvedValue(true);
    vi.spyOn(p, 'writeAdditionalSchemaInfo').mockResolvedValue(undefined);
    vi.spyOn(p, 'runCodeGen').mockImplementation(async () => {
      seen.push({ running: rsm.GetStatus().Running, mutex: rsm.IsRunning });
      return true;
    });
    vi.spyOn(p, 'compileTypeScript').mockResolvedValue(true);
    vi.spyOn(p, 'gitCommitAndPRForCycle').mockResolvedValue('https://example.test/pr/1');
    vi.spyOn(p, 'restartMJAPI').mockResolvedValue(true);

    await rsm.RunPipelineBatch([
      { MigrationSQL: 'CREATE TABLE [custom].[RunningFlag] (ID INT NOT NULL);', Description: 'running-flag test', AffectedTables: ['custom.RunningFlag'] }
    ]);

    expect(seen).toHaveLength(1);
    // The mutex is (correctly) already released by the time CodeGen runs…
    expect(seen[0].mutex).toBe(false);
    // …and the status must still say the pipeline is running.
    expect(seen[0].running).toBe(true);
    // Once the pipeline has returned, nothing is running.
    expect(rsm.GetStatus().Running).toBe(false);
  });
});
