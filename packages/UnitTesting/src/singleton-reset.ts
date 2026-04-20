import { MJGlobal } from '@memberjunction/global';
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * Reset ALL MJ singletons by clearing their entries from the global object store.
 * Call this in beforeEach() to ensure clean test isolation.
 */
export function resetMJSingletons(): void {
  const store = GetGlobalObjectStore();
  if (store) {
    const indexableStore = store as Record<string, unknown>;
    const singletonKeys = Object.keys(indexableStore).filter(k => k.startsWith('___SINGLETON__'));
    for (const key of singletonKeys) {
      delete indexableStore[key];
    }
  }
}

/**
 * Reset just the ClassFactory registrations without destroying the MJGlobal singleton.
 * Lighter weight than resetMJSingletons - use when you only need a clean ClassFactory.
 */
export function resetClassFactory(): void {
  MJGlobal.Instance.Reset();
}

/**
 * Clear the global ObjectCache.
 */
export function resetObjectCache(): void {
  MJGlobal.Instance.ObjectCache.Clear();
}
