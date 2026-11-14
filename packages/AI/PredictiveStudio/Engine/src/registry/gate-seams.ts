/**
 * @module registry/gate-seams
 *
 * M3's fillings of the gate's three seams (plan M3 "Decided at the tier upgrade"): the evidence builder reads stored rows
 * only; the semantics check always passes until M4.2 runs the real check over `MJ: ML Output Bindings`; the sign-off
 * lookup finds none until M4.1 reads the sign-off records. {@link GateContexts.ForRequest} builds a gate context with
 * them over a request's user and provider.
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
  GateRules,
  RegistrySchemas,
  type EvidenceSnapshot,
  type MetricWithInterval,
  type SemanticsCheck,
  type SignOff,
  type StoredGateRecord,
  type StoredTrainerResult,
} from '@memberjunction/predictive-studio-core';

import type { GateContext, IGateEvidenceBuilder, IGateSemanticsCheck, IGateSignOffLookup } from './gate-context';
import type { RegistryContext } from './registry-context';
import { StoredRuns } from './stored-publish-inputs';
import { StoredRowReads } from './stored-row-reads';

/**
 * The evidence of a model from its stored rows: the holdout primary score of what ships (the kept simple member's for
 * keep-simple-baseline), the run's paired comparisons, its stored gate decision and leakage flags, its data window and
 * the model's snapshot hash. The stored rows record only the run's data cutoff, so the data window is that one day at
 * both ends until M4.1's builder (which owns the evidence shape) reads the training window from the snapshot.
 */
export class StoredRowsEvidenceBuilder implements IGateEvidenceBuilder {
  /**
   * @inheritdoc
   * @throws Error when the model, its run, the run's gate record or trainer result is missing, or the kept member is absent
   */
  public async Build(modelId: string, ctx: RegistryContext): Promise<EvidenceSnapshot> {
    const model = await StoredRowsEvidenceBuilder.readModel(modelId, ctx);
    const run = model.TrainingRunID ? await StoredRuns.Read(model.TrainingRunID, ctx) : null;
    if (run === null || run.Gate === null || run.Trainer === null || run.UnitResolution === null) {
      throw new Error(`ML Model ${modelId} has no stored training run with a gate record and trainer result to build evidence from`);
    }
    const day = run.UnitResolution.dataCutoff.slice(0, 10);
    return {
      holdoutPrimary: StoredRowsEvidenceBuilder.primaryOf(run.Gate, run.Trainer),
      comparisons: run.Trainer.comparisons,
      gate: run.Gate.decision,
      leakageFlags: run.Trainer.leakageFlags,
      dataWindow: { from: day, to: day },
      snapshotHash: model.SnapshotHash || '',
    };
  }

  /** The holdout primary score of what the stored decision ships. */
  private static primaryOf(gate: StoredGateRecord, trainer: StoredTrainerResult): MetricWithInterval {
    const d = gate.decision;
    if (d.outcome !== 'keep-simple-baseline') return trainer.holdout.primary;
    const member = trainer.baselines.find((b) => b.role === 'simple' && GateRules.BaselineMemberName(b.baseline) === d.shipped);
    if (member === undefined) throw new Error(`the stored decision keeps '${d.shipped}', which is not a simple baseline of the run's trainer result`);
    return member.holdout;
  }

  private static async readModel(modelId: string, ctx: RegistryContext): Promise<Pick<MJMLModelEntity, 'ID' | 'TrainingRunID' | 'SnapshotHash'>> {
    const r = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID' | 'TrainingRunID' | 'SnapshotHash'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'TrainingRunID', 'SnapshotHash'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Model ${modelId} for its evidence failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row) throw new Error(`ML Model ${modelId} does not exist`);
    return row;
  }
}

/**
 * M3's semantics check: passes, with no bindings. **Marked for M4**: M4.2 replaces it with the check of the model's
 * `MJ: ML Output Bindings` rows against its `OutputSemantics` (`SemanticsRules.Check`).
 */
export class PassingSemanticsCheck implements IGateSemanticsCheck {
  /**
   * @inheritdoc
   * @throws Error when the model's `OutputSemantics` does not parse (publish refuses such a model before this check)
   */
  public async Check(model: MJMLModelEntity, _ctx: RegistryContext): Promise<SemanticsCheck> {
    const semantics = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    if (semantics.Ok === false) throw new Error(`ML Model ${model.ID}: its OutputSemantics does not parse: ${semantics.Errors.join('; ')}`);
    return { ModelID: model.ID, Semantics: semantics.Value, BindingSource: 'MJ: ML Output Bindings', UIBindings: [], Result: { Status: 'passed' } };
  }
}

/** M3's sign-off lookup: there are no sign-off records before M4.1, so it finds none. */
export class NoSignOffLookup implements IGateSignOffLookup {
  /** @inheritdoc */
  public async FindApproving(): Promise<SignOff | null> {
    return null;
  }
}

/** Gate contexts. */
export class GateContexts {
  /** A gate context over a request's user and provider with M3's seams. */
  public static ForRequest(ctx: RegistryContext): GateContext {
    return {
      ContextUser: ctx.ContextUser,
      Provider: ctx.Provider,
      EvidenceBuilder: new StoredRowsEvidenceBuilder(),
      SemanticsCheck: new PassingSemanticsCheck(),
      SignOffLookup: new NoSignOffLookup(),
    };
  }
}
