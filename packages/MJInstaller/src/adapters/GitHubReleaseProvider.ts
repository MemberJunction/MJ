/**
 * Adapter for listing and downloading MemberJunction releases from GitHub.
 *
 * Uses the unauthenticated GitHub REST API (60 requests/hour rate limit,
 * which is plenty for installer use).
 *
 * Supports two release strategies:
 * 1. **Formal GitHub Releases** (preferred) — includes release notes, pre-built
 *    ZIP assets, and prerelease flags.
 * 2. **Git tags fallback** — for repos that only publish version tags without
 *    formal Release objects. Uses zipball URLs and fetches commit dates for
 *    display in the version picker.
 *
 * The provider is used by {@link ScaffoldPhase} to resolve versions and download
 * release archives, and by {@link InstallerEngine.ListVersions} to populate
 * the interactive version picker.
 *
 * @example
 * ```typescript
 * const github = new GitHubReleaseProvider();
 * const versions = await github.ListReleases();
 * const specific = await github.GetReleaseByTag('v5.1.0');
 * await github.DownloadRelease(specific.DownloadUrl, '/tmp/release.zip', (pct) => {
 *   console.log(`${pct}% downloaded`);
 * });
 * ```
 */

import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { VersionInfo } from '../models/VersionInfo.js';

/** Base URL for all GitHub REST API calls. */
const GITHUB_API_BASE = 'https://api.github.com';

/** Default GitHub organization that owns the MemberJunction repository. */
const REPO_OWNER = 'MemberJunction';

/** Default GitHub repository name. */
const REPO_NAME = 'MJ';

/** Maximum tags to fetch commit dates for (keeps API usage reasonable). */
const MAX_TAG_DATE_LOOKUPS = 20;

// ---------------------------------------------------------------------------
// GitHub API response shapes
// ---------------------------------------------------------------------------

/**
 * Shape of a single release object returned by the GitHub Releases API.
 * @see https://docs.github.com/en/rest/releases/releases#list-releases
 */
interface GitHubRelease {
  /** Git tag associated with this release (e.g., "v5.1.0"). */
  tag_name: string;
  /** Human-readable release title. */
  name: string;
  /** ISO 8601 timestamp when the release was published. */
  published_at: string;
  /** Whether this release is marked as a prerelease on GitHub. */
  prerelease: boolean;
  /** Markdown body of the release notes. */
  body: string;
  /** Uploaded binary assets attached to the release. */
  assets: GitHubAsset[];
  /** GitHub-generated source code ZIP URL (fallback if no explicit ZIP asset). */
  zipball_url: string;
}

/**
 * Shape of a single asset attached to a GitHub Release.
 * @see https://docs.github.com/en/rest/releases/assets
 */
interface GitHubAsset {
  /** Filename of the asset (e.g., "MJ-v5.1.0.zip"). */
  name: string;
  /** Direct download URL for the asset. */
  browser_download_url: string;
  /** File size in bytes. */
  size: number;
  /** MIME type reported by GitHub (e.g., "application/zip"). */
  content_type: string;
}

/**
 * Shape of a single tag object returned by the GitHub Tags API.
 * Used as a fallback when no formal Releases exist.
 * @see https://docs.github.com/en/rest/repos/repos#list-repository-tags
 */
interface GitHubTag {
  /** Tag name (e.g., "v5.1.0"). */
  name: string;
  /** GitHub-generated source code ZIP URL for this tag. */
  zipball_url: string;
  /** Commit that the tag points to. */
  commit: {
    /** Full SHA of the tagged commit. */
    sha: string;
    /** API URL to fetch full commit details (used to get the commit date). */
    url: string;
  };
}

/**
 * Shape of the commit detail response from the GitHub Commits API.
 * Only the fields we need (committer date) are declared.
 * @see https://docs.github.com/en/rest/commits/commits#get-a-commit
 */
interface GitHubCommitResponse {
  /** Git commit metadata. */
  commit: {
    /** Committer information (we use this for the commit date). */
    committer: {
      /** ISO 8601 timestamp of when the commit was made. */
      date: string;
    };
  };
}

/**
 * Adapter that lists and downloads MemberJunction releases from GitHub.
 *
 * All network calls use the unauthenticated GitHub REST API with a
 * `User-Agent: MJ-Installer` header. The unauthenticated rate limit is
 * 60 requests per hour per IP, which is sufficient for installer workflows.
 *
 * The provider first attempts to use formal GitHub Releases (which include
 * uploaded ZIP assets and release notes). If no releases are found, it falls
 * back to listing git tags and constructing zipball download URLs.
 */
export class GitHubReleaseProvider {
  /** GitHub organization or user that owns the repository. */
  private owner: string;

  /** GitHub repository name. */
  private repo: string;

  /**
   * Create a new GitHubReleaseProvider.
   *
   * @param owner - GitHub organization or user (default: `"MemberJunction"`)
   * @param repo - Repository name (default: `"MJ"`)
   */
  constructor(owner: string = REPO_OWNER, repo: string = REPO_NAME) {
    this.owner = owner;
    this.repo = repo;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * List available MemberJunction versions, sorted most recent first.
   *
   * Tries formal GitHub Releases first (up to 50). If no releases are found,
   * falls back to listing git tags (up to 30) and fetching commit dates for
   * the most recent {@link MAX_TAG_DATE_LOOKUPS} tags.
   *
   * @param includePrerelease - If `true`, includes releases marked as prerelease
   *   on GitHub. Defaults to `false`.
   * @returns Array of {@link VersionInfo} objects sorted by release date descending.
   * @throws Error if the GitHub API request fails.
   *
   * @example
   * ```typescript
   * const provider = new GitHubReleaseProvider();
   * const stable = await provider.ListReleases();
   * const all = await provider.ListReleases(true); // includes prereleases
   * ```
   */
  async ListReleases(includePrerelease: boolean = false): Promise<VersionInfo[]> {
    const releases = await this.fetchFormalReleases(includePrerelease);
    if (releases.length > 0) {
      return releases;
    }

    return this.fetchTagVersions();
  }

  /**
   * Get a specific version by its git tag name.
   *
   * Tries to resolve as a formal GitHub Release first. If the release is not
   * found (404), falls back to looking up the tag via the Commits API to get
   * the commit date and constructs a zipball download URL.
   *
   * @param tag - The git tag to look up (e.g., `"v5.1.0"`).
   * @returns A {@link VersionInfo} for the requested tag.
   * @throws Error if the tag does not exist in the repository.
   *
   * @example
   * ```typescript
   * const provider = new GitHubReleaseProvider();
   * const version = await provider.GetReleaseByTag('v5.1.0');
   * console.log(version.DownloadUrl);
   * ```
   */
  async GetReleaseByTag(tag: string): Promise<VersionInfo> {
    // Try formal release first
    const releaseUrl = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/releases/tags/${tag}`;
    const releaseResponse = await this.githubFetch(releaseUrl);
    if (releaseResponse.ok) {
      const release = (await releaseResponse.json()) as GitHubRelease;
      return this.mapRelease(release);
    }

    // Fall back to tag lookup
    return this.fetchSingleTagVersion(tag);
  }

  /**
   * Download a release ZIP archive to a local file path.
   *
   * Streams the download to disk to avoid holding the entire archive in memory.
   * Follows HTTP redirects automatically (GitHub often 302-redirects to a CDN).
   *
   * @param downloadUrl - URL to download from (either an asset URL or a zipball URL).
   * @param destPath - Absolute path where the ZIP file will be written.
   * @param onProgress - Optional callback invoked with download percentage (0–100)
   *   as data arrives. Only called if the server provides a `Content-Length` header.
   * @throws Error if the HTTP request fails or the response has no body.
   *
   * @example
   * ```typescript
   * const provider = new GitHubReleaseProvider();
   * const version = await provider.GetReleaseByTag('v5.1.0');
   * await provider.DownloadRelease(version.DownloadUrl, '/tmp/mj.zip', (pct) => {
   *   process.stdout.write(`\rDownloading... ${pct}%`);
   * });
   * ```
   */
  async DownloadRelease(
    downloadUrl: string,
    destPath: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const response = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'MJ-Installer' },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Download response has no body');
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    const fileStream = fs.createWriteStream(destPath);
    const reader = response.body.getReader();

    let receivedBytes = 0;
    const readableStream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        receivedBytes += value.byteLength;
        if (onProgress && contentLength > 0) {
          onProgress(Math.round((receivedBytes / contentLength) * 100));
        }
        this.push(Buffer.from(value));
      },
    });

    await pipeline(readableStream, fileStream);
  }

  // ---------------------------------------------------------------------------
  // Formal releases (repos that use GitHub Releases)
  // ---------------------------------------------------------------------------

  /**
   * Fetch formal GitHub Releases and map them to {@link VersionInfo} objects.
   *
   * @param includePrerelease - Whether to include prerelease versions.
   * @returns Array of versions, or empty array if no releases exist.
   * @throws Error on API failure.
   */
  private async fetchFormalReleases(includePrerelease: boolean): Promise<VersionInfo[]> {
    const url = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/releases?per_page=50`;
    const response = await this.githubFetch(url);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const releases = (await response.json()) as GitHubRelease[];

    return releases
      .filter((r) => includePrerelease || !r.prerelease)
      .map((r) => this.mapRelease(r));
  }

  /**
   * Convert a GitHub Release API response into a {@link VersionInfo}.
   *
   * Prefers an uploaded `.zip` asset if one exists; otherwise falls back to
   * the GitHub-generated `zipball_url` (source code archive).
   *
   * @param release - Raw GitHub Release response.
   * @returns Mapped {@link VersionInfo}.
   */
  private mapRelease(release: GitHubRelease): VersionInfo {
    const downloadUrl = this.findZipAsset(release);
    const notesExcerpt = release.body
      ? release.body.slice(0, 500) + (release.body.length > 500 ? '...' : '')
      : undefined;

    return {
      Tag: release.tag_name,
      Name: release.name || release.tag_name,
      ReleaseDate: new Date(release.published_at),
      Prerelease: release.prerelease,
      DownloadUrl: downloadUrl,
      Notes: notesExcerpt,
    };
  }

  /**
   * Find the best ZIP download URL for a release.
   *
   * Looks for an uploaded asset with a `.zip` extension and `zip` content type.
   * If none is found, returns the GitHub-generated `zipball_url`.
   *
   * @param release - Raw GitHub Release response.
   * @returns Download URL for the release archive.
   */
  private findZipAsset(release: GitHubRelease): string {
    const zipAsset = release.assets.find(
      (a) => a.name.endsWith('.zip') && a.content_type.includes('zip')
    );
    if (zipAsset) {
      return zipAsset.browser_download_url;
    }
    return release.zipball_url;
  }

  // ---------------------------------------------------------------------------
  // Tag-based fallback (repos that only publish git tags)
  // ---------------------------------------------------------------------------

  /**
   * Fetch git tags and map them to {@link VersionInfo} objects.
   *
   * Used as a fallback when the repository has no formal GitHub Releases.
   * Fetches up to 30 tags and looks up commit dates for the most recent
   * {@link MAX_TAG_DATE_LOOKUPS} to minimize API usage.
   *
   * @returns Array of versions derived from git tags.
   * @throws Error on API failure.
   */
  private async fetchTagVersions(): Promise<VersionInfo[]> {
    const url = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/tags?per_page=30`;
    const response = await this.githubFetch(url);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const tags = (await response.json()) as GitHubTag[];
    const tagsToProcess = tags.slice(0, MAX_TAG_DATE_LOOKUPS);

    // Fetch commit dates in parallel for display in the version picker
    const versions = await Promise.all(
      tagsToProcess.map((tag) => this.mapTag(tag))
    );

    return versions;
  }

  /**
   * Look up a single tag by name and return its {@link VersionInfo}.
   *
   * Uses the Commits API (which accepts tag names as a ref) to get the
   * commit date, then constructs a zipball download URL.
   *
   * @param tagName - The git tag to look up (e.g., `"v5.1.0"`).
   * @returns Version info for the tag.
   * @throws Error if the tag does not exist.
   */
  private async fetchSingleTagVersion(tagName: string): Promise<VersionInfo> {
    // Use the commits API which accepts tag names as ref
    const commitUrl = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/commits/${tagName}`;
    const response = await this.githubFetch(commitUrl);

    if (!response.ok) {
      throw new Error(`Tag "${tagName}" not found (HTTP ${response.status}).`);
    }

    const commitData = (await response.json()) as GitHubCommitResponse;
    return {
      Tag: tagName,
      Name: tagName,
      ReleaseDate: new Date(commitData.commit.committer.date),
      Prerelease: false,
      DownloadUrl: `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/zipball/refs/tags/${tagName}`,
      Notes: undefined,
    };
  }

  /**
   * Convert a GitHub Tag API response into a {@link VersionInfo}.
   *
   * Fetches the commit date from the tag's commit URL to populate
   * the {@link VersionInfo.ReleaseDate} field.
   *
   * @param tag - Raw GitHub Tag response.
   * @returns Mapped {@link VersionInfo}.
   */
  private async mapTag(tag: GitHubTag): Promise<VersionInfo> {
    const commitDate = await this.fetchCommitDate(tag.commit.url);
    return {
      Tag: tag.name,
      Name: tag.name,
      ReleaseDate: commitDate,
      Prerelease: false,
      DownloadUrl: tag.zipball_url,
      Notes: undefined,
    };
  }

  /**
   * Fetch the committer date for a commit via the GitHub Commits API.
   *
   * Returns the current date as a fallback if the API call fails, to avoid
   * blocking the version listing over a single failed date lookup.
   *
   * @param commitUrl - Full API URL for the commit (provided by the Tags API).
   * @returns The commit date, or `new Date()` on failure.
   */
  private async fetchCommitDate(commitUrl: string): Promise<Date> {
    try {
      const response = await this.githubFetch(commitUrl);
      if (!response.ok) return new Date();
      const data = (await response.json()) as GitHubCommitResponse;
      return new Date(data.commit.committer.date);
    } catch {
      return new Date();
    }
  }

  // ---------------------------------------------------------------------------
  // Shared HTTP helper
  // ---------------------------------------------------------------------------

  /**
   * Make an authenticated-style GET request to the GitHub REST API.
   *
   * Sets the `Accept: application/vnd.github+json` header (recommended by GitHub)
   * and a `User-Agent` header (required by GitHub — requests without one are rejected).
   *
   * This uses the unauthenticated API, so the rate limit is 60 requests/hour/IP.
   * For installer use cases (a handful of calls per install), this is sufficient.
   *
   * @param url - Full GitHub API URL to fetch.
   * @returns The raw `Response` object (caller is responsible for checking `.ok`).
   */
  private async githubFetch(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'MJ-Installer',
      },
    });
  }
}
