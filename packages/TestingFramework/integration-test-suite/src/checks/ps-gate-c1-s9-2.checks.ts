/**
 * Gate G3.7 "C1 → S9.2" (owner PR 4, phase 3): 10 of 10 numbers sampled from the C1 model story and the model detail's
 * trust line trace to a stored row and recompute from it. The fixture trains C1 on its reference split (the as-of
 * assembly pipeline under `C1ReferenceProtocol`) and evaluates it through the lifecycle gate. The pool is every number
 * the experiment report renders (regenerated from the run and model rows as the agent builds it) and every number the
 * trust banner renders (the evidence count, the headline's comparison and the numbers its stored reason quotes,
 * D4-124). Ten are drawn without replacement with a
 * mulberry32 PRNG seeded 42; each is re-read from its row (fresh, by entity and ID), recomputed at its path, found in
 * the text it was rendered into, and its token checked to print the stored value at the token's precision.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { TrustVerdicts, type TracedNumber } from '@memberjunction/predictive-studio-core';
import { RunFixtures, UnitFixtures, type TrainAttempt, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';
import { SeededSample, TracedNumberChecks, type NumberCheck, type ReportWords } from './ps-gates/ps-gate-traced-numbers';

/** A pooled number, the surface that rendered it and the text it was rendered into. */
interface PooledNumber {
  readonly Number: TracedNumber;
  readonly Origin: 'report' | 'trust-line';
  readonly Rendered: string;
}

/** How many numbers are sampled, and the PRNG seed. */
const SAMPLED = 10;
const SEED = 42;

/** G3.7's pool and words. */
class PsGateC1S92Steps {
  /** The model a training produced; throws naming the run's failure. */
  public static ModelOf(t: TrainAttempt): string {
    if (!t.ModelID) throw new Error(`G3.7: training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
    return t.ModelID;
  }

  /**
   * The report's numbers (rendered into its Markdown) and the trust banner's (the evidence count, the headline's
   * comparison and the numbers the stored reason quotes, rendered into the evidence line, the headline and the reason),
   * each number once.
   */
  public static async Pool(h: TruthHarness, words: ReportWords, runId: string, modelId: string): Promise<PooledNumber[]> {
    const { Input: input, Report: report } = await TracedNumberChecks.RegenerateReport(h, words, runId, modelId);
    const trust = input.Trust;
    const pool: PooledNumber[] = report.Numbers.map((n) => ({ Number: n, Origin: 'report', Rendered: report.Markdown }));
    if (trust !== null) {
      const evidence = TrustVerdicts.TrustEvidenceLine({ count: trust.HoldoutRows, noun: 'records', runId });
      const trustLine = `${evidence.Text} ${trust.Headline} ${trust.Reason}`;
      const reasonNumbers = TrustVerdicts.StoredReasonNumbers(input.Run === null ? null : input.Run.ValidationResults, runId);
      for (const n of [...evidence.Numbers, ...TrustVerdicts.ComparisonNumbers(trust, runId), ...reasonNumbers]) pool.push({ Number: n, Origin: 'trust-line', Rendered: trustLine });
    }
    return PsGateC1S92Steps.distinct(pool);
  }

  /** The pool with one entry per surface, token, row and path (the report cites a number once however often it shows it). */
  private static distinct(pool: readonly PooledNumber[]): PooledNumber[] {
    const seen = new Set<string>();
    return pool.filter((p) => {
      const key = `${p.Origin}|${p.Number.Text}|${p.Number.Source.EntityName}|${p.Number.Source.RecordID}|${p.Number.Source.Path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const PsGateC1S92Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s9-2.G3.7', Name: 'G3.7 C1 → S9.2: 10 numbers sampled from the C1 model story and trust line each recompute from their stored row, 10 of 10', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1AssemblyPipeline(h, EvaluationProtocolGates.C1ReferenceProtocol);
      const modelId = PsGateC1S92Steps.ModelOf(await h.Train(pipeline));
      const status = await RunFixtures.EvaluateModel(h, modelId, 'G3.7 C1');
      const run = await UnitFixtures.LatestRun(h, pipeline.ID);
      const words: ReportWords = { Name: pipeline.Name, Goal: pipeline.Description || `Predict ${pipeline.TargetVariable}`, TargetVariable: pipeline.TargetVariable, TargetMetric: 'AUC' };
      const pool = await PsGateC1S92Steps.Pool(h, words, run.ID, modelId);
      const sampled = pool.length >= SAMPLED ? SeededSample.Draw(pool, SAMPLED, SEED) : [];
      const checks: NumberCheck[] = [];
      for (const p of sampled) checks.push(await TracedNumberChecks.Check(h, p.Number, p.Rendered));
      const recomputed = checks.filter((c) => c.Ok).length;
      const firstFailure = checks.find((c) => !c.Ok)?.Detail || (pool.length < SAMPLED ? `the pool holds ${pool.length} numbers, fewer than ${SAMPLED}` : 'none');
      PsGate.Assert({
        Passed: pool.length >= SAMPLED && recomputed === SAMPLED,
        Measured: {
          pool: pool.length, sampled: sampled.length, recomputed, seed: SEED, modelStatus: status, runId: run.ID,
          sampledTokens: sampled.map((p) => `${p.Origin}:${p.Number.Text}@${p.Number.Source.Path}`).join(' '), firstFailure,
        },
        Detail: `${recomputed} of ${SAMPLED} sampled numbers (from ${pool.length} in the C1 report and trust line) recompute from their stored row; first failure: ${firstFailure}`,
      });
    },
  },
];

for (const c of PsGateC1S92Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s9-2', PsGate.Lifecycle);
