/**
 * @fileoverview The standards registry.
 *
 * Adding a check here makes it **available**, not active. No repo's result changes until a human
 * adopts it — that is the property that lets this package ship new standards continuously instead
 * of in scary batches.
 *
 * @module @memberjunction/standards
 */

import type { StandardCheck } from './types.js';
import { UILayersCheck } from './checks/ui-layers.js';

/**
 * Every registered standard.
 *
 * **Adding a check:** append it with a `Since` equal to the MJ version it will ship in. Never
 * backdate `Since` — that would silently activate the check in repos that adopted before it
 * existed, which is exactly what this design prevents.
 *
 * **Removing a check:** don't, without a deprecation cycle. A repo whose config names a check that
 * no longer exists gets an "unknown check" warning rather than a silent no-op, so removal is
 * visible — but it is still a breaking change for anyone whose CI names it.
 */
export const STANDARD_CHECKS: readonly StandardCheck[] = [UILayersCheck];

/** Look up a check by its config key. */
export function GetCheck(id: string): StandardCheck | undefined {
    return STANDARD_CHECKS.find((c) => c.Id === id);
}

/** All registered check ids, sorted — used by `adopt` and by unknown-key reporting. */
export function AllCheckIds(): string[] {
    return STANDARD_CHECKS.map((c) => c.Id).sort();
}
