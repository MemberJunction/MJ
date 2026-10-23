/**
 * Gate G0.2 "W2 → C1.1" (owner PR 4, Pending): with automated publishing on, at most 6 of 60 agent runs on W2-noise
 * s100–s159 reach Published (statRule noise-publish-60), and every run that publishes has a stored gate outcome 'model'
 * that publish reverification re-derives, 60 of 60 consistent. Nothing stores a gate outcome until PR 4, so half (b)
 * counts every published run as inconsistent; the test stays Pending until PR 4 activates it.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, ContainmentProbe, SeedRule, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW2C11Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-c1-1.G0.2', Name: 'G0.2 W2 → C1.1: at most 6 of 60 noise agent runs publish, each backed by a stored decision', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const publishedSeeds: number[] = [];
      const inconsistentSeeds: number[] = [];
      for (let seed = 100; seed <= 159; seed++) {
        const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: seed });
        const name = `PSTruth: G0.2 W2 s${seed} ${h.RunID}`;
        await h.RunBuilderAgent(AgentPlans.Build({
          Name: name, Entity: w2.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES],
          Algorithms: [...PsGateSpecs.Algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
        }));
        const models = await h.ModelsForPipelineNamePrefix(name);
        const published = models.filter((m) => ContainmentProbe.ReachedPublishedUnattended(m));
        if (published.length > 0) publishedSeeds.push(seed);
        // No stored gate outcome yet (half (b) is Pending until PR 4), so any published run is inconsistent.
        if (published.length > 0) inconsistentSeeds.push(seed);
      }
      const countOk = SeedRule.Passes('noise-publish-60', publishedSeeds.length, 60);
      const consistent = 60 - inconsistentSeeds.length;
      PsGate.Assert({
        Passed: countOk && consistent === 60,
        Measured: {
          runs: 60,
          published: publishedSeeds.length,
          maxPublished: SeedRule.AcceptanceRange('noise-publish-60', 60).Max,
          consistent,
          seeds: publishedSeeds.join(','),
          inconsistentSeeds: inconsistentSeeds.join(','),
        },
        Detail: `${publishedSeeds.length} of 60 agent runs reached Published with automated publishing on (≤ 6 accepted); ${consistent} of 60 runs consistent (stored outcome 'model', re-derived at publish)`,
      });
    },
  },
];

for (const c of PsGateW2C11Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-c1-1', PsGate.Lifecycle);
