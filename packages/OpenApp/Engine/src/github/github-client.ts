/**
 * GitHub client for fetching Open App manifests and migrations.
 *
 * Retrieves mj-app.json manifests, lists available releases, and downloads
 * migration/metadata files from GitHub repositories using the GitHub REST API
 * via Octokit (@octokit/rest). Everything runs IN-PROCESS — no `git`/`gh`
 * shell-outs — mirroring the Octokit usage in `@memberjunction/schema-engine`'s
 * RuntimeSchemaManager.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Octokit } from '@octokit/rest';

/**
 * Options for configuring the GitHub client.
 */
export interface GitHubClientOptions {
    /** Default personal access token for private repos */
    Token?: string;
    /**
     * Per-repository token overrides. Keys are GitHub repository URLs
     * (e.g., 'https://github.com/BlueCypress/SaaS'). When a function
     * receives a repo URL, it checks this map first before falling back
     * to the default Token.
     */
    TokenMap?: Record<string, string>;
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
 * Parses a GitHub repository URL into owner, repo, and an optional in-repo subpath.
 *
 * Supports two forms:
 *  - Single-app repo (the app's `mj-app.json` lives at the repo root):
 *    `https://github.com/acme/mj-crm` → `{ Owner: 'acme', Repo: 'mj-crm' }`
 *  - Multi-app repo (the app lives in a subdirectory — enables many apps per repo):
 *    `https://github.com/MemberJunction/Integrations/CRM/HubSpot`
 *    → `{ Owner: 'MemberJunction', Repo: 'Integrations', Subpath: 'CRM/HubSpot' }`
 *
 * `Subpath` is `undefined` for the single-app form, so existing callers that
 * only read `Owner`/`Repo` are unaffected (fully backwards compatible).
 *
 * @param repoUrl - GitHub URL, optionally with a trailing in-repo path
 * @returns Parsed owner, repo, and optional subpath, or null if invalid
 */
export function ParseGitHubUrl(repoUrl: string): { Owner: string; Repo: string; Subpath?: string } | null {
    // Capture owner, repo (stopping at the next slash / query / fragment), then any
    // remaining path segments as the subpath. No `$` anchor so query/fragment are tolerated.
    const match = repoUrl.match(/github\.com\/([^/?#]+)\/([^/?#]+)((?:\/[^?#]+)*)/);
    if (!match) {
        return null;
    }
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');
    const rawSubpath = (match[3] ?? '').replace(/^\/+|\/+$/g, '');
    const subpath = rawSubpath.length > 0 ? rawSubpath : undefined;
    return { Owner: owner, Repo: repo, Subpath: subpath };
}

/**
 * Resolves the appropriate token for a given repository URL.
 * Checks the TokenMap first (matching by normalized URL), then falls back to the default Token.
 */
function ResolveToken(repoUrl: string, options: GitHubClientOptions): string | undefined {
    if (options.TokenMap) {
        const normalized = normalizeRepoUrl(repoUrl);
        for (const [mapUrl, mapToken] of Object.entries(options.TokenMap)) {
            if (normalizeRepoUrl(mapUrl) === normalized) {
                return mapToken;
            }
        }
    }
    return options.Token;
}

/**
 * Normalizes a GitHub repo URL for comparison: strips trailing .git, trailing slash,
 * and lowercases for case-insensitive matching.
 */
function normalizeRepoUrl(url: string): string {
    return url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
}

/**
 * Creates an in-process Octokit client for a given repo URL, resolving the
 * appropriate token from the client options.
 */
function CreateOctokit(repoUrl: string, options: GitHubClientOptions): Octokit {
    return new Octokit({ auth: ResolveToken(repoUrl, options), userAgent: 'open-app-engine' });
}

/**
 * Extracts the HTTP status from an Octokit error (RequestError), if present.
 */
function OctokitStatus(error: unknown): number | undefined {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status?: unknown }).status;
        return typeof status === 'number' ? status : undefined;
    }
    return undefined;
}

/**
 * Reads the UTF-8 content of a single repo FILE via Octokit. Handles GitHub's
 * 1MB inline-content cap by falling back to the Git Blob API for larger files.
 * Throws on directories or a non-file response.
 */
async function FetchFileContent(octokit: Octokit, owner: string, repo: string, path: string, ref: string): Promise<string> {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`Expected a file at ${path}, but got a ${Array.isArray(data) ? 'directory' : data.type}`);
    }
    // Files <1MB carry inline base64 content; larger files come back with empty
    // content and must be read through the Git Blob API by SHA.
    if (data.content && data.content.length > 0) {
        return Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf-8').toString('utf-8');
    }
    const blob = await octokit.git.getBlob({ owner, repo, file_sha: data.sha });
    return Buffer.from(blob.data.content, blob.data.encoding === 'base64' ? 'base64' : 'utf-8').toString('utf-8');
}

/**
 * A directory entry returned by the GitHub Contents API.
 */
interface RepoContentEntry {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'submodule' | 'symlink';
    sha: string;
}

/**
 * Lists the entries of a repo DIRECTORY via Octokit. Throws if the path is a file.
 */
async function ListDirectory(octokit: Octokit, owner: string, repo: string, path: string, ref: string): Promise<RepoContentEntry[]> {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    if (!Array.isArray(data)) {
        throw new Error(`Expected a directory at ${path}, but got a ${data.type}`);
    }
    return data.map(item => ({ name: item.name, path: item.path, type: item.type, sha: item.sha }));
}

/**
 * The git-tag namespace for a multi-app (subpath) app: the in-repo subpath with slashes
 * flattened to hyphens (`CRM/HubSpot` → `CRM-HubSpot`), so each app in a monorepo has its
 * own independent tag line (`CRM-HubSpot@1.2.0`). undefined for single-app repos (repo-wide `vX.Y.Z`).
 */
function ScopedTagPrefix(subpath: string | undefined): string | undefined {
    const s = subpath?.replace(/^\/+|\/+$/g, '');
    return s ? s.replace(/\//g, '-') : undefined;
}

/**
 * Resolves the git ref to fetch at. With no version → 'HEAD'. With a version:
 * a subpath app uses its scoped tag `<prefix>@<version>`; a single-app repo uses `v<version>`.
 */
function ResolveRef(version: string | undefined, subpath?: string): string {
    if (!version) return 'HEAD';
    const v = version.replace(/^v/, '');
    const prefix = ScopedTagPrefix(subpath);
    return prefix ? `${prefix}@${v}` : `v${v}`;
}

/**
 * Composes the effective in-repo path from an optional app subpath and a relative
 * path, trimming stray slashes.
 */
function ComposeRepoPath(effectiveSubpath: string | undefined, relativePath: string): string {
    return [effectiveSubpath, relativePath.replace(/^\/|\/$/g, '')].filter(Boolean).join('/');
}

/**
 * Fetches the mj-app.json manifest from a GitHub repository at a specific tag.
 *
 * @param repoUrl - GitHub repository URL (may include an in-repo subpath for multi-app repos)
 * @param version - Tag/version to fetch (e.g., 'v1.2.0'). If not provided, fetches from default branch.
 * @param options - GitHub client options (auth token, etc.)
 * @param subpath - Optional in-repo directory the app lives under. When omitted, falls back
 *                  to any subpath embedded in `repoUrl`. Empty/undefined → manifest at repo root.
 * @returns The raw manifest JSON string or error details
 */
export async function FetchManifestFromGitHub(
    repoUrl: string,
    version: string | undefined,
    options: GitHubClientOptions,
    subpath?: string
): Promise<ManifestFetchResult> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return { Success: false, ErrorMessage: `Invalid GitHub URL: ${repoUrl}` };
    }

    const effectiveSubpath = (subpath ?? parsed.Subpath)?.replace(/^\/+|\/+$/g, '');
    const ref = ResolveRef(version, effectiveSubpath);
    const manifestPath = ComposeRepoPath(effectiveSubpath, 'mj-app.json');

    try {
        const content = await FetchFileContent(CreateOctokit(repoUrl, options), parsed.Owner, parsed.Repo, manifestPath, ref);
        return { Success: true, ManifestJSON: content };
    }
    catch (error: unknown) {
        if (OctokitStatus(error) === 404) {
            return { Success: false, ErrorMessage: `${manifestPath} not found in ${parsed.Owner}/${parsed.Repo} at ref ${ref}` };
        }
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

    try {
        const { data } = await CreateOctokit(repoUrl, options).repos.listReleases({ owner: parsed.Owner, repo: parsed.Repo, per_page: 100 });
        return data.map(r => ({
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
 * @param repoUrl - GitHub repository URL (may include an in-repo subpath for multi-app repos)
 * @param version - Tag/version to download from
 * @param migrationsPath - Path within the repo (or app subpath) to the migrations directory (e.g., 'migrations/')
 * @param localDir - Local directory to save the files to
 * @param options - GitHub client options
 * @param subpath - Optional in-repo directory the app lives under. When set, the migrations
 *                  directory is resolved relative to it (`<subpath>/<migrationsPath>`).
 * @returns Download result with file list or error details
 */
export async function DownloadMigrations(
    repoUrl: string,
    version: string | undefined,
    migrationsPath: string,
    localDir: string,
    options: GitHubClientOptions,
    subpath?: string
): Promise<MigrationDownloadResult> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return { Success: false, ErrorMessage: `Invalid GitHub URL: ${repoUrl}` };
    }

    const effectiveSubpath = (subpath ?? parsed.Subpath)?.replace(/^\/+|\/+$/g, '');
    const ref = ResolveRef(version, effectiveSubpath);
    const cleanPath = ComposeRepoPath(effectiveSubpath, migrationsPath);
    const octokit = CreateOctokit(repoUrl, options);

    try {
        const items = await ListDirectory(octokit, parsed.Owner, parsed.Repo, cleanPath, ref);
        const sqlFiles = items.filter(item => item.type === 'file' && item.name.endsWith('.sql'));
        if (sqlFiles.length === 0) {
            return { Success: true, LocalPath: localDir, Files: [] };
        }

        if (!existsSync(localDir)) {
            mkdirSync(localDir, { recursive: true });
        }

        const downloadedFiles: string[] = [];
        for (const file of sqlFiles) {
            const content = await FetchFileContent(octokit, parsed.Owner, parsed.Repo, file.path, ref);
            writeFileSync(join(localDir, file.name), content, 'utf-8');
            downloadedFiles.push(file.name);
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
 * Falls back to listing tags if no GitHub Releases exist (common for repos
 * that only push semver tags without creating formal releases).
 *
 * @param repoUrl - GitHub repository URL
 * @param options - GitHub client options
 * @returns The latest non-prerelease version string, or null if none found
 */
export async function GetLatestVersion(
    repoUrl: string,
    options: GitHubClientOptions,
    subpath?: string
): Promise<string | null> {
    // For a multi-app (subpath) app, versions live in per-connector scoped tags, not repo-wide
    // releases — go straight to the scoped tag line.
    if (!ScopedTagPrefix(subpath ?? ParseGitHubUrl(repoUrl)?.Subpath)) {
        const releases = await ListGitHubReleases(repoUrl, options);
        const stable = releases.find(r => !r.PreRelease && !r.Draft);
        if (stable) {
            return stable.TagName.replace(/^v/, '');
        }
    }

    const tags = await ListGitHubTags(repoUrl, options, subpath);
    if (tags.length > 0) {
        return tags[0].replace(/^v/, '');
    }

    return null;
}

/**
 * Lists semver tags for a GitHub repository, sorted by version descending.
 * Only returns tags matching the `v{major}.{minor}.{patch}` pattern.
 *
 * @param repoUrl - GitHub repository URL
 * @param options - GitHub client options
 * @returns Sorted tag names (e.g., ['v1.0.7', 'v1.0.6', ...])
 */
export async function ListGitHubTags(
    repoUrl: string,
    options: GitHubClientOptions,
    subpath?: string
): Promise<string[]> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return [];
    }

    const prefix = ScopedTagPrefix(subpath ?? parsed.Subpath);
    const semver = '\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9]+(\\.[a-zA-Z0-9]+)*)?';
    // Multi-app repo: match this connector's scoped tags `<prefix>@<semver>` and return the versions.
    // Single-app repo: match repo-wide `v<semver>` tags as before.
    const pattern = prefix
        ? new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@(${semver})$`)
        : new RegExp(`^(v?${semver})$`);

    try {
        const { data } = await CreateOctokit(repoUrl, options).repos.listTags({ owner: parsed.Owner, repo: parsed.Repo, per_page: 100 });
        return data
            .map(t => t.name.match(pattern)?.[1])
            .filter((v): v is string => v != null)
            .sort((a, b) => compareSemver(b, a));
    }
    catch {
        return [];
    }
}

/**
 * Validates that a specific version tag exists in a GitHub repository.
 *
 * @param repoUrl - GitHub repository URL
 * @param version - Version to check (e.g., '1.0.7' — will be normalized to 'v1.0.7')
 * @param options - GitHub client options
 * @returns Whether the tag exists, with an error message if not
 */
export async function ValidateGitHubTag(
    repoUrl: string,
    version: string,
    options: GitHubClientOptions,
    subpath?: string
): Promise<{ Exists: boolean; ErrorMessage?: string }> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return { Exists: false, ErrorMessage: `Invalid GitHub URL: ${repoUrl}` };
    }

    // Multi-app repo: scoped tag `<prefix>@<version>`; single-app repo: `v<version>`.
    const tag = ResolveRef(version, subpath ?? parsed.Subpath);

    try {
        await CreateOctokit(repoUrl, options).git.getRef({ owner: parsed.Owner, repo: parsed.Repo, ref: `tags/${tag}` });
        return { Exists: true };
    }
    catch (error: unknown) {
        if (OctokitStatus(error) === 404) {
            return { Exists: false, ErrorMessage: `Tag '${tag}' not found in ${parsed.Owner}/${parsed.Repo}. Available versions can be checked at ${repoUrl}/tags` };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { Exists: false, ErrorMessage: `Failed to validate tag '${tag}': ${message}` };
    }
}

/**
 * Compares two semver version strings (with optional 'v' prefix).
 * Returns negative if a < b, positive if a > b, zero if equal.
 */
function compareSemver(a: string, b: string): number {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}
