/**
 * @fileoverview Curated, compound MemberJunction Actions for GitHub engineering workflows.
 *
 * Implements the 14 high-signal GitHub Actions designed for LLM agent loops:
 * 1.  `GitHub - Get Repository Context`
 * 2.  `GitHub - Read Repository File`
 * 3.  `GitHub - List Repository Tree`
 * 4.  `GitHub - Search Code`
 * 5.  `GitHub - Commit Files and Create PR`
 * 6.  `GitHub - Commit Files to Branch`
 * 7.  `GitHub - Get Pull Request Context`
 * 8.  `GitHub - Create Pull Request`
 * 9.  `GitHub - Submit Pull Request Review`
 * 10. `GitHub - Merge Pull Request`
 * 11. `GitHub - Search Issues and PRs`
 * 12. `GitHub - Create or Update Issue`
 * 13. `GitHub - Add Issue or PR Comment`
 * 14. `GitHub - Get Workflow Run and Logs`
 *
 * @module @memberjunction/core-actions/github
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { GitHubBaseAction } from './base-github.action';
import type { GitHubFileChange } from './github-types';


// ============================================================================
// 1. GitHub - Get Repository Context
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Get Repository Context')
export class GitHubGetRepositoryContextAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { contents: 'read', metadata: 'read' },
            });
            const context = await client.GetRepositoryContext(coordinate!.Owner, coordinate!.Repo);
            this.addOutputParam(params, 'RepositoryContext', context);
            this.addOutputParam(params, 'DefaultBranch', context.DefaultBranch);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(context, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 2. GitHub - Read Repository File
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Read Repository File')
export class GitHubReadRepositoryFileAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { contents: 'read', metadata: 'read' },
            });

            const singlePath = this.getStringParam(params, 'Path') ?? coordinate?.Subpath;
            const multiplePaths = this.getStringArrayParam(params, 'Paths');
            const targetPaths = multiplePaths && multiplePaths.length > 0
                ? multiplePaths
                : singlePath
                ? [singlePath]
                : [];

            if (targetPaths.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Path' (or 'Paths') is required.`,
                    Params: params.Params,
                };
            }

            const ref = this.getStringParam(params, 'Ref') ?? this.getStringParam(params, 'Branch');
            const startLine = this.getNumericParam(params, 'StartLine');
            const endLine = this.getNumericParam(params, 'EndLine');

            const files = await client.ReadFiles(
                coordinate!.Owner,
                coordinate!.Repo,
                targetPaths,
                ref,
                startLine,
                endLine
            );

            this.addOutputParam(params, 'Files', files);
            if (files.length === 1) {
                this.addOutputParam(params, 'Content', files[0].Content);
                this.addOutputParam(params, 'Sha', files[0].Sha);
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: files.length === 1 ? files[0].Content : JSON.stringify(files, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 3. GitHub - List Repository Tree
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - List Repository Tree')
export class GitHubListRepositoryTreeAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { contents: 'read', metadata: 'read' },
            });

            const ref = this.getStringParam(params, 'Ref') ?? this.getStringParam(params, 'Branch');
            const pathPrefix = this.getStringParam(params, 'PathPrefix') ?? coordinate?.Subpath;
            const globPattern = this.getStringParam(params, 'Glob');
            const maxDepth = this.getNumericParam(params, 'MaxDepth');
            const limit = this.getNumericParam(params, 'Limit', 500) ?? 500;

            const result = await client.ListTree(
                coordinate!.Owner,
                coordinate!.Repo,
                ref,
                pathPrefix,
                globPattern,
                maxDepth,
                limit
            );

            this.addOutputParam(params, 'Tree', result);
            this.addOutputParam(params, 'Entries', result.Entries);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 4. GitHub - Search Code
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Search Code')
export class GitHubSearchCodeAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const query = this.getStringParam(params, 'Query');
            if (!query) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Query' is required.`,
                    Params: params.Params,
                };
            }

            const { client, auth, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: false,
                permissions: { contents: 'read', metadata: 'read' },
            });

            const owner = coordinate?.Owner ?? this.getStringParam(params, 'Owner') ?? auth.DefaultOwner;
            const repo = coordinate?.Repo ?? this.getStringParam(params, 'Repo');
            const perPage = this.getNumericParam(params, 'PerPage', 25) ?? 25;

            const result = await client.SearchCode(query, owner, repo, perPage);
            this.addOutputParam(params, 'SearchResults', result);
            this.addOutputParam(params, 'TotalCount', result.TotalCount);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 5. GitHub - Commit Files and Create PR
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Commit Files and Create PR')
export class GitHubCommitFilesAndCreatePRAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const branch = this.getStringParam(params, 'Branch') ?? this.getStringParam(params, 'HeadBranch');
            const commitMessage = this.getStringParam(params, 'CommitMessage') ?? this.getStringParam(params, 'Message');
            const prTitle = this.getStringParam(params, 'PRTitle') ?? this.getStringParam(params, 'Title') ?? commitMessage;
            const files = this.getObjectParam<GitHubFileChange[]>(params, 'Files');

            if (!branch) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Branch' (or 'HeadBranch') is required.`,
                    Params: params.Params,
                };
            }
            if (!commitMessage) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'CommitMessage' (or 'Message') is required.`,
                    Params: params.Params,
                };
            }
            if (!files || !Array.isArray(files) || files.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Files' must be a non-empty array of { path, content, encoding?, delete? } objects.`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { contents: 'write', pull_requests: 'write', issues: 'write', metadata: 'read' },
            });

            const baseBranch = this.getStringParam(params, 'BaseBranch') ?? this.getStringParam(params, 'Base');
            const prBody = this.getStringParam(params, 'PRBody') ?? this.getStringParam(params, 'Body');
            const draft = this.getBooleanParam(params, 'Draft');
            const labels = this.getStringArrayParam(params, 'Labels');
            const assignees = this.getStringArrayParam(params, 'Assignees');
            const reviewers = this.getStringArrayParam(params, 'Reviewers');

            const result = await client.CommitFilesAndCreatePR({
                Commit: {
                    Owner: coordinate!.Owner,
                    Repo: coordinate!.Repo,
                    Branch: branch,
                    BaseBranch: baseBranch,
                    CreateBranch: true,
                    Message: commitMessage,
                    Files: files,
                },
                PRTitle: prTitle!,
                PRBody: prBody,
                Draft: draft,
                Labels: labels,
                Assignees: assignees,
                Reviewers: reviewers,
            });

            this.addOutputParam(params, 'CommitResult', result.CommitResult);
            this.addOutputParam(params, 'PullRequest', result.PullRequest);
            this.addOutputParam(params, 'PullNumber', result.PullRequest.Number);
            this.addOutputParam(params, 'PullRequestUrl', result.PullRequest.HtmlUrl);
            this.addOutputParam(params, 'CommitSha', result.CommitResult.CommitSha);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 6. GitHub - Commit Files to Branch
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Commit Files to Branch')
export class GitHubCommitFilesToBranchAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const branch = this.getStringParam(params, 'Branch') ?? this.getStringParam(params, 'HeadBranch');
            const message = this.getStringParam(params, 'Message') ?? this.getStringParam(params, 'CommitMessage');
            const files = this.getObjectParam<GitHubFileChange[]>(params, 'Files');

            if (!branch) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Branch' is required.`,
                    Params: params.Params,
                };
            }
            if (!message) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Message' is required.`,
                    Params: params.Params,
                };
            }
            if (!files || !Array.isArray(files) || files.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Files' must be a non-empty array of { path, content, encoding?, delete? } objects.`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { contents: 'write', metadata: 'read' },
            });

            const baseBranch = this.getStringParam(params, 'BaseBranch');
            const createBranch = this.getBooleanParam(params, 'CreateBranch', true);
            const allowProtectedBranch = this.getBooleanParam(params, 'AllowProtectedBranch', false);

            const result = await client.CommitFiles({
                Owner: coordinate!.Owner,
                Repo: coordinate!.Repo,
                Branch: branch,
                BaseBranch: baseBranch,
                CreateBranch: createBranch,
                Message: message,
                Files: files,
                AllowProtectedBranch: allowProtectedBranch,
            });

            this.addOutputParam(params, 'CommitResult', result);
            this.addOutputParam(params, 'CommitSha', result.CommitSha);
            this.addOutputParam(params, 'CommitUrl', result.CommitUrl);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 7. GitHub - Get Pull Request Context
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Get Pull Request Context')
export class GitHubGetPullRequestContextAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const pullNumber = this.getNumericParam(params, 'PullNumber') ?? this.getNumericParam(params, 'PRNumber');
            if (!pullNumber) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'PullNumber' is required.`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { contents: 'read', pull_requests: 'read', Checks: 'read', metadata: 'read' },
            });

            const includePatches = this.getBooleanParam(params, 'IncludePatches', true) ?? true;
            const context = await client.GetPullRequestContext(
                coordinate!.Owner,
                coordinate!.Repo,
                pullNumber,
                includePatches
            );

            this.addOutputParam(params, 'PullRequestContext', context);
            this.addOutputParam(params, 'PullRequest', context.PullRequest);
            this.addOutputParam(params, 'CheckRuns', context.CheckRuns);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(context, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 8. GitHub - Create Pull Request
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Create Pull Request')
export class GitHubCreatePullRequestAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const title = this.getStringParam(params, 'Title');
            const head = this.getStringParam(params, 'Head') ?? this.getStringParam(params, 'Branch');
            if (!title || !head) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameters 'Title' and 'Head' (source branch) are required.`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { pull_requests: 'write', issues: 'write', metadata: 'read' },
            });

            const pr = await client.CreatePullRequest({
                Owner: coordinate!.Owner,
                Repo: coordinate!.Repo,
                Title: title,
                Body: this.getStringParam(params, 'Body'),
                Head: head,
                Base: this.getStringParam(params, 'Base'),
                Draft: this.getBooleanParam(params, 'Draft'),
                Labels: this.getStringArrayParam(params, 'Labels'),
                Assignees: this.getStringArrayParam(params, 'Assignees'),
                Reviewers: this.getStringArrayParam(params, 'Reviewers'),
            });

            this.addOutputParam(params, 'PullRequest', pr);
            this.addOutputParam(params, 'PullNumber', pr.Number);
            this.addOutputParam(params, 'PullRequestUrl', pr.HtmlUrl);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(pr, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 9. GitHub - Submit Pull Request Review
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Submit Pull Request Review')
export class GitHubSubmitPullRequestReviewAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const pullNumber = this.getNumericParam(params, 'PullNumber') ?? this.getNumericParam(params, 'PRNumber');
            const rawEvent = (this.getStringParam(params, 'Event') ?? 'COMMENT').toUpperCase();
            if (!pullNumber) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'PullNumber' is required.`,
                    Params: params.Params,
                };
            }
            if (rawEvent !== 'APPROVE' && rawEvent !== 'REQUEST_CHANGES' && rawEvent !== 'COMMENT') {
                return {
                    Success: false,
                    ResultCode: 'INVALID_PARAMETER',
                    Message: `Parameter 'Event' must be one of 'APPROVE', 'REQUEST_CHANGES', or 'COMMENT'.`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { pull_requests: 'write', metadata: 'read' },
            });

            const comments = this.getObjectParam<Array<{ path: string; line: number; body: string; side?: 'LEFT' | 'RIGHT' }>>(
                params,
                'Comments'
            );

            const review = await client.SubmitPullRequestReview({
                Owner: coordinate!.Owner,
                Repo: coordinate!.Repo,
                PullNumber: pullNumber,
                Event: rawEvent,
                Body: this.getStringParam(params, 'Body'),
                Comments: comments,
            });

            this.addOutputParam(params, 'Review', review);
            this.addOutputParam(params, 'ReviewId', review.ReviewId);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(review, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 10. GitHub - Merge Pull Request
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Merge Pull Request')
export class GitHubMergePullRequestAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const pullNumber = this.getNumericParam(params, 'PullNumber') ?? this.getNumericParam(params, 'PRNumber');
            if (!pullNumber) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'PullNumber' is required.`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
            });

            const rawMethod = (this.getStringParam(params, 'MergeMethod') ?? 'squash').toLowerCase();
            const mergeMethod: 'merge' | 'squash' | 'rebase' =
                rawMethod === 'merge' || rawMethod === 'rebase' ? rawMethod : 'squash';

            const merged = await client.MergePullRequest({
                Owner: coordinate!.Owner,
                Repo: coordinate!.Repo,
                PullNumber: pullNumber,
                MergeMethod: mergeMethod,
                CommitTitle: this.getStringParam(params, 'CommitTitle'),
                CommitMessage: this.getStringParam(params, 'CommitMessage'),
                Sha: this.getStringParam(params, 'Sha'),
            });

            this.addOutputParam(params, 'MergeResult', merged);
            this.addOutputParam(params, 'Merged', merged.Merged);
            this.addOutputParam(params, 'Sha', merged.Sha);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(merged, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 11. GitHub - Search Issues and PRs
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Search Issues and PRs')
export class GitHubSearchIssuesAndPRsAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const query = this.getStringParam(params, 'Query');
            if (!query) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Query' is required.`,
                    Params: params.Params,
                };
            }

            const { client, auth, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: false,
                permissions: { issues: 'read', pull_requests: 'read', metadata: 'read' },
            });

            const owner = coordinate?.Owner ?? this.getStringParam(params, 'Owner') ?? auth.DefaultOwner;
            const repo = coordinate?.Repo ?? this.getStringParam(params, 'Repo');
            const perPage = this.getNumericParam(params, 'PerPage', 25) ?? 25;

            const result = await client.SearchIssuesAndPRs({
                Query: query,
                Owner: owner,
                Repo: repo,
                PerPage: perPage,
            });

            this.addOutputParam(params, 'SearchResults', result);
            this.addOutputParam(params, 'TotalCount', result.TotalCount);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 12. GitHub - Create or Update Issue
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Create or Update Issue')
export class GitHubCreateOrUpdateIssueAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const issueNumber = this.getNumericParam(params, 'IssueNumber');
            const title = this.getStringParam(params, 'Title');
            if (!issueNumber && !title) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameter 'Title' is required when creating a new issue (or pass 'IssueNumber' to update an existing issue).`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { issues: 'write', metadata: 'read' },
            });

            const rawState = this.getStringParam(params, 'State')?.toLowerCase();
            const state: 'open' | 'closed' | undefined =
                rawState === 'open' || rawState === 'closed' ? rawState : undefined;

            const issue = await client.CreateOrUpdateIssue({
                Owner: coordinate!.Owner,
                Repo: coordinate!.Repo,
                IssueNumber: issueNumber,
                Title: title,
                Body: this.getStringParam(params, 'Body'),
                State: state,
                Labels: this.getStringArrayParam(params, 'Labels'),
                Assignees: this.getStringArrayParam(params, 'Assignees'),
            });

            this.addOutputParam(params, 'Issue', issue);
            this.addOutputParam(params, 'IssueNumber', issue.Number);
            this.addOutputParam(params, 'IssueUrl', issue.HtmlUrl);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(issue, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 13. GitHub - Add Issue or PR Comment
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Add Issue or PR Comment')
export class GitHubAddCommentAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const issueNumber =
                this.getNumericParam(params, 'IssueNumber') ??
                this.getNumericParam(params, 'PullNumber') ??
                this.getNumericParam(params, 'Number');
            const body = this.getStringParam(params, 'Body') ?? this.getStringParam(params, 'Comment');

            if (!issueNumber || !body) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: `Parameters 'IssueNumber' (or 'PullNumber') and 'Body' are required.`,
                    Params: params.Params,
                };
            }

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { issues: 'write', pull_requests: 'write', metadata: 'read' },
            });

            const comment = await client.AddComment({
                Owner: coordinate!.Owner,
                Repo: coordinate!.Repo,
                IssueNumber: issueNumber,
                Body: body,
            });

            this.addOutputParam(params, 'Comment', comment);
            this.addOutputParam(params, 'CommentId', comment.CommentId);
            this.addOutputParam(params, 'CommentUrl', comment.HtmlUrl);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(comment, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}

// ============================================================================
// 14. GitHub - Get Workflow Run and Logs
// ============================================================================

@RegisterClass(BaseAction, 'GitHub - Get Workflow Run and Logs')
export class GitHubGetWorkflowRunAndLogsAction extends GitHubBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const rawAction = (this.getStringParam(params, 'Action') ?? 'inspect').toLowerCase();
            const mode: 'inspect' | 'rerun-failed' | 'dispatch' =
                rawAction === 'rerun-failed' || rawAction === 'dispatch' ? rawAction : 'inspect';

            const { client, coordinate } = await this.resolveClientAndRepo(params, {
                requireRepo: true,
                permissions: { actions: mode === 'inspect' ? 'read' : 'write', metadata: 'read' },
            });

            const result = await client.GetWorkflowRunAndLogs({
                Owner: coordinate!.Owner,
                Repo: coordinate!.Repo,
                Action: mode,
                RunId: this.getNumericParam(params, 'RunId'),
                Branch: this.getStringParam(params, 'Branch'),
                WorkflowIdOrFileName: this.getStringParam(params, 'WorkflowIdOrFileName'),
                DispatchInputs: this.getObjectParam<Record<string, string>>(params, 'DispatchInputs'),
                IncludeFailedJobLogs: this.getBooleanParam(params, 'IncludeFailedJobLogs', true),
                MaxLogCharsPerJob: this.getNumericParam(params, 'MaxLogCharsPerJob', 4000),
            });

            this.addOutputParam(params, 'WorkflowDiagnostics', result);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result, null, 2),
                Params: params.Params,
            };
        } catch (error) {
            return this.handleGitHubError(error, params);
        }
    }
}
