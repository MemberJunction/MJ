import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { C1CorpusFixture, C1_CORPUS_DIR } from '../fixtures/c1-corpus-loader';

describe('C1 corpus fixture', () => {
  it('matches its committed SHA-256 sums', async () => {
    expect(await C1CorpusFixture.VerifyC1CorpusChecksums(C1_CORPUS_DIR)).toEqual([]);
  });
  it('names a file whose bytes no longer match SHA256SUMS (the guard LoadC1Corpus relies on)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'c1-corpus-'));
    try {
      await cp(C1_CORPUS_DIR, dir, { recursive: true });
      await appendFile(join(dir, 'people.csv'), 'X');
      expect(await C1CorpusFixture.VerifyC1CorpusChecksums(dir)).toEqual(['people.csv']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('holds every final-valid person-period of the pinned MoreCheese corpus: 4,873 resolved + 1,756 censored + 44 label-known = 6,673', async () => {
    const periods = await C1CorpusFixture.ReadC1CorpusCsv(join(C1_CORPUS_DIR, 'dues_periods.csv'));
    expect(periods.Rows.length).toBe(6673);
    const keys = await C1CorpusFixture.ReadC1CorpusCsv(join(C1_CORPUS_DIR, 'person_years_keys.csv'));
    expect(keys.Rows.length).toBe(4873);
    const periodKeys = new Set(periods.Rows.map((r) => `${r.PersonID.toLowerCase()}|${r.PeriodIndex}`));
    expect(keys.Rows.every((k) => periodKeys.has(`${k.person_id.toLowerCase()}|${k.period_index}`))).toBe(true);
  });
  it('records the corpus end the censoring cutoff resolves to (max OrderDate over all orders)', async () => {
    const orders = await C1CorpusFixture.ReadC1CorpusCsv(join(C1_CORPUS_DIR, 'order_headers.csv'));
    expect(orders.Rows.map((r) => r.OrderDate).sort().at(-1)).toBe('2026-07-30');
  });
});
