/**
 * Gate G5.5 "W1 → S7.5 #3" (owner PR 4, phase 5): with an all-null feature column injected into the W1-signal s42
 * scoring input, the run does not report success: it ends with its count and message, and writes 0 scores, 1 of 1.
 *
 * The column is injected into the scoring input, never the stored scenario data: the gate runs the scoring service in
 * this process on its client provider (`ScoringService.Predict`, the path Score Record Set takes without a binding),
 * with the production model runtime wrapped so every assembly's `IncomeK` column is null on every row before checks
 * 4–6 run. The service's answer is check 6's: the run row is `refused` with `nan-or-empty-feature-column` naming the
 * column (a refusal is decided before any batch, so the run has no failure count; its count is the number of empty
 * columns it names), and the stored run row, read back, shows `refused` with `Written = 0` and its message (the
 * stored `Refusal`) naming the column, with no Feature Value of the run.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunFixtures, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import type { ScoringResult } from '@memberjunction/predictive-studio-core';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { EmptyColumnRuntime, ScoringGateSteps } from './ps-gates/ps-gate-scoring';

/** The W1 feature emptied in the scoring input. */
const EMPTIED_COLUMN = 'IncomeK';
/** W1 rows scored. */
const ROWS = 200;
/** The stored run row the gate reads back. */
type StoredRun = Pick<MJMLScoringRunEntity, 'ID' | 'Status' | 'Refusal' | 'FirstErrors' | 'Written' | 'Total'>;

/** What G5.5 read back after the run. */
interface StoredOutcome {
  readonly Run: StoredRun | null;
  readonly FeatureValues: number;
}

/** G5.5's reads. */
class PsGateW1S75No3Steps {
  /** The run row and the count of Feature Values naming it, in one RunViews. */
  public static async Stored(h: TruthHarness, runId: string): Promise<StoredOutcome> {
    const id = EscapeSQLString(runId);
    const [runs, values] = await RunView.FromMetadataProvider(h.Provider).RunViews<StoredRun>([
      { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID='${id}'`, Fields: ['ID', 'Status', 'Refusal', 'FirstErrors', 'Written', 'Total'], ResultType: 'simple', BypassCache: true },
      { EntityName: 'MJ: Feature Values', ExtraFilter: `MLScoringRunID='${id}'`, Fields: ['ID'], ResultType: 'count_only', BypassCache: true },
    ], h.User);
    if (!runs.Success || !values.Success) throw new Error(`G5.5: reading scoring run ${runId} back failed: ${runs.ErrorMessage || values.ErrorMessage}`);
    return { Run: runs.Results[0] || null, FeatureValues: values.TotalRowCount || 0 };
  }

  /** The empty columns a refusal names ([] for any other result). */
  public static EmptyColumns(result: ScoringResult): readonly string[] {
    return result.Status === 'refused' && result.Reason.kind === 'nan-or-empty-feature-column' ? result.Reason.columns : [];
  }

  /** The run's stored message: its `Refusal` JSON, or its `FirstErrors` for a failed run ("" when it stores neither). */
  public static Message(run: StoredRun | null): string {
    return run === null ? '' : run.Refusal || run.FirstErrors || '';
  }
}

export const PsGateW1S75No3Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s7-5-3.G5.5', Name: 'G5.5 W1 → S7.5 #3: an all-null feature column in the W1 s42 scoring input ends the run with its count and message and writes 0 scores, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const model = await RunFixtures.W1S42PublishedModel(h);
      const runtime = new EmptyColumnRuntime(ScoringGateSteps.ProductionRuntime(), EMPTIED_COLUMN);
      const ids = await h.SampleRowIds(w1, ROWS, 42);
      const predicted = await ScoringGateSteps.PredictInProcess(h.Provider, h.User, model.ModelID, { kind: 'record-ids', entity: w1.Entity.Name, ids }, runtime);
      const result = predicted.Result;
      const stored = await PsGateW1S75No3Steps.Stored(h, result.ScoringRunID);
      const columns = PsGateW1S75No3Steps.EmptyColumns(result);
      const message = PsGateW1S75No3Steps.Message(stored.Run);
      const ended = result.Status !== 'completed' && columns.includes(EMPTIED_COLUMN) && message.includes(EMPTIED_COLUMN) ? 1 : 0;
      const storedRefused = stored.Run !== null && stored.Run.Status === result.Status && stored.Run.Written === 0;
      PsGate.Assert({
        Passed: runtime.Emptied && ended === 1 && storedRefused && stored.FeatureValues === 0 && predicted.Rows.length === 0,
        Measured: {
          ended, of: 1, columnInjected: runtime.Emptied, status: result.Status, emptyColumns: columns.length, emptyColumnNames: columns.join(' '),
          storedStatus: stored.Run?.Status || null, storedWritten: stored.Run === null ? null : stored.Run.Written, featureValues: stored.FeatureValues, predictions: predicted.Rows.length,
          message: message.slice(0, 240),
        },
        Detail: `an all-null ${EMPTIED_COLUMN} column ${runtime.Emptied ? 'injected into' : 'NOT found in'} the scoring input of ${ROWS} W1 rows: the run ended ${result.Status} `
          + `(${message.slice(0, 160)}), its stored row ${stored.Run?.Status || 'missing'} with Written ${stored.Run === null ? 'n/a' : stored.Run.Written}, ${stored.FeatureValues} Feature Values, ${predicted.Rows.length} predictions: ${ended} of 1`,
      });
    },
  },
];

for (const c of PsGateW1S75No3Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s7-5-3', PsGate.Lifecycle);
