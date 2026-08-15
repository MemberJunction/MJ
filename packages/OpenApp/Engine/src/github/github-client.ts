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
// Already a dependency of this package (package.json) and already used by
// install/install-orchestrator.ts. Version parsing, precedence and prerelease detection all come
// from here rather than being hand-rolled, so the next semver edge case is the library's problem.
import semver from 'semver';

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
        // Memoized on the same (repo, token) key and TTL as the tag path. Pagination is required for
        // correctness — truncating at 100 hid the newest version entirely — but it made every call
        // cost one request per page, and both GetLatestVersion and ResolveVersionRange call this. A
        // page cap instead would reintroduce exactly the silent truncation the pagination removed.
        return await MemoizedFetch(releaseListCache, FetchCacheKey(repoUrl, parsed, options), async () => {
            const octokit = CreateOctokit(repoUrl, options);
            const data = await octokit.paginate(octokit.repos.listReleases, { owner: parsed.Owner, repo: parsed.Repo, per_page: 100 });
            return data.map(r => ({
                TagName: r.tag_name,
                PreRelease: r.prerelease,
                Draft: r.draft,
                CreatedAt: r.created_at
            }));
        });
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
        // meaningless values into a different meaningless answer.
        //
        // When NOTHING here is a repo-wide version, this path has no answer to give and must say
        // so. Returning the first scoped release instead hands back a string that is not a version
        // at all (`@memberjunction/connector-nimble-ams@1.3.2`), which can never equal the app's
        // installed version — so it reads as a permanent "update available" pointing at a target
        // `mj app upgrade` would then act on. Falling through to the tag path is the honest
        // outcome: for a repo-wide app that path matches only `v?<semver>` tags and correctly
        // resolves to null when a repo tags nothing repo-wide.
        // Normalize to the semver CORE, not the tag text. Returning the tag verbatim let build
        // metadata through (`v1.2.3+build.7` → `'1.2.3+build.7'`), which can never equal an installed
        // `1.2.3` and so reads as a permanent "update available".
        //
        // Prereleases are excluded by the version STRING, not only by GitHub's `prerelease` flag. The
        // flag is a checkbox a maintainer can forget: tag `v2.1.0-rc.1`, leave the box unticked, and
        // a release-guarded-by-boolean path offers a release candidate as the upgrade target for an
        // installed app — the exact outcome this stable preference exists to prevent. Guarding on both
        // also makes the two paths below agree, which they previously did not.
        const versioned = releases
            .filter(r => !r.PreRelease && !r.Draft)
            .map(r => SemverCore(r.TagName))
            .filter((v): v is string => v !== null);
        const stable = versioned.filter(v => semver.prerelease(v) === null);
        const candidates = stable.length > 0 ? stable : versioned;
        if (candidates.length > 0) {
            return candidates.sort(semver.rcompare)[0];
        }
    }

    const tags = await ListGitHubTags(repoUrl, options, subpath);
    if (tags.length > 0) {
        // Same stable preference as the releases path above: never offer a prerelease as the version
        // an installed app should upgrade to, unless nothing stable is tagged at all.
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
    // Named to avoid shadowing the imported `semver` library below. Kept as a regex rather than
    // delegating to `semver.valid` because this also has to LOCATE the version inside a scoped tag
    // (`<prefix>@1.2.3`); `SemverCore` then normalizes whatever it captures.
    const SEMVER_PATTERN = '\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9]+(\\.[a-zA-Z0-9]+)*)?';
    // Multi-app repo: match this connector's scoped tags `<prefix>@<semver>` and return the versions.
    // Single-app repo: match repo-wide `v<semver>` tags as before.
    const pattern = prefix
        ? new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@(${SEMVER_PATTERN})$`)
        : new RegExp(`^(v?${SEMVER_PATTERN})$`);

    try {
        // Returns the matched TAG TEXT (`v1.0.7`), unchanged from before — callers and
        // `ValidateGitHubTag` rely on that shape. Only the ORDER changes: sorting goes through the
        // normalized core, because `semver.rcompare` throws on anything it cannot parse. Tags whose
        // core will not parse are dropped rather than left to poison the sort, which is what the old
        // NaN-returning comparator did.
        return (await FetchRepoTagNames(repoUrl, parsed, options))
            .map(name => name.match(pattern)?.[1])
            .filter((v): v is string => v != null)
            .map(tag => ({ Tag: tag, Core: SemverCore(tag) }))
            .filter((t): t is { Tag: string; Core: string } => t.Core !== null)
            .sort((a, b) => semver.rcompare(a.Core, b.Core))
            .map(t => t.Tag);
    }
    catch (error: unknown) {
        // Surface a 403/429 (rate limit / access denied) instead of swallowing it into an empty
        // list, which would look identical to "no tags" and resolve the wrong version (B36).
        ThrowIfRateLimitedOrForbidden(error, 'listing tags');
        return [];
    }
}

/**
 * How long a fetched tag list stays reusable. Deliberately short: this exists to collapse the
 * redundant fetches inside ONE sweep, not to act as a durable cache. A newly pushed tag becomes
 * visible within this window, so a long-lived process cannot pin a stale answer.
 */
const TAG_CACHE_TTL_MS = 60_000;

/** One memoized paginated fetch: the in-flight promise plus when it stops being reusable. */
type FetchCacheEntry<T> = { ExpiresAt: number; Value: Promise<T> };

/**
 * Cached tag-name fetches, keyed by repository AND resolved token.
 *
 * Holds the IN-FLIGHT PROMISE, not the settled array. Caching the resolved value only collapses
 * requests for a caller that awaits between apps: `mj app check-updates` happens to be a sequential
 * `for…of`, so it saw the full benefit, but a `Promise.all` sweep starts every fetch before any has
 * resolved and got no benefit at all — measured as 18 HTTP calls against 2. That left the saving
 * contingent on a loop shape in a package this one does not own, with no test that would fail if it
 * changed. Sharing the promise makes it hold either way.
 */
const tagListCache = new Map<string, FetchCacheEntry<string[]>>();

/**
 * Cached release fetches, same keying and lifetime as {@link tagListCache}.
 *
 * `ListGitHubReleases` is fully paginated, so without this a single-app repo with 2,000 releases
 * costs 20 sequential requests on EVERY `GetLatestVersion` call — against an unauthenticated budget
 * of 60/hour. `ResolveVersionRange` calls it too, once per version-range resolution. Pagination
 * fixed the correctness problem (silent truncation at 100) and created this cost one; memoizing is
 * the other half. Capping pages instead would reintroduce the truncation the pagination removed.
 */
const releaseListCache = new Map<string, FetchCacheEntry<GitHubRelease[]>>();

/**
 * Upper bound on distinct (repo, token) pairs held per cache.
 *
 * The caches are only swept on write, so without a bound they grow for the life of the process —
 * and each key embeds a token, which is not something to retain indefinitely. Generous relative to
 * any real sweep (an install set is single- or low-double-digit apps), so eviction is a backstop
 * rather than something a normal run reaches.
 */
const FETCH_CACHE_MAX_ENTRIES = 64;

/**
 * Drops every cached tag AND release list. Exported for tests and for any caller that has just
 * pushed a tag or published a release and needs the next lookup to reflect it immediately.
 *
 * Named for tags because that is what it originally cleared; it clears both, because a "clear" that
 * left stale releases behind would be a trap.
 */
export function ClearGitHubTagCache(): void {
    tagListCache.clear();
    releaseListCache.clear();
}

/**
 * Returns the cached fetch for `cacheKey`, or starts one and caches it.
 *
 * Shared by the tag and release paths so the promise-sharing, rejection handling and eviction rules
 * cannot drift apart between them.
 *
 * @returns A COPY of the resolved array — the cached promise is shared by every joiner, so handing
 *   back the same array would let one caller's in-place sort corrupt what the others see.
 */
async function MemoizedFetch<T>(
    cache: Map<string, FetchCacheEntry<T[]>>,
    cacheKey: string,
    fetcher: () => Promise<T[]>
): Promise<T[]> {
    const now = Date.now();

    const cached = cache.get(cacheKey);
    if (cached && cached.ExpiresAt > now) {
        return [...(await cached.Value)];
    }

    // Evict expired entries, then the oldest, until within the bound. Map iterates in insertion
    // order, so the first keys are the oldest.
    for (const [key, entry] of cache) {
        if (entry.ExpiresAt <= now) cache.delete(key);
    }
    while (cache.size >= FETCH_CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        cache.delete(oldest.value);
    }

    const inFlight = fetcher();
    // Published BEFORE anything awaits it, so concurrent callers join this fetch instead of each
    // starting their own. A rejection is deleted rather than left to be replayed for the rest of the
    // TTL: a rate-limited or forbidden call must still surface through
    // ThrowIfRateLimitedOrForbidden on the next attempt.
    cache.set(cacheKey, { ExpiresAt: now + TAG_CACHE_TTL_MS, Value: inFlight });
    inFlight.catch(() => { cache.delete(cacheKey); });

    return [...(await inFlight)];
}

/** The full identity of a fetch: the repository plus the token it would be made with. */
function FetchCacheKey(repoUrl: string, parsed: { Owner: string; Repo: string }, options: GitHubClientOptions): string {
    // NUL as the delimiter: it cannot appear in an owner, a repo name or a token, so the two halves
    // can never be confused for one another. Written as the ESCAPE rather than a literal byte — a raw
    // NUL in the source makes the whole file read as binary to grep, `file`, code search and diff
    // viewers, which hides it from exactly the tools a reviewer uses.
    return `${parsed.Owner}/${parsed.Repo}\u0000${ResolveToken(repoUrl, options) ?? ''}`;
}

/**
 * Fetches every page of a repository's tag names, reusing a recent result for the same repository.
 *
 * The filtering above is per-app (each app matches its own `<prefix>@<semver>` line) but the fetch
 * is per-REPOSITORY, so a sweep like `mj app check-updates` over several apps that share one repo
 * was paying for the full paginated walk once per app. Against `MemberJunction/Integrations` — 9
 * installed apps, 4 pages of tags — that measured 36 HTTP requests where 4 suffice, and the cost
 * grows with the repo's tag count on every release.
 *
 * The key includes the RESOLVED token, not just the repository: a list fetched with a token that
 * can see a private repository must never be served to a caller who did not supply that token.
 * Only successful fetches are stored, so a rate-limited or forbidden call is never cached and
 * still surfaces through {@link ThrowIfRateLimitedOrForbidden} on the next attempt.
 */
async function FetchRepoTagNames(
    repoUrl: string,
    parsed: { Owner: string; Repo: string },
    options: GitHubClientOptions
): Promise<string[]> {
    return MemoizedFetch(tagListCache, FetchCacheKey(repoUrl, parsed, options), async () => {
        const octokit = CreateOctokit(repoUrl, options);
        const data = await octokit.paginate(octokit.repos.listTags, { owner: parsed.Owner, repo: parsed.Repo, per_page: 100 });
        return data.map(t => t.name);
    });
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
 * The semver core of a tag name, or `null` when the tag is not itself a version.
 *
 * This is the single normalization point for every version string this module returns or sorts, and
 * it is deliberately `semver.valid` rather than a local regex:
 *
 *  - It strips a leading `v` AND build metadata, returning the canonical core. That matters: a
 *    release tagged `v1.2.3+build.7` used to come back verbatim, and `'1.2.3+build.7'` can never
 *    equal an installed `1.2.3`, so it read as a permanent "update available" pointing at a target
 *    `mj app upgrade` would then act on.
 *  - It rejects anything that merely CONTAINS a version. A scoped release name such as
 *    `@memberjunction/connector-wild-apricot@1.3.0` is not a repo-wide version, and ordering those
 *    by semver precedence produces an ordering with no meaning (the `-` inside `wild-apricot` reads
 *    as a prerelease delimiter).
 *
 * `semver` is already a dependency of this package and already imported by
 * `install/install-orchestrator.ts`, which uses this same `valid()`-filter-then-compare shape.
 */
function SemverCore(tagName: string): string | null {
    return semver.valid(tagName, { loose: false }) ?? semver.valid(tagName.replace(/^v/, ''));
}

/**
 * True when a version string carries a prerelease suffix (e.g. `1.2.0-beta.1`).
 *
 * Total by construction: an unparseable string has no prerelease, so it is not one. `semver.compare`
 * throws on invalid input, which is why every sort in this module filters through {@link SemverCore}
 * first rather than relying on the comparator to be forgiving.
 */
export function IsPrereleaseVersion(version: string): boolean {
    const core = SemverCore(version);
    return core !== null && semver.prerelease(core) !== null;
}
