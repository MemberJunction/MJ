/**
 * Gate G0.3 "W3 → C1.1" (owner PR 4, phase 0): with automated publishing on, 0 of 2 agent runs on W3-leak-row s42
 * (both plan orders) reach Published: the automation itself refuses the leak. W3 s42's stored decision keeps the
 * simple baseline, so under the default protocol the keep-baseline rule would refuse first and hide the leakage check;
 * both runs therefore build under a supplied protocol with `autoPublishKeepBaseline: true` (the owner's ruling of
 * 2026-11-16, OF4-30), and the deciding refusal of every training run must be `unacknowledged-leakage-flags`. Each run's
 * training runs are read as G0.2 reads them (`AgentRunOutcomes`), and the stored gate decision of each run is logged.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { AgentRunOutcomes, type RunOutcome } from './ps-gates/ps-gate-run-outcomes';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The refusal that must decide every W3 s42 run. */
const LEAKAGE_REFUSAL = 'unacknowledged-leakage-flags';

/** G0.3's reading of one order's training runs. */
class PsGateW3C11Steps {
  /** True when no run of the order is Published and every run carries the leakage refusal. */
  public static LeakageDecided(runs: readonly RunOutcome[]): boolean {
    return runs.every((r) => !r.Published && r.RefusalKinds.includes(LEAKAGE_REFUSAL));
  }

  /** The order's runs as `<stored decision>/<refusal kinds>` joined by `+` (`none` for a run without refusals). */
  public static Describe(runs: readonly RunOutcome[]): string {
    return runs.map((r) => `${r.StoredOutcome}/${r.RefusalKinds.join('|') || 'none'}`).join('+');
  }
}

export const PsGateW3C11Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w3-c1-1.G0.3', Name: 'G0.3 W3 → C1.1: 0 of 2 agent runs on the leak world reach Published', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w3 = await h.EnsureLoaded({ Kind: 'world', ID: 'W3-leak-row', Seed: 42 });
      const features = [...W_WORLD_FEATURES, 'Status'];
      const published: string[] = [];
      const runs: { readonly Order: string; readonly Runs: readonly RunOutcome[] }[] = [];
      for (const [order, algorithms] of [
        ['lr-first', PsGateSpecs.Algorithms],
        ['lr-last', [...PsGateSpecs.Algorithms].reverse()],
      ] as const) {
        const name = `PSTruth: G0.3 W3 s42 ${order} ${h.RunID}`;
        const run = await h.RunBuilderAgent(AgentPlans.Build({
          Name: name, Entity: w3.Entity, Target: 'Renewed', Features: features,
          Algorithms: [...algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
        }), { AutoPublishKeepBaseline: true });
        // A crashed run publishes nothing, so counting it would pass the gate: it is an error, not a measurement.
        if (!run.AgentSuccess) throw new Error(`G0.3 W3 s42 ${order}: builder agent run ${run.AgentRunID || '(none)'} failed: ${run.AgentErrorMessage || 'no error message'}`);
        const outcomes = await AgentRunOutcomes.Classify(h, `G0.3 W3 s42 ${order}`, name, run.PipelineIDs);
        if (outcomes.some((r) => r.Published)) published.push(order);
        runs.push({ Order: order, Runs: outcomes });
      }
      const decided = runs.filter((o) => PsGateW3C11Steps.LeakageDecided(o.Runs)).length;
      const outcomes = runs.map((o) => `${o.Order}:${PsGateW3C11Steps.Describe(o.Runs)}`).join(',');
      const missing = runs.flatMap((o) => o.Runs.filter((r) => !r.Published && !r.Consistent).map((r) => `${o.Order} run ${r.TrainingRunID}: ${r.Missing}`));
      PsGate.Assert({
        Passed: published.length === 0 && decided === 2,
        Measured: { runs: 2, published: published.length, orders: published.join(','), leakageDecided: decided, outcomes, missing: missing.join('; ') || 'none' },
        Detail: `${published.length} of 2 agent runs on W3 s42 reached Published with automated publishing on and a protocol that publishes a kept baseline; ${decided} of 2 refused by ${LEAKAGE_REFUSAL}`,
      });
    },
  },
];

for (const c of PsGateW3C11Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w3-c1-1', PsGate.Lifecycle);
