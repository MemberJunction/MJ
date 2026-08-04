/**
 * Version compatibility checking for MJ Open Apps.
 *
 * Validates that the host MemberJunction version satisfies an app's
 * declared mjVersionRange, and that installed app versions satisfy
 * dependency requirements.
 *
 * Host-side checks coerce prerelease host versions (e.g. '6.2.0-edge.3')
 * to their base release tuple before evaluating the range — see
 * {@link CoerceToBaseVersion} for why.
 */
import semver from 'semver';

/**
 * Coerces a semver version to its base release tuple (`major.minor.patch`),
 * stripping any prerelease/build identifiers: `6.2.0-edge.3` → `6.2.0`.
 *
 * Used for the HOST MJ version before checking it against an app's
 * `mjVersionRange`. Plain `semver.satisfies` excludes prerelease versions
 * from ranges unless the range itself is tuple-anchored, so an `-edge.N`
 * dev host would reject every app install the moment MJ's Edge prerelease
 * grammar activates — even when the app's range is era-correct.
 *
 * Why base-tuple coercion and NOT `semver.satisfies(v, range, { includePrerelease: true })`:
 * semver orders a prerelease BELOW its release (`7.0.0-edge.0 < 7.0.0`), so with
 * `includePrerelease` a 7-era Edge host would wrongly PASS a `<7.0.0` cap —
 * `satisfies('7.0.0-edge.0', '>=6.1.0 <7.0.0', { includePrerelease: true }) === true`.
 * Coercing to the base tuple gives the era-correct answer: `7.0.0` fails `<7.0.0`.
 * The host gate cares about which release ERA the host is in, not prerelease
 * ordering — an `-edge.N` build of 6.2.0 is a 6.2-era host.
 *
 * @param version - A semver version string, possibly with prerelease/build suffix
 * @returns The `major.minor.patch` base version, or null if the input is not valid semver
 */
export function CoerceToBaseVersion(version: string): string | null {
    const parsed = semver.parse(version);
    if (!parsed) {
        return null;
    }
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

/**
 * Result of a version compatibility check.
 */
export interface VersionCheckResult {
    /** Whether the version is compatible */
    Compatible: boolean;
    /** True when target version equals the installed version — no work needed */
    AlreadyAtTarget?: boolean;
    /** Human-readable explanation if incompatible */
    Message?: string;
}

/**
 * Checks whether the running MJ version satisfies an app's required range.
 *
 * Prerelease host versions (e.g. '6.2.0-edge.3') are evaluated as their base
 * release tuple ('6.2.0') so era-correct ranges accept prerelease dev hosts —
 * see {@link CoerceToBaseVersion} for the rationale.
 *
 * @param mjVersion - The current MJ version (e.g., '4.3.1' or '6.2.0-edge.3')
 * @param requiredRange - The semver range from the manifest (e.g., '>=4.0.0 <5.0.0')
 * @returns Compatibility result with explanation if incompatible
 */
export function CheckMJVersionCompatibility(mjVersion: string, requiredRange: string): VersionCheckResult {
    if (!semver.valid(mjVersion)) {
        return {
            Compatible: false,
            Message: `Invalid MJ version: '${mjVersion}' is not a valid semver string`
        };
    }

    if (!semver.validRange(requiredRange)) {
        return {
            Compatible: false,
            Message: `Invalid version range in manifest: '${requiredRange}' is not a valid semver range`
        };
    }

    const baseVersion = CoerceToBaseVersion(mjVersion);
    if (baseVersion === null) {
        // Unreachable after the semver.valid guard above — surfaced explicitly
        // rather than silently falling through, per the no-swallowed-errors rule.
        return {
            Compatible: false,
            Message: `Invalid MJ version: '${mjVersion}' could not be parsed as semver`
        };
    }

    if (semver.satisfies(baseVersion, requiredRange)) {
        return { Compatible: true };
    }

    const evaluatedAs = baseVersion === mjVersion ? '' : ` (evaluated as ${baseVersion})`;
    return {
        Compatible: false,
        Message: `MJ version ${mjVersion}${evaluatedAs} does not satisfy the required range '${requiredRange}'`
    };
}

/**
 * Checks whether an installed app version satisfies a dependency's required range.
 *
 * @param installedVersion - The currently installed version (e.g., '2.1.0')
 * @param requiredRange - The semver range required by the dependent app (e.g., '^2.0.0')
 * @returns Compatibility result with explanation if incompatible
 */
export function CheckDependencyVersionCompatibility(
    installedVersion: string,
    requiredRange: string
): VersionCheckResult {
    if (!semver.valid(installedVersion)) {
        return {
            Compatible: false,
            Message: `Invalid installed version: '${installedVersion}' is not a valid semver string`
        };
    }

    if (!semver.validRange(requiredRange)) {
        return {
            Compatible: false,
            Message: `Invalid dependency range: '${requiredRange}' is not a valid semver range`
        };
    }

    if (semver.satisfies(installedVersion, requiredRange)) {
        return { Compatible: true };
    }

    return {
        Compatible: false,
        Message: `Installed version ${installedVersion} does not satisfy required range '${requiredRange}'`
    };
}

/**
 * Determines if an upgrade from one version to another is valid (i.e., the
 * target version is greater than the current version).
 *
 * @param currentVersion - The currently installed version
 * @param targetVersion - The version to upgrade to
 * @returns Whether the target is a valid upgrade
 */
export function IsValidUpgrade(currentVersion: string, targetVersion: string): VersionCheckResult {
    if (!semver.valid(currentVersion) || !semver.valid(targetVersion)) {
        return {
            Compatible: false,
            Message: `Invalid version(s): current='${currentVersion}', target='${targetVersion}'`
        };
    }

    if (semver.gt(targetVersion, currentVersion)) {
        return { Compatible: true };
    }

    if (semver.eq(targetVersion, currentVersion)) {
        return {
            Compatible: true,
            AlreadyAtTarget: true,
            Message: `Already at version ${targetVersion} — nothing to upgrade`
        };
    }

    return {
        Compatible: false,
        Message: `Target version ${targetVersion} is older than installed version ${currentVersion}`
    };
}
