/**
 * Information about a single MemberJunction release version.
 *
 * Populated by {@link GitHubReleaseProvider} from either formal GitHub
 * Releases or git tags. Used by {@link ScaffoldPhase} to resolve the
 * download target and by {@link InstallerEngine.ListVersions} to populate
 * the interactive version picker.
 *
 * @module models/VersionInfo
 *
 * @example
 * ```typescript
 * const provider = new GitHubReleaseProvider();
 * const versions: VersionInfo[] = await provider.ListReleases();
 * const latest = versions[0];
 * console.log(`${latest.Tag} — ${latest.Name} (${latest.ReleaseDate.toLocaleDateString()})`);
 * ```
 */
export interface VersionInfo {
  /**
   * Git tag associated with this release (e.g., `"v5.1.0"`).
   * Used as the primary identifier for version selection and checkpoint state.
   */
  Tag: string;

  /**
   * Human-readable display name for the release.
   * Falls back to the tag name if no formal release title is set on GitHub.
   */
  Name: string;

  /**
   * Date when the release was published on GitHub.
   * For tag-based fallback versions, this is the commit date of the tagged commit.
   */
  ReleaseDate: Date;

  /**
   * Whether this release is marked as a prerelease on GitHub.
   * Prereleases are excluded from {@link GitHubReleaseProvider.ListReleases}
   * unless `includePrerelease` is `true`.
   */
  Prerelease: boolean;

  /**
   * Direct URL to the release ZIP archive for download.
   * Prefers an uploaded `.zip` asset if available; otherwise uses the
   * GitHub-generated `zipball_url` (source code archive).
   */
  DownloadUrl: string;

  /**
   * Short excerpt from the release notes (first 500 characters), if available.
   * `undefined` for tag-based fallback versions that have no release notes.
   */
  Notes?: string;
}
