/**
 * BaseSourceControlProvider — abstract base for platform-specific source control APIs.
 *
 * Subclasses implement the platform-specific HTTP calls (GitHub REST API,
 * GitLab REST API, Bitbucket API, etc.) and register via ClassFactory:
 *
 *   @RegisterClass(BaseSourceControlProvider, 'github')
 *   class GitHubSourceControlProvider extends BaseSourceControlProvider { ... }
 *
 * Consumers resolve providers through MJ's ClassFactory:
 *
 *   const sc = MJGlobal.Instance.ClassFactory.CreateInstance<BaseSourceControlProvider>(
 *       BaseSourceControlProvider, 'github'
 *   );
 */
import type {
    SourceControlAuthConfig,
    RepoRef,
    SCResult,
    SCRelease,
    SCBranch,
    SCPullRequest,
    SCFileContent,
    SCDirectoryEntry,
    SCRateLimit,
    CreatePRInput,
    ListReleasesOptions,
    ListBranchesOptions,
    ListPRsOptions,
    DownloadProgressCallback,
} from './interfaces.js';

export abstract class BaseSourceControlProvider {
    // ─── Configuration ────────────────────────────────────────────

    /** Configure authentication for the platform. */
    abstract Configure(auth: SourceControlAuthConfig): void;

    /** Platform identifier (e.g., 'github', 'gitlab', 'bitbucket'). */
    abstract get PlatformName(): string;

    /** Base URL for the platform API (e.g., 'https://api.github.com'). */
    abstract get BaseApiUrl(): string;

    // ─── Releases / Tags ──────────────────────────────────────────

    /** List releases/tags for a repository. */
    abstract ListReleases(repo: RepoRef, options?: ListReleasesOptions): Promise<SCResult<SCRelease[]>>;

    /** Get a specific release by its tag name. */
    abstract GetReleaseByTag(repo: RepoRef, tag: string): Promise<SCResult<SCRelease>>;

    /** Get the latest non-prerelease, non-draft release. */
    abstract GetLatestRelease(repo: RepoRef): Promise<SCResult<SCRelease>>;

    // ─── Repository Content ───────────────────────────────────────

    /** Get the decoded contents of a file at a specific ref. */
    abstract GetFileContent(repo: RepoRef, path: string, ref?: string): Promise<SCResult<SCFileContent>>;

    /** List entries in a directory at a specific ref. */
    abstract ListDirectory(repo: RepoRef, path: string, ref?: string): Promise<SCResult<SCDirectoryEntry[]>>;

    /** Download a file from a URL to a local path. */
    abstract DownloadFile(url: string, destPath: string, progress?: DownloadProgressCallback): Promise<SCResult<string>>;

    // ─── Branches ─────────────────────────────────────────────────

    /** List branches in a repository. */
    abstract ListBranches(repo: RepoRef, options?: ListBranchesOptions): Promise<SCResult<SCBranch[]>>;

    /** Get details of a specific branch. */
    abstract GetBranch(repo: RepoRef, branch: string): Promise<SCResult<SCBranch>>;

    /** Create a new branch from a commit SHA. */
    abstract CreateBranch(repo: RepoRef, name: string, fromSHA: string): Promise<SCResult<SCBranch>>;

    // ─── Pull / Merge Requests ────────────────────────────────────

    /** Create a new pull/merge request. */
    abstract CreatePullRequest(repo: RepoRef, input: CreatePRInput): Promise<SCResult<SCPullRequest>>;

    /** Get a pull/merge request by number. */
    abstract GetPullRequest(repo: RepoRef, number: number): Promise<SCResult<SCPullRequest>>;

    /** List pull/merge requests with optional filters. */
    abstract ListPullRequests(repo: RepoRef, options?: ListPRsOptions): Promise<SCResult<SCPullRequest[]>>;

    // ─── Rate Limit ───────────────────────────────────────────────

    /** Get current rate limit status for the authenticated user. */
    abstract GetRateLimit(): Promise<SCResult<SCRateLimit>>;
}
