import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** M6.6 — the D1c-revert variant: `revertFrom` removes the planted shift from that period on (the R5 rollback case). */
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const D1C = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/scenarios/specs/D1c.json'), 'utf8'));

/** The positive rate of each period (year `2019 + p`) of a generated rows.csv. */
function rates(spec: object): number[] {
  const dir = mkdtempSync(join(tmpdir(), 'ps-d1c-revert-'));
  try {
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
    execFileSync(process.execPath, ['--import', 'tsx', 'src/generators/make_scenario.ts', join(dir, 'spec.json'), join(dir, 'out'), '--seed', '42'], { cwd: ROOT, stdio: 'pipe' });
    const [header, ...lines] = readFileSync(join(dir, 'out', 'rows.csv'), 'utf8').trim().split('\n');
    const cols = header.split(',');
    const t = cols.indexOf('T');
    const y = cols.indexOf('Target');
    return [0, 1, 2, 3, 4, 5].map((p) => {
      const of = lines.map((l) => l.split(',')).filter((c) => c[t].startsWith(String(2019 + p)));
      return of.reduce((s, c) => s + Number(c[y]), 0) / of.length;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('make_scenario revertFrom', () => {
  it('D1c shifts the positive rate from period 3 on; revertFrom 5 removes the shift from period 5 only', () => {
    const shifted = rates(D1C);
    const reverted = rates({ ...D1C, revertFrom: 5 });
    expect(shifted[3] - shifted[2]).toBeGreaterThan(0.08);
    expect(reverted[4]).toBeCloseTo(shifted[4], 12);
    expect(shifted[5] - reverted[5]).toBeGreaterThan(0.08);
  }, 120_000);
});
