/**
 * Gate G3.5 "C1 → S4.2 #2" (owner PR 4, phase 3): a C1 challenger retrained on the incumbent's snapshot does not
 * replace the incumbent unless the paired improvement's lower bound exceeds the declared margin. The fixture trains
 * C1 on its reference split, evaluates and publishes that model through the lifecycle gate (the incumbent), retrains
 * the same pipeline on the unchanged data (the trainer sends the incumbent, so the run stores the paired comparison),
 * evaluates the challenger and asks the gate to publish it: the gate withholds it `does-not-beat-incumbent`, the
 * incumbent stays Published, 1 of 1.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLTrainingRunEntity, MJMLTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunFixtures, UnitFixtures, type PromoteAttempt, type TrainAttempt, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EvaluationProtocolGates } from './ps-gates/ps-gate-evaluation-protocols';

/** The snapshot a training run trained on, with its content hash. */
interface RunSnapshot {
  readonly SnapshotID: string | null;
  readonly ContentHash: string | null;
}

/** G3.5's reads and words. */
class PsGateC1S42No2Steps {
  /** The model a training produced; throws naming the run's failure. */
  public static ModelOf(t: TrainAttempt, tag: string): string {
    if (!t.ModelID) throw new Error(`${tag}: training failed (${t.RefusalCode || 'no refusal code'}): ${t.ErrorMessage || 'no model id'}`);
    return t.ModelID;
  }

  /** The Training Snapshot the run trained on and its content hash. */
  public static async SnapshotOf(h: TruthHarness, trainingRunId: string | null): Promise<RunSnapshot> {
    if (!trainingRunId) return { SnapshotID: null, ContentHash: null };
    const rv = RunView.FromMetadataProvider(h.Provider);
    const runs = await rv.RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'TrainingSnapshotID'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(trainingRunId)}'`, Fields: ['ID', 'TrainingSnapshotID'], ResultType: 'simple', BypassCache: true }, h.User);
    if (!runs.Success) throw new Error(`reading training run ${trainingRunId}: ${runs.ErrorMessage}`);
    const snapshotId = runs.Results[0]?.TrainingSnapshotID || null;
    if (!snapshotId) return { SnapshotID: null, ContentHash: null };
    const snaps = await rv.RunView<Pick<MJMLTrainingSnapshotEntity, 'ID' | 'ContentHash'>>(
      { EntityName: 'MJ: ML Training Snapshots', ExtraFilter: `ID='${EscapeSQLString(snapshotId)}'`, Fields: ['ID', 'ContentHash'], ResultType: 'simple', BypassCache: true }, h.User);
    if (!snaps.Success) throw new Error(`reading training snapshot ${snapshotId}: ${snaps.ErrorMessage}`);
    return { SnapshotID: snapshotId, ContentHash: snaps.Results[0]?.ContentHash || null };
  }

  /** True when the refusal is `does-not-beat-incumbent` naming the published incumbent. */
  public static NamesIncumbent(attempt: PromoteAttempt, incumbentId: string): boolean {
    const r = attempt.Refusal;
    return r !== null && r.kind === 'does-not-beat-incumbent' && UUIDsEqual(r.incumbentModelId, incumbentId);
  }

  /** The stored paired comparison the refusal carries, as `value [lower, upper]`, or what the gate answered instead. */
  public static Comparison(attempt: PromoteAttempt): string {
    const r = attempt.Refusal;
    if (r === null) return 'applied';
    return r.kind === 'does-not-beat-incumbent' ? `${r.comparison.value} [${r.comparison.ci[0]}, ${r.comparison.ci[1]}]` : r.kind;
  }
}

export const PsGateC1S42No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-s4-2-2.G3.5', Name: 'G3.5 C1 → S4.2 #2: a challenger retrained on the incumbent\'s snapshot is withheld does-not-beat-incumbent on the unchanged data, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1AssemblyPipeline(h, EvaluationProtocolGates.C1ReferenceProtocol);
      const first = await h.Train(pipeline);
      const incumbent = PsGateC1S42No2Steps.ModelOf(first, 'G3.5 incumbent');
      await RunFixtures.PublishModel(h, incumbent, 'G3.5 incumbent');
      const second = await h.Train(pipeline);
      const challenger = PsGateC1S42No2Steps.ModelOf(second, 'G3.5 challenger');
      const evaluated = await RunFixtures.EvaluateModel(h, challenger, 'G3.5 challenger');
      const attempt = await h.Promote(challenger, 'publish', 'G3.5: the retrained challenger asks to replace the published incumbent');
      const incumbentAfter = await h.ReadModel(incumbent);
      const challengerAfter = await h.ReadModel(challenger);
      const [snapA, snapB] = [await PsGateC1S42No2Steps.SnapshotOf(h, first.TrainingRunID), await PsGateC1S42No2Steps.SnapshotOf(h, second.TrainingRunID)];
      const sameData = snapA.ContentHash !== null && snapA.ContentHash === snapB.ContentHash;
      const namesIncumbent = PsGateC1S42No2Steps.NamesIncumbent(attempt, incumbent);
      const kept = !attempt.Applied && namesIncumbent && incumbentAfter.Status === 'Published' && challengerAfter.Status !== 'Published';
      PsGate.Assert({
        Passed: sameData && kept,
        Measured: {
          kept: kept ? 1 : 0, of: 1, refusal: attempt.Refusal?.kind || 'none', refusalNamesIncumbent: namesIncumbent, comparison: PsGateC1S42No2Steps.Comparison(attempt),
          incumbentStatus: incumbentAfter.Status, challengerEvaluated: evaluated, challengerStatus: challengerAfter.Status,
          sameSnapshot: snapA.SnapshotID !== null && snapA.SnapshotID === snapB.SnapshotID, sameContentHash: sameData,
        },
        Detail: `incumbent kept on the unchanged data, ${kept ? 1 : 0} of 1: the challenger's publish ${attempt.Applied ? 'applied' : `was refused (${RunFixtures.GateAnswer(attempt.Refusal)})`}; `
          + `the refusal ${namesIncumbent ? 'names' : 'does not name'} the incumbent ${incumbent}; incumbent ${incumbentAfter.Status}, challenger ${challengerAfter.Status}; both runs trained on ${sameData ? 'the same snapshot content' : 'different or unread snapshots'}`,
      });
    },
  },
];

for (const c of PsGateC1S42No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-c1-s4-2-2', PsGate.Lifecycle);
