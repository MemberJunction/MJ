/** The planted truth of a world seed, read from its cache directory (the `ReadWorldTruth` harness member). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TruthCsv } from '../db/csv';
import type { LoadedDataset, WorldTruthRow } from './types';

/** The implementation behind `TruthHarness.ReadWorldTruth` (one line in `RunFixtures.harnessFrom`'s literal calls it). */
export class HarnessWorldTruth {
  /**
   * The planted truth of a loaded W1–W8 seed, keyed by lower-cased MembershipYearID. Read from the seed's cache
   * directory (`LoadedDataset.Dir`); truth never enters the database, so gate measurements read it only here.
   */
  public static async ReadWorldTruth(dataset: LoadedDataset): Promise<ReadonlyMap<string, WorldTruthRow>> {
    if (dataset.Ref.Kind !== 'world' || dataset.Ref.ID === 'W9-multiclass') {
      throw new Error(`ReadWorldTruth reads W1–W8 truth files; got ${dataset.Ref.Kind} ${dataset.Ref.ID}`);
    }
    const { Header: header, Rows: rows } = TruthCsv.Parse(readFileSync(path.join(dataset.Dir, 'truth.csv'), 'utf8'));
    const col = (name: string): number => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`${dataset.Dir}/truth.csv has no ${name} column`);
      return i;
    };
    const [id, cycle, trueP, censored] = [col('MembershipYearID'), col('Cycle'), col('TrueP'), col('Censored')];
    const out = new Map<string, WorldTruthRow>();
    rows.forEach((r, i) => {
      // A short row or a non-numeric cell would otherwise become undefined or NaN and skew every mean a gate takes.
      const where = `${dataset.Dir}/truth.csv data row ${i + 1}`;
      if (r.length !== header.length) throw new Error(`${where} has ${r.length} cells; the header has ${header.length}`);
      const cycleValue = Number(r[cycle]);
      const truePValue = Number(r[trueP]);
      if (r[cycle] === '' || !Number.isInteger(cycleValue)) throw new Error(`${where}: Cycle "${r[cycle]}" is not an integer`);
      if (r[trueP] === '' || !Number.isFinite(truePValue)) throw new Error(`${where}: TrueP "${r[trueP]}" is not a number`);
      out.set(r[id].toLowerCase(), { Cycle: cycleValue, TrueP: truePValue, Censored: r[censored] === '1' });
    });
    return out;
  }
}
