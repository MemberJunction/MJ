/**
 * GitHub client for fetching Open App manifests and migrations.
 *
 * Retrieves mj-app.json manifests, lists available releases, and downloads
 * migration/metadata files from GitHub repositories. Everything runs IN-PROCESS — no `git`/`gh`
 * shell-outs — mirroring the Octokit usage in `@memberjunction/schema-engine`'s RuntimeSchemaManager.
 *
 * Two hosts, two budgets. Repository METADATA — releases, tags, refs, directory trees — comes from the
 * GitHub REST API via Octokit (@octokit/rest). File CONTENTS — manifests and migration `.sql` files —
 * come from raw.githubusercontent.com, which does not count against the REST allowance. Without a
 * token GitHub allows 60 REST requests per hour, and reading every file through the Contents API cost
 * one request per file (two above 1 MB): installing an app with ten dependencies and ~230 migration
 * files took ~300 requests and could not finish. The REST API remains the authority — any file raw
 * cannot serve is read through it exactly as before (see {@link RepoFileReader}).
 */
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
 * `value` without its leading and trailing slashes. A loop rather than `/^\/+|\/+$/g`: that
 * pattern's end-anchored half backtracks quadratically on a long run of slashes, and the value
 * comes from a manifest or a URL someone typed.
 */
function TrimSlashes(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && value[start] === '/') {
        start++;
    }
    while (end > start && value[end - 1] === '/') {
        end--;
    }
    return value.slice(start, end);
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
    const rawSubpath = TrimSlashes(match[3] ?? '');
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
 * The token a request for `repoUrl` carries, or undefined for none. An empty string (`GITHUB_TOKEN=`)
 * counts as none: Octokit already treats a falsy `auth` as unauthenticated, and the raw-content path
 * and the rate-limit advice must agree with it about whether a request is authenticated.
 */
function RepoToken(repoUrl: string, options: GitHubClientOptions): string | undefined {
    return ResolveToken(repoUrl, options) || undefined;
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

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITS — one explanation, used by every catch in this module
// ─────────────────────────────────────────────────────────────────────────────

/** GitHub's documented hourly REST allowance without a token. */
const ANONYMOUS_HOURLY_REQUESTS = 60;
/** GitHub's documented hourly REST allowance for a personal access token. */
const TOKEN_HOURLY_REQUESTS = 5000;

/**
 * Error thrown when GitHub returns 403/429 (rate limit or access denied). A 403/429 must NOT
 * look identical to "this repo has no releases/tags", which silently resolves the wrong version
 * (or falls back to HEAD). Callers should surface this rather than treat it as empty (B36).
 */
export class GitHubAccessError extends Error {
    public readonly Status: number;
    /** True when GitHub reported a rate limit, as opposed to denying access to the repository. */
    public readonly IsRateLimit: boolean;
    /** When GitHub's hourly allowance resets, if it said. Only ever set for a rate limit. */
    public readonly ResetAt?: Date;
    constructor(status: number, message: string, details: { IsRateLimit?: boolean; ResetAt?: Date } = {}) {
        super(message);
        this.name = 'GitHubAccessError';
        this.Status = status;
        this.IsRateLimit = details.IsRateLimit === true;
        this.ResetAt = details.ResetAt;
    }
}

/** What GitHub's response headers said about a rate limit. */
interface RateLimitDetails {
    /** When the hourly window resets (`x-ratelimit-reset`), when the hourly allowance is what ran out. */
    ResetAt?: Date;
    /** Seconds to wait (`retry-after`) — what GitHub sends for its secondary, burst limits. */
    RetryAfterSeconds?: number;
    /** The allowance the request was counted against (`x-ratelimit-limit`), when reported. */
    HourlyLimit?: number;
}

/** An Octokit error's response headers, lowercased; empty when there was no response. */
function ResponseHeaders(error: unknown): Record<string, string> {
    if (!error || typeof error !== 'object' || !('response' in error)) {
        return {};
    }
    const headers = (error as { response?: { headers?: Record<string, string | number | undefined> } }).response?.headers ?? {};
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
        if (value !== undefined) {
            out[name.toLowerCase()] = String(value);
        }
    }
    return out;
}

function ParsePositiveNumber(value: string | undefined): number | undefined {
    const parsed = value === undefined ? NaN : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Recognizes GitHub rate limiting on an Octokit error, or returns undefined.
 *
 * Status alone is not enough: a 403 is also how GitHub says "this token cannot see that repository".
 * A rate limit is a 429, or a 403 that reports `x-ratelimit-remaining: 0` (the hourly allowance) or
 * carries `retry-after` (a secondary, burst limit).
 */
function ReadRateLimit(error: unknown): RateLimitDetails | undefined {
    const status = OctokitStatus(error);
    if (status !== 403 && status !== 429) {
        return undefined;
    }
    const headers = ResponseHeaders(error);
    const exhausted = headers['x-ratelimit-remaining'] === '0';
    const retryAfter = ParsePositiveNumber(headers['retry-after']);
    if (status === 403 && !exhausted && retryAfter === undefined) {
        return undefined;
    }
    const reset = exhausted ? ParsePositiveNumber(headers['x-ratelimit-reset']) : undefined;
    return {
        ResetAt: reset === undefined ? undefined : new Date(reset * 1000),
        RetryAfterSeconds: retryAfter,
        HourlyLimit: ParsePositiveNumber(headers['x-ratelimit-limit']),
    };
}

/** `2026-10-07 21:34:00 UTC` — the reset instant, readable and unambiguous across time zones. */
function FormatUtc(date: Date): string {
    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function FormatWaitFromNow(date: Date): string {
    const minutes = Math.ceil((date.getTime() - Date.now()) / 60_000);
    if (minutes <= 0) {
        return 'any moment now';
    }
    return minutes === 1 ? 'in about 1 minute' : `in about ${minutes} minutes`;
}

function TokenAdvice(): string {
    return `Set GITHUB_TOKEN (or openApps.github.token in mj.config.cjs) to raise the limit to ` +
        `${TOKEN_HOURLY_REQUESTS.toLocaleString('en-US')} requests per hour.`;
}

/** The operator-facing explanation of a rate limit: what ran out, when it resets, and how to raise it. */
function DescribeRateLimit(limit: RateLimitDetails, action: string, authenticated: boolean): string {
    if (!limit.ResetAt && limit.RetryAfterSeconds !== undefined) {
        // Secondary limits throttle bursts for everyone; a token raises the other limits, not this one.
        return `GitHub's secondary rate limit (too many requests in a short time) was reached while ${action}. ` +
            `Retry in ${limit.RetryAfterSeconds} seconds.${authenticated ? '' : ` ${TokenAdvice()}`}`;
    }
    const when = limit.ResetAt
        ? `It resets at ${FormatUtc(limit.ResetAt)} (${FormatWaitFromNow(limit.ResetAt)}).`
        : 'Wait for it to reset before retrying.';
    const allowance = (limit.HourlyLimit ?? (authenticated ? TOKEN_HOURLY_REQUESTS : ANONYMOUS_HOURLY_REQUESTS)).toLocaleString('en-US');
    const remedy = authenticated
        ? `The configured GitHub token's allowance of ${allowance} requests per hour is used up — wait for the reset, or configure a different token.`
        : `Without a token GitHub allows ${allowance} requests per hour. ${TokenAdvice()}`;
    return `GitHub's API rate limit was reached while ${action}. ${when} ${remedy}`;
}

/**
 * The one way a GitHub failure in this module becomes text: a rate limit becomes an explanation
 * (when it resets, how to raise it); anything else keeps the error's own message. Never includes a
 * token — Octokit redacts it from the error it builds, and nothing here reads request headers.
 *
 * @param action - What was being done, phrased to follow "while" (e.g. 'listing tags').
 * @param authenticated - Whether the failed request carried a token; it changes the advice.
 */
function DescribeGitHubFailure(error: unknown, action: string, authenticated: boolean): string {
    const limit = ReadRateLimit(error);
    if (limit) {
        return DescribeRateLimit(limit, action, authenticated);
    }
    return error instanceof Error ? error.message : String(error);
}

/**
 * Rethrows an Octokit error as a {@link GitHubAccessError} when it is a 403/429 (rate limit or
 * access denied), so the condition is surfaced instead of being swallowed into an empty list (B36).
 * A no-op for every other error — the caller still decides what to do (e.g. return []).
 */
function ThrowIfRateLimitedOrForbidden(error: unknown, context: string, authenticated: boolean): void {
    const status = OctokitStatus(error);
    if (status !== 403 && status !== 429) {
        return;
    }
    const limit = ReadRateLimit(error);
    if (limit) {
        throw new GitHubAccessError(
            status,
            `${DescribeRateLimit(limit, context, authenticated)} This is NOT the same as "no versions found".`,
            { IsRateLimit: true, ResetAt: limit.ResetAt },
        );
    }
    throw new GitHubAccessError(
        status,
        `GitHub API returned ${status} (rate limit or access denied) while ${context}. ` +
        `This is NOT the same as "no versions found" — check your GitHub token and rate limit.`,
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE CONTENT — raw.githubusercontent.com first, the Contents API as the authority
// ─────────────────────────────────────────────────────────────────────────────

/** GitHub's raw-content host. A constant, so a configured token is only ever sent to GitHub. */
const RAW_CONTENT_ORIGIN = 'https://raw.githubusercontent.com';

/**
 * How long raw.githubusercontent.com is skipped once it proves unreachable or overloaded. Some
 * networks block it while allowing api.github.com; without this window each file would pay a failed
 * connection (potentially a connect timeout) before falling back.
 */
const RAW_HOST_RETRY_MS = 60_000;

/** Set while raw.githubusercontent.com is being skipped, with why. */
let rawHostUnavailable: { Until: number; Reason: string } | undefined;

function MarkRawHostUnavailable(reason: string): void {
    rawHostUnavailable = { Until: Date.now() + RAW_HOST_RETRY_MS, Reason: reason };
}

function RawHostUnavailableReason(): string | undefined {
    if (rawHostUnavailable && rawHostUnavailable.Until > Date.now()) {
        return rawHostUnavailable.Reason;
    }
    rawHostUnavailable = undefined;
    return undefined;
}

/** A repository at one ref, plus the token requests for it carry. */
interface RepoRef {
    Owner: string;
    Repo: string;
    /** 'HEAD' or a tag name — the only two shapes {@link ResolveRef} produces. */
    Ref: string;
    Token?: string;
}

/** One raw read: the file's bytes when it worked, otherwise `Reason` says why not. */
interface RawReadResult {
    Bytes?: Buffer;
    Reason?: string;
}

/** Percent-encodes each segment of a slash-separated path, keeping the slashes. */
function EncodePath(path: string): string {
    return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

/**
 * The raw.githubusercontent.com URL for a file. `HEAD` stays `HEAD` (the default branch); a tag is
 * addressed as `refs/tags/<tag>` — the form GitHub's own `/raw/` redirect emits — so a branch that
 * happens to share the tag's name cannot shadow it. Segments are percent-encoded, so a scoped tag's
 * `@` (`CRM-HubSpot@1.2.0`) or a `+build` suffix cannot be read as URL syntax.
 */
function BuildRawUrl(target: RepoRef, path: string): string {
    const ref = target.Ref === 'HEAD' ? 'HEAD' : `refs/tags/${EncodePath(target.Ref)}`;
    return `${RAW_CONTENT_ORIGIN}/${EncodePath(target.Owner)}/${EncodePath(target.Repo)}/${ref}/${EncodePath(path)}`;
}

/**
 * Request options for a raw read. With a token attached, redirects are NOT followed: the token must
 * never travel to a location this module did not choose. A redirect (a renamed repository) then
 * reads as a failed raw read, and that one file is fetched through the API, which handles renames.
 */
function RawRequestInit(token: string | undefined): RequestInit {
    return token
        ? { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' }
        : { redirect: 'follow' };
}

/**
 * Reads one file from raw.githubusercontent.com. Never throws: every failure comes back as a reason,
 * because the caller's answer to any of them is the same — read the file through the API instead.
 * Failures that are about the HOST rather than this file (unreachable, 429, 5xx) also open the
 * {@link RAW_HOST_RETRY_MS} window so later reads skip raw.
 */
async function ReadRawFile(target: RepoRef, path: string): Promise<RawReadResult> {
    try {
        const response = await fetch(BuildRawUrl(target, path), RawRequestInit(target.Token));
        if (!response.ok) {
            // Drain the (small) error body: undici holds the pooled connection until it is consumed.
            await response.arrayBuffer();
            const reason = `raw.githubusercontent.com answered ${response.status} for ${path}`;
            if (response.status === 429 || response.status >= 500) {
                MarkRawHostUnavailable(reason);
            }
            return { Reason: reason };
        }
        // Bytes, not `Response.text()`: the caller decodes through Buffer exactly as the Contents API
        // path does (which keeps a byte-order mark; text() would strip it), and verifies the bytes first.
        return { Bytes: Buffer.from(await response.arrayBuffer()) };
    }
    catch (error: unknown) {
        // fetch() rejects on network failure (DNS, TLS, a proxy refusing the host), and reading the
        // body rejects if the connection drops mid-file. Both are about the host, not this file.
        const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : '';
        const reason = `raw.githubusercontent.com request failed (${error instanceof Error ? error.message : String(error)}${cause})`;
        MarkRawHostUnavailable(reason);
        return { Reason: reason };
    }
}

/**
 * Reads files from one repository at one ref: raw.githubusercontent.com first, the Contents API when
 * raw cannot serve them.
 *
 * The REST API stays the authority. Any raw failure — a proxy that blocks the host, a 404 because raw
 * would not authorize a private repository, a 429, or bytes that do not hash to the blob a listing
 * named — sends that file, and every later read through the same reader, down the API path this client
 * always used. So a raw failure can cost quota but never changes an outcome, and a file that truly does
 * not exist still fails with the API's own 404.
 *
 * Migration files are verified against the git blob SHA their listing reported, so what is written to
 * disk is byte-for-byte the API's answer. A manifest has no listing to check against, which leaves one
 * known difference: raw.githubusercontent.com is served through a CDN that may lag a fresh push by a
 * few minutes, so a DEFAULT-BRANCH (`HEAD`) manifest read right after a push can be the previous one.
 * Tagged reads are unaffected unless a tag is moved — and a moved tag's migrations still fail
 * verification and come from the API.
 */
class RepoFileReader {
    private rawFailure: string | undefined;
    private octokit: Octokit | undefined;

    constructor(
        private readonly target: RepoRef,
        private readonly repoUrl: string,
        private readonly options: GitHubClientOptions,
    ) {}

    /** The REST client for this repository, created on first use — a read raw serves never needs one. */
    public get Octokit(): Octokit {
        this.octokit ??= CreateOctokit(this.repoUrl, this.options);
        return this.octokit;
    }

    /** Why raw was abandoned for this reader (or for the whole host), if it was. */
    public get RawFailure(): string | undefined {
        return this.rawFailure ?? RawHostUnavailableReason();
    }

    /**
     * The UTF-8 content of `path`. Throws the API's error when neither host can serve it.
     *
     * @param expectedBlobSha - The file's git blob SHA from a tree or directory listing, when the
     *   caller has one. Raw bytes that do not hash to it are discarded and the file is read through
     *   the API — so a CDN copy that is stale after a tag was moved, or a proxy's block page served
     *   with a 200, can never be written to disk in place of the real file.
     */
    public async Read(path: string, expectedBlobSha?: string): Promise<string> {
        if (this.RawFailure === undefined) {
            const raw = await ReadRawFile(this.target, path);
            const mismatch = raw.Bytes && expectedBlobSha ? DescribeBlobMismatch(raw.Bytes, expectedBlobSha, path) : undefined;
            if (raw.Bytes && !mismatch) {
                return raw.Bytes.toString('utf-8');
            }
            this.rawFailure = mismatch ?? raw.Reason;
        }
        return FetchFileContent(this.Octokit, this.target.Owner, this.target.Repo, path, this.target.Ref);
    }
}

/** Git's object id for file content: SHA-1 over `blob <byte length>\0<bytes>`. */
function GitBlobSha(bytes: Buffer): string {
    return createHash('sha1').update(`blob ${bytes.length}\u0000`).update(bytes).digest('hex');
}

/**
 * Why `bytes` are not the blob GitHub listed, or undefined when they are. Only a 40-character SHA-1
 * is checked — GitHub's object format; anything else is not something this can verify.
 */
function DescribeBlobMismatch(bytes: Buffer, expectedBlobSha: string, path: string): string | undefined {
    if (!/^[0-9a-f]{40}$/i.test(expectedBlobSha) || GitBlobSha(bytes).toLowerCase() === expectedBlobSha.toLowerCase()) {
        return undefined;
    }
    return `raw.githubusercontent.com served content for ${path} that does not match blob ${expectedBlobSha}`;
}

/**
 * Appended to a rate-limit error when raw.githubusercontent.com could not be used, because that is
 * WHY the quota ran out: every file was read through the REST API.
 */
function RawFallbackNote(error: unknown, reader: RepoFileReader): string {
    const reason = reader.RawFailure;
    return reason && ReadRateLimit(error)
        ? ` File contents were read through the API because raw.githubusercontent.com could not be used (${reason}).`
        : '';
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
    const s = subpath != null ? TrimSlashes(subpath) : undefined;
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
 * `a//b/./c/` → `a/b/c`: drops empty and `.` segments. The Trees API rejects a path with a trailing
 * or doubled slash (400, "Request path could not be canonicalized"), and `migrations.directory` is
 * free text in mj-app.json. `..` is left alone — GitHub rejects it anyway.
 */
function NormalizeRepoPath(path: string): string {
    return path.split('/').filter(segment => segment !== '' && segment !== '.').join('/');
}

/**
 * How long a fetched result stays reusable — the tag list, the release list, and manifests.
 * Deliberately short: this exists to collapse the redundant fetches inside ONE sweep or install, not
 * to act as a durable cache. A newly pushed tag becomes visible within this window, so a long-lived
 * process cannot pin a stale answer.
 */
const TAG_CACHE_TTL_MS = 60_000;

/** One memoized fetch: the in-flight promise plus when it stops being reusable. */
type FetchCacheEntry<T> = { ExpiresAt: number; Value: Promise<T> };

/**
 * Cached manifest contents, keyed by repository, ref, path AND resolved token.
 *
 * A dependency whose declared range is unconstrained (`*`, `latest`, empty) is fetched at HEAD twice
 * within seconds — once by the dependency-graph walk, once by its own install. Serving the second from
 * the first also means the graph and the install see the SAME manifest, even if a push lands between.
 */
const manifestCache = new Map<string, FetchCacheEntry<string>>();

/**
 * Fetches the mj-app.json manifest from a GitHub repository at a specific tag.
 *
 * The content comes from raw.githubusercontent.com when it can (no REST request), and from the
 * Contents API otherwise — see {@link RepoFileReader}.
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

    const requestedSubpath = subpath ?? parsed.Subpath;
    const effectiveSubpath = requestedSubpath != null ? TrimSlashes(requestedSubpath) : undefined;
    const ref = ResolveRef(version, effectiveSubpath);
    const manifestPath = ComposeRepoPath(effectiveSubpath, 'mj-app.json');
    const token = RepoToken(repoUrl, options);
    const reader = new RepoFileReader({ Owner: parsed.Owner, Repo: parsed.Repo, Ref: ref, Token: token }, repoUrl, options);

    try {
        const cacheKey = [parsed.Owner, parsed.Repo, ref, manifestPath, token ?? ''].join('\u0000');
        const content = await MemoizedValue(manifestCache, cacheKey, () => reader.Read(manifestPath));
        return { Success: true, ManifestJSON: content };
    }
    catch (error: unknown) {
        if (OctokitStatus(error) === 404) {
            return { Success: false, ErrorMessage: `${manifestPath} not found in ${parsed.Owner}/${parsed.Repo} at ref ${ref}` };
        }
        const message = DescribeGitHubFailure(error, `fetching ${manifestPath} from ${parsed.Owner}/${parsed.Repo}`, token !== undefined);
        return { Success: false, ErrorMessage: `Failed to fetch manifest: ${message}${RawFallbackNote(error, reader)}` };
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
        // cost one request per page, and both GetLatestVersion and ResolveDependencyVersion call this.
        // A page cap instead would reintroduce exactly the silent truncation the pagination removed.
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
        ThrowIfRateLimitedOrForbidden(error, 'listing releases', RepoToken(repoUrl, options) !== undefined);
        return [];
    }
}

/** Bounded so a pathological or adversarial tree cannot walk forever. Generous vs any real repo. */
const MAX_MIGRATION_DIRECTORY_DEPTH = 6;

/** Git's file mode for a symbolic link. The Contents API reported these as type 'symlink', which the
 * directory walk never downloaded; the tree listing skips them too, so both select the same files. */
const SYMLINK_MODE = '120000';

/** A migration file to download: its repository path, and its path relative to the migrations root. */
interface SqlFileEntry {
    path: string;
    relativePath: string;
    /** The file's git blob SHA as listed, used to verify what raw.githubusercontent.com returns. */
    blobSha?: string;
}

/** A Git Trees entry with the fields this module reads present. */
interface TreeEntry {
    path: string;
    type: string;
    mode?: string;
    sha?: string;
}

/** The part of a Git Trees response this module reads. GitHub marks every entry field optional. */
interface DirectoryTree {
    truncated: boolean;
    tree: Partial<TreeEntry>[];
}

/**
 * Every `.sql` file under `root`, with its path relative to `root` (#3858) — the same set skyway's
 * recursive glob applies locally, which is the whole point: what installs must be what runs.
 *
 * ONE Git Trees request lists the whole directory, however deep. The per-directory Contents walk it
 * replaces cost a request per directory; it remains as the fallback for the one case the tree cannot
 * answer — a listing GitHub truncated (over 100,000 entries or 7 MB).
 */
async function ListSqlFiles(octokit: Octokit, owner: string, repo: string, root: string, ref: string): Promise<SqlFileEntry[]> {
    const viaTree = await ListSqlFilesViaTree(octokit, owner, repo, root, ref);
    return viaTree ?? listSqlFilesRecursive(octokit, owner, repo, root, ref);
}

/**
 * Lists the `.sql` files under `root` from one recursive tree of `<ref>:<root>` — a tree-ish GitHub
 * resolves like `git rev-parse` (tags are peeled), returning paths relative to `root`. Returns
 * undefined when GitHub truncated the listing.
 */
async function ListSqlFilesViaTree(octokit: Octokit, owner: string, repo: string, root: string, ref: string): Promise<SqlFileEntry[] | undefined> {
    const tree = await GetDirectoryTree(octokit, owner, repo, root, ref);
    if (tree.truncated) {
        return undefined;
    }
    const entries = tree.tree.filter((e): e is TreeEntry => typeof e.path === 'string' && typeof e.type === 'string');
    AssertMigrationDepth(entries, root);
    return entries
        .filter(e => e.type === 'blob' && e.mode !== SYMLINK_MODE && e.path.endsWith('.sql'))
        .map(e => ({ path: root ? `${root}/${e.path}` : e.path, relativePath: e.path, blobSha: e.sha }));
}

/** The recursive tree of `root` at `ref`, with GitHub's 404/422 turned into messages that name the path. */
async function GetDirectoryTree(octokit: Octokit, owner: string, repo: string, root: string, ref: string): Promise<DirectoryTree> {
    try {
        const { data } = await octokit.git.getTree({ owner, repo, tree_sha: root ? `${ref}:${root}` : ref, recursive: 'true' });
        return data;
    }
    catch (error: unknown) {
        const status = OctokitStatus(error);
        if (status === 404) {
            throw new Error(`'${root}' was not found in ${owner}/${repo} at ref ${ref} (GitHub returned 404)`);
        }
        if (status === 422) {
            throw new Error(`Expected a directory at ${root}, but GitHub reports it is not one (422)`);
        }
        throw error;
    }
}

/**
 * The tree listing's form of the walk's depth cap. The walk listed a directory k levels below the root
 * at depth k and refused anything deeper than {@link MAX_MIGRATION_DIRECTORY_DEPTH}; a tree entry for a
 * directory with more path segments than that is exactly a directory the walk would have refused.
 */
function AssertMigrationDepth(entries: TreeEntry[], root: string): void {
    const tooDeep = entries.some(e => e.type === 'tree' && e.path.split('/').length > MAX_MIGRATION_DIRECTORY_DEPTH);
    if (tooDeep) {
        throw new Error(
            `Migration directory nesting exceeds ${MAX_MIGRATION_DIRECTORY_DEPTH} levels under '${root}' — `
            + `refusing to walk further. No real migration layout is this deep.`);
    }
}

/**
 * Every `.sql` file under `root`, one Contents request per directory — the fallback for a truncated
 * tree listing (#3858).
 */
async function listSqlFilesRecursive(
    octokit: ReturnType<typeof CreateOctokit>,
    owner: string,
    repo: string,
    root: string,
    ref: string,
    currentDir?: string,
    depth = 0
): Promise<SqlFileEntry[]> {
    if (depth > MAX_MIGRATION_DIRECTORY_DEPTH) {
        throw new Error(
            `Migration directory nesting exceeds ${MAX_MIGRATION_DIRECTORY_DEPTH} levels under '${root}' — `
            + `refusing to walk further. No real migration layout is this deep.`);
    }
    const items = await ListDirectory(octokit, owner, repo, currentDir ?? root, ref);
    const out: SqlFileEntry[] = [];
    for (const item of items) {
        if (item.type === 'file' && item.name.endsWith('.sql')) {
            // Relative to the ORIGINAL root, however deep — this is the on-disk path, so nested
            // structure survives and two same-named migrations in different subdirectories land in
            // different places instead of silently overwriting each other.
            out.push({ path: item.path, relativePath: item.path.slice(root.length).replace(/^\/+/, ''), blobSha: item.sha });
        } else if (item.type === 'dir') {
            out.push(...await listSqlFilesRecursive(octokit, owner, repo, root, ref, item.path, depth + 1));
        }
    }
    return out;
}

/** Downloads each file through `reader` to `localDir`, preserving its path relative to the migrations root. */
async function WriteMigrationFiles(reader: RepoFileReader, files: SqlFileEntry[], localDir: string): Promise<string[]> {
    const written: string[] = [];
    for (const file of files) {
        const content = await reader.Read(file.path, file.blobSha);
        // file.relativePath, not the base name — see listSqlFilesRecursive on same-named migrations.
        const target = join(localDir, file.relativePath);
        const targetDir = dirname(target);
        if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
        }
        writeFileSync(target, content, 'utf-8');
        written.push(file.relativePath);
    }
    return written;
}

/**
 * Downloads migration files from a GitHub repository to a local temp directory.
 *
 * Costs ONE REST request however many files there are: the directory is listed with a single
 * recursive tree call, and the files themselves are read from raw.githubusercontent.com (each falls
 * back to the Contents API only if raw cannot serve it).
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

    const requestedSubpath = subpath ?? parsed.Subpath;
    const effectiveSubpath = requestedSubpath != null ? TrimSlashes(requestedSubpath) : undefined;
    const ref = ResolveRef(version, effectiveSubpath);
    const cleanPath = NormalizeRepoPath(ComposeRepoPath(effectiveSubpath, migrationsPath));
    const token = RepoToken(repoUrl, options);
    const reader = new RepoFileReader({ Owner: parsed.Owner, Repo: parsed.Repo, Ref: ref, Token: token }, repoUrl, options);

    try {
        // RECURSIVE (#3858): skyway's scanner globs recursively, so a migration in a subdirectory
        // is applied by a local `mj migrate` and looks correct — and was never downloaded and never
        // ran on a host, with both sides reporting success. The listing mirrors what the scanner
        // sees, and relative paths are PRESERVED on disk: flattening to the base name would let two
        // same-named migrations in different subdirectories silently overwrite each other.
        const sqlFiles = await ListSqlFiles(reader.Octokit, parsed.Owner, parsed.Repo, cleanPath, ref);
        if (sqlFiles.length === 0) {
            // ZERO FILES IS A FAILURE (#3858). This function is only called because a manifest
            // declared migrations; an app that says it has migrations and ships none is a defect.
            // The old `Success: true, Files: []` let an install proceed past the migration phase,
            // record the app as installed, and leave the host with an EMPTY schema and a green
            // result — the one path where the migration phase failed soft.
            return {
                Success: false,
                ErrorMessage: `No .sql files found under '${cleanPath}' (ref: ${ref}). `
                    + `The manifest declares a migrations directory, so an empty download is a defect — `
                    + `check 'migrations.directory' in mj-app.json and that the tag's tree contains it.`,
            };
        }

        const downloadedFiles = await WriteMigrationFiles(reader, sqlFiles, localDir);
        return { Success: true, LocalPath: localDir, Files: downloadedFiles };
    }
    catch (error: unknown) {
        const message = DescribeGitHubFailure(error, `downloading migrations from ${parsed.Owner}/${parsed.Repo}`, token !== undefined);
        return { Success: false, ErrorMessage: `Failed to download migrations: ${message}${RawFallbackNote(error, reader)}` };
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
 * Two constraints of that pattern are worth stating, because they are load-bearing rather than
 * incidental: a prerelease identifier may NOT contain a hyphen (`-rc.1` matches, `-rc-1` does not),
 * and build metadata is rejected outright (`v1.2.3+build.7` is not a tag this returns). The second
 * is why only the RELEASES path could ever surface a `+build` string as a version — this path cannot
 * produce one.
 *
 * Returns the tag TEXT as matched (`v1.0.7`), not a normalized core: `ValidateGitHubTag` and
 * external callers depend on that shape. Only the ordering is semver-derived.
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
        ThrowIfRateLimitedOrForbidden(error, 'listing tags', RepoToken(repoUrl, options) !== undefined);
        return [];
    }
}

/**
 * Every tag name in the repository exactly as GitHub lists it — unfiltered and unsorted, so it
 * includes the names {@link ListGitHubTags}' pattern drops (build metadata, hyphenated prerelease
 * identifiers, other apps' scoped tags, non-version tags).
 *
 * Shares ListGitHubTags' memoized paginated fetch, so calling both costs one walk, not two.
 * Failure semantics match it too: 403/429 throws {@link GitHubAccessError}; anything else is [].
 */
export async function ListGitHubTagNames(repoUrl: string, options: GitHubClientOptions): Promise<string[]> {
    const parsed = ParseGitHubUrl(repoUrl);
    if (!parsed) {
        return [];
    }
    try {
        return await FetchRepoTagNames(repoUrl, parsed, options);
    }
    catch (error: unknown) {
        ThrowIfRateLimitedOrForbidden(error, 'listing tags', RepoToken(repoUrl, options) !== undefined);
        return [];
    }
}

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
 * of 60/hour. `ResolveDependencyVersion` calls it too, once per version-range resolution. Pagination
 * fixed the correctness problem (silent truncation at 100) and created this cost one; memoizing is
 * the other half. Capping pages instead would reintroduce the truncation the pagination removed.
 */
const releaseListCache = new Map<string, FetchCacheEntry<GitHubRelease[]>>();

/**
 * Upper bound on distinct keys held per cache.
 *
 * The caches are only swept on write, so without a bound they grow for the life of the process —
 * and each key embeds a token, which is not something to retain indefinitely. Generous relative to
 * any real sweep (an install set is single- or low-double-digit apps), so eviction is a backstop
 * rather than something a normal run reaches.
 */
const FETCH_CACHE_MAX_ENTRIES = 64;

/**
 * Drops every cached tag list, release list and manifest, and forgets that raw.githubusercontent.com
 * was unreachable. Exported for tests and for any caller that has just pushed a tag or published a
 * release and needs the next lookup to reflect it immediately.
 *
 * Named for tags because that is what it originally cleared; it clears everything this module
 * remembers, because a "clear" that left stale state behind would be a trap.
 */
export function ClearGitHubTagCache(): void {
    tagListCache.clear();
    releaseListCache.clear();
    manifestCache.clear();
    rawHostUnavailable = undefined;
}

/**
 * Returns the cached fetch for `cacheKey`, or starts one and caches it.
 *
 * Shared by every cache in this module so the promise-sharing, rejection handling and eviction
 * rules cannot drift apart between them.
 */
async function MemoizedValue<T>(
    cache: Map<string, FetchCacheEntry<T>>,
    cacheKey: string,
    fetcher: () => Promise<T>
): Promise<T> {
    const now = Date.now();

    const cached = cache.get(cacheKey);
    if (cached && cached.ExpiresAt > now) {
        return cached.Value;
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

    return inFlight;
}

/**
 * {@link MemoizedValue} for list results.
 *
 * @returns A COPY of the resolved array — the cached promise is shared by every joiner, so handing
 *   back the same array would let one caller's in-place sort corrupt what the others see.
 */
async function MemoizedFetch<T>(
    cache: Map<string, FetchCacheEntry<T[]>>,
    cacheKey: string,
    fetcher: () => Promise<T[]>
): Promise<T[]> {
    return [...(await MemoizedValue(cache, cacheKey, fetcher))];
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
 * True when a tag list fetched within the cache window — for the same repository and token — names
 * `tag` exactly. Never fetches: nothing cached, an expired or failed fetch, or a list without the tag
 * all mean "ask GitHub", so a tag pushed after the list was fetched is still found.
 */
async function CachedTagListIncludes(cacheKey: string, tag: string): Promise<boolean> {
    const cached = tagListCache.get(cacheKey);
    if (!cached || cached.ExpiresAt <= Date.now()) {
        return false;
    }
    // allSettled, not await: a failed list fetch already surfaced to whoever started it, and here it
    // only means this shortcut is unavailable — the caller then asks GitHub, whose answer is final.
    const [settled] = await Promise.allSettled([cached.Value]);
    return settled.status === 'fulfilled' && settled.value.includes(tag);
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

    // A dependency's version is chosen FROM the repository's tag list moments before its install
    // validates it, so the list already answers this. `git/ref/tags/<tag>` is an exact-name lookup
    // and the list holds every tag name, so a hit is the same answer without the request; a miss
    // still asks GitHub, exactly as before.
    if (await CachedTagListIncludes(FetchCacheKey(repoUrl, parsed, options), tag)) {
        return { Exists: true };
    }

    try {
        await CreateOctokit(repoUrl, options).git.getRef({ owner: parsed.Owner, repo: parsed.Repo, ref: `tags/${tag}` });
        return { Exists: true };
    }
    catch (error: unknown) {
        if (OctokitStatus(error) === 404) {
            return { Exists: false, ErrorMessage: `Tag '${tag}' not found in ${parsed.Owner}/${parsed.Repo}. Available versions can be checked at ${repoUrl}/tags` };
        }
        const message = DescribeGitHubFailure(error, `checking that tag '${tag}' exists in ${parsed.Owner}/${parsed.Repo}`, RepoToken(repoUrl, options) !== undefined);
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
