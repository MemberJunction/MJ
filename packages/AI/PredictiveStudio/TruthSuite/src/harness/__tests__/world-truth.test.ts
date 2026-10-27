import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EntityInfo } from '@memberjunction/core';
import { HarnessWorldTruth } from '../world-truth';
import type { LoadedDataset } from '../types';

const HEADER = 'MembershipYearID,Cycle,TrueP,Drawn,Censored';
const dirs: string[] = [];

/** A W1 dataset whose cache directory holds `truth.csv` with the given body. */
async function datasetWithTruth(body: string): Promise<LoadedDataset> {
  const dir = await mkdtemp(join(tmpdir(), 'world-truth-'));
  dirs.push(dir);
  await writeFile(join(dir, 'truth.csv'), `${HEADER}\n${body}\n`);
  return { Ref: { Kind: 'world', ID: 'W1-signal', Seed: 1 }, Dir: dir, Entity: new EntityInfo(), RowCount: 0, RowsSha256: '' };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('HarnessWorldTruth.ReadWorldTruth', () => {
  it('reads each row keyed by lower-cased MembershipYearID', async () => {
    const truth = await HarnessWorldTruth.ReadWorldTruth(await datasetWithTruth('AB-1,2026,0.8,1,0'));
    expect(truth.get('ab-1')).toEqual({ Cycle: 2026, TrueP: 0.8, Censored: false });
  });
  it('fails on a row with fewer cells than the header', async () => {
    await expect(HarnessWorldTruth.ReadWorldTruth(await datasetWithTruth('AB-1,2026,0.8'))).rejects.toThrow(/data row 1 has 3 cells; the header has 5/);
  });
  it('fails on a TrueP or Cycle that is not a number', async () => {
    await expect(HarnessWorldTruth.ReadWorldTruth(await datasetWithTruth('AB-1,2026,high,1,0'))).rejects.toThrow(/TrueP "high" is not a number/);
    await expect(HarnessWorldTruth.ReadWorldTruth(await datasetWithTruth('AB-1,,0.8,1,0'))).rejects.toThrow(/Cycle "" is not an integer/);
  });
});
