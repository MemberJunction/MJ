/**
 * Data hook types and helper functions for the MJServer middleware pipeline.
 *
 * Hook type definitions (PreRunViewHook, PostRunViewHook, PreSaveHook) define
 * the function signatures consumed by ProviderBase and BaseEntity.
 *
 * RegisterDataHook / GetDataHooks are thin helpers backed by GetGlobalObjectStore().
 * All intelligent work (discovery, deduplication) happens once in serve().
 * Execution order follows ClassFactory registration order (dependency-graph order).
 */

import { GetGlobalObjectStore, GlobalObjectStore } from '@memberjunction/global';
import type { RunViewResult } from './interfaces';
import type { RunViewParams } from '../views/runView';
import type { UserInfo } from './securityInfo';
import type { BaseEntity } from './baseEntity';

/**
 * Hook that runs before a RunView operation. Can modify the RunViewParams
 * (e.g., injecting tenant filters) before execution.
 * Return the (possibly modified) params to continue, or throw to abort.
 */
export type PreRunViewHook = (
  params: RunViewParams,
  contextUser: UserInfo | undefined
) => RunViewParams | Promise<RunViewParams>;

/**
 * Hook that runs after a RunView operation completes. Can modify the result
 * (e.g., filtering or augmenting data) before it is returned to the caller.
 *
 * ⚠️ On the server, `results.Results` and its rows may be FROZEN shared cache state
 * (LocalCacheManager freeze-on-write) — writing into a row throws `TypeError`. To modify,
 * build copies and either reassign `results.Results = results.Results.map(r => ({ ...r, ... }))`
 * or return a new result; never mutate rows in place.
 */
export type PostRunViewHook = (
  params: RunViewParams,
  results: RunViewResult,
  contextUser: UserInfo | undefined
) => RunViewResult | Promise<RunViewResult>;

/**
 * Hook that runs before a Save operation on a BaseEntity.
 * Return `true` to allow the save, `false` to reject silently,
 * or a string to reject with that error message.
 */
export type PreSaveHook = (
  entity: BaseEntity,
  contextUser: UserInfo | undefined
) => boolean | string | Promise<boolean | string>;

/** Well-known hook names used by the data hooks system */
export type HookName = 'PreRunView' | 'PostRunView' | 'PreSave';

const DATA_HOOKS_KEY = '__mj_dataHooks';

/**
 * Memoized result of {@link GetGlobalObjectStore}. `undefined` means "not resolved yet";
 * `null` is a legitimate resolved value (neither `window` nor `global` available).
 */
let _globalStore: GlobalObjectStore | null | undefined = undefined;

/**
 * Resolves the global object store once and reuses it.
 *
 * `GetGlobalObjectStore()` probes a bare `window` identifier, which in Node throws a
 * ReferenceError that is then caught — measured at ~1.4µs per call, ~45x the cost of the
 * property reads it guards. `GetDataHooks` sits on the RunView hot path (every cache hit
 * consults the PostRunView slot), so paying that per call is not viable.
 *
 * Memoizing is safe because the global object is fixed for the life of the process. This
 * caches the STORE, not the hooks, so the cross-duplicate contract is unchanged: every
 * copy of this module still reads and writes the same global slot, and hooks registered
 * through one copy remain visible to all of them.
 */
function globalStore(): GlobalObjectStore | null {
    if (_globalStore === undefined) {
        _globalStore = GetGlobalObjectStore();
    }
    return _globalStore;
}

/**
 * Registers a hook function into a named slot. Called by serve() after
 * middleware discovery and deduplication. Hooks are stored in insertion order
 * (serve() inserts them in ClassFactory registration order -- MJ first,
 * then middle-layer, then app).
 *
 * This is intentionally simple -- no priority logic, no namespace logic.
 * All that intelligence lives in serve() where middleware is discovered
 * via ClassFactory.
 */
export function RegisterDataHook(hookName: HookName | string, hook: unknown): void {
    const gos = globalStore();
    if (!gos) return;
    if (!gos[DATA_HOOKS_KEY]) gos[DATA_HOOKS_KEY] = {};
    const store = gos[DATA_HOOKS_KEY] as Record<string, unknown[]>;
    if (!store[hookName]) store[hookName] = [];
    store[hookName].push(hook);
}

/**
 * Retrieves all hooks registered under the given name, in insertion order.
 * Returns an empty array if none are registered (safe for iteration).
 *
 * Used by ProviderBase.RunPreRunViewHooks() and BaseEntity.RunPreSaveHooks().
 */
export function GetDataHooks<T>(hookName: HookName | string): T[] {
    const gos = globalStore();
    if (!gos) return [];
    const store = gos[DATA_HOOKS_KEY] as Record<string, unknown[]> | undefined;
    return (store?.[hookName] ?? []) as T[];
}

/**
 * Removes all hooks from all slots. For testing only.
 */
export function ClearAllDataHooks(): void {
    const gos = globalStore();
    if (gos) {
        gos[DATA_HOOKS_KEY] = {};
    }
}
