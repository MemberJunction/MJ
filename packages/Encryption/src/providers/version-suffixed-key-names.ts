/**
 * @fileoverview Key-name resolution for sources that keep each key version under its own name.
 *
 * Environment variables and config-file entries hold one secret per name, so versions are told
 * apart by a suffix: version 1 is the bare name and later versions append `_V<n>` (`_v<n>` in
 * config files) — `MJ_KEY`, `MJ_KEY_V2`, `MJ_KEY_V3`.
 *
 * Key rotation stores the NEW version's own name as the key's lookup value, so one lookup value
 * has to resolve two ways: as-is for the key's current version, and back to its siblings for a
 * ciphertext written under an older version that was never re-encrypted.
 *
 * Not exported from the package: these are the shared internals of `EnvVarKeySource` and
 * `ConfigFileKeySource`.
 *
 * @module @memberjunction/encryption
 */

/** Matches a name that already carries a version suffix: `MJ_KEY_V2` → (`MJ_KEY`, `_V`, `2`). */
const VERSION_SUFFIX = /^(.+)(_v)(\d+)$/i;

/**
 * Resolves the name holding the key's CURRENT version.
 *
 * Version 1 is the bare name. A name that already names `keyVersion` is used as-is — that is how
 * rotation leaves a key (lookup value `MJ_KEY_V2`, version `2`), and appending would look for
 * `MJ_KEY_V2_V2`. Otherwise the suffix is appended (`MJ_KEY` at version 2 → `MJ_KEY_V2`).
 *
 * @param baseName - The key's lookup value
 * @param keyVersion - The key's current version
 * @param suffix - `_V` for environment variables, `_v` for config-file entries
 */
export function ResolveCurrentVersionKeyName(baseName: string, keyVersion: string | undefined, suffix: string): string {
    if (!keyVersion || keyVersion === '1') {
        return baseName;
    }
    const match = VERSION_SUFFIX.exec(baseName);
    if (match && match[3] === keyVersion) {
        return baseName;
    }
    return `${baseName}${suffix}${keyVersion}`;
}

/**
 * Resolves the name holding an OLDER version of a key, from the key's current lookup value.
 *
 * Uses the current lookup value's own suffix: `MJ_KEY_V3` → `MJ_KEY_V2` for version 2, and
 * `MJ_KEY` for version 1 (or `MJ_KEY_V1` when only that one exists).
 *
 * Returns `null` when the current lookup value carries no version suffix, or `keyVersion` is not a
 * plain number; the caller then resolves the version with {@link ResolveCurrentVersionKeyName}
 * against the unchanged lookup value (`MJ_KEY` at version 2 → `MJ_KEY_V2`).
 *
 * @param currentLookupValue - The key's lookup value as it stands now
 * @param keyVersion - The older version named in the ciphertext envelope
 * @param exists - Whether the source holds a secret under a given name
 */
export function ResolveHistoricalVersionKeyName(
    currentLookupValue: string,
    keyVersion: string,
    exists: (name: string) => boolean
): string | null {
    const match = VERSION_SUFFIX.exec(currentLookupValue);
    if (!match || !/^\d+$/.test(keyVersion)) {
        return null;
    }
    const [, rootName, separator] = match;
    if (keyVersion !== '1') {
        return `${rootName}${separator}${keyVersion}`;
    }
    const explicitV1 = `${rootName}${separator}1`;
    return !exists(rootName) && exists(explicitV1) ? explicitV1 : rootName;
}
