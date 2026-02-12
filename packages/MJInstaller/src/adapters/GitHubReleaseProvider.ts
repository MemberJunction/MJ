/**
 * Adapter for listing and downloading MemberJunction releases from GitHub.
 *
 * Uses the unauthenticated GitHub REST API (60 requests/hour rate limit,
 * which is plenty for installer use).
 */

import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { VersionInfo } from '../models/VersionInfo.js';

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'MemberJunction';
const REPO_NAME = 'MJ';

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

export class GitHubReleaseProvider {
  private owner: string;
  private repo: string;

  constructor(owner: string = REPO_OWNER, repo: string = REPO_NAME) {
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * List all releases, most recent first.
   */
  async ListReleases(includePrerelease: boolean = false): Promise<VersionInfo[]> {
    const url = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/releases?per_page=50`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'MJ-Installer',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const releases = (await response.json()) as GitHubRelease[];

    const versions: VersionInfo[] = [];
    for (const release of releases) {
      if (!includePrerelease && release.prerelease) {
        continue;
      }

      versions.push(this.mapRelease(release));
    }

    return versions;
  }

  /**
   * Get a specific release by tag.
   */
  async GetReleaseByTag(tag: string): Promise<VersionInfo> {
    const url = `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/releases/tags/${tag}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'MJ-Installer',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Release tag "${tag}" not found. Use ListReleases() to see available versions.`);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const release = (await response.json()) as GitHubRelease;
    return this.mapRelease(release);
  }

  /**
   * Download a release ZIP to a local file path.
   * Calls onProgress with percentage (0–100) during download.
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
   * Find the best ZIP asset for download.
   * Prefers an explicit ZIP asset; falls back to the GitHub-generated zipball.
   */
  private findZipAsset(release: GitHubRelease): string {
    // Look for an explicit ZIP asset first
    const zipAsset = release.assets.find(
      (a) => a.name.endsWith('.zip') && a.content_type.includes('zip')
    );
    if (zipAsset) {
      return zipAsset.browser_download_url;
    }

    // Fall back to GitHub's auto-generated source zipball
    return release.zipball_url;
  }
}
