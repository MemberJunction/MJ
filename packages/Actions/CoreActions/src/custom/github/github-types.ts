/**
 * @fileoverview Shared types for MemberJunction's first-class GitHub integration.
 *
 * Covers authentication resolution, policy enforcement (repository allowlists,
 * protected branches, App-token-never-merges), atomic Git Data API commits,
 * compound repository/PR context responses, and workflow diagnostics.
 *
 * @module @memberjunction/core-actions/github
 */

/**
 * Supported authentication sources when resolving GitHub credentials.
 */
export type GitHubAuthSource =
    | 'credential'
    | 'user-delegated'
    | 'company-integration'
    | 'default-credential'
    | 'environment';

/**
 * Kind of underlying GitHub authentication mechanism.
 */
export type GitHubAuthKind = 'github-app' | 'pat' | 'oauth-3lo';

/**
 * Resolved, ready-to-use GitHub authentication & policy context for a single operation.
 */
export interface GitHubResolvedAuth {
    /** Bearer token to send in the `Authorization: Bearer <token>` header (e.g., `ghs_...` or `ghp_...`). */
    Token: string;
    /** Where the credential was resolved from. */
    Source: GitHubAuthSource;
    /** Underlying auth mechanism. */
    AuthKind: GitHubAuthKind;
    /** MJ Credential ID when backed by `MJ: Credentials`. */
    CredentialID?: string;
    /** Default GitHub organization or user login if configured on the credential. */
    DefaultOwner?: string;
    /** Optional list of allowed `owner/repo` or `owner/*` patterns. Empty/undefined = unrestricted. */
    AllowedRepositories?: string[];
    /**
     * Whether this credential is permitted to merge Pull Requests.
     * Defaults to `false` for GitHub App and PAT credentials to enforce the
     * `app-token-never-merges` review separation boundary.
     */
    AllowMerge: boolean;
    /** Default PR creation mode (`'draft'` by default). */
    DefaultPRMode: 'draft' | 'ready';
    /** GitHub REST API base URL (defaults to `'https://api.github.com'`). */
    ApiBaseUrl: string;
}

/**
 * Parsed GitHub repository coordinate.
 */
export interface GitHubRepoCoordinate {
    Owner: string;
    Repo: string;
    Subpath?: string;
}

/**
 * Permissions requested when minting a short-lived GitHub App installation token.
 */
export interface GitHubInstallationPermissions {
    contents?: 'read' | 'write';
    pull_requests?: 'read' | 'write';
    issues?: 'read' | 'write';
    actions?: 'read' | 'write';
    Checks?: 'read' | 'write';
    metadata?: 'read';
    [scope: string]: 'read' | 'write' | undefined;
}

/**
 * A single file addition, modification, or deletion in an atomic Git Data API commit.
 */
export interface GitHubFileChange {
    /** Repository-relative file path (forward slashes, no leading slash). */
     path: string;
    /** File content (required unless `delete: true`). */
    content?: string;
    /** Content encoding: `'utf-8'` (default) or `'base64'`. */
    encoding?: 'utf-8' | 'base64';
    /** Set `true` to delete the file from the tree (`sha: null`). */
    delete?: boolean;
}

/**
 * Parameters for committing one or more files via the GitHub Git Data API.
 */
export interface GitHubCommitFilesParams {
    Owner: string;
    Repo: string;
    /** Target branch to commit to. If `CreateBranch` is true, this new branch is created from `BaseBranch`. */
    Branch: string;
    /** Base branch to branch from when `CreateBranch` is true (defaults to the repository's default branch). */
    BaseBranch?: string;
    /** Whether to create `Branch` from `BaseBranch` before committing (or reset if it does not exist). */
    CreateBranch?: boolean;
    /** Commit message. */
    Message: string;
    /** Array of file additions, updates, or deletions. */
    Files: GitHubFileChange[];
    /** Optional commit author attribution. */
    Author?: { name: string; email: string };
    /**
     * Explicit override to allow committing directly to a protected branch.
     * Defaults to `false` (protected branches `main`, `master`, `next`, `production`, and the repo default branch are rejected).
     */
    AllowProtectedBranch?: boolean;
}

/**
 * Result of an atomic Git Data API multi-file commit.
 */
export interface GitHubCommitFilesResult {
    Branch: string;
    BaseBranch: string;
    CommitSha: string;
    TreeSha: string;
    CommitUrl: string;
    FilesCommitted: number;
    InlineFileCount: number;
    BlobFileCount: number;
}

/**
 * Parameters for creating a Pull Request.
 */
export interface GitHubCreatePRParams {
    Owner: string;
    Repo: string;
    Title: string;
    Body?: string;
    Head: string;
    Base?: string;
    Draft?: boolean;
    Labels?: string[];
    Assignees?: string[];
    Reviewers?: string[];
}

/**
 * Normalized Pull Request summary returned by GitHub actions.
 */
export interface GitHubPullRequestSummary {
    Number: number;
    Title: string;
    State: string;
    Draft: boolean;
    HtmlUrl: string;
    HeadBranch: string;
    HeadSha: string;
    BaseBranch: string;
    Author?: string;
    Mergeable?: boolean | null;
    CreatedAt: string;
    UpdatedAt: string;
}

/**
 * Compound repository context returned by `GitHub - Get Repository Context`.
 */
export interface GitHubRepositoryContext {
    Owner: string;
    Repo: string;
    FullName: string;
    Description: string | null;
    DefaultBranch: string;
    Private: boolean;
    HtmlUrl: string;
    Topics: string[];
    Languages: Record<string, number>;
    TopLevelEntries: Array<{ path: string; type: 'blob' | 'tree'; size?: number }>;
    ReadmePreview: string | null;
    RecentReleases: Array<{ tagName: string; name: string | null; prerelease: boolean; publishedAt: string | null }>;
}

/**
 * Compound Pull Request context returned by `GitHub - Get Pull Request Context`.
 */
export interface GitHubPullRequestContext {
    PullRequest: GitHubPullRequestSummary & {
        Body: string | null;
        Additions: number;
        Deletions: number;
        ChangedFilesCount: number;
    };
    Files: Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
    }>;
    Reviews: Array<{
        id: number;
        user: string;
        state: string;
        body: string | null;
        submittedAt: string | null;
    }>;
    ReviewComments: Array<{
        id: number;
        user: string;
        path: string;
        line: number | null;
        body: string;
        createdAt: string;
    }>;
    CheckRuns: Array<{
        id: number;
        name: string;
        status: string;
        conclusion: string | null;
        htmlUrl: string | null;
    }>;
}
