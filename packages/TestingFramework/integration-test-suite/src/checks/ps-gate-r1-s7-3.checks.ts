/**
 * Gate G5.1 "R1 → S7.3" (owner PR 4, phase 5): scoring the R1 model on a copy table with `DistanceZ` renamed is refused
 * with an error naming the scope entity and writes 0 rows, 1 of 1 (FM-15; today the value is read from the training
 * table). The copy is `pstruth.Scn_R1Copy`, filled with R1's rows and `DistanceZ` renamed `DistanceZRenamed`. Both
 * doors to the copy must be shut (D4-168, D4-163):
 *
 * - (a) a scoring binding of the published R1 unit model on the copy entity is refused at save, naming the copy
 *   entity, and no binding row is left;
 * - (b) a Score Record Set call of the model without a binding, scoped over 25 of the copy's records, is refused
 *   `SCOPE_ENTITY_MISMATCH` naming the copy entity before any row is read (the model's unit reads `Scn_R1`, so the
 *   copy's keys would otherwise be scored from the training table), its run row stored `refused` with `Written = 0`
 *   and no Feature Value of the run.
 */
import { RunView, type RunViewParams } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity, MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { HarnessScoring, UnitFixtures, type LoadedDataset, type ScoreAttempt, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateRegistry } from './ps-gates/ps-gate-registry';
import { ScoringGateSteps } from './ps-gates/ps-gate-scoring';

/** The copy table and its renamed column. */
const COPY_TABLE = 'Scn_R1Copy';
const RENAMES: Readonly<Record<string, string>> = { DistanceZ: 'DistanceZRenamed' };
/** Copy records the call scores. */
const ROWS = 25;
/** The stored run row the gate reads back. */
type StoredRun = Pick<MJMLScoringRunEntity, 'ID' | 'Status' | 'Written'>;
/** A binding row's key, for the no-row-left read. */
type BindingKeyRow = Pick<MJMLModelScoringBindingEntity, 'ID'>;

/** Part (a): whether the binding on the copy was refused, its message, and the binding rows left for its feature name. */
interface BindingAttempt {
  readonly Refused: boolean;
  readonly Message: string;
  readonly RowsLeft: number;
}

/** Part (b): the no-binding call, its stored run row and the Feature Values of the run. */
interface ScopeAttempt {
  readonly Call: ScoreAttempt;
  readonly Run: StoredRun | null;
  readonly RunValues: number;
}

/** G5.1's two parts. */
class PsGateR1S73Steps {
  /** (a) Binds the model on the copy entity; a refused save is the expected answer. */
  public static async BindOnCopy(h: TruthHarness, modelId: string, copyEntity: string): Promise<BindingAttempt> {
    const featureName = ScoringGateSteps.FeatureName(h, 'G5.1 copy delivery minutes');
    let message = '';
    let refused = false;
    try {
      await HarnessScoring.Binding(h, modelId, featureName, { EntityName: copyEntity });
    } catch (e) {
      refused = true;
      message = e instanceof Error ? e.message : String(e);
    }
    const left = await RunView.FromMetadataProvider(h.Provider).RunView<BindingKeyRow>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `FeatureName='${EscapeSQLString(featureName)}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    if (!left.Success) throw new Error(`G5.1: reading the copy's bindings failed: ${left.ErrorMessage}`);
    return { Refused: refused, Message: message, RowsLeft: left.Results.length };
  }

  /** (b) Scores 25 of the copy's records with the model and no binding, then reads the run row and its Feature Values. */
  public static async ScoreCopy(h: TruthHarness, modelId: string, r1: LoadedDataset, copyEntity: string): Promise<ScopeAttempt> {
    const ids = await h.SampleRowIds(r1, ROWS, 42);
    const key = r1.Entity.FirstPrimaryKey.Name; // first-pk-ok: the copy shares R1's single ID key
    const call = await h.Score(modelId, { scope: { filter: { entityName: copyEntity, extraFilter: `${key} IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(',')})` } } });
    if (call.ScoringRunID === null) return { Call: call, Run: null, RunValues: 0 };
    const id = EscapeSQLString(call.ScoringRunID);
    const reads: RunViewParams[] = [
      { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID='${id}'`, Fields: ['ID', 'Status', 'Written'], ResultType: 'simple', BypassCache: true },
      { EntityName: 'MJ: Feature Values', ExtraFilter: `MLScoringRunID='${id}'`, Fields: ['ID'], ResultType: 'count_only', BypassCache: true },
    ];
    const [runs, values] = await RunView.FromMetadataProvider(h.Provider).RunViews<StoredRun>(reads, h.User);
    if (!runs.Success || !values.Success) throw new Error(`G5.1: reading scoring run ${call.ScoringRunID} back failed: ${runs.ErrorMessage || values.ErrorMessage}`);
    return { Call: call, Run: runs.Results[0] || null, RunValues: values.TotalRowCount || 0 };
  }

  /** (b) holds: refused SCOPE_ENTITY_MISMATCH naming the copy, the run stored refused with 0 written, no Feature Value. */
  public static ScopeRefused(b: ScopeAttempt, copyEntity: string): boolean {
    return !b.Call.Ok && b.Call.RefusalCode === 'SCOPE_ENTITY_MISMATCH' && (b.Call.ErrorMessage || '').includes(copyEntity)
      && b.Run !== null && b.Run.Status === 'refused' && b.Run.Written === 0 && b.RunValues === 0;
  }
}

export const PsGateR1S73Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-r1-s7-3.G5.1', Name: 'G5.1 R1 → S7.3: the R1 model scored on a copy table with DistanceZ renamed is refused naming the scope entity and writes 0 rows, 1 of 1', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const r1 = await h.EnsureLoaded({ Kind: 'scenario', ID: 'R1', Seed: UnitFixtures.ScenarioBaseSeed('R1') });
      const copy = await h.FillRenamedCopy(r1, COPY_TABLE, RENAMES);
      const model = await PsGateRegistry.PublishedR1Model(h, 'G5.1', 0.25);
      const copyEntity = copy.Entity.Name;
      const a = await PsGateR1S73Steps.BindOnCopy(h, model, copyEntity);
      const b = await PsGateR1S73Steps.ScoreCopy(h, model, r1, copyEntity);
      const bindingRefused = a.Refused && a.Message.includes(copyEntity) && a.RowsLeft === 0;
      const scopeRefused = PsGateR1S73Steps.ScopeRefused(b, copyEntity);
      const refused = bindingRefused && scopeRefused ? 1 : 0;
      PsGate.Assert({
        Passed: refused === 1,
        Measured: {
          refused, of: 1, bindingRefused, bindingRowsLeft: a.RowsLeft, bindingMessage: a.Message.slice(0, 240), scopeRefused, refusalCode: b.Call.RefusalCode,
          copyRows: copy.Rows, storedStatus: b.Run === null ? null : b.Run.Status, storedWritten: b.Run === null ? null : b.Run.Written, runValues: b.RunValues, scored: b.Call.Total,
          scopeMessage: (b.Call.ErrorMessage || '').slice(0, 240),
        },
        Detail: `refused naming the scope entity, ${refused} of 1: a binding of the R1 model on ${copyEntity} (${copy.Rows} R1 rows, DistanceZ renamed) was ${a.Refused ? 'refused at save' : 'saved'} `
          + `(${a.RowsLeft} binding rows left); ${ROWS} of its records scored without a binding were ${b.Call.Ok ? `scored (${b.Call.Total})` : `refused ${b.Call.RefusalCode || 'without a code'}`}, `
          + `run row ${b.Run === null ? 'missing' : b.Run.Status}, ${b.RunValues} Feature Values`,
      });
    },
  },
];

for (const c of PsGateR1S73Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r1-s7-3', PsGate.Lifecycle);
