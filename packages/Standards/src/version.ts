/**
 * @fileoverview Minimal semver comparison.
 *
 * Deliberately dependency-free. This package is meant to be installed by client repos and run in
 * CI, so every dependency it carries is one more thing that can conflict with their tree. The only
 * comparison it needs is "is version A newer than version B", and that is twenty lines.
 *
 * @module @memberjunction/standards
 */

/** A parsed semver, prerelease and build metadata discarded. */
interface Parsed {
    Major: number;
    Minor: number;
    Patch: number;
}

/**
 * Parse `major.minor.patch`, tolerating a `v` prefix, a prerelease tag, and build metadata.
 *
 * Returns `null` rather than throwing on anything unparseable: a malformed `standardsVersion` in a
 * repo's config should degrade to "treat every check as available" — visible and safe — not crash
 * the tool and block the build.
 */
export function ParseVersion(version: string): Parsed | null {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
    if (!match) return null;
    return { Major: Number(match[1]), Minor: Number(match[2]), Patch: Number(match[3]) };
}

/**
 * Compare two versions. Returns a negative number when `a` is older, 0 when equal, positive when
 * `a` is newer. An unparseable version sorts as oldest, so unknown input never *hides* a check.
 */
export function CompareVersions(a: string, b: string): number {
    const left = ParseVersion(a);
    const right = ParseVersion(b);
    if (!left && !right) return 0;
    if (!left) return -1;
    if (!right) return 1;
    return left.Major - right.Major || left.Minor - right.Minor || left.Patch - right.Patch;
}

/**
 * Is `candidate` newer than `baseline`?
 *
 * This is the version-sensitivity primitive: a check whose `Since` is newer than the repo's
 * adopted `StandardsVersion` is **available, not active**.
 */
export function IsNewerThan(candidate: string, baseline: string): boolean {
    return CompareVersions(candidate, baseline) > 0;
}
