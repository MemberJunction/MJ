/**
 * @fileoverview The one way the content pipeline resolves a registered class by key: the class registered under `key`
 * for a base (`@RegisterClass(base, key)`, matched without regard to case), or null.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';

/** The class registered under `key` for `base`, or null when the key is empty or nothing registered it. */
export function ResolveRegistered<T>(base: unknown, key: string | null | undefined): T | null {
    const trimmed = key?.trim();
    if (!trimmed) {
        return null;
    }
    const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<T>(base, trimmed);
    return result.Resolved ? result.Instance : null;
}
