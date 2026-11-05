/**
 * @fileoverview Zero-dependency GitHub REST + Git Data API client with policy guardrails.
 *
 * Implements:
 * - Exponential backoff retry on transient network errors (ECONNRESET/ETIMEDOUT/502/503/504)
 *   and GitHub rate limits (429 / secondary rate limit with Retry-After)
 * - Repository allowlist enforcement (`IsRepositoryAllowed`)
 * - Protected branch guardrails (`main`, `master`, `next`, `production`, and repo default branch)
 * - App-token-never-merges policy (`auth.AllowMerge === true` required for `MergePullRequest`)
 * - Atomic multi-file Git Data API commits (`CommitFiles` & `CommitFilesAndCreatePR`)
 * - Compound context endpoints (`GetRepositoryContext`, `GetPullRequestContext`)
 *
 * @module @memberjunction/core-actions/github
 */

import { IsRepositoryAllowed } from './github-app-auth';
import type {
    GitHubCommitFilesParams,
    GitHubCommitFilesResult,
    GitHubCreatePRParams,
    GitHubPullRequestContext,
    GitHubPullRequestSummary,
    GitHubRepositoryContext,
    GitHubResolvedAuth,
} from './github-types';


/** Default branch names treated as protected unless `AllowProtectedBranch: true` is passed. */
export const DEFAULT_PROTECTED_BRANCHES: ReadonlySet<string> = new Set([
    'main',
    'master',
    'next',
    'production',
]);

/** Maximum file size (in bytes) sent inline in `git/trees` before falling back to `git/blobs`. */
const MAX_INLINE_TREE_FILE_BYTES = 1024 * 1024; // 1 MiB

// ============================================================================
// Typed Error Hierarchy
// ============================================================================

export class GitHubRequestError extends Error {
    public readonly StatusCode: number;
    public readonly Endpoint: string;
    public readonly ResponseBody?: string;

    constructor(message: string, statusCode: number, endpoint: string, responseBody?: string) {
        super(message);
        this.name = 'GitHubRequestError';
        this.StatusCode = statusCode;
        this.Endpoint = endpoint;
        this.ResponseBody = responseBody;
    }
}

export class GitHubAuthError extends GitHubRequestError {
    constructor(message: string, statusCode: number, endpoint: string, responseBody?: string) {
        super(message, statusCode, endpoint, responseBody);
        this.name = 'GitHubAuthError';
    }
}

export class GitHubNotFoundError extends GitHubRequestError {
    constructor(message: string, endpoint: string, responseBody?: string) {
        super(message, 404, endpoint, responseBody);
        this.name = 'GitHubNotFoundError';
    }
}

export class GitHubRateLimitError extends GitHubRequestError {
    public readonly RetryAfterSeconds?: number;

    constructor(message: string, statusCode: number, endpoint: string, retryAfterSeconds?: number, responseBody?: string) {
        super(message, statusCode, endpoint, responseBody);
        this.name = 'GitHubRateLimitError';
        this.RetryAfterSeconds = retryAfterSeconds;
    }
}

export class GitHubPolicyError extends Error {
    public readonly PolicyCode: 'REPO_NOT_ALLOWED' | 'PROTECTED_BRANCH' | 'MERGE_NOT_ALLOWED';

    constructor(policyCode: 'REPO_NOT_ALLOWED' | 'PROTECTED_BRANCH' | 'MERGE_NOT_ALLOWED', message: string) {
        super(message);
        this.name = 'GitHubPolicyError';
        this.PolicyCode = policyCode;
    }
}

// ============================================================================
// Client Options & Internal Response Types
// ============================================================================

export interface GitHubRestClientOptions {
    /** Custom `fetch` implementation for unit testing. */
    FetchImpl?: typeof fetch;
    /** Maximum retry attempts on transient network / 5xx / 429 errors (default: 3). */
    MaxRetries?: number;
    /** Base backoff delay in ms for retries (default: 250ms; set to 1ms in tests). */
    BaseRetryDelayMs?: number;
}

export interface GitHubReadFileEntry {
    Path: string;
    Ref: string;
    Sha: string;
    Size: number;
    TotalLines: number;
    StartLine: number;
    EndLine: number;
    Content: string;
    HtmlUrl: string | null;
}

export interface GitHubTreeEntry {
    path: string;
    mode: string;
    type: 'blob' | 'tree' | 'commit';
    sha: string;
    size?: number;
}

export interface GitHubWorkflowDiagnosticsResult {
    Action: 'inspect' | 'rerun-failed' | 'dispatch';
    Dispatched?: boolean;
    RerunTriggered?: boolean;
    Run?: {
        id: number;
        name: string | null;
        workflowId: number;
        headBranch: string | null;
        headSha: string;
        status: string | null;
        conclusion: string | null;
        htmlUrl: string;
        createdAt: string;
        updatedAt: string;
    };
    Jobs?: Array<{
        id: number;
        name: string;
        status: string;
        conclusion: string | null;
        startedAt: string | null;
        completedAt: string | null;
        failedSteps: Array<{ name: string; number: number; conclusion: string | null }>;
        logTail?: string;
    }>;
}

// ============================================================================
// GitHubRestClient Implementation
// ============================================================================

export class GitHubRestClient {
    private readonly auth: GitHubResolvedAuth;
    private readonly fetchImpl: typeof fetch;
    private readonly maxRetries: number;
    private readonly baseRetryDelayMs: number;

    constructor(auth: GitHubResolvedAuth, options: GitHubRestClientOptions = {}) {
        this.auth = auth;
        this.fetchImpl = options.FetchImpl ?? fetch;
        this.maxRetries = options.MaxRetries ?? 3;
        this.baseRetryDelayMs = options.BaseRetryDelayMs ?? 250;
    }

    public get Auth(): GitHubResolvedAuth {
        return this.auth;
    }

    // ------------------------------------------------------------------------
    // Policy Guardrails
    // ------------------------------------------------------------------------

    /**
     * Enforces the credential's `AllowedRepositories` policy before making any repo-scoped call.
     */
    public AssertRepositoryAllowed(owner: string, repo: string): void {
        if (!IsRepositoryAllowed(owner, repo, this.auth.AllowedRepositories)) {
            throw new GitHubPolicyError(
                'REPO_NOT_ALLOWED',
                `Repository '${owner}/${repo}' is not permitted by this credential's AllowedRepositories policy (${(this.auth.AllowedRepositories ?? []).join(', ')}).`
            );
        }
    }

    /**
     * Enforces the protected branch policy (`main`, `master`, `next`, `production`, or the repo's default branch).
     */
    public AssertProtectedBranchAllowed(branch: string, defaultBranch?: string, allowProtectedBranch?: boolean): void {
        if (allowProtectedBranch === true) {
            return;
        }
        const normalized = branch.replace(/^refs\/heads\//, '').trim();
        const isDefault = defaultBranch ? normalized.toLowerCase() === defaultBranch.toLowerCase() : false;
        const isStandardProtected = DEFAULT_PROTECTED_BRANCHES.has(normalized.toLowerCase());
        if (isDefault || isStandardProtected) {
            throw new GitHubPolicyError(
                'PROTECTED_BRANCH',
                `Direct commits to protected branch '${normalized}' are blocked by policy. Create a feature branch and open a Pull Request, or explicitly pass AllowProtectedBranch=true if authorized.`
            );
        }
    }

    /**
     * Enforces the `app-token-never-merges` review separation boundary.
     */
    public AssertMergeAllowed(): void {
        if (!this.auth.AllowMerge) {
            throw new GitHubPolicyError(
                'MERGE_NOT_ALLOWED',
                `Merging Pull Requests is disabled for this credential (AuthKind=${this.auth.AuthKind}, AllowMerge=false). In accordance with the app-token-never-merges policy, agent tokens may open and review PRs, while merging requires a credential with allowMerge=true or a human-delegated token.`
            );
        }
    }

    // ------------------------------------------------------------------------
    // 1. Repository Context & File / Tree / Code Discovery
    // ------------------------------------------------------------------------

    /**
     * Fetches a token-efficient compound overview of a repository in parallel:
     * metadata, languages, top-level tree, README preview, and recent releases.
     */
    public async GetRepositoryContext(owner: string, repo: string): Promise<GitHubRepositoryContext> {
        this.AssertRepositoryAllowed(owner, repo);
        const encOwner = encodeURIComponent(owner);
        const encRepo = encodeURIComponent(repo);

        const repoData = await this.RequestJson<Record<string, unknown>>('GET', `/repos/${encOwner}/${encRepo}`);
        const defaultBranch = String(repoData.default_branch ?? 'main');

        const [languages, treeData, readmeText, releases] = await Promise.all([
            this.RequestJson<Record<string, number>>('GET', `/repos/${encOwner}/${encRepo}/languages`).catch(() => ({})),
            this.RequestJson<{ tree?: Array<{ path: string; type: string; size?: number }> }>(
                'GET',
                `/repos/${encOwner}/${encRepo}/git/trees/${encodeURIComponent(defaultBranch)}`
            ).catch(() => ({ tree: [] })),
            this.FetchReadmePreview(owner, repo, defaultBranch),
            this.RequestJson<Array<Record<string, unknown>>>('GET', `/repos/${encOwner}/${encRepo}/releases?per_page=5`).catch(
                () => []
            ),
        ]);

        const topLevelEntries = (treeData.tree ?? [])
            .filter((item) => item.type === 'blob' || item.type === 'tree')
            .slice(0, 100)
            .map((item) => ({
                path: item.path,
                type: item.type as 'blob' | 'tree',
                ...(item.size !== undefined ? { size: item.size } : {}),
            }));

        return {
            Owner: owner,
            Repo: repo,
            FullName: String(repoData.full_name ?? `${owner}/${repo}`),
            Description: typeof repoData.description === 'string' ? repoData.description : null,
            DefaultBranch: defaultBranch,
            Private: Boolean(repoData.private),
            HtmlUrl: String(repoData.html_url ?? `https://github.com/${owner}/${repo}`),
            Topics: Array.isArray(repoData.topics) ? (repoData.topics as string[]) : [],
            Languages: languages,
            TopLevelEntries: topLevelEntries,
            ReadmePreview: readmeText,
            RecentReleases: releases.slice(0, 5).map((rel) => ({
                tagName: String(rel.tag_name ?? ''),
                name: typeof rel.name === 'string' ? rel.name : null,
                prerelease: Boolean(rel.prerelease),
                publishedAt: typeof rel.published_at === 'string' ? rel.published_at : null,
            })),
        };
    }

    /**
     * Reads one or more files from a repository at an optional ref and optional 1-indexed line slice.
     */
    public async ReadFiles(
        owner: string,
        repo: string,
        paths: string[],
        ref?: string,
        startLine?: number,
        endLine?: number
    ): Promise<GitHubReadFileEntry[]> {
        this.AssertRepositoryAllowed(owner, repo);
        const encOwner = encodeURIComponent(owner);
        const encRepo = encodeURIComponent(repo);

        let effectiveRef = ref?.trim();
        if (!effectiveRef) {
            const repoInfo = await this.RequestJson<{ default_branch?: string }>('GET', `/repos/${encOwner}/${encRepo}`);
            effectiveRef = repoInfo.default_branch ?? 'main';
        }

        const results: GitHubReadFileEntry[] = [];
        for (const rawPath of paths) {
            const cleanPath = rawPath.replace(/^\/+/, '');
            const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
            const query = `?ref=${encodeURIComponent(effectiveRef)}`;
            const fileData = await this.RequestJson<{
                path?: string;
                sha?: string;
                size?: number;
                content?: string;
                encoding?: string;
                html_url?: string;
                type?: string;
            }>('GET', `/repos/${encOwner}/${encRepo}/contents/${encodedPath}${query}`);

            if (fileData.type && fileData.type !== 'file') {
                throw new GitHubRequestError(
                    `Path '${cleanPath}' is a '${fileData.type}', not a file. Use ListTree to inspect directories.`,
                    400,
                    `/repos/${encOwner}/${encRepo}/contents/${encodedPath}`
                );
            }

            const fullText =
                fileData.encoding === 'base64' && typeof fileData.content === 'string'
                    ? Buffer.from(fileData.content.replace(/\s+/g, ''), 'base64').toString('utf8')
                    : String(fileData.content ?? '');

            const lines = fullText.split(/\r?\n/);
            const totalLines = lines.length;
            const sLine = startLine && startLine >= 1 ? Math.min(startLine, totalLines) : 1;
            const eLine = endLine && endLine >= sLine ? Math.min(endLine, totalLines) : totalLines;
            const slicedContent = lines.slice(sLine - 1, eLine).join('\n');

            results.push({
                Path: fileData.path ?? cleanPath,
                Ref: effectiveRef,
                Sha: String(fileData.sha ?? ''),
                Size: Number(fileData.size ?? Buffer.byteLength(fullText, 'utf8')),
                TotalLines: totalLines,
                StartLine: sLine,
                EndLine: eLine,
                Content: slicedContent,
                HtmlUrl: fileData.html_url ?? null,
            });
        }

        return results;
    }

    /**
     * Lists a repository's file tree with optional path prefix, glob filter, and depth limit.
     */
    public async ListTree(
        owner: string,
        repo: string,
        ref?: string,
        pathPrefix?: string,
        globPattern?: string,
        maxDepth?: number,
        limit: number = 500
    ): Promise<{ Ref: string; Truncated: boolean; TotalMatched: number; Entries: GitHubTreeEntry[] }> {
        this.AssertRepositoryAllowed(owner, repo);
        const encOwner = encodeURIComponent(owner);
        const encRepo = encodeURIComponent(repo);

        let effectiveRef = ref?.trim();
        if (!effectiveRef) {
            const repoInfo = await this.RequestJson<{ default_branch?: string }>('GET', `/repos/${encOwner}/${encRepo}`);
            effectiveRef = repoInfo.default_branch ?? 'main';
        }

        const treeResponse = await this.RequestJson<{
            sha: string;
            truncated?: boolean;
            tree?: GitHubTreeEntry[];
        }>('GET', `/repos/${encOwner}/${encRepo}/git/trees/${encodeURIComponent(effectiveRef)}?recursive=1`);

        const cleanPrefix = pathPrefix ? pathPrefix.replace(/^\/+|\/+$/g, '') : '';
        const globRegex = globPattern ? GlobToRegExp(globPattern) : null;

        const matched = (treeResponse.tree ?? []).filter((entry) => {
            if (cleanPrefix && entry.path !== cleanPrefix && !entry.path.startsWith(`${cleanPrefix}/`)) {
                return false;
            }
            if (maxDepth !== undefined && maxDepth > 0) {
                const relativePath = cleanPrefix ? entry.path.slice(cleanPrefix.length).replace(/^\/+/, '') : entry.path;
                const depth = relativePath ? relativePath.split('/').length : 0;
                if (depth > maxDepth) {
                    return false;
                }
            }
            if (globRegex && !globRegex.test(entry.path)) {
                return false;
            }
            return true;
        });

        return {
            Ref: effectiveRef,
            Truncated: Boolean(treeResponse.truncated) || matched.length > limit,
            TotalMatched: matched.length,
            Entries: matched.slice(0, limit),
        };
    }

    /**
     * Searches code across a repository or organization.
     */
    public async SearchCode(
        query: string,
        owner?: string,
        repo?: string,
        perPage: number = 25
    ): Promise<{
        TotalCount: number;
        Items: Array<{
            name: string;
            path: string;
            sha: string;
            htmlUrl: string;
            repository: string;
            textMatches: string[];
        }>;
    }> {
        if (owner && repo) {
            this.AssertRepositoryAllowed(owner, repo);
        }

        let qualifiedQuery = query.trim();
        if (owner && repo && !/\brepo:/i.test(qualifiedQuery)) {
            qualifiedQuery = `${qualifiedQuery} repo:${owner}/${repo}`;
        } else if (owner && !repo && !/\b(org|user):/i.test(qualifiedQuery)) {
            qualifiedQuery = `${qualifiedQuery} org:${owner}`;
        }

        const clampedPerPage = Math.max(1, Math.min(100, perPage));
        const response = await this.RequestJson<{
            total_count?: number;
            items?: Array<{
                name: string;
                path: string;
                sha: string;
                html_url: string;
                repository?: { full_name?: string };
                text_matches?: Array<{ fragment?: string }>;
            }>;
        }>(
            'GET',
            `/search/code?q=${encodeURIComponent(qualifiedQuery)}&per_page=${clampedPerPage}`,
            undefined,
            'application/vnd.github.text-match+json'
        );

        return {
            TotalCount: Number(response.total_count ?? 0),
            Items: (response.items ?? []).map((item) => ({
                name: item.name,
                path: item.path,
                sha: item.sha,
                htmlUrl: item.html_url,
                repository: item.repository?.full_name ?? (owner && repo ? `${owner}/${repo}` : ''),
                textMatches: (item.text_matches ?? [])
                    .map((m) => m.fragment ?? '')
                    .filter((f) => f.length > 0),
            })),
        };
    }

    // ------------------------------------------------------------------------
    // 2. Atomic Multi-File Commits via Git Data API
    // ------------------------------------------------------------------------

    /**
     * Commits one or more file additions, updates, or deletions in a single atomic commit
     * using the GitHub Git Data API (`git/refs` -> `git/commits` -> `git/trees` -> `git/commits` -> `git/refs`).
     */
    public async CommitFiles(params: GitHubCommitFilesParams): Promise<GitHubCommitFilesResult> {
        this.AssertRepositoryAllowed(params.Owner, params.Repo);
        if (!params.Files || params.Files.length === 0) {
            throw new Error('CommitFiles requires at least one file in Files.');
        }

        const encOwner = encodeURIComponent(params.Owner);
        const encRepo = encodeURIComponent(params.Repo);
        const targetBranch = params.Branch.replace(/^refs\/heads\//, '').trim();

        // Fetch repo metadata to know default_branch for protected branch check & BaseBranch fallback
        const repoInfo = await this.RequestJson<{ default_branch?: string }>('GET', `/repos/${encOwner}/${encRepo}`);
        const defaultBranch = repoInfo.default_branch ?? 'main';
        const baseBranch = (params.BaseBranch ?? defaultBranch).replace(/^refs\/heads\//, '').trim();

        // Enforce protected branch policy on the target branch
        this.AssertProtectedBranchAllowed(targetBranch, defaultBranch, params.AllowProtectedBranch);

        // 1. Resolve the parent commit SHA and ensure the target branch ref exists
        let parentCommitSha: string;
        let branchExists = false;

        try {
            const existingRef = await this.RequestJson<{ object: { sha: string } }>(
                'GET',
                `/repos/${encOwner}/${encRepo}/git/ref/heads/${encodeURIComponent(targetBranch)}`
            );
            parentCommitSha = existingRef.object.sha;
            branchExists = true;
        } catch (err) {
            if (err instanceof GitHubNotFoundError && (params.CreateBranch ?? true)) {
                const baseRef = await this.RequestJson<{ object: { sha: string } }>(
                    'GET',
                    `/repos/${encOwner}/${encRepo}/git/ref/heads/${encodeURIComponent(baseBranch)}`
                );
                parentCommitSha = baseRef.object.sha;
                await this.RequestJson('POST', `/repos/${encOwner}/${encRepo}/git/refs`, {
                    ref: `refs/heads/${targetBranch}`,
                    sha: parentCommitSha,
                });
                branchExists = true;
            } else {
                throw err;
            }
        }

        // 2. Fetch the base tree SHA from the parent commit
        const parentCommit = await this.RequestJson<{ tree: { sha: string } }>(
            'GET',
            `/repos/${encOwner}/${encRepo}/git/commits/${parentCommitSha}`
        );
        const baseTreeSha = parentCommit.tree.sha;

        // 3. Build tree entries (inline for UTF-8 files <= 1 MiB, blobs for > 1 MiB or base64, sha: null for delete)
        let inlineFileCount = 0;
        let blobFileCount = 0;
        const treeEntries: Array<{
            path: string;
            mode: '100644';
            type: 'blob';
            sha?: string | null;
            content?: string;
        }> = [];

        for (const file of params.Files) {
            const cleanPath = file.path.replace(/^\/+/, '');
            if (file.delete) {
                treeEntries.push({
                    path: cleanPath,
                    mode: '100644',
                    type: 'blob',
                    sha: null,
                });
                continue;
            }

            const rawContent = file.content ?? '';
            const encoding = file.encoding ?? 'utf-8';
            const byteLength =
                encoding === 'base64'
                    ? Buffer.byteLength(rawContent, 'base64')
                    : Buffer.byteLength(rawContent, 'utf8');

            if (encoding === 'utf-8' && byteLength <= MAX_INLINE_TREE_FILE_BYTES) {
                treeEntries.push({
                    path: cleanPath,
                    mode: '100644',
                    type: 'blob',
                    content: rawContent,
                });
                inlineFileCount++;
            } else {
                const blob = await this.RequestJson<{ sha: string }>(
                    'POST',
                    `/repos/${encOwner}/${encRepo}/git/blobs`,
                    {
                        content: rawContent,
                        encoding,
                    }
                );
                treeEntries.push({
                    path: cleanPath,
                    mode: '100644',
                    type: 'blob',
                    sha: blob.sha,
                });
                blobFileCount++;
            }
        }

        // 4. Create the new Git tree
        const newTree = await this.RequestJson<{ sha: string }>(
            'POST',
            `/repos/${encOwner}/${encRepo}/git/trees`,
            {
                base_tree: baseTreeSha,
                tree: treeEntries,
            }
        );

        // 5. Create the commit object
        const commitBody: Record<string, unknown> = {
            message: params.Message,
            tree: newTree.sha,
            parents: [parentCommitSha],
        };
        if (params.Author) {
            commitBody.author = params.Author;
        }
        const newCommit = await this.RequestJson<{ sha: string; html_url?: string }>(
            'POST',
            `/repos/${encOwner}/${encRepo}/git/commits`,
            commitBody
        );

        // 6. Advance the branch ref to the new commit SHA
        if (branchExists) {
            await this.RequestJson(
                'PATCH',
                `/repos/${encOwner}/${encRepo}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
                {
                    sha: newCommit.sha,
                    force: false,
                }
            );
        }

        return {
            Branch: targetBranch,
            BaseBranch: baseBranch,
            CommitSha: newCommit.sha,
            TreeSha: newTree.sha,
            CommitUrl: newCommit.html_url ?? `https://github.com/${params.Owner}/${params.Repo}/commit/${newCommit.sha}`,
            FilesCommitted: params.Files.length,
            InlineFileCount: inlineFileCount,
            BlobFileCount: blobFileCount,
        };
    }

    /**
     * Compound workflow: creates/updates a feature branch with an atomic multi-file commit
     * and opens (or reuses an existing open) Pull Request in a single operation.
     */
    public async CommitFilesAndCreatePR(params: {
        Commit: GitHubCommitFilesParams;
        PRTitle: string;
        PRBody?: string;
        Draft?: boolean;
        Labels?: string[];
        Assignees?: string[];
        Reviewers?: string[];
    }): Promise<{
        CommitResult: GitHubCommitFilesResult;
        PullRequest: GitHubPullRequestSummary;
        CreatedNewPR: boolean;
    }> {
        const commitResult = await this.CommitFiles({
            ...params.Commit,
            CreateBranch: params.Commit.CreateBranch ?? true,
        });

        // Check if an open PR already exists for this head -> base branch
        const existingPRs = await this.RequestJson<Array<Record<string, unknown>>>(
            'GET',
            `/repos/${encodeURIComponent(params.Commit.Owner)}/${encodeURIComponent(params.Commit.Repo)}/pulls?state=open&head=${encodeURIComponent(`${params.Commit.Owner}:${commitResult.Branch}`)}&base=${encodeURIComponent(commitResult.BaseBranch)}`
        );

        if (existingPRs.length > 0) {
            const pr = MapPullRequestSummary(existingPRs[0]);
            return {
                CommitResult: commitResult,
                PullRequest: pr,
                CreatedNewPR: false,
            };
        }

        const pr = await this.CreatePullRequest({
            Owner: params.Commit.Owner,
            Repo: params.Commit.Repo,
            Title: params.PRTitle,
            Body: params.PRBody,
            Head: commitResult.Branch,
            Base: commitResult.BaseBranch,
            Draft: params.Draft,
            Labels: params.Labels,
            Assignees: params.Assignees,
            Reviewers: params.Reviewers,
        });

        return {
            CommitResult: commitResult,
            PullRequest: pr,
            CreatedNewPR: true,
        };
    }

    // ------------------------------------------------------------------------
    // 3. Pull Requests, Reviews & Merging
    // ------------------------------------------------------------------------

    /**
     * Creates a new Pull Request and optionally applies labels, assignees, and reviewers.
     * Defaults `Draft` to `this.auth.DefaultPRMode === 'draft'` when omitted.
     */
    public async CreatePullRequest(params: GitHubCreatePRParams): Promise<GitHubPullRequestSummary> {
        this.AssertRepositoryAllowed(params.Owner, params.Repo);
        const encOwner = encodeURIComponent(params.Owner);
        const encRepo = encodeURIComponent(params.Repo);

        let baseBranch = params.Base?.trim();
        if (!baseBranch) {
            const repoInfo = await this.RequestJson<{ default_branch?: string }>('GET', `/repos/${encOwner}/${encRepo}`);
            baseBranch = repoInfo.default_branch ?? 'main';
        }

        const isDraft = params.Draft ?? (this.auth.DefaultPRMode === 'draft');

        const created = await this.RequestJson<Record<string, unknown>>(
            'POST',
            `/repos/${encOwner}/${encRepo}/pulls`,
            {
                title: params.Title,
                body: params.Body ?? '',
                head: params.Head.replace(/^refs\/heads\//, ''),
                base: baseBranch.replace(/^refs\/heads\//, ''),
                draft: isDraft,
            }
        );

        const prNumber = Number(created.number);

        // Apply labels & assignees if requested
        if (params.Labels && params.Labels.length > 0) {
            await this.RequestJson('POST', `/repos/${encOwner}/${encRepo}/issues/${prNumber}/labels`, {
                labels: params.Labels,
            }).catch(() => undefined);
        }
        if (params.Assignees && params.Assignees.length > 0) {
            await this.RequestJson('POST', `/repos/${encOwner}/${encRepo}/issues/${prNumber}/assignees`, {
                assignees: params.Assignees,
            }).catch(() => undefined);
        }
        if (params.Reviewers && params.Reviewers.length > 0) {
            await this.RequestJson('POST', `/repos/${encOwner}/${encRepo}/pulls/${prNumber}/requested_reviewers`, {
                reviewers: params.Reviewers,
            }).catch(() => undefined);
        }

        return MapPullRequestSummary(created);
    }

    /**
     * Fetches a complete, compound Pull Request context in parallel:
     * PR metadata, changed files (with optional patches), reviews, inline review comments, and check runs.
     */
    public async GetPullRequestContext(
        owner: string,
        repo: string,
        pullNumber: number,
        includePatches: boolean = true
    ): Promise<GitHubPullRequestContext> {
        this.AssertRepositoryAllowed(owner, repo);
        const encOwner = encodeURIComponent(owner);
        const encRepo = encodeURIComponent(repo);

        const prData = await this.RequestJson<Record<string, unknown>>(
            'GET',
            `/repos/${encOwner}/${encRepo}/pulls/${pullNumber}`
        );
        const summary = MapPullRequestSummary(prData);

        const [filesData, reviewsData, commentsData, checksData] = await Promise.all([
            this.RequestJson<Array<Record<string, unknown>>>(
                'GET',
                `/repos/${encOwner}/${encRepo}/pulls/${pullNumber}/files?per_page=100`
            ).catch(() => []),
            this.RequestJson<Array<Record<string, unknown>>>(
                'GET',
                `/repos/${encOwner}/${encRepo}/pulls/${pullNumber}/reviews?per_page=100`
            ).catch(() => []),
            this.RequestJson<Array<Record<string, unknown>>>(
                'GET',
                `/repos/${encOwner}/${encRepo}/pulls/${pullNumber}/comments?per_page=100`
            ).catch(() => []),
            summary.HeadSha
                ? this.RequestJson<{ check_runs?: Array<Record<string, unknown>> }>(
                      'GET',
                      `/repos/${encOwner}/${encRepo}/commits/${encodeURIComponent(summary.HeadSha)}/check-runs?per_page=100`
                  ).catch(() => ({ check_runs: [] }))
                : Promise.resolve({ check_runs: [] }),
        ]);

        return {
            PullRequest: {
                ...summary,
                Body: typeof prData.body === 'string' ? prData.body : null,
                Additions: Number(prData.additions ?? 0),
                Deletions: Number(prData.deletions ?? 0),
                ChangedFilesCount: Number(prData.changed_files ?? filesData.length),
            },
            Files: filesData.map((f) => ({
                filename: String(f.filename ?? ''),
                status: String(f.status ?? 'modified'),
                additions: Number(f.additions ?? 0),
                deletions: Number(f.deletions ?? 0),
                ...(includePatches && typeof f.patch === 'string' ? { patch: f.patch } : {}),
            })),
            Reviews: reviewsData.map((r) => ({
                id: Number(r.id ?? 0),
                user: String((r.user as { login?: string } | undefined)?.login ?? ''),
                state: String(r.state ?? ''),
                body: typeof r.body === 'string' ? r.body : null,
                submittedAt: typeof r.submitted_at === 'string' ? r.submitted_at : null,
            })),
            ReviewComments: commentsData.map((c) => ({
                id: Number(c.id ?? 0),
                user: String((c.user as { login?: string } | undefined)?.login ?? ''),
                path: String(c.path ?? ''),
                line: typeof c.line === 'number' ? c.line : null,
                body: String(c.body ?? ''),
                createdAt: String(c.created_at ?? ''),
            })),
            CheckRuns: (checksData.check_runs ?? []).map((cr) => ({
                id: Number(cr.id ?? 0),
                name: String(cr.name ?? ''),
                status: String(cr.status ?? ''),
                conclusion: typeof cr.conclusion === 'string' ? cr.conclusion : null,
                htmlUrl: typeof cr.html_url === 'string' ? cr.html_url : null,
            })),
        };
    }

    /**
     * Submits a Pull Request review (`APPROVE`, `REQUEST_CHANGES`, or `COMMENT`) with optional line comments.
     */
    public async SubmitPullRequestReview(params: {
        Owner: string;
        Repo: string;
        PullNumber: number;
        Event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
        Body?: string;
        Comments?: Array<{ path: string; line: number; body: string; side?: 'LEFT' | 'RIGHT' }>;
    }): Promise<{ ReviewId: number; State: string; HtmlUrl: string }> {
        this.AssertRepositoryAllowed(params.Owner, params.Repo);
        const encOwner = encodeURIComponent(params.Owner);
        const encRepo = encodeURIComponent(params.Repo);

        const payload: Record<string, unknown> = {
            event: params.Event,
            body: params.Body ?? '',
        };
        if (params.Comments && params.Comments.length > 0) {
            payload.comments = params.Comments.map((c) => ({
                path: c.path.replace(/^\/+/, ''),
                line: c.line,
                side: c.side ?? 'RIGHT',
                body: c.body,
            }));
        }

        const result = await this.RequestJson<Record<string, unknown>>(
            'POST',
            `/repos/${encOwner}/${encRepo}/pulls/${params.PullNumber}/reviews`,
            payload
        );

        return {
            ReviewId: Number(result.id ?? 0),
            State: String(result.state ?? params.Event),
            HtmlUrl: String(result.html_url ?? ''),
        };
    }

    /**
     * Merges a Pull Request.
     * Enforces `AssertMergeAllowed()` (`auth.AllowMerge === true`) to uphold the `app-token-never-merges` boundary.
     */
    public async MergePullRequest(params: {
        Owner: string;
        Repo: string;
        PullNumber: number;
        MergeMethod?: 'merge' | 'squash' | 'rebase';
        CommitTitle?: string;
        CommitMessage?: string;
        Sha?: string;
    }): Promise<{ Merged: boolean; Sha: string; Message: string }> {
        this.AssertRepositoryAllowed(params.Owner, params.Repo);
        this.AssertMergeAllowed();

        const encOwner = encodeURIComponent(params.Owner);
        const encRepo = encodeURIComponent(params.Repo);
        const body: Record<string, unknown> = {
            merge_method: params.MergeMethod ?? 'squash',
        };
        if (params.CommitTitle) body.commit_title = params.CommitTitle;
        if (params.CommitMessage) body.commit_message = params.CommitMessage;
        if (params.Sha) body.sha = params.Sha;

        const result = await this.RequestJson<{ merged?: boolean; sha?: string; message?: string }>(
            'PUT',
            `/repos/${encOwner}/${encRepo}/pulls/${params.PullNumber}/merge`,
            body
        );

        return {
            Merged: Boolean(result.merged),
            Sha: String(result.sha ?? ''),
            Message: String(result.message ?? ''),
        };
    }

    // ------------------------------------------------------------------------
    // 4. Issues, PR Search & Comments
    // ------------------------------------------------------------------------

    /**
     * Searches GitHub Issues and Pull Requests using GitHub search qualifiers.
     */
    public async SearchIssuesAndPRs(params: {
        Query: string;
        Owner?: string;
        Repo?: string;
        PerPage?: number;
    }): Promise<{
        TotalCount: number;
        Items: Array<{
            number: number;
            title: string;
            state: string;
            isPullRequest: boolean;
            htmlUrl: string;
            author: string;
            labels: string[];
            createdAt: string;
            updatedAt: string;
        }>;
    }> {
        if (params.Owner && params.Repo) {
            this.AssertRepositoryAllowed(params.Owner, params.Repo);
        }

        let q = params.Query.trim();
        if (params.Owner && params.Repo && !/\brepo:/i.test(q)) {
            q = `${q} repo:${params.Owner}/${params.Repo}`;
        } else if (params.Owner && !params.Repo && !/\b(org|user):/i.test(q)) {
            q = `${q} org:${params.Owner}`;
        }

        const perPage = Math.max(1, Math.min(100, params.PerPage ?? 25));
        const res = await this.RequestJson<{
            total_count?: number;
            items?: Array<Record<string, unknown>>;
        }>('GET', `/search/issues?q=${encodeURIComponent(q)}&per_page=${perPage}`);

        return {
            TotalCount: Number(res.total_count ?? 0),
            Items: (res.items ?? []).map((item) => ({
                number: Number(item.number ?? 0),
                title: String(item.title ?? ''),
                state: String(item.state ?? ''),
                isPullRequest: Boolean(item.pull_request),
                htmlUrl: String(item.html_url ?? ''),
                author: String((item.user as { login?: string } | undefined)?.login ?? ''),
                labels: Array.isArray(item.labels)
                    ? item.labels.map((l) => (typeof l === 'string' ? l : String((l as { name?: string }).name ?? '')))
                    : [],
                createdAt: String(item.created_at ?? ''),
                updatedAt: String(item.updated_at ?? ''),
            })),
        };
    }

    /**
     * Creates a new Issue (when `IssueNumber` is omitted) or updates an existing Issue.
     */
    public async CreateOrUpdateIssue(params: {
        Owner: string;
        Repo: string;
        IssueNumber?: number;
        Title?: string;
        Body?: string;
        State?: 'open' | 'closed';
        Labels?: string[];
        Assignees?: string[];
    }): Promise<{
        Number: number;
        Title: string;
        State: string;
        HtmlUrl: string;
    }> {
        this.AssertRepositoryAllowed(params.Owner, params.Repo);
        const encOwner = encodeURIComponent(params.Owner);
        const encRepo = encodeURIComponent(params.Repo);

        const payload: Record<string, unknown> = {};
        if (params.Title !== undefined) payload.title = params.Title;
        if (params.Body !== undefined) payload.body = params.Body;
        if (params.State !== undefined) payload.state = params.State;
        if (params.Labels !== undefined) payload.labels = params.Labels;
        if (params.Assignees !== undefined) payload.assignees = params.Assignees;

        const endpoint = params.IssueNumber
            ? `/repos/${encOwner}/${encRepo}/issues/${params.IssueNumber}`
            : `/repos/${encOwner}/${encRepo}/issues`;
        const method = params.IssueNumber ? 'PATCH' : 'POST';

        const result = await this.RequestJson<Record<string, unknown>>(method, endpoint, payload);

        return {
            Number: Number(result.number ?? 0),
            Title: String(result.title ?? ''),
            State: String(result.state ?? 'open'),
            HtmlUrl: String(result.html_url ?? ''),
        };
    }

    /**
     * Adds a comment to an Issue or Pull Request.
     */
    public async AddComment(params: {
        Owner: string;
        Repo: string;
        IssueNumber: number;
        Body: string;
    }): Promise<{ CommentId: number; HtmlUrl: string; CreatedAt: string }> {
        this.AssertRepositoryAllowed(params.Owner, params.Repo);
        const encOwner = encodeURIComponent(params.Owner);
        const encRepo = encodeURIComponent(params.Repo);

        const result = await this.RequestJson<Record<string, unknown>>(
            'POST',
            `/repos/${encOwner}/${encRepo}/issues/${params.IssueNumber}/comments`,
            { body: params.Body }
        );

        return {
            CommentId: Number(result.id ?? 0),
            HtmlUrl: String(result.html_url ?? ''),
            CreatedAt: String(result.created_at ?? ''),
        };
    }

    // ------------------------------------------------------------------------
    // 5. GitHub Actions Workflow Runs & Failed Job Diagnostics
    // ------------------------------------------------------------------------

    /**
     * Inspects a workflow run (including failed jobs/steps and log tails),
     * re-runs failed jobs, or dispatches a workflow.
     */
    public async GetWorkflowRunAndLogs(params: {
        Owner: string;
        Repo: string;
        Action?: 'inspect' | 'rerun-failed' | 'dispatch';
        RunId?: number;
        Branch?: string;
        WorkflowIdOrFileName?: string;
        DispatchInputs?: Record<string, string>;
        IncludeFailedJobLogs?: boolean;
        MaxLogCharsPerJob?: number;
    }): Promise<GitHubWorkflowDiagnosticsResult> {
        this.AssertRepositoryAllowed(params.Owner, params.Repo);
        const encOwner = encodeURIComponent(params.Owner);
        const encRepo = encodeURIComponent(params.Repo);
        const mode = params.Action ?? 'inspect';

        if (mode === 'dispatch') {
            if (!params.WorkflowIdOrFileName) {
                throw new Error(`WorkflowIdOrFileName is required when Action='dispatch'.`);
            }
            const ref = params.Branch ?? 'main';
            await this.RequestJson(
                'POST',
                `/repos/${encOwner}/${encRepo}/actions/workflows/${encodeURIComponent(params.WorkflowIdOrFileName)}/dispatches`,
                {
                    ref,
                    inputs: params.DispatchInputs ?? {},
                }
            );
            return {
                Action: 'dispatch',
                Dispatched: true,
            };
        }

        // Resolve RunId if not explicitly given (pick latest run on Branch)
        let runId = params.RunId;
        if (!runId) {
            const branchQuery = params.Branch ? `?branch=${encodeURIComponent(params.Branch)}&per_page=1` : '?per_page=1';
            const runsRes = await this.RequestJson<{ workflow_runs?: Array<Record<string, unknown>> }>(
                'GET',
                `/repos/${encOwner}/${encRepo}/actions/runs${branchQuery}`
            );
            const latest = runsRes.workflow_runs?.[0];
            if (!latest) {
                throw new GitHubNotFoundError(
                    `No workflow runs found for ${params.Owner}/${params.Repo}${params.Branch ? ` on branch '${params.Branch}'` : ''}.`,
                    `/repos/${encOwner}/${encRepo}/actions/runs`
                );
            }
            runId = Number(latest.id);
        }

        if (mode === 'rerun-failed') {
            await this.RequestJson(
                'POST',
                `/repos/${encOwner}/${encRepo}/actions/runs/${runId}/rerun-failed-jobs`
            );
        }

        const runData = await this.RequestJson<Record<string, unknown>>(
            'GET',
            `/repos/${encOwner}/${encRepo}/actions/runs/${runId}`
        );

        const jobsRes = await this.RequestJson<{ jobs?: Array<Record<string, unknown>> }>(
            'GET',
            `/repos/${encOwner}/${encRepo}/actions/runs/${runId}/jobs?per_page=50`
        );

        const maxLogChars = params.MaxLogCharsPerJob ?? 4000;
        const includeLogs = params.IncludeFailedJobLogs ?? true;

        const jobs: NonNullable<GitHubWorkflowDiagnosticsResult['Jobs']> = [];
        for (const j of jobsRes.jobs ?? []) {
            const jobId = Number(j.id ?? 0);
            const conclusion = typeof j.conclusion === 'string' ? j.conclusion : null;
            const steps = Array.isArray(j.steps) ? (j.steps as Array<Record<string, unknown>>) : [];
            const failedSteps = steps
                .filter((s) => s.conclusion === 'failure' || s.conclusion === 'timed_out')
                .map((s) => ({
                    name: String(s.name ?? ''),
                    number: Number(s.number ?? 0),
                    conclusion: typeof s.conclusion === 'string' ? s.conclusion : null,
                }));

            let logTail: string | undefined;
            if (includeLogs && (conclusion === 'failure' || failedSteps.length > 0)) {
                logTail = await this.FetchJobLogTail(params.Owner, params.Repo, jobId, maxLogChars);
            }

            jobs.push({
                id: jobId,
                name: String(j.name ?? ''),
                status: String(j.status ?? ''),
                conclusion,
                startedAt: typeof j.started_at === 'string' ? j.started_at : null,
                completedAt: typeof j.completed_at === 'string' ? j.completed_at : null,
                failedSteps,
                ...(logTail ? { logTail } : {}),
            });
        }

        return {
            Action: mode,
            ...(mode === 'rerun-failed' ? { RerunTriggered: true } : {}),
            Run: {
                id: Number(runData.id ?? runId),
                name: typeof runData.name === 'string' ? runData.name : null,
                workflowId: Number(runData.workflow_id ?? 0),
                headBranch: typeof runData.head_branch === 'string' ? runData.head_branch : null,
                headSha: String(runData.head_sha ?? ''),
                status: typeof runData.status === 'string' ? runData.status : null,
                conclusion: typeof runData.conclusion === 'string' ? runData.conclusion : null,
                htmlUrl: String(runData.html_url ?? ''),
                createdAt: String(runData.created_at ?? ''),
                updatedAt: String(runData.updated_at ?? ''),
            },
            Jobs: jobs,
        };
    }

    // ------------------------------------------------------------------------
    // Internal HTTP Transport & Retry Helpers
    // ------------------------------------------------------------------------

    private async FetchReadmePreview(owner: string, repo: string, ref: string): Promise<string | null> {
        try {
            const data = await this.RequestJson<{ content?: string; encoding?: string }>(
                'GET',
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme?ref=${encodeURIComponent(ref)}`
            );
            if (data.encoding === 'base64' && typeof data.content === 'string') {
                const decoded = Buffer.from(data.content.replace(/\s+/g, ''), 'base64').toString('utf8');
                return decoded.length > 2000 ? `${decoded.slice(0, 2000)}\n...(truncated)` : decoded;
            }
            return null;
        } catch {
            return null;
        }
    }

    private async FetchJobLogTail(owner: string, repo: string, jobId: number, maxChars: number): Promise<string | undefined> {
        try {
            const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${jobId}/logs`;
            const response = await this.RequestRaw('GET', endpoint);
            const text = await response.text();
            if (!text) return undefined;
            return text.length > maxChars ? text.slice(-maxChars) : text;
        } catch {
            return undefined;
        }
    }

    public async RequestJson<T = unknown>(
        method: string,
        endpoint: string,
        body?: unknown,
        acceptHeader: string = 'application/vnd.github+json'
    ): Promise<T> {
        const response = await this.RequestRaw(method, endpoint, body, acceptHeader);
        if (response.status === 204) {
            return {} as T;
        }
        const text = await response.text();
        if (!text) {
            return {} as T;
        }
        return JSON.parse(text) as T;
    }

    private async RequestRaw(
        method: string,
        endpoint: string,
        body?: unknown,
        acceptHeader: string = 'application/vnd.github+json'
    ): Promise<Response> {
        const url = endpoint.startsWith('http')
            ? endpoint
            : `${this.auth.ApiBaseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

        let lastError: unknown;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const headers: Record<string, string> = {
                    Accept: acceptHeader,
                    Authorization: `Bearer ${this.auth.Token}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'MemberJunction-GitHub-Integration/1.0',
                };
                if (body !== undefined) {
                    headers['Content-Type'] = 'application/json';
                }

                const response = await this.fetchImpl(url, {
                    method,
                    headers,
                    body: body !== undefined ? JSON.stringify(body) : undefined,
                });

                if (response.ok) {
                    return response;
                }

                const responseText = await response.text();

                // Check for transient 5xx or rate limit 429 / 403 secondary rate limit
                const isRateLimited =
                    response.status === 429 ||
                    (response.status === 403 &&
                        (response.headers.get('x-ratelimit-remaining') === '0' ||
                            /rate limit/i.test(responseText)));
                const isTransientServer =
                    response.status === 502 || response.status === 503 || response.status === 504;

                if ((isRateLimited || isTransientServer) && attempt < this.maxRetries) {
                    const retryAfterHeader = response.headers.get('retry-after');
                    const retryAfterMs = retryAfterHeader
                        ? Number(retryAfterHeader) * 1000
                        : this.baseRetryDelayMs * Math.pow(2, attempt);
                    await Delay(Math.min(retryAfterMs, 5000));
                    continue;
                }

                if (isRateLimited) {
                    const retryAfterSec = response.headers.get('retry-after')
                        ? Number(response.headers.get('retry-after'))
                        : undefined;
                    throw new GitHubRateLimitError(
                        `GitHub API rate limit exceeded (${response.status}) on ${method} ${endpoint}: ${responseText}`,
                        response.status,
                        endpoint,
                        retryAfterSec,
                        responseText
                    );
                }

                if (response.status === 401 || response.status === 403) {
                    throw new GitHubAuthError(
                        `GitHub authentication/authorization error (${response.status}) on ${method} ${endpoint}: ${responseText}`,
                        response.status,
                        endpoint,
                        responseText
                    );
                }

                if (response.status === 404) {
                    throw new GitHubNotFoundError(
                        `GitHub resource not found (404) on ${method} ${endpoint}: ${responseText}`,
                        endpoint,
                        responseText
                    );
                }

                throw new GitHubRequestError(
                    `GitHub API error (${response.status}) on ${method} ${endpoint}: ${responseText}`,
                    response.status,
                    endpoint,
                    responseText
                );
            } catch (err) {
                lastError = err;
                if (err instanceof GitHubRequestError) {
                    throw err;
                }
                const message = err instanceof Error ? err.message : String(err);
                const isTransientNetwork =
                    /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|fetch failed/i.test(message);
                if (isTransientNetwork && attempt < this.maxRetries) {
                    await Delay(this.baseRetryDelayMs * Math.pow(2, attempt));
                    continue;
                }
                throw err;
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
}

// ============================================================================
// Pure Mapping & Glob Helpers
// ============================================================================

function MapPullRequestSummary(raw: Record<string, unknown>): GitHubPullRequestSummary {
    const head = (raw.head ?? {}) as { ref?: string; sha?: string };
    const base = (raw.base ?? {}) as { ref?: string };
    const user = (raw.user ?? {}) as { login?: string };

    return {
        Number: Number(raw.number ?? 0),
        Title: String(raw.title ?? ''),
        State: String(raw.state ?? 'open'),
        Draft: Boolean(raw.draft),
        HtmlUrl: String(raw.html_url ?? ''),
        HeadBranch: String(head.ref ?? ''),
        HeadSha: String(head.sha ?? ''),
        BaseBranch: String(base.ref ?? ''),
        Author: user.login,
        Mergeable: typeof raw.mergeable === 'boolean' ? raw.mergeable : null,
        CreatedAt: String(raw.created_at ?? ''),
        UpdatedAt: String(raw.updated_at ?? ''),
    };
}

function GlobToRegExp(glob: string): RegExp {
    const escaped = glob
        .trim()
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '___DOUBLE_STAR___')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/___DOUBLE_STAR___/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
}

function Delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
