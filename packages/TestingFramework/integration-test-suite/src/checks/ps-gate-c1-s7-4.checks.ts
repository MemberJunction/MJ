/**
 * Gate G5.4 "C1 → S7.4" (owner PR 4, phase 5): every score row of a scenario C1 scoring run carries the four lineage
 * fields (model ID, artifact hash, scoring-run ID, as-of date) and each resolves to an existing record, 100%. The C1
 * renewal model (the reference's as-of assembly and protocol, as G3.5 and G3.7 train it) is trained, published through
 * the lifecycle gate and bound through a test binding; one Score Record Set call scores every record of the binding's
 * entity, and §4.1's single-join read checks each `Model` row it wrote:
 * its model and run rows exist, the run is the model's, the run's artifact hash equals the model's registered SHA-256,
 * and `EffectiveAsOf` is the run's normalised `AsOfDate`.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { HarnessScoring, RunFixtures, UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { ScoringGateSteps } from './ps-gates/ps-gate-scoring';
import { ScoringLineage } from './ps-gates/ps-gate-scoring-lineage';

export const PsGateC1S74Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s7-4.G5.4', Name: 'G5.4 C1 → S7.4: every score row of a C1 scoring run carries the four lineage fields and each resolves, 100%', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1AssemblyPipeline(h, EvaluationProtocolGates.C1ReferenceProtocol);
      const t = await h.Train(pipeline);
      if (!t.ModelID) throw new Error(`G5.4: C1 training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
      await RunFixtures.PublishModel(h, t.ModelID, 'G5.4 C1');
      const model = await h.ReadModel(t.ModelID);
      const entityName = HarnessScoring.BindingEntityName({ ID: model.ModelID, PipelineID: model.PipelineID, Lineage: model.LineageJSON }, null);
      const binding = await HarnessScoring.Binding(h, model.ModelID, ScoringGateSteps.FeatureName(h, 'G5.4 renewal'));
      const run = await h.Score(model.ModelID, { bindingId: binding, scope: { filter: { entityName } } });
      const lineage = await ScoringLineage.Read(h, run.ScoringRunID === null ? [] : [run.ScoringRunID]);
      const complete = lineage.Rows.filter((r) => ScoringLineage.Complete(r)).length;
      const firstGap = lineage.Rows.find((r) => !ScoringLineage.Complete(r));
      PsGate.Assert({
        Passed: run.Ok && lineage.Runs.length === 1 && lineage.Rows.length > 0 && lineage.Rows.length === run.Written && complete === lineage.Rows.length,
        Measured: {
          runOk: run.Ok, scored: run.Total, written: run.Written, runRows: lineage.Runs.length, rows: lineage.Rows.length, complete,
          refusal: run.ErrorMessage?.slice(0, 200) || null, firstGap: firstGap === undefined ? null : ScoringLineage.Lacks(firstGap), entity: entityName,
        },
        Detail: `${complete} of ${lineage.Rows.length} score rows of the C1 run (${run.Ok ? `${run.Written} written of ${run.Total} on ${entityName}` : `not completed: ${run.ErrorMessage || 'no message'}`}) carry the four lineage fields and resolve`,
      });
    },
  },
];

for (const c of PsGateC1S74Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s7-4', PsGate.Lifecycle);
