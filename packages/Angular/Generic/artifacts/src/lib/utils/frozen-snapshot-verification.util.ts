import type { PreVerifiedFrozenSnapshotMap } from '../components/base-artifact-viewer.component';

/**
 * Resolves whether a frozen block/table/slide snapshot is verified when optional server-supplied
 * `PreVerifiedFrozenSnapshots` provenance is available (e.g. pre-auth Guest Share links).
 *
 * Returns:
 * - `true` when any candidate key in `preVerifiedMap` explicitly reports `Verified: true`.
 * - `false` when `preVerifiedMap` explicitly marks any candidate key `Verified: false` (fail closed).
 * - `null` when `preVerifiedMap` has no matching entry, allowing the caller to fall back to local HMAC check.
 */
export function ResolvePreVerifiedFrozenSnapshotState(
  preVerifiedMap: PreVerifiedFrozenSnapshotMap | null | undefined,
  candidateKeys: ReadonlyArray<string | null | undefined>,
): { Verified: boolean; FrozenByUserName?: string; FrozenAt?: string } | null {
  if (!preVerifiedMap) {
    return null;
  }
  for (const rawKey of candidateKeys) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key) {
      continue;
    }
    const entry = preVerifiedMap[key];
    if (entry !== undefined) {
      return entry;
    }
  }
  return null;
}
