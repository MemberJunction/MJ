/**
 * Open App source backed by a GitHub repository.
 */
import semver from 'semver';
import {
    FetchManifestFromGitHub,
    DownloadMigrations,
    ValidateGitHubTag,
    GetLatestVersion,
    DescribeUnresolvedVersion,
    ListGitHubReleases,
    ListGitHubTags,
    type GitHubClientOptions,
    type ManifestFetchResult,
    type MigrationDownloadResult,
} from '../github/github-client.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import type { VersionStrategy } from '../install/package-manager.js';
import type { OpenAppSource, SourceContext, VersionValidationResult } from './open-app-source.js';

/**
 * Reads an Open App from a GitHub repository. Versions are git tags and releases; files are read
 * at the tag for the requested version.
 */
export class GitHubAppSource implements OpenAppSource {
    public readonly Locator: string;
    public readonly Subpath: string | undefined;
    /** Undefined: the app's packages use the configured version strategy. */
    public readonly PackageVersionStrategy: VersionStrategy | undefined = undefined;
    private readonly options: GitHubClientOptions;
    private readonly appName: string | undefined;

    /**
     * @param locator - GitHub repository URL
     * @param context - Authentication, the app's folder in the repository, and the app name used to find its tags
     */
    public constructor(locator: string, context: SourceContext) {
        this.Locator = locator;
        this.Subpath = context.Subpath;
        this.options = context.GitHubOptions;
        this.appName = context.AppName;
    }

    public FetchManifest(version?: string): Promise<ManifestFetchResult> {
        return FetchManifestFromGitHub(this.Locator, version, this.options, this.Subpath, this.appName);
    }

    public CopySqlDirectory(directory: string, version: string, targetDir: string): Promise<MigrationDownloadResult> {
        return DownloadMigrations(this.Locator, version, directory, targetDir, this.options, this.Subpath, this.appName);
    }

    public ValidateVersion(version: string): Promise<VersionValidationResult> {
        return ValidateGitHubTag(this.Locator, version, this.options, this.Subpath, this.appName);
    }

    public GetLatestVersion(): Promise<string | null> {
        return GetLatestVersion(this.Locator, this.options, this.Subpath, this.appName);
    }

    public DescribeUnresolvedVersion(): Promise<string> {
        return DescribeUnresolvedVersion(this.Locator, this.options, this.Subpath);
    }

    /** Returns the non-draft release tags and the version tags, without a leading `v`, that are valid semver. */
    public async ListVersions(): Promise<string[]> {
        const [releases, tags] = await Promise.all([
            ListGitHubReleases(this.Locator, this.options),
            ListGitHubTags(this.Locator, this.options, this.Subpath, this.appName),
        ]);
        const tagNames = [...releases.filter((r) => !r.Draft).map((r) => r.TagName), ...tags];
        return tagNames.map((t) => t.replace(/^v/, '')).filter((v) => semver.valid(v) != null);
    }

    /**
     * Returns a source for the manifest's repository, in the same folder, that finds tags by the
     * manifest name.
     */
    public ForManifest(manifest: Pick<MJAppManifest, 'name' | 'repository'>): OpenAppSource {
        return new GitHubAppSource(manifest.repository, {
            GitHubOptions: this.options,
            Subpath: this.Subpath,
            AppName: manifest.name,
        });
    }
}
