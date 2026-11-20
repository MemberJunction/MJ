/**
 * @module registry/publish-records
 *
 * Writing and finding `MJ: ML Model Publish Records` rows (§5.1, D-029, D4-56): the gate writes one `publish` row per
 * applied publish and one `refusal` row per withheld attempt; a run whose decision shipped no model row gets one
 * run-level `refusal` row (`ModelID` null, `Purpose = 'evaluate'`). Every read and write runs on the caller's provider
 * as its user. The rows are immutable once saved (`MJMLModelPublishRecordEntityServer.Validate()`).
 */
import type { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { Canonicalize, EscapeSQLString } from '@memberjunction/global';
import type { Actor, EvidenceSnapshot, GateDecision, TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { SnapshotHash } from '../snapshot/snapshot-hash';
import { GateRefusals } from './gate-refusals';
import type { PublishApprover } from './gate-context';
import type { RegistryContext } from './registry-context';
import { StoredRowReads } from './stored-row-reads';

const ENTITY = 'MJ: ML Model Publish Records';

/** The row of an applied publish. */
export interface PublishRecordWrite {
  /** The published model. */
  readonly ModelID: string;
  /** Its training run (the idempotency key of a `publish`), or null for a model without one. */
  readonly TrainingRunID: string | null;
  /** The request's purpose; `adopt` for a pre-change Published model re-verified on its stored gate record (M7.2). */
  readonly Purpose: Extract<MJMLModelPublishRecordEntity['Purpose'], 'publish' | 'rollback' | 'adopt'>;
  /** Who approved it (`ApproverKind` and `UserID`). */
  readonly Approver: PublishApprover;
  /** Who started it (stored as `Initiator` JSON). */
  readonly Initiator: Actor;
  /** The request's reason (required for a rollback). */
  readonly Reason: string | null;
  /** The decision as `PublishRules.ReverifyPublish` re-derived it (a copy for audit). */
  readonly GateDecision: GateDecision;
  /** The evidence the publish rebuilt from stored rows. */
  readonly Evidence: EvidenceSnapshot;
  /** `EvidenceSha256` of {@link Evidence} ({@link PublishRecords.EvidenceSha256}). */
  readonly EvidenceSha256: string;
  /** The sign-off the publish consumed, or null. */
  readonly SignOffID: string | null;
  /** The Published model the publish archived, or null. */
  readonly ReplacesModelID: string | null;
}

/** The row of a refused attempt: model-level (`ModelID` set), or run-level (`ModelID` null, `Purpose = 'evaluate'`). */
export interface RefusalRecordWrite {
  /** The refused model, or null for a run-level record. */
  readonly ModelID: string | null;
  /** The training run the attempt was about, or null. */
  readonly TrainingRunID: string | null;
  /** The request's purpose (`evaluate` for a run-level record). */
  readonly Purpose: MJMLModelPublishRecordEntity['Purpose'];
  /** The approver the attempt would have had. */
  readonly Approver: PublishApprover;
  /** Who started the attempt. */
  readonly Initiator: Actor;
  /** Why it was refused (stored as `Refusal` JSON, its words as `Reason`). */
  readonly Refusal: TransitionRefusal;
  /** Whether a later attempt can pass (D4-16). */
  readonly Transient: boolean;
}

/** The applied `publish` record of a training run: its ID, its model and whether it was a publish or an adoption. */
export interface RunPublishRecord {
  /** The record's ID. */
  readonly ID: string;
  /** The model it published. */
  readonly ModelID: string | null;
  /** `publish`, or `adopt` for a model adopted as Published (M7.2). */
  readonly Purpose: Extract<MJMLModelPublishRecordEntity['Purpose'], 'publish' | 'adopt'>;
}

/** A run-level outcome found by its run. */
export interface RunOutcomeRecord {
  /** The record's ID. */
  readonly ID: string;
  /** Its stored refusal, or null when it stores none. */
  readonly Refusal: TransitionRefusal | null;
}

/** The publish ledger's writes and reads. */
export class PublishRecords {
  /**
   * The purposes of an applied `publish` record that backs a Published model: a publish, a rollback, or an adoption of
   * a pre-change model as Published (D4-61). The registry check's queries (`metadata/queries/SQL/predictive-studio-*`,
   * pinned to this list by test) and the publish-record audit read exactly these (D4-204).
   */
  public static readonly BACKING_PURPOSES = ['publish', 'rollback', 'adopt'] as const satisfies readonly MJMLModelPublishRecordEntity['Purpose'][];

  /** True when `record` is an applied `publish` record of a {@link BACKING_PURPOSES} purpose. Pure. */
  public static BacksPublishedModel(record: { readonly Kind: string; readonly Purpose: string }): boolean {
    return record.Kind === 'publish' && PublishRecords.BACKING_PURPOSES.some((p) => p === record.Purpose);
  }

  /** The `ExtraFilter` clause selecting the records that back a Published model ({@link BACKING_PURPOSES}). */
  public static BackingRecordFilter(): string {
    return `Kind='publish' AND Purpose IN (${PublishRecords.BACKING_PURPOSES.map((p) => `'${p}'`).join(',')})`;
  }

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
  public static async FindPublishForRun(trainingRunId: string, ctx: RegistryContext): Promise<RunPublishRecord | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID' | 'ModelID' | 'Purpose'>>(
      {
        EntityName: ENTITY,
        ExtraFilter: `TrainingRunID='${EscapeSQLString(trainingRunId)}' AND Kind='publish' AND Purpose IN ('publish','adopt')`,
        Fields: ['ID', 'ModelID', 'Purpose'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the publish record of training run ${trainingRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row) return null;
    if (row.Purpose !== 'publish' && row.Purpose !== 'adopt') throw new Error(`The publish record ${row.ID} of training run ${trainingRunId} has the purpose ${row.Purpose}, which its read excludes`);
    return { ID: row.ID, ModelID: row.ModelID, Purpose: row.Purpose };
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
   * The model the newest applied `publish` row of `modelId` (any purpose) replaced, its `ReplacesModelID`; null when
   * the model has no applied record or its newest one replaced none (D4-17's predecessor).
   *
   * @throws Error when the read fails
   */
  public static async FindLatestReplaced(modelId: string, ctx: RegistryContext): Promise<string | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID' | 'ReplacesModelID'>>(
      {
        EntityName: ENTITY, ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND Kind='publish'`,
        OrderBy: 'RecordedAt DESC', Fields: ['ID', 'ReplacesModelID'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the publish records of ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0]?.ReplacesModelID || null;
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

  /**
   * The lower-case hex SHA-256 of `Canonicalize(evidence)` (`@memberjunction/global`: keys sorted at every level, arrays
   * in order), stored as `EvidenceSha256`; a sign-off and a publish over equal evidence store equal hashes. Pure.
   */
  public static EvidenceSha256(evidence: EvidenceSnapshot): string {
    return SnapshotHash.Sha256Hex(Canonicalize(evidence));
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
