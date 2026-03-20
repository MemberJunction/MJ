/**
 * @memberjunction/source-control — Public API
 *
 * Platform-agnostic source control abstraction for MemberJunction.
 * Consumers resolve providers via MJ's ClassFactory:
 *
 *   const sc = MJGlobal.Instance.ClassFactory.CreateInstance<BaseSourceControlProvider>(
 *       BaseSourceControlProvider, 'github'
 *   );
 *   const git = MJGlobal.Instance.ClassFactory.CreateInstance<BaseGitCLIProvider>(
 *       BaseGitCLIProvider, 'local'
 *   );
 */

// ─── Interfaces & Types ─────────────────────────────────────────────
export type {
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
    GitStatus,
    GitLogEntry,
    GitLogOptions,
    GitPushOptions,
    SCMetricsSummary,
    SCAPICallRecord,
    SCGitOperationRecord,
} from './interfaces.js';

// ─── Abstract Base Classes ──────────────────────────────────────────
export { BaseSourceControlProvider } from './BaseSourceControlProvider.js';
export { BaseGitCLIProvider } from './BaseGitCLIProvider.js';
export type { GitExecResult } from './BaseGitCLIProvider.js';

// ─── Metrics ────────────────────────────────────────────────────────
export { SourceControlMetrics } from './SourceControlMetrics.js';

// ─── Platform Providers (side-effect imports register with ClassFactory) ──
export { GitHubSourceControlProvider } from './providers/github/GitHubSourceControlProvider.js';
export { GitLabSourceControlProvider } from './providers/gitlab/GitLabSourceControlProvider.js';

// ─── Git CLI Providers ──────────────────────────────────────────────
export { LocalGitCLIProvider } from './git/LocalGitCLIProvider.js';
