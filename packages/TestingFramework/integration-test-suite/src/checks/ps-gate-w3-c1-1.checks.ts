/**
 * Gate G0.3 "W3 → C1.1" (owner PR 4, Pending): with automated publishing on, 0 of 2 agent runs on W3-leak-row s42
 * (both plan orders) reach Published: the automation itself refuses the leak. Pending until PR 4 activates it.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, ContainmentProbe, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

export const PsGateW3C11Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w3-c1-1.G0.3', Name: 'G0.3 W3 → C1.1: 0 of 2 agent runs on the leak world reach Published', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w3 = await h.EnsureLoaded({ Kind: 'world', ID: 'W3-leak-row', Seed: 42 });
      const features = [...W_WORLD_FEATURES, 'Status'];
      const published: string[] = [];
      for (const [order, algorithms] of [
        ['lr-first', PsGateSpecs.Algorithms],
        ['lr-last', [...PsGateSpecs.Algorithms].reverse()],
      ] as const) {
        const name = `PSTruth: G0.3 W3 s42 ${order} ${h.RunID}`;
        const run = await h.RunBuilderAgent(AgentPlans.Build({
          Name: name, Entity: w3.Entity, Target: 'Renewed', Features: features,
          Algorithms: [...algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
        }));
        // A crashed run publishes nothing, so counting it would pass the gate: it is an error, not a measurement.
        if (!run.AgentSuccess) throw new Error(`G0.3 W3 s42 ${order}: builder agent run ${run.AgentRunID || '(none)'} failed: ${run.AgentErrorMessage || 'no error message'}`);
        if ((await h.ModelsForPipelineNamePrefix(name)).some((m) => ContainmentProbe.ReachedPublishedUnattended(m))) {
          published.push(order);
        }
      }
      PsGate.Assert({
        Passed: published.length === 0,
        Measured: { runs: 2, published: published.length, orders: published.join(',') },
        Detail: `${published.length} of 2 agent runs on W3 s42 reached Published with automated publishing on`,
      });
    },
  },
];

for (const c of PsGateW3C11Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w3-c1-1', PsGate.Lifecycle);
