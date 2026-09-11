/**
 * The live sync counters were DEAD. SyncProgressSnapshot declared RecordsCreated / RecordsUpdated /
 * RecordsErrored, OperationProgressOutput exposed them, and IntegrationGetSyncProgress returned
 * them — but nothing ever assigned them. They were initialised to 0 and stayed 0 for the whole run.
 *
 * That is the actual cause of thing.txt's "created shows just a plus, updated is just ~, breakdown,
 * nothing even showing up": the numbers were always zero, not mis-rendered.
 *
 * They cannot be fed from the progress tick, because SyncProgress carries only POSITION
 * (EntityMapIndex, RecordsProcessedInCurrentMap, PercentComplete) and no outcome at all. MergeResult
 * is the one place a map's real outcome is folded into the run, so that is where the snapshot is fed.
 *
 * plan.md also requires Skipped alongside them: "it must show the number of NEW records or update
 * records are being done ... and also how many are skipped".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf-8');
const TYPES = readFileSync(join(__dirname, '..', 'types.ts'), 'utf-8');

function snapshotType(): string {
  const i = TYPES.indexOf('export interface SyncProgressSnapshot');
  return TYPES.slice(i, TYPES.indexOf('}', i));
}

function mergeResultBody(): string {
  const i = ENGINE.indexOf('private MergeResult(');
  expect(i, 'MergeResult not found').toBeGreaterThan(-1);
  return ENGINE.slice(i, ENGINE.indexOf('\n    }', i));
}

describe('the live snapshot carries every outcome counter', () => {
  it('declares all four, including Skipped', () => {
    const t = snapshotType();
    for (const f of ['RecordsCreated', 'RecordsUpdated', 'RecordsErrored', 'RecordsSkipped']) {
      expect(t).toContain(f);
    }
  });

  it('SyncProgress still carries no outcome counts, which is why the tick cannot feed them', () => {
    const i = TYPES.indexOf('export interface SyncProgress ');
    const t = TYPES.slice(i, TYPES.indexOf('}', i));
    expect(t).not.toContain('RecordsCreated');
    expect(t).not.toContain('RecordsSkipped');
  });
});

describe('MergeResult feeds the snapshot', () => {
  it('assigns all four counters from the aggregate', () => {
    const body = mergeResultBody();
    for (const f of ['RecordsCreated', 'RecordsUpdated', 'RecordsErrored', 'RecordsSkipped']) {
      expect(body).toMatch(new RegExp(`snap\\.${f}\\s*=\\s*aggregate\\.${f}`));
    }
  });

  it('reads the snapshot off the current run context, not a field on the engine', () => {
    // the engine is a singleton across concurrent runs; a per-engine field would cross runs
    expect(mergeResultBody()).toMatch(/currentRunContext\?\.progressSnapshot/);
  });

  it('persists after the update, so the final map count reaches another process', () => {
    // the last map has no progress tick after it; without this its counts never leave the process
    expect(mergeResultBody()).toMatch(/WriteProgress\(/);
  });
});
