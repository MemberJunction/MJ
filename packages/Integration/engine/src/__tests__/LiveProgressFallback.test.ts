/**
 * On any tenant before MJ 6.1.x there was NO source of live sync progress at all.
 *
 *  - GetSyncProgress (synchronous) is deprecated and returns undefined by contract: "the static
 *    map it used to read was removed when progress moved to the database".
 *  - GetSyncProgressAsync reads ProgressJSON off the run row — a column that arrives in 6.1.x.
 *    RunView drops unknown fields silently, so it returns undefined for a sync that is running.
 *
 * A sync could run for an hour with every surface showing nothing. plan.md requires the opposite:
 * "it must be clear that a sync is running ... it must show the number of NEW records or update
 * records are being done".
 *
 * liveProgress is the floor: this process's own snapshot, preferred only when the durable row
 * cannot answer, so a multi-process tenant on 6.1.x still reads the row.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf-8');

function methodBody(sig: string): string {
  const i = SRC.indexOf(sig);
  expect(i, `${sig} not found`).toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf('\n    }', i));
}

describe('the in-process live progress registry', () => {
  it('exists and is keyed like activeSyncs', () => {
    expect(SRC).toMatch(/private static readonly liveProgress = new Map<string, SyncProgressSnapshot>\(\)/);
  });

  it('is published beside every activeSyncs reservation', () => {
    // one main path + one resume path; if a run reserves the lock but never publishes,
    // that run reports no progress for its whole life
    const sets = SRC.match(/liveProgress\.set\(/g) ?? [];
    expect(sets.length).toBeGreaterThanOrEqual(2);
  });

  it('is cleared wherever the sync lock is released, or it leaks a snapshot per run', () => {
    const dels = SRC.match(/liveProgress\.delete\(/g) ?? [];
    const locks = SRC.match(/activeSyncs\.delete\(/g) ?? [];
    expect(dels.length).toBe(locks.length);
  });
});

describe('GetSyncProgressAsync', () => {
  it('falls back when the row cannot be read at all', () => {
    expect(methodBody('public static async GetSyncProgressAsync'))
      .toMatch(/if \(!row\) return IntegrationEngine\.liveProgress\.get/);
  });

  it('falls back when the row exists but carries no ProgressJSON column', () => {
    // the 5.51 case: the row is there, the field is not, RunView returns it as undefined
    expect(methodBody('public static async GetSyncProgressAsync'))
      .toMatch(/if \(!row\.ProgressJSON\) return IntegrationEngine\.liveProgress\.get/);
  });

  it('still prefers the durable row, so 6.1.x multi-process tenants stay correct', () => {
    const body = methodBody('public static async GetSyncProgressAsync');
    expect(body.indexOf('ProgressJSON')).toBeLessThan(body.indexOf('liveProgress.get'));
  });
});
