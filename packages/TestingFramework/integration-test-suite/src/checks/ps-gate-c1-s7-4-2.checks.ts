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
 * batch (`PredictionPanelQueries.For`) on each identity's provider (IT186's two minted identities); the rendering half
 * is Task M5b.9's browser walk of the same two identities (D-076).
 */
import { RunView } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { HarnessScoring, RunFixtures, UnitFixtures, type GateMeasurement } from '@memberjunction/predictive-studio-truth-suite';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { ScoringGateSteps } from './ps-gates/ps-gate-scoring';
import { ScoringLineage } from './ps-gates/ps-gate-scoring-lineage';
import { PsPredictionServing, type FingerprintDelta, type PanelReplay } from './ps-prediction-serving.checks';

/** The binding columns the panel replay needs. */
type GateBinding = Pick<MJMLModelScoringBindingEntity, 'ID' | 'FeatureName' | 'ViewAuthorizationID' | 'TargetEntityID' | 'TargetColumn'>;

export const PsGateC1S74No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s7-4-2.G5.6', Name: 'G5.6 C1 → S7.4 #2: a published, bound C1 model\'s predictions reach a Person with zero schema change, shown only to its authorization\'s holders', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const before = await PsPredictionServing.Fingerprint(h.Provider, h.User);
      const published = await publishBindAndScore(h);
      const delta = PsPredictionServing.Delta(before, await PsPredictionServing.Fingerprint(h.Provider, h.User));
      const run = published.Run;
      const lineage = await ScoringLineage.Read(h, run.ScoringRunID === null ? [] : [run.ScoringRunID]);
      const rowsWithLineage = lineage.Rows.filter((r) => ScoringLineage.Complete(r)).length;
      const latest = await PsPredictionServing.ReadModelRows(h.Provider, published.Binding.FeatureName);
      const panels = await replayPanels(ctx, h, published.Binding, lineage.Rows[0]?.Value.RecordID);
      PsGate.Assert(measure(published, delta, rowsWithLineage, latest.LatestFeatureValues, panels));
    },
  },
];

/** Gate G5.6's harness. */
type GateHarness = Awaited<ReturnType<typeof PsGate.Harness>>;

/** The C1 model published, bound and scored once. */
interface PublishedScoring {
  readonly Binding: GateBinding;
  readonly Run: Awaited<ReturnType<GateHarness['Score']>>;
  readonly EntityName: string;
}

/** The panel's replay through each minted identity. */
interface PanelReplays {
  readonly Authorized: PanelReplay;
  readonly Restricted: PanelReplay;
}

/** Trains the C1 renewal model, publishes it through the lifecycle gate, binds it with a test binding and scores it once. */
async function publishBindAndScore(h: GateHarness): Promise<PublishedScoring> {
  const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1AssemblyPipeline(h, EvaluationProtocolGates.C1ReferenceProtocol);
  const t = await h.Train(pipeline);
  if (!t.ModelID) throw new Error(`G5.6: C1 training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
  await RunFixtures.PublishModel(h, t.ModelID, 'G5.6 C1');
  const model = await h.ReadModel(t.ModelID);
  const entityName = HarnessScoring.BindingEntityName({ ID: model.ModelID, PipelineID: model.PipelineID, Lineage: model.LineageJSON }, null);
  const bindingId = await HarnessScoring.Binding(h, model.ModelID, ScoringGateSteps.FeatureName(h, 'G5.6 renewal'));
  const binding = await readBinding(h, bindingId);
  const run = await h.Score(model.ModelID, { bindingId, scope: { filter: { entityName } } });
  return { Binding: binding, Run: run, EntityName: entityName };
}

/**
 * Replays the record panel's batch on `recordId` through two minted identities (IT186's), releasing them afterwards
 * (each release failure logged). With no scored record, nothing is replayed and both report it.
 */
async function replayPanels(ctx: IntegrationCheckContext, h: GateHarness, binding: GateBinding, recordId: string | undefined): Promise<PanelReplays> {
  const none: PanelReplay = { Cards: 0, ValuesReturned: 0, ReadError: 'no scored record' };
  if (recordId === undefined || !binding.TargetEntityID) return { Authorized: none, Restricted: none };
  const identities = await PsPredictionServing.MintIdentities(ctx, `G5.6 ${h.RunID}`);
  try {
    return {
      Authorized: await PsPredictionServing.PanelCards(identities.Authorized.Provider, binding.TargetEntityID, recordId, binding),
      Restricted: await PsPredictionServing.PanelCards(identities.Restricted.Provider, binding.TargetEntityID, recordId, binding),
    };
  } finally {
    for (const warning of await PsPredictionServing.ReleaseIdentities(ctx, identities)) console.warn(`      ⚠ G5.6: ${warning}`);
  }
}

/** The gate's measurement: zero schema change, full lineage, every scored row latest, the card to its holder only. */
function measure(published: PublishedScoring, delta: FingerprintDelta, rowsWithLineage: number, latestRows: number, panels: PanelReplays): GateMeasurement {
  const { Binding: binding, Run: run } = published;
  const panelRestricted = Math.max(panels.Restricted.Cards, panels.Restricted.ValuesReturned);
  const scored = run.Written;
  return {
    Passed: run.Ok && binding.TargetColumn === null && delta.ColumnsChanged === 0 && delta.MigrationsAdded === 0 && delta.EntityMetadataChanged === 0
      && scored > 0 && run.Total === scored && rowsWithLineage === scored && latestRows === scored && panels.Authorized.Cards === 1 && panelRestricted === 0,
    Measured: {
      columnsChanged: delta.ColumnsChanged, migrationsAdded: delta.MigrationsAdded, entityMetadataChanged: delta.EntityMetadataChanged,
      rowsWithLineage, scored, latestRows, panelAuthorized: panels.Authorized.Cards, panelRestricted,
      targetColumn: binding.TargetColumn, refusal: run.ErrorMessage?.slice(0, 200) || null,
      panelReadError: panels.Authorized.ReadError || panels.Restricted.ReadError, entity: published.EntityName,
    },
    Detail: `publishing and binding the C1 model changed ${delta.ColumnsChanged} column(s), applied ${delta.MigrationsAdded} migration(s) and touched entity metadata ${delta.EntityMetadataChanged} time(s); `
      + `${rowsWithLineage} of ${scored} scored records carry the four lineage fields and ${latestRows} are in MJ: Latest Feature Values; `
      + `the panel shows the prediction to a user holding the binding's authorization, ${panels.Authorized.Cards} of 1, and shows nothing to a user without it, ${1 - panelRestricted} of 1`,
  };
}

/** The test binding's columns the gate reads, through the gate's client provider. */
async function readBinding(h: GateHarness, bindingId: string): Promise<GateBinding> {
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
