/**
 * Gate G0.2 "W2 → C1.1" (owner PR 4, phase 0): with automated publishing on, at most 6 of 60 agent runs on W2-noise
 * s100–s159 reach Published (statRule noise-publish-60), and 60 of 60 runs are consistent with their stored gate
 * outcome, read per training run (§4.1, D4-56): a run whose model reached Published has a stored `model` outcome that
 * `PublishRules.ReverifyPublish` re-derives and a `publish` record, and every other training run carries the record of
 * its outcome (§5.7 R4) — `AgentRunOutcomes`. An inconsistent run is named in the detail (seed, run, what is missing).
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, SeedRule, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { AgentRunOutcomes, type RunOutcome } from './ps-gates/ps-gate-run-outcomes';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The first W2-noise seed and the seed count. */
const FIRST_SEED = 100;
const SEEDS = 60;

/** One seed's agent run: its training runs, classified. */
interface SeedOutcome {
  readonly Seed: number;
  readonly AgentRunID: string | null;
  readonly Runs: readonly RunOutcome[];
}

/** G0.2's per-seed step and its words. */
class PsGateW2C11Steps {
  /** One seed: a builder-agent run with automated publishing on, then each of its training runs classified. */
  public static async Seed(h: TruthHarness, seed: number): Promise<SeedOutcome> {
    const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: seed });
    const name = `PSTruth: G0.2 W2 s${seed} ${h.RunID}`;
    const run = await h.RunBuilderAgent(AgentPlans.Build({
      Name: name, Entity: w2.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES],
      Algorithms: [...PsGateSpecs.Algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
    }));
    // A crashed run publishes nothing, so counting it would pass the gate: it is an error, not a measurement.
    if (!run.AgentSuccess) throw new Error(`G0.2 W2 s${seed}: builder agent run ${run.AgentRunID || '(none)'} failed: ${run.AgentErrorMessage || 'no error message'}`);
    return { Seed: seed, AgentRunID: run.AgentRunID, Runs: await AgentRunOutcomes.Classify(h, `G0.2 W2 s${seed}`, name, run.PipelineIDs) };
  }

  /** Every inconsistent run in words: seed, training run and what is missing; "none" when every run is consistent. */
  public static Inconsistent(seeds: readonly SeedOutcome[]): string {
    const lines = seeds.flatMap((s) => s.Runs.filter((r) => !r.Consistent).map((r) => `s${s.Seed} run ${r.TrainingRunID}: ${r.Missing}`));
    return lines.length === 0 ? 'none' : lines.join('; ');
  }

  /** The stored outcomes of the training runs with their counts (`no-signal:57 keep-simple-baseline:3`). */
  public static Outcomes(seeds: readonly SeedOutcome[]): string {
    const counts = new Map<string, number>();
    for (const r of seeds.flatMap((s) => s.Runs)) counts.set(r.StoredOutcome, (counts.get(r.StoredOutcome) || 0) + 1);
    return [...counts.entries()].map(([k, n]) => `${k}:${n}`).join(' ');
  }
}

export const PsGateW2C11Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-c1-1.G0.2', Name: 'G0.2 W2 → C1.1: at most 6 of 60 noise agent runs publish, and every run is consistent with its stored gate outcome', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const seeds: SeedOutcome[] = [];
      for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed++) seeds.push(await PsGateW2C11Steps.Seed(h, seed));
      const publishedSeeds = seeds.filter((s) => s.Runs.some((r) => r.Published)).map((s) => s.Seed);
      const consistent = seeds.filter((s) => s.Runs.every((r) => r.Consistent)).length;
      const trainingRuns = seeds.reduce((n, s) => n + s.Runs.length, 0);
      const inconsistent = PsGateW2C11Steps.Inconsistent(seeds);
      PsGate.Assert({
        Passed: SeedRule.Passes('noise-publish-60', publishedSeeds.length, SEEDS) && consistent === SEEDS,
        Measured: {
          runs: SEEDS,
          published: publishedSeeds.length,
          maxPublished: SeedRule.AcceptanceRange('noise-publish-60', SEEDS).Max,
          consistent,
          trainingRuns,
          storedOutcomes: PsGateW2C11Steps.Outcomes(seeds),
          seeds: publishedSeeds.join(','),
          inconsistent,
        },
        Detail: `${publishedSeeds.length} of ${SEEDS} agent runs reached Published with automated publishing on (≤ 6 accepted); `
          + `${consistent} of ${SEEDS} runs consistent with their stored gate outcome (per training run); inconsistent: ${inconsistent}`,
      });
    },
  },
];

for (const c of PsGateW2C11Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-c1-1', PsGate.Lifecycle);
