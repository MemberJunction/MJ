/**
 * GitLabSourceControlProvider — GitLab implementation of BaseSourceControlProvider.
 *
 * STUB: Registered in ClassFactory so the 'gitlab' key exists.
 * Methods throw until implemented.
 */
import { RegisterClass } from '@memberjunction/global';
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
} from '../../interfaces.js';
import { BaseSourceControlProvider } from '../../BaseSourceControlProvider.js';

@RegisterClass(BaseSourceControlProvider, 'gitlab')
export class GitLabSourceControlProvider extends BaseSourceControlProvider {
    get PlatformName(): string { return 'gitlab'; }
    get BaseApiUrl(): string { return 'https://gitlab.com/api/v4'; }

    Configure(_auth: SourceControlAuthConfig): void {
        throw new Error('GitLab provider not yet implemented');
    }

    ListReleases(_repo: RepoRef, _options?: ListReleasesOptions): Promise<SCResult<SCRelease[]>> {
        throw new Error('GitLab provider not yet implemented');
    }

    GetReleaseByTag(_repo: RepoRef, _tag: string): Promise<SCResult<SCRelease>> {
        throw new Error('GitLab provider not yet implemented');
    }

    GetLatestRelease(_repo: RepoRef): Promise<SCResult<SCRelease>> {
        throw new Error('GitLab provider not yet implemented');
    }

    GetFileContent(_repo: RepoRef, _path: string, _ref?: string): Promise<SCResult<SCFileContent>> {
        throw new Error('GitLab provider not yet implemented');
    }

    ListDirectory(_repo: RepoRef, _path: string, _ref?: string): Promise<SCResult<SCDirectoryEntry[]>> {
        throw new Error('GitLab provider not yet implemented');
    }

    DownloadFile(_url: string, _destPath: string, _progress?: DownloadProgressCallback): Promise<SCResult<string>> {
        throw new Error('GitLab provider not yet implemented');
    }

    ListBranches(_repo: RepoRef, _options?: ListBranchesOptions): Promise<SCResult<SCBranch[]>> {
        throw new Error('GitLab provider not yet implemented');
    }

    GetBranch(_repo: RepoRef, _branch: string): Promise<SCResult<SCBranch>> {
        throw new Error('GitLab provider not yet implemented');
    }

    CreateBranch(_repo: RepoRef, _name: string, _fromSHA: string): Promise<SCResult<SCBranch>> {
        throw new Error('GitLab provider not yet implemented');
    }

    CreatePullRequest(_repo: RepoRef, _input: CreatePRInput): Promise<SCResult<SCPullRequest>> {
        throw new Error('GitLab provider not yet implemented');
    }

    GetPullRequest(_repo: RepoRef, _number: number): Promise<SCResult<SCPullRequest>> {
        throw new Error('GitLab provider not yet implemented');
    }

    ListPullRequests(_repo: RepoRef, _options?: ListPRsOptions): Promise<SCResult<SCPullRequest[]>> {
        throw new Error('GitLab provider not yet implemented');
    }

    GetRateLimit(): Promise<SCResult<SCRateLimit>> {
        throw new Error('GitLab provider not yet implemented');
    }
}
