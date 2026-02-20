/**
 * Adapter for listing and downloading MemberJunction releases from GitHub.
 *
 * Uses the unauthenticated GitHub REST API (60 requests/hour rate limit,
 * which is plenty for installer use).
 *
 * Supports two release strategies:
 * 1. Formal GitHub Releases (preferred — includes release notes and assets)
 * 2. Git tags fallback (for repos that only publish version tags)
 */

import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { VersionInfo } from '../models/VersionInfo.js';

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'MemberJunction';
const REPO_NAME = 'MJ';

/** Maximum tags to fetch commit dates for (keeps API usage reasonable) */
const MAX_TAG_DATE_LOOKUPS = 20;

// ---------------------------------------------------------------------------
// GitHub API response shapes
// ---------------------------------------------------------------------------

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  body: string;
  assets: GitHubAsset[];
  zipball_url: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GitHubTag {
  name: string;
  zipball_url: string;
  commit: {
    sha: string;
    url: string;
  };
}

interface GitHubCommitResponse {
  commit: {
    committer: {
      date: string;
    };
  };
}

export class GitHubReleaseProvider {
  private owner: string;
  private repo: string;

  constructor(owner: string = REPO_OWNER, repo: string = REPO_NAME) {
    this.owner = owner;
    this.repo = repo;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * List available versions, most recent first.
   * Tries formal GitHub Releases first; falls back to git tags.
   */
  async ListReleases(includePrerelease: boolean = false): Promise<VersionInfo[]> {
    const releases = await this.fetchFormalReleases(includePrerelease);
    if (releases.length > 0) {
      return releases;
    }

    return this.fetchTagVersions();
  }

  /**
   * Get a specific version by tag name.
   * Tries formal GitHub Releases first; falls back to git tags.
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
   * Download a release ZIP to a local file path.
   * Calls onProgress with percentage (0-100) during download.
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

  private async githubFetch(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'MJ-Installer',
      },
    });
  }
}
