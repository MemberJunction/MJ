import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** D4-181 — T4's previous-month column: `seriesLag` writes `LagTarget` after the series is drawn, so no RNG stream moves. */
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const T4 = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/scenarios/specs/T4.json'), 'utf8')) as Record<string, unknown>;

/** The generated rows.csv of `spec` at seed 2209 (T4's base seed): its header and its rows as cells. */
function generate(spec: Record<string, unknown>): { Header: string[]; Rows: string[][]; Truth: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ps-t4-lag-'));
  try {
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
    execFileSync(process.execPath, ['--import', 'tsx', 'src/generators/make_scenario.ts', join(dir, 'spec.json'), join(dir, 'out'), '--seed', '2209'], { cwd: ROOT, stdio: 'pipe' });
    const [header, ...lines] = readFileSync(join(dir, 'out', 'rows.csv'), 'utf8').trim().split('\n');
    return { Header: header.split(','), Rows: lines.map((l) => l.split(',')), Truth: readFileSync(join(dir, 'out', 'truth.csv'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('make_scenario seriesLag (T4)', () => {
  it('T4 writes LagTarget = the previous month\'s Target, empty in month 0, and leaves Target and the truth unchanged', () => {
    expect(T4.seriesLag).toEqual({ lagColumn: 'LagTarget' });
    const withLag = generate(T4);
    const { seriesLag: _dropped, ...plain } = T4;
    const without = generate(plain);
    expect(withLag.Header).toEqual(['ID', 'EntityKey', 'T', 'LagTarget', 'Target']);
    const lag = withLag.Header.indexOf('LagTarget');
    const target = withLag.Header.indexOf('Target');
    expect(withLag.Rows[0][lag]).toBe('');
    for (let t = 1; t < withLag.Rows.length; t++) expect(withLag.Rows[t][lag]).toBe(withLag.Rows[t - 1][target]);
    expect(withLag.Rows.map((r) => r[target])).toEqual(without.Rows.map((r) => r[without.Header.indexOf('Target')]));
    expect(withLag.Truth).toBe(without.Truth);
  }, 120_000);
});
