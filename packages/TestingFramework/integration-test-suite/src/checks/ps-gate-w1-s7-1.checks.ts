/**
 * Gate G3.1 "W1 → S7.1" (owner PR 4, phase 3): a W1-signal s42 model whose stored artifact object is removed after a
 * warm score is refused ARTIFACT_MISSING and shown unscorable (`ArtifactStatus` 'missing'), 1 of 1; a kept model scores
 * 16,776 of 16,776 before and after a restart of the truth sidecar with bit-identical predictions and an unchanged
 * registered SHA-256 (D4-59). The MJAPI half of the restart is M2's runtime exit step: a check cannot restart the MJAPI
 * its client provider talks to.
 *
 * The scoring operation reports no artifact hash and nothing writes `MJ: ML Scoring Runs.ArtifactSha256` yet, so the
 * hash compared across the restart is the model row's registered `ArtifactSha256`, read after each score.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ArtifactObjects, HarnessSidecar, type ScoreAttempt } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PredictionDigest, PsGateRegistry } from './ps-gates/ps-gate-registry';

/** How G3.1 judges and words its scoring attempts. */
class PsGateW1S71Steps {
  /** "refused <code>", "refused without a refusal code", or "not refused (the run succeeded: N scored, M failed)". */
  public static Outcome(a: ScoreAttempt): string {
    if (a.Ok) return `not refused (the run succeeded: ${a.Scored} scored, ${a.Failed} failed)`;
    return a.RefusalCode ? `refused ${a.RefusalCode}` : 'refused without a refusal code';
  }

  /** True when the attempt scored every row and returned a prediction for each (no write-back withholds them). */
  public static Complete(a: ScoreAttempt, rows: number): boolean {
    return a.Ok && a.Scored === rows && a.Predictions.length === rows;
  }

  /** Both attempts complete and their `(RecordID, Score, Class)` digests equal. */
  public static Identical(before: ScoreAttempt, after: ScoreAttempt, rows: number): boolean {
    return PsGateW1S71Steps.Complete(before, rows) && PsGateW1S71Steps.Complete(after, rows) && PredictionDigest.Of(before) === PredictionDigest.Of(after);
  }
}

export const PsGateW1S71Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s7-1.G3.1', Name: 'G3.1 W1 → S7.1: a lost artifact refuses loudly after a warm score; a kept one scores bit-identically across a sidecar restart', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const lost = await PsGateRegistry.ValidatedWorldModel(h, 'G3.1 lost', w1);
      const warmed = await h.Score(lost, PsGateRegistry.ScoreAll(w1));          // fills any in-process cache (MJAPI's loader, the sidecar's warm cache)
      await ArtifactObjects.RemoveStoredObject(h, lost);
      const refused = await h.Score(lost, PsGateRegistry.ScoreAll(w1));          // a cache that outlives storage serves here
      const afterLoss = await h.ReadModel(lost);
      const kept = await PsGateRegistry.ValidatedWorldModel(h, 'G3.1 kept', w1);
      const before = await h.Score(kept, PsGateRegistry.ScoreAll(w1));
      const keptBefore = await h.ReadModel(kept);
      await HarnessSidecar.Restart();                               // the sidecar process and its warm cache are gone
      const after = await h.Score(kept, PsGateRegistry.ScoreAll(w1));
      const keptRow = await h.ReadModel(kept);
      const identical = PsGateW1S71Steps.Identical(before, after, w1.RowCount);
      const warmedComplete = PsGateW1S71Steps.Complete(warmed, w1.RowCount);
      const hashKept = keptBefore.ArtifactSha256 !== null && keptRow.ArtifactSha256 === keptBefore.ArtifactSha256;
      const refusedLoudly = !refused.Ok && refused.RefusalCode === 'ARTIFACT_MISSING';
      PsGate.Assert({
        Passed: warmedComplete && refusedLoudly && afterLoss.ArtifactStatus === 'missing' && identical && hashKept,
        Measured: {
          warmedOk: warmed.Ok, warmedScored: warmed.Scored, warmedPredictions: warmed.Predictions.length, refusedLoudly: refusedLoudly ? 1 : 0, refusalCode: refused.RefusalCode,
          artifactStatus: afterLoss.ArtifactStatus, scoredBefore: before.Scored, predictionsBefore: before.Predictions.length, scoredAfter: after.Scored,
          predictionsAfter: after.Predictions.length, rows: w1.RowCount, predictionsIdentical: identical, sha256Before: keptBefore.ArtifactSha256, sha256After: keptRow.ArtifactSha256,
        },
        Detail: `run fails loudly, ${refusedLoudly ? 1 : 0} of 1: lost artifact ${PsGateW1S71Steps.Outcome(refused)} after a warm score of ${warmed.Scored} of ${w1.RowCount} `
          + `(ArtifactStatus ${afterLoss.ArtifactStatus}); kept artifact scored ${before.Scored} (${before.Predictions.length} predictions) before and ${after.Scored} `
          + `(${after.Predictions.length} predictions) of ${w1.RowCount} after a sidecar restart, predictions ${identical ? 'bit-identical' : 'different or incomplete'}, `
          + `registered SHA-256 ${hashKept ? 'unchanged' : 'changed or missing'}`,
      });
    },
  },
];

for (const c of PsGateW1S71Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s7-1', PsGate.Lifecycle);
