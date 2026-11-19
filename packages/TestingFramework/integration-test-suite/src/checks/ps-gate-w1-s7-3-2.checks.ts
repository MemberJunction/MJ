/**
 * Gate G5.2 "W1 → S7.3 #2" (owner PR 4, phase 5): `/predict` refuses what it cannot score, 2 of 2 (T16(b)), on the
 * running truth sidecar, called straight (no product layer):
 *
 * - the renamed feature (D4-154): the published W1-signal s42 model's stored v2 artifact with five W1 rows whose
 *   `EventsAttended` column is renamed is a 400 naming `EventsAttended`; the same rows unrenamed score (200), so the
 *   400 is the rename's;
 * - no stored schema: a legacy (v1) envelope (built by `truthsuite.judges.legacy_envelope`, the retired route's shape)
 *   sent without a feature schema is a 400 "no stored feature schema"; the same request with its schema scores (200).
 *   A v2 artifact is never refused for a missing request schema: it stores its own feature columns.
 *
 * The legacy envelope lives only in this request and the sidecar's warm cache: nothing is stored.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ArtifactObjects, HarnessSidecar, RunFixtures, W_WORLD_FEATURES, type SuitePredictOutcome, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { ScoringGateSteps, type FeatureRow } from './ps-gates/ps-gate-scoring';

/** The W1 feature the renamed half renames. */
const RENAMED_FEATURE = 'EventsAttended';
/** The legacy fixture the judge prints. */
interface LegacyFixture {
  readonly artifactB64: string;
  readonly fittedPreprocessing: { ops: Array<Record<string, string>>; output_columns: string[] };
  readonly featureSchema: Array<{ Name: string; Kind: 'numeric' }>;
  readonly rows: Array<Record<string, number>>;
}
/** One half: the refused call, its control, and whether the refusal names what it must. */
interface Half {
  readonly Refused: SuitePredictOutcome;
  readonly Control: SuitePredictOutcome;
  readonly Named: boolean;
}

/** G5.2's two halves. */
class PsGateW1S73No2Steps {
  /** The renamed-feature half on the published W1-signal s42 v2 model. */
  public static async Renamed(h: TruthHarness): Promise<Half> {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const model = await RunFixtures.W1S42PublishedModel(h);
    const artifact = await ArtifactObjects.ReadStoredObjectBase64(h, model.ModelID);
    const ids = await h.SampleRowIds(w1, 5, 42);
    const byId = await ScoringGateSteps.FeatureRows(h, w1, ids, W_WORLD_FEATURES);
    const rows = ids.map((id) => byId.Get(id)).filter((r): r is FeatureRow => r !== undefined);
    const renamed = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k === RENAMED_FEATURE ? `${RENAMED_FEATURE}Renamed` : k, v])));
    const refused = await HarnessSidecar.SuitePredict({ artifact_b64: artifact, fitted_preprocessing: {}, feature_schema: [], rows: renamed });
    const control = await HarnessSidecar.SuitePredict({ artifact_b64: artifact, fitted_preprocessing: {}, feature_schema: [], rows });
    return { Refused: refused, Control: control, Named: refused.Body !== null && refused.Body.includes(RENAMED_FEATURE) };
  }

  /** The no-stored-schema half on a legacy envelope. */
  public static async Unschemed(h: TruthHarness): Promise<Half> {
    const legacy = await h.Judge<LegacyFixture>('legacy_envelope', []);
    const base = { artifact_b64: legacy.artifactB64, fitted_preprocessing: legacy.fittedPreprocessing, rows: legacy.rows };
    const refused = await HarnessSidecar.SuitePredict({ ...base, feature_schema: [] });
    const control = await HarnessSidecar.SuitePredict({ ...base, feature_schema: legacy.featureSchema });
    return { Refused: refused, Control: control, Named: refused.Body !== null && refused.Body.includes('no stored feature schema') };
  }

  /** A refused half: a 400 that names what it must, beside a control that scored. */
  public static Holds(half: Half): boolean {
    return half.Refused.Status === 400 && half.Named && half.Control.Status === 200;
  }

  /** An outcome in words: "400 <detail>" or "200 (N predictions)". */
  public static Describe(o: SuitePredictOutcome): string {
    return o.Response !== null ? `${o.Status} (${o.Response.predictions.length} predictions)` : `${o.Status} ${o.Body.slice(0, 200)}`;
  }
}

export const PsGateW1S73No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s7-3-2.G5.2', Name: 'G5.2 W1 → S7.3 #2: /predict refuses a renamed feature naming it (W1 s42 v2 model) and a legacy model with no stored schema, 2 of 2', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const renamed = await PsGateW1S73No2Steps.Renamed(h);
      const unschemed = await PsGateW1S73No2Steps.Unschemed(h);
      const refused = [renamed, unschemed].filter((half) => PsGateW1S73No2Steps.Holds(half)).length;
      PsGate.Assert({
        Passed: refused === 2,
        Measured: {
          refused, of: 2, renamedStatus: renamed.Refused.Status, renamedNamesFeature: renamed.Named, renamedControlStatus: renamed.Control.Status,
          unschemedStatus: unschemed.Refused.Status, unschemedNamesSchema: unschemed.Named, unschemedControlStatus: unschemed.Control.Status,
        },
        Detail: `refused ${refused} of 2: renamed ${RENAMED_FEATURE} → ${PsGateW1S73No2Steps.Describe(renamed.Refused)} (unrenamed control ${PsGateW1S73No2Steps.Describe(renamed.Control)}); `
          + `legacy model without a stored schema → ${PsGateW1S73No2Steps.Describe(unschemed.Refused)} (with its schema ${PsGateW1S73No2Steps.Describe(unschemed.Control)})`,
      });
    },
  },
];

for (const c of PsGateW1S73No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s7-3-2', PsGate.Lifecycle);
