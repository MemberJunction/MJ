// derive_t3_lag.ts — usage: node --import tsx src/generators/derive_t3_lag.ts <T3 seed dir> <outDir>
//
// Copies truth.csv and truth_origins.csv, writes rows.csv without SamePeriodTarget, and writes manifest.json with
// id: "T3-lag", derivedFrom: "T3", droppedColumns: ["SamePeriodTarget"].
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GenLib } from './gen_lib';
import type { DerivedScenarioManifest, ScenarioManifest } from './types';

/** Derives T3-lag from a generated T3 seed: the same series with the same-period leak column dropped. */
export class T3LagDerivation {
  private static readonly DROPPED_COLUMN = 'SamePeriodTarget';

  /** Derive T3-lag from the T3 seed directory named on the command line into the output directory. */
  public static Main(argv: readonly string[]): void {
    const t3Dir = path.resolve(argv[2]);
    const outDir = path.resolve(argv[3]);
    mkdirSync(outDir, { recursive: true });
    copyFileSync(path.join(t3Dir, 'truth.csv'), path.join(outDir, 'truth.csv'));
    copyFileSync(path.join(t3Dir, 'truth_origins.csv'), path.join(outDir, 'truth_origins.csv'));
    const nRows = T3LagDerivation.writeRows(t3Dir, outDir);
    T3LagDerivation.writeManifest(t3Dir, outDir);
    console.log('T3-lag', nRows);
  }

  /** Write rows.csv without the dropped column; returns the number of data rows. */
  private static writeRows(t3Dir: string, outDir: string): number {
    // A plain split is safe: T3's rows.csv holds IDs, dates and numbers, never a quoted cell.
    const lines = readFileSync(path.join(t3Dir, 'rows.csv'), 'utf8').trimEnd().split('\n');
    const dropIdx = lines[0].split(',').indexOf(T3LagDerivation.DROPPED_COLUMN);
    if (dropIdx === -1) throw new Error(`${T3LagDerivation.DROPPED_COLUMN} column not found in T3 rows.csv`);
    const stripped = lines.map((line) => {
      const parts = line.split(',');
      parts.splice(dropIdx, 1);
      return parts.join(',');
    });
    writeFileSync(path.join(outDir, 'rows.csv'), `${stripped.join('\n')}\n`);
    return lines.length - 1;
  }

  /** Write T3's manifest re-identified as T3-lag, the dropped column removed from its column lists and traps. */
  private static writeManifest(t3Dir: string, outDir: string): void {
    const dropped = T3LagDerivation.DROPPED_COLUMN;
    const base = GenLib.ReadJson<ScenarioManifest>(path.join(t3Dir, 'manifest.json'));
    // Object.assign keeps `id` in its place and appends the derivation keys after the base manifest's.
    const manifest: DerivedScenarioManifest = Object.assign(base, { id: 'T3-lag', derivedFrom: 'T3', droppedColumns: [dropped] });
    manifest.columns.features = manifest.columns.features.filter((c) => c !== dropped);
    manifest.columns.traps = manifest.columns.traps.filter((c) => c !== dropped);
    manifest.traps = manifest.traps.filter((t) => t.column !== dropped);
    writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

T3LagDerivation.Main(process.argv);
