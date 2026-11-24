/**
 * @module governance/scoring-binding-guard
 *
 * `PredictiveStudioScoringBindingGuard` — the two `MJ: ML Model Scoring Bindings` columns the withdrawal and the view
 * gate depend on (review question 4 of PR #6517). A `PreSave` data hook, registered once per process from the Engine
 * entry point, that compares every update of a saved binding with the stored row it reads itself (never `OldValue`):
 *
 * - `Status` changes only under a `ScoringBindingStatusAuthorisations` entry for exactly that `From → To` (one-shot;
 *   only `ScoringBindings.Withdraw` issues one, `Active → Withdrawn`, in the transaction that clears the binding's
 *   column copies). A plain save that withdraws without clearing, or reactivates a withdrawn binding, is refused.
 * - `ViewAuthorizationID` changes only for a caller who holds the binding's stored authorization — the rule the write
 *   path and `Withdraw` apply (D4-60) — so a caller cannot re-point a binding to an authorization they hold and read
 *   predictions they were not entitled to. The binding editor's change of the authorization stays a plain save.
 *
 * A create passes (a new binding has no copies and no readers yet; the entity's own validation checks its fields). A
 * row that cannot be read is refused (fail closed).
 */
import type { BaseEntity, PreSaveHook, UserInfo } from '@memberjunction/core';
import { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

import { GuardContexts } from '../registry/guard-context';
import { PreSaveHookRegistration } from '../registry/pre-save-hook-registration';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';
import { ScoringBindings } from '../scoring/scoring-binding';
import { ScoringBindingStatusAuthorisations, type ScoringBindingStatusChange } from './scoring-binding-status-authorisations';
import { ScoringBindingAuthorizationBackfills } from './scoring-binding-authorization-backfills';

/** The stored binding columns the guard reads. */
type StoredBinding = Pick<MJMLModelScoringBindingEntity, 'ID' | 'Status' | 'ViewAuthorizationID'>;

/** Set once this copy of the module has registered (or found) its hook. */
let registered = false;

/** The `PreSave` guard on `MJ: ML Model Scoring Bindings`. */
export class PredictiveStudioScoringBindingGuard {
  /** The global mark the registered hook carries, so a second copy of the module finds it and does not register again. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:scoring-binding-guard');
  /** The entity the guard checks. */
  public static readonly EntityName = 'MJ: ML Model Scoring Bindings';

  /** Registers the hook once per process; idempotent within a copy of the module (a flag) and across copies (the mark). */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const hook: PreSaveHook = (entity, contextUser) => PredictiveStudioScoringBindingGuard.Check(entity, contextUser);
    PreSaveHookRegistration.RegisterOnce(PredictiveStudioScoringBindingGuard.HookMark, hook);
  }

  /** The hook's body: `true` for an allowed save (and for every other entity), else the refusal message. */
  public static async Check(entity: BaseEntity, contextUser: UserInfo | undefined): Promise<boolean | string> {
    if (entity.EntityInfo?.Name !== PredictiveStudioScoringBindingGuard.EntityName) return true;
    if (!(entity instanceof MJMLModelScoringBindingEntity)) {
      return PredictiveStudioScoringBindingGuard.refusal('(unknown)', 'the entity object is not an MJMLModelScoringBindingEntity, so its Status and authorization cannot be checked');
    }
    const authorised = ScoringBindingStatusAuthorisations.Instance.Take(entity);
    const backfill = ScoringBindingAuthorizationBackfills.Instance.Take(entity);
    if (!entity.IsSaved) return true;
    const ctx = GuardContexts.ForSave(entity.ProviderToUse, contextUser);
    if (ctx === null) return PredictiveStudioScoringBindingGuard.refusal(entity.ID, 'the provider cannot read the stored binding, or there is no user (fail closed)');
    try {
      const stored = await PredictiveStudioScoringBindingGuard.readStored(entity.ID, ctx);
      if (stored === null) return PredictiveStudioScoringBindingGuard.refusal(entity.ID, 'its stored row could not be found (fail closed)');
      return PredictiveStudioScoringBindingGuard.statusRefusal(entity, stored, authorised)
        || (await PredictiveStudioScoringBindingGuard.authorizationRefusal(entity, stored, backfill, ctx))
        || true;
    } catch (error) {
      return PredictiveStudioScoringBindingGuard.refusal(entity.ID, `a read of the stored rows failed: ${error instanceof Error ? error.message : String(error)} (fail closed)`);
    }
  }

  /** The refusal of a `Status` change the authorisation does not cover; null when `Status` is unchanged or covered. Pure. */
  public static StatusChangeProblem(stored: StoredBinding['Status'], written: StoredBinding['Status'], authorised: ScoringBindingStatusChange | null): string | null {
    if (stored === written) return null;
    if (authorised !== null && authorised.From === stored && authorised.To === written) return null;
    return `Status ${stored} → ${written} is changed only by ScoringBindings.Withdraw (PredictiveStudio.WithdrawScoringBinding), ` +
      'which clears the column copies in the same transaction; a withdrawn binding is never reactivated';
  }

  /**
   * Removes this process's hook (any copy's, by its mark) and resets the module's registered flag, so a later
   * {@link Register} registers again. Nothing in production calls it.
   *
   * @returns true when a hook was removed
   */
  public static Unregister(): boolean {
    registered = false;
    return PreSaveHookRegistration.Unregister(PredictiveStudioScoringBindingGuard.HookMark);
  }

  private static statusRefusal(entity: MJMLModelScoringBindingEntity, stored: StoredBinding, authorised: ScoringBindingStatusChange | null): string | null {
    const problem = PredictiveStudioScoringBindingGuard.StatusChangeProblem(stored.Status, entity.Status, authorised);
    return problem === null ? null : PredictiveStudioScoringBindingGuard.refusal(entity.ID, problem);
  }

  /**
   * The refusal of a `ViewAuthorizationID` change by a caller who does not hold the stored authorization; else null. The
   * retention job's backfill (D4-28) assigns a binding stored without one under a one-shot authorisation naming exactly
   * the authorization it writes (`ScoringBindingAuthorizationBackfills`); it never replaces an authorization.
   */
  private static async authorizationRefusal(entity: MJMLModelScoringBindingEntity, stored: StoredBinding, backfill: string | null, ctx: RegistryContext): Promise<string | null> {
    if (PredictiveStudioScoringBindingGuard.sameAuthorization(stored.ViewAuthorizationID, entity.ViewAuthorizationID)) return null;
    if (!stored.ViewAuthorizationID && backfill !== null && PredictiveStudioScoringBindingGuard.sameAuthorization(backfill, entity.ViewAuthorizationID)) return null;
    if (await ScoringBindings.CallerHoldsBinding(stored, ctx)) return null;
    return PredictiveStudioScoringBindingGuard.refusal(
      entity.ID,
      `ViewAuthorizationID is changed only by a caller who holds the binding's current view authorization (${stored.ViewAuthorizationID || 'none'}), the rule scoring and withdrawal apply (D4-60)`,
    );
  }

  private static sameAuthorization(a: string | null, b: string | null): boolean {
    if (!a || !b) return !a && !b;
    return UUIDsEqual(a, b);
  }

  /** The stored row, past the RunView cache; null when there is none. */
  private static async readStored(id: string, ctx: RegistryContext): Promise<StoredBinding | null> {
    const r = await StoredRowReads.Run<StoredBinding>(
      {
        EntityName: PredictiveStudioScoringBindingGuard.EntityName, ExtraFilter: `ID='${EscapeSQLString(id)}'`, // pk-filter-ok: MJ: ML Model Scoring Bindings is an MJ core entity keyed by ID
        Fields: ['ID', 'Status', 'ViewAuthorizationID'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading scoring binding ${id} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    return row !== undefined && UUIDsEqual(row.ID, id) ? row : null;
  }

  private static refusal(id: string, why: string): string {
    return `Predictive Studio scoring binding guard: the save of ${PredictiveStudioScoringBindingGuard.EntityName} ${id} is refused: ${why}.`;
  }
}
