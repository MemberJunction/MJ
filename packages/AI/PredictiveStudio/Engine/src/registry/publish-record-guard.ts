/**
 * @module registry/publish-record-guard
 *
 * `PredictiveStudioPublishRecordGuard` — the platform's door on `MJ: ML Model Publish Records` (review item 1 of PR
 * #6517). A `PreSave` and a `PreDelete` data hook, registered once per process from the Engine entry point, that run on
 * every save and delete of the entity from any caller (GraphQL, an agent, an Action, the gate itself):
 *
 * - A new row is refused unless its writer authorised that instance for its `Kind`
 *   (`PublishRecordWriteAuthorisations`, one-shot): only `SignOffService` (a `sign-off`) and `PublishRecords` (the
 *   lifecycle gate's `publish` and `refusal` rows, the registry check's through it) do. So the approving sign-off the
 *   gate accepts was recorded by `SignOffService`, behind `PredictiveStudio.SignOffModel`'s person-only check.
 * - A saved row with any changed field is refused: the ledger is append-only (as `MJMLModelPublishRecordEntityServer`
 *   also refuses, kept here so the rule holds in any process that loads the Engine).
 * - A delete is refused unless authorised (one-shot; only the TruthSuite harness's cleanup of its own fixture rows
 *   authorises one). A `ReplayOnly` delete skips `PreDelete` hooks; `MJMLModelPublishRecordEntityServer.Delete` refuses
 *   it. `spDeleteEntityWithCoreDependencies` runs in SQL and never reaches either.
 *
 * Each hook returns `true` for every other entity, else `true` or a refusal message naming the record.
 */
import type { BaseEntity, PreDeleteHook, PreSaveHook } from '@memberjunction/core';
import { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';

import { PreSaveHookRegistration } from './pre-save-hook-registration';
import { PublishRecordWriteAuthorisations } from './publish-record-write-authorisations';

/** Set once this copy of the module has registered (or found) its hooks. */
let registered = false;

/** The `PreSave` and `PreDelete` guard on `MJ: ML Model Publish Records`. */
export class PredictiveStudioPublishRecordGuard {
  /** The global mark the registered `PreSave` hook carries, so a second copy of the module does not register again. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:publish-record-guard');
  /** The global mark the registered `PreDelete` hook carries. */
  public static readonly DeleteHookMark: symbol = Symbol.for('@memberjunction/predictive-studio:publish-record-delete-guard');
  /** The entity the guard checks. */
  public static readonly EntityName = 'MJ: ML Model Publish Records';

  /** Registers both hooks once per process; idempotent within a copy of the module (a flag) and across copies (the marks). */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const save: PreSaveHook = (entity) => PredictiveStudioPublishRecordGuard.CheckSave(entity);
    const del: PreDeleteHook = (entity) => PredictiveStudioPublishRecordGuard.CheckDelete(entity);
    PreSaveHookRegistration.RegisterOnce(PredictiveStudioPublishRecordGuard.HookMark, save);
    PreSaveHookRegistration.RegisterPreDeleteOnce(PredictiveStudioPublishRecordGuard.DeleteHookMark, del);
  }

  /**
   * The `PreSave` hook's body: `true` for an allowed save (and for every other entity), else the refusal message.
   * Pure but for taking the instance's one-shot authorisation.
   */
  public static CheckSave(entity: BaseEntity): boolean | string {
    if (entity.EntityInfo?.Name !== PredictiveStudioPublishRecordGuard.EntityName) return true;
    if (!(entity instanceof MJMLModelPublishRecordEntity)) {
      return PredictiveStudioPublishRecordGuard.refusal('(unknown)', 'the entity object is not an MJMLModelPublishRecordEntity, so its writer cannot be checked');
    }
    const authorised = PublishRecordWriteAuthorisations.Instance.TakeCreate(entity);
    if (entity.IsSaved) {
      const dirty = entity.Fields.filter((f) => f.Dirty).map((f) => f.Name);
      if (dirty.length === 0) return true;
      return PredictiveStudioPublishRecordGuard.refusal(entity.ID, `the ledger is append-only: ${dirty.join(', ')} cannot be changed on a saved record; write a new record instead`);
    }
    if (authorised === null) {
      return PredictiveStudioPublishRecordGuard.refusal(
        '(new)',
        `a ${entity.Kind || '(no kind)'} record is written only by its writer — a sign-off by SignOffService (PredictiveStudio.SignOffModel), ` +
          'a publish or refusal by the lifecycle gate — never by a direct save',
      );
    }
    if (authorised !== entity.Kind) {
      return PredictiveStudioPublishRecordGuard.refusal('(new)', `its writer authorised a ${authorised} record, not a ${entity.Kind || '(no kind)'} record`);
    }
    return true;
  }

  /** The `PreDelete` hook's body: `true` for an authorised delete (and for every other entity), else the refusal. */
  public static CheckDelete(entity: BaseEntity): boolean | string {
    if (entity.EntityInfo?.Name !== PredictiveStudioPublishRecordGuard.EntityName) return true;
    if (entity instanceof MJMLModelPublishRecordEntity && PublishRecordWriteAuthorisations.Instance.TakeDelete(entity)) return true;
    const id = entity instanceof MJMLModelPublishRecordEntity ? entity.ID : '(unknown)';
    return PredictiveStudioPublishRecordGuard.refusal(id, 'the ledger is append-only: a publish record is never deleted');
  }

  /**
   * Removes this process's hooks (any copy's, by their marks) and resets the module's registered flag, so a later
   * {@link Register} registers again. For a test that checks the database's own constraints on rows the guard would
   * refuse first. Nothing in production calls it.
   *
   * @returns true when a hook was removed
   */
  public static Unregister(): boolean {
    registered = false;
    const save = PreSaveHookRegistration.Unregister(PredictiveStudioPublishRecordGuard.HookMark);
    const del = PreSaveHookRegistration.UnregisterPreDelete(PredictiveStudioPublishRecordGuard.DeleteHookMark);
    return save || del;
  }

  private static refusal(id: string, why: string): string {
    return `Predictive Studio publish record guard: the write of ${PredictiveStudioPublishRecordGuard.EntityName} record ${id} is refused: ${why}.`;
  }
}
