/**
 * Gate G0.7 "W1 → S7.3": scoring a Draft and an Archived W1-signal s42 model is refused with MODEL_NOT_PUBLISHED and
 * leaves the column unwritten, 2 of 2; a dry run on a published model succeeds, scores rows and writes 0 rows. A dry run
 * that crashes, returns a GraphQL error or times out scores nothing, so it fails the gate (spec §2). Score Record Set
 * writes only through a binding (no write-back directive), so the column count proves nothing else wrote it.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe, RunFixtures, type LoadedDataset, type ScoreAttempt, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';

/** One scoring attempt and the rows of the column it left written. */
interface WriteBackAttempt { Attempt: ScoreAttempt; Written: number }

/** The scoring attempts and fixture model of G0.7. */
class ScoringRefusalSteps {
  /** Score `modelId` over NA 2024 after clearing the column; reads back how many rows of the column were written. */
  public static async ScoreWithWriteBack(h: TruthHarness, w1: LoadedDataset, modelId: string, dryRun: boolean): Promise<WriteBackAttempt> {
    const scope = { filter: { entityName: w1.Entity.Name, extraFilter: "Region = 'NA' AND [Year] = 2024", maxRows: 5000 } };
    await h.ResetColumn(w1, 'TruthScore');
    const a = await h.Score(modelId, { scope, dryRun });
    return { Attempt: a, Written: await h.CountNonNull(w1, 'TruthScore') };
  }

  /** A W1 s42 model evaluated (its stored decision: Validated or KeepBaseline) and then archived, through the lifecycle gate. */
  public static async ArchivedModel(h: TruthHarness, w1: LoadedDataset): Promise<string> {
    const archivedId = await RunFixtures.TrainedModel(h, 'G0.7 archived', w1);
    await RunFixtures.EvaluateModel(h, archivedId, 'G0.7 archived');
    const archived = await h.Promote(archivedId, 'archive', 'truth suite fixture: archive');
    if (!archived.Applied || archived.Status !== 'Archived') {
      throw new Error(`could not archive the G0.7 fixture model (status ${archived.Status}, the lifecycle gate's answer: ${RunFixtures.GateAnswer(archived.Refusal)})`);
    }
    return archivedId;
  }
}

export const PsGateW1S73Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s7-3.G0.7', Name: 'G0.7 W1 → S7.3: Draft and Archived models refuse to score; a dry run writes nothing', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const draft = await RunFixtures.W1S42Model(h); // a trained Draft: only a Published model scores (check 1)
      const archivedId = await ScoringRefusalSteps.ArchivedModel(h, w1);
      const validatedId = (await RunFixtures.W1S42PublishedModel(h)).ModelID; // scorable: published through the gate
      const d = await ScoringRefusalSteps.ScoreWithWriteBack(h, w1, draft.ModelID, false);
      const ar = await ScoringRefusalSteps.ScoreWithWriteBack(h, w1, archivedId, false);
      const dry = await ScoringRefusalSteps.ScoreWithWriteBack(h, w1, validatedId, true);
      const refused = [d, ar].filter((x) => x.Written === 0 && ContainmentProbe.WasScoringRefused(x.Attempt, 'MODEL_NOT_PUBLISHED')).length;
      const dryRunClean = dry.Attempt.Ok && dry.Attempt.Total > 0 && dry.Written === 0;
      PsGate.Assert({
        Passed: refused === 2 && dryRunClean,
        Measured: {
          draftWritten: d.Written,
          draftRefusalCode: d.Attempt.RefusalCode,
          archivedWritten: ar.Written,
          archivedRefusalCode: ar.Attempt.RefusalCode,
          dryRunOk: dry.Attempt.Ok,
          dryRunScored: dry.Attempt.Total,
          dryRunRefusalCode: dry.Attempt.RefusalCode,
          dryRunWritten: dry.Written,
        },
        Detail:
          `Draft/Archived refused with MODEL_NOT_PUBLISHED and 0 rows written: ${refused} of 2; ` +
          `dry run ok=${dry.Attempt.Ok}, scored ${dry.Attempt.Total} rows, wrote ${dry.Written} rows`,
      });
    },
  },
];

for (const c of PsGateW1S73Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s7-3', PsGate.Lifecycle);
