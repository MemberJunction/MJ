/**
 * @module governance/evidence-builder
 *
 * `StoredEvidenceBuilder` — the lifecycle gate's evidence seam (`GateContext.EvidenceBuilder`, §5.2): the
 * `EvidenceSnapshot` of a model built from stored rows only. A sign-off records the SHA-256 of what this returns, and a
 * publish rebuilds it and consumes the sign-off only while the two hashes are equal, so every value here is read from
 * the database (past the RunView cache, D4-108), never taken from a caller.
 */
import type { MJMLModelEntity, MJMLTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
  GateRules,
  UtcDay,
  type EvidenceSnapshot,
  type MetricWithInterval,
  type StoredGateRecord,
  type StoredTrainerResult,
} from '@memberjunction/predictive-studio-core';

import type { IGateEvidenceBuilder } from '../registry/gate-context';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRuns } from '../registry/stored-publish-inputs';
import { StoredRowReads } from '../registry/stored-row-reads';

/** The model columns the evidence reads. */
type EvidenceModelColumns = Pick<MJMLModelEntity, 'ID' | 'TrainingRunID' | 'TrainingSnapshotID'>;
/** The Training Snapshot columns the evidence reads. */
type EvidenceSnapshotColumns = Pick<MJMLTrainingSnapshotEntity, 'ID' | 'ContentHash' | 'DataCutoff'>;

/**
 * The evidence of a model from its stored rows: the holdout primary score of what the stored decision ships (the kept
 * simple member's for keep-simple-baseline), the run's paired comparisons, its stored gate decision and leakage flags,
 * and the Training Snapshot's data window and `ContentHash`. A snapshot row stores its data cutoff and no window start,
 * so the data window is the cutoff's UTC day at both ends.
 */
export class StoredEvidenceBuilder implements IGateEvidenceBuilder {
  /**
   * @inheritdoc
   * @throws Error when the model, its run, the run's gate record or trainer result, or its Training Snapshot row is
   *   missing, a read fails, or the kept member is absent
   */
  public async Build(modelId: string, ctx: RegistryContext): Promise<EvidenceSnapshot> {
    const model = await StoredEvidenceBuilder.readModel(modelId, ctx);
    const run = model.TrainingRunID ? await StoredRuns.Read(model.TrainingRunID, ctx) : null;
    if (run === null || run.Gate === null || run.Trainer === null) {
      throw new Error(`ML Model ${modelId} has no stored training run with a gate record and trainer result to build evidence from`);
    }
    if (!model.TrainingSnapshotID) throw new Error(`ML Model ${modelId} names no Training Snapshot to build evidence from`);
    const snapshot = await StoredEvidenceBuilder.readSnapshot(model.TrainingSnapshotID, ctx);
    const day = StoredEvidenceBuilder.cutoffDay(snapshot);
    return {
      holdoutPrimary: StoredEvidenceBuilder.primaryOf(run.Gate, run.Trainer),
      comparisons: run.Trainer.comparisons,
      gate: run.Gate.decision,
      leakageFlags: run.Trainer.leakageFlags,
      dataWindow: { from: day, to: day },
      snapshotHash: snapshot.ContentHash,
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

  /** The snapshot's data cutoff as a `yyyy-mm-dd` UTC day. */
  private static cutoffDay(snapshot: EvidenceSnapshotColumns): string {
    const day = UtcDay.ToUtcDay(snapshot.DataCutoff);
    if (day === null) throw new Error(`Training Snapshot ${snapshot.ID} stores no readable DataCutoff`);
    return UtcDay.UtcDayIso(day);
  }

  private static async readModel(modelId: string, ctx: RegistryContext): Promise<EvidenceModelColumns> {
    const r = await StoredRowReads.Run<EvidenceModelColumns>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'TrainingRunID', 'TrainingSnapshotID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Model ${modelId} for its evidence failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row) throw new Error(`ML Model ${modelId} does not exist`);
    return row;
  }

  private static async readSnapshot(snapshotId: string, ctx: RegistryContext): Promise<EvidenceSnapshotColumns> {
    const r = await StoredRowReads.Run<EvidenceSnapshotColumns>(
      { EntityName: 'MJ: ML Training Snapshots', ExtraFilter: `ID='${EscapeSQLString(snapshotId)}'`, Fields: ['ID', 'ContentHash', 'DataCutoff'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading Training Snapshot ${snapshotId} for the evidence failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row) throw new Error(`Training Snapshot ${snapshotId} does not exist`);
    return row;
  }
}
