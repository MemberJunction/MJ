/**
 * Version compatibility checking for MJ Open Apps.
 *
 * Validates that the host MemberJunction version satisfies an app's
 * declared mjVersionRange, and that installed app versions satisfy
 * dependency requirements.
 */
import semver from 'semver';

/**
 * Result of a version compatibility check.
 */
export interface VersionCheckResult {
    /** Whether the version is compatible */
    Compatible: boolean;
    /** Human-readable explanation if incompatible */
    Message?: string;
}

/**
 * Checks whether the running MJ version satisfies an app's required range.
 *
 * @param mjVersion - The current MJ version (e.g., '4.3.1')
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

    if (semver.satisfies(mjVersion, requiredRange)) {
        return { Compatible: true };
    }

    return {
        Compatible: false,
        Message: `MJ version ${mjVersion} does not satisfy the required range '${requiredRange}'`
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
            Compatible: false,
            Message: `Target version ${targetVersion} is the same as the installed version`
        };
    }

    return {
        Compatible: false,
        Message: `Target version ${targetVersion} is older than installed version ${currentVersion}`
    };
}
