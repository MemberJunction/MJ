/**
 * Gate G5.6 "C1 → S7.4 #2" (owner PR 4, phase 5, D-058, D-060; D-078 reads "after the refresh" as "immediately after
 * the scoring run, with no refresh call", §4.1): on scenario C1, publishing the renewal model and creating its scoring
 * binding (`FeatureName`, `ViewAuthorizationID`, no `TargetColumn`) changes 0 rows of `sys.columns` and runs no
 * migration or CodeGen; one scoring run writes a `Source = 'Model'` row carrying `MLModelScoringBindingID`,
 * `MLModelID`, `MLScoringRunID` and `EffectiveAsOf` for 100% of scored records; `MJ: Latest Feature Values` holds each;
 * the record panel on a scored record shows the prediction with its lineage to a user holding the binding's view
 * authorization, 1 of 1, and shows nothing to a user without it, 1 of 1.
 *
 * The C1 renewal model is trained and published through the lifecycle gate as G5.4's is, bound through a test binding
 * and scored by one Score Record Set call. "No migration or CodeGen" is measured (review minor m7): the stored query
 * "Predictive Studio: Schema Column Fingerprint" before the publish and after the run — the column checksum, the
 * `flyway_schema_history` row count and the newest `MJ: Entities.__mj_UpdatedAt`. The panel half replays the panel's own
 * batch (`PredictionPanelQueries.For`) on each identity's provider (IT182's two minted identities); the rendering half
 * is Task M5b.9's browser walk of the same two identities (D-076).
 */
import { RunView } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { HarnessScoring, RunFixtures, UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { ScoringGateSteps } from './ps-gates/ps-gate-scoring';
import { ScoringLineage } from './ps-gates/ps-gate-scoring-lineage';
import { PsPredictionServing, type PanelReplay } from './ps-prediction-serving.checks';

/** The binding columns the panel replay needs. */
type GateBinding = Pick<MJMLModelScoringBindingEntity, 'ID' | 'FeatureName' | 'ViewAuthorizationID' | 'TargetEntityID' | 'TargetColumn'>;

export const PsGateC1S74No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s7-4-2.G5.6', Name: 'G5.6 C1 → S7.4 #2: a published, bound C1 model\'s predictions reach a Person with zero schema change, shown only to its authorization\'s holders', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const before = await PsPredictionServing.Fingerprint(h.Provider, h.User);
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1AssemblyPipeline(h, EvaluationProtocolGates.C1ReferenceProtocol);
      const t = await h.Train(pipeline);
      if (!t.ModelID) throw new Error(`G5.6: C1 training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
      await RunFixtures.PublishModel(h, t.ModelID, 'G5.6 C1');
      const model = await h.ReadModel(t.ModelID);
      const entityName = HarnessScoring.BindingEntityName({ ID: model.ModelID, PipelineID: model.PipelineID, Lineage: model.LineageJSON }, null);
      const bindingId = await HarnessScoring.Binding(h, model.ModelID, ScoringGateSteps.FeatureName(h, 'G5.6 renewal'));
      const binding = await readBinding(h, bindingId);
      const run = await h.Score(model.ModelID, { bindingId, scope: { filter: { entityName } } });
      const after = await PsPredictionServing.Fingerprint(h.Provider, h.User);
      const delta = PsPredictionServing.Delta(before, after);
      const lineage = await ScoringLineage.Read(h, run.ScoringRunID === null ? [] : [run.ScoringRunID]);
      const rowsWithLineage = lineage.Rows.filter((r) => ScoringLineage.Complete(r)).length;
      const latest = await PsPredictionServing.ReadModelRows(h.Provider, binding.FeatureName);
      const scoredRecord = lineage.Rows[0]?.Value.RecordID;
      let authorized: PanelReplay = { Cards: 0, ValuesReturned: 0, ReadError: 'no scored record' };
      let restricted: PanelReplay = { Cards: 0, ValuesReturned: 0, ReadError: 'no scored record' };
      if (scoredRecord !== undefined && binding.TargetEntityID) {
        const identities = await PsPredictionServing.MintIdentities(ctx, `G5.6 ${h.RunID}`);
        try {
          authorized = await PsPredictionServing.PanelCards(identities.Authorized.Provider, binding.TargetEntityID, scoredRecord, binding);
          restricted = await PsPredictionServing.PanelCards(identities.Restricted.Provider, binding.TargetEntityID, scoredRecord, binding);
        } finally {
          await PsPredictionServing.ReleaseIdentities(ctx, identities);
        }
      }
      const panelRestricted = Math.max(restricted.Cards, restricted.ValuesReturned);
      const scored = run.Written;
      PsGate.Assert({
        Passed: run.Ok && binding.TargetColumn === null && delta.ColumnsChanged === 0 && delta.MigrationsAdded === 0 && delta.EntityMetadataChanged === 0
          && scored > 0 && run.Total === scored && rowsWithLineage === scored && latest.LatestFeatureValues === scored && authorized.Cards === 1 && panelRestricted === 0,
        Measured: {
          columnsChanged: delta.ColumnsChanged, migrationsAdded: delta.MigrationsAdded, entityMetadataChanged: delta.EntityMetadataChanged,
          rowsWithLineage, scored, latestRows: latest.LatestFeatureValues, panelAuthorized: authorized.Cards, panelRestricted,
          targetColumn: binding.TargetColumn, refusal: run.ErrorMessage?.slice(0, 200) || null,
          panelReadError: authorized.ReadError || restricted.ReadError, entity: entityName,
        },
        Detail: `publishing and binding the C1 model changed ${delta.ColumnsChanged} column(s), applied ${delta.MigrationsAdded} migration(s) and touched entity metadata ${delta.EntityMetadataChanged} time(s); `
          + `${rowsWithLineage} of ${scored} scored records carry the four lineage fields and ${latest.LatestFeatureValues} are in MJ: Latest Feature Values; `
          + `the panel shows the prediction to a user holding the binding's authorization, ${authorized.Cards} of 1, and shows nothing to a user without it, ${1 - panelRestricted} of 1`,
      });
    },
  },
];

/** The test binding's columns the gate reads, through the gate's client provider. */
async function readBinding(h: Awaited<ReturnType<typeof PsGate.Harness>>, bindingId: string): Promise<GateBinding> {
  const r = await RunView.FromMetadataProvider(h.Provider).RunView<GateBinding>({
    EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `ID = '${EscapeSQLString(bindingId)}'`,
    Fields: ['ID', 'FeatureName', 'ViewAuthorizationID', 'TargetEntityID', 'TargetColumn'], ResultType: 'simple', BypassCache: true,
  }, h.User);
  const row = r.Success ? r.Results[0] : undefined;
  if (!row) throw new Error(`G5.6: reading the test binding ${bindingId} failed: ${r.ErrorMessage || 'no row'}`);
  return row;
}

for (const c of PsGateC1S74No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s7-4-2', PsGate.Lifecycle);
