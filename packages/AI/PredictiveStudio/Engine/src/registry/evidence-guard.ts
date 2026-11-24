/**
 * @module registry/evidence-guard
 *
 * `PredictiveStudioEvidenceGuard` — stored evidence is write-once (D4-61). A `PreSave` data hook, registered once per
 * process from the Engine entry point, that compares every update with the stored row it reads itself (never
 * `OldValue`):
 *
 * - `MJ: ML Training Runs.ValidationResults` (the gate record, the trainer result, the leakage audit) never changes
 *   once the persisted run is no longer `Running`.
 * - `MJ: ML Models.Delivery`, `Lineage` and `ArtifactSha256` never change once the persisted value is non-null.
 * - The first non-null `Delivery` or `ArtifactSha256` written onto an existing row (§5.6's back-fill of a pre-change
 *   row) needs an `EvidenceWriteAuthorisations` entry for that instance (only M7.2's `PreGateModelMigration` sets one),
 *   and a `Delivery` must equal the one rebuilt from the row's stored training run exactly as M2.3's trainer builds it:
 *   `RegisteredDelivery.Register(Delivery.Create(gate decision, trainer artifacts, task), stored file)`. The stored file
 *   is the row's `ArtifactFileID`, that `MJ: Files` row's provider and key, and the row's `ArtifactSha256`; its
 *   `sizeBytes` is taken from the written delivery, because no stored row holds it (`MJ: Files` has no size column).
 * - A first `Lineage` on an existing row is allowed: the plan restricts only the two back-filled columns.
 * - A create carries its evidence freely (the trainer creates the model row with `Delivery` set).
 *
 * A row that cannot be read is refused (fail closed).
 */
import type { BaseEntity, PreSaveHook, UserInfo } from '@memberjunction/core';
import { MJMLModelEntity, MJMLTrainingRunEntity, type MJFileEntity } from '@memberjunction/core-entities';
import { Canonicalize } from '@memberjunction/global';
import {
  Delivery,
  JsonParse,
  RegisteredDelivery,
  RegistrySchemas,
  type RegisteredDeliveryView,
  type StoredFile,
} from '@memberjunction/predictive-studio-core';

import { EvidenceWriteAuthorisations, type BackFilledEvidenceField } from './evidence-write-authorisations';
import { GuardContexts } from './guard-context';
import { PreSaveHookRegistration } from './pre-save-hook-registration';
import type { RegistryContext } from './registry-context';
import { StoredRuns } from './stored-publish-inputs';

/** The write-once model columns, in the order the guard checks them. */
const WRITE_ONCE_MODEL_FIELDS = ['Delivery', 'Lineage', 'ArtifactSha256'] as const;
/** A write-once model column. */
type WriteOnceModelField = (typeof WRITE_ONCE_MODEL_FIELDS)[number];
/** The stored model columns the guard reads. */
type StoredModelEvidence = Pick<MJMLModelEntity, 'ID' | 'TrainingRunID' | WriteOnceModelField>;

/** Set once this copy of the module has registered (or found) its hook. */
let registered = false;

/** The `PreSave` evidence guard on `MJ: ML Models` and `MJ: ML Training Runs`. */
export class PredictiveStudioEvidenceGuard {
  /** The global mark the registered hook carries, so a second copy of the module finds it and does not register again. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:evidence-guard');

  /** Registers the hook once per process; idempotent within a copy of the module (a flag) and across copies (the mark). */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const hook: PreSaveHook = (entity, contextUser) => PredictiveStudioEvidenceGuard.Check(entity, contextUser);
    PreSaveHookRegistration.RegisterOnce(PredictiveStudioEvidenceGuard.HookMark, hook);
  }

  /** The hook's body: `true` for an allowed save (a create, and every other entity), else the refusal message. */
  protected static async Check(entity: BaseEntity, contextUser: UserInfo | undefined): Promise<boolean | string> {
    const name = entity.EntityInfo?.Name;
    if (name === 'MJ: ML Models') {
      if (!(entity instanceof MJMLModelEntity)) return PredictiveStudioEvidenceGuard.unreadable(name, 'the entity object is not an MJMLModelEntity');
      // Taken on every save, a create included, so an authorisation never outlives the save it was issued for.
      const authorised = EvidenceWriteAuthorisations.Instance.Take(entity);
      return entity.IsSaved ? PredictiveStudioEvidenceGuard.CheckModel(entity, authorised, contextUser) : true;
    }
    if (name === 'MJ: ML Training Runs') {
      if (!(entity instanceof MJMLTrainingRunEntity)) return PredictiveStudioEvidenceGuard.unreadable(name, 'the entity object is not an MJMLTrainingRunEntity');
      return entity.IsSaved ? PredictiveStudioEvidenceGuard.CheckTrainingRun(entity, contextUser) : true;
    }
    return true;
  }

  /**
   * An update of a model row: each write-once column unchanged, or written for the first time as the rules allow.
   *
   * @param authorised the fields the migration authorised for this save, already taken (a refused save leaves none behind)
   */
  protected static async CheckModel(model: MJMLModelEntity, authorised: readonly BackFilledEvidenceField[], contextUser: UserInfo | undefined): Promise<boolean | string> {
    const ctx = GuardContexts.ForSave(model.ProviderToUse, contextUser);
    if (ctx === null) return PredictiveStudioEvidenceGuard.unreadable(`ML Model ${model.ID}`, 'the provider cannot read the stored row');
    try {
      const stored = await GuardContexts.ReadById<StoredModelEvidence>('MJ: ML Models', model.ID, ['ID', 'TrainingRunID', ...WRITE_ONCE_MODEL_FIELDS], ctx);
      if (stored === null) return PredictiveStudioEvidenceGuard.unreadable(`ML Model ${model.ID}`, 'no stored row has its ID');
      for (const field of WRITE_ONCE_MODEL_FIELDS) {
        const refused = await PredictiveStudioEvidenceGuard.checkModelField(model, field, stored, authorised, ctx);
        if (refused !== null) return refused;
      }
      return true;
    } catch (error) {
      return PredictiveStudioEvidenceGuard.unreadable(`ML Model ${model.ID}`, `a read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** An update of a training run: its `ValidationResults` unchanged unless the persisted run is still `Running`. */
  protected static async CheckTrainingRun(run: MJMLTrainingRunEntity, contextUser: UserInfo | undefined): Promise<boolean | string> {
    const ctx = GuardContexts.ForSave(run.ProviderToUse, contextUser);
    if (ctx === null) return PredictiveStudioEvidenceGuard.unreadable(`ML Training Run ${run.ID}`, 'the provider cannot read the stored row');
    try {
      const stored = await GuardContexts.ReadById<Pick<MJMLTrainingRunEntity, 'ID' | 'Status' | 'ValidationResults'>>(
        'MJ: ML Training Runs', run.ID, ['ID', 'Status', 'ValidationResults'], ctx,
      );
      if (stored === null) return PredictiveStudioEvidenceGuard.unreadable(`ML Training Run ${run.ID}`, 'no stored row has its ID');
      if (stored.Status === 'Running' || run.ValidationResults === stored.ValidationResults) return true;
      return PredictiveStudioEvidenceGuard.writeOnce(`ML Training Run ${run.ID}`, `its ValidationResults (gate record, trainer result, leakage audit) is stored and the run is ${stored.Status}`);
    } catch (error) {
      return PredictiveStudioEvidenceGuard.unreadable(`ML Training Run ${run.ID}`, `a read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * The Delivery the row's stored training run gives, exactly as the trainer registers it, or why there is none. The
   * written delivery supplies only the stored file's `sizeBytes`, which no stored row holds.
   */
  protected static async RebuildDelivery(model: MJMLModelEntity, stored: StoredModelEvidence, written: RegisteredDeliveryView, ctx: RegistryContext): Promise<RegisteredDeliveryView | string> {
    if (!stored.TrainingRunID) return 'the row names no training run';
    const run = await StoredRuns.Read(stored.TrainingRunID, ctx);
    if (run === null || run.Gate === null || run.Trainer === null) return `training run ${stored.TrainingRunID} has no stored gate record and trainer result`;
    const semantics = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    if (semantics.Ok === false) return `its OutputSemantics does not parse: ${semantics.Errors.join('; ')}`;
    const created = Delivery.Create(run.Gate.decision, run.Trainer.artifacts, semantics.Value.task);
    if (created.Ok === false) return `the stored run's delivery is refused (${created.Error.Kind})`;
    const file = created.Delivery.View.artifact === null ? null : await PredictiveStudioEvidenceGuard.storedFileOf(model, written, ctx);
    if (typeof file === 'string') return file;
    const registered = RegisteredDelivery.Register(created.Delivery, file);
    if (registered.Ok === false) return `the stored run's delivery cannot be registered: ${registered.Reason}`;
    return registered.Registered.View;
  }

  /** One write-once column of a model update: null when allowed, else the refusal. */
  private static async checkModelField(
    model: MJMLModelEntity, field: WriteOnceModelField, stored: StoredModelEvidence, authorised: readonly BackFilledEvidenceField[], ctx: RegistryContext,
  ): Promise<string | null> {
    const incoming = model[field];
    const persisted = stored[field];
    if (incoming === persisted) return null;
    const subject = `ML Model ${model.ID}`;
    if (persisted !== null) return PredictiveStudioEvidenceGuard.writeOnce(subject, `its ${field} is stored`);
    if (field === 'Lineage') return null;
    if (!authorised.includes(field)) {
      return PredictiveStudioEvidenceGuard.writeOnce(subject, `the first ${field} of an existing row is written only by the pre-change migration's back-fill (§5.6)`);
    }
    return field === 'Delivery' ? PredictiveStudioEvidenceGuard.checkBackFilledDelivery(model, stored, ctx) : null;
  }

  /** The back-filled Delivery equals the one rebuilt from the row's stored run (canonical JSON). */
  private static async checkBackFilledDelivery(model: MJMLModelEntity, stored: StoredModelEvidence, ctx: RegistryContext): Promise<string | null> {
    const written = PredictiveStudioEvidenceGuard.deliveryOf(model.Delivery);
    const rebuilt = written === null ? 'the written Delivery is not a registered delivery' : await PredictiveStudioEvidenceGuard.RebuildDelivery(model, stored, written, ctx);
    if (typeof rebuilt !== 'string' && Canonicalize(rebuilt) === Canonicalize(written)) return null;
    const why = typeof rebuilt === 'string' ? rebuilt : 'it differs from the delivery rebuilt from the stored gate decision, trainer artifacts and stored file';
    return `Predictive Studio evidence guard: the first Delivery of ML Model ${model.ID} is refused: the delivery does not match the stored run (${why}).`;
  }

  /** The stored file the row names, or why it cannot be built. */
  private static async storedFileOf(model: MJMLModelEntity, written: RegisteredDeliveryView, ctx: RegistryContext): Promise<StoredFile | string> {
    if (!model.ArtifactFileID || !model.ArtifactSha256) return 'the row names no artifact file and hash';
    if (written.kind !== 'delivered') return 'the written Delivery ships no artifact';
    const file = await GuardContexts.ReadById<Pick<MJFileEntity, 'ID' | 'ProviderID' | 'ProviderKey'>>('MJ: Files', model.ArtifactFileID, ['ID', 'ProviderID', 'ProviderKey'], ctx);
    if (file === null || !file.ProviderKey) return `the artifact file ${model.ArtifactFileID} has no stored row with a provider key`;
    return {
      fileId: model.ArtifactFileID, storageProviderId: file.ProviderID, providerKey: file.ProviderKey, sha256: model.ArtifactSha256,
      sizeBytes: written.artifact.sizeBytes, writeOnce: true,
    };
  }

  /** The written Delivery checked against its schema; null when it is not JSON or not a registered delivery. */
  private static deliveryOf(text: string | null): RegisteredDeliveryView | null {
    const json = JsonParse.ParseJsonText(text, 'Delivery');
    if (json.Ok === false) return null;
    const parsed = RegistrySchemas.RegisteredDeliveryView.safeParse(json.Value);
    return parsed.success ? parsed.data : null;
  }

  private static writeOnce(subject: string, why: string): string {
    return `Predictive Studio evidence guard: the save of ${subject} is refused: stored evidence is write-once (${why}).`;
  }

  private static unreadable(subject: string, why: string): string {
    return `Predictive Studio evidence guard: the save of ${subject} is refused (stored-row-unreadable): ${why}, so its stored evidence cannot be checked (fail closed).`;
  }
}
