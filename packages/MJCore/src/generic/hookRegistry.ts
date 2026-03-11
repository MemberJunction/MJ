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

/** Well-known hook names used by the registry */
export type HookName = 'PreRunView' | 'PostRunView' | 'PreSave';

/**
 * Options for controlling hook registration behavior.
 */
export interface HookRegistrationOptions {
  /**
   * Numeric priority. Lower numbers run first. Default: 100.
   *
   * Convention:
   * - MJ built-in hooks: 50
   * - Middle-layer hooks (e.g., SaaS layer): 100
   * - Application-level hooks: 200+
   */
  Priority?: number;

  /**
   * Unique namespace for this hook (e.g., 'mj:tenantFilter', 'bcsaas:tenantFilter').
   *
   * When registering with a namespace that already exists for this hook name,
   * the old hook is **replaced** rather than appended. This allows a middle layer
   * to override MJ's generic hook without causing double execution.
   */
  Namespace?: string;
}

/** Internal entry stored in the registry */
interface HookEntry {
  hook: unknown;
  priority: number;
  namespace: string | undefined;
}

const REGISTRY_KEY = '__mj_hookRegistry';

/**
 * Global hook registry backed by GetGlobalObjectStore() so it works
 * reliably across bundler code-splits (same pattern as BaseSingleton).
 *
 * Lives in @memberjunction/core so both ProviderBase and BaseEntity can
 * consume it without circular dependencies on @memberjunction/server.
 */
export class HookRegistry {
  /**
   * Returns the backing store map, creating it lazily on first access.
   */
  private static get _store(): Record<string, HookEntry[]> {
    const gos = GetGlobalObjectStore();
    if (!gos) {
      throw new Error('HookRegistry: GlobalObjectStore is not available');
    }
    if (!gos[REGISTRY_KEY]) {
      gos[REGISTRY_KEY] = {};
    }
    return gos[REGISTRY_KEY] as Record<string, HookEntry[]>;
  }

  /**
   * Register a hook function under the given name.
   *
   * When `options.Namespace` is provided and a hook with the same namespace already
   * exists for this hook name, the old hook is replaced. Otherwise the hook is appended.
   *
   * Hooks are returned by `GetHooks` in ascending priority order (lower = first).
   * The default priority is 100.
   */
  static Register<T>(hookName: HookName | string, hook: T, options?: HookRegistrationOptions): void {
    const store = HookRegistry._store;
    if (!store[hookName]) {
      store[hookName] = [];
    }

    const entry: HookEntry = {
      hook,
      priority: options?.Priority ?? 100,
      namespace: options?.Namespace,
    };

    const hooks = store[hookName];

    // If namespace is provided and already exists, replace it
    if (entry.namespace) {
      const existingIndex = hooks.findIndex(h => h.namespace === entry.namespace);
      if (existingIndex >= 0) {
        hooks[existingIndex] = entry;
      } else {
        hooks.push(entry);
      }
    } else {
      hooks.push(entry);
    }

    // Sort by priority (lower first), stable for equal priorities
    hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Retrieve all hooks registered under the given name, in priority order (lowest first).
   * Returns an empty array if none are registered (safe for iteration).
   */
  static GetHooks<T>(hookName: HookName | string): T[] {
    const store = HookRegistry._store;
    const entries = store[hookName] ?? [];
    return entries.map(e => e.hook as T);
  }

  /**
   * Remove all hooks registered under the given name.
   * Useful for testing or server restart scenarios.
   */
  static Clear(hookName: HookName | string): void {
    const store = HookRegistry._store;
    delete store[hookName];
  }

  /**
   * Remove all hooks from all names.
   */
  static ClearAll(): void {
    const gos = GetGlobalObjectStore();
    if (gos) {
      gos[REGISTRY_KEY] = {};
    }
  }
}
