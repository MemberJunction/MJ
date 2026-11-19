/** The seeded row sampler and the provenance resolver behind two TruthHarness members (lines in RunFixtures.harnessFrom). */
import { RunView } from '@memberjunction/core';
import { LockedHoldoutSplitter } from '@memberjunction/predictive-studio';
import type { RunContext } from './run-fixtures';
import type { LoadedDataset } from './types';
import { ProvenanceResolver, type ProvenanceCheck } from '../fixtures/provenance-resolver';

/** `TruthHarness.SampleRowIds` and `TruthHarness.ResolveProvenance`. */
export class HarnessProvenance {
  /**
   * A seeded sample of `n` primary keys of a loaded dataset's row table: every ID read (complete read), lower-cased and
   * sorted so the order does not depend on SQL collation, shuffled with a seeded Fisher–Yates (the engine's
   * Mulberry32). Same seed, same loaded seed (the dataset's `pstruth_dataset` stamp) → same sample.
   */
  public static async SampleRowIds(ctx: RunContext, dataset: LoadedDataset, n: number, seed: number): Promise<string[]> {
    const key = dataset.Entity.FirstPrimaryKey.Name; // first-pk-ok: the planted datasets' row tables have one key column
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Record<string, string>>({ EntityName: dataset.Entity.Name, Fields: [key], ResultType: 'simple', IgnoreMaxRows: true }, ctx.User);
    if (!r.Success) throw new Error(`reading ${dataset.Entity.Name} IDs failed: ${r.ErrorMessage}`);
    if (r.Results.length !== dataset.RowCount) throw new Error(`${dataset.Entity.Name}: read ${r.Results.length} IDs, the loaded seed has ${dataset.RowCount}`);
    if (n > r.Results.length) throw new Error(`cannot sample ${n} of ${r.Results.length} rows`);
    const ids = r.Results.map((x) => String(x[key]).toLowerCase()).sort();
    const rand = LockedHoldoutSplitter.Mulberry32(seed);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, n);
  }

  /**
   * Whether one assembled value names its scored row and resolves to its source, source version and computed-at,
   * read through the production seams on the harness's provider (see {@link ProvenanceResolver}).
   */
  public static ResolveProvenance(ctx: RunContext, check: ProvenanceCheck): Promise<boolean> {
    return ProvenanceResolver.ResolveValueProvenance(ProvenanceResolver.Sources(ctx.Provider, ctx.User), check);
  }
}
