/**
 * Gate G3.9 "W9 → S9.5" (owner PR 4, phase 3): on W9-multiclass s42, the probability displayed for the named class
 * equals the artifact's `predict_proba` column for that class on 20 of 20 sampled rows.
 *
 * The C3 multiclass model (`Attended`, `Cancelled`, `NoShow`) is trained, evaluated and published through the lifecycle
 * gate. Score Record Set (no binding: nothing written) scores 20 rows sampled with seed 42 and returns, per row, the
 * class it names and the probability it displays for it. The same 20 rows' raw features go straight to the truth
 * sidecar with the model's stored artifact: its answer is the artifact's probability vector in the artifact's own
 * `classOrder`. A row matches when the displayed probability equals the vector's entry at the named class's position in
 * that order, within 1e-9.
 */
import { IndexByUUID } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ArtifactObjects, HarnessSidecar, RunFixtures, UnitFixtures, type ScoreAttempt, type SuitePredictOutcome } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { ScoringGateSteps, type FeatureRow } from './ps-gates/ps-gate-scoring';

/** Rows sampled. */
const SAMPLED = 20;
/** The sample's seed. */
const SEED = 42;
/** The W9 registration columns the C3 pipeline trains on. */
const W9_FEATURES = ['TicketTier', 'DaysRegisteredBefore', 'PriorAttendance'] as const;
/** The tolerance a displayed probability must meet. */
const TOLERANCE = 1e-9;

/** One sampled row's comparison. */
interface RowMatch {
  readonly RecordID: string;
  readonly Class: string | null;
  readonly Displayed: number | null;
  readonly Artifact: number | null;
  readonly Matched: boolean;
}

/** G3.9's comparison. */
class PsGateW9S95Steps {
  /** Each sampled row: the displayed probability of its named class against the artifact's column for that class. */
  public static Matches(ids: readonly string[], shown: ScoreAttempt, direct: SuitePredictOutcome): RowMatch[] {
    const byId = IndexByUUID(shown.Predictions, (p) => p.RecordID);
    const order = direct.Response?.classOrder || [];
    return ids.map((id, i) => {
      const p = byId.Get(id);
      const vector = direct.Response?.predictions[i]?.probabilities || null;
      const at = p?.Class ? order.indexOf(p.Class) : -1;
      const artifact = vector !== null && at >= 0 && at < vector.length ? vector[at] : null;
      const displayed = p ? p.Score : null;
      return { RecordID: id, Class: p?.Class || null, Displayed: displayed, Artifact: artifact, Matched: displayed !== null && artifact !== null && Math.abs(displayed - artifact) <= TOLERANCE };
    });
  }
}

export const PsGateW9S95Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w9-s9-5.G3.9', Name: 'G3.9 W9 → S9.5: the probability displayed for the named class equals the artifact\'s predict_proba column for that class on 20 of 20 sampled rows', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w9 = await h.EnsureLoaded({ Kind: 'world', ID: 'W9-multiclass', Seed: 42 });
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionW9MulticlassPipeline(h);
      const t = await h.Train(pipeline);
      if (!t.ModelID) throw new Error(`G3.9: W9 training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
      await RunFixtures.PublishModel(h, t.ModelID, 'G3.9 W9');
      const ids = await h.SampleRowIds(w9, SAMPLED, SEED);
      const shown = await h.Score(t.ModelID, { scope: { records: ids } });
      const byId = await ScoringGateSteps.FeatureRows(h, w9, ids, W9_FEATURES);
      const rows = ids.map((id) => byId.Get(id)).filter((r): r is FeatureRow => r !== undefined);
      const artifact = await ArtifactObjects.ReadStoredObjectBase64(h, t.ModelID);
      const direct = await HarnessSidecar.SuitePredict({ artifact_b64: artifact, fitted_preprocessing: {}, feature_schema: [], rows });
      const matches = PsGateW9S95Steps.Matches(ids, shown, direct);
      const matched = matches.filter((m) => m.Matched).length;
      const firstMiss = matches.find((m) => !m.Matched);
      PsGate.Assert({
        Passed: shown.Ok && direct.Status === 200 && matched === SAMPLED,
        Measured: {
          matched, of: SAMPLED, scored: shown.Total, artifactStatus: direct.Status, artifactClassOrder: (direct.Response?.classOrder || []).join(','),
          classesNamed: [...new Set(matches.map((m) => m.Class || 'none'))].sort().join(','),
          firstMiss: firstMiss === undefined ? null : `${firstMiss.RecordID} ${firstMiss.Class}: shown ${firstMiss.Displayed} vs artifact ${firstMiss.Artifact}`,
          scoreError: shown.ErrorMessage?.slice(0, 200) || null, artifactError: direct.Body?.slice(0, 200) || null,
        },
        Detail: `${matched} of ${SAMPLED} sampled W9 rows show the artifact's predict_proba column for the named class (artifact class order ${(direct.Response?.classOrder || []).join(', ') || 'unread'})`,
      });
    },
  },
];

for (const c of PsGateW9S95Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w9-s9-5', PsGate.Lifecycle);
