/**
 * Information about a single MemberJunction release version.
 */
export interface VersionInfo {
  /** Git tag, e.g. "v4.1.0" */
  Tag: string;
  /** Human-readable display name */
  Name: string;
  /** GitHub release publication date */
  ReleaseDate: Date;
  /** true if the release is marked as a prerelease on GitHub */
  Prerelease: boolean;
  /** Direct URL to the ZIP asset for download */
  DownloadUrl: string;
  /** Short excerpt from the release notes (if available) */
  Notes?: string;
}
