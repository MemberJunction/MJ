/**
 * GitHub client for fetching Open App manifests and migrations.
 *
 * Retrieves mj-app.json manifests, lists available releases, and downloads
 * migration files from GitHub repositories using the GitHub REST API.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Options for configuring the GitHub client.
 */
export interface GitHubClientOptions {
    /** Personal access token for private repos */
    Token?: string;
}

/**
 * Represents a GitHub release / tag.
 */
export interface GitHubRelease {
    /** Tag name (e.g., 'v1.2.0') */
    TagName: string;
    /** Whether this is a pre-release */
    PreRelease: boolean;
    /** Whether this is a draft */
    Draft: boolean;
    /** Release creation date */
    CreatedAt: string;
}

/**
 * Result of fetching a manifest from GitHub.
 */
export interface ManifestFetchResult {
    /** Whether the fetch succeeded */
    Success: boolean;
    /** The raw manifest JSON string (if successful) */
    ManifestJSON?: string;
    /** Error message if the fetch failed */
    ErrorMessage?: string;
}

/**
 * Result of downloading migrations from GitHub.
 */
export interface MigrationDownloadResult {
    /** Whether the download succeeded */
    Success: boolean;
    /** Local path where migrations were saved */
    LocalPath?: string;
    /** List of migration file names downloaded */
    Files?: string[];
    /** Error message if the download failed */
    ErrorMessage?: string;
}

/**
 * Parses a GitHub repository URL into owner and repo components.
 *
 * @param repoUrl - GitHub URL (e.g., 'https://github.com/acme/mj-crm')
 * @returns Parsed owner and repo, or null if invalid
 */
export function ParseGitHubUrl(repoUrl: string): { Owner: string; Repo: string } | null {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) {
        return null;
    }
    return { Owner: match[1], Repo: match[2] };
}

/**
 * Builds the authorization headers for GitHub API requests.
 */
function BuildHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'mj-open-app-engine'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

/**
 * Fetches the mj-app.json manifest from a GitHub repository at a specific tag.
 *
 * @param repoUrl - GitHub repository URL
 * @param version - Tag/version to fetch (e.g., 'v1.2.0'). If not provided, fetches from default branch.
 * @param options - GitHub client options (auth token, etc.)
 * @returns The raw manifest JSON string or error details
 */
export async function FetchManifestFromGitHub(
    repoUrl: string,
    version: string | undefined,
    options: GitHubClientOptions
): Promise<ManifestFetchResult> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return { Success: false, ErrorMessage: `Invalid GitHub URL: ${repoUrl}` };
    }

    const ref = version ? `v${version.replace(/^v/, '')}` : 'HEAD';
    const apiUrl = `https://api.github.com/repos/${parsed.Owner}/${parsed.Repo}/contents/mj-app.json?ref=${ref}`;

    try {
        const response = await fetch(apiUrl, {
            headers: BuildHeaders(options.Token)
        });

        if (!response.ok) {
            if (response.status === 404) {
                return { Success: false, ErrorMessage: `mj-app.json not found in ${parsed.Owner}/${parsed.Repo} at ref ${ref}` };
            }
            return { Success: false, ErrorMessage: `GitHub API error: ${response.status} ${response.statusText}` };
        }

        const data = await response.json() as { content?: string; encoding?: string };
        if (!data.content || data.encoding !== 'base64') {
            return { Success: false, ErrorMessage: 'Unexpected response format from GitHub API' };
        }

        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        return { Success: true, ManifestJSON: decoded };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to fetch manifest: ${message}` };
    }
}

/**
 * Lists available releases for a GitHub repository.
 *
 * @param repoUrl - GitHub repository URL
 * @param options - GitHub client options
 * @returns List of releases sorted by creation date (newest first)
 */
export async function ListGitHubReleases(
    repoUrl: string,
    options: GitHubClientOptions
): Promise<GitHubRelease[]> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return [];
    }

    const apiUrl = `https://api.github.com/repos/${parsed.Owner}/${parsed.Repo}/releases`;

    try {
        const response = await fetch(apiUrl, {
            headers: BuildHeaders(options.Token)
        });

        if (!response.ok) {
            return [];
        }

        const releases = await response.json() as Array<{
            tag_name: string;
            prerelease: boolean;
            draft: boolean;
            created_at: string;
        }>;

        return releases.map(r => ({
            TagName: r.tag_name,
            PreRelease: r.prerelease,
            Draft: r.draft,
            CreatedAt: r.created_at
        }));
    }
    catch {
        return [];
    }
}

/**
 * Downloads migration files from a GitHub repository to a local temp directory.
 *
 * @param repoUrl - GitHub repository URL
 * @param version - Tag/version to download from
 * @param migrationsPath - Path within the repo to the migrations directory (e.g., 'migrations/')
 * @param localDir - Local directory to save the files to
 * @param options - GitHub client options
 * @returns Download result with file list or error details
 */
export async function DownloadMigrations(
    repoUrl: string,
    version: string | undefined,
    migrationsPath: string,
    localDir: string,
    options: GitHubClientOptions
): Promise<MigrationDownloadResult> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return { Success: false, ErrorMessage: `Invalid GitHub URL: ${repoUrl}` };
    }

    const ref = version ? `v${version.replace(/^v/, '')}` : 'HEAD';
    const cleanPath = migrationsPath.replace(/^\/|\/$/g, '');
    const apiUrl = `https://api.github.com/repos/${parsed.Owner}/${parsed.Repo}/contents/${cleanPath}?ref=${ref}`;

    try {
        const response = await fetch(apiUrl, {
            headers: BuildHeaders(options.Token)
        });

        if (!response.ok) {
            return { Success: false, ErrorMessage: `Failed to list migrations: ${response.status} ${response.statusText}` };
        }

        const items = await response.json() as Array<{
            name: string;
            type: string;
            download_url: string | null;
        }>;

        const sqlFiles = items.filter(item => item.type === 'file' && item.name.endsWith('.sql'));
        if (sqlFiles.length === 0) {
            return { Success: true, LocalPath: localDir, Files: [] };
        }

        if (!existsSync(localDir)) {
            mkdirSync(localDir, { recursive: true });
        }

        const downloadedFiles: string[] = [];

        for (const file of sqlFiles) {
            if (!file.download_url) {
                continue;
            }

            const fileResponse = await fetch(file.download_url, {
                headers: BuildHeaders(options.Token)
            });

            if (fileResponse.ok) {
                const content = await fileResponse.text();
                const localPath = join(localDir, file.name);
                writeFileSync(localPath, content, 'utf-8');
                downloadedFiles.push(file.name);
            }
        }

        return { Success: true, LocalPath: localDir, Files: downloadedFiles };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { Success: false, ErrorMessage: `Failed to download migrations: ${message}` };
    }
}

/**
 * Fetches the latest release version for a repository.
 *
 * @param repoUrl - GitHub repository URL
 * @param options - GitHub client options
 * @returns The latest non-prerelease version string, or null if none found
 */
export async function GetLatestVersion(
    repoUrl: string,
    options: GitHubClientOptions
): Promise<string | null> {
    const releases = await ListGitHubReleases(repoUrl, options);
    const stable = releases.find(r => !r.PreRelease && !r.Draft);
    if (!stable) {
        return null;
    }
    return stable.TagName.replace(/^v/, '');
}
