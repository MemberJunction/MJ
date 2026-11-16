---
name: github-engineering-workflows
description: >
  First-class MemberJunction GitHub integration for reading repositories, searching code,
  committing multi-file changes atomically via the Git Data API, raising and reviewing Pull Requests,
  triaging Issues, and diagnosing GitHub Actions CI failures across MJ Actions, AgentHarness CLI, and MCP.
category: GitHub
---

# MemberJunction GitHub Engineering Workflows

Use this skill whenever an agent needs to inspect a GitHub repository, search source code, make single- or multi-file code changes, raise or review Pull Requests, triage Issues, or diagnose GitHub Actions CI workflows.

## Choosing the Right Execution Surface

| Scenario | Recommended Surface | Why |
|----------|---------------------|-----|
| Inspecting a repo, reading 1–10 files, searching code, creating a multi-file PR without running a build, reviewing PRs, triaging issues, or reading CI failure logs | **MJ GitHub Actions** (`GitHub - *`) | Zero container startup latency, token-efficient compound responses, and atomic multi-file commits via the GitHub Git Data API. |
| Large refactors (> 15 files), running `npm test` / `tsc` / linters, resolving merge conflicts, or interactive `git rebase` | **AgentHarness Sandbox CLI** (`git` + `gh`) | Pre-authenticated with short-lived `GH_TOKEN` / `GITHUB_TOKEN` and `GIT_AUTHOR_*` env vars inside `DockerSandboxProvider`. |
| Ad-hoc GitHub API exploration (Dependabot alerts, Projects v2, Discussions, Stars) | **Official GitHub MCP Server** (`@memberjunction/ai-mcp-client`) | Exposes the full long-tail GitHub toolset dynamically via `AgentToolAdapter`. |

---

## Curated MJ GitHub Actions Reference

### 1. Repository & Code Discovery
- **`GitHub - Get Repository Context`**: Always call this first on an unfamiliar repository. Returns default branch, languages, topics, top-level file tree, README preview, and recent releases in a single call.
  - *Inputs*: `Repository` (`"owner/repo"` or URL), optional `CredentialID` / `CompanyID`.
- **`GitHub - List Repository Tree`**: Lists files and directories recursively with optional filtering.
  - *Inputs*: `Repository`, optional `Ref`, `PathPrefix`, `Glob` (e.g. `"packages/**/*.ts"`), `MaxDepth`, `Limit`.
- **`GitHub - Read Repository File`**: Reads one (`Path`) or multiple (`Paths`) files at an optional `Ref` and line range (`StartLine`, `EndLine`).
  - *Inputs*: `Repository`, `Path` or `Paths`, optional `Ref`, `StartLine`, `EndLine`.
- **`GitHub - Search Code`**: Searches code across a repository or organization with text match fragments.
  - *Inputs*: `Query`, optional `Repository` / `Owner`, `PerPage`.

### 2. Branching & Atomic Multi-File Commits
- **`GitHub - Commit Files and Create PR`**: Preferred action for delivering code changes from a standard LLM agent. Creates a feature branch from `BaseBranch`, commits additions/modifications/deletions atomically in a single commit using the Git Data API, and opens (or updates) a Pull Request.
  - *Inputs*: `Repository`, `Branch` (e.g. `"agent/fix-issue-42"`), `CommitMessage`, `Files` (`[{ path, content, encoding?, delete? }]`), `PRTitle`, optional `PRBody`, `BaseBranch`, `Draft` (defaults to credential's `defaultPRMode`, typically `true`), `Labels`, `Assignees`, `Reviewers`.
- **`GitHub - Commit Files to Branch`**: Appends an atomic multi-file commit to a feature branch without creating a new PR.
  - *Inputs*: `Repository`, `Branch`, `Message`, `Files`, optional `BaseBranch`, `CreateBranch`.

### 3. Pull Requests & Code Review
- **`GitHub - Get Pull Request Context`**: Compound action that returns PR metadata, changed files + unified diff patches, review states, inline review comments, and CI check-run statuses in one call.
  - *Inputs*: `Repository`, `PullNumber`, optional `IncludePatches` (default `true`).
- **`GitHub - Create Pull Request`**: Opens a PR from an existing `Head` branch into `Base`.
- **`GitHub - Submit Pull Request Review`**: Submits a formal PR review (`Event`: `'COMMENT'`, `'APPROVE'`, or `'REQUEST_CHANGES'`) with optional inline diff comments (`Comments`: `[{ path, line, body, side? }]`).
- **`GitHub - Merge Pull Request`**: Merges a PR (`MergeMethod`: `'squash'`, `'merge'`, or `'rebase'`).
  - *Policy Guardrail*: Blocked by default (`ResultCode: 'MERGE_NOT_ALLOWED'`) when using an autonomous `GitHub App` or `GitHub PAT` credential unless `allowMerge: true` is explicitly configured or `UseUserAuth: true` (3LO human delegation) is used.

### 4. Issues, PR Search & CI Diagnostics
- **`GitHub - Search Issues and PRs`**: Searches issues and PRs using GitHub search qualifiers (e.g. `"is:open is:issue label:bug"`).
- **`GitHub - Create or Update Issue`**: Creates a new issue (`Title`, `Body`, `Labels`, `Assignees`) or updates an existing issue when `IssueNumber` is provided.
- **`GitHub - Add Issue or PR Comment`**: Posts a markdown comment on an issue or PR (`IssueNumber`, `Body`).
- **`GitHub - Get Workflow Run and Logs`**: Inspects the latest (or specified `RunId`) GitHub Actions workflow run, extracts failed jobs/steps and the last `MaxLogCharsPerJob` characters of failure logs, or triggers `'rerun-failed'` / `'dispatch'`.

---

## Security & Governance Rules for Agents

1. **Never commit directly to protected branches**: `main`, `master`, `next`, `production`, and the repository's default branch are blocked by `GitHubPolicyError('PROTECTED_BRANCH')`. Always commit to a descriptive feature branch (`agent/<topic>` or `fix/<issue>`).
2. **Respect `app-token-never-merges`**: Autonomous agent credentials open and update PRs, while humans review and merge them. Do not attempt to bypass `MERGE_NOT_ALLOWED`.
3. **Prefer atomic commits**: Pass all related file edits in a single `Files` array to `GitHub - Commit Files and Create PR` or `GitHub - Commit Files to Branch` so CI runs once on a coherent commit.
