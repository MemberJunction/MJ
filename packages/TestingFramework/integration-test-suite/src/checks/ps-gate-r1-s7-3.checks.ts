/**
 * Gate G5.1 "R1 → S7.3" (owner PR 4, phase 5): scoring the R1 model on a copy table with `DistanceZ` renamed is refused
 * with an error naming the scope entity and writes 0 rows, 1 of 1 (FM-15; today the value is read from the training
 * table). The copy is `pstruth.Scn_R1Copy`, filled with R1's rows and `DistanceZ` renamed `DistanceZRenamed`. A test
 * binding of the published R1 unit model targets the copy entity, and one Score Record Set call scores 25 of its
 * records: check 3 must refuse `scope-entity-mismatch` naming the copy entity before any row is read (the model's unit
 * reads `Scn_R1`, so a copy's keys would otherwise be scored from the training table), its run row stored `refused`
 * with `Written = 0`, and no Feature Value written for the binding.
 */
import { RunView, type RunViewParams } from '@memberjunction/core';
import type { MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { HarnessScoring, UnitFixtures, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateRegistry } from './ps-gates/ps-gate-registry';
import { ScoringGateSteps } from './ps-gates/ps-gate-scoring';

/** The copy table and its renamed column. */
const COPY_TABLE = 'Scn_R1Copy';
const RENAMES: Readonly<Record<string, string>> = { DistanceZ: 'DistanceZRenamed' };
/** Copy records the call scores. */
const ROWS = 25;
/** The stored run row the gate reads back. */
type StoredRun = Pick<MJMLScoringRunEntity, 'ID' | 'Status' | 'Written' | 'Refusal'>;

/** What G5.1 read back after the call. */
interface Stored {
  readonly Run: StoredRun | null;
  readonly BindingValues: number;
}

/** G5.1's read-back. */
class PsGateR1S73Steps {
  /** The run row (when the call named one) and the binding's Feature Value count, in one RunViews. */
  public static async Stored(h: TruthHarness, runId: string | null, bindingId: string): Promise<Stored> {
    const valuesRead: RunViewParams = { EntityName: 'MJ: Feature Values', ExtraFilter: `MLModelScoringBindingID='${EscapeSQLString(bindingId)}'`, Fields: ['ID'], ResultType: 'count_only', BypassCache: true };
    const runRead: RunViewParams | null = runId === null ? null
      : { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', 'Status', 'Written', 'Refusal'], ResultType: 'simple', BypassCache: true };
    const [values, runs] = await RunView.FromMetadataProvider(h.Provider).RunViews<StoredRun>(runRead === null ? [valuesRead] : [valuesRead, runRead], h.User);
    if (!values.Success || (runs !== undefined && !runs.Success)) throw new Error(`G5.1: reading the run back failed: ${values.ErrorMessage || runs?.ErrorMessage}`);
    return { Run: runs?.Results[0] || null, BindingValues: values.TotalRowCount || 0 };
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
      const binding = await HarnessScoring.Binding(h, model, ScoringGateSteps.FeatureName(h, 'G5.1 copy delivery minutes'), { EntityName: copy.Entity.Name });
      const ids = await h.SampleRowIds(r1, ROWS, 42);
      const call = await h.Score(model, { bindingId: binding, scope: { records: ids } });
      const stored = await PsGateR1S73Steps.Stored(h, call.ScoringRunID, binding);
      const message = call.ErrorMessage || '';
      const refused = !call.Ok && call.RefusalCode === 'SCOPE_ENTITY_MISMATCH' && message.includes(copy.Entity.Name)
        && stored.Run !== null && stored.Run.Status === 'refused' && stored.Run.Written === 0 && stored.BindingValues === 0 ? 1 : 0;
      PsGate.Assert({
        Passed: refused === 1,
        Measured: {
          refused, of: 1, refusalCode: call.RefusalCode, namesCopyEntity: message.includes(copy.Entity.Name), copyRows: copy.Rows,
          storedStatus: stored.Run?.Status || null, storedWritten: stored.Run === null ? null : stored.Run.Written, bindingValues: stored.BindingValues, scored: call.Total,
          message: message.slice(0, 240),
        },
        Detail: `refused naming the scope entity, ${refused} of 1: ${ROWS} records of ${copy.Entity.Name} (${copy.Rows} R1 rows, DistanceZ renamed) through a binding of the R1 model `
          + `${call.Ok ? `scored ${call.Total}, wrote ${call.Written}` : `were refused ${call.RefusalCode || 'without a code'}`}; run row ${stored.Run?.Status || 'missing'}, ${stored.BindingValues} Feature Values`,
      });
    },
  },
];

for (const c of PsGateR1S73Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r1-s7-3', PsGate.Lifecycle);
