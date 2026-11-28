/**
 * @fileoverview Module-level WeakMaps that every physical copy of this package shares.
 */
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * The WeakMap stored under `key` in the Global Object Store, created on first use.
 *
 * A consumer's install can hold more than one physical copy of this package (pnpm resolves a
 * separate copy per peer-dependency variant). A plain module-level WeakMap then exists once per
 * copy: a value one copy records, another copy cannot read. Since ClassFactory keeps the FIRST
 * registered copy of a class, the agent type that reads a decision can come from a different copy
 * than the prompt runner that recorded it, and the lookup silently finds nothing. Keeping the map
 * in the Global Object Store — as {@link BaseSingleton} does for singletons — gives every copy the
 * same map. Without a store (no global object), each copy falls back to its own map.
 *
 * @param key A name unique to the map within MJ
 */
export function SharedWeakMap<K extends object, V>(key: string): WeakMap<K, V> {
    const store = GetGlobalObjectStore();
    if (!store) {
        return new WeakMap<K, V>();
    }
    const storeKey = `___MJ_SHARED_WEAKMAP__${key}`;
    if (!(store[storeKey] instanceof WeakMap)) {
        store[storeKey] = new WeakMap<K, V>();
    }
    return store[storeKey] as WeakMap<K, V>;
}
