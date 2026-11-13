/**
 * The truth-suite datasets: every catalog entry at every base seed loads into its `pstruth` table, and the entity reads
 * back exactly the loaded row count through MJAPI (the loader replaces a table's rows in one transaction, so the count
 * is exact). 68 checks: 8 worlds × 4 seeds, W2-noise × 21, and 15 scenarios × 1.
 */
import { RunView } from '@memberjunction/core';
import { Assert, AssertEqual, IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { CATALOG, DatasetSeeds } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsTruthDatasetChecks: NamedCheck[] = CATALOG.flatMap((entry) =>
  DatasetSeeds.SeedSet(entry.Kind, entry.Code, 'base').map((seed): NamedCheck => ({
    Id: `ps-truth-datasets.${entry.Code}-s${seed}`,
    Name: `${entry.Kind} ${entry.Code} seed ${seed}: loads and every row reads back through MJAPI`,
    RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const ds = await h.EnsureLoaded(PsGateSpecs.Ref(entry.Kind, entry.Code, seed));
      const res = await RunView.FromMetadataProvider(ctx.Provider).RunView({ EntityName: ds.Entity.Name, ResultType: 'count_only', BypassCache: true }, ctx.User);
      Assert(res.Success, `count of ${ds.Entity.Name}: ${res.ErrorMessage}`);
      Assert(ds.RowCount > 0, `${entry.Code} s${seed} loaded no rows`);
      AssertEqual(res.TotalRowCount, ds.RowCount, `${ds.Entity.Name} row count through MJAPI`);
    },
  })),
);

for (const c of PsTruthDatasetChecks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-truth-datasets', PsGate.Lifecycle);
