/**
 * @module feature-values/effective-range-guard
 *
 * `FeatureValueEffectiveRangeGuard` — the platform's door on the effective range of `MJ: Feature Values` (PR 5 B1,
 * D5-30). A `PreSave` data hook, registered once per process from the Engine entry point (server-only:
 * `@memberjunction/predictive-studio` loads only through `ServerBootstrap`, so no browser bundle registers it, F-007),
 * that runs on every save of the entity from any caller (GraphQL, an `Update Record` Action, an agent, any server save):
 *
 * - a create of a `Pipeline` or `Human` row is refused, and
 * - a change of `EffectiveAsOf`, `EffectiveTo`, `SourceUserID` or `Source` of a saved row is refused,
 *
 * unless `FeatureValueWriteAuthorisations` (`@memberjunction/feature-pipelines`) carries a one-shot entry for that very
 * entity instance — the Feature Pipelines write path's own save. The entry is keyed by the instance, never a process
 * flag, so a write of another instance in flight at the same time is refused (F-018). `Model` rows (PR 4's writer) and
 * every other change of a row pass; every other entity passes.
 */
import type { BaseEntity, PreSaveHook } from '@memberjunction/core';
import { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { FeatureValueWriteAuthorisations } from '@memberjunction/feature-pipelines';

import { PreSaveHookRegistration } from '../registry/pre-save-hook-registration';

/** Set once this copy of the module has registered (or found) its hook. */
let registered = false;

/** The Feature Value sources whose effective range the write path owns. */
const GUARDED_SOURCES: ReadonlyArray<MJFeatureValueEntity['Source']> = ['Pipeline', 'Human'];

/** The columns of a saved row only the write path may change. */
const RANGE_COLUMNS: ReadonlySet<string> = new Set<keyof Pick<MJFeatureValueEntity, 'EffectiveAsOf' | 'EffectiveTo' | 'SourceUserID' | 'Source'>>(
  ['EffectiveAsOf', 'EffectiveTo', 'SourceUserID', 'Source']);

/** The `PreSave` guard on the effective range of `MJ: Feature Values`. */
export class FeatureValueEffectiveRangeGuard {
  /** The global mark the registered `PreSave` hook carries, so a second copy of the module does not register again. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:feature-value-effective-range-guard');
  /** The entity the guard checks. */
  public static readonly EntityName = 'MJ: Feature Values';

  /** Registers the hook once per process; idempotent within a copy of the module (a flag) and across copies (the mark). */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const hook: PreSaveHook = (entity) => FeatureValueEffectiveRangeGuard.CheckSave(entity);
    PreSaveHookRegistration.RegisterOnce(FeatureValueEffectiveRangeGuard.HookMark, hook);
  }

  /**
   * The hook's body: `true` for an allowed save (and for every other entity), else the refusal message. Pure but for
   * taking the instance's one-shot authorisation.
   */
  public static CheckSave(entity: BaseEntity): boolean | string {
    if (entity.EntityInfo?.Name !== FeatureValueEffectiveRangeGuard.EntityName) return true;
    if (!(entity instanceof MJFeatureValueEntity)) {
      return FeatureValueEffectiveRangeGuard.refusal('(unknown)', 'the entity object is not an MJFeatureValueEntity, so its writer cannot be checked');
    }
    if (FeatureValueWriteAuthorisations.Instance.Take(entity)) return true;
    if (!entity.IsSaved) {
      if (!GUARDED_SOURCES.includes(entity.Source)) return true;
      return FeatureValueEffectiveRangeGuard.refusal('(new)', `a ${entity.Source} value is recorded only by the Feature Pipelines write path (FeatureValueCacheService), never by a direct save`);
    }
    const changed = entity.Fields.filter((f) => f.Dirty && RANGE_COLUMNS.has(f.Name)).map((f) => f.Name);
    if (changed.length === 0) return true;
    return FeatureValueEffectiveRangeGuard.refusal(entity.ID, `${changed.join(', ')} of a saved value is changed only by the Feature Pipelines write path, which closes and opens rows`);
  }

  /**
   * Removes this process's hook (any copy's, by its mark) and resets the module's registered flag, so a later
   * {@link Register} registers again. For a test that checks the database's own constraints on rows the guard would
   * refuse first. Nothing in production calls it.
   *
   * @returns true when a hook was removed
   */
  public static Unregister(): boolean {
    registered = false;
    return PreSaveHookRegistration.Unregister(FeatureValueEffectiveRangeGuard.HookMark);
  }

  private static refusal(id: string, why: string): string {
    return `Predictive Studio effective range guard: the write of ${FeatureValueEffectiveRangeGuard.EntityName} record ${id} is refused: ${why}.`;
  }
}
