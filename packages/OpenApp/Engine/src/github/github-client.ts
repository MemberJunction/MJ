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
 * Error thrown when GitHub returns 403/429 (rate limit or access denied). A 403/429 must NOT
 * look identical to "this repo has no releases/tags", which silently resolves the wrong version
 * (or falls back to HEAD). Callers should surface this rather than treat it as empty (B36).
 */
export class GitHubAccessError extends Error {
    public readonly Status: number;
    constructor(status: number, message: string) {
        super(message);
        this.name = 'GitHubAccessError';
        this.Status = status;
    }
}

/**
 * Rethrows an Octokit error as a {@link GitHubAccessError} when it is a 403/429 (rate limit or
 * access denied), so the condition is surfaced instead of being swallowed into an empty list (B36).
 * A no-op for every other error — the caller still decides what to do (e.g. return []).
 */
function ThrowIfRateLimitedOrForbidden(error: unknown, context: string): void {
    const status = OctokitStatus(error);
    if (status === 403 || status === 429) {
        throw new GitHubAccessError(
            status,
            `GitHub API returned ${status} (rate limit or access denied) while ${context}. ` +
            `This is NOT the same as "no versions found" — check your GitHub token and rate limit.`,
        );
    }
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
 * Paginated: a repo with more than one page of releases would otherwise be silently
 * truncated at 100, so an app whose stable release has fallen past that boundary would
 * resolve as having no releases at all.
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
        const octokit = CreateOctokit(repoUrl, options);
        const data = await octokit.paginate(octokit.repos.listReleases, { owner: parsed.Owner, repo: parsed.Repo, per_page: 100 });
        return data.map(r => ({
            TagName: r.tag_name,
            PreRelease: r.prerelease,
            Draft: r.draft,
            CreatedAt: r.created_at
        }));
    }
    catch (error: unknown) {
        // Surface a 403/429 (rate limit / access denied) instead of swallowing it into an empty
        // list, which would look identical to "no releases" and resolve the wrong version (B36).
        ThrowIfRateLimitedOrForbidden(error, 'listing releases');
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
        // GitHub returns releases newest-CREATED first, which is not newest-VERSION first: a patch
        // backported to an older line after a major ships is the most recent release but the lower
        // version, and `find` would offer it as the upgrade target. Order by semver precedence
        // instead — but ONLY across tag names that really are repo-wide versions. A scoped release
        // name (`@scope/pkg@1.3.0`) is not one; running the comparator over those reshuffles
        // meaningless values into a different meaningless answer, so they keep GitHub's own order.
        const stableReleases = releases.filter(r => !r.PreRelease && !r.Draft);
        const versioned = stableReleases.filter(r => IsPlainVersionTag(r.TagName));
        const stable = versioned.length > 0
            ? versioned.sort((a, b) => CompareSemver(b.TagName, a.TagName))[0]
            : stableReleases[0];
        if (stable) {
            return stable.TagName.replace(/^v/, '');
        }
    }

    const tags = await ListGitHubTags(repoUrl, options, subpath);
    if (tags.length > 0) {
        // Mirror the releases path's stable preference: never offer a prerelease as the latest
        // version an installed app should upgrade to, unless nothing stable is tagged at all.
        const stableTag = tags.find(t => !IsPrereleaseVersion(t));
        return (stableTag ?? tags[0]).replace(/^v/, '');
    }

    return null;
}

/**
 * Lists semver tags for a GitHub repository, sorted by version descending.
 * Only returns tags matching the `v{major}.{minor}.{patch}` pattern (optionally with a
 * prerelease suffix), or `<subpath>@{major}.{minor}.{patch}` in a multi-app repo.
 *
 * Paginated: GitHub returns tags in its own order (not semver order), so truncating at the
 * first 100 could hide the newest version entirely in a repo that tags many apps.
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
        const octokit = CreateOctokit(repoUrl, options);
        const data = await octokit.paginate(octokit.repos.listTags, { owner: parsed.Owner, repo: parsed.Repo, per_page: 100 });
        return data
            .map(t => t.name.match(pattern)?.[1])
            .filter((v): v is string => v != null)
            .sort((a, b) => CompareSemver(b, a));
    }
    catch (error: unknown) {
        // Surface a 403/429 (rate limit / access denied) instead of swallowing it into an empty
        // list, which would look identical to "no tags" and resolve the wrong version (B36).
        ThrowIfRateLimitedOrForbidden(error, 'listing tags');
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
 * Compares two semver version strings (with optional 'v' prefix) by semver precedence.
 * Returns negative if a < b, positive if a > b, zero if they have equal precedence.
 *
 * Prerelease-aware: `1.2.0-beta.1` sorts BELOW `1.2.0`. The prior implementation ran
 * `Number()` across the dot-split string, so any prerelease produced NaN
 * (`'1.2.0-beta.1'` → `[1, 2, NaN, 1]`); `NaN !== 0` is true, so the comparator returned
 * NaN and `Array.prototype.sort` ordering became implementation-defined — letting
 * {@link GetLatestVersion} report an arbitrary tag as the newest version.
 *
 * Build metadata (`+sha`) is ignored, per the semver spec.
 */
export function CompareSemver(a: string, b: string): number {
    const va = ParseSemver(a);
    const vb = ParseSemver(b);
    for (let i = 0; i < 3; i++) {
        const diff = va.Release[i] - vb.Release[i];
        if (diff !== 0) return diff;
    }
    return ComparePrerelease(va.Prerelease, vb.Prerelease);
}

/**
 * True when a tag name IS a repo-wide semver version (`1.2.3`, `v1.2.3-beta.1+sha`) rather than
 * something that merely contains one. A scoped release name such as
 * `@memberjunction/connector-wild-apricot@1.3.0` is not a repo-wide version, and comparing those
 * by semver precedence produces an ordering with no meaning — `ParseSemver` reads the `-` inside
 * `wild-apricot` as the prerelease delimiter.
 */
function IsPlainVersionTag(tagName: string): boolean {
    return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tagName);
}

/** True when a version string carries a prerelease suffix (e.g. `1.2.0-beta.1`). */
export function IsPrereleaseVersion(version: string): boolean {
    return ParseSemver(version).Prerelease.length > 0;
}

/** Splits a version into its numeric release triple and its dot-separated prerelease identifiers. */
function ParseSemver(version: string): { Release: [number, number, number]; Prerelease: string[] } {
    // Strip a leading 'v' and any build metadata, neither of which affects precedence.
    const core = version.replace(/^v/, '').split('+')[0];
    const dash = core.indexOf('-');
    const releasePart = dash === -1 ? core : core.slice(0, dash);
    const prereleasePart = dash === -1 ? '' : core.slice(dash + 1);

    // A non-numeric release segment coerces to 0 rather than NaN so the comparator stays total.
    const nums = releasePart.split('.').map((segment) => {
        const parsed = Number(segment);
        return Number.isFinite(parsed) ? parsed : 0;
    });

    return {
        Release: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0],
        Prerelease: prereleasePart.length > 0 ? prereleasePart.split('.') : []
    };
}

/**
 * Semver prerelease precedence: a version WITH a prerelease ranks below the same version
 * without one, and when both have prereleases the identifiers are compared left to right,
 * with a shorter identifier list ranking lower when all shared identifiers are equal.
 */
function ComparePrerelease(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 0;
    if (a.length === 0) return 1;   // 1.2.0 > 1.2.0-beta.1
    if (b.length === 0) return -1;  // 1.2.0-beta.1 < 1.2.0

    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) {
        const diff = ComparePrereleaseIdentifier(a[i], b[i]);
        if (diff !== 0) return diff;
    }
    return a.length - b.length;     // 1.2.0-beta < 1.2.0-beta.1
}

/** Numeric identifiers compare numerically and rank below alphanumeric ones, which compare ASCII-lexically. */
function ComparePrereleaseIdentifier(a: string, b: string): number {
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) - Number(b);
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
}
