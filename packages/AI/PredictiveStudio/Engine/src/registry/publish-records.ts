/**
 * @module registry/publish-records
 *
 * Writing and finding `MJ: ML Model Publish Records` rows (§5.1, D-029, D4-56): the gate writes one `publish` row per
 * applied publish and one `refusal` row per withheld attempt; a run whose decision shipped no model row gets one
 * run-level `refusal` row (`ModelID` null, `Purpose = 'evaluate'`). Every read and write runs on the caller's provider
 * as its user. The rows are immutable once saved (`MJMLModelPublishRecordEntityServer.Validate()`).
 */
import type { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, OrdinalCompare } from '@memberjunction/global';
import type { Actor, EvidenceSnapshot, GateDecision, JsonValue, TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { SnapshotHash } from '../snapshot/snapshot-hash';
import { GateRefusals } from './gate-refusals';
import type { PublishApprover } from './gate-context';
import type { RegistryContext } from './registry-context';
import { StoredRowReads } from './stored-row-reads';

const ENTITY = 'MJ: ML Model Publish Records';

/** The row of an applied publish. */
export interface PublishRecordWrite {
  readonly ModelID: string;
  readonly TrainingRunID: string | null;
  readonly Purpose: Extract<MJMLModelPublishRecordEntity['Purpose'], 'publish' | 'rollback'>;
  readonly Approver: PublishApprover;
  readonly Initiator: Actor;
  readonly Reason: string | null;
  /** The decision as `PublishRules.ReverifyPublish` re-derived it (a copy for audit). */
  readonly GateDecision: GateDecision;
  readonly Evidence: EvidenceSnapshot;
  readonly EvidenceSha256: string;
  readonly SignOffID: string | null;
  readonly ReplacesModelID: string | null;
}

/** The row of a refused attempt: model-level (`ModelID` set), or run-level (`ModelID` null, `Purpose = 'evaluate'`). */
export interface RefusalRecordWrite {
  readonly ModelID: string | null;
  readonly TrainingRunID: string | null;
  readonly Purpose: MJMLModelPublishRecordEntity['Purpose'];
  readonly Approver: PublishApprover;
  readonly Initiator: Actor;
  readonly Refusal: TransitionRefusal;
  readonly Transient: boolean;
}

/** A run-level outcome found by its run. */
export interface RunOutcomeRecord {
  readonly ID: string;
  readonly Refusal: TransitionRefusal | null;
}

/** The publish ledger's writes and reads. */
export class PublishRecords {
  /**
   * Writes the `publish` row of an applied publish and returns its ID.
   *
   * @throws Error naming the save's message when the row is not saved
   */
  public static async WritePublish(w: PublishRecordWrite, ctx: RegistryContext): Promise<string> {
    const row = await PublishRecords.newRow(ctx);
    row.ModelID = w.ModelID;
    row.TrainingRunID = w.TrainingRunID;
    row.Kind = 'publish';
    row.Purpose = w.Purpose;
    PublishRecords.applyApprover(row, w.Approver);
    row.Initiator = JSON.stringify(w.Initiator);
    row.Reason = w.Reason;
    row.GateDecision = JSON.stringify(w.GateDecision);
    row.Evidence = JSON.stringify(w.Evidence);
    row.EvidenceSha256 = w.EvidenceSha256;
    row.SignOffID = w.SignOffID;
    row.ReplacesModelID = w.ReplacesModelID;
    return PublishRecords.saveOrThrow(row, 'publish');
  }

  /**
   * Writes a `refusal` row with the refusal's plain words as its `Reason`, and returns its ID.
   *
   * @throws Error naming the save's message when the row is not saved
   */
  public static async WriteRefusal(w: RefusalRecordWrite, ctx: RegistryContext): Promise<string> {
    const row = await PublishRecords.newRow(ctx);
    row.ModelID = w.ModelID;
    row.TrainingRunID = w.TrainingRunID;
    row.Kind = 'refusal';
    row.Purpose = w.Purpose;
    PublishRecords.applyApprover(row, w.Approver);
    row.Initiator = JSON.stringify(w.Initiator);
    row.Reason = GateRefusals.Describe(w.Refusal);
    row.Refusal = JSON.stringify(w.Refusal);
    row.Transient = w.Transient;
    return PublishRecords.saveOrThrow(row, 'refusal');
  }

  /**
   * The `publish` row (purpose `publish` or `adopt`) of a training run, the idempotency key `UX_MLModelPublishRecord_OnePublishPerRun`
   * guards; null when the run has none.
   *
   * @throws Error when the read fails
   */
  public static async FindPublishForRun(trainingRunId: string, ctx: RegistryContext): Promise<{ readonly ID: string; readonly ModelID: string | null } | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID' | 'ModelID'>>(
      {
        EntityName: ENTITY,
        ExtraFilter: `TrainingRunID='${EscapeSQLString(trainingRunId)}' AND Kind='publish' AND Purpose IN ('publish','adopt')`,
        Fields: ['ID', 'ModelID'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the publish record of training run ${trainingRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /**
   * The newest `publish` row of the model for `purpose` (`RecordedAt` descending); null when it has none.
   *
   * @throws Error when the read fails
   */
  public static async FindLatestApplied(modelId: string, purpose: PublishRecordWrite['Purpose'], ctx: RegistryContext): Promise<{ readonly ID: string } | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID'>>(
      {
        EntityName: ENTITY, ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND Kind='publish' AND Purpose='${EscapeSQLString(purpose)}'`,
        OrderBy: 'RecordedAt DESC', Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the ${purpose} records of ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /**
   * The run-level outcome row of a training run (`Purpose = 'evaluate'`, `UX_MLModelPublishRecord_OneRunOutcome`), with
   * its stored refusal read through the generated `RefusalObject` accessor; null when the run has none.
   *
   * @throws Error when the read fails
   */
  public static async FindRunOutcome(trainingRunId: string, ctx: RegistryContext): Promise<RunOutcomeRecord | null> {
    const r = await StoredRowReads.Run<MJMLModelPublishRecordEntity>(
      { EntityName: ENTITY, ExtraFilter: `TrainingRunID='${EscapeSQLString(trainingRunId)}' AND Purpose='evaluate'`, MaxRows: 1, ResultType: 'entity_object' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the run-level outcome of training run ${trainingRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    return row ? { ID: row.ID, Refusal: row.RefusalObject } : null;
  }

  /** The lower-case hex SHA-256 of the canonical JSON of `evidence` (keys sorted at every level), stored as `EvidenceSha256`. Pure. */
  public static EvidenceSha256(evidence: EvidenceSnapshot): string {
    const plain: JsonValue = JSON.parse(JSON.stringify(evidence));
    return SnapshotHash.Sha256Hex(PublishRecords.CanonicalJson(plain));
  }

  /** JSON text with every object's keys in ordinal order, so equal values have one text. Pure. */
  public static CanonicalJson(value: JsonValue): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => PublishRecords.CanonicalJson(v)).join(',')}]`;
    const keys = Object.keys(value).sort(OrdinalCompare);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${PublishRecords.CanonicalJson(value[k])}`).join(',')}}`;
  }

  /** A new row created on the caller's provider as its user. */
  private static async newRow(ctx: RegistryContext): Promise<MJMLModelPublishRecordEntity> {
    const row = await ctx.Provider.GetEntityObject<MJMLModelPublishRecordEntity>(ENTITY, ctx.ContextUser);
    row.NewRecord();
    return row;
  }

  /** `ApproverKind` and `UserID` together, as `CK_MLModelPublishRecord_Approver` requires. */
  private static applyApprover(row: MJMLModelPublishRecordEntity, approver: PublishApprover): void {
    row.ApproverKind = approver.Kind;
    row.UserID = approver.Kind === 'user' ? approver.UserID : null;
  }

  /** Saves a record; a failure names the record kind, its model and its training run. */
  private static async saveOrThrow(row: MJMLModelPublishRecordEntity, kind: 'publish' | 'refusal'): Promise<string> {
    if (await row.Save()) return row.ID;
    throw new Error(
      `Saving the ${kind} record of ML Model ${row.ModelID || '(none: a run-level record)'} for training run ${row.TrainingRunID || '(none)'} failed: ` +
        `${row.LatestResult?.CompleteMessage || 'unknown error'}`,
    );
  }
}
