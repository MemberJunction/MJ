/**
 * @module registry/pre-save-hook-registration
 *
 * Registers the registry's `PreSave` data hooks exactly once per process. A hook is marked with a global symbol
 * (`Symbol.for`, the same symbol in every copy of this module), and registration checks the registered `PreSave` hooks
 * for that mark first, so a second copy of the Engine loaded into the same process (a bundler split, two resolved
 * installs) finds the first copy's hook and does not add its own. Each guard's `Register()` also keeps a module-level
 * flag, so a repeated call in one copy returns at once.
 */
import { GetDataHooks, RegisterDataHook, type PreDeleteHook, type PreSaveHook } from '@memberjunction/core';

/** Registers marked `PreSave` (and `PreDelete`) hooks once per process. */
export class PreSaveHookRegistration {
  /** True when a `PreSave` hook carrying `mark` is registered (by any copy of the module). */
  public static IsRegistered(mark: symbol): boolean {
    return PreSaveHookRegistration.HooksMarked(mark).length > 0;
  }

  /** The registered `PreSave` hooks that carry `mark`. */
  public static HooksMarked(mark: symbol): readonly PreSaveHook[] {
    return GetDataHooks<PreSaveHook>('PreSave').filter((h) => Object.prototype.hasOwnProperty.call(h, mark));
  }

  /**
   * Marks `hook` with `mark` and registers it as a `PreSave` hook, unless a hook carrying `mark` is registered already.
   *
   * @returns true when this call registered `hook`; false when a marked hook was already there
   */
  public static RegisterOnce(mark: symbol, hook: PreSaveHook): boolean {
    if (PreSaveHookRegistration.IsRegistered(mark)) return false;
    Object.defineProperty(hook, mark, { value: true, enumerable: false });
    RegisterDataHook('PreSave', hook);
    return true;
  }

  /**
   * Removes every registered `PreSave` hook carrying `mark`, in place, from the slot `GetDataHooks('PreSave')` returns
   * (it is the stored array; MJCore has no per-hook removal, and `ClearAllDataHooks` would drop every other hook too).
   * For a process that must behave as a browser-only client — one that does not load the Engine — so a save it makes
   * is checked by the server alone. Nothing in production calls it.
   *
   * @returns true when at least one marked hook was removed
   */
  public static Unregister(mark: symbol): boolean {
    const hooks = GetDataHooks<PreSaveHook>('PreSave');
    let removed = false;
    for (let i = hooks.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(hooks[i], mark)) {
        hooks.splice(i, 1);
        removed = true;
      }
    }
    return removed;
  }

  /** The registered `PreDelete` hooks that carry `mark`. */
  public static PreDeleteHooksMarked(mark: symbol): readonly PreDeleteHook[] {
    return GetDataHooks<PreDeleteHook>('PreDelete').filter((h) => Object.prototype.hasOwnProperty.call(h, mark));
  }

  /**
   * Marks `hook` with `mark` and registers it as a `PreDelete` hook, unless a hook carrying `mark` is registered already
   * (the `PreDelete` counterpart of {@link RegisterOnce}).
   *
   * @returns true when this call registered `hook`; false when a marked hook was already there
   */
  public static RegisterPreDeleteOnce(mark: symbol, hook: PreDeleteHook): boolean {
    if (PreSaveHookRegistration.PreDeleteHooksMarked(mark).length > 0) return false;
    Object.defineProperty(hook, mark, { value: true, enumerable: false });
    RegisterDataHook('PreDelete', hook);
    return true;
  }

  /**
   * Removes every registered `PreDelete` hook carrying `mark`, in place (the `PreDelete` counterpart of
   * {@link Unregister}). Nothing in production calls it.
   *
   * @returns true when at least one marked hook was removed
   */
  public static UnregisterPreDelete(mark: symbol): boolean {
    const hooks = GetDataHooks<PreDeleteHook>('PreDelete');
    let removed = false;
    for (let i = hooks.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(hooks[i], mark)) {
        hooks.splice(i, 1);
        removed = true;
      }
    }
    return removed;
  }
}
