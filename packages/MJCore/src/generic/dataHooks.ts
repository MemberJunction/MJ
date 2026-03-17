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

import { GetGlobalObjectStore } from '@memberjunction/global';
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
    const gos = GetGlobalObjectStore();
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
    const gos = GetGlobalObjectStore();
    if (!gos) return [];
    const store = gos[DATA_HOOKS_KEY] as Record<string, unknown[]> | undefined;
    return (store?.[hookName] ?? []) as T[];
}

/**
 * Removes all hooks from all slots. For testing only.
 */
export function ClearAllDataHooks(): void {
    const gos = GetGlobalObjectStore();
    if (gos) {
        gos[DATA_HOOKS_KEY] = {};
    }
}
