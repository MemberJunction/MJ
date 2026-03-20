/**
 * GitHubSourceControlProvider — GitHub REST API implementation.
 *
 * Implements all BaseSourceControlProvider methods using native `fetch()`
 * against https://api.github.com. No Octokit dependency.
 */
import { RegisterClass } from '@memberjunction/global';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { BaseSourceControlProvider } from '../../BaseSourceControlProvider.js';
import { SourceControlMetrics } from '../../SourceControlMetrics.js';
import type {
    SourceControlAuthConfig,
    RepoRef,
    SCResult,
    SCRelease,
    SCAsset,
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
} from '../../interfaces.js';

// ─── GitHub API Response Shapes ─────────────────────────────────────

interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
}

interface GitHubRelease {
    tag_name: string;
    name: string | null;
    prerelease: boolean;
    draft: boolean;
    created_at: string;
    body: string | null;
    assets: GitHubReleaseAsset[];
    zipball_url: string;
    tarball_url: string;
}

interface GitHubBranch {
    name: string;
    commit: { sha: string };
    protected: boolean;
}

interface GitHubPullRequest {
    number: number;
    title: string;
    body: string | null;
    state: string;
    head: { ref: string };
    base: { ref: string };
    html_url: string;
    created_at: string;
    merged_at: string | null;
}

interface GitHubFileContent {
    path: string;
    content: string;
    sha: string;
    size: number;
    encoding: string;
}

interface GitHubDirectoryEntry {
    name: string;
    path: string;
    type: string;
    size: number;
    download_url: string | null;
    sha: string;
}

interface GitHubRateLimitResponse {
    resources: {
        core: {
            limit: number;
            remaining: number;
            reset: number;
            used: number;
        };
    };
}

interface GitHubRefResponse {
    ref: string;
    object: { sha: string };
}

interface GitHubErrorResponse {
    message?: string;
    documentation_url?: string;
}

// ─── Provider Implementation ────────────────────────────────────────

@RegisterClass(BaseSourceControlProvider, 'github')
export class GitHubSourceControlProvider extends BaseSourceControlProvider {
    private token: string | undefined;
    private tokenEnvVar: string | undefined;

    private static readonly API_BASE = 'https://api.github.com';

    // ─── Configuration ────────────────────────────────────────────

    get PlatformName(): string {
        return 'github';
    }

    get BaseApiUrl(): string {
        return GitHubSourceControlProvider.API_BASE;
    }

    Configure(auth: SourceControlAuthConfig): void {
        this.token = auth.Token;
        this.tokenEnvVar = auth.TokenEnvVar;
    }

    // ─── Releases ─────────────────────────────────────────────────

    async ListReleases(repo: RepoRef, options?: ListReleasesOptions): Promise<SCResult<SCRelease[]>> {
        const perPage = options?.MaxResults ?? 30;
        const url = this.repoUrl(repo, `/releases?per_page=${perPage}`);
        const result = await this.apiRequest<GitHubRelease[]>('GET', url);

        if (!result.Success || !result.Data) {
            return this.forwardError<SCRelease[]>(result);
        }

        const includePreRelease = options?.IncludePreRelease ?? false;
        const filtered = includePreRelease
            ? result.Data
            : result.Data.filter(r => !r.prerelease);

        return {
            Success: true,
            Data: filtered.map(r => this.mapRelease(r)),
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }

    async GetReleaseByTag(repo: RepoRef, tag: string): Promise<SCResult<SCRelease>> {
        const url = this.repoUrl(repo, `/releases/tags/${encodeURIComponent(tag)}`);
        const result = await this.apiRequest<GitHubRelease>('GET', url);
        return this.mapSingleResult(result, r => this.mapRelease(r));
    }

    async GetLatestRelease(repo: RepoRef): Promise<SCResult<SCRelease>> {
        const url = this.repoUrl(repo, '/releases/latest');
        const result = await this.apiRequest<GitHubRelease>('GET', url);
        return this.mapSingleResult(result, r => this.mapRelease(r));
    }

    // ─── Repository Content ───────────────────────────────────────

    async GetFileContent(repo: RepoRef, path: string, ref?: string): Promise<SCResult<SCFileContent>> {
        const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
        const url = this.repoUrl(repo, `/contents/${path}${qs}`);
        const result = await this.apiRequest<GitHubFileContent>('GET', url);
        return this.mapSingleResult(result, c => this.mapFileContent(c));
    }

    async ListDirectory(repo: RepoRef, path: string, ref?: string): Promise<SCResult<SCDirectoryEntry[]>> {
        const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
        const url = this.repoUrl(repo, `/contents/${path}${qs}`);
        const result = await this.apiRequest<GitHubDirectoryEntry[]>('GET', url);

        if (!result.Success || !result.Data) {
            return this.forwardError<SCDirectoryEntry[]>(result);
        }

        return {
            Success: true,
            Data: result.Data.map(e => this.mapDirectoryEntry(e)),
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }

    async DownloadFile(url: string, destPath: string, progress?: DownloadProgressCallback): Promise<SCResult<string>> {
        const startTime = Date.now();
        try {
            const headers = this.buildHeaders();
            const response = await fetch(url, { headers, redirect: 'follow' });
            const durationMs = Date.now() - startTime;

            SourceControlMetrics.Instance.RecordAPICall(
                this.PlatformName, url, 'GET', response.status, durationMs
            );

            if (!response.ok) {
                return {
                    Success: false,
                    ErrorMessage: `Download failed with status ${response.status}`,
                    StatusCode: response.status,
                };
            }

            if (!response.body) {
                return {
                    Success: false,
                    ErrorMessage: 'Response body is null',
                    StatusCode: response.status,
                };
            }

            const totalBytes = this.parseContentLength(response);
            await this.streamToFile(response.body, destPath, totalBytes, progress);

            return { Success: true, Data: destPath };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            SourceControlMetrics.Instance.RecordAPICall(
                this.PlatformName, url, 'GET', 0, durationMs
            );
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // ─── Branches ─────────────────────────────────────────────────

    async ListBranches(repo: RepoRef, options?: ListBranchesOptions): Promise<SCResult<SCBranch[]>> {
        const perPage = options?.MaxResults ?? 30;
        const url = this.repoUrl(repo, `/branches?per_page=${perPage}`);
        const result = await this.apiRequest<GitHubBranch[]>('GET', url);

        if (!result.Success || !result.Data) {
            return this.forwardError<SCBranch[]>(result);
        }

        return {
            Success: true,
            Data: result.Data.map(b => this.mapBranch(b)),
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }

    async GetBranch(repo: RepoRef, branch: string): Promise<SCResult<SCBranch>> {
        const url = this.repoUrl(repo, `/branches/${encodeURIComponent(branch)}`);
        const result = await this.apiRequest<GitHubBranch>('GET', url);
        return this.mapSingleResult(result, b => this.mapBranch(b));
    }

    async CreateBranch(repo: RepoRef, name: string, fromSHA: string): Promise<SCResult<SCBranch>> {
        const url = this.repoUrl(repo, '/git/refs');
        const body = { ref: `refs/heads/${name}`, sha: fromSHA };
        const result = await this.apiRequest<GitHubRefResponse>('POST', url, body);

        if (!result.Success || !result.Data) {
            return this.forwardError<SCBranch>(result);
        }

        return {
            Success: true,
            Data: {
                Name: name,
                SHA: result.Data.object.sha,
                Protected: false,
            },
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }

    // ─── Pull Requests ────────────────────────────────────────────

    async CreatePullRequest(repo: RepoRef, input: CreatePRInput): Promise<SCResult<SCPullRequest>> {
        const url = this.repoUrl(repo, '/pulls');
        const body = {
            title: input.Title,
            body: input.Body,
            head: input.HeadBranch,
            base: input.BaseBranch,
            draft: input.Draft ?? false,
        };
        const result = await this.apiRequest<GitHubPullRequest>('POST', url, body);
        return this.mapSingleResult(result, pr => this.mapPullRequest(pr));
    }

    async GetPullRequest(repo: RepoRef, number: number): Promise<SCResult<SCPullRequest>> {
        const url = this.repoUrl(repo, `/pulls/${number}`);
        const result = await this.apiRequest<GitHubPullRequest>('GET', url);
        return this.mapSingleResult(result, pr => this.mapPullRequest(pr));
    }

    async ListPullRequests(repo: RepoRef, options?: ListPRsOptions): Promise<SCResult<SCPullRequest[]>> {
        const params = new URLSearchParams();
        if (options?.State) {
            params.set('state', options.State);
        }
        if (options?.Head) {
            params.set('head', options.Head);
        }
        const qs = params.toString();
        const url = this.repoUrl(repo, `/pulls${qs ? '?' + qs : ''}`);
        const result = await this.apiRequest<GitHubPullRequest[]>('GET', url);

        if (!result.Success || !result.Data) {
            return this.forwardError<SCPullRequest[]>(result);
        }

        return {
            Success: true,
            Data: result.Data.map(pr => this.mapPullRequest(pr)),
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }

    // ─── Rate Limit ───────────────────────────────────────────────

    async GetRateLimit(): Promise<SCResult<SCRateLimit>> {
        const url = `${GitHubSourceControlProvider.API_BASE}/rate_limit`;
        const result = await this.apiRequest<GitHubRateLimitResponse>('GET', url);

        if (!result.Success || !result.Data) {
            return this.forwardError<SCRateLimit>(result);
        }

        const core = result.Data.resources.core;
        return {
            Success: true,
            Data: {
                Limit: core.limit,
                Remaining: core.remaining,
                ResetAt: new Date(core.reset * 1000),
            },
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }

    // ─── Private Helpers: HTTP ─────────────────────────────────────

    /**
     * Core HTTP request method. Builds headers, makes the fetch call,
     * extracts rate limit info, records metrics, and returns an SCResult.
     */
    private async apiRequest<T>(method: string, url: string, body?: Record<string, unknown>): Promise<SCResult<T>> {
        const startTime = Date.now();
        try {
            const headers = this.buildHeaders();
            const init: RequestInit = { method, headers };

            if (body) {
                init.body = JSON.stringify(body);
            }

            const response = await fetch(url, init);
            const durationMs = Date.now() - startTime;
            const rateLimit = this.extractRateLimit(response.headers);

            SourceControlMetrics.Instance.RecordAPICall(
                this.PlatformName, url, method, response.status, durationMs
            );

            if (!response.ok) {
                const errorBody = await this.parseErrorBody(response);
                return {
                    Success: false,
                    ErrorMessage: errorBody,
                    StatusCode: response.status,
                    RateLimit: rateLimit,
                };
            }

            const data = await response.json() as T;
            return {
                Success: true,
                Data: data,
                StatusCode: response.status,
                RateLimit: rateLimit,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            SourceControlMetrics.Instance.RecordAPICall(
                this.PlatformName, url, method, 0, durationMs
            );
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Resolve the auth token: explicit token > tokenEnvVar > GITHUB_TOKEN. */
    private resolveToken(): string | undefined {
        if (this.token) {
            return this.token;
        }
        if (this.tokenEnvVar) {
            return process.env[this.tokenEnvVar];
        }
        return process.env.GITHUB_TOKEN;
    }

    /** Build request headers including auth and accept. */
    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };

        const token = this.resolveToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    /** Extract rate limit information from GitHub response headers. */
    private extractRateLimit(headers: Headers): SCRateLimit | undefined {
        const limit = headers.get('x-ratelimit-limit');
        const remaining = headers.get('x-ratelimit-remaining');
        const reset = headers.get('x-ratelimit-reset');

        if (limit == null || remaining == null || reset == null) {
            return undefined;
        }

        return {
            Limit: parseInt(limit, 10),
            Remaining: parseInt(remaining, 10),
            ResetAt: new Date(parseInt(reset, 10) * 1000),
        };
    }

    /** Parse an error response body into a human-readable message. */
    private async parseErrorBody(response: Response): Promise<string> {
        try {
            const json = await response.json() as GitHubErrorResponse;
            return json.message ?? `HTTP ${response.status}`;
        } catch {
            return `HTTP ${response.status} ${response.statusText}`;
        }
    }

    // ─── Private Helpers: URL Building ────────────────────────────

    /** Build a full repo-scoped API URL. */
    private repoUrl(repo: RepoRef, path: string): string {
        return `${GitHubSourceControlProvider.API_BASE}/repos/${encodeURIComponent(repo.Owner)}/${encodeURIComponent(repo.Name)}${path}`;
    }

    // ─── Private Helpers: Download Streaming ──────────────────────

    /** Parse Content-Length from response, returns null if unavailable. */
    private parseContentLength(response: Response): number | null {
        const cl = response.headers.get('content-length');
        if (cl == null) {
            return null;
        }
        const parsed = parseInt(cl, 10);
        return isNaN(parsed) ? null : parsed;
    }

    /** Stream a response body to a file, reporting progress along the way. */
    private async streamToFile(
        body: ReadableStream<Uint8Array>,
        destPath: string,
        totalBytes: number | null,
        progress?: DownloadProgressCallback
    ): Promise<void> {
        const writeStream = createWriteStream(destPath);
        const nodeReadable = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);

        let receivedBytes = 0;

        nodeReadable.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (progress) {
                if (totalBytes != null && totalBytes > 0) {
                    progress(Math.round((receivedBytes / totalBytes) * 100));
                } else {
                    progress(null);
                }
            }
        });

        await pipeline(nodeReadable, writeStream);
    }

    // ─── Private Helpers: Mappers ─────────────────────────────────

    /** Map a GitHub release JSON object to SCRelease. */
    private mapRelease(json: GitHubRelease): SCRelease {
        return {
            TagName: json.tag_name,
            Name: json.name ?? json.tag_name,
            PreRelease: json.prerelease,
            Draft: json.draft,
            CreatedAt: json.created_at,
            Body: json.body ?? '',
            Assets: json.assets.map(a => this.mapAsset(a)),
            ZipballUrl: json.zipball_url,
        };
    }

    /** Map a GitHub asset JSON object to SCAsset. */
    private mapAsset(json: GitHubReleaseAsset): SCAsset {
        return {
            Name: json.name,
            DownloadUrl: json.browser_download_url,
            Size: json.size,
        };
    }

    /** Map a GitHub branch JSON object to SCBranch. */
    private mapBranch(json: GitHubBranch): SCBranch {
        return {
            Name: json.name,
            SHA: json.commit.sha,
            Protected: json.protected,
        };
    }

    /** Map a GitHub pull request JSON object to SCPullRequest. */
    private mapPullRequest(json: GitHubPullRequest): SCPullRequest {
        return {
            Number: json.number,
            Title: json.title,
            Body: json.body ?? '',
            State: this.mapPRState(json.state, json.merged_at),
            HeadBranch: json.head.ref,
            BaseBranch: json.base.ref,
            HtmlUrl: json.html_url,
            CreatedAt: json.created_at,
        };
    }

    /** Map GitHub PR state string + merged_at to the SCPullRequest State union. */
    private mapPRState(state: string, mergedAt: string | null): 'open' | 'closed' | 'merged' {
        if (state === 'open') {
            return 'open';
        }
        if (mergedAt != null) {
            return 'merged';
        }
        return 'closed';
    }

    /** Map a GitHub file content JSON object to SCFileContent. */
    private mapFileContent(json: GitHubFileContent): SCFileContent {
        const rawContent = json.content ?? '';
        const decoded = Buffer.from(rawContent, 'base64').toString('utf-8');

        return {
            Path: json.path,
            Content: decoded,
            SHA: json.sha,
            Size: json.size,
        };
    }

    /** Map a GitHub directory entry JSON object to SCDirectoryEntry. */
    private mapDirectoryEntry(json: GitHubDirectoryEntry): SCDirectoryEntry {
        return {
            Name: json.name,
            Path: json.path,
            Type: this.mapEntryType(json.type),
            Size: json.size,
            DownloadUrl: json.download_url,
        };
    }

    /** Map GitHub content type string to the SCDirectoryEntry Type union. */
    private mapEntryType(type: string): 'file' | 'dir' | 'symlink' {
        if (type === 'dir') {
            return 'dir';
        }
        if (type === 'symlink') {
            return 'symlink';
        }
        return 'file';
    }

    // ─── Private Helpers: Result Mapping ──────────────────────────

    /**
     * Forward an error result to a different generic type.
     * Constructs a new SCResult without the Data field, avoiding unsafe casts.
     */
    private forwardError<TOut>(result: SCResult<unknown>): SCResult<TOut> {
        return {
            Success: false,
            ErrorMessage: result.ErrorMessage,
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }

    /** Transform a successful SCResult's Data field via a mapper function. */
    private mapSingleResult<TIn, TOut>(
        result: SCResult<TIn>,
        mapper: (data: TIn) => TOut
    ): SCResult<TOut> {
        if (!result.Success || !result.Data) {
            return this.forwardError<TOut>(result);
        }
        return {
            Success: true,
            Data: mapper(result.Data),
            StatusCode: result.StatusCode,
            RateLimit: result.RateLimit,
        };
    }
}
