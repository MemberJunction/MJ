/**
 * @memberjunction/source-control — Shared Interfaces
 *
 * Platform-agnostic types for source control operations.
 * Prefixed with SC (Source Control) to avoid collisions with
 * existing platform-specific types in other packages.
 */

// ─── Auth ──────────────────────────────────────────────────────────

/** Authentication configuration for source control platform APIs. */
export interface SourceControlAuthConfig {
    /** Personal access token or OAuth token. */
    Token?: string;
    /** Environment variable name to read token from (e.g., 'GITHUB_TOKEN'). */
    TokenEnvVar?: string;
}

// ─── Repository Reference ──────────────────────────────────────────

/** A reference to a remote repository (org/user + repo name). */
export interface RepoRef {
    /** Organization or user name. */
    Owner: string;
    /** Repository name. */
    Name: string;
}

// ─── Result Wrapper ────────────────────────────────────────────────

/** Standard result wrapper for all source control API calls. */
export interface SCResult<T> {
    /** Whether the operation succeeded. */
    Success: boolean;
    /** The result data (present when Success is true). */
    Data?: T;
    /** Error message (present when Success is false). */
    ErrorMessage?: string;
    /** HTTP status code from the API (if applicable). */
    StatusCode?: number;
    /** Rate limit information from the response headers. */
    RateLimit?: SCRateLimit;
}

// ─── Releases ──────────────────────────────────────────────────────

/** A release or tagged version in a repository. */
export interface SCRelease {
    /** Tag name (e.g., 'v5.14.0'). */
    TagName: string;
    /** Release title. */
    Name: string;
    /** Whether this is a pre-release. */
    PreRelease: boolean;
    /** Whether this is a draft. */
    Draft: boolean;
    /** ISO timestamp of release creation. */
    CreatedAt: string;
    /** Release body/description (markdown). */
    Body: string;
    /** Downloadable assets attached to the release. */
    Assets: SCAsset[];
    /** URL to download the source as a ZIP archive. */
    ZipballUrl: string;
}

/** A downloadable asset attached to a release. */
export interface SCAsset {
    /** File name (e.g., 'MemberJunction_Code_Bootstrap.zip'). */
    Name: string;
    /** Direct download URL. */
    DownloadUrl: string;
    /** File size in bytes. */
    Size: number;
}

// ─── Branches ──────────────────────────────────────────────────────

/** A branch in a repository. */
export interface SCBranch {
    /** Branch name (e.g., 'main', 'feature/foo'). */
    Name: string;
    /** HEAD commit SHA. */
    SHA: string;
    /** Whether the branch has protection rules. */
    Protected: boolean;
}

// ─── Pull / Merge Requests ─────────────────────────────────────────

/** A pull request (GitHub) or merge request (GitLab). */
export interface SCPullRequest {
    /** PR number. */
    Number: number;
    /** Title. */
    Title: string;
    /** Body/description. */
    Body: string;
    /** Current state. */
    State: 'open' | 'closed' | 'merged';
    /** Source branch name. */
    HeadBranch: string;
    /** Target branch name. */
    BaseBranch: string;
    /** Web URL to view the PR. */
    HtmlUrl: string;
    /** ISO timestamp of creation. */
    CreatedAt: string;
}

/** Input for creating a new pull/merge request. */
export interface CreatePRInput {
    /** Title. */
    Title: string;
    /** Body/description (markdown). */
    Body: string;
    /** Source branch name. */
    HeadBranch: string;
    /** Target branch name. */
    BaseBranch: string;
    /** Whether to create as a draft PR. */
    Draft?: boolean;
}

// ─── File Content ──────────────────────────────────────────────────

/** Contents of a file retrieved from a repository. */
export interface SCFileContent {
    /** File path within the repo. */
    Path: string;
    /** Decoded file content (UTF-8 string). */
    Content: string;
    /** Git blob SHA. */
    SHA: string;
    /** File size in bytes. */
    Size: number;
}

/** An entry in a directory listing. */
export interface SCDirectoryEntry {
    /** File or directory name. */
    Name: string;
    /** Full path within the repo. */
    Path: string;
    /** Entry type. */
    Type: 'file' | 'dir' | 'symlink';
    /** Size in bytes (0 for directories). */
    Size: number;
    /** Direct download URL (null for directories). */
    DownloadUrl: string | null;
}

// ─── Rate Limit ────────────────────────────────────────────────────

/** API rate limit information. */
export interface SCRateLimit {
    /** Maximum requests allowed per window. */
    Limit: number;
    /** Remaining requests in the current window. */
    Remaining: number;
    /** When the rate limit window resets. */
    ResetAt: Date;
}

// ─── Git CLI Types ─────────────────────────────────────────────────

/** Result of `git status`. */
export interface GitStatus {
    /** Current branch name. */
    Branch: string;
    /** Whether the working tree is clean (no changes). */
    Clean: boolean;
    /** Files staged for commit. */
    Staged: string[];
    /** Modified but unstaged files. */
    Modified: string[];
    /** Untracked files. */
    Untracked: string[];
}

/** A single git log entry. */
export interface GitLogEntry {
    /** Commit SHA. */
    SHA: string;
    /** Commit message (first line). */
    Message: string;
    /** Author name. */
    Author: string;
    /** ISO timestamp. */
    Date: string;
}

/** Options for `git log`. */
export interface GitLogOptions {
    /** Maximum number of log entries to return. */
    MaxCount?: number;
    /** Only show commits after this date (ISO string). */
    Since?: string;
}

/** Options for `git push`. */
export interface GitPushOptions {
    /** Set upstream tracking (-u flag). */
    SetUpstream?: boolean;
    /** Force push (use with caution). */
    Force?: boolean;
}

// ─── List/Filter Options ───────────────────────────────────────────

/** Options for listing releases. */
export interface ListReleasesOptions {
    /** Include pre-release versions. Default: false. */
    IncludePreRelease?: boolean;
    /** Maximum number of results to return. */
    MaxResults?: number;
}

/** Options for listing branches. */
export interface ListBranchesOptions {
    /** Maximum number of results to return. */
    MaxResults?: number;
}

/** Options for listing pull requests. */
export interface ListPRsOptions {
    /** Filter by state. Default: 'open'. */
    State?: 'open' | 'closed' | 'all';
    /** Filter by head branch name. */
    Head?: string;
}

// ─── Callbacks ─────────────────────────────────────────────────────

/** Progress callback for file downloads. null = indeterminate. */
export type DownloadProgressCallback = (percent: number | null) => void;

// ─── Metrics ───────────────────────────────────────────────────────

/** Summary of source control API and git CLI usage metrics. */
export interface SCMetricsSummary {
    /** Total platform API calls made. */
    TotalAPICalls: number;
    /** Total git CLI operations executed. */
    TotalGitOperations: number;
    /** Overall success rate (0–1). */
    SuccessRate: number;
    /** Number of rate limit hits (HTTP 403/429). */
    RateLimitHits: number;
    /** Average API call latency in milliseconds. */
    AverageLatencyMs: number;
    /** Call counts grouped by platform (e.g., { github: 42, gitlab: 3 }). */
    CallsByPlatform: Record<string, number>;
}

/** A single recorded API call for metrics tracking. */
export interface SCAPICallRecord {
    /** Platform name (e.g., 'github'). */
    Platform: string;
    /** API endpoint path. */
    Endpoint: string;
    /** HTTP method. */
    Method: string;
    /** Response status code. */
    StatusCode: number;
    /** Call duration in milliseconds. */
    DurationMs: number;
    /** ISO timestamp. */
    Timestamp: string;
}

/** A single recorded git CLI operation for metrics tracking. */
export interface SCGitOperationRecord {
    /** Operation name (e.g., 'commit', 'push', 'checkout'). */
    Operation: string;
    /** Duration in milliseconds. */
    DurationMs: number;
    /** Whether the operation succeeded. */
    Success: boolean;
    /** ISO timestamp. */
    Timestamp: string;
}
