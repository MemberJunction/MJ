/**
 * The Open App source layer: where an app's manifest, published versions and SQL files come from.
 *
 * The install orchestrator reads every app file through an {@link OpenAppSource}, so it does not
 * depend on where the files live.
 */
import { ParseGitHubUrl, type GitHubClientOptions, type ManifestFetchResult, type MigrationDownloadResult } from '../github/github-client.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import type { VersionStrategy } from '../install/package-manager.js';
import { GitHubAppSource } from './github-app-source.js';
import { IsLocalAppLocator, LocalAppSource } from './local-app-source.js';

/** Result of checking that a version is published. */
export interface VersionValidationResult {
    /** Whether the version is published */
    Exists: boolean;
    /** Why the version is not available (when `Exists` is false) */
    ErrorMessage?: string;
}

/** Where one Open App's manifest, versions and SQL files come from. */
export interface OpenAppSource {
    /** The locator this source reads from */
    readonly Locator: string;
    /** The app's folder inside the source; undefined when the app is at the root */
    readonly Subpath: string | undefined;
    /** The version strategy the app's npm packages must use; undefined uses the configured strategy */
    readonly PackageVersionStrategy: VersionStrategy | undefined;

    /** Reads the app's `mj-app.json` at `version`, or at the latest default-branch content when no version is given. */
    FetchManifest(version?: string): Promise<ManifestFetchResult>;
    /** Copies the `.sql` files under `directory`, at `version` (or default-branch content when undefined), into `targetDir`. */
    CopySqlDirectory(directory: string, version: string | undefined, targetDir: string): Promise<MigrationDownloadResult>;
    /** Checks that `version` is published. */
    ValidateVersion(version: string): Promise<VersionValidationResult>;
    /** Returns the newest stable published version, or null when none is found. */
    GetLatestVersion(): Promise<string | null>;
    /** Explains why no published version was found. */
    DescribeUnresolvedVersion(): Promise<string>;
    /** Returns every published version as a semver string without a leading `v`. */
    ListVersions(): Promise<string[]>;
    /** Returns the source of the app's own files (migrations, teardown scripts) for a fetched manifest. */
    ForManifest(manifest: Pick<MJAppManifest, 'name' | 'repository'>): OpenAppSource;
}

/** Settings for resolving an {@link OpenAppSource}. */
export interface SourceContext {
    /** GitHub authentication and token settings */
    GitHubOptions: GitHubClientOptions;
    /** The app's folder inside the source; undefined when the app is at the root */
    Subpath?: string;
    /** The manifest `name` of the app, used to find its version tags in a multi-app repository */
    AppName?: string;
    /** Absolute path of the consumer repository root; required for a `file:` locator */
    RepoRoot?: string;
}

/**
 * Returns the source for a locator: a {@link LocalAppSource} for a `file:` locator, otherwise a
 * {@link GitHubAppSource}.
 *
 * @param locator - `file:` locator or GitHub repository URL of the app
 * @param context - Authentication, subpath, app name and repository root for the source
 */
export function ResolveAppSource(locator: string, context: SourceContext): OpenAppSource {
    if (IsLocalAppLocator(locator)) {
        if (!context.RepoRoot) {
            throw new Error(`The local app '${locator}' needs the repository root to find its folder.`);
        }
        return new LocalAppSource(locator, context.RepoRoot);
    }
    return new GitHubAppSource(locator, context);
}

/**
 * Returns the app folder embedded in a locator, such as `CRM/HubSpot` in
 * `https://github.com/MemberJunction/Integrations/CRM/HubSpot`, or undefined when there is none.
 */
export function SubpathFromLocator(locator: string): string | undefined {
    return ParseGitHubUrl(locator)?.Subpath;
}
